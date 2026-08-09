# Plan 017: Fix {{time}} returning a date and add template-engine tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/utils/template.ts src/main.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

The template-file engine `applyTemplateTransformations` (used in `getRenderedContents` when a template file is configured, `src/main.ts`) accepts `{{date}}` and `{{time}}` tokens. But without an explicit format, **both** render `YYYY-MM-DD` — `{{time}}` renders a date, not a time. A user writing `{{time}}` in a game-note template gets the date string. The engine also has **zero test coverage**, which is why this shipped unnoticed (and why plan 016's sibling engine gets tests in the same pass).

## Current state

- `src/utils/template.ts:24-47` (verbatim):
  ```ts
  export function applyTemplateTransformations(rawTemplateContents: string): string {
    return rawTemplateContents.replace(
      /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
      (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
        const now = window.moment();
        const currentDate = window
          .moment()
          .clone()
          .set({
            hour: now.get('hour'),
            minute: now.get('minute'),
            second: now.get('second'),
          });
        if (calc) {
          currentDate.add(parseInt(timeDelta, 10), unit);
        }

        if (momentFormat) {
          return currentDate.format(momentFormat.substring(1).trim());
        }
        return currentDate.format('YYYY-MM-DD');
      },
    );
  }
  ```
  Two defects:
  1. `{{time}}` (no format) returns `YYYY-MM-DD` — should be a time (e.g. `HH:mm:ss`).
  2. The `now` + `clone().set({hour: now.get('hour'), ...})` block is a no-op: it re-sets the same time-of-day values the clone already has. The `now` variable is only used for those reads — the block can be deleted entirely, making the callback use a single `window.moment()`.
- Caller: `src/main.ts` `getRenderedContents` — `contentBody += replaceVariableSyntax(localizedGame, applyTemplateTransformations(templateContents));` (template transformations run BEFORE game-variable substitution, so `{{time}}` must not collide with `GameEntry` keys — it doesn't; GameEntry has no `time`/`date` keys).
- The engine requires `window.moment` — at runtime Obsidian injects it; in jest (jsdom) it does NOT exist. `src/utils/utils.test.ts` already solved this with a frozen-clock moment stub — read that setup (in the `dates` describe block) and reuse the same stub approach for the new `template.test.ts` (share by extracting if clean, or copy the small stub).
- Repo conventions: colocated `*.test.ts`, jest + ts-jest, `@utils` alias, `pnpm lint`/`pnpm test` gates (pnpm at `/tmp/pnpm-bin/pnpm` — `export PATH=/tmp/pnpm-bin:$PATH` first), conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/utils/template.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/template.ts`
- `src/utils/template.test.ts` (create)

**Out of scope**:
- `src/utils/utils.ts` — its `{{DATE}}` engine is plan 016's concern. Do NOT unify the two engines here (decision deferred — see index).
- `src/main.ts` and everything else.

## Steps

### Step 1: Fix the callback

In `src/utils/template.ts`, replace the callback body:

```ts
(_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
  const currentDate = window.moment();
  if (calc) {
    currentDate.add(parseInt(timeDelta, 10), unit);
  }
  if (momentFormat) {
    return currentDate.format(momentFormat.substring(1).trim());
  }
  return _timeOrDate.toLowerCase() === 'time' ? currentDate.format('HH:mm:ss') : currentDate.format('YYYY-MM-DD');
},
```

Behavior contract:
- `{{date}}` → `YYYY-MM-DD` (unchanged)
- `{{time}}` → `HH:mm:ss` (NEW — the fix)
- `{{date+1d}}` / `{{date-2d}}` → offset applied (unchanged; note this engine already supports negative offsets)
- `{{date:YYYY/MM/DD}}` / `{{time:HH:mm}}` → formatted (unchanged)
- Case-insensitive (`{{DATE}}` also matches — `gi` flag; the token group is lowercase-matched, keep as-is)

**Verify**: `pnpm lint` passes (tsc).

### Step 2: Create the test suite

Create `src/utils/template.test.ts` with the frozen-clock moment stub (mirror `utils.test.ts`'s dates block — frozen at `2026-01-15T12:00:00`):

- `{{date}}` → `2026-01-15`
- `{{time}}` → `12:00:00`
- `{{date+1d}}` → `2026-01-16`; `{{date-2d}}` → `2026-01-13`
- `{{date:YYYY/MM/DD}}` → `2026/01/15`; `{{time:HH:mm}}` → `12:00`
- `{{DATE}}` (uppercase) → `2026-01-15` (case-insensitivity)
- plain text without tokens → unchanged
- multiple tokens in one string → all replaced

If the moment stub in `utils.test.ts` is non-trivial (it is — ~20 lines), extract it to a shared helper `src/utils/test_helpers.ts` used by both suites ONLY if that keeps the diff clean; otherwise copy the stub. Prefer the smaller diff.

**Verify**: `pnpm test src/utils/template.test.ts` → all pass.

### Step 3: Full verification + commit

**Verify**: `pnpm test` → all suites pass (75 + new template cases); `pnpm lint` → exit 0. Commit: `fix: render {{time}} as a time in template files` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

Cases in Step 2. Structural pattern: the `dates` describe in `src/utils/utils.test.ts` (frozen-clock moment stub).

## Done criteria

ALL must hold:

- [ ] `{{time}}` renders `HH:mm:ss`-style output in tests; `{{date}}` unchanged
- [ ] Dead `now`/`set({...})` block removed from `applyTemplateTransformations`
- [ ] `src/utils/template.test.ts` exists with the Step-2 cases
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The moment stub in `utils.test.ts` turns out to be coupled to that file's internals in a way that can't be reused cleanly — copy it rather than refactor `utils.test.ts` (out of scope).
- A user-visible behavior in the README documents `{{time}}` differently (check the READMEs' template section first — if `{{time}}` is documented as returning a date, STOP and report the doc conflict).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- When plan 016 lands, the two engines both support negative offsets — the remaining difference is syntax (`{{DATE}}` vs `{{date}}`). The consolidation decision (ARCH-03) stays deferred in the index.
- If a future plan unifies the engines, `template.test.ts` is where the merged behavior gets locked.
- Reviewer: confirm `{{time:...}}` formatted output still works and that `_timeOrDate` is case-insensitive-safe (the regex token is `date|time` lowercase; `{{DATE}}` matches via the `i` flag and `_timeOrDate` will be `date`).
