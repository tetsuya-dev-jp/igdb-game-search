# Plan 014: i18n design spike — localize the plugin UI strings

> **Executor instructions**: This is a **design/spike plan**, not a
> build-everything plan. The deliverable is a short design document plus (at
> most) a proof-of-concept of the string mechanism. Follow this plan step by
> step. Run every verification command and confirm the expected result before
> moving on. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/`
> If anything changed since plan time, note it in your report (this spike is
> low-risk to the codebase either way).

## Status

- **Priority**: P3
- **Effort**: M (spike: S)
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The repo ships trilingual READMEs (en/ja/ko — `README.md`, `README.ja.md`, `README.ko.md`) but the plugin UI is English-only: modal buttons (`SEARCH_BUTTON_TEXT = 'Search'` in `src/views/game_search_modal.ts:11-12`), command names (`'Create new game note'`, `'Insert metadata'` in `src/main.ts:60,71`), and every `setName`/`setDesc` in `src/settings/settings.ts` (~40 strings). Japanese/Korean users who arrive through the localized READMEs get an English-only tool. The plugin already detects the user's locale for DeepL (`getCurrentLocale` in `src/utils/deepl_languages.ts` reads `moment.locale()` then `navigator.language`), so the detection infrastructure exists. Obsidian has no official i18n API — a local locale→string map is the standard approach. This spike decides: mechanism, string inventory, scope (which surfaces first), and a migration order that doesn't churn every file at once.

## Current state

- String surfaces (verified locations):
  - `src/main.ts:60` — `'Create new game note'` (command + ribbon)
  - `src/main.ts:71` — `'Insert metadata'` (command)
  - `src/views/game_search_modal.ts:11-12` — `SEARCH_BUTTON_TEXT`, `REQUESTING_BUTTON_TEXT`; plus heading `'Search game'`, placeholder `'Search by game title'`, notices `'No query entered.'`, `'No results found for "..."'`
  - `src/settings/settings.ts` — every `setName`/`setDesc` across the six sections (~40 strings, sentence-case labels per `afc65de`)
  - `src/main.ts` notices (`'Please set your Twitch...'` etc. come from `ConfigurationError` messages in `src/apis/igdb_api.ts`/`src/apis/deepl_api.ts` — error strings are a separate decision: localize user-facing errors or leave errors in English)
- Locale detection precedent: `getCurrentLocale()` in `src/utils/deepl_languages.ts` (moment locale → navigator.language → `''`); `mapLocaleToDeepLTargetLanguage` normalizes locale tags. A UI-string module can reuse this exact normalization approach.
- DeepL auto-language setting uses the same detection at runtime — the plugin already assumes the user's UI language follows the vault's Obsidian language.
- No i18n dependency installed; Obsidian core plugins (e.g. Templates) don't offer an i18n API to reuse.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test`              | all pass (unchanged) |
| Lint      | `pnpm lint`              | exit 0 |
| Build     | `pnpm build`             | exit 0 |

## Scope

**In scope (spike artifacts)**:
- `docs/design/i18n.md` (create — the design document; follow the repo's `docs/` convention; `docs/agents/` exists from the setup skill, so `docs/design/` is the natural home)
- Optionally a tiny proof-of-concept: `src/utils/i18n.ts` with a `t(key)`/`t(key, locale?)` function and en strings only, wired into **one** surface (recommended: `game_search_modal.ts`) behind a settings toggle **off by default** — OR no code at all if the design concludes English-only for now. The spike's job is to decide; code is optional.

**Out of scope**:
- Translating all 40+ strings (that's the follow-up implementation, planned from this spike's output).
- README changes, new dependencies, changing `getCurrentLocale`.

## Steps

### Step 1: Inventory the strings

Grep all user-facing strings in `src/` (`grep -rn "'[A-Z][^']*'" src/ --include="*.ts"` and scan `settings.ts` setName/setDesc). Produce the inventory table (surface, string, current language, notes) inside the design doc — target ~40–50 strings, grouped by surface (commands, modals, settings sections, notices/errors).

**Verify**: the inventory lists every surface named in "Current state" above and nothing outside `src/`.

### Step 2: Decide the mechanism

In `docs/design/i18n.md`, compare (one short section each, then a recommendation):

1. **Local string map + locale detection** (reuse `getCurrentLocale`-style normalization; `src/utils/i18n.ts` exporting `t(key)`; en fallback; ja/ko maps added later). Pros: zero deps, matches Obsidian ecosystem norms. Cons: strings still compiled into the bundle; contributors must keep maps in sync.
2. **Obsidian community convention** (check how other popular community plugins do it — e.g. look at 2–3 installed or top community plugins' i18n approach via a quick web search if useful; note what you find).
3. **English-only + settings override** (keep English, let users pick a UI language manually — no auto-detection).

Recommend one, with rationale tied to this repo's constraints (small plugin, trilingual README maintenance already, DeepL locale detection precedent).

**Verify**: the doc contains the comparison and an explicit recommendation with a one-line rationale each.

### Step 3: Scope the first slice

Define the migration order (commands + search modal first — highest user visibility; settings tab second; error messages last, with a decision on whether `ConfigurationError` messages stay English). Define what the follow-up implementation plan (to be written after this spike) must include: string-map file layout, test expectations (a `t()` unit test asserting fallback behavior), and a README note for contributors.

**Verify**: the doc lists the slice order and the follow-up plan's required contents.

### Step 4: Optional proof-of-concept

If the recommendation is the local-map mechanism: implement `src/utils/i18n.ts` (en map only, `t(key)` with locale detection + fallback) and wire it into `game_search_modal.ts`'s `SEARCH_BUTTON_TEXT`/`REQUESTING_BUTTON_TEXT`/heading, keeping behavior identical for en. Add a tiny unit test (`src/utils/i18n.test.ts`): `t('search')` returns the en string with an en locale; with a ja locale and no ja map, falls back to en. If the recommendation is English-only, skip this step and say so in the doc.

**Verify**: `pnpm test` + `pnpm lint` + `pnpm build` all exit 0.

### Step 5: Commit

`docs: i18n design spike for UI strings` (or `chore:` if it includes the PoC — match the dominant `docs:`/`chore:` convention; `git log` shows both).

**Verify**: `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

Only the PoC test from Step 4 (if code was written). The spike itself is verified by the doc's completeness.

## Done criteria

ALL must hold:

- [ ] `docs/design/i18n.md` exists with: string inventory, mechanism comparison + recommendation, slice order, follow-up plan requirements
- [ ] Every string surface from "Current state" appears in the inventory
- [ ] If PoC code was written: `pnpm test`/`lint`/`build` pass and behavior is unchanged for en
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- You find an official Obsidian i18n API that changes the mechanism decision — incorporate it and note the source.
- The PoC's locale detection in the jsdom test environment behaves unexpectedly (moment locale vs navigator.language) — mock the detector in the test instead of fighting it.

## Maintenance notes

- The follow-up implementation plan (written after this spike, by the maintainer or next improve run) should cite `docs/design/i18n.md` as its source.
- Trilingual README sync (repo convention) means each new setting/command should get its UI string keys planned at the same time as its README row — note this coordination rule in the design doc.
- Reviewer: the recommendation must be honest — if English-only + manual override is the pragmatic call for a solo-maintained plugin, the doc should say that plainly rather than gold-plating.
