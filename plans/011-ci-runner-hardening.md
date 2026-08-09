# Plan 011: Harden the release CI — move off the sunset runner

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- .github/workflows/release.yml`
> If the file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: dx
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

The only release pipeline runs on `ubuntu-20.04` (`.github/workflows/release.yml`), an image GitHub has deprecated and is retiring with brownouts. Tag pushes — the only trigger — will eventually fail, breaking releases for zero benefit. Plan 001 already added lint/test gates to this workflow; this plan only swaps the runner.

## Current state

`.github/workflows/release.yml` (after plan 001):
- Trigger: `push: tags: ['*']`
- `jobs.build.runs-on: ubuntu-20.04` (line ~16)
- Steps: checkout → setup-node (`.nvmrc`) → pnpm/action-setup → pnpm store cache → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm test` → `pnpm build` → softprops/action-gh-release shipping `main.js`, `styles.css`, `manifest.json`.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Verify    | read the workflow file | runs-on updated |

## Scope

**In scope**:
- `.github/workflows/release.yml`

**Out of scope**:
- `ci.yml` (plan 001), dependency bumps, anything else.

## Steps

### Step 1: Change the runner

In `.github/workflows/release.yml`, change `runs-on: ubuntu-20.04` → `runs-on: ubuntu-latest`.

**Verify**: `grep -n "runs-on" .github/workflows/release.yml` → `ubuntu-latest`.

### Step 2: Sanity-check the action versions

While in the file: confirm `actions/checkout@v4`, `actions/setup-node@v4`, and the pnpm action are pinned to major-version tags (not bare `@v1` for checkout/setup-node; softprops/action-gh-release@v1 is fine as-is — note it but do not change it). If any of checkout/setup-node is on an old major (v2/v3), bump it to `@v4` in the same commit and mention it in the commit message.

**Verify**: read back the file; every `actions/*` step is `@v4` (except the release action, which stays `@v1`).

### Step 3: Commit

`ci: move release runner to ubuntu-latest` (conventional commit).

**Verify**: `git log -1 --oneline` matches; `git status` shows only the workflow file.

## Test plan

None — CI-only change. Verification is the YAML read-back.

## Done criteria

ALL must hold:

- [ ] `runs-on: ubuntu-latest` in release.yml
- [ ] checkout/setup-node at `@v4` if they were older
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The workflow has been restructured since plan time in ways the excerpt doesn't cover (e.g. matrix builds) — reconcile carefully; report structural surprises.
- `ubuntu-latest` would be wrong for this repo's node version (`.nvmrc` is honored via `node-version-file`, so it isn't — but confirm the step still exists).

## Maintenance notes

- If GitHub deprecates `ubuntu-latest`'s current major image in the future, revisit; `ubuntu-24.04` is the explicit pin if you prefer determinism.
- softprops/action-gh-release@v1 is old but works; upgrading it is out of scope — flag it to the maintainer if a release ever misbehaves.
