# Plan 020: Unify locale detection into one shared helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/utils/i18n.ts src/utils/deepl_languages.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

Locale detection is implemented twice with near-identical logic: `detectLocale()` in `src/utils/i18n.ts` (added by plan 014's spike) and `getCurrentLocale()` in `src/utils/deepl_languages.ts` (used by DeepL target-language resolution). Two copies of the same moment→navigator fallback will drift — e.g., a future change (Obsidian's `getLanguage()` API, which the 014 design doc recommends) would have to touch both. One shared helper, two callers.

## Current state

- `src/utils/i18n.ts:28-42` (verbatim):
  ```ts
  export function detectLocale(): string {
    const momentLocale = (
      globalThis.window as (Window & { moment?: { locale?: () => string } }) | undefined
    )?.moment?.locale?.();
    if (typeof momentLocale === 'string' && momentLocale.trim()) {
      return momentLocale;
    }
    const navigatorLocale = globalThis.navigator?.language;
    if (typeof navigatorLocale === 'string' && navigatorLocale.trim()) {
      return navigatorLocale;
    }
    return '';
  }
  ```
- `src/utils/deepl_languages.ts:115-128` — `getCurrentLocale()` is the same body (moment.locale → navigator.language → `''`), module-private.
- `src/utils/i18n.test.ts` — has a detection test (`expect(typeof detectLocale()).toBe('string')`).
- Note: the DeepL locale *mapping* (`mapLocaleToDeepLTargetLanguage`, `LOCALE_TO_DEEPL_TARGET_LANGUAGE`) stays in `deepl_languages.ts` — only the raw detection moves.
- Repo conventions: colocated tests, `pnpm lint`/`pnpm test` gates (pnpm at `/tmp/pnpm-bin/pnpm`), conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/utils`    | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/i18n.ts` (export the shared detector)
- `src/utils/deepl_languages.ts` (use it)

**Out of scope**:
- `i18n.ts`'s `t()`/string maps, `deepl_languages.ts`'s language maps, the 014 design doc, any other file.

## Steps

### Step 1: Extract the shared detector

Keep the public surface stable. In `src/utils/i18n.ts`, the exported `detectLocale` already IS the shared logic — so the unification direction is: `deepl_languages.ts` imports `detectLocale` from `@utils/i18n` and deletes its private `getCurrentLocale`, replacing the call site:

- `src/utils/deepl_languages.ts:95` — `return mapLocaleToDeepLTargetLanguage(getCurrentLocale());` becomes `return mapLocaleToDeepLTargetLanguage(detectLocale());`
- Delete `getCurrentLocale` (lines ~115-128) and add the import.

Do NOT move `detectLocale` elsewhere and do NOT rename it — the plan's goal is one definition, and `detectLocale` is already the exported one. (`deepl_languages.ts` is imported by `deepl_api.ts`; check it doesn't already import from `@utils/i18n` — if it would create a cycle, verify: `i18n.ts` imports nothing from `deepl_languages.ts`, so no cycle.)

**Verify**: `pnpm lint` passes (tsc + eslint).

### Step 2: Verify the suites

**Verify**: `pnpm test src/utils` → all pass (i18n.test.ts's detection test and deepl-related suites included; nothing behavioral changed).

### Step 3: Full verification + commit

**Verify**: `pnpm test` → all suites pass; `pnpm lint` → exit 0. Commit: `refactor: share locale detection between i18n and DeepL resolution` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

No new tests — existing suites cover both call sites (`i18n.test.ts` detection test; DeepL tests run the locale resolution path). Verification is the suites staying green.

## Done criteria

ALL must hold:

- [ ] `grep -n "getCurrentLocale" src/utils/deepl_languages.ts` → no match
- [ ] `deepl_languages.ts` calls `detectLocale` from `@utils/i18n`
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Importing `@utils/i18n` from `deepl_languages.ts` creates a circular import (it shouldn't — `i18n.ts` has no imports from the repo; verify first).
- The `i18n.test.ts` detection test relies on `detectLocale`'s exact behavior in a way the change affects (it shouldn't — behavior is identical).

## Maintenance notes

- The 014 design doc (`docs/design/i18n.md`) recommends moving to Obsidian's official `getLanguage()` eventually — with one shared detector, that migration is a single-function change.
- Reviewer: confirm no behavior change — the unified function is the same body as the two originals.
