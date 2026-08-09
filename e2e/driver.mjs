#!/usr/bin/env node
// Headless E2E smoke driver for the IGDB Game Search plugin, talking to
// Obsidian over the Chrome DevTools Protocol (CDP). No dependencies: node
// built-ins only (fetch + WebSocket).
//
// Usage: node e2e/driver.mjs   (Obsidian must already be running with
// --remote-debugging-port=${E2E_CDP_PORT:-9222})

const PORT = process.env.E2E_CDP_PORT || '9222';
const POLL_TIMEOUT_MS = Number(process.env.E2E_CDP_TIMEOUT || 60000);
const EVAL_TIMEOUT_MS = 8000; // never await a page promise that can hang
const EXPECTED_VAULT_NAME = process.env.E2E_VAULT_NAME || '.vault';
const SHOTS = process.env.E2E_SHOTS === '1';
const BASE = `http://127.0.0.1:${PORT}`;

const WebSocketCtor = globalThis.WebSocket;
if (!WebSocketCtor) {
  console.error('FAIL driver requires Node with a global WebSocket (>= 22, or 20/21 with --experimental-websocket)');
  process.exit(1);
}

let failures = 0;
const pass = name => console.log(`PASS ${name}`);
const fail = (name, detail) => {
  failures += 1;
  console.log(`FAIL ${name}: ${detail}`);
};

// ---------------------------------------------------------------- CDP layer

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Evaluate JS in the page. awaitPromise is only safe combined with a race:
  // a promise that never settles would otherwise hang the response forever.
  async evaluate(expression, { awaitPromise = false } = {}) {
    const result = await Promise.race([
      this.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Runtime.evaluate timed out after ${EVAL_TIMEOUT_MS} ms`)), EVAL_TIMEOUT_MS),
      ),
    ]);
    if (result.exceptionDetails) {
      const exc = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'unknown error';
      throw new Error(`page exception: ${exc}`);
    }
    return result.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function connectTarget(target) {
  const ws = new WebSocketCtor(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`WS connect failed: ${target.webSocketDebuggerUrl}`)), {
      once: true,
    });
  });
  return new CdpSession(ws);
}

async function listTargets() {
  const res = await fetch(`${BASE}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list -> HTTP ${res.status}`);
  return res.json();
}

async function waitForCdp() {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/json/version`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `Obsidian is not running (no CDP endpoint on port ${PORT}). Start it with --remote-debugging-port=${PORT} (see e2e/run.sh).`,
  );
}

async function findAppTarget() {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let firstApp = null;
  while (Date.now() < deadline) {
    const targets = (await listTargets()).filter(t => t.type === 'page' && t.url.startsWith('app://'));
    if (targets.length) {
      // Obsidian 1.13 is multi-window: every vault with "open": true in
      // obsidian.json gets its own app:// window. Pick the one hosting our
      // test vault; fall back to the first app:// target (test 1 will then
      // report the actual vault name).
      for (const target of targets) {
        const session = await connectTarget(target);
        try {
          const name = await session.evaluate('app.vault.getName()');
          if (name === EXPECTED_VAULT_NAME) return target;
        } catch {
          // window still booting — retry on the next poll
        } finally {
          session.close();
        }
      }
      firstApp ||= targets[0];
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (firstApp) return firstApp;
  throw new Error('app:// page target never appeared (vault may not be registered in obsidian.json)');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Poll an expression until it is truthy or the timeout elapses.
async function poll(page, expression, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await page.evaluate(expression);
      if (value) return value;
    } catch (err) {
      lastError = err; // e.g. execution context destroyed during reload — keep polling
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}${lastError ? ` (last error: ${lastError.message})` : ''}`);
}

// ------------------------------------------------------------ the test suite

async function main() {
  await waitForCdp();
  const appTarget = await findAppTarget();
  const app = await connectTarget(appTarget);
  // Re-bound by test 5 when the app reloads (plugin-activation dialog):
  // tests 1-4 use `app`, everything after test 5 uses `session`.
  let session = app;

  // Test 1: vault name matches the test vault.
  await test('1: vault name', async () => {
    const name = await app.evaluate('app.vault.getName()');
    if (name !== EXPECTED_VAULT_NAME) {
      throw new Error(`vault name is "${name}", expected "${EXPECTED_VAULT_NAME}"`);
    }
  });

  // Test 2: plugin instance present (click the first-run trust dialog if needed).
  await test('2: plugin instance loaded', async () => {
    const pluginLoaded = () =>
      app.evaluate(`!!(app.plugins && app.plugins.plugins && app.plugins.plugins['igdb-game-search'])`);
    if (await pluginLoaded()) return;

    // First-open flow: the vault-trust dialog blocks plugin load until
    // "Trust author and enable plugins" is clicked. Click it if visible.
    const clickTrust = () => app.evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('Trust author and enable plugins'));
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    const trustVisible = () => app.evaluate(`[...document.querySelectorAll('button')]
      .some(b => b.textContent.includes('Trust author and enable plugins'))`);
    if (!(await clickTrust())) {
      // No dialog: a stale "Restricted Mode" decision (enable-plugin-<vault-uuid>
      // === "false", left by an interrupted earlier run) silences the dialog
      // permanently. Clear the decision for THIS vault (matched by its path in
      // obsidian.json) and reload so the first-open flow runs.
      const { readFileSync } = await import('node:fs');
      const cfg = JSON.parse(
        readFileSync(`${process.env.HOME}/.config/obsidian/obsidian.json`, 'utf8'),
      );
      const uuid = Object.entries(cfg.vaults || {}).find(([, v]) => v.path.endsWith('/e2e/.vault'))?.[0];
      const decision = uuid && (await app.evaluate(`localStorage.getItem('enable-plugin-${uuid}')`));
      if (decision === 'false') {
        await app.evaluate(`localStorage.removeItem('enable-plugin-${uuid}')`);
        await app.evaluate('location.reload()');
        await poll(app, trustVisible, POLL_TIMEOUT_MS, 'trust dialog after clearing the stale decision');
        if (!(await clickTrust())) {
          throw new Error('trust dialog appeared but "Trust author and enable plugins" could not be clicked');
        }
      } else {
        throw new Error('plugin not loaded and no trust dialog found to click');
      }
    }
    // Clicking trust reloads the window; wait for the plugin instance.
    await poll(
      app,
      `!!(app.plugins && app.plugins.plugins && app.plugins.plugins['igdb-game-search'])`,
      POLL_TIMEOUT_MS,
      'plugin to load after trusting the vault',
    );
  });

  // Test 3: both commands registered.
  await test('3: both commands registered', async () => {
    const found = await app.evaluate(`(() => {
      const ids = [...Object.values(app.commands.commands)].map(c => c.id);
      const has = suffix => ids.some(id => id === suffix || id.endsWith(':' + suffix));
      return { create: has('open-game-search-modal'), insert: has('open-game-search-modal-to-insert') };
    })()`);
    if (!found.create) throw new Error('open-game-search-modal command missing');
    if (!found.insert) throw new Error('open-game-search-modal-to-insert command missing');
  });

  // Test 4: getRenderedContents mirrors the unit-tested frontmatter contract:
  // quotes backslash-escaped inside double quotes, $ literal preserved,
  // values truncated at the first newline, no HTML entity escaping.
  await test('4: rendered frontmatter contract', async () => {
    const rendered = await app.evaluate(`(async () => {
      const plugin = app.plugins.plugins['igdb-game-search'];
      const game = { title: 'Driver Fixture Game', summary: 'He said "hi": $9.99\\ncontinued' };
      return plugin.getRenderedContents(game);
    })()`, { awaitPromise: true });
    const expected = 'summary: "He said \\"hi\\": $9.99"';
    if (!rendered.includes('title: Driver Fixture Game')) {
      throw new Error(`rendered output missing title line: ${JSON.stringify(rendered)}`);
    }
    if (!rendered.includes(expected)) {
      throw new Error(`expected ${JSON.stringify(expected)} in rendered output, got: ${JSON.stringify(rendered)}`);
    }
    if (rendered.includes('&quot;')) {
      throw new Error(`rendered output contains HTML entity &quot;: ${JSON.stringify(rendered)}`);
    }
    if (rendered.includes('continued')) {
      throw new Error(`summary was not truncated at the newline: ${JSON.stringify(rendered)}`);
    }
  });

  // Test 5: modal error path — searching with no credentials rejects with a
  // ConfigurationError mentioning Twitch.
  await test('5: modal rejects with ConfigurationError when credentials are missing', async () => {
    // Defensive: a previous happy-path run (test 6) may have persisted real
    // credentials into the vault's data.json via saveSettings(). Clear them
    // through the real settings path so this test always sees the no-creds state.
    await app.evaluate(`(() => {
      const p = app.plugins.plugins['igdb-game-search'];
      p.settings.twitchClientId = '';
      p.settings.twitchClientSecret = '';
      return p.saveSettings();
    })()`);
    // Phase A — plugin-activation reload dialog. If the plugin is not yet
    // enabled and a "Turn on and reload" dialog is up, click its "Turn on"
    // button first. The dialog renders as a .modal-container in whichever
    // window owns that DOM (sometimes an about:blank window), so probe every
    // page target. Clicking it reloads the whole app and kills our CDP
    // session: re-establish the session and wait for the plugin to load.
    const pluginEnabledExpr = `!!(app.plugins && app.plugins.plugins && app.plugins.plugins['igdb-game-search'])`;
    let target = appTarget;
    session = app;
    const clickTurnOnReload = async () => {
      const targets = (await listTargets()).filter(t => t.type === 'page');
      for (const t of targets) {
        let s;
        try {
          s = t.webSocketDebuggerUrl === target.webSocketDebuggerUrl ? session : await connectTarget(t);
        } catch {
          continue; // window mid-reload — try the next target
        }
        try {
          const clicked = await s.evaluate(`(() => {
            const containers = [...document.querySelectorAll('.modal-container')];
            const dialog = containers.find(c => c.innerText.includes('Turn on and reload'));
            if (!dialog) return false;
            const btn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Turn on'));
            if (!btn) return false;
            btn.click();
            return true;
          })()`);
          if (clicked) return true;
        } catch {
          // window not ready — try the next target
        } finally {
          if (s !== session) s.close();
        }
      }
      return false;
    };

    if (!(await session.evaluate(pluginEnabledExpr)) && (await clickTurnOnReload())) {
      console.log('   (clicked "Turn on and reload"; re-establishing the CDP session)');
      session.close();
      target = await findAppTarget();
      session = await connectTarget(target);
      await poll(session, pluginEnabledExpr, POLL_TIMEOUT_MS, 'plugin to load after the reload');
    }

    // Open the modal and record how the flow promise settles. Never await the
    // promise itself from CDP: it only settles after the Search button click.
    const opened = await session.evaluate(`(() => {
      window.__e2eModal = { state: 'opening' };
      const plugin = app.plugins.plugins['igdb-game-search'];
      plugin.openGameSearchModal('metroid').then(
        () => { window.__e2eModal = { state: 'resolved' }; },
        (err) => { window.__e2eModal = { state: 'rejected', name: err && err.name, message: err && err.message }; },
      );
      return true;
    })()`);
    if (!opened) throw new Error('could not open the search modal');

    // Find the search modal by CONTENT, never by position: other dialogs
    // (e.g. the plugin-activation dialog) also render as .modal-container in
    // some window. Only a modal whose innerText includes the "Search game"
    // heading is the plugin's search modal. Take the LAST matching container
    // (most recently opened) and click its Search button. Probe our app
    // window first, then any other app:// windows and about:blank targets.
    const targets = await listTargets();
    const pageTargets = [
      target,
      ...targets.filter(t => t.type === 'page' && t.url.startsWith('app://') && t.id !== target.id),
      ...targets.filter(t => t.type === 'page' && t.url.startsWith('about:blank')),
    ];
    let clicked = false;
    for (const t of pageTargets) {
      let s;
      try {
        s = t.webSocketDebuggerUrl === target.webSocketDebuggerUrl ? session : await connectTarget(t);
      } catch {
        continue; // window mid-reload — try the next target
      }
      try {
        const probe = await s.evaluate(`(() => {
          const containers = [...document.querySelectorAll('.modal-container')]
            .filter(c => c.innerText.includes('Search game'));
          if (!containers.length) return { found: false };
          const modal = containers[containers.length - 1];
          const btn = [...modal.querySelectorAll('button')].find(b => b.textContent.trim() === 'Search');
          if (!btn) return { found: false, modal: true, heading: modal.querySelector('h2')?.textContent.trim() };
          btn.click();
          return { found: true, text: btn.textContent.trim() };
        })()`);
        if (probe.found) {
          clicked = true;
          console.log(`   (clicked Search in target ${t.url} — button "${probe.text}")`);
          break;
        }
      } finally {
        if (s !== session) s.close();
      }
    }
    if (!clicked) throw new Error('search modal button not found in any window DOM');

    await poll(
      session,
      `(() => { const m = window.__e2eModal; return m && m.state !== 'opening' && m; })()`,
      15000,
      'modal flow promise to settle',
    );
    const result = await session.evaluate(`window.__e2eModal`);
    if (result.state !== 'rejected') {
      throw new Error(`expected the flow promise to reject, state is "${result.state}"`);
    }
    if (result.name !== 'ConfigurationError') {
      throw new Error(`expected ConfigurationError, got ${JSON.stringify(result)}`);
    }
    if (!result.message.includes('Twitch')) {
      throw new Error(`expected the error to mention Twitch, got: ${JSON.stringify(result)}`);
    }
  });

  // Test 6 (optional): happy path with real credentials. Skipped unless
  // TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are set. Covers: credential
  // injection through the real settings path, live IGDB search, cover-image
  // download, vault file creation, and cleanup.
  //
  // NOTE: this test deliberately AVOIDS the suggest modal. Obsidian 1.13.4
  // segfaults (SIGSEGV, signal 11) when the plugin's SuggestModal opens or a
  // suggestion is selected under xvfb/WSL2 (reproduced standalone with a
  // trivial fake game — no network, no note creation involved; native bug,
  // not plugin logic). Selection is instead simulated by taking the first
  // game from the real search result and running the plugin's render + vault
  // creation pipeline on it directly.
  await test('6: full note creation with real IGDB credentials', async () => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.log('SKIP 6: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to run the happy-path test');
      return;
    }

    // Inject credentials + enable cover-image saving through the real settings path.
    await session.evaluate(`(() => {
      const plugin = app.plugins.plugins['igdb-game-search'];
      plugin.settings.twitchClientId = ${JSON.stringify(clientId)};
      plugin.settings.twitchClientSecret = ${JSON.stringify(clientSecret)};
      plugin.settings.enableCoverImageSave = true;
      plugin.settings.openPageOnCompletion = false;
      plugin.settings.coverImagePath = '';
      plugin.settings.folder = '';
      return plugin.saveSettings();
    })()`);

    const before = await session.evaluate(`app.vault.getFiles().map(f => f.path)`);
    const beforeSet = new Set(before);

    // 1. REAL IGDB search through the search modal (no suggest modal). The
    //    promise resolves with the games array when Search is clicked.
    await session.evaluate(`(() => {
      window.__e2eGames = null;
      const plugin = app.plugins.plugins['igdb-game-search'];
      plugin.openGameSearchModal('metroid').then(
        (games) => { window.__e2eGames = games; },
        (err) => { window.__e2eGames = 'ERR: ' + (err && err.name) + ': ' + (err && err.message); },
      );
      return true;
    })()`);

    await poll(
      session,
      `(() => {
        const containers = [...document.querySelectorAll('.modal-container')]
          .filter(c => c.innerText.includes('Search game'));
        return containers.length > 0;
      })()`,
      15000,
      'search modal to open',
    );
    const clickedSearch = await session.evaluate(`(() => {
      const containers = [...document.querySelectorAll('.modal-container')]
        .filter(c => c.innerText.includes('Search game'));
      const btn = [...containers[containers.length - 1].querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Search');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    if (!clickedSearch) {
      throw new Error('search modal button not found');
    }

    const games = await poll(
      session,
      `(() => { const g = window.__e2eGames; return Array.isArray(g) && g.length ? g : (typeof g === 'string' ? g : null); })()`,
      30000,
      'live IGDB search results',
    );
    if (typeof games === 'string') {
      throw new Error(`IGDB search failed: ${games}`);
    }
    const game = games[0];
    if (!game || !game.title) {
      throw new Error(`first result has no title: ${JSON.stringify(game).slice(0, 200)}`);
    }
    console.log(`   (IGDB search OK: "${game.title}" — ${games.length} results)`);

    let added = null;
    try {
      // 2a. Self-healing FIRST: a previous crashed run may have left files
      //     behind under this stem (crashes skip cleanup). Remove them so
      //     vault.create cannot collide later. Must run BEFORE rendering —
      //     rendering re-downloads the cover, and this would delete it.
      await session.evaluate(
        `(async () => {
          const prefix = ${JSON.stringify(game.title.replace(/[\\,#%&{}/*<>$":@.?|]/g, '').replace(/\s+/g, ' ').trim())};
          for (const f of app.vault.getFiles()) {
            if (f.path.startsWith(prefix + '.')) await app.vault.delete(f);
          }
          return true;
        })()`,
        { awaitPromise: true },
      );

      // 2. Render through the real pipeline (triggers the cover download via
      //    requestUrl + writeBinary + resolveUniquePath; sets localCoverImage).
      const rendered = await session.evaluate(
        `app.plugins.plugins['igdb-game-search'].getRenderedContents(${JSON.stringify(game)})`,
        { awaitPromise: true },
      );
      if (!rendered.startsWith('---\n')) {
        throw new Error(`rendered content lacks frontmatter: ${JSON.stringify(rendered.slice(0, 120))}`);
      }

      // 3. Create the note mirroring createNewGameNote for the DEFAULT file
      //    name format ({{title}}): sanitized title + .md. The test asserts
      //    the default format below; if the setting differs, fail loudly.
      const fmt = await session.evaluate(`app.plugins.plugins['igdb-game-search'].settings.fileNameFormat`);
      if (fmt !== '{{title}}') {
        throw new Error(`test 6 assumes the default fileNameFormat {{title}}, got ${JSON.stringify(fmt)}`);
      }
      const fileStem = game.title.replace(/[\\,#%&{}/*<>$":@.?|]/g, '').replace(/\s+/g, ' ').trim();
      if (!fileStem) {
        throw new Error(`sanitized title is empty for "${game.title}"`);
      }
      const notePath = `${fileStem}.md`;

      await session.evaluate(
        `(async () => { await app.vault.create(${JSON.stringify(notePath)}, ${JSON.stringify(rendered)}); return true; })()`,
        { awaitPromise: true },
      );
      added = [notePath];

      // 4. Verify on disk: the note exists with frontmatter; the cover file
      //    referenced by localCoverImage exists in the vault.
      const content = await session.evaluate(
        `app.vault.cachedRead(app.vault.getAbstractFileByPath(${JSON.stringify(notePath)}))`,
        { awaitPromise: true },
      );
      const titleMatch = content.match(/^title: (.+)$/m);
      if (!titleMatch || !titleMatch[1].trim()) {
        throw new Error(`note frontmatter missing a title: ${JSON.stringify(content.slice(0, 200))}`);
      }
      const coverMatch = content.match(/^localCoverImage: (.+)$/m);
      if (!coverMatch) {
        throw new Error(`note frontmatter missing localCoverImage: ${JSON.stringify(content.slice(0, 300))}`);
      }
      const coverPath = coverMatch[1].trim();
      const coverExists = await session.evaluate(
        `!!app.vault.getAbstractFileByPath(${JSON.stringify(coverPath)})`,
      );
      if (!coverExists) {
        throw new Error(`cover file ${coverPath} does not exist in the vault`);
      }
      console.log(`   (created ${notePath} with cover ${coverPath} — title "${titleMatch[1].trim()}")`);

      added = [notePath, coverPath];
    } finally {
      // Cleanup in ALL cases (including failures): delete created files AND
      // restore the pre-test settings (empty creds, cover save off) so tests
      // 5/6 stay order-independent.
      await session.evaluate(
        `(async () => {
          for (const p of ${JSON.stringify(added ?? [])}) {
            const f = app.vault.getAbstractFileByPath(p);
            if (f) await app.vault.delete(f);
          }
          const plugin = app.plugins.plugins['igdb-game-search'];
          plugin.settings.twitchClientId = '';
          plugin.settings.twitchClientSecret = '';
          plugin.settings.enableCoverImageSave = false;
          plugin.settings.coverImagePath = '';
          plugin.settings.folder = '';
          await plugin.saveSettings();
          return true;
        })()`,
        { awaitPromise: true },
      );
    }
    const after = await session.evaluate(`app.vault.getFiles().map(f => f.path)`);
    const leftovers = after.filter(p => !beforeSet.has(p));
    if (leftovers.length) {
      throw new Error(`cleanup left files behind: ${JSON.stringify(leftovers)}`);
    }
  });

  // Optional screenshot for manual inspection.
  if (SHOTS) {
    const fs = await import('node:fs');
    const shotsDir = 'e2e/.cache/shots';
    fs.mkdirSync(shotsDir, { recursive: true });
    await session.send('Page.enable');
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
    const file = `${shotsDir}/e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`Screenshot written: ${file}`);
  }

  session.close();

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\nAll checks passed');
}

async function test(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err.message);
  }
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
