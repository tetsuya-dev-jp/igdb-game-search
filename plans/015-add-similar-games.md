# Plan 015: Add IGDB `similar_games` to GameEntry and the template surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/apis/igdb_api.ts src/models/game.model.ts src/utils/utils.ts src/utils/utils.test.ts README.md README.ja.md README.ko.md`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 001 (tests must run); 007 (variable substitution must be sane before new variables surface — 007 already landed by this point in the order)
- **Category**: direction
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The IGDB query already fetches `franchises.name`, `collections.name`, platforms/genres/themes/modes/perspectives — but not `similar_games`. IGDB's similar-games data is one field away and gives users a natural "if you liked X" section in game notes. Today users hand-assemble that from IGDB web pages. This plan adds the field end to end: query → model → template variable → docs.

## Current state

- `src/apis/igdb_api.ts` `buildSearchBody` (lines ~65–90): fields array ends with `..., 'websites.url']` — no `similar_games`. `createGameEntry` (lines ~103–140) maps fields to `GameEntry`; arrays of `{ name: string }` are normalized via `toNames` (lines ~187–190) and joined via `joinList` (e.g. `platform: this.joinList(platforms)`, `platforms`).
- `src/models/game.model.ts` `GameEntry`: has `genre/genres`, `theme/themes`, `platform/platforms`, `developer/developers`, `publisher/publishers`, `gameMode/gameModes` style pairs (verify the exact pair names on the live file — the scalar is the joined string, the plural is the array).
- IGDB response shape for the field: `similar_games: Array<{ id: number; name: string }>` (verify against `src/apis/models/igdb_response.ts` — `IgdbGame` interface; add the field to the interface if missing).
- Template variables: `replaceVariableSyntax` (src/utils/utils.ts) substitutes any `{{<GameEntry key>}}`; the READMEs document the variable table (plan 012 touched the READMEs' sections — the variable table is separate, near the template/settings section; locate it per file).
- `IGDB_GAMES_URL` result mapping: `results.map(result => this.createGameEntry(result))`.

Repo conventions: `toNames`/`joinList` for array fields; pair naming (`platform` = joined, `platforms` = array); tests colocated (igdb_api.test.ts has `createGameEntry` cases to extend); READMEs in 3 languages kept in sync; conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/apis/igdb_api.test.ts src/utils/utils.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/apis/models/igdb_response.ts` (add `similar_games` to `IgdbGame`)
- `src/apis/igdb_api.ts` (fields list + `createGameEntry`)
- `src/models/game.model.ts` (`GameEntry` pair: `similarGames?: string[]` + `similarGame?: string` — verify the naming style first: the singular scalar is `joinList`ed, e.g. `genre` vs `genres`)
- `src/apis/igdb_api.test.ts` (extend `createGameEntry` case)
- `src/utils/utils.test.ts` (one `replaceVariableSyntax` case with the new key, if a fixtures-style game is used there)
- `README.md`, `README.ja.md`, `README.ko.md` (variable table rows)

**Out of scope**:
- `similar_games` → link generation or game pages (`igdbUrl` already covers linking out), any change to search/`where` clauses, `gameSuggests`, performance work.

## Steps

### Step 1: Add the field to the IGDB query and model

- `igdb_response.ts`: add `similar_games?: Array<{ id: number; name: string }>;` to `IgdbGame` (match the style of `platforms`/`genres` entries in that interface — read it first).
- `igdb_api.ts` `buildSearchBody`: add `'similar_games.name'` to the fields list.
- `igdb_api.ts` `createGameEntry`: `const similarGames = this.toNames(game.similar_games);` then emit `similarGames` and the joined scalar, following the existing pair pattern exactly (read the `genre`/`genres` lines and mirror them, including which one the README documents).

**Verify**: `pnpm lint` passes.

### Step 2: Add `GameEntry` fields

`src/models/game.model.ts`: add `similarGame?: string;` and `similarGames?: string[];` following the naming the live model uses for other pairs (if the model uses `genre` + `genres`, use `similarGame` + `similarGames`; if it uses only plural for some fields, match that).

**Verify**: `pnpm lint` passes.

### Step 3: Extend the tests

- `src/apis/igdb_api.test.ts`: extend the existing `createGameEntry` case(s) — the fixture `IgdbGame` input gains `similar_games: [{ id: 1, name: 'Dark Souls' }, { id: 2, name: 'Bloodborne' }]`; assert `similarGames` array and the joined scalar.
- `src/utils/utils.test.ts`: if a `replaceVariableSyntax` fixture game exists, add `similarGames` to it and assert `{{similarGames}}` substitutes (this guards the template surface; skip if the suite's fixture style doesn't fit — note the decision).

**Verify**: `pnpm test src/apis/igdb_api.test.ts src/utils/utils.test.ts` → all pass.

### Step 4: Document the variable (3 READMEs)

Locate the template-variable table in each README (it documents variables like `{{genre}}`/`{{platforms}}` — grep `{{` per file). Add a row for `{{similarGame}}` (and `{{similarGames}}` if the table lists array variables) with a one-line description ("Similar games, comma-separated" / "List of similar games"). Keep the three files parallel.

**Verify**: `grep -n "similarGame" README.md README.ja.md README.ko.md` → one match per file.

### Step 5: Commit

`feat: fetch IGDB similar games into game notes` (conventional commit; matches `feat:` history).

**Verify**: `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

Step 3 cases. Pattern: existing `createGameEntry` describe in `igdb_api.test.ts`.

## Done criteria

ALL must hold:

- [ ] `similar_games.name` in the IGDB fields list
- [ ] `GameEntry` has the pair fields; `createGameEntry` populates them via `toNames`
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] All three READMEs document the new variable(s)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live `IgdbGame` interface or `GameEntry` naming style differs from the pairs described (e.g. no scalar/plural pairing) — mirror what actually exists and note the divergence.
- IGDB returns `similar_games` in a shape other than `{ id, name }[]` (check the models file — the interface is the contract; if it's already typed differently, adapt to the existing type).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Payload grows slightly per search (one extra nested field, capped by the existing `limit 20`) — negligible.
- If a future plan adds link lists (`[name](url)`), `similarGame` rows should switch to the linked form — today they're plain text to match `genre`/`platform` rows.
- Reviewer: confirm the README rows match the actual variable names after 007's substitution changes (unknown placeholders now survive, so an incorrectly named variable would surface as literal text in user notes — the tests in Step 3 are the guard).
