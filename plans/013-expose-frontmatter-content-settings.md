# Plan 013: Expose the implemented-but-unreachable frontmatter/content settings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/settings/settings.ts src/main.ts README.md README.ja.md README.ko.md`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (verification), 007 (frontmatter serializer must be fixed before users can configure it)
- **Category**: direction
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

Four settings are fully implemented and consumed by the render path but have **no settings-tab UI**, so users can never use them:

- `frontmatter` (extra YAML keys merged into every note's frontmatter)
- `content` (custom body template used when no template file is set)
- `useDefaultFrontmatter` (toggle the automatic game-metadata frontmatter)
- `defaultFrontmatterKeyType` (camelCase vs snake_case keys)

`getRenderedContents` (src/main.ts:101–148) destructures and applies all four; the settings interface and defaults exist (`src/settings/settings.ts:19-22,42-45`); but grep shows no `Setting` binds them. This plan exposes them in the settings tab and documents them, turning dead-but-working code into a user feature.

## Current state

- `src/settings/settings.ts` — `GameSearchSettingTab.display()` renders six sections via `createGeneralSettings` (new file location + file name format), `createTemplateFileSetting`, `createIgdbSettings`, `createTranslationSettings`, `createSearchSettings`, `createNoteSettings`. Settings are saved per-field via `.onChange(async value => { this.plugin.settings.X = ...; await this.plugin.saveSettings(); })` — every existing field follows this exact pattern (see `createNoteSettings` for the toggle/text pattern, and `createGeneralSettings` for the `addText` + `FolderSuggest` pattern).
- `src/main.ts` `getRenderedContents` (lines ~101–148): if `templateFile` is set → template path (frontmatter/content settings are ignored there); else → `useDefaultFrontmatter` gate, `applyDefaultFrontMatter(game, frontmatter, defaultFrontmatterKeyType)`, then body = `replaceVariableSyntax(game, content)` with an extra frontmatter block if `frontmatter` is set.
- `src/settings/suggesters/FolderSuggest`/`FileSuggest` exist for path fields; there is **no** textarea pattern yet — Obsidian's `Setting.addTextArea` is available (check the `obsidian` typings; `addTextArea` exists on `Setting`).
- README settings section: "How to use settings" with subsections matching the section names; plan 012 owns the usage/development sections; plan 013 owns the settings-table rows.
- Settings are persisted via Obsidian's `data.json` (standard convention — no secrets; these fields are plain text user content).

Repo conventions: settings tab uses `Setting` fluent API, headers via `this.createHeader(title, containerEl)`; sentence-case labels (commit `afc65de`); `saveSettings` on every change; READMEs kept in sync across 3 languages.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test`              | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/settings/settings.ts`
- `README.md`, `README.ja.md`, `README.ko.md` (settings rows only)

**Out of scope**:
- `src/main.ts` render logic (already correct), template file behavior, plan 012's sections.

## Steps

### Step 1: Add the "Note content" settings section

In `GameSearchSettingTab`, add a `createNoteContentSettings(containerEl)` method called from `display()` after `createNoteSettings`, with header `'Note content'`:

- **Use default frontmatter** (toggle → `useDefaultFrontmatter`): desc "Include game metadata (title, platforms, ratings...) as frontmatter."
- **Frontmatter key style** (dropdown → `defaultFrontmatterKeyType`, options `Camel Case` / `Snake Case` from the `DefaultFrontmatterKeyType` enum values): disabled when `useDefaultFrontmatter` is off (`.setDisabled(!this.plugin.settings.useDefaultFrontmatter)` — match the translation section's disable pattern at `settings.ts` createTranslationSettings). Re-render (`this.display()`) on toggle change like the translation enable toggle does.
- **Extra frontmatter** (`addTextArea` → `frontmatter`, placeholder `Example: play_status: backlog`): desc "Additional YAML keys merged into the frontmatter. One `key: value` per line." Save on change (`.onChange` fires on every keystroke — use the same direct-save pattern as the other text fields for consistency).
- **Note content** (`addTextArea` → `content`, placeholder `Example: ## {{title}}\n{{summary}}`): desc "Body template used when no template file is set. Supports `{{variable}}` syntax."

Match the existing section pattern exactly: `this.createHeader('Note content', containerEl);` then `new Setting(containerEl).setName(...).setDesc(...).addTextArea(...)`.

**Verify**: `pnpm lint` passes; `grep -n "createNoteContentSettings" src/settings/settings.ts` → defined and called in `display()`.

### Step 2: Verify the render path honors the new controls

Sanity-check by reading `src/main.ts:101-148` once more: with `templateFile` empty, `useDefaultFrontmatter` false, `frontmatter: "play_status: backlog"`, `content: "## {{title}}"` → output should be a body without `---` block plus the content text and no frontmatter. This is existing behavior (no code change needed) — do NOT modify main.ts. If the flow looks broken, STOP and report (it isn't expected to be).

**Verify**: plan 005's `getRenderedContents` tests still pass unchanged (they use `createSettings()` defaults; the new UI does not alter defaults).

### Step 3: Document the settings (3 READMEs)

In each README's "How to use settings" section, add a `Note content` subsection after the note section, mirroring the other subsections' one-line-per-setting style:

- Use default frontmatter (toggle), Frontmatter key style (Camel/Snake), Extra frontmatter (one `key: value` per line), Note content (`{{variable}}` syntax; ignored when a template file is set).

**Verify**: `grep -n "Note content" README.md README.ja.md README.ko.md` → one match per file.

### Step 4: Commit

`feat: expose frontmatter and content settings in the settings tab` (conventional commit — matches `feat:` usage in git history).

**Verify**: `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

No new runtime tests needed — the render path was already exercised by plan 005's suite, and this plan only binds UI to existing settings. If plan 005's suite is absent (005 skipped), add one `getRenderedContents` case with the new settings values (custom frontmatter + custom content) using the plan-005 pattern before committing.

## Done criteria

ALL must hold:

- [ ] Four new settings controls bound to the existing settings fields, saved on change
- [ ] `useDefaultFrontmatter` toggle re-renders the tab and disables the key-style dropdown when off
- [ ] `pnpm lint` + `pnpm test` exit 0
- [ ] Each README documents the new section
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `Setting.addTextArea` is unavailable in the installed obsidian typings (then use a plain `addText` per field and note the limitation).
- `getRenderedContents` doesn't behave as described in Step 2 (a real bug would change this plan's scope).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- With the UI live, `frontmatter`/`content` fields become user-facing contract: future changes to `applyDefaultFrontMatter`/`toStringFrontMatter` (e.g. plan 007 already landed) must keep the `key: value` line format documented here.
- If a future template-file vs content conflict arises (both set → template wins), consider a warning in the settings UI; out of scope today.
- Reviewer: confirm the disable/re-enable state machine (translation section is the exemplar) and that no settings field lost its save handler in the refactor.
