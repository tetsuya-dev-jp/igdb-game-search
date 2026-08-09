# Plan 021: Add request timeouts so hung network calls cannot block the UI forever

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/apis/base_api.ts src/apis/base_api.test.ts src/main.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (006 already landed the ApiError contract this builds on)
- **Category**: bug
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

Every network call in the plugin — IGDB/Twitch/DeepL via `apiRequest`, and image downloads via `downloadAndSaveImage` — uses `requestUrl` with **no timeout and no abort** (Obsidian's `requestUrl` has no timeout option). A black-holed TCP connection (firewall drop, dead proxy, network partition) never settles: the search modal stays on "Requesting..." with its button disabled forever, and `createNewGameNote` awaits indefinitely. Connection-refused errors surface; hangs do not. Plan 006 (landed) clarified the error contract (`ApiError` with `status`), which makes a timeout wrapper safe to add: a timeout rejects with a non-401 `ApiError`, so the 401-retry branch in `executeSearch` cannot misfire.

## Current state

- `src/apis/base_api.ts` (verbatim, post-006):
  ```ts
  export async function apiRequest<T>(
    url: string,
    options: {
      method?: 'GET' | 'POST';
      params?: Record<string, string | number>;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<T> {
    const apiURL = new URL(url);
    appendQueryParams(apiURL, options.params ?? {});

    const res = await requestUrl({
      url: apiURL.href,
      method: options.method ?? 'GET',
      body: options.body,
      headers: { Accept: '*/*', 'Content-Type': 'application/json; charset=utf-8', ...options.headers },
      throw: false,
    });

    if (res.status >= 400) {
      throw new ApiError(`Request failed with status ${res.status}`, res.status);
    }
    return res.json as T;
  }
  ```
- `src/main.ts` `downloadAndSaveImage` (lines ~166-188, post-008): `const response = await requestUrl({ url: imageUrl, method: 'GET', headers: { Accept: 'image/*' } });` — same no-timeout situation; its catch returns `''` (silent missing cover).
- `src/apis/base_api.test.ts` — 4 contract tests (401→ApiError, 2xx pass-through, params, headers). The mock controls `requestUrl`; a never-resolving mock is expressible as `new Promise(() => {})`.
- Repo conventions: `ApiError` for HTTP-ish failures, `ConfigurationError` for setup problems, colocated jest tests, `pnpm lint`/`pnpm test` gates (pnpm at `/tmp/pnpm-bin/pnpm`), conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/apis/base_api.test.ts` | all pass |
| Full      | `pnpm test`              | all suites pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/apis/base_api.ts` (timeout support in `apiRequest`)
- `src/apis/base_api.test.ts` (timeout cases)
- `src/main.ts` (`downloadAndSaveImage` uses the same timeout)

**Out of scope**:
- Abort/cancellation of in-flight requests (requestUrl cannot be aborted; the timed-out request keeps running in the background — its result is discarded. This is fine: all requests are read-only).
- Retry-on-timeout logic (a slow-but-alive request would double-execute; don't add it).
- Modal-level "cancel" wiring (plan 009 already handles user cancel; this plan handles network hangs).

## Steps

### Step 1: Add `timeoutMs` to `apiRequest`

In `src/apis/base_api.ts`:

- Extend the options type with `timeoutMs?: number;` (default `30_000`).
- Wrap the `requestUrl` await in a `Promise.race`:

```ts
const requestPromise = requestUrl({ ... });
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new ApiError('Request timed out', 408)), options.timeoutMs ?? 30_000);
});
const res = await Promise.race([requestPromise, timeoutPromise]);
```

- Import `ApiError` (already in this file). Keep the `throw: false` and the status check exactly as-is.

Design notes to honor:
- The timeout error is `ApiError` with status `408` — the 401-retry branch in `igdb_api.ts` (`error.status === 401`) cannot match, so a timeout never triggers a refresh+retry.
- Do NOT clear the timer on success (the timer firing later after a resolved race is a no-op reject on an already-settled promise — harmless; but if you prefer cleanliness, `clearTimeout` in a `finally` is fine too — choose the simpler one and note it).

**Verify**: `pnpm lint` passes.

### Step 2: Timeout tests in base_api.test.ts

Add to the existing describe:

- **Times out when the request never settles**: mock `requestUrl` to return `new Promise(() => {})`; call `apiRequest('https://example.com', { timeoutMs: 50 })`; expect rejection `toMatchObject({ name: 'ApiError', status: 408 })`.
- **Fast success is unaffected**: mock resolves `{ status: 200, json: { ok: true } }` with `timeoutMs: 50`; resolves `{ ok: true }`.
- **Slow-but-under-timeout succeeds**: mock resolves after ~20 ms (use `setTimeout` inside the mock's returned promise) with `timeoutMs: 200`; resolves normally.

Use real timers (no fake timers — 50 ms is fast enough).

**Verify**: `pnpm test src/apis/base_api.test.ts` → all pass (4 existing + 3 new).

### Step 3: Timeout for image downloads

In `src/main.ts` `downloadAndSaveImage`, apply the same race. To avoid duplicating the wrapper, export a small helper from `base_api.ts`:

```ts
export function withTimeout<T>(promise: Promise<T>, timeoutMs = 30_000, message = 'Request timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new ApiError(message, 408)), timeoutMs)),
  ]);
}
```

Then `apiRequest` uses `withTimeout(requestUrl({...}), options.timeoutMs ?? 30_000)` and `downloadAndSaveImage` uses `withTimeout(requestUrl({ url: imageUrl, method: 'GET', headers: { Accept: 'image/*' } }))`. The existing `catch` in `downloadAndSaveImage` already converts any error to `''` (silent missing cover) — no change needed there.

**Verify**: `pnpm lint` passes; `grep -n "withTimeout" src/apis/base_api.ts src/main.ts` shows both call sites.

### Step 4: Full verification + commit

**Verify**: `pnpm test` → all suites pass; `pnpm lint` → exit 0. Commit: `fix: time out hung network requests so the UI cannot block forever` (conventional commit). `git log -1 --oneline` matches; `git status` shows only the three in-scope files.

## Test plan

Cases in Steps 2–3. Pattern: existing `base_api.test.ts` describe blocks.

## Done criteria

ALL must hold:

- [ ] `apiRequest` rejects with `ApiError(408)` when the request exceeds `timeoutMs` (default 30 s)
- [ ] A timed-out request never triggers the 401-retry path (status is 408, not 401)
- [ ] `downloadAndSaveImage` uses `withTimeout`; its silent-`''` fallback behavior is unchanged
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `requestUrl` turns out to expose a native timeout/abort option in the installed obsidian typings (check `node_modules/obsidian/obsidian.d.ts` first — if it does, prefer that over the race and note the deviation).
- Any existing test fails because the `ApiError` import cycle changes (base_api is imported by igdb_api/deepl_api — no new imports should be needed).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The 401-retry interaction is the load-bearing constraint: timeout errors MUST NOT be retryable-as-401. If a future plan adds retry-on-timeout, it must distinguish 408 from transient network errors and guard against double-execution of the underlying request.
- The timed-out request continues in the background (unabortable) — for IGDB free tier (~4 req/s), an occasional abandoned request is negligible; document if rate-limit pressure ever appears.
- Reviewer: confirm `withTimeout` rejects with `ApiError`, not a bare Error, so `showNotice` and the modal error paths (which display `e.name + ': ' + e.message`) render sensibly.
