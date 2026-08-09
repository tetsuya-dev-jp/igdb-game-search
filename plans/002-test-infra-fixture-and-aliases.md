# Plan 002: Shared settings fixture, obsidian mock enum fix, jest alias fix

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- jest.config.js src/utils/utils.test.ts src/apis/igdb_api.test.ts src/apis/deepl_api.test.ts test/`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: tests
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

Three test-infrastructure problems block the test plans that follow:

1. Full `GameSearchPluginSettings` fixture objects are duplicated in two test files; every settings change must be mirrored in both (drift risk that has already bitten once — screenshot/translation fields were added and had to be backfilled).
2. `src/utils/utils.test.ts` does `jest.mock('@settings/settings', () => jest.fn())`, which replaces the real module. `utils.ts` reads `DefaultFrontmatterKeyType.camelCase` (an enum value) from that module at runtime, so the enum is `undefined` in tests — any future test calling `applyDefaultFrontMatter` without the `keyType` arg throws a confusing TypeError.
3. `jest.config.js` maps `@editor/(.*)` → `<rootDir>/src/editor/$1`, but no `src/editor/` exists (book-search fork leftover), and the `@views` alias that `tsconfig.json` defines is missing from jest — a future test importing `@views/...` fails to resolve.

## Current state

- `jest.config.js` moduleNameMapper block:
  ```js
  moduleNameMapper: {
    '@settings/(.*)': '<rootDir>/src/settings/$1',
    '@models/(.*)': '<rootDir>/src/models/$1',
    '@editor/(.*)': '<rootDir>/src/editor/$1',   // dead: no src/editor/
    '@utils/(.*)': '<rootDir>/src/utils/$1',
    '@apis/(.*)': '<rootDir>/src/apis/$1',
    '@src/(.*)': '<rootDir>/src/$1',
    obsidian: '<rootDir>/test/mock_obsidian.ts',
  },
  ```
- `tsconfig.json` paths (the source of truth): `@settings/* @models/* @utils/* @apis/* @views/* @src/*` (under `compilerOptions.paths` / baseUrl).
- `src/utils/utils.test.ts` line 5: `jest.mock('@settings/settings', () => jest.fn());` — utils.ts imports `DefaultFrontmatterKeyType` from `@settings/settings` and uses `.camelCase`/`.snakeCase` in `applyDefaultFrontMatter` (`src/utils/utils.ts:36-52`).
- `src/apis/igdb_api.test.ts:7-26` and `src/apis/deepl_api.test.ts:22-41` each define a full `GameSearchPluginSettings` object literal (the second one differs by `deeplApiKey`/translation fields). Both use placeholder values only (`client`/`secret`/`test-key`) — keep it that way, never real credentials.
- Settings interface fields (from `src/settings/settings.ts`): `folder, fileNameFormat, frontmatter, content, useDefaultFrontmatter, defaultFrontmatterKeyType, templateFile, twitchClientId, twitchClientSecret, igdbAccessToken, igdbAccessTokenExpiresAt, openPageOnCompletion, showCoverImageInSearch, enableCoverImageSave, coverImagePath, enableScreenshotSave, screenshotImagePath, enableTranslation, translationTargetLanguage, deeplApiKey`.

Repo conventions: tests colocated in `src/**/*.test.ts`, ts-jest, jsdom; imports use the `@` aliases; prettier 2-space formatting (`pnpm format` auto-fixes).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0 (if 001 done, already installed) |
| Tests     | `pnpm test`              | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `test/settings_fixture.ts` (create — shared fixture helper)
- `src/apis/igdb_api.test.ts`, `src/apis/deepl_api.test.ts` (use the helper)
- `src/utils/utils.test.ts` (fix the mock)
- `jest.config.js` (alias block)

**Out of scope**:
- Any new behavior tests (plans 003–005 own those).
- `src/settings/settings.ts` and all other `src/` runtime files.
- Dependency changes; `package.json` edits.

## Steps

### Step 1: Create the shared settings fixture

Create `test/settings_fixture.ts`:

```ts
import { GameSearchPluginSettings, DefaultFrontmatterKeyType } from '@settings/settings';

export function createSettings(overrides: Partial<GameSearchPluginSettings> = {}): GameSearchPluginSettings {
  return {
    folder: '',
    fileNameFormat: '{{title}}',
    frontmatter: '',
    content: '',
    useDefaultFrontmatter: true,
    defaultFrontmatterKeyType: DefaultFrontmatterKeyType.camelCase,
    templateFile: '',
    twitchClientId: '',
    twitchClientSecret: '',
    igdbAccessToken: '',
    igdbAccessTokenExpiresAt: 0,
    openPageOnCompletion: true,
    showCoverImageInSearch: false,
    enableCoverImageSave: false,
    coverImagePath: '',
    enableScreenshotSave: false,
    screenshotImagePath: '',
    enableTranslation: false,
    translationTargetLanguage: 'auto',
    deeplApiKey: '',
    ...overrides,
  };
}
```

Match the field list to the live `GameSearchPluginSettings` interface in `src/settings/settings.ts` — if a field exists there but not in the list above, add it. The default for `translationTargetLanguage` must match `DEFAULT_SETTINGS` (`AUTO_TRANSLATION_LANGUAGE`, whose value is the string `'auto'` — verify against `src/utils/deepl_languages.ts`).

**Verify**: `npx tsc --noEmit` exits 0 (or, if tsc isn't installed, `pnpm lint` passes its tsc step).

### Step 2: Point both API test files at the fixture

In `src/apis/igdb_api.test.ts` and `src/apis/deepl_api.test.ts`, replace the local full-settings literals with `createSettings({ ... })` calls using the specific overrides each test needs (e.g. deepl tests pass `{ deeplApiKey: 'test-key', enableTranslation: true }`-style overrides). Keep test values as placeholders (`client`/`secret`/`test-key`) — never real credentials. Import from `test/settings_fixture` via relative path (`../test/settings_fixture` from `src/apis/`) or the jest `roots: ['<rootDir>/src']`-compatible path — the fixture lives outside `src/`, so use a relative import; jest resolves it fine.

**Verify**: `pnpm test` → all existing suites still pass.

### Step 3: Fix the settings mock in utils.test.ts

Replace `jest.mock('@settings/settings', () => jest.fn());` with a mock that keeps the real enum:

```ts
jest.mock('@settings/settings', () => ({
  ...jest.requireActual('@settings/settings'),
  __esModule: true,
}));
```

If the original mock existed to stub something else, preserve that intent by spreading actuals and overriding only what was stubbed — check the rest of the file first.

**Verify**: `pnpm test` → utils suite passes; additionally confirm `DefaultFrontmatterKeyType` is defined in the test environment by asserting in the suite (or a quick `node -e` equivalent is not possible under jest — rely on the suite passing plus a `console.assert` you can remove after) — simplest: `pnpm test src/utils/utils.test.ts` passes.

### Step 4: Fix jest aliases

In `jest.config.js` moduleNameMapper:
- Replace `'@editor/(.*)': '<rootDir>/src/editor/$1',` with `'@views/(.*)': '<rootDir>/src/views/$1',`
- Keep all other entries as-is.

**Verify**: `pnpm test` → all pass; `grep -n "editor" jest.config.js` → no match.

### Step 5: Commit

`test: add shared settings fixture and fix jest config` (repo convention: conventional commits).

**Verify**: `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

This plan changes test infrastructure only; the existing suites are the verification. No new test cases.

## Done criteria

ALL must hold:

- [ ] `test/settings_fixture.ts` exists with `createSettings`; no duplicate full-settings literals remain in either API test file (`grep -c "igdbAccessTokenExpiresAt" src/apis/*.test.ts` appears in each file at most once — from the import of the fixture's fields if any)
- [ ] `jest.config.js` maps `@views` and no longer maps `@editor`
- [ ] `utils.test.ts` uses `jest.requireActual` for the settings module
- [ ] `pnpm lint && pnpm test` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `GameSearchPluginSettings` interface has fields the fixture doesn't cover (add them — that's the plan's intent) **and** tests still fail after adding them.
- `jest.requireActual` fails to resolve because of the `obsidian` module mapping — do not work around by deleting the mock; report.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Every future settings-field addition should update `createSettings` in one place instead of per-file fixtures — this is the point of the helper.
- When the `@views` alias is used in a future test, jest now resolves it.
- A reviewer should check no real-looking credentials slipped into any test file — placeholders only.
