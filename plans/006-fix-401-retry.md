# Plan 006: Fix the dead 401-retry — let `apiRequest` see HTTP error statuses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/apis/base_api.ts src/apis/igdb_api.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001, 004
- **Category**: bug
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The IGDB client tries to recover from a 401 (expired/revoked token) by refreshing the Twitch token and retrying once. But that code can never fire: Obsidian's `requestUrl` throws a `RequestUrlError` on 4xx/5xx **before** `apiRequest`'s own status check runs (the `RequestUrlParam.throw` option defaults to true), so `error instanceof ApiError && error.status === 401` never matches. Result: any search made with a stale token (previous session, server-side revocation, clock skew against the 60 s expiry buffer) fails hard with Obsidian's raw error instead of transparently refreshing. Plan 004's 401-retry test is failing by design until this lands.

## Current state

- `src/apis/base_api.ts` (lines ~35–57):
  ```ts
  export async function apiRequest<T>(
    url: string,
    options: { method?: 'GET' | 'POST'; params?: ...; headers?: ...; body?: string } = {},
  ): Promise<T> {
    const apiURL = new URL(url);
    appendQueryParams(apiURL, options.params ?? {});
    const res = await requestUrl({
      url: apiURL.href,
      method: options.method ?? 'GET',
      body: options.body,
      headers: { Accept: '*/*', 'Content-Type': 'application/json; charset=utf-8', ...options.headers },
    });
    if (res.status >= 400) {
      throw new ApiError(`Request failed with status ${res.status}`, res.status);
    }
    return res.json as T;
  }
  ```
- `src/apis/igdb_api.ts` `executeSearch` (lines ~156–178): `catch (error) { if (!retrying && error instanceof ApiError && error.status === 401) { await this.refreshAccessToken(); return this.executeSearch(query, true); } throw error; }` — keep this logic intact.
- `src/apis/igdb_api.test.ts` — plan 004 added a 401-retry test that currently fails because the runtime throws the wrong error type. In the test, `apiRequest` is mocked, so it throws `ApiError` directly and the retry **would** work — the mock bypasses `base_api.ts` entirely. To make the mock reflect the real world, plan 004's harness mocks `@apis/base_api` with `jest.requireActual` + overridden `apiRequest`; the 401-retry test rejects with `ApiError(401)` — which only exercises the branch, not the real dead-code condition. The fix in this plan is proven by asserting that `apiRequest` no longer relies on the default-throw behavior — the test for that is a new `base_api` unit test added in this plan.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/apis`     | all pass (004's 401 test included) |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/apis/base_api.ts`
- `src/apis/base_api.test.ts` (create)

**Out of scope**:
- `src/apis/igdb_api.ts` — its retry logic stays as-is (the fix is upstream, in `apiRequest`).
- `src/apis/igdb_api.test.ts` — the plan-004 test already asserts the retry behavior.
- Any other file.

## Steps

### Step 1: Pass `throw: false` to requestUrl

In `src/apis/base_api.ts`, add `throw: false` to the `requestUrl` options object so HTTP error responses are returned to the caller and the existing `if (res.status >= 400) throw new ApiError(...)` branch actually runs:

```ts
const res = await requestUrl({
  url: apiURL.href,
  method: options.method ?? 'GET',
  body: options.body,
  headers: { ... },
  throw: false,
});
```

**Verify**: `npx tsc --noEmit` (or `pnpm lint`) exits 0.

### Step 2: Add a base_api unit test proving the contract

Create `src/apis/base_api.test.ts`:

- Mock `obsidian`'s `requestUrl` (the `test/mock_obsidian.ts` mapping applies — but that mock's `requestUrl` does a real `fetch`; instead mock at the module level):
  ```ts
  jest.mock('obsidian', () => ({
    ...jest.requireActual('obsidian'),
    requestUrl: jest.fn(),
  }));
  ```
  If `requireActual('obsidian')` resolves to `test/mock_obsidian.ts` (it does under the jest moduleNameMapper), `requestUrl` is the jest.fn you control — spread keeps the rest of the mock's exports.
- Test 1 — **HTTP 4xx becomes ApiError**: `requestUrl` mock resolves `{ status: 401, json: {} }`; `await expect(apiRequest('https://example.com')).rejects.toMatchObject({ name: 'ApiError', status: 401 })`.
- Test 2 — **HTTP 2xx passes json through**: resolves `{ status: 200, json: { ok: true } }`; result is `{ ok: true }`.
- Test 3 — **params appended**: call `apiRequest(url, { params: { a: '1', b: 'two words' } })`; assert the `url` argument passed to the mocked `requestUrl` contains `a=1` and `b=two%20words` (URL-encoded).
- Test 4 — **default method is GET, headers merged**: assert `method: 'GET'`, `Accept: '*/*'`, `Content-Type` present; and that a custom header overrides the default when passed.

**Verify**: `pnpm test src/apis/base_api.test.ts` → all four pass.

### Step 3: Confirm the retry suite is green end to end

Run the full API suites.

**Verify**: `pnpm test src/apis` → all pass, including plan 004's 401-retry test (which now reflects a real 401 arriving as `ApiError`). If the 004 test still fails, inspect whether the mock setup bypasses `base_api` (it does — 004 mocks `@apis/base_api`), and confirm the 004 test's mock rejects with `ApiError(401)`; the retry branch should fire. Report anything unexpected.

### Step 4: Commit

`fix: surface HTTP error statuses in apiRequest so the 401 retry can fire` (conventional commit).

**Verify**: `git log -1 --oneline` matches; `git status` shows only `src/apis/base_api.ts` and `src/apis/base_api.test.ts`.

## Test plan

New `src/apis/base_api.test.ts` (four cases above) proving `apiRequest` converts non-2xx responses into `ApiError` with status — the contract the 401 retry depends on. Plan 004's suite provides the end-to-end retry assertion.

## Done criteria

ALL must hold:

- [ ] `requestUrl` call in `apiRequest` passes `throw: false`
- [ ] `pnpm test src/apis` passes — including the plan-004 401-retry test
- [ ] `pnpm lint` exits 0
- [ ] `git diff --stat` shows only the two in-scope files
- [ ] `plans/README.md` status row updated (mark 004's retry-test comment resolved)

## STOP conditions

Stop and report back (do not improvise) if:

- The mocked `requestUrl` in the new base_api test cannot be controlled (module-mapping surprise) — do not switch to a different mocking strategy beyond the jest.mock shown; report.
- Plan 004's 401-retry test still fails after this change in a way you cannot explain — report with the failure output.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This changes error semantics for **all** `apiRequest` callers (IGDB, Twitch, DeepL): 4xx/5xx now arrive as `ApiError` instead of `RequestUrlError`. The search modal's catch and `translateGameEntry`'s catch both handle generic errors, so no caller breaks — but a reviewer should confirm error messages users see are still sensible (they now come from `ApiError.message`).
- If IGDB ever returns 429 rate limits, this is the place to add retry-after handling.
