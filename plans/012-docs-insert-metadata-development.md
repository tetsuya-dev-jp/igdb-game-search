# Plan 012: Document the Insert metadata command and add a Development section (3 READMEs)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- README.md README.ja.md README.ko.md`
> If any README changed, compare against live content; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

Two shipped things are invisible:

1. The **Insert metadata** command (`src/main.ts:70-77`, id `open-game-search-modal-to-insert`) pastes the rendered metadata block into the current note — but all three READMEs (en/ja/ko) document only the ribbon/create-note path. Zero grep hits for "Insert metadata" in any README.
2. No development instructions exist anywhere: no `CONTRIBUTING.md`, no Development section. `pnpm dev` (esbuild watch), `pnpm test`, `pnpm lint`, `pnpm build` are all undocumented — a community-plugin repo whose contributors must reverse-engineer the workflow.

## Current state

- README structure (all three languages mirror each other, ~246 lines each): title + badges (Language links), demo GIFs, Description, How to install, How to use (4 steps with images), How to get Twitch Client ID/Client Secret, How to use settings (general, IGDB, translation, search, note sections), and (in `README.md` only) attribution for the original plugin.
- The usage section documents: click ribbon icon / run `Create new game note` → search → select → note created.
- Language links: `README.md` links to ja/ko; `README.ja.md` links to en/ko; `README.ko.md` links to en/ja (match the existing badge pattern exactly).
- Repo conventions: READMEs are kept in sync across languages (see git history `886e3d8 docs: sync localized readmes`); image sizing uses `<img width="700" src="...">`; settings section titles match the plugin's setting labels (sentence case, per `afc65de`).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Verify    | `grep -n "Insert metadata" README.md README.ja.md README.ko.md` | 3 matches (one per file) after editing |

## Scope

**In scope**:
- `README.md`, `README.ja.md`, `README.ko.md`

**Out of scope**:
- Plugin code, settings docs rows for future features (plan 013 owns new settings rows), the template-variable table (plan 015 owns new variables).

## Steps

### Step 1: Add the Insert metadata usage step (English)

In `README.md`, extend the "How to use" section with a fifth block, mirroring the existing step style (bolded heading + paragraph + `<br>`):

> **5. Insert metadata into an existing note**
>
> Open a note, then run the `Insert metadata` command from the command palette (Ctrl/Cmd+P). The rendered metadata block (frontmatter + content, following your template or default settings) is inserted at the top of the current note. No new file is created.

Place it after step 4's image. Keep the numbering consistent with the existing four steps.

**Verify**: `grep -n "Insert metadata" README.md` → matches the new block.

### Step 2: Add a Development section (English)

Append to `README.md`, after the settings section (before the attribution block if one exists — read the file tail first):

```markdown
## Development

- **Requirements**: Node >= 20, pnpm >= 9 (see `.nvmrc`).
- **Install**: `pnpm install`
- **Dev watch**: `pnpm dev` — builds `main.js` on change; copy `main.js`, `manifest.json`, `styles.css` to `VaultFolder/.obsidian/plugins/igdb-game-search/`.
- **Verify**: `pnpm lint` (prettier + eslint + typecheck) and `pnpm test` (jest)
- **Build**: `pnpm build`
- **Release**: `pnpm release` (standard-version) — pushes a versioned tag; the GitHub Actions workflow builds and attaches the release assets.
```

**Verify**: read back; commands match `package.json` scripts (`dev`, `lint`, `test`, `build`, `release`).

### Step 3: Mirror both blocks in Japanese and Korean

Translate step 5 and the Development section into `README.ja.md` and `README.ko.md`, keeping the exact same structure. Match each file's existing language conventions (the ja README uses polite Japanese like 「リボンアイコン、または...を実行します」; the ko README mirrors the en structure).

**Verify**: `grep -n "Insert metadata" README.md README.ja.md README.ko.md` → one match per file (the command name stays English in all three — it is the actual command name).

### Step 4: Commit

`docs: document insert-metadata command and development workflow` (conventional commit; repo history shows `docs:` used for README work).

**Verify**: `git log -1 --oneline` matches; `git status` shows only the three READMEs.

## Test plan

None — documentation. Verification is the greps and a read-back for consistency across the three files.

## Done criteria

ALL must hold:

- [ ] Each README has the Insert-metadata usage step and a Development section
- [ ] The three files' new sections are structurally parallel (same headings/order)
- [ ] Every command mentioned exists in `package.json` or `.nvmrc`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A README's structure diverges from the excerpt so the insertion points don't exist — place the blocks at the closest equivalent and report where you put them.
- The release workflow description in Step 2 doesn't match reality after plans 001/011 (it will match: tags → build → attach) — adjust the sentence to the live workflow.

## Maintenance notes

- Plans 013 and 015 also touch READMEs (settings rows / variable table) — coordinate: they add rows to existing tables; this plan adds sections. No overlap in text, but whoever lands last should re-run the sync check (`diff` the three READMEs' structure) since trilingual sync is a repo convention.
- Reviewer: confirm the ja/ko translations are idiomatic, not machine-translated filler — this repo's README quality is high (3-language, demo images).
