# Plan 023: Repo-ify the E2E harness — headless Obsidian smoke tests in `e2e/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- package.json .gitignore`
> If either file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (the harness was proven manually during the 2026-08-09 E2E session)
- **Category**: dx
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

During the 2026-08-09 E2E session, a working headless-Obsidian smoke test was assembled by hand in /tmp: official Obsidian AppImage (extracted, no FUSE), a throwaway test vault with the plugin deployed, xvfb + `--remote-debugging-port`, and CDP-driven checks (plugin load, commands, real `getRenderedContents` output, modal error path, settings tab). That capability is currently **ephemeral** — the scripts live in /tmp and the hard-won knowledge (the vault-trust dialog, the multi-window modal rendering, the `pkill -f` self-match footgun) exists only in the session transcript. This plan turns it into a reproducible `e2e/` harness so every future change can get a real-runtime smoke test, not just unit tests.

## Current state

- No `e2e/` directory exists. `.gitignore` exists (standard Obsidian plugin ignores: node_modules, main.js? — read it; note whether `main.js` is ignored).
- Proven pieces from the E2E session (all in /tmp, to be recreated properly):
  - Obsidian AppImage download URL pattern: `https://github.com/obsidianmd/obsidian-releases/releases/latest` (asset `Obsidian-<ver>.AppImage`); extract with `--appimage-extract` when libfuse2 is absent.
  - Vault registration: `~/.config/obsidian/obsidian.json` with `{ "vaults": { "<uuid>": { "path": ..., "ts": ..., "open": true } } }` — without it the app shows the vault picker and `app` never becomes available.
  - First-open **"Do you trust the author of this vault?"** dialog blocks plugin load — must click `Trust author and enable plugins` via CDP.
  - Obsidian 1.13 multi-window: modals render into the **active window's** DOM (the Settings window if open); `app` is only a global in the main `app://obsidian.md/index.html` page target.
  - CDP driver pattern: node built-in `WebSocket` + `Runtime.evaluate` with `awaitPromise` (hangs on promises that never settle — always wrap in `Promise.race` timeouts).
  - `pkill -f` with the pattern in your own command line kills the invoking shell — use `[x]` bracket patterns.
- Repo conventions: pnpm scripts, `pnpm lint`/`pnpm test` gates, conventional commits, READMEs in 3 languages (the E2E README is developer-facing — English only is fine, but keep the trilingual convention in mind if it grows).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Harness   | `bash e2e/run.sh`        | full suite passes, exit 0 |
| Lint      | `pnpm lint`              | exit 0 (new TS files only if driver is TS — prefer plain `.mjs`) |

## Scope

**In scope**:
- `e2e/run.sh` (create — one-command runner)
- `e2e/download-obsidian.sh` (create — AppImage download + extract, cached in `e2e/.cache/`)
- `e2e/setup-vault.sh` (create — build plugin, deploy to test vault, register in obsidian.json)
- `e2e/driver.mjs` (create — CDP test driver)
- `e2e/README.md` (create — prerequisites, usage, troubleshooting incl. the pitfalls above)
- `.gitignore` (add `e2e/.cache/`, `e2e/.vault/` if not already covered)
- `.github/workflows/ci.yml` — do NOT add E2E to CI in this plan (AppImage download + xvfb in CI is a separate decision; note it in the README instead)

**Out of scope**:
- CI integration, playwright/selenium, screenshot artifacts beyond the driver's own output dir, the plugin source itself.

## Steps

### Step 1: Download + extract script

Create `e2e/download-obsidian.sh`:

- Cache dir `e2e/.cache/`; if `e2e/.cache/obsidian/obsidian` exists and `--force` not passed, skip.
- Resolve the latest release via the GitHub API (`curl -sL https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest`), pick the `Obsidian-<ver>.AppImage` asset (x86_64, not `-arm64`).
- Download to cache, `chmod +x`, try running directly; if it fails with a FUSE error, `--appimage-extract` into the cache dir. Prefer extraction when `libfuse2` is absent (`ldconfig -p | grep -q libfuse.so.2`).
- Print the resolved binary path. Exit non-zero on failure with a clear message.

**Verify**: `bash e2e/download-obsidian.sh` → prints a path; second run is a no-op (cache hit).

### Step 2: Vault setup script

Create `e2e/setup-vault.sh`:

- `e2e/.vault/` as the test vault (gitignored).
- Run `pnpm build` in the repo root; copy `main.js`, `manifest.json`, `styles.css` to `e2e/.vault/.obsidian/plugins/igdb-game-search/`.
- Write `e2e/.vault/.obsidian/community-plugins.json` = `["igdb-game-search"]`.
- Register the vault in `~/.config/obsidian/obsidian.json` (merge with existing vaults — read the file first, preserve other entries; use a fixed UUID so re-runs don't multiply entries). Set `"open": true` on the test vault.

**Verify**: run it; then `cat e2e/.vault/.obsidian/plugins/igdb-game-search/manifest.json` shows the built version; obsidian.json contains the vault path.

### Step 3: CDP driver

Create `e2e/driver.mjs` (plain node, built-in WebSocket and fetch — no dependencies):

- Read port from `E2E_CDP_PORT` env (default 9222).
- Wait for `http://127.0.0.1:<port>/json/version` (poll up to 60 s).
- Find the `app://` page target (NOT about:blank windows).
- `Runtime.evaluate` helper with `Promise.race` timeout (8 s) — never await a promise that can hang (e.g. modal flows) without a race.
- Test sequence (each prints `PASS`/`FAIL` + detail; exit non-zero on any FAIL):
  1. `app.vault.getName()` === the test vault name
  2. plugin instance present: `!!app.plugins?.plugins?.['igdb-game-search']` — if missing, look for the trust dialog and click `Trust author and enable plugins`, wait, re-check (this is the standard first-run flow)
  3. both commands registered
  4. `getRenderedContents` on a fixture game with a quote + `$` + newline in summary → assert output contains the quote-escaped/truncated forms (mirrors the unit-tested contract at runtime)
  5. modal error path: open search modal, click its `Search` button (in whichever window's DOM it renders — probe the app window first, then any `about:blank` page targets), expect the flow promise to reject with `ConfigurationError` mentioning Twitch (no credentials configured in the test vault)
- Write screenshots to `e2e/.cache/shots/` when `E2E_SHOTS=1` (one at the end, settings tab if reachable).

**Verify**: with the app NOT running: `node e2e/driver.mjs` exits non-zero with a clear "not running" message (the poll times out).

### Step 4: Runner

Create `e2e/run.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
OBSIDIAN_BIN="$(bash e2e/download-obsidian.sh)"
bash e2e/setup-vault.sh
# kill any stale instance first (bracket pattern — do not pkill -f with a bare pattern)
pkill -9 -f '[s]quashfs-root/obsidian' 2>/dev/null || true
rm -f ~/.config/obsidian/DevToolsActivePort ~/.config/obsidian/SingletonLock ~/.config/obsidian/SingletonSocket ~/.config/obsidian/SingletonCookie
xvfb-run -a -s "-screen 0 1280x800x24" "$OBSIDIAN_BIN" --no-sandbox --remote-debugging-port="${E2E_CDP_PORT:-9222}" e2e/.vault > e2e/.cache/obsidian.log 2>&1 &
APP_PID=$!
cleanup() { kill "$APP_PID" 2>/dev/null || true; }
trap cleanup EXIT
node e2e/driver.mjs
```

(Note: `--no-sandbox` is required under root-less CI-ish environments; xvfb-run is the display server. Adjust the kill pattern to match the actual extracted binary path — the bracket trick prevents the shell from killing itself.)

**Verify**: `E2E_SHOTS=1 bash e2e/run.sh` → all PASS, exit 0; `ls e2e/.cache/shots/` has a png; rerunning works (idempotent).

### Step 5: README + gitignore + commit

- `e2e/README.md`: prerequisites (Linux, xvfb-run, curl, node ≥ 20, ~140 MB disk for the AppImage), usage (`bash e2e/run.sh`, `E2E_SHOTS=1`, `E2E_CDP_PORT`), what it verifies, and a Troubleshooting section with the pitfalls from "Current state" (trust dialog, multi-window modals, stale singleton locks, pkill self-match, CDP eval hangs).
- `.gitignore`: add `e2e/.cache/` and `e2e/.vault/`.
- Commit: `chore: add headless Obsidian E2E smoke harness under e2e/` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

**Verify**: `git check-ignore e2e/.cache e2e/.vault` → both reported ignored.

## Test plan

The harness IS the test. Step 4's full run is the acceptance gate.

## Done criteria

ALL must hold:

- [ ] `bash e2e/run.sh` passes end to end on this machine (all driver checks PASS, exit 0)
- [ ] Second consecutive run also passes (idempotent: cache hit, no duplicate vault registrations, no stale-lock failures)
- [ ] `e2e/.cache/` and `e2e/.vault/` are gitignored
- [ ] Driver fails cleanly (non-zero, clear message) when Obsidian is not running
- [ ] `pnpm lint` exit 0 (unchanged — no src/ touched)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current Obsidian AppImage refuses to run headlessly (new anti-headless behavior) — report the exact error; do not switch to a different Obsidian version without noting it.
- The GitHub API rate-limits the download script during your run (429) — report; the script must not silently fall back to a guessed version.
- A driver check passes in a way you cannot attribute to the plugin (e.g. `app` global unavailable but checks still green) — report the actual observations.

## Maintenance notes

- The harness downloads ~140 MB on first run — that is why it is NOT wired into CI in this plan. If CI integration is wanted later, gate it behind a scheduled workflow and cache `e2e/.cache` (GitHub Actions supports arbitrary path caching).
- Obsidian version drift: the AppImage is "latest", so future Obsidian releases may break the driver (DOM changes, new dialogs). The README should tell future maintainers where to add handling; the driver's checks are intentionally high-level (plugin presence, command ids, render output) to minimize breakage.
- The `{{DATE}}`/render checks in the driver mirror unit tests — if a unit test contract changes (e.g. plan 018 quoting), the driver's fixture expectations may need a matching update; keep the two in lockstep.
