# Automatic time-to-beat metadata — 0.6.1 verification

## Requested behavior

Time-to-beat is ordinary IGDB metadata. No opt-in setting, UI toggle, default flag or extra API key is required. Creating a note and inserting metadata share the same selected-game render path. Legacy `enableTimeToBeat: false` and `true` are ignored on loading settings and omitted on subsequent saves. Search results are not individually enriched.

The existing scalar variables, JSON array/object forms, seconds-to-hours conversion, one-hour positive/negative cache, bounded authentication retry and graceful empty fallback remain unchanged. Steam's optional setting is not affected.

## Environment

- Obsidian **1.13.7**, official Linux AppImage; plugin **0.6.1**; official Templater **2.25.1**.
- Real GNOME/Xwayland desktop (`DISPLAY=:0`) and separate headless xvfb runs.
- Test vault: `/home/tetsuya/dev/igdb-game-search/e2e/.vault`.
- All three deployed plugin files match the production build by SHA-256. Temporary app profiles are isolated from the user's personal Obsidian profile.

## Verification

- `pnpm lint`: formatting, ESLint and TypeScript pass, no new warnings.
- `pnpm test --runInBand`: **15 suites / 137 tests pass**.
- `pnpm build`: pass.
- New automatic/migration tests were run before implementation: four failed for the expected missing automatic lookup/obsolete flag behavior. They pass after the change.
- Actual Settings window: **22 setting rows**, seven toggles; the time-to-beat control is absent. Secret picker, gating, trimming, persisted settings and EN/JA re-render checks still pass.
- Both full Obsidian suites pass: smoke, settings, native templates, actual image downloads/rendering, both Templater trigger modes and automatic-time probes.
- The first fresh headless run exposed a pre-existing startup race and personal-config-path assumption in the smoke driver. The driver now waits for plugin/trust UI and reads the isolated profile for restricted-mode recovery; the complete headless rerun passed.

## Real-app transport test and limits

There are no live Twitch credentials in this test environment. The automatic-time probe supplies explicitly mocked HTTP responses at the plugin loader's `require('obsidian').requestUrl` seam. It does **not** change the production `main.js` bytes, stub `IgdbApi.getTimeToBeat`, or replace the render/cache/migration/create pipeline. Other Obsidian exports remain native. Fixture credentials are blocked from reaching actual Twitch/IGDB servers and removed from saved test settings during cleanup.

These values are synthetic test estimates, **not** claimed timings for a real game. The notes themselves contain that provenance label. Authenticated live IGDB search remains explicitly **SKIP**, not PASS.

| Case | Parsed real Obsidian values (main / average / completionist) | HTTP calls across two renders |
| --- | --- | --- |
| Response with data | 10 / 12 / 20 hours | 1: positive cache hit |
| Empty response | empty / empty / empty | 1: negative cache hit |
| HTTP 503 | empty / empty / empty | 2: transient failure is retried |

All cases start from a saved legacy opt-out and require no settings action. The probe verifies scalar, list and object forms through Obsidian's own frontmatter parser. The legacy flag is absent after migration; fixture credentials and temporary loader hooks are not retained.

## Evidence

- [Desktop populated note](desktop-populated.png), [empty response](desktop-missing.png), [failure fallback](desktop-failure.png), [machine-readable records](desktop-automatic.json).
- [Headless populated note](headless-populated.png), [empty response](headless-missing.png), [failure fallback](headless-failure.png), [records](headless-automatic.json).
- [Populated Markdown](populated.md), [empty Markdown](missing.md), [failure Markdown](failure.md).
- [Settings without the toggle](settings-declarative.png), [Japanese settings](settings-ja.png).
- [Real image rendering](desktop-images.png), [structured note](desktop-after.png), [native Templater output](templater-desktop.png).

## Review

Two independent read-only Luna reviews of the frozen candidate reported zero Standards findings and zero material Spec findings. Both confirmed that obsolete UI/schema strings are removed, legacy settings do not suppress fetching, Steam remains opt-in, and the mocked-transport provenance is disclosed.

## Reproduce

```bash
pnpm lint && pnpm test && pnpm build
E2E_REPORT_DIR=docs/verification/automatic-time-to-beat bash e2e/run.sh
# Use the live desktop session's DISPLAY and XAUTHORITY:
E2E_DESKTOP=1 E2E_CDP_PORT=9334 E2E_REPORT_DIR=docs/verification/automatic-time-to-beat bash e2e/run.sh
```

The runner installs official Templater into the test vault only and stops only its own app process group. It retains notes/evidence and removes its temporary profiles/logs.
