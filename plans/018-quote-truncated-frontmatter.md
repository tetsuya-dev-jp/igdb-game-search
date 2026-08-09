# Plan 018: Quote truncated frontmatter values so newline handling never emits invalid YAML

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/utils/utils.ts src/utils/utils.test.ts src/main.test.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

Plan 007 changed `toStringFrontMatter` so values containing newlines are truncated to the first line instead of silently dropping the whole key. But the truncation branch emits the first line **unquoted** (`${key}: ${firstLine}`). A first line containing `: ` (colon-space — common in real sentences, e.g. `Note: this game...`) produces `key: Note: this game...`, which is not a valid YAML plain scalar: in block mappings a plain scalar may not contain `: `, so strict parsers reject the line (or mis-parse it), and Obsidian's frontmatter parser drops or corrupts the key. The value-quoting branch (the `if (/:\s/.test(newValue))` path) exists right below — the truncation branch must use the same quoting rules on its truncated line.

## Current state

- `src/utils/utils.ts:98-109` (verbatim, post-007):
  ```ts
  return Object.entries(frontMatter)
    .map(([key, value]) => {
      const newValue = value?.toString().trim() ?? '';
      if (/\r|\n/.test(newValue)) {
        // values containing newlines are truncated at the first newline
        return `${key}: ${newValue.split(/\r|\n/)[0].trim()}\n`;   // <-- unquoted
      }
      if (/:\s/.test(newValue)) {
        return `${key}: "${newValue.replace(/"/g, '\\"')}"\n`;     // <-- quoted, 007 fix
      }
      return `${key}: ${newValue}\n`;
    })
    .join('')
    .trim();
  ```
- `src/utils/utils.test.ts` — plan 003/007 flipped a truncation case: it asserts the key is emitted truncated at the first newline (e.g. `summary: He said "hi" then` after a `\ncontinued`). Check the exact current assertion before changing behavior.
- `src/main.test.ts` — `getRenderedContents` tests assert frontmatter output shape; verify they don't break (they use newline-free fixtures, so they shouldn't).
- Repo conventions: colocated tests, `pnpm lint`/`pnpm test` gates (pnpm at `/tmp/pnpm-bin/pnpm`), conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/utils/utils.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/utils.ts` (the truncation branch only)
- `src/utils/utils.test.ts` (extend the truncation cases)

**Out of scope**:
- The quoting branch, `parseFrontMatter`, multiline YAML scalars (deliberately rejected — see maintenance notes), plan 016/017 files.

## Steps

### Step 1: Route the truncated line through the same quoting logic

Rewrite the truncation branch to apply the same quote-if-needed rule as the normal path. Cleanest shape: extract the "emit one line with quoting" logic so both branches share it:

```ts
const emitLine = (value: string): string => {
  if (/:\s/.test(value)) {
    return `${key}: "${value.replace(/"/g, '\\"')}"\n`;
  }
  return `${key}: ${value}\n`;
};
```

then the truncation branch becomes:

```ts
if (/\r|\n/.test(newValue)) {
  // values containing newlines are truncated at the first newline
  return emitLine(newValue.split(/\r|\n/)[0].trim());
}
```

and the existing quoting branch calls `emitLine(newValue)` too. Behavior changes: truncated first lines containing `: ` are now double-quoted (with `\"` escaping) — valid YAML. Lines without `: ` stay plain (no output diff for the common case).

**Verify**: `pnpm lint` passes.

### Step 2: Extend the tests

In `src/utils/utils.test.ts`, in the frontmatter describe block:

- `toStringFrontMatter({ summary: 'Note: first line\ncontinued' })` → contains `summary: "Note: first line"` (quoted, truncated, escaped as needed)
- `toStringFrontMatter({ summary: 'He said "hi"\ncontinued' })` → `summary: "He said \"hi\""` (truncated + quote-escaped — combined case)
- Keep the existing plain truncation case (`summary: plain text\nmore` → `summary: plain text`) passing unchanged
- Round-trip: `parseFrontMatter(toStringFrontMatter({ summary: 'Note: a\nb' }))` → `{ summary: 'Note: a' }`

**Verify**: `pnpm test src/utils/utils.test.ts` → all pass.

### Step 3: Full verification + commit

**Verify**: `pnpm test` → all suites pass; `pnpm lint` → exit 0. Commit: `fix: quote truncated frontmatter values containing colons` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

Cases in Step 2. Pattern: existing `parseFrontMatter`/`toStringFrontMatter` describes in `utils.test.ts`.

## Done criteria

ALL must hold:

- [ ] Truncated first lines containing `: ` are emitted double-quoted with `\"` escaping
- [ ] Plain truncated lines keep their current unquoted output (no diff)
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The existing truncation test (from 003/007) asserts a different shape than the plan assumes — read it first and adapt the plan's expectations to the actual assertion (the plan's intent is: truncated lines must be YAML-valid; quoting only when needed).
- `main.test.ts`'s render assertions break (they shouldn't — fixtures are newline-free; if one breaks, report rather than weaken it).

## Maintenance notes

- Multiline YAML scalars (`|-` blocks) were deliberately rejected in plan 007 as scope creep; this plan keeps that decision — truncation + quoting, not multiline support.
- If Obsidian's frontmatter parser turns out to accept `key: a: b` leniently, the quoting is still harmless (valid YAML either way) — no need to revisit.
- Reviewer: confirm the shared `emitLine` keeps the exact quoting rules of the 007 fix (`\"` escaping, no `&quot;`).
