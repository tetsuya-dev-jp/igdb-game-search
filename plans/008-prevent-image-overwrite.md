# Plan 008: Prevent silent overwrite of cover and screenshot files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb399a6..HEAD -- src/main.ts src/utils/utils.ts src/utils/utils.test.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: bug
- **Planned at**: commit `cb399a6`, 2026-08-09

## Why this matters

`downloadAndSaveImage` writes cover/screenshot files with `vault.adapter.writeBinary` and **no existence check**. File names are derived from the game title: the cover is `makeFileName(game, fileNameFormat, 'jpg')` and screenshots are `screenshot-01.jpg…` inside a title-named subfolder (`getScreenshotDirectory`). Consequences:

- Re-creating the same game note (or two games sharing a title — remakes, regional duplicates) silently **overwrites** the previous cover/screenshots, changing images already embedded in existing notes.
- Same-title files collide with user-owned files in the configured folder.

The fix: check existence first and pick a unique suffixed name instead of overwriting.

## Current state

`src/main.ts`:

- `downloadAndSaveImage` (lines ~166–188):
  ```ts
  async downloadAndSaveImage(imageName: string, directory: string, imageUrl: string): Promise<string> {
    try {
      const response = await requestUrl({ url: imageUrl, method: 'GET', headers: { Accept: 'image/*' } });
      if (response.status !== 200) { throw new Error(`Failed to download image: ${response.status}`); }
      const imageData = response.arrayBuffer;
      const normalizedDirectory = normalizePath(directory);
      await this.ensureDirectory(normalizedDirectory);
      const filePath = normalizedDirectory ? `${normalizedDirectory}/${imageName}` : imageName;
      await this.app.vault.adapter.writeBinary(filePath, imageData);   // <-- overwrites silently
      return filePath;
    } catch (error) { console.error('Error downloading or saving image:', error); return ''; }
  }
  ```
- Callers: cover via `enableCoverImageSave` (`imageName = makeFileName(game, fileNameFormat, 'jpg')`), screenshots via `downloadAndSaveImages` loop with `makeScreenshotFileName(index)` into `getScreenshotDirectory(game, screenshotImagePath)`.
- `ensureDirectory` (lines ~198–210) creates each path component with `adapter.exists` + `adapter.mkdir`.
- The note itself is created with `this.app.vault.create(filePath, renderedContents)` (throws on existing file — Obsidian semantics: `vault.create` rejects on duplicate), which is why notes don't collide but images do.
- `src/utils/utils.ts` has `makeScreenshotFileName(index, extension = 'jpg')` → `screenshot-01.jpg` style.

Repo conventions: try/catch + `console.error` + graceful `''` fallback in the image path; `normalizePath` for joining; tests colocated (plan 005 added `src/main.test.ts` with a mocked vault — extend it, don't create a second suite file).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/main.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/main.ts` (image save path only)
- `src/main.test.ts` (extend)

**Out of scope**:
- `src/utils/utils.ts` — no helper changes; the uniqueness logic lives inline in main.ts (it needs `app.vault.adapter`, which utils functions don't have).
- Note creation (`vault.create`), template path, settings UI.

## Steps

### Step 1: Add a unique-path helper in main.ts

Add a private method to `GameSearchPlugin`:

```ts
private async resolveUniquePath(directory: string, fileName: string): Promise<string> {
  const base = normalizePath(directory);
  const stem = fileName.replace(/\.([^.]+)$/, '');   // name without extension
  const ext = fileName.match(/\.([^.]+)$/)?.[1] ?? '';
  let candidate = base ? `${base}/${fileName}` : fileName;
  let index = 2;
  while (await this.app.vault.adapter.exists(candidate)) {
    candidate = base ? `${base}/${stem}-${index}.${ext}` : `${stem}-${index}.${ext}`;
    index += 1;
  }
  return candidate;
}
```

Edge cases to honor: `fileName` without extension (ext `''` → `stem-2.` would be ugly; guard: if no extension, suffix without dot: `${stem}-${index}`); empty `directory` → plain `fileName` path. Adjust the snippet accordingly — the goal is: first free name, `name.ext`, `name-2.ext`, `name-3.ext`, …

**Verify**: `pnpm lint` passes (tsc).

### Step 2: Use it in downloadAndSaveImage

Replace the direct path construction with the unique resolution:

```ts
const normalizedDirectory = normalizePath(directory);
await this.ensureDirectory(normalizedDirectory);
const filePath = await this.resolveUniquePath(normalizedDirectory, imageName);
await this.app.vault.adapter.writeBinary(filePath, imageData);
```

Behavior: first save keeps `screenshot-01.jpg`; a second save of the same game lands at `screenshot-01-2.jpg` (or per your suffix scheme) and the note's image link points at the new file. Return value remains the actual path written.

**Verify**: `pnpm lint` passes.

### Step 3: Extend main.test.ts

In `src/main.test.ts` (created by plan 005 — if it doesn't exist because 005 was skipped, create it per 005's instructions first; its vault mock provides `adapter.exists`/`writeBinary` as jest.fn):

- Mock `requestUrl` to resolve `{ status: 200, arrayBuffer: new ArrayBuffer(8) }` (jest.mock `obsidian`'s `requestUrl`, or stub via the mock's exported `requestUrl` — follow the pattern the 005 suite established).
- Case A — fresh write: `adapter.exists` resolves `false`; `downloadAndSaveImage('cover.jpg', 'assets/covers', 'https://images.igdb.com/.../cover.jpg')` → resolves to `assets/covers/cover.jpg`; `writeBinary` called once with that path.
- Case B — collision: `adapter.exists` resolves `true` for `cover.jpg` then `false` for `cover-2.jpg` → result `assets/covers/cover-2.jpg`.
- Case C — multiple collisions: true, true, false → `cover-3.jpg`.
- Case D — error path preserved: `requestUrl` rejects → resolves `''`, `writeBinary` not called.

**Verify**: `pnpm test src/main.test.ts` → all pass, including the plan-005 cases.

### Step 4: Commit

`fix: avoid overwriting existing cover and screenshot files` (conventional commit).

**Verify**: `git log -1 --oneline` matches; `git status` shows only the two in-scope files.

## Test plan

Four new cases in `src/main.test.ts` (A–D above) plus the existing suite. Mock pattern: whichever the 005 suite already uses — extend, don't duplicate.

## Done criteria

ALL must hold:

- [ ] `grep -n "writeBinary" src/main.ts` shows the unique-path resolution feeding the write
- [ ] Collision cases covered by tests (exists-true sequences)
- [ ] `pnpm test` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `vault.adapter.exists` behaves differently in the mocked environment than assumed (the mock from 005 may need `exists` added — that's in scope; a mock gap is not a STOP condition, fixing the mock is).
- Plan 005's suite structure differs from this plan's assumption (suite file absent, different helpers) — reconcile with the actual file and note it; do not create a conflicting second suite file.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The unique-suffix scheme (`-2`, `-3`) matches Obsidian's own behavior for duplicated file names, so users won't be surprised.
- If a future plan adds "overwrite on re-create" as a deliberate option (re-syncing a game), the `resolveUniquePath` call site is where the toggle goes.
- Reviewer: confirm the return path (with suffix) is what gets embedded in the note's frontmatter — the note render happens before image save? Verify ordering in `getRenderedContents`/`createNewGameNote`; if the note is written before images, a follow-up note edit may be needed for the link — report the ordering fact in your completion notes if you find it surprising.
