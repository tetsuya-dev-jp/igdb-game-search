# Plan 016: Fix {{DATE-2}} negative offset silently failing in file-name dates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/utils/utils.ts src/utils/utils.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

The file-name date syntax `{{DATE±N}}` is a shipped, documented feature (the settings preview and `FileNameFormatSuggester` suggest `{{DATE}}`), but negative offsets are silently broken: `DATE_REGEX` is `/{{DATE(\+-?[0-9]+)?}}/` — the `+` is **literal and required**, so `{{DATE-2}}` never matches. The user's file name renders the literal text `DATE-2` (the `{{}}` braces are stripped later by `replaceIllegalFileNameCharactersInString`, leaving the raw `DATE-2` in the file name) with no error. Meanwhile `{{DATE+1}}` works and the formatted variant `{{DATE:YYYY-MM-DD-2}}` works (`(\+-?[0-9]+)?` after the format group allows a bare `-`), so the behavior is inconsistent across the two regexes. A characterization test currently locks the broken behavior in.

## Current state

- `src/utils/utils.ts:5-6`:
  ```ts
  export const DATE_REGEX = /{{DATE(\+-?[0-9]+)?}}/;
  export const DATE_REGEX_FORMATTED = /{{DATE:([^}\n\r+]*)(\+-?[0-9]+)?}}/;
  ```
- `src/utils/utils.ts:127-160` — `replaceDateInString(input)` runs a `while (DATE_REGEX.test(output))` loop replacing each match via `replacer(output, DATE_REGEX, getDate({ offset }))`, then a second loop for `DATE_REGEX_FORMATTED`. `getDate({ format?, offset? })` accepts negative offsets (`window.moment().add(duration)` with `moment.duration(offset, 'days')` — negative durations work).
- `src/utils/utils.test.ts:241-248` (characterization, from plan 003):
  ```ts
  it('applies day offsets to {{DATE+...}} but not {{DATE-...}}', () => {
    expect(utils.replaceDateInString('{{DATE+1}}')).toBe('2026-01-16');
    // Plan 003 expected {{DATE-2}} support, but the regex requires a literal `+`
    // (DATE_REGEX: /{{DATE(\+-?[0-9]+)?}}/), so a bare `-` offset is left untouched.
    ...
  ```
  The suite freezes time via a moment stub (see the `describe('dates')` block setup) — follow the existing pattern.
- Callers: `makeFileStem` (`utils.ts:17`) applies `replaceDateInString` to the file-name format; the settings preview (`src/settings/settings.ts`, `createFileNameFormatSetting`) renders `replaceDateInString(this.plugin.settings.fileNameFormat)`.
- Repo conventions: jest + ts-jest colocated tests, frozen-clock moment stub pattern already in `utils.test.ts`, conventional commits, `pnpm lint` + `pnpm test` as gates (PATH note: pnpm lives at `/tmp/pnpm-bin/pnpm` on this machine — `export PATH=/tmp/pnpm-bin:$PATH` first).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/utils/utils.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/utils.ts` (the two regexes only)
- `src/utils/utils.test.ts` (flip the locked assertion, add negative-offset cases)

**Out of scope**:
- `src/utils/template.ts` — its separate `{{date}}`/`{{time}}` engine is plan 017's concern. Do not touch.
- `replaceDateInString` loop logic, `getDate`, filename sanitization, any other file.

## Steps

### Step 1: Fix the regexes

In `src/utils/utils.ts`, make the sign optional in both regexes so bare negative offsets match, keeping the formatted variant's existing behavior:

```ts
export const DATE_REGEX = /{{DATE([+-]?\d+)?}}/;
export const DATE_REGEX_FORMATTED = /{{DATE:([^}\n\r]*?)([+-]?\d+)?}}/;
```

Careful with `DATE_REGEX_FORMATTED`: the current `[^}\n\r+]*` character class excludes `+` (that is what made `{{DATE:YYYY-MM-DD-2}}` work but `{{DATE:YYYY-MM-DD+2}}` fail at the format boundary — verify this asymmetry by testing both before/after). Design the replacement so that:
- `{{DATE-2}}` → date minus 2 days
- `{{DATE+2}}` → date plus 2 days
- `{{DATE:YYYY/MM/DD-7}}` → formatted date minus 7 days
- `{{DATE:YYYY-MM-DD+7}}` → formatted date plus 7 days
- `{{DATE}}` → unchanged behavior (today)
- Offset parsing in `replaceDateInString` (`utils.ts:130-160`): check how it strips the `+` (`dateMatch[1].replace('+', '')`) — with a bare `-` offset, `-2` must parse as `-2` (negative), not as `2`. Read the loop code and adjust the offset extraction to handle both signs correctly. `getDate` already handles negative durations.

**Verify**: `pnpm lint` passes; then a quick node check with the same frozen-clock approach as the test suite (or just proceed to Step 2 — the tests will prove it).

### Step 2: Flip and extend the tests

In `src/utils/utils.test.ts`:
- Replace the "but not {{DATE-...}}" test with negative-offset assertions: `{{DATE-2}}` → `2026-01-13` (frozen clock is 2026-01-15), `{{DATE+1}}` → `2026-01-16` (keep).
- Add formatted-variant asymmetry cases: `{{DATE:YYYY-MM-DD-7}}` → `2026-01-08`; `{{DATE:YYYY-MM-DD+7}}` → `2026-01-22`.
- Remove the stale plan-003 comment.

**Verify**: `pnpm test src/utils/utils.test.ts` → all pass, including the new negative-offset cases.

### Step 3: Full verification + commit

**Verify**: `pnpm test` → all suites pass (75 + new); `pnpm lint` → exit 0. Commit: `fix: support negative day offsets in {{DATE}} file-name syntax` (conventional commit). `git log -1 --oneline` matches; `git status` shows only the two in-scope files.

## Test plan

Cases listed in Step 2, in the existing `describe('dates')` block of `utils.test.ts`, following the frozen-clock stub pattern already in the file. Remove/update the characterization comment.

## Done criteria

ALL must hold:

- [ ] `{{DATE-2}}` renders a date 2 days before today in tests
- [ ] Both `{{DATE:...-N}}` and `{{DATE:...+N}}` work
- [ ] `grep -n "DATE_REGEX" src/utils/utils.ts` shows sign-optional regexes
- [ ] `pnpm test` and `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The offset-extraction loop in `replaceDateInString` turns out to handle signs in a way the plan doesn't describe (e.g. it also strips `-`) — read it first, and if a bare `-` cannot be preserved without restructuring the loop, STOP and report the structure you found.
- The formatted-regex change breaks `{{DATE:YYYY-MM-DD}}` (no offset) — that form must keep working.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Plan 017 touches the *other* date engine (`template.ts`); if both land, the `{{DATE}}` family (file names, this plan) and `{{date}}` family (template files, plan 017) stay separate — the consolidation decision is recorded in the index as deferred (ARCH-03).
- The settings preview (`settings.ts`) picks this fix up automatically since it calls `replaceDateInString`.
- Reviewer: confirm the sign handling in the loop matches `getDate`'s negative-duration support — this is the load-bearing part.
