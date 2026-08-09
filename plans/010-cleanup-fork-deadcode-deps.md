# Plan 010: Remove fork dead code, dead dependencies, and contradictory config

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/utils/languages.ts src/utils/utils.ts src/settings/suggesters/FileNameFormatSuggester.ts package.json pnpm-lock.yaml jest.config.js .editorconfig tsconfig.json .versionrc .npmrc`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (verification must exist before deleting — the baseline proves nothing else used the removed code)
- **Category**: tech-debt
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

This plugin was forked from a book-search plugin (git history: `11ad941 feat: turn plugin into IGDB game search`). The fork left dead code, dead dependencies, and contradictory config that mislead every future contributor and add install weight to a plugin whose artifact is one bundled `main.js`:

1. `src/utils/languages.ts` (125 lines) — zero importers.
2. `isISBN` in `src/utils/utils.ts` — exported, zero callers (book-search leftover; ISBN is meaningless for games).
3. `{{author}}` suggestion in `FileNameFormatSuggester` — suggests a variable `GameEntry` doesn't have; it renders empty and gets stripped by `replaceVariableSyntax`.
4. `@popperjs/core`, `ts-node` devDependencies — zero imports/uses.
5. `deploy:pages` script + `gh-pages` — target a `pages/` dir that doesn't exist.
6. `@editor/(.*)` jest alias — no `src/editor/`.
7. Tag-prefix config in three places, two dead: `package.json` `"standard-version": { "t": "" }` (invalid key), `.npmrc` `tag-version-prefix=""` (read by `npm version`, not standard-version), `.versionrc` (the real config; currently no tagPrefix → default `v`). The changelog's `compare/0.1.0...0.2.0` links show releases are actually prefixless, so the intended config is `tagPrefix: ""`.
8. `.editorconfig` (tabs/4) contradicts `.prettierrc` (spaces/2).
9. `tsconfig.json` has `"noImplicitAny": false`.

## Current state

- `src/utils/languages.ts` — 125-line moment-locale map, exported constants, no imports from any other file (verified: `grep -rn "languages" src/` matches only itself and nothing imports `@utils/languages`).
- `src/utils/utils.ts:12-14`:
  ```ts
  export function isISBN(str: string) {
    return /^(97(8|9))?\d{9}(\d|X)$/.test(str);
  }
  ```
- `src/settings/suggesters/FileNameFormatSuggester.ts:9-10`:
  ```ts
  export const AUTHOR_SYNTAX = '{{author}}';
  export const AUTHOR_SYNTAX_SUGGEST_REGEX = /{{a?u?t?h?o?r?}?}?$/i;
  ```
  plus its use in `getSuggestions`/`processToken` (lines ~30, ~75+).
- `package.json`: `"standard-version": { "t": "" }` (lines 9–11), `"deploy:pages": "gh-pages -d pages"` (line 52), devDeps `@popperjs/core ^2.11.8` (line 43), `ts-node ^10.9.2` (line 59), `gh-pages ^4.0.0` (line 51).
- `jest.config.js:22`: `'@editor/(.*)': '<rootDir>/src/editor/$1',`.
- `.editorconfig:4-5`: `indent_style = tab`, `indent_size = 4` (vs `.prettierrc`: `useTabs: false`, `tabWidth: 2`).
- `tsconfig.json:9`: `"noImplicitAny": false`.
- `.versionrc`: standard-version config (bump files, commit/header types) without `tagPrefix`.
- `.npmrc`: `tag-version-prefix=""` only.

Repo conventions: `pnpm lint` (prettier check + eslint + tsc) is the gate; `pnpm install --frozen-lockfile` regenerates nothing (pnpm-lock.yaml must stay in sync — remove deps with `pnpm remove`, which updates the lockfile); conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Dep removal| `pnpm remove @popperjs/core ts-node gh-pages` | exit 0, lockfile updated |
| Tests     | `pnpm test`              | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/languages.ts` (delete)
- `src/utils/utils.ts` (remove `isISBN`)
- `src/settings/suggesters/FileNameFormatSuggester.ts` (remove author syntax + its processToken branch)
- `package.json` + `pnpm-lock.yaml` (remove deps, dead script, invalid standard-version key)
- `jest.config.js` (remove the `@editor` alias **if it is still present** — plan 002 replaces it with `@views`; if 002 already ran, this item is a no-op)
- `.versionrc` (add `"tagPrefix": ""`)
- `.npmrc` (delete — dead config, nothing else reads it)
- `.editorconfig` (align to spaces/2)
- `tsconfig.json` (`noImplicitAny: true` — and fix any surfaced type sites, only within the files listed)

**Out of scope**:
- `@views` jest alias (plan 002 owns it), `@popperjs`-adjacent anything else, src behavior changes, READMEs (plan 012/013 own docs).

## Steps

### Step 1: Delete dead code

- `rm src/utils/languages.ts`
- Remove `isISBN` from `src/utils/utils.ts`
- Remove `AUTHOR_SYNTAX`, `AUTHOR_SYNTAX_SUGGEST_REGEX`, and their branch in `getSuggestions`/`processToken` from `FileNameFormatSuggester.ts` (keep date/title syntax suggestions).

**Verify**: `grep -rn "isISBN\|languages'" src/` → no match; `grep -rn "author" src/settings/suggesters/` → no match.

### Step 2: Remove dead deps, script, invalid key

(Note: the jest `@editor` alias cleanup is handled here too if plan 002 has not run yet — its moduleNameMapper entry is dead either way. If 002 already replaced it with `@views`, do not touch `jest.config.js`.)

- `pnpm remove @popperjs/core ts-node gh-pages`
- Delete `"deploy:pages"` from `package.json` scripts.
- Replace `"standard-version": { "t": "" }` with nothing (delete the key) — the real config moves to `.versionrc` in Step 3.

**Verify**: `grep -n "popper\|ts-node\|gh-pages\|deploy:pages\|\"t\"" package.json` → no match; `pnpm-lock.yaml` no longer mentions popper/gh-pages/ts-node (`grep -c "popper" pnpm-lock.yaml` → 0).

### Step 3: Settle tag-prefix config

- In `.versionrc`, add `"tagPrefix": ""` (keep everything else).
- Delete `.npmrc`.

**Verify**: `grep -n "tagPrefix" .versionrc` → match; `.npmrc` gone; `grep -n "tag-version-prefix" .* --include=".npmrc"` → nothing (file absent).

### Step 4: Align editor + type config

- `.editorconfig`: set `indent_style = space`, `indent_size = 2`, `tab_width = 2` (match `.prettierrc`).
- `tsconfig.json`: set `"noImplicitAny": true`. Run `pnpm lint`; if tsc surfaces implicit-any errors, fix them by adding explicit types — **only** in the in-scope files; if an error appears in an out-of-scope file, STOP and report.

**Verify**: `pnpm lint` exits 0.

### Step 5: Full verification + commit

**Verify**: `pnpm test` exits 0; `pnpm build` exits 0 (the release pipeline's real gate). Commit: `chore: remove fork leftovers and align tooling config` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

No new tests — deletion proof is the greps above plus the full suite still passing. `isISBN` had no test; nothing else asserted its behavior.

## Done criteria

ALL must hold:

- [ ] `src/utils/languages.ts` deleted
- [ ] `grep -rn "isISBN\|AUTHOR_SYNTAX\|@editor\|deploy:pages" src/ package.json jest.config.js` → no matches
- [ ] `pnpm-lock.yaml` free of the removed packages
- [ ] `.versionrc` has `tagPrefix: ""`; `.npmrc` deleted
- [ ] `.editorconfig` and `.prettierrc` agree (spaces, 2)
- [ ] `tsconfig.json` has `noImplicitAny: true`; `pnpm lint` + `pnpm test` + `pnpm build` all exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any import of `@utils/languages` or `isISBN` exists that the recon missed (grep said none — if one appears at execution time, STOP: the "dead" code wasn't dead).
- `noImplicitAny: true` surfaces errors in files outside the scope list.
- `pnpm build` fails for a reason unrelated to the deletions.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The next `pnpm install --frozen-lockfile` in CI will pick up the slimmer lockfile automatically.
- Tag prefix is now configured in exactly one place (`.versionrc`). When the next release runs (`pnpm release`), tags should come out prefixless — verify with `standard-version --dry-run` before the real release.
- Reviewer: the `noImplicitAny` fallout is the only behavior-adjacent change — confirm every added type annotation is minimal and correct.
