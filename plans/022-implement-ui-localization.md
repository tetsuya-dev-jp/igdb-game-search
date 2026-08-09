# Plan 022: Implement UI localization per the i18n design spike

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/utils/i18n.ts src/utils/i18n.test.ts src/main.ts src/views/game_search_modal.ts src/settings/settings.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 014 (its design doc `docs/design/i18n.md` is the source of truth — read it before starting)
- **Category**: direction
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

The repo ships trilingual READMEs but an English-only UI. Plan 014's spike produced `docs/design/i18n.md` — a complete design: typed locale maps, `t()` contract, migration order, and the explicit rule that **every new user-facing string gets its i18n key in the same change**. This plan implements it: locale files for en/ja/ko, a `getLanguage()`-first detector, `uiLanguage` override setting, and migration of all ~50 strings across commands, modals, settings, and user-facing notices. `ConfigurationError` messages stay English (documented decision — they tell the user to fix settings, which will be localized).

## Current state

- `src/utils/i18n.ts` (PoC from 014, verbatim):
  ```ts
  const UI_STRINGS = {
    'search.button': 'Search',
    'search.buttonRequesting': 'Requesting...',
    'search.heading': 'Search game',
  } as const;
  export type I18nKey = keyof typeof UI_STRINGS;
  const LOCALE_STRINGS: Record<string, Partial<Record<I18nKey, string>>> = { en: UI_STRINGS };
  export function t(key: I18nKey, locale = detectLocale()): string { ... }
  export function detectLocale(): string { /* moment.locale() → navigator.language → '' */ }
  ```
- `src/utils/i18n.test.ts` — 3 tests (en lookup, ja→en fallback, detectLocale smoke).
- `src/views/game_search_modal.ts` — already wired: `t('search.button')`, `t('search.buttonRequesting')`, `t('search.heading')`.
- `src/main.ts` — hardcoded: ribbon tooltip + command `'Create new game note'` (line ~29/36), `'Insert metadata'` (line ~44), notices `'An unexpected error occurred.'` (4× in `toNoticeMessage`/`showNotice`), `'No query entered.'`/`'No results found for "..."'` live in the modal (partially wired).
- `src/settings/settings.ts` — ~43 hardcoded strings: 6 headers (`createHeader('General settings', ...)` etc.), 18 setting names + 18 descriptions, 7 placeholders, `'Example template'` button, `DefaultFrontmatterKeyType` enum labels (see below — do NOT translate the enum values).
- Obsidian API: `getLanguage()` exists (obsidian.d.ts:3365; official eslint prefers it over navigator.language).
- Repo conventions: colocated jest tests, `@utils` alias, `pnpm lint`/`pnpm test` gates (pnpm at `/tmp/pnpm-bin/pnpm`), conventional commits, README sync across 3 languages, settings saved per-field with `saveSettings()`.

**Design constraints from `docs/design/i18n.md` (binding)**:
1. Locale files: `src/locales/en.ts` (canonical, complete), `src/locales/ja.ts`, `src/locales/ko.ts` (partial `Partial<...>` maps, fall back to en). Flat dotted keys (`'command.createGameNote'`, `'settings.folder.name'`).
2. `t(key, locale?)`: never throws; missing key → en string; locale normalization = trim/lowercase/split-on-`-` (the DeepL precedent).
3. Detector: `getLanguage()` when available → fallback to the moment/navigator chain.
4. Enum labels `Snake Case`/`Camel Case` are **stored data** — keep the enum values English; do NOT translate them.
5. `ConfigurationError` messages (`Please set your Twitch...`, `Please set your DeepL...`) stay English. Localize only generic fallbacks (`An unexpected error occurred.`, `Failed to read the template file`) and modal notices.
6. Add a `uiLanguage` setting (`auto` default, options: auto/en/ja/ko) — users can force a language when detection is wrong.
7. Every new string in this plan gets: en key + ja/ko translations + README row (coordination rule) — for the 3 languages that the READMEs cover.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/utils/i18n.test.ts` | all pass |
| Full      | `pnpm test`              | all suites pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/locales/en.ts`, `src/locales/ja.ts`, `src/locales/ko.ts` (create)
- `src/utils/i18n.ts` (typed keys from en map, detector upgrade, `t` accepts the uiLanguage override)
- `src/utils/i18n.test.ts` (extend)
- `src/main.ts` (commands, ribbon, generic notices)
- `src/views/game_search_modal.ts` (remaining modal strings: placeholder, 2 notices)
- `src/settings/settings.ts` (all strings + `uiLanguage` dropdown in a new "General" section area)
- `src/settings/settings.ts` interface + `DEFAULT_SETTINGS` (`uiLanguage: 'auto'`)
- `README.md`, `README.ja.md`, `README.ko.md` (one "UI language" settings row + a Translations note)

**Out of scope**:
- `ConfigurationError` message strings (stay English), `console.*` messages, DeepL language names, template content strings, `deepl_languages.ts`.
- Game data rendering (`game_suggest_modal.ts` shows game titles — external data, not UI strings).
- Translating `DefaultFrontmatterKeyType` values.

## Steps

### Step 1: Restructure i18n.ts with locale files

- Create `src/locales/en.ts`:
  ```ts
  export const en = {
    'command.createGameNote': 'Create new game note',
    'command.insertMetadata': 'Insert metadata',
    'search.button': 'Search',
    'search.buttonRequesting': 'Requesting...',
    'search.heading': 'Search game',
    'search.placeholder': 'Search by game title',
    'search.noQuery': 'No query entered.',
    'search.noResults': 'No results found for "{query}"',
    'notice.unexpectedError': 'An unexpected error occurred.',
    'notice.templateReadFailed': 'Failed to read the template file',
    'settings.general.header': 'General settings',
    'settings.general.location.name': 'New file location',
    'settings.general.location.desc': 'New game notes will be placed here.',
    'settings.general.location.placeholder': 'Example: games',
    'settings.general.fileName.name': 'New file name',
    'settings.general.fileName.desc': 'Enter the file name format.',
    'settings.general.fileName.placeholder': 'Example: {{title}}',
    'settings.template.name': 'Template file',
    'settings.template.desc': 'Files will be available as templates.',
    'settings.template.placeholder': 'Example: templates/game-note',
    'settings.template.exampleButton': 'Example template',
    'settings.igdb.header': 'IGDB authentication',
    'settings.igdb.clientId.name': 'Twitch client ID',
    'settings.igdb.clientId.desc': 'Used to request an access token for game metadata.',
    'settings.igdb.clientSecret.name': 'Twitch client secret',
    'settings.igdb.clientSecret.desc': 'Stored locally in plugin data and used to refresh the access token.',
    'settings.translation.header': 'Translation',
    'settings.translation.enable.name': 'Enable translation',
    'settings.translation.enable.desc': 'Translate the summary and storyline before rendering note content.',
    'settings.translation.target.name': 'Translation target language',
    'settings.translation.target.desc': 'Choose the target language, or follow your current Obsidian language automatically.',
    'settings.translation.key.name': 'Translation service key',
    'settings.translation.key.desc': 'Stored locally in plugin data and used only for translating the summary and storyline.',
    'settings.search.header': 'Search experience',
    'settings.search.cover.name': 'Show cover images in search',
    'settings.search.cover.desc': 'Display cover art in the suggestion list.',
    'settings.note.header': 'Note creation',
    'settings.note.open.name': 'Open new game note',
    'settings.note.open.desc': 'Automatically open the created note.',
    'settings.note.coverSave.name': 'Enable cover image save',
    'settings.note.coverSave.desc': 'Download the selected game cover into your vault.',
    'settings.note.coverFolder.name': 'Cover image folder',
    'settings.note.coverFolder.desc': 'Folder used when cover image saving is enabled.',
    'settings.note.coverFolder.placeholder': 'Example: assets/game-covers',
    'settings.note.screenshotSave.name': 'Enable screenshot save',
    'settings.note.screenshotSave.desc': 'Download screenshots into your vault.',
    'settings.note.screenshotFolder.name': 'Screenshot folder',
    'settings.note.screenshotFolder.desc': 'Root folder used when screenshot saving is enabled. Each game gets its own subfolder.',
    'settings.note.screenshotFolder.placeholder': 'Example: assets/game-screenshots',
    'settings.content.header': 'Note content',
    'settings.content.defaultFm.name': 'Use default frontmatter',
    'settings.content.defaultFm.desc': 'Include game metadata (title, platforms, ratings...) as frontmatter.',
    'settings.content.keyStyle.name': 'Frontmatter key style',
    'settings.content.keyStyle.desc': 'Choose the key style used for the default game metadata frontmatter.',
    'settings.content.extraFm.name': 'Extra frontmatter',
    'settings.content.extraFm.desc': 'Additional YAML keys merged into the frontmatter. One `key: value` per line.',
    'settings.content.extraFm.placeholder': 'Example: play_status: backlog',
    'settings.content.body.name': 'Note content',
    'settings.content.body.desc': 'Body template used when no template file is set. Supports `{{variable}}` syntax.',
    'settings.content.body.placeholder': 'Example: ## {{title}}\n{{summary}}',
    'settings.uiLanguage.name': 'UI language',
    'settings.uiLanguage.desc': 'Choose the plugin UI language, or follow Obsidian automatically.',
  } as const;
  export type I18nKey = keyof typeof en;
  ```
  (Compare against the live `settings.ts` strings and the inventory in `docs/design/i18n.md` — if a live string is missing from this list, add it with a dotted key. The list above is the complete inventory at plan time.)
- Create `src/locales/ja.ts` and `src/locales/ko.ts` as `Partial<Record<I18nKey, string>>` — translate EVERY key (these are the plugin's own locales; untranslated keys fall back to en via the map). Natural, idiomatic translations; match the READMEs' register (polite Japanese; formal Korean).
- Rewrite `src/utils/i18n.ts`:
  - Import `en` (canonical) + `ja`, `ko`; build `LOCALE_STRINGS: Record<string, Partial<Record<I18nKey, string>>> = { en, ja, ko }`.
  - `I18nKey` re-exported from the en map.
  - `t(key, locale?)`: normalize (trim/lowercase/split-`-`), lookup `LOCALE_STRINGS[base]?.[key] ?? en[key]` — never throw, unknown key → en string (the `as const` typing prevents unknown keys at compile time anyway).
  - `detectLocale()`: try `globalThis.getLanguage?.()` (Obsidian API — check the installed obsidian.d.ts for its exact signature first), then the existing moment→navigator chain.
  - Add `resolveLocale(preferred: string | undefined)`: `preferred && preferred !== 'auto' ? preferred : detectLocale()` — the uiLanguage override lives here.

**Verify**: `pnpm lint` passes.

### Step 2: Extend i18n tests

In `src/utils/i18n.test.ts`, extend with explicit-locale lookups (never trust jsdom's detection):
- en key returns the en string for `'en'` and `'en-US'`
- ja returns the ja string when the ja map has the key (assert at least one, e.g. `t('search.button', 'ja')`)
- unknown locale (e.g. `'xx'`) falls back to en
- `resolveLocale('auto')` returns the detected locale string; `resolveLocale('ja')` returns `'ja'`; `resolveLocale(undefined)` returns the detected locale

**Verify**: `pnpm test src/utils/i18n.test.ts` → all pass.

### Step 3: Wire commands + modal (slice 1)

- `src/main.ts`: ribbon tooltip + command name → `t('command.createGameNote')`; insert command → `t('command.insertMetadata')`. Note: Obsidian command NAMES are what users see in the palette — the command `id`s stay unchanged.
- `src/views/game_search_modal.ts`: placeholder → `t('search.placeholder')`; `No query entered.` notice → `t('search.noQuery')`; `No results found for "${this.query}"` → `t('search.noResults').replace('{query}', this.query)`.
- `src/main.ts` generic notices: `toNoticeMessage` fallback → `t('notice.unexpectedError')`; `src/utils/template.ts` `Failed to read the template file` → `t('notice.templateReadFailed')` (add `@utils/i18n` import there — check for import cycles: i18n.ts imports only locales, no cycle risk).

**Verify**: `pnpm test` passes (modal tests assert button texts — they use the plugin's `t()` output, which resolves to en in jsdom; existing assertions should hold. If a test hardcodes 'Search' and the jsdom locale resolves non-en, fixture explicitly: the tests pass `locale` implicitly via `detectLocale()` which in jsdom returns `''` → en fallback. Confirm this reasoning holds in the suite run.)

### Step 4: Wire the settings tab (slice 2)

`src/settings/settings.ts`: replace every hardcoded `.setName(...)`/`.setDesc(...)`/`createHeader(...)`/placeholder/`'Example template'` with `t('settings.…')` keys from the en map. Keep `DefaultFrontmatterKeyType` enum values untouched. Add the `uiLanguage` setting:
- `GameSearchPluginSettings` interface += `uiLanguage: string;` and `DEFAULT_SETTINGS` += `uiLanguage: 'auto'`.
- In the settings tab, add a dropdown (options `auto`/`en`/`ja`/`ko`, labels from `t('settings.uiLanguage.auto')` etc. or plain codes — use plain codes `auto/en/ja/ko` as both value and label for simplicity) with `.setName(t('settings.uiLanguage.name')).setDesc(t('settings.uiLanguage.desc'))`, saved on change like every other field.

**Verify**: `pnpm lint` passes; `grep -n "setName('" src/settings/settings.ts` → no matches (all via `t()`); `grep -c "t('settings" src/settings/settings.ts` ≥ 40.

### Step 5: READMEs (coordination rule)

Add to all three READMEs' settings sections:
- One row for the UI language dropdown (auto/en/ja/ko) in the appropriate section.
- A short "Translations" note: new UI strings must add a key to `src/locales/en.ts` + every locale file, and get a README row — mirroring the trilingual sync rule. Japanese for the ja README, Korean for the ko README.

**Verify**: `grep -n "UI language" README.md README.ja.md README.ko.md` → one match per file; `grep -n "Translations" README.md README.ja.md README.ko.md` → one match per file.

### Step 6: Full verification + commit

**Verify**: `pnpm test` (all suites) + `pnpm lint` exit 0. Commit: `feat: localize plugin UI with en/ja/ko string maps` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

Step 2's `t()`/`resolveLocale` cases. Existing suites must stay green (modal/settings tests use en fallback in jsdom). No UI-automation tests (the E2E harness in plan 023 covers real-runtime rendering).

## Done criteria

ALL must hold:

- [ ] `src/locales/{en,ja,ko}.ts` exist; ja/ko are partial maps with translations for every key present in en
- [ ] `t()` never throws and falls back to en for unknown locales/keys
- [ ] Detector prefers `getLanguage()` when present (verify against obsidian.d.ts)
- [ ] No hardcoded UI strings remain in `main.ts`/`game_search_modal.ts`/`settings.ts` (`grep -nE "setName\\('[A-Z]|createHeader\\('[A-Z]"` → no matches)
- [ ] `uiLanguage` setting exists with default `'auto'` and is honored by `t()`
- [ ] `ConfigurationError` messages unchanged (English)
- [ ] All three READMEs document the UI language setting + Translations note
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `getLanguage` is not available in the installed obsidian typings (then keep the moment/navigator chain and note it — do not invent an API).
- An existing test breaks because jsdom's locale resolution differs from the plan's en-fallback assumption (report the actual resolution; do not weaken the test).
- The live `settings.ts` has user-facing strings absent from the Step 1 key list (add keys — the list is the floor, not the ceiling).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The coordination rule (design doc §4) is now live: every future UI string change = code + locale keys + README row in one commit. The `as const` typing makes missing keys a compile error for en; ja/ko gaps fall back silently — a reviewer should spot-check ja/ko completeness per PR.
- If ja/ko translations rot, the fallback keeps the UI usable; consider a completeness unit test (every en key present in ja/ko) if drift appears — explicitly NOT added in this plan (the maps are new; drift is not yet a problem).
- `detectLocale` (i18n) and `getCurrentLocale` (deepl_languages) are separate by design (DeepL precedent) — plan 020 unifies them; coordinate if both land close together (020 should make deepl_languages delegate to i18n's detector).
- Reviewer: verify the modal/settings tests still pass and that command IDs were not renamed (only display names changed).
