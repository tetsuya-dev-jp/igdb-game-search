# Issues #2–#4: verification report

## Environment and scope

- Base: `master` / `6af1ba9`, plugin version **0.5.0**. These records capture pre-release validation; the features are included in release 0.6.0. Existing template behavior requires no migration.
- Obsidian **1.13.7**, official Linux x86_64 AppImage; Templater **2.25.1**, official release assets.
- Node **26.7.0**, pnpm **12.8.1**.
- Test vault: `/home/tetsuya/dev/igdb-game-search/e2e/.vault`.
- Both Linux headless (`xvfb`) and native GNOME/Xwayland (`DISPLAY=:0`) runs passed. Each run uses an isolated temporary Obsidian profile; the user's personal profile/vault is not changed or stopped.
- Production bundle `main.js`, `manifest.json`, and `styles.css` were built and copied into `.obsidian/plugins/igdb-game-search/` before each complete run.

## Verified results

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass: Prettier, ESLint, TypeScript; zero new warnings |
| `pnpm test --runInBand` | Pass: 14 suites, 132 tests |
| `pnpm build` | Pass |
| Original Obsidian smoke suite | 5 checks passed; authenticated IGDB happy path explicitly skipped |
| Real settings window | 23 checks passed, including Steam Secret Storage picker, profile gating/trimming, time toggle, persisted settings, Japanese re-render |
| Native template note | Obsidian parsed real YAML arrays, first-company values, image wikilinks and a Steam-only store URL; optional fields empty without credentials |
| Actual image downloads | IGDB cover + two public Steam screenshots written as JPEG files; linked cover/backdrop bytes and existence checked; both embeds rendered in Obsidian |
| README Templater recipe | Copy-paste recipe executed by real Templater with auto-trigger both off and on; exactly one execution in each mode |
| Regression proof | Structured-template tests failed before implementation; time-to-beat tests caught rounding/validation/cache defects; modern Templater manual-trigger regression failed before compatibility fix; external Steam URL test failed before resolver fix |

The deliberately failing image-download unit case prints its existing console error; this is not an ESLint warning or a failed test.

## Data provenance and limits

No Twitch or Steam API credentials were available. The game selection seam uses the explicitly identified public-source fixture in `e2e/fixtures/resident-evil-requiem.json`, based on the issue's reproduction and public game pages. It is **not** presented as a live authenticated IGDB search. The real plugin's note creation, rendering, vault writes, image requests, YAML indexing, settings UI and actual Templater execute normally.

Positive time-to-beat and personal Steam data are tested with mocked HTTP responses. On the real client without a key, durations/playtime are empty and achievements are `[]`; missing data is not incorrectly shown as zero hours or zero completion. Private/missing games, partial errors, vanity resolution, secret rotation and caches are unit-tested. This does not claim a live private-profile/account verification.

Time to beat uses IGDB's documented `game_time_to_beats` endpoint: `hastily` → main/credits estimate, `normally` → average with some extras, `completely` → 100% estimate; seconds become hours. No sanctioned public HowLongToBeat API was established, so no scraping, private endpoint or token-extraction fallback was added. The plugin makes no HowLongToBeat requests.

The issue's historical `Metacritic: 333` is retained only to reproduce its template: `totalRatingCount` is an IGDB vote count, **not** a Metacritic score. README advises renaming the property to `RatingVotes`.

## Code review

Two read-only Luna reviews checked the frozen implementation: Standards found no material violations; Spec raised one filter-composition concern. The pipeline now keeps values typed until final JSON/YAML serialization. A regression test demonstrates failure with eager serialization and success after restoration; the real Obsidian probe also parses chained first/YAML scalar output correctly. Additional Steam boundary tests cover transient retries and external-game URLs. No unresolved review findings remain.

## Before → after

Before (full sample: [before.md](before.md)):

```yaml
Genre: "Shooter,Puzzle,Adventure"
Platform: "Xbox Series X|S,Nintendo Switch 2,PC (Microsoft Windows),PlayStation 5"
Cover: "00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem.jpg"
StoreUrl: "https://www.residentevil.com/requiem/en-us/,https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/"
```

After (full actual output: [templater-after.md](templater-after.md)):

```yaml
Title: Resident Evil Requiem
Genre:
  - "Shooter"
  - "Puzzle"
  - "Adventure"
Platform:
  - "Xbox Series X|S"
  - "Nintendo Switch 2"
  - "PC (Microsoft Windows)"
  - "PlayStation 5"
Developer: Capcom Development Division 1
Publisher: Capcom
StoreUrl: https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/
```

Cover/Backdrop are quoted `[[full/vault/path.jpg]]` links. The exact paths in the samples include collision-safe filename suffixes from repeated runs; existing images are not overwritten.

## Evidence

- [Before screenshot](before.png)
- [Native desktop structured note](desktop-after.png), [parsed data](desktop.json), [downloaded images rendered](desktop-images.png)
- [Native desktop Templater note](templater-desktop.png), [both trigger runs](templater-desktop.json)
- [Headless structured note](headless-after.png), [parsed data](headless.json), [rendered images](headless-images.png)
- [Headless Templater note](templater-headless.png), [both trigger runs](templater-headless.json)
- [English settings](settings-declarative.png), [Japanese settings](settings-ja.png)
- [Native variable output](after.md), [Templater output](templater-after.md)

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm test && pnpm build
bash e2e/run.sh
# Native desktop, with this session's DISPLAY and XAUTHORITY:
E2E_DESKTOP=1 E2E_CDP_PORT=9334 bash e2e/run.sh
```

Full run instructions and environment overrides: [e2e/README.md](../../../e2e/README.md).
