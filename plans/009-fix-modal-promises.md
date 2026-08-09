# Plan 009: Fix modal dismissal leaving promises pending forever

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/main.ts src/views/game_search_modal.ts src/views/game_suggest_modal.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: bug
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The search flow is promise-driven but never settles on cancellation:

- `openGameSearchModal` / `openGameSuggestModal` (src/main.ts:284–305) wrap the modal's callback in a `Promise` that only resolves when `callback` fires.
- `GameSearchModal.onClose` only empties `contentEl` — no callback. `GameSuggestModal` never overrides `onClose`, and its only callback path is `onChooseSuggestion`.
- So **closing either modal (Esc / click-away) leaves the awaiting promise pending forever**: `createNewGameNote` hangs silently (the user sees nothing happen), and repeated cancelled opens accumulate dangling promise chains.
- Worse: pressing Esc **during an in-flight IGDB search** doesn't cancel — the request completes, `callback` fires anyway, and the suggest modal pops open against the user's explicit cancel.

## Current state

- `src/main.ts` (lines ~284–305):
  ```ts
  async openGameSearchModal(query = ''): Promise<GameEntry[]> {
    return new Promise((resolve, reject) => {
      const modal = new GameSearchModal(this, query, (error, results) => {
        return error ? reject(error) : resolve(results);
      });
      modal.open();
    });
  }
  async openGameSuggestModal(games: GameEntry[]): Promise<GameEntry> {
    return new Promise((resolve, reject) => {
      const modal = new GameSuggestModal(this.app, this.settings.showCoverImageInSearch, games, (error, selectedGame) => {
        return error ? reject(error) : resolve(selectedGame);
      });
      modal.open();
    });
  }
  ```
- `src/views/game_search_modal.ts`: `onOpen` builds the input + Search button; `onClose() { this.contentEl.empty(); }`; `searchGame()` (async, sets `isBusy`, calls `this.igdbApi.getByQuery`, on success `this.callback(null, searchResults)` then `this.close()`).
- `src/views/game_suggest_modal.ts`: `SuggestModal<GameEntry>`; `getSuggestions` filters the preloaded list; `onChooseSuggestion(game)` → `this.onChoose(null, game)`; no `onClose` override.
- Callers: `searchGameMetadata()` chains `openGameSearchModal` → `openGameSuggestModal`; `createNewGameNote` and `insertMetadata` await it.
- Plan 005's mock defines `Modal` with `open`/`close` jest.fn and an empty `onOpen`/`onClose` — extend it as needed for tests (additive).

Repo conventions: callback signature `(error: Error | null, result?) => void`; `Notice` for user feedback; conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/views`    | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/views/game_search_modal.ts`
- `src/views/game_suggest_modal.ts`
- `src/main.ts` (cancel handling in the two open-* methods)
- `src/views/game_search_modal.test.ts` (create — or colocate in `src/main.test.ts` if the 005 suite already covers modal wiring; prefer the views colocated file for modal behavior)

**Out of scope**:
- Modal UI layout, search logic, `IgdbApi`, settings.

## Steps

### Step 1: Cancel signal in GameSearchModal

In `src/views/game_search_modal.ts`:

- Track `private cancelled = false;` set to `true` in a new `onClose()` override **only if no result was delivered** (guard: `if (!this.delivered)`; add `private delivered = false;` set in `searchGame` right before `this.callback(null, searchResults)`).
- In `searchGame`, after `await getByQuery`, check `if (this.cancelled) return;` before calling `this.callback` — Esc during an in-flight request now discards the result instead of opening the next modal.
- In `onClose`: `if (!this.delivered) { this.cancelled = true; this.callback(null, []); }` — closing without a result resolves the waiting promise with an empty list.

**Verify**: `pnpm lint` passes.

### Step 2: Cancel signal in GameSuggestModal

In `src/views/game_suggest_modal.ts`, same pattern:

- `private delivered = false;` — set in `onChooseSuggestion` before calling `this.onChoose(null, game)`.
- `onClose()` override: `if (!this.delivered) { this.onChoose(null, undefined); }` — selecting nothing resolves with `undefined`.

**Verify**: `pnpm lint` passes.

### Step 3: Handle empty/undefined results in main.ts

In `createNewGameNote` (lines ~262–280) and `insertMetadata` (~240–258), the flow is `const game = await this.searchGameMetadata();` then render + create. With the cancel signal, `game` can now be `undefined` (suggest modal dismissed) or the search modal can return `[]` (cancelled). Add a guard after the await:

```ts
if (!game) { return; }            // user cancelled
```

and in `searchGameMetadata` treat an empty search result (`[]` from cancel) as cancel: `if (!searchedGames.length) return undefined;` (before opening the suggest modal — it already does `new Notice('No results found...')`? No — the empty check lives in the modal; the promise now resolves `[]` on cancel; `searchGameMetadata` should convert that to a clean `undefined` so both callers share one guard).

Confirm against the live `searchGameMetadata` (lines ~98–103) and place the guard so both commands behave identically.

**Verify**: `pnpm lint` passes; no dangling-await paths remain (`grep -n "openGameSearchModal\|openGameSuggestModal" src/main.ts` — both callers flow through the guard).

### Step 4: Tests

Create `src/views/game_search_modal.test.ts` (extend the plan-005 mock as needed — `Modal`, `TextComponent`, `Setting`, `ButtonComponent` stubs; `GameSearchModal` uses `IgdbApi`, which calls `@apis/igdb_api` — mock `@apis/igdb_api` with `jest.requireActual` + `getByQuery: jest.fn()` per plan 004's pattern):

- Close before search → callback invoked with `(null, [])` exactly once.
- Esc during in-flight search → after the awaited `getByQuery` resolves, callback NOT invoked (cancelled), and `close` called.
- Successful search → callback `(null, results)`, delivered flag set, close called.
- For `GameSuggestModal`: choose → `(null, game)`; close without choose → `(null, undefined)`.

If the plan-005 mock lacks pieces (e.g. `AbstractInputSuggest`, `ButtonComponent`), add minimal stubs to `test/mock_obsidian.ts` (additive — allowed by plan 005's maintenance note).

**Verify**: `pnpm test src/views` → all pass.

### Step 5: Commit

`fix: resolve pending modal promises on dismiss and honor cancel` (conventional commit).

**Verify**: `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

Cases in Step 4. Structural pattern: plan 004's `jest.mock('@apis/...', requireActual+override)` and plan 005's plugin-under-test construction.

## Done criteria

ALL must hold:

- [ ] Both modals call their callback exactly once in every terminal state (deliver, dismiss, cancel)
- [ ] Esc during search does not open the suggest modal
- [ ] `createNewGameNote`/`insertMetadata` no-op cleanly when the user cancels (no dangling promise, no notice error)
- [ ] `pnpm test` exits 0; `pnpm lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `onClose` fires before `searchGame`'s await resolves in a way the cancelled-flag can't cover (e.g. Obsidian calls onClose twice) — the delivered/guard flags should make it idempotent; verify rather than add extra state machines.
- `searchGameMetadata`'s live shape differs from the excerpt — reconcile, and keep the single-guard design.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The `(null, [])` / `(null, undefined)` convention is the new "cancelled" contract for any future modal flow — document it in the modal files' headers briefly.
- If a future "recent searches" feature (rejected DIR-04) lands, the cancel path is where it would still record the query.
- Reviewer: confirm exactly-once callback semantics under: search success, search failure (reject), Esc mid-search, dismiss after results delivered (the `delivered` guard is what prevents a double callback there).
