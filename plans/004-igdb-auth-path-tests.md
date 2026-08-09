# Plan 004: IGDB auth path tests — token cache, refresh, 401 retry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/apis/igdb_api.ts src/apis/igdb_api.test.ts src/apis/base_api.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: tests
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The IGDB client's auth path — `ensureAccessToken` (cache hit), `refreshAccessToken` (Twitch OAuth, persisted to settings), and the 401-retry in `executeSearch` — is the plugin's lifeline: every search runs through it. Existing tests cover only `createGameEntry`, `buildSearchBody`, and the missing-credentials throw. The 401-retry path is currently **dead code** (plan 006 fixes it); this plan's tests will fail until 006 lands — by design, they are the regression net that proves the fix.

## Current state

`src/apis/igdb_api.ts`:

- `getByQuery(query)` (lines ~18–24): trims query, calls `executeSearch(query, false)`.
- `ensureAccessToken()` (lines ~25–38): returns the cached token if `igdbAccessToken` is set and `igdbAccessTokenExpiresAt > Date.now() + 60_000`; else `refreshAccessToken()`.
- `refreshAccessToken()` (lines ~40–58): `validateCredentials()`, POSTs to `TWITCH_TOKEN_URL` (`https://id.twitch.tv/oauth2/token`) with `client_id`/`client_secret`/`grant_type` params, stores `igdbAccessToken` + `igdbAccessTokenExpiresAt = Date.now() + expires_in * 1000` on settings, calls the injected `saveSettings()` callback, returns the token.
- `executeSearch(query, retrying)` (lines ~156–178): `ensureAccessToken()`, POSTs the search body to `IGDB_GAMES_URL` with `Client-ID` + `Authorization: Bearer <token>` headers, maps results; on error: `if (!retrying && error instanceof ApiError && error.status === 401)` → refresh + retry once with `retrying=true`.
- `validateCredentials()` (lines ~180–185): throws `ConfigurationError` if client id/secret missing.
- Constructor: `new IgdbApi(settings, saveSettings)` — saveSettings is `() => plugin.saveSettings()` in production.
- `src/apis/igdb_api.test.ts` currently: fixtures (being moved to `test/settings_fixture.ts` by plan 002), tests for `createGameEntry`, `buildSearchBody`, missing-credentials throw. The missing-credentials test constructs the api with settings lacking credentials and expects `getByQuery` to reject — that expectation still holds.
- `src/apis/deepl_api.test.ts:7-12` shows the established pattern for mocking the request layer: `jest.mock('@apis/base_api', ...)` — reuse it. For the IGDB suite, mock `@apis/base_api` so `apiRequest` is a controllable jest.fn.

Repo conventions: jest + ts-jest, colocated tests, `@apis/...` aliases, placeholder-only credentials in tests.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/apis/igdb_api.test.ts` | see Step notes |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/apis/igdb_api.test.ts`

**Out of scope**:
- `src/apis/igdb_api.ts` — do NOT modify runtime code in this plan (plan 006 owns the 401 fix).
- `src/apis/base_api.ts`, other test files, configs.

## Steps

### Step 1: Add the mocked-base-api harness

At the top of `src/apis/igdb_api.test.ts`, add:

```ts
jest.mock('@apis/base_api', () => ({
  ...jest.requireActual('@apis/base_api'),
  apiRequest: jest.fn(),
}));

import { apiRequest } from '@apis/base_api';
const mockApiRequest = apiRequest as jest.Mock;
```

Also export the `TwitchAccessTokenResponse`-shaped fixture: `{ access_token: 'test-token', expires_in: 5000, token_type: 'bearer' }`. Add a `beforeEach` that `jest.clearAllMocks()` and constructs a fresh `IgdbApi` from `createSettings({ twitchClientId: 'client', twitchClientSecret: 'secret' })` (import `createSettings` from `../../test/settings_fixture`) plus a `jest.fn()` saveSettings. Add `afterEach(() => jest.useRealTimers())` if fake timers are used.

**Verify**: `pnpm test src/apis/igdb_api.test.ts` → existing tests still pass.

### Step 2: Token cache + refresh tests

- **Cache hit**: settings pre-populated with `igdbAccessToken: 'cached-token'`, `igdbAccessTokenExpiresAt: Date.now() + 60_000`; `mockApiRequest.mockResolvedValueOnce([])` for the search call; call `getByQuery('Elden Ring')`; assert `mockApiRequest` was called exactly once (the search), and the call's headers include `Authorization: 'Bearer cached-token'` — no Twitch call.
- **Expired token triggers refresh**: `igdbAccessTokenExpiresAt: Date.now() - 1000`; `mockApiRequest.mockResolvedValueOnce({ access_token: 'fresh-token', expires_in: 5000 })` then `.mockResolvedValueOnce([])`; call `getByQuery`; assert two `apiRequest` calls (Twitch first, then search), the search headers use `Bearer fresh-token`, settings now hold `fresh-token`, and `saveSettings` (the injected jest.fn) was called.
- **Near-expiry (within 60 s buffer) triggers refresh**: `igdbAccessTokenExpiresAt: Date.now() + 30_000`; expect the same refresh flow as the expired case.

**Verify**: new cases pass.

### Step 3: 401-retry test (expected to FAIL until plan 006)

Add a test "retries once with a fresh token on 401":

- Settings with a cached valid token; `mockApiRequest` rejects on the search with `new ApiError('Request failed with status 401', 401)` (import `ApiError` from `@apis/base_api` — it is real via `requireActual`), then resolves `[]` on the retried call; the Twitch call (if it happens) returns a fresh token.
- Assert: second search call carries the fresh token; result is `[]`; `getByQuery` resolves (does not reject).

This test is expected to **fail against current code** (the 401 branch never fires because `requestUrl` throws `RequestUrlError`, not `ApiError`). If it fails for the *expected* reason (rejection instead of retry), leave it failing and mark it in a comment: `// TODO(plan 006): remove this comment when the 401-retry test passes`. If it fails for an *unexpected* reason, report.

**Verify**: run the suite; the 401 test fails as described; all other tests pass. Record the failure output in your report.

### Step 4: Non-401 error rethrow test

- `mockApiRequest.mockRejectedValueOnce(new ApiError('Request failed with status 500', 500))`; assert `getByQuery` rejects with that error and `apiRequest` was called once (no retry).

**Verify**: passes.

### Step 5: Commit

`test: cover IGDB token caching, refresh and retry paths` (conventional commit). Note in the commit body that the 401-retry case fails until plan 006 lands.

**Verify**: `git log -1 --oneline` matches; `git status` shows only `src/apis/igdb_api.test.ts`.

## Test plan

New describes in `src/apis/igdb_api.test.ts` covering: cache hit, expired token, near-expiry refresh, 401-retry (failing until 006), non-401 rethrow, and existing missing-credentials behavior preserved. Pattern for apiRequest mocking: `src/apis/deepl_api.test.ts:7-12`.

## Done criteria

ALL must hold:

- [ ] Cache-hit, expired, near-expiry, non-401 tests pass
- [ ] The 401-retry test exists and fails with the documented "rejection instead of retry" signature (this is the plan's contract with 006)
- [ ] `pnpm lint` exits 0
- [ ] `git diff --stat` shows no changes to `src/apis/igdb_api.ts` or `src/apis/base_api.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The 401-retry test fails for a reason other than "no retry happens" (e.g. mock setup error) — fix the test, not the runtime code.
- The live `igdb_api.ts` structure differs from the excerpts (e.g. `ensureAccessToken` renamed).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Plan 006 flips this suite green by making the 401 path actually run — it should only need to touch `src/apis/base_api.ts` (`throw: false`) and nothing in the test file.
- If IGDB ever adds retry-after/backoff, the retry-once assertion in Step 3 is where it surfaces.
- Reviewer: confirm no real credentials; tokens are `'test-token'`/`'fresh-token'` placeholders.
