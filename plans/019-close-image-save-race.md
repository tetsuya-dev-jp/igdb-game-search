# Plan 019: Close the resolveUniquePath check-then-act race on concurrent image saves

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b1d9d17..HEAD -- src/main.ts src/main.test.ts`
> If any in-scope file changed, compare excerpts against live code; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b1d9d17`, 2026-08-09

## Why this matters

Plan 008 added `resolveUniquePath` so re-creating a game note no longer silently overwrites the previous cover/screenshots. But the uniqueness check is check-then-act: `adapter.exists(candidate)` followed later by `adapter.writeBinary(filePath)` — two concurrent note creations for the same title (double ribbon click, two commands racing) can both see the same candidate as free and both write the same path, resurrecting the overwrite the plan fixed. The window is narrow but the failure is silent (second write clobbers the first). Closing it is cheap: after writing, verify the path still belongs to this save — if another writer beat us, re-resolve and rewrite.

## Current state

- `src/main.ts:166-203` (verbatim, post-008):
  ```ts
  async downloadAndSaveImage(imageName: string, directory: string, imageUrl: string): Promise<string> {
    try {
      const response = await requestUrl({ url: imageUrl, method: 'GET', headers: { Accept: 'image/*' } });
      if (response.status !== 200) { throw new Error(`Failed to download image: ${response.status}`); }
      const imageData = response.arrayBuffer;
      const normalizedDirectory = normalizePath(directory);
      await this.ensureDirectory(normalizedDirectory);
      const filePath = await this.resolveUniquePath(normalizedDirectory, imageName);
      await this.app.vault.adapter.writeBinary(filePath, imageData);
      return filePath;
    } catch (error) { console.error('Error downloading or saving image:', error); return ''; }
  }

  private async resolveUniquePath(directory: string, fileName: string): Promise<string> {
    const base = normalizePath(directory);
    const dotIndex = fileName.lastIndexOf('.');
    const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    const ext = dotIndex > 0 ? fileName.slice(dotIndex) : '';
    let candidate = base ? `${base}/${fileName}` : fileName;
    let index = 2;
    while (await this.app.vault.adapter.exists(candidate)) {
      candidate = base ? `${base}/${stem}-${index}${ext}` : `${stem}-${index}${ext}`;
      index += 1;
    }
    return candidate;
  }
  ```
- Test coverage: `src/main.test.ts` has downloadAndSaveImage cases (fresh write, one collision, multiple collisions, error path) with `adapter.exists`/`writeBinary` mocked — read them and keep the mock pattern.
- `ensureDirectory` (below, lines ~205-217) has the same exists→mkdir pattern; it is NOT in scope (its failure mode is a caught error → `''` fallback, already benign).
- Repo conventions: colocated tests, `pnpm lint`/`pnpm test` gates (pnpm at `/tmp/pnpm-bin/pnpm`), conventional commits.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `pnpm test src/main.test.ts` | all pass |
| Lint      | `pnpm lint`              | exit 0 |

## Scope

**In scope**:
- `src/main.ts` (`downloadAndSaveImage` + `resolveUniquePath`)
- `src/main.test.ts` (extend)

**Out of scope**:
- `ensureDirectory` race (deferred — see index), note-file creation (`vault.create` throws on duplicates, already handled), any other file.

## Steps

### Step 1: Verify-after-write in downloadAndSaveImage

Change `downloadAndSaveImage` so the write is followed by a uniqueness re-check, re-resolving and re-writing if another writer won the race:

```ts
const filePath = await this.resolveUniquePath(normalizedDirectory, imageName);
await this.app.vault.adapter.writeBinary(filePath, imageData);

// Race guard: a concurrent save may have claimed the same path between our
// exists() check and writeBinary. If so, re-resolve and write again.
if (await this.app.vault.adapter.exists(this.app.vault.adapter.getFullPath ? this.app.vault.adapter.getFullPath(filePath) : filePath)) {
  // verify our bytes are the ones on disk
  const ours = await this.app.vault.adapter.readBinary(filePath).catch(() => null);
  const expected = new Uint8Array(imageData);
  if (!ours || ours.byteLength !== expected.byteLength) {
    const retryPath = await this.resolveUniquePath(normalizedDirectory, filePath.split('/').pop() ?? imageName);
    await this.app.vault.adapter.writeBinary(retryPath, imageData);
    return retryPath;
  }
}
return filePath;
```

If `adapter.getFullPath` is not part of the mock/typings, drop it and use plain `filePath` — the check is best-effort; the goal is that two racing saves never both return the same path. **Simplify if the read-back comparison feels heavy**: the minimal correct guard is "after write, if a *different* file now exists at a lower-numbered candidate than ours, move ours": re-run `resolveUniquePath` and if it returns a path different from the one we wrote to, write again at the new path and return it. Choose whichever stays under ~15 lines and keeps the existing tests green — the plan's intent is *no silent double-write of the same path*, not byte-perfect arbitration.

**Verify**: `pnpm lint` passes.

### Step 2: Extend main.test.ts

Add one race case: `adapter.exists` returns `false` for the first candidate for BOTH saves (simulate: exists false → writeBinary → exists true on re-check), then the re-check sees the path taken and the second resolution returns `cover-2.jpg` → assert the returned path is the re-resolved one and `writeBinary` was called twice. Keep the mock shape the existing cases use (jest.fn sequences).

If the re-check design you implemented doesn't need `exists` after write (simpler variant), write the test for the behavior you shipped: assert that when the first write is followed by a re-check that fails, the function returns the unique path and does not overwrite.

**Verify**: `pnpm test src/main.test.ts` → all pass (existing 5 download cases + new race case).

### Step 3: Full verification + commit

**Verify**: `pnpm test` → all suites pass; `pnpm lint` → exit 0. Commit: `fix: guard concurrent image saves against the unique-path race` (conventional commit). `git log -1 --oneline` matches; `git status` shows only in-scope files.

## Test plan

The race case in Step 2, modeled on the existing collision cases in `main.test.ts`.

## Done criteria

ALL must hold:

- [ ] Two racing saves for the same title never both return the same path (guard exists in `downloadAndSaveImage`)
- [ ] Race case test exists and passes
- [ ] `pnpm test` + `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The vault adapter in the mock lacks `readBinary`/`getFullPath` and adding them to `test/mock_obsidian.ts` looks like scope creep — then use the simpler re-resolve variant (the plan explicitly allows it).
- The existing collision tests' mock sequences conflict with the new guard (exists called more times) — update the mock sequences in the in-scope test file; that is expected.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This is the last of the "rejected in round 1, now cheap" items; the narrow race window is real but rare. If a future plan adds a save queue/serializer for image writes, this guard becomes redundant — note it then.
- Reviewer: confirm the guard can't loop (re-resolve once at most — `resolveUniquePath` is monotonic upward, so a second resolution cannot return the same path again).
