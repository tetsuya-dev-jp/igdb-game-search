# Plan 003: Characterization tests for frontmatter, variable, and date utils

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/utils/utils.ts src/utils/utils.test.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 001, 002
- **Category**: tests
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

`src/utils/utils.ts` contains the functions that generate every game note's file name, frontmatter, and body — the plugin's core output. Today only the three filename helpers are tested (`makeFileName`/`makeFileStem`/`makeScreenshotFileName`); the YAML writers (`parseFrontMatter`, `toStringFrontMatter`, `applyDefaultFrontMatter`), variable substitution (`replaceVariableSyntax`), and date substitution (`replaceDateInString`) have zero coverage. Plan 007 will change the behavior of the YAML/variable functions (fixing `&quot;` literals and `$`-pattern corruption); these characterization tests must exist first so 007's behavior change is a deliberate diff, not an unmeasured rewrite.

## Current state

All functions below live in `src/utils/utils.ts` (verify line numbers on the live file):

- `makeFileStem(game, fileNameFormat?)` (lines ~20–26): applies `replaceDateInString` then `replaceVariableSyntax` to the format, falls back to `game.title`, then strips illegal filename characters via `replaceIllegalFileNameCharactersInString` (`/[\ ,#%&{}/*<>$":@.?|]/g` removed, whitespace collapsed).
- `replaceVariableSyntax(game, text)` (lines ~56–70): replaces each `{{key}}` for every `GameEntry` key with `String(val)`, then strips any remaining `{{word}}` with `/{{\w+}}/gi`.
- `parseFrontMatter(frontMatterString)` (lines ~73–90): naive `indexOf(':')` per line split.
- `toStringFrontMatter(frontMatter)` (lines ~93–118): emits `key: value` lines; values containing `\r`/`\n` drop the whole key; values containing `"` or `": "` get wrapped in double quotes with `"` replaced by the literal `&quot;`.
- `applyDefaultFrontMatter(game, frontmatter, keyType)` (lines ~36–52): starts from the game entry (camel or snake keys per `DefaultFrontmatterKeyType`), merges extra frontmatter; conflicting keys become `"existing, new"`.
- `replaceDateInString(input)` (lines ~121–160): replaces `{{DATE}}`, `{{DATE±N}}`, `{{DATE:format}}`, `{{DATE:format±N}}` using `window.moment()`; exports `NUMBER_REGEX`, `DATE_REGEX`, `DATE_REGEX_FORMATTED`.
- `getDate({format?, offset?})` (lines ~162+): moment-based date helper.
- Existing tests: `src/utils/utils.test.ts` covers filename helpers only. Test style: `describe`/`it` + `expect` (jest, ts-jest). The suite currently has `jest.mock('@settings/settings', ...)` — plan 002 fixed that; this plan's tests can rely on the real module.

Repo conventions: jest + ts-jest, jsdom env, tests colocated under `src/`, prettier 2-space.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test`              | all pass |
| One suite | `pnpm test src/utils/utils.test.ts` | pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/utils.test.ts` (add cases)

**Out of scope**:
- `src/utils/utils.ts` — do NOT modify runtime code in this plan (that's 007's job).
- Other test files, `src/` runtime files, configs.

## Steps

### Step 1: Add `applyDefaultFrontMatter` + `changeSnakeCase` cases

Using a minimal fixture game (e.g. `{ title: 'Elden Ring', developer: 'FromSoftware', genre: 'RPG' }` as `GameEntry`):

- camelCase key type → keys appear as `title`, `developer`, `genre` (top-level string values only; use a fixture whose fields are all strings or arrays of strings to avoid undefined-handling noise).
- snakeCase key type → keys appear as `title`, `developer`, `genre` still (no multi-word keys in the fixture) — instead use a key that exercises `camelToSnakeCase` (e.g. include `releaseYear`/`firstReleaseDate`-style field present in `GameEntry`; `GameEntry` has `releaseYear`, `ratingCount`, `totalRatingCount` etc. — check `src/models/game.model.ts` for the exact field names and pick one with an uppercase letter; verify `changeSnakeCase` output, e.g. `rating_count`).
- Extra frontmatter merge: passing `{ platform: 'PC' }` as extra where the game already has `platform` → value becomes `"<existing>, PC"`; passing a new key → appended; passing the same value → unchanged.
- Passing a YAML string (e.g. `"genre: Action"`) as the extra-frontmatter arg → parsed via `parseFrontMatter` and merged.

**Verify**: `pnpm test src/utils/utils.test.ts` → new cases pass (they should pass against current code — this is characterization of correct behavior).

### Step 2: Add `parseFrontMatter` / `toStringFrontMatter` round-trip cases

- Round-trip plain values: `{ title: 'Elden Ring', rating: '92' }` → serialize → parse → same object.
- Values containing `": "` (colon-space, e.g. `website: https://example.com/x: y`) → key is quoted (assert the serialized string contains `"` around the value — assert exact current output; note in a comment which assertions are "current behavior, fixed by plan 007").
- Empty string value → emitted as `key: `.
- Comment line `# foo` → parse yields a `# foo` key with empty value (current behavior — assert it, comment "behavior to revisit in 007").
- Values containing newline → the whole key line is dropped from serialization (assert current behavior, comment "buggy, fixed in 007").

Mark every assertion that encodes buggy behavior with a comment `// CURRENT (buggy) behavior — plan 007 changes this`. Do NOT "fix" the expectations to what you think is right.

**Verify**: suite passes with the new cases.

### Step 3: Add `replaceVariableSyntax` cases

- `{{title}}` replaced with the game title.
- Unknown placeholder `{{nonexistent}}` → stripped from output (current behavior).
- Text with no placeholders → unchanged.
- Value containing `$` (e.g. title `Toy $' Story`): assert **current behavior exactly** (the `$'` is interpreted by `String.replace`). Run the assertion against the live code and record what it produces — do not guess; if the produced string surprises you, that is the point. Comment: `// CURRENT behavior — plan 007 fixes $ interpretation`.
- Empty text / whitespace-only text → `''`.

**Verify**: suite passes.

### Step 4: Add `replaceDateInString` cases

Use `window.moment` (available in jsdom env — the function already relies on it). Freeze time inside the test with `jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00'))` and restore with `jest.useRealTimers()` in `afterEach` (check existing suite for timer usage; add cleanup).

- `{{DATE}}` → `2026-01-15`.
- `{{DATE+1}}` → `2026-01-16`; `{{DATE-2}}` → `2026-01-13`.
- `{{DATE:YYYY/MM/DD}}` → `2026/01/15`.
- `{{DATE:YYYY-MM-DD+7}}` → `2026-01-22`.
- No placeholder → input unchanged.
- `getDate({ format: 'YYYY-MM-DD', offset: 3 })` → `2026-01-18`.

**Verify**: suite passes.

### Step 5: Commit

`test: characterize frontmatter, variable and date utils` (repo convention: conventional commits).

**Verify**: `git log -1 --oneline` matches; `git status` shows only `src/utils/utils.test.ts` changed.

## Test plan

New cases in `src/utils/utils.test.ts`, organized in `describe` blocks per function (`applyDefaultFrontMatter`, `parseFrontMatter`/`toStringFrontMatter`, `replaceVariableSyntax`, `replaceDateInString`). Pattern: existing filename tests in the same file. Buggy-behavior assertions carry the `// CURRENT (buggy) behavior — plan 007 changes this` comment.

## Done criteria

ALL must hold:

- [ ] `pnpm test src/utils/utils.test.ts` passes with the new describes
- [ ] `pnpm lint` exits 0
- [ ] `grep -n "plan 007" src/utils/utils.test.ts` finds at least the three buggy-behavior markers (frontmatter quoting, newline drop, `$` replacement)
- [ ] `git diff --stat` shows no changes to `src/utils/utils.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A Step 2–4 assertion fails against current code (that means your expectation of "current behavior" was wrong — do not weaken the test to pass; report the actual output instead).
- The live file structure doesn't match the excerpt (function moved/renamed).
- You find yourself wanting to edit `src/utils/utils.ts` to make a test pass — that is plan 007's scope.

## Maintenance notes

- Plan 007 will flip the `// CURRENT (buggy)` assertions; this plan's comments are the map for that diff.
- When `GameEntry` gains fields (e.g. plan 015's `similarGames`), `replaceVariableSyntax` substitution tests should add a case for the new key.
- Reviewer: confirm no test encodes a *guessed* expectation — every assertion here must have been observed against live code.
