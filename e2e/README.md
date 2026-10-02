# E2E harness — isolated headless and native Obsidian verification

End-to-end smoke test that runs the real plugin inside a real (headless)
Obsidian instance: build → deploy into a throwaway vault → launch under xvfb →
drive the app over the Chrome DevTools Protocol (CDP) and assert the plugin
loads, its commands register, rendering matches the unit-tested frontmatter
contract, and the no-credentials modal path fails with the expected error.

## Prerequisites (Linux)

- `xvfb-run` (X virtual framebuffer), `curl`, `git`, `gh`, `unzip`
- Node.js ≥ 20 with a global `WebSocket` (Node ≥ 22, or 20/21 with
  `--experimental-websocket`)
- pnpm (repo standard)
- ~140 MB free disk for the one-time Obsidian AppImage download
- libfuse2 is **not** required: the harness auto-extracts the AppImage when
  FUSE is absent

## Usage

**Windows (real desktop Obsidian — recommended)**: the most faithful
environment. Drives the REAL suggest-modal selection, which the Linux/xvfb
path cannot (Obsidian 1.13.4 segfaults there). Your Obsidian must be closed
first (single-instance app). A throwaway test vault is created in
`AppData\Local\Temp\igdb-e2e-vault` and removed afterwards; your real vault
is never touched.

```bash
bash e2e/run-windows.sh                 # requires Obsidian closed; Windows user kurok (E2E_WIN_USER to override)
```

**Linux (xvfb)**:

```bash
bash e2e/run.sh            # full suite; exit 0 = all checks passed
E2E_SHOTS=1 bash e2e/run.sh    # smoke screenshot in $TMPDIR/igdb-e2e-shots/
E2E_CDP_PORT=9333 bash e2e/run.sh  # override the CDP port (default 9222)
```

**Happy-path test (test 6)**: needs real IGDB credentials. Provide them as
environment variables; the driver injects them into the plugin settings at
runtime and the test is skipped (exit 0) when they are absent:

```bash
TWITCH_CLIENT_ID=your-id TWITCH_CLIENT_SECRET=your-secret bash e2e/run-windows.sh
```

With credentials, test 6 runs a live end-to-end flow: `createNewGameNote()`
(the real ribbon flow) → search modal (query typed in) → live IGDB search →
**real suggest-modal selection** (Windows) → note + cover image created in the
vault → frontmatter + cover verified on disk → everything deleted again so
re-runs stay idempotent. Credentials never touch the repo; they live in the
shell environment only.

On Linux (xvfb) the suggest modal is bypassed (native SIGSEGV under xvfb,
reproduced standalone with a trivial fake game — Obsidian bug, not plugin
logic): the first real search result is fed straight into the plugin's render
+ creation pipeline instead.

First run downloads the newest published desktop x86_64 Obsidian AppImage (~140 MB) into
`$TMPDIR/igdb-e2e-obsidian/` (override `E2E_OBSIDIAN_CACHE`); later runs reuse the cache.
Mobile-only releases are skipped instead of guessing a desktop version. A second consecutive run must also
pass (idempotent: cache hit, no duplicate vault registrations, no stale-lock
failures).

Run the driver standalone against an already-running instance:

```bash
node e2e/driver.mjs        # expects CDP on 127.0.0.1:9222 (E2E_CDP_PORT)
node e2e/settings-probe.mjs  # 23 real settings checks, including secret picker
node e2e/enrichment-probe.mjs # actual YAML/links/no-key note + real image downloads
node e2e/templater-probe.mjs  # exact README recipe, manual and auto execution
```

## New enrichment and Templater suites

`run.sh` now runs all four drivers in sequence. It installs official Templater
release assets in the **test vault only**, then checks both manual and automatic
Templater execution modes (including modern per-vault security flags). The
recipe is read directly from README, not copied into a separate test fixture.

The Resident Evil Requiem selection is supplied by the public-source fixture
in `e2e/fixtures/`; this is not a live authenticated IGDB search. Images really
download over the network. Positive personal Steam/time estimates remain unit
tests with mocked HTTP; the real Obsidian client verifies clean no-key behavior.
The authenticated smoke test remains explicitly skipped without Twitch credentials.

Native GNOME/Xwayland validation uses the current session's `DISPLAY` and
`XAUTHORITY` (do not guess a stale auth path):

```bash
E2E_DESKTOP=1 E2E_CDP_PORT=9334 bash e2e/run.sh
```

The Linux runner uses a private `--user-data-dir` and process group; it never
uses global `pkill` or modifies the personal Obsidian configuration. Temporary
profiles/logs are deleted on exit. The test vault and evidence remain available.

Overrides: `E2E_VAULT_DIR` (absolute or relative vault path), `E2E_VAULT_NAME`,
`E2E_CDP_PORT`, `E2E_REPORT_DIR` (default `docs/verification/issues-2-4`),
`E2E_SHOT_DIR`, `E2E_OBSIDIAN_CACHE`. `setup-vault.sh` also accepts
`E2E_CONFIG_DIR` and `E2E_SKIP_BUILD=1` for an already-verified production build.
Use these drivers only against the disposable test vault.

Full recorded evidence: [issues #2–#4 report](../docs/verification/issues-2-4/README.md).

## What the original smoke driver verifies

1. The app opens the test vault (`e2e/.vault`, registered only in the run's isolated temporary Obsidian profile).
2. The plugin instance loads (clicking the first-run vault-trust dialog
   when present — handled in the Obsidian UI's own language, en/ja/ko).
3. Both commands are registered (`open-game-search-modal`,
   `open-game-search-modal-to-insert`).
4. `getRenderedContents` matches the unit-tested frontmatter contract:
   quotes backslash-escaped inside double-quoted values, `$` preserved
   literally, values truncated at the first newline, no HTML entities.
5. With no Twitch credentials configured, the search modal's flow promise
   rejects with `ConfigurationError` mentioning Twitch.
6. With `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` set: live happy path —
   real IGDB search, suggestion selection (real suggest-modal on Windows),
   note + cover creation in the vault, verification of the created files,
   then cleanup.

## Troubleshooting

- **Windows run fails with "Obsidian is running"**: close the app (Ctrl+Q)
  and re-run — Obsidian is single-instance and ignores the debugging flag
  when already running.
- **Windows run leaves the app on the real vault**: the vault argument is
  only honored together with the `obsidian.json` registration (the script
  does both); never run the driver against a vault without registering it
  first — the driver targets the vault whose NAME it was told, so an
  unregistered launch may silently open the last-used vault instead.
- **Windows UI language**: the driver matches dialogs/buttons in en/ja/ko
  (the trust dialog and the plugin's own localized strings follow the
  Obsidian UI language).

- **Vault picker shows instead of the vault opening**: the vault is not
  registered in `~/.config/obsidian/obsidian.json`, or a stale SingletonLock
  blocked the launch. Re-run `bash e2e/setup-vault.sh`; delete
  `~/.config/obsidian/SingletonLock|SingletonSocket|SingletonCookie` and
  `~/.config/obsidian/DevToolsActivePort` between runs.
- **Plugin loads but tests still fail with "plugin not loaded and no trust
  dialog found"**: Obsidian changed the trust-dialog wording or flow, or a
  stale "Restricted Mode" decision from an interrupted run is silencing the
  dialog (`localStorage` key `enable-plugin-<vault-uuid>` set to `false`).
  The driver now clears that decision for the test vault and reloads so the
  first-open flow runs; if the wording changed, update the button text match
  in `e2e/driver.mjs` (test 2).
- **Test 5 clicks the wrong modal ("Turn on and reload" plugin-activation
  dialog)**: Obsidian's plugin-activation dialog also renders as a
  `.modal-container`, sometimes in an `about:blank` window, and its button
  would be clicked if the driver just took the first modal it found. The
  driver now scopes modal discovery by content — only a modal containing the
  "Search game" heading (the modal's `t('search.heading')` text, English on a
  default-locale vault) is the plugin's search modal — and clicks the last
  matching container's `Search` button. If the plugin is not yet enabled, a
  "Turn on and reload" dialog is clicked first and the CDP session is
  re-established after the reload. Keep the heading match in lockstep with
  `src/locales/en.ts` if it changes.
- **Modal checks fail on a new Obsidian version**: modals render into the
  active window's DOM (Obsidian 1.13 multi-window), and `app` is only a
  global in the main `app://obsidian.md/index.html` page target. The driver
  probes the app target first, then `about:blank` targets; if Obsidian starts
  rendering modals elsewhere, extend the probe list.
- **CDP `Runtime.evaluate` seems to hang**: an `awaitPromise` evaluation on a
  promise that never settles never responds. The driver always races
  evaluations against an 8 s timeout — keep that pattern in new checks.
- **`pkill` kills your shell**: never `pkill -f` with a bare pattern that
  appears in your own command line. Use bracket patterns like
  `pkill -9 -f '[s]quashfs-root/obsidian'` (see `e2e/run.sh`).
- **Driver says "Obsidian is not running"**: no CDP endpoint on the port;
  check `e2e/.cache/obsidian.log` for the app's stderr.
- **GitHub API rate-limit (429) during the download**: the download script
  exits with an error and never guesses a version. Wait for the rate limit to
  reset, or seed `e2e/.cache/obsidian/` manually.

## Not wired into CI (yet)

The ~140 MB AppImage download and xvfb make CI integration a separate
decision. If added later: gate it behind a scheduled workflow and cache
`e2e/.cache` (GitHub Actions supports arbitrary path caching).

Obsidian version drift: the harness always uses "latest", so future Obsidian
releases may break the driver (DOM changes, new dialogs). Checks are
intentionally high-level (plugin presence, command ids, render output) to
minimize breakage; keep the fixture expectations in test 4 in lockstep with
the unit tests in `src/utils/utils.test.ts` if that contract changes.
