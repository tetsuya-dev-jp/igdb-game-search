# Plan 001: Restore the verification baseline and gate CI on lint + tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- package.json pnpm-lock.yaml .github/workflows/release.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

At plan time the repo has **no `node_modules`** — a fresh clone cannot run
`pnpm test` or `pnpm lint` without an explicit install, and the release CI
(`.github/workflows/release.yml`) runs **only on tag push** with **no lint or
test step**, so nothing in the pipeline verifies the code it ships. Every
other plan in this set depends on being able to verify work locally and in
CI. This plan makes `pnpm install && pnpm lint && pnpm test` the one-command
baseline and wires it into CI.

## Current state

- `package.json` — scripts: `"test": "jest"`, `"lint": "pnpm format:check && eslint . --ext .ts && tsc --noEmit -skipLibCheck"`, `"build": "pnpm run lint && node esbuild.config.mjs production"`. Package manager is pnpm (`"engines": { "pnpm": ">= 9.0.0" }`).
- `.nvmrc` — node version pin (workflow uses `node-version-file: '.nvmrc'`).
- `.github/workflows/release.yml` — currently:
  ```yaml
  name: Release Obsidian plugin
  on:
    push:
      tags:
        - '*'
  ...
  jobs:
    build:
      runs-on: ubuntu-20.04
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version-file: '.nvmrc'
        - uses: pnpm/action-setup@...
        - name: Install dependencies
          run: pnpm install --frozen-lockfile
        - name: Build
          run: pnpm build
        - name: Create Release  # softprops/action-gh-release@v1, ships main.js/styles.css/manifest.json
  ```
- Tests exist: `src/apis/igdb_api.test.ts`, `src/apis/deepl_api.test.ts`, `src/utils/utils.test.ts` (ts-jest preset, jsdom env).
- Repo conventions: conventional commits (`feat:`/`fix:`/`chore:`/`docs:` — see `git log`), prettier 2-space, eslint + @typescript-eslint, pnpm for everything.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install --frozen-lockfile` | exit 0 |
| Tests     | `pnpm test`              | all suites pass |
| Lint      | `pnpm lint`              | exit 0 |
| CI parse  | `npx actionlint` (if available) or YAML read-through | no syntax errors |

## Scope

**In scope**:
- `.github/workflows/release.yml`
- `.github/workflows/ci.yml` (create — PR/push gate)

**Out of scope**:
- Any `src/` change. Any dependency changes. `plans/` directory contents other than this plan's README row.
- Do NOT fix the runner image here — that is plan 011's job; if you notice it, leave it.
- Do NOT "improve" tests or add new tests — plans 002–005 own that.

## Steps

### Step 1: Install and confirm the baseline runs

Run `pnpm install --frozen-lockfile` (use plain `pnpm install` if the frozen-lockfile install fails because the lockfile predates the local pnpm version — then note the deviation in your report).

**Verify**:
- `pnpm lint` → exit 0 (prettier check, eslint, `tsc --noEmit` all clean)
- `pnpm test` → all existing suites pass (jest exit 0)
- `pnpm build` → exit 0, produces `main.js`

### Step 2: Create the CI gate workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [master]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - uses: pnpm/action-setup@v4
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm lint
      - name: Test
        run: pnpm test
```

Match the pnpm action version already used in release.yml if it differs (`pnpm/action-setup@<existing version>`).

**Verify**: `node -e "const fs=require('fs');JSON.parse(JSON.stringify(fs.readFileSync('.github/workflows/ci.yml','utf8')));console.log('yaml bytes ok')"` is meaningless — instead read the file back and confirm the YAML keys match the structure above (on: push/PR, jobs.verify with the four steps).

### Step 3: Add lint + test to the release workflow

In `.github/workflows/release.yml`, insert a `pnpm lint` and `pnpm test` step between "Install dependencies" and "Build":

```yaml
      - name: Lint
        run: pnpm lint
      - name: Test
        run: pnpm test
```

**Verify**: read the file back; steps order is Install → Lint → Test → Build → Create Release.

### Step 4: Commit

Commit with the repo's conventional-commit style: `ci: gate lint and tests in CI workflows`.

**Verify**: `git log -1 --oneline` shows the message; `git status` shows only the two workflow files (and any legitimately staged prior work) changed.

## Test plan

No new tests — the gate is the test step in CI. Local verification is Step 1.

## Done criteria

ALL must hold:

- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build` all exit 0 locally
- [ ] `.github/workflows/ci.yml` exists with lint + test steps on push/PR
- [ ] `.github/workflows/release.yml` runs lint + test before build
- [ ] `git status` shows no changes outside the two workflow files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The repo has drifted from the excerpts (e.g. scripts renamed, workflow restructured).
- `pnpm test` fails on a pre-existing suite in Step 1 — do NOT fix the suite; report the failure and the error output.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Future plans (002–015) all use `pnpm lint` / `pnpm test` as their verification gates; if CI is red, everything downstream blocks.
- If the plugin later adds more release artifacts, keep the test gate before build.
- The runner image (`ubuntu-20.04`) is intentionally left untouched here — plan 011 changes it.
