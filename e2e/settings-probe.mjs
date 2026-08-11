#!/usr/bin/env node
// Settings-tab probe: drives the real Obsidian over CDP and verifies the
// declarative (getSettingDefinitions) settings tab renders, binds, and
// re-renders. Obsidian 1.13 opens Settings in its own window, so the probe
// follows the new app target. Run after e2e/setup-vault.sh with Obsidian
// launched as in e2e/run.sh (CDP port 9222).

const PORT = process.env.E2E_CDP_PORT || '9222';
const BASE = `http://127.0.0.1:${PORT}`;
const POLL_TIMEOUT_MS = 60000;
const EVAL_TIMEOUT_MS = 8000;
const EXPECTED_VAULT_NAME = process.env.E2E_VAULT_NAME || '.vault';

const WebSocketCtor = globalThis.WebSocket;
if (!WebSocketCtor) {
  console.log('FAIL probe requires Node with a global WebSocket (>= 22)');
  process.exit(1);
}

let failures = 0;
const pass = name => console.log(`PASS ${name}`);
const fail = (name, detail) => {
  failures += 1;
  console.log(`FAIL ${name}: ${detail}`);
};

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

  async evaluate(expression) {
    const result = await Promise.race([
      this.send('Runtime.evaluate', { expression, returnByValue: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Runtime.evaluate timed out after ${EVAL_TIMEOUT_MS} ms`)), EVAL_TIMEOUT_MS),
      ),
    ]);
    if (result.exceptionDetails) {
      throw new Error(`page exception: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
    }
    return result.result?.value;
  }

  async screenshot(path) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    const fs = await import('node:fs');
    const { dirname } = await import('node:path');
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log(`SHOT ${path}`);
  }

  close() {
    this.ws.close();
  }
}

async function connectTarget(target) {
  const ws = new WebSocketCtor(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WS connect failed')), { once: true });
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
  throw new Error(`no CDP endpoint on port ${PORT}`);
}

// Main app window (app:// URL) when titlePrefix is null, otherwise a window
// whose title starts with the prefix (Obsidian 1.13 opens Settings in its own
// window titled "Settings - <vault>...").
async function findWindow(titlePrefix) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const targets = (await listTargets()).filter(t => t.type === 'page');
    for (const target of targets) {
      if (titlePrefix) {
        if (target.title.startsWith(titlePrefix)) return target;
      } else if (target.url.startsWith('app://')) {
        const session = await connectTarget(target);
        try {
          const name = await session.evaluate(`app?.vault?.getName?.() ?? ''`);
          if (name === EXPECTED_VAULT_NAME) return target;
        } catch {
          // still booting
        } finally {
          session.close();
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`window ${titlePrefix ? `starting with ${titlePrefix}` : 'with app:// URL'} never appeared`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function poll(page, expression, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await page.evaluate(expression);
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}${lastError ? ` (last error: ${lastError.message})` : ''}`);
}

const pluginLoaded = `typeof app !== 'undefined' && !!app.plugins?.plugins?.['igdb-game-search']`;

// Helpers injected into the settings window: all queries are scoped to the
// active tab content (the settings window also hosts built-in tabs).
const CONTENT = `document.querySelector('.vertical-tab-content')`;
const findRow = name => `[...${CONTENT}.querySelectorAll('.setting-item')].find(el => (el.querySelector('.setting-item-name')?.textContent || '').trim() === ${JSON.stringify(name)})`;
const FIND_ROW = `name => [...content.querySelectorAll('.setting-item')].find(el => (el.querySelector('.setting-item-name')?.textContent || '').trim() === name)`;
const rowNames = `[...${CONTENT}.querySelectorAll('.setting-item-name')].map(el => el.textContent.trim())`;

async function main() {
  await waitForCdp();
  const page = await connectTarget(await findWindow(null)); // main app window (app://)
  await poll(page, pluginLoaded, POLL_TIMEOUT_MS, 'plugin instance');

  // Idempotent baseline: a previous interrupted run may have left gating
  // settings on. Reset them and pin the UI language to English before opening
  // Settings so the initial-state checks below are deterministic.
  await page.evaluate(`(() => {
    const p = app.plugins.plugins['igdb-game-search'];
    p.settings.uiLanguage = 'en';
    p.settings.enableTranslation = false;
    p.settings.enableScreenshotSave = false;
    p.settings.useDefaultFrontmatter = true;
    p.settings.folder = '';
    p.saveSettings();
    return true;
  })()`);
  await sleep(300);

  // Open Settings; Obsidian 1.13 opens it in a separate window. The modal
  // caches the rendered definitions, so after resetting the baseline force a
  // rebuild (update()) — otherwise a window left by an interrupted run would
  // keep showing the old language.
  await page.evaluate(`app.setting.open()`);
  await sleep(500);
  await page.evaluate(`(() => {
    const tab = (app.setting.pluginTabs ?? []).find(t => t.id === 'igdb-game-search');
    if (!tab || typeof tab.update !== 'function') return false;
    tab.update();
    return true;
  })()`);
  const settings = await connectTarget(await findWindow('Settings'));

  await poll(
    settings,
    `[...document.querySelectorAll('.vertical-tab-nav-item')].some(el => el.textContent.includes('IGDB Game Search'))`,
    POLL_TIMEOUT_MS,
    'plugin tab in the settings sidebar',
  );
  await settings.evaluate(`(() => {
    const el = [...document.querySelectorAll('.vertical-tab-nav-item')].find(el => el.textContent.includes('IGDB Game Search'));
    el.click();
  })()`);
  await poll(settings, `${CONTENT} && ${CONTENT}.querySelectorAll('.setting-item').length > 15`, POLL_TIMEOUT_MS, 'settings rows to render');
  await sleep(400);
  await settings.screenshot('e2e/.cache/shots/settings-declarative.png');

  // 19 settings rows + 6 group headings.
  const summary = await settings.evaluate(`(() => {
    const content = ${CONTENT};
    const items = [...content.querySelectorAll('.setting-item')];
    const headings = items.filter(el => el.classList.contains('setting-item-heading'));
    const selects = [...content.querySelectorAll('select')].filter(s => !s.classList.contains('is-measuring'));
    const fileNameHint = !!content.querySelector('.game-search-plugin__settings--new_file_name_hint code');
    const fileNameSearch = !!content.querySelector('.game-search-plugin__settings--new_file_name .search-input-container input');
    return {
      rows: items.length - headings.length,
      headings: headings.length,
      toggles: content.querySelectorAll('.checkbox-container').length,
      selects: selects.length,
      passwords: content.querySelectorAll('input[type=password]').length,
      fileNameHint,
      fileNameSearch,
    };
  })()`);
  summary.rows === 19 ? pass(`19 settings rows (got ${summary.rows})`) : fail('row count', JSON.stringify(summary));
  summary.headings === 6 ? pass('6 group headings') : fail('heading count', JSON.stringify(summary));
  summary.toggles === 6 ? pass('6 toggles') : fail('toggle count', JSON.stringify(summary));
  summary.selects === 3 ? pass('3 dropdowns') : fail('dropdown count', JSON.stringify(summary));
  summary.passwords === 2 ? pass('2 password inputs (client secret, DeepL key)') : fail('password count', JSON.stringify(summary));
  summary.fileNameHint ? pass('file-name preview hint rendered') : fail('file-name preview hint missing', '');
  summary.fileNameSearch ? pass('file-name search input rendered') : fail('file-name search input missing', '');

  // Baseline states with default settings: feature-gated settings disabled,
  // the frontmatter key style enabled (default frontmatter is on).
  const state = await settings.evaluate(`(() => {
    const content = ${CONTENT};
    const row = ${FIND_ROW};
    const input = rowEl => rowEl?.querySelector('input, select');
    const pw = [...content.querySelectorAll('input[type=password]')];
    return {
      translationTargetDisabled: input(row('Translation target language'))?.disabled,
      deeplKeyDisabled: pw[1]?.disabled,
      keyStyleDisabled: input(row('Frontmatter key style'))?.disabled,
      screenshotFolderDisabled: input(row('Screenshot folder'))?.disabled,
      coverFolderEnabled: input(row('Cover image folder'))?.disabled === false,
      locationIsTextInput: row('New file location')?.querySelector('input[type=text]')?.placeholder === 'Example: games',
      templateIsFilePicker: !!row('Template file')?.querySelector('.combobox-button'),
    };
  })()`);
  state.translationTargetDisabled ? pass('translation target disabled by default') : fail('translation target should start disabled', '');
  state.deeplKeyDisabled ? pass('DeepL key disabled by default') : fail('DeepL key should start disabled', '');
  state.keyStyleDisabled === false ? pass('frontmatter key style enabled by default') : fail('key style should start enabled', '');
  state.screenshotFolderDisabled ? pass('screenshot folder disabled by default') : fail('screenshot folder should start disabled', '');
  state.coverFolderEnabled ? pass('cover image folder enabled by default') : fail('cover folder should start enabled', '');
  state.locationIsTextInput ? pass('new file location renders a folder input') : fail('location input mismatch', '');
  state.templateIsFilePicker ? pass('template file renders the native file picker') : fail('template file picker missing', '');

  // Toggle "Enable translation": the target dropdown and DeepL key must enable.
  await settings.evaluate(`(() => {
    const row = ${findRow('Enable translation')};
    if (!row) return false;
    row.querySelector('.checkbox-container').click();
    return true;
  })()`);
  await sleep(600);
  const afterToggle = await settings.evaluate(`(() => {
    const content = ${CONTENT};
    const row = ${FIND_ROW};
    const pw = [...content.querySelectorAll('input[type=password]')];
    return {
      targetEnabled: row('Translation target language')?.querySelector('select:not(.is-measuring)')?.disabled === false,
      deeplEnabled: pw[1]?.disabled === false,
    };
  })()`);
  afterToggle.targetEnabled && afterToggle.deeplEnabled
    ? pass('enabling translation enables target + DeepL key')
    : fail('toggle enable did not refresh disabled state', JSON.stringify(afterToggle));

  // Trim on folder input: set raw value with spaces, expect trimmed persistence.
  await settings.evaluate(`(() => {
    const input = ${findRow('New file location')}.querySelector('input');
    input.value = '  trimmed folder  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(500);
  const trimmed = await page.evaluate(`app.plugins.plugins['igdb-game-search'].settings.folder`);
  trimmed === 'trimmed folder' ? pass(`folder value trimmed on save ("${trimmed}")`) : fail('folder trim/persist', JSON.stringify(trimmed));

  // uiLanguage switch must re-render the whole tab in the new language.
  await settings.evaluate(`(() => {
    const langSelect = ${findRow('UI language')}.querySelector('select:not(.is-measuring)');
    langSelect.value = 'ja';
    langSelect.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(700);
  const ja = await settings.evaluate(`(() => {
    const texts = ${rowNames};
    return { hasJapanese: /[\u3040-\u30ff\u4e00-\u9fff]/.test(texts.join('\\n')) };
  })()`);
  const jaPersisted = await page.evaluate(`app.plugins.plugins['igdb-game-search'].settings.uiLanguage`);
  jaPersisted === 'ja' && ja.hasJapanese
    ? pass('UI language switch persisted and re-rendered in Japanese')
    : fail('UI language re-render', JSON.stringify({ jaPersisted, ...ja }));
  await settings.screenshot('e2e/.cache/shots/settings-ja.png');

  // Switch back to English and restore the default feature state so the
  // standard driver smoke test can run after this probe.
  await settings.evaluate(`(() => {
    const langSelect = [...${CONTENT}.querySelectorAll('select')].find(s => {
      const values = [...s.options].map(o => o.value);
      return values.length === 4 && ['auto', 'en', 'ja', 'ko'].every(v => values.includes(v));
    });
    langSelect.value = 'en';
    langSelect.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(500);
  await page.evaluate(`(() => {
    const p = app.plugins.plugins['igdb-game-search'];
    p.settings.enableTranslation = false;
    p.settings.folder = '';
    p.saveSettings();
    return true;
  })()`);
  await sleep(300);

  settings.close();
  page.close();
  console.log(failures === 0 ? 'ALL SETTINGS PROBE CHECKS PASSED' : `${failures} PROBE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(`PROBE ERROR: ${err.message}`);
  process.exit(1);
});
