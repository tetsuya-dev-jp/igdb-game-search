# Plan 005: Extend the obsidian mock and cover main.ts orchestration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- test/mock_obsidian.ts src/main.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001, 002
- **Category**: tests
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The plugin's core path — search → select → render template/frontmatter → download cover/screenshots → create the vault file — lives entirely in `src/main.ts` (307 lines) and has zero tests. `test/mock_obsidian.ts` exports only `requestUrl`, so any test importing `Plugin`, `Notice`, `Modal`, `TFile`, or `normalizePath` from `obsidian` gets `undefined` and crashes. This plan extends the mock to a minimal-but-realistic Obsidian stub and adds orchestration tests for `getRenderedContents` — the function that decides what actually lands in every user note.

## Current state

- `test/mock_obsidian.ts` (entire file):
  ```ts
  import * as obsidian from 'obsidian';

  export const requestUrl: typeof obsidian.requestUrl = (request: string | obsidian.RequestUrlParam) => {
    return fetch(request as string).then(res => res.json()) as obsidian.RequestUrlResponsePromise;
  };
  ```
- `jest.config.js` maps `obsidian` → `<rootDir>/test/mock_obsidian.ts` (plan 002 keeps this).
- `src/main.ts` — `getRenderedContents(game)` (lines ~101–148):
  ```ts
  async getRenderedContents(game: GameEntry) {
    const localizedGame = await this.translateGameEntry(game);
    const { templateFile, useDefaultFrontmatter, defaultFrontmatterKeyType,
            enableCoverImageSave, coverImagePath, enableScreenshotSave, screenshotImagePath,
            frontmatter, content } = this.settings;
    let contentBody = '';
    if (templateFile) {
      const templateContents = await getTemplateContents(this.app, templateFile);
      contentBody += replaceVariableSyntax(localizedGame, applyTemplateTransformations(templateContents));
    } else {
      if (useDefaultFrontmatter) {
        const defaultFrontmatter = applyDefaultFrontMatter(localizedGame, frontmatter, defaultFrontmatterKeyType);
        contentBody += `---\n${toStringFrontMatter(defaultFrontmatter)}\n---\n`;
      }
      const replacedVariableContent = replaceVariableSyntax(localizedGame, content);
      contentBody += replacedVariableFrontmatter
        ? `---\n${replacedVariableFrontmatter}\n---\n${replacedVariableContent}`
        : replacedVariableContent;
    }
    return contentBody;
  }
  ```
  (Exact branch shape verified on the live file before writing tests — read lines 101–148 and mirror them.)
- `translateGameEntry` (lines ~150–161) wraps `new DeepLApi(this.settings).translateGameEntry(game)` in try/catch, returns the game unchanged on failure.
- `downloadAndSaveImage(imageName, directory, imageUrl)` (lines ~166–188): `requestUrl({url, method:'GET', headers:{Accept:'image/*'}})`, checks `status !== 200`, `ensureDirectory`, `vault.adapter.writeBinary(path, response.arrayBuffer)`, returns the path or `''` on error.
- `GameSearchPlugin extends Plugin` with `settings`, `loadSettings`, `saveSettings`; `initialize()` calls `loadSettings`, `addRibbonIcon`, `addCommand` ×2, `addSettingTab`, and logs via `console.debug`. `manifest` is used in the debug log.
- `showNotice(message)` (lines ~95–101): `new Notice(this.toNoticeMessage(message))`.
- Existing suites import from `obsidian` successfully today only because they avoid the mock's gap — new tests must not break them (additive mock exports are safe).

Repo conventions: jest + ts-jest, colocated tests, `createSettings` fixture from plan 002, placeholder-only credentials, conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/main.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `test/mock_obsidian.ts` (extend)
- `src/main.test.ts` (create)

**Out of scope**:
- `src/main.ts` — no runtime changes in this plan.
- Other test files, configs, `src/` runtime files.

## Steps

### Step 1: Extend the mock

Add to `test/mock_obsidian.ts`, keeping the existing `requestUrl` export:

```ts
export class Plugin {
  app: any = {};
  manifest = { id: 'igdb-game-search', version: '0.0.0', minAppVersion: '0.0.0' };
  loadData = jest.fn().mockResolvedValue({});
  saveData = jest.fn().mockResolvedValue(undefined);
  addRibbonIcon = jest.fn().mockReturnValue({ addClass: jest.fn() });
  addCommand = jest.fn();
  addSettingTab = jest.fn();
}

export class Notice {
  constructor(message: any) { this.message = message; }
  message: any;
}

export class Modal {
  app: any; contentEl: any;
  constructor(app: any) { this.app = app; this.contentEl = { empty: jest.fn(), createEl: jest.fn().mockReturnValue({ addClass: jest.fn() }) }; }
  open = jest.fn(); close = jest.fn();
  onOpen() {} onClose() {}
}

export class SuggestModal extends Modal {
  constructor(app: any) { super(app); }
  setPlaceholder = jest.fn();
}

export class TFile {}

export class MarkdownView {}

export class Setting {
  constructor(_containerEl: any) {}
  setName = jest.fn().mockReturnValue(this);
  setDesc = jest.fn().mockReturnValue(this);
  setHeading = jest.fn().mockReturnValue(this);
  addText = jest.fn().mockReturnValue(this);
  addToggle = jest.fn().mockReturnValue(this);
  addDropdown = jest.fn().mockReturnValue(this);
  addButton = jest.fn().mockReturnValue(this);
  addSearch = jest.fn().mockReturnValue(this);
}

export const normalizePath = (p: string) => p.replace(/\/+/g, '/');
export const requestUrl = /* keep existing */;
export const App = class {};
```

Import `jest` types only if the file compiles standalone (`import { jest } from '@jest/globals'` if needed — ts-jest's tsconfig must accept it; if type friction appears, type the mock's jest-using fields as `any` instead — the goal is a working suite, not perfect typings).

**Verify**: `pnpm test` → all existing suites still pass (additive change).

### Step 2: Characterize the render path

Create `src/main.test.ts`. Construct the plugin without running `onload`:

```ts
import GameSearchPlugin from './main';
import { createSettings } from '../test/settings_fixture';
import { Plugin } from 'obsidian';

describe('GameSearchPlugin.getRenderedContents', () => {
  let plugin: any;
  beforeEach(() => {
    plugin = Object.create(GameSearchPlugin.prototype);
    plugin.settings = createSettings();
    plugin.app = { vault: { cachedRead: jest.fn().mockResolvedValue('') }, metadataCache: {} };
  });
  ...
});
```

Cases (mirror the live `getRenderedContents` branch structure — read `src/main.ts:101-148` first and adjust):

1. **Default path, empty content setting**: settings = `createSettings()` → output starts with `---\n`, contains `title: <title>` and the fixture game's camelCase keys, ends with `---`.
2. **Content setting with variables**: `content: '## {{title}}\n{{summary}}'` → body contains the substituted values.
3. **Template-file path**: `templateFile: 'templates/game'` and `app.vault.cachedRead` resolves a template containing `{{title}}` → output is the substituted template; assert `cachedRead` was called with the normalized path.
4. **useDefaultFrontmatter: false** → no `---` frontmatter block in output.
5. **Translation off** (default) → `translateGameEntry` returns the game unchanged; with `enableTranslation: true` but empty `deeplApiKey`, the catch in `translateGameEntry` swallows the `ConfigurationError` and returns the game — output still renders. (Do NOT exercise a real DeepL call.)

Use a fixture game with a few representative fields, e.g. `{ title: 'Elden Ring', summary: 'A dark fantasy action RPG', genre: 'RPG', releaseYear: '2022' }` typed as `GameEntry` (cast if needed).

**Verify**: `pnpm test src/main.test.ts` → all cases pass. If a case fails because the live code differs from the excerpt above, adjust the test to the live behavior and note the deviation in your report — do not edit `main.ts`.

### Step 3: Commit

`test: add orchestration tests for getRenderedContents` (conventional commit).

**Verify**: `git log -1 --oneline` matches; `git status` shows only `test/mock_obsidian.ts` and `src/main.test.ts`.

## Test plan

Cases listed in Step 2 — happy paths plus the branch matrix of `getRenderedContents`. No download tests (network) and no modal tests (plans 009 handles modal behavior; the mock's `Modal` is here to make imports resolve).

## Done criteria

ALL must hold:

- [ ] `pnpm test` passes (existing suites unaffected)
- [ ] `src/main.test.ts` covers the five cases from Step 2
- [ ] `pnpm lint` exits 0
- [ ] `git diff --stat` shows no changes to `src/main.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `getRenderedContents` in the live file has a branch shape the excerpt doesn't cover — extend the test matrix, don't modify runtime code.
- A case fails and the cause is a runtime bug in `main.ts` — report it (it becomes a new finding), do not fix here.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Future plans touching `main.ts` (008 image overwrite, 009 modal promises) can now lean on `src/main.test.ts` for regression coverage; extend it in those plans rather than rewriting.
- The mock is minimal by design — when a new test needs a `workspace`/`vault` behavior, extend the mock in that plan, keeping exports additive.
- Reviewer: confirm the mock's `requestUrl` stays untouched (existing suites depend on its fetch-based behavior).
