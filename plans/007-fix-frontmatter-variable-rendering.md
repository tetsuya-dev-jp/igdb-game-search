# Plan 007: Fix frontmatter and variable rendering corruption in utils

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/utils/utils.ts src/utils/utils.test.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: 003 (its characterization tests lock current behavior; this plan flips the buggy assertions)
- **Category**: bug
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

Two bugs corrupt the plugin's core output — the frontmatter and body of every generated note:

1. `toStringFrontMatter` replaces `"` with the literal text `&quot;` inside quoted YAML values. YAML does not process HTML entities, so `&quot;` appears verbatim in the note. IGDB summaries regularly contain quotes → near-every generated note shows mangled frontmatter.
2. `replaceVariableSyntax` passes the replacement value as a *string* to `String.prototype.replace`, which interprets `$$`, `$&`, `` $` ``, `$'` in the replacement. Game titles/summaries containing those patterns (e.g. `Toy $' Story`) inject text into the note and then the leftover-placeholder strip pass deletes trailing content.
3. Adjacent hazard: a value containing a newline silently drops the **entire key** from the serialized frontmatter (no warning, no truncation).

Plan 003 characterized all three; this plan changes the behavior and updates the tests.

## Current state

`src/utils/utils.ts`:

- `replaceVariableSyntax` (lines ~56–70):
  ```ts
  return entries
    .reduce((result, [key, val = '']) => result.replace(new RegExp(`{{${key}}}`, 'ig'), String(val)), text)
    .replace(/{{\w+}}/gi, '')
    .trim();
  ```
- `toStringFrontMatter` (lines ~93–118):
  ```ts
  return Object.entries(frontMatter)
    .map(([key, value]) => {
      const newValue = value?.toString().trim() ?? '';
      if (/\r|\n/.test(newValue)) {
        return '';                       // <-- silently drops the whole key
      }
      if (/:\s/.test(newValue)) {
        return `${key}: "${newValue.replace(/"/g, '&quot;')}"\n`;  // <-- &quot; literal
      }
      return `${key}: ${newValue}\n`;
    })
    .join('')
    .trim();
  ```
- Keys are fixed `GameEntry` field names, so `new RegExp(\`{{${key}}}\`, 'ig')` is not user-injectable — only the *replacement value* is the problem.

Repo conventions: jest + ts-jest colocated tests, `@utils` alias, prettier 2-space, conventional commits. Plan 003's tests carry `// CURRENT (buggy) behavior — plan 007 changes this` markers on the assertions this plan flips.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/utils/utils.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/utils/utils.ts`
- `src/utils/utils.test.ts` (flip the 003 buggy assertions)

**Out of scope**:
- `src/utils/template.ts` (its own `{{date}}` engine — see plans/README.md rejected ARCH-03 note; do not touch).
- Everything else.

## Steps

### Step 1: Fix `replaceVariableSyntax`

Change the replacement argument from a string to a replacer function so `$` patterns in game data are treated literally, and replace the leftover-strip pass with a targeted one that removes only the *known GameEntry key* placeholders that failed to substitute (values can be empty), not arbitrary user `{{word}}` text:

```ts
const keys = Object.keys(game);
return entries
  .reduce((result, [key, val = '']) => result.replace(new RegExp(`{{${key}}}`, 'ig'), () => String(val ?? '')), text)
  .replace(new RegExp(`{{(?:${keys.join('|')})}}`, 'ig'), '')
  .trim();
```

Behavior decisions (honor them):
- `{{key}}` for a GameEntry key with an empty value → replaced with `''` (not left dangling).
- Unknown `{{word}}` placeholders (user's own template syntax, e.g. Templater) → **left in place** (previously stripped). This is the intended fix: the old strip deleted legitimate user content.
- Guard `keys.join` — if `keys` is empty, the regex `{{(?:)}}` is harmless but use `keys.length ? ... : text` for clarity.

**Verify**: `pnpm test src/utils/utils.test.ts` — the 003 `$`-corruption test now needs its expectation flipped (Step 3); run the suite and confirm the only failures are the ones you are about to update. Do not proceed until you understand each failure.

### Step 2: Fix `toStringFrontMatter`

- Keep the newline guard (a raw newline would break YAML) but make it **explicit**: truncate the value at the first newline and emit the line, instead of silently dropping the key. Add a `// values containing newlines are truncated at the first newline` comment.
- Replace `&quot;` escaping with proper double-quote escaping: `\"` inside double-quoted YAML scalars:
  ```ts
  return `${key}: "${newValue.replace(/"/g, '\\"')}"\n`;
  ```

**Verify**: same as Step 1 — remaining test failures should be only the 003 assertions marked for this plan.

### Step 3: Update the characterization tests

In `src/utils/utils.test.ts`, flip the three `// CURRENT (buggy) behavior — plan 007 changes this` groups to assert the **fixed** behavior:

- `$` patterns: `replaceVariableSyntax(game, '{{title}}')` with a title containing `$'`/`$&`/`$$` → the literal characters appear unchanged in the output.
- Unknown placeholder: `{{nonexistent}}` in the input → preserved verbatim (not stripped).
- Frontmatter quoting: a value containing `"` serializes with `\"` and round-trips through `parseFrontMatter` to the original string.
- Newline in value: the key is still emitted, truncated at the first newline (assert the truncated output; the original `newValue` had `\n`).
- Comment lines `# foo` in `parseFrontMatter`: leave the 003 assertion as-is (out of scope — parse behavior unchanged).
- Remove the `// CURRENT (buggy)` comments; the tests now encode the fixed contract.

**Verify**: `pnpm test src/utils/utils.test.ts` → all pass.

### Step 4: Full suite + commit

**Verify**: `pnpm test` and `pnpm lint` both exit 0. Then commit: `fix: escape frontmatter quotes and stop interpreting $ in variable substitution` (conventional commit). `git log -1 --oneline` matches; `git status` shows only the two in-scope files.

## Test plan

Updated cases in `src/utils/utils.test.ts` per Step 3. Add one round-trip case: `parseFrontMatter(toStringFrontMatter({ summary: 'He said "hi" then\ncontinued' }))` → `{ summary: 'He said "hi" then' }` (truncated at newline, quotes preserved).

## Done criteria

ALL must hold:

- [ ] `grep -n '&quot;' src/utils/utils.ts` → no match
- [ ] `replaceVariableSyntax` uses a replacer function for substitutions
- [ ] Unknown `{{...}}` placeholders survive `replaceVariableSyntax`
- [ ] `pnpm test` exits 0 (all suites, including 003's flipped cases)
- [ ] `pnpm lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A test outside the marked 003 groups fails after your change — that indicates an uncharacterized caller; report it instead of adjusting the caller.
- `template.ts` looks like it needs the same fix (it does use `{{}}` replacement too — that's plan 015's concern; the template engine is user-file input, different risk profile; leave it).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Behavior change for users: unknown placeholders like Templater's `{{date}}` in a **file-name format** now survive substitution → filenames can contain `{{...}}` that previously got stripped. `makeFileStem` sanitizes `{`/`}` via `replaceIllegalFileNameCharactersInString` (illegal-char list includes `{}`), so filenames stay safe; the settings preview (`settings.ts:115`) will show the raw placeholder — acceptable, and worth mentioning in the release notes.
- `applyDefaultFrontMatter`'s merge-append behavior is unchanged; frontmatter round-trip quality is now test-locked.
- Reviewer: confirm the newline-truncation choice (documented in a comment) is acceptable product behavior; the alternative (multiline YAML scalars) was rejected as scope creep.
