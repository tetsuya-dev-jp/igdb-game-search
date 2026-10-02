# IGDB Game Search

[![Japanese](https://img.shields.io/badge/Language-%E6%97%A5%E6%9C%AC%E8%AA%9E-blueviolet)](README.ja.md)
[![Korean](https://img.shields.io/badge/Language-%ED%95%9C%EA%B5%AD%EC%96%B4-blueviolet)](README.ko.md)

Easily create game notes from IGDB.

<br>

## Demo

https://github.com/user-attachments/assets/e19ee2d0-1c84-4092-87d9-ee2f84b636d1

<br>

## Description

Use this plugin to search games by:

- Game title

Use IGDB API to get the game metadata.

<br>

## Network use

The plugin talks to the following remote services:

- **IGDB API** (`api.igdb.com`) — searches games and fetches game metadata. Requires a Twitch Client ID and Client Secret (see below).
- **Twitch OAuth** (`id.twitch.tv`) — exchanges your Client ID / Client Secret for the IGDB access token. Credentials are stored locally in the plugin data file.
- **DeepL API** (`api.deepl.com` / `api-free.deepl.com`) — optional; translates the summary and storyline when enabled.
- **images.igdb.com** — downloads cover images and screenshots into your vault when the corresponding settings are enabled.
- **Steam Web API** (`api.steampowered.com`) — contacted only when Steam integration is enabled; retrieves public game details and achievements for the configured profile. No HowLongToBeat service is contacted.

No analytics or telemetry are collected.

<br>

## How to install

Install from Community plugins:

1. Open Settings → Community plugins.
2. Search for `IGDB Game Search`.
3. Click `Install`, then `Enable`.

For development builds, install manually instead: copy `manifest.json`, `main.js`, and `styles.css` into `VaultFolder/.obsidian/plugins/igdb-game-search/`, reload Obsidian, and enable `IGDB Game Search` in Community plugins.

Requires Obsidian 1.13.0 or later.

<br>

## How to use

### 1. Click the ribbon icon, or execute the command `Create new game note`.

<img width="700" src="https://github.com/user-attachments/assets/17cf8a9b-b618-4769-bde8-26fe5ac6f54e">

### 2. Search for a game by title.

<img width="700" src="https://github.com/user-attachments/assets/2389fa36-3761-4441-a6ef-b61030196441" />

### 3. Select the game from the search results.

<img width="700" src="https://github.com/user-attachments/assets/96ecd455-6e51-4ece-a700-aeb40b215b92" />

### 4. A note is created from the selected metadata.

<img width="700" src="https://github.com/user-attachments/assets/3925b5b3-dd7a-4f36-b241-a8641b1a2752" />

### 5. Insert metadata into an existing note

Open a note, then run the `Insert metadata` command from the command palette (Ctrl/Cmd+P). The rendered metadata block (frontmatter + content, following your template or default settings) is inserted at the top of the current note. No new file is created.

<br>

## How to get Twitch Client ID and Client Secret

1. Create a Twitch account if you do not already have one.
2. Enable Two Factor Authentication on your Twitch account.
3. Open the Twitch Developer Portal: https://dev.twitch.tv/console
4. Register a new application.
5. If Twitch asks for an OAuth Redirect URL, add `localhost` to continue.
6. Set the Client Type to `Confidential` so Twitch can generate a Client Secret.
7. Open the newly created application settings.
8. Generate a Client Secret by pressing `New Secret`.
9. Copy both the `Client ID` and `Client Secret`.
10. Paste them into the plugin settings in Obsidian.

For IGDB API details, see the official docs: https://api-docs.igdb.com

The IGDB API is free for non-commercial use under the Twitch Developer Service Agreement.

<br>

## How to use settings

<img width="700" src="https://github.com/user-attachments/assets/58c30330-45fa-4398-b643-2caecdd57337" />

### UI language

Choose the plugin UI language.

`Auto` follows your current Obsidian language. You can also force `English`, `Japanese`, or `Korean`.

### Twitch Client ID / Client Secret

Enter your Twitch `Client ID` and `Client Secret` in the plugin settings.

The plugin uses these credentials to get an IGDB access token automatically.

### Fetch time to beat

When enabled, fetches IGDB's time-to-beat estimates for the selected game. IGDB's `hastily` value maps to `main` (credits without notable extras), `normally` to `average` (some extras), and `completely` to `completionist`. Values are converted from seconds to hours with two decimal places. IGDB is the only source: no compliant public HowLongToBeat API is established, so the plugin does not scrape the site or use private-token workarounds. Missing estimates are blank. Complete results, including misses, are cached for one hour; transient failures are not cached.

### Steam integration

Enable **Enable Steam integration** to fetch public game details and achievements for the selected game (not for every search result). Create a Steam Web API key at <https://steamcommunity.com/dev/apikey>, add it to Obsidian Secret Storage, then select its secret name in **Steam API key**. The key value is never stored in `data.json`. Set **Steam profile** to a 17-digit SteamID64, `https://steamcommunity.com/id/<vanity>/`, or `https://steamcommunity.com/profiles/<SteamID64>/`. The profile must be public, and its game details and achievements must be visible. With no key, a private profile, or no game data, the Steam fields are blank or empty arrays. When integration is disabled, no Steam data is requested or sent.

#### New enrichment UI strings

Every key below is present in English, Japanese, and Korean locale maps.

| Locale key | English UI string |
| --- | --- |
| `settings.timeToBeat.name` | Fetch time to beat |
| `settings.timeToBeat.desc` | Fetch IGDB time-to-beat estimates for the selected game. |
| `settings.steam.header` | Steam |
| `settings.steam.enable.name` | Enable Steam integration |
| `settings.steam.enable.desc` | Fetch playtime and achievements for the selected game. |
| `settings.steam.key.name` | Steam API key |
| `settings.steam.key.desc` | Choose a key stored in Obsidian Secret Storage. The key value is never saved in plugin settings. |
| `settings.steam.key.unavailable` | Secret Storage is unavailable in this Obsidian version. |
| `settings.steam.profile.name` | Steam profile |
| `settings.steam.profile.desc` | Enter a SteamID64, a /profiles/SteamID64 URL, or an /id/vanity URL on steamcommunity.com. |

Steam game/achievement results and vanity lookups are cached in memory for one hour, including empty API results; transient request failures are retried on the next note. Changing the selected secret value or profile resets the client cache. Closing/reloading the plugin discards the cache. No HowLongToBeat requests are made.

### New file location

Set the folder where the new game note is created.

If empty, the note is created in the vault root.

### New file name

Set the file name format.

The default format is `{{title}}`.

You can also use `{{DATE}}` or `{{DATE:YYYYMMDD}}`.

### Template file

Set the template file path used when creating a note.

If no template file is set, the plugin creates a note from the built-in metadata rendering.

### Translation

Use DeepL to translate long-form fields before writing them into your note.

Only `summary` and `storyline` are translated. Short metadata such as genres, platforms, and company names stay in the original IGDB form.

When the target language is set to `Auto`, the plugin follows your current Obsidian language.

If translation fails, the plugin keeps the original English text and continues note creation.

### Show cover images in search

Show IGDB cover images in the search results.

### Open new game note

Open the created note automatically after selection.

### Cover image saving

Download and save the selected game cover inside your vault.

Use `{{localCoverImage}}` in your template if you want to embed the saved image.

### Cover image folder

Set the folder where downloaded cover images are stored.

### Screenshot saving

Download IGDB screenshots into your vault.

Screenshots are stored under the configured root folder, with one subfolder per game.

### Screenshot folder

Set the root folder where downloaded screenshots are stored.

### Note content

Configure how the note body and frontmatter are generated when no template file is set.

Use the **Use default frontmatter** toggle to include game metadata (title, platforms, ratings...) as frontmatter.

**Frontmatter key style** switches the default frontmatter keys between `Camel Case` and `Snake Case`.

**Extra frontmatter** adds custom YAML keys to the frontmatter, one `key: value` per line.

**Note content** is the body template used when no template file is set, supporting `{{variable}}` syntax. It is ignored when a template file is set.

<br>

## Example template

Please also find a definition of the variables used in this template below.

```md
---
type: game
title: '{{title}}'
aliases: '{{alternativeTitle}}'
platforms: '{{platform}}'
genres: '{{genre}}'
developers: '{{developer}}'
publishers: '{{publisher}}'
franchise: '{{franchise}}'
collection: '{{collection}}'
released: '{{firstReleaseDate}}'
year: '{{releaseYear}}'
rating: '{{totalRating}}'
igdb: '{{igdbUrl}}'
cover: '{{coverLargeUrl}}'
localCover: '{{localCoverImage}}'
created: '{{DATE:YYYY-MM-DD HH:mm:ss}}'
updated: '{{DATE:YYYY-MM-DD HH:mm:ss}}'
---

<%\* if (tp.frontmatter.cover && tp.frontmatter.cover.trim() !== "") { tR += `![cover|200](${tp.frontmatter.cover})` } %>

# {{title}}

## Summary

{{summary}}

## Storyline

{{storyline}}
```

<br>

## Template variables definitions

Write `{{name}}` in your template and replace `name` with the desired field.

| Field                   | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `title`                 | Game title                                                   |
| `alternativeTitle`      | Comma-separated alternative titles                           |
| `alternativeTitles`     | Alternative titles array                                     |
| `slug`                  | IGDB slug                                                    |
| `summary`               | Game summary, translated when DeepL translation is enabled   |
| `storyline`             | Game storyline, translated when DeepL translation is enabled |
| `igdbUrl`               | IGDB page URL                                                |
| `website`               | Comma-separated website URLs                                 |
| `websites`              | Website URL array                                            |
| `platform`              | Comma-separated platform names                               |
| `platforms`             | Platform array                                               |
| `genre`                 | Comma-separated genre names                                  |
| `genres`                | Genre array                                                  |
| `theme`                 | Comma-separated theme names                                  |
| `themes`                | Theme array                                                  |
| `gameMode`              | Comma-separated game mode names                              |
| `gameModes`             | Game mode array                                              |
| `playerPerspective`     | Comma-separated player perspective names                     |
| `playerPerspectives`    | Player perspective array                                     |
| `developer`             | Comma-separated developer names                              |
| `developers`            | Developer array                                              |
| `publisher`             | Comma-separated publisher names                              |
| `publishers`            | Publisher array                                              |
| `franchise`             | First franchise name                                         |
| `collection`            | First collection name                                        |
| `similarGame`           | Comma-separated similar game names                          |
| `similarGames`          | Similar game array                                           |
| `firstReleaseDate`      | Release date in `YYYY-MM-DD`                                 |
| `releaseYear`           | Release year                                                 |
| `rating`                | IGDB rating                                                  |
| `ratingCount`           | Rating count                                                 |
| `aggregatedRating`      | Aggregated rating                                            |
| `aggregatedRatingCount` | Aggregated rating count                                      |
| `totalRating`           | Total rating                                                 |
| `totalRatingCount`      | Total rating count                                           |
| `coverUrl`              | Cover image URL                                              |
| `coverSmallUrl`         | Small cover image URL                                        |
| `coverLargeUrl`         | Large cover image URL                                        |
| `screenshot`            | Comma-separated screenshot URLs                              |
| `screenshots`           | Screenshot URL array                                         |
| `localScreenshot`       | Comma-separated local screenshot paths                       |
| `localScreenshots`      | Local screenshot path array                                  |
| `localCoverImage`       | Local path of the downloaded cover image                     |
| `timeToBeatMain`        | IGDB main-story estimate in hours (two decimals)              |
| `timeToBeatAverage`     | IGDB estimate including some extras, in hours                 |
| `timeToBeatCompletionist` | IGDB completionist estimate in hours                         |
| `timeToBeatList`        | JSON array `[main, average, completionist]`                    |
| `timeToBeat`            | JSON object with `main`, `average`, and `completionist`        |
| `steamAppId`            | Steam application ID                                           |
| `steamStoreUrl`         | Steam store URL                                                |
| `steamPlaytimeHours`    | Public Steam playtime in hours                                 |
| `steamAchievements`     | JSON array of `{apiname, achieved, unlocktime}` objects        |
| `steamAchievementsUnlocked` | Number of unlocked achievements                            |
| `steamAchievementsTotal` | Total number of achievements                                  |
| `platformsList`, `genresList`, `developersList`, `publishersList`, `screenshotsList`, `websitesList` | JSON array literals |
| `alternativeTitlesList`, `themesList`, `gameModesList`, `playerPerspectivesList`, `similarGamesList`, `localScreenshotsList` | JSON array literals |
| `localCoverWikilink`, `firstScreenshotWikilink` | Vault-relative wikilinks using full paths |

<br>

## Advanced

### Templater

- This plugin replaces `{{variables}}` and date placeholders, but it no longer executes custom `<%= ... %>` expressions.
- Use the Templater plugin for loops, conditions, or any other scripting inside templates.
- If you want to render screenshots or add conditional sections, use Templater on top of the generated metadata.
- Native filters support YAML-safe arrays (`{{genres|yaml}}`), the first string (`{{developers|first}}`), custom separators (`{{genres|join: / }}`), chained filters (`{{developers|first|yaml}}`), and safe scalar quoting (`{{title|yaml}}`). Raw `{{title}}` intentionally emits an unquoted value.

#### Native YAML template

```yaml
---
title: {{title|yaml}}
genres: {{genres|yaml}}
platforms: {{platforms|yaml}}
developers: {{developers|yaml}}
steam: {{steamStoreUrl|yaml}}
---
```

#### Templater recipe

This reproduces the Resident Evil Requiem cleanup in #4. The legacy property name `Metacritic` below contains `totalRatingCount` (IGDB vote count), **not** a Metacritic score; rename it to `RatingVotes` in a new template.

The following `<%*` script uses JSON array literals supplied by the plugin. It emits YAML block lists, full-path wikilinks, safe first-name scalars, and optional Steam URL without evaluating raw game text as Templater code.

```md
<%*
const genres = {{genresList}};
const platforms = {{platformsList}};
const title = {{title|json}};
const developer = {{developers|first|json}};
const publisher = {{publishers|first|json}};
const cover = {{localCoverWikilink|json}};
const backdrop = {{firstScreenshotWikilink|json}};
const steamUrl = {{steamStoreUrl|json}};
const date = {{firstReleaseDate|json}};
const rating = {{totalRatingCount|json}};
const quote = value => JSON.stringify(String(value ?? ''));
const scalar = value => {
  const text = String(value ?? '');
  return /^[\p{L}\p{N}_./ -]+$/u.test(text) && !/^(?:null|true|false|yes|no|on|off|[-+]?\d+(?:\.\d*)?)$/i.test(text)
    ? text : quote(text);
};
const list = values => values.length ? '\n' + values.map(value => `  - ${quote(value)}`).join('\n') : ' []';
tR += `---\nTitle: ${scalar(title)}\nCover: ${quote(cover)}\nBackdrop: ${quote(backdrop)}\nPlatform:${list(platforms)}\nDeveloper: ${scalar(developer)}\nPublisher: ${scalar(publisher)}\nGenre:${list(genres)}\nReleaseDate: ${scalar(date)}\nMetacritic: ${typeof rating === 'number' ? rating : quote(rating)}\nStoreUrl: ${steamUrl || '""'}\n---\n\n# ${title}\n`;
%>
```

Use JSON-encoded aliases for scalar values (`{{title|json}}`) and the actual JSON array aliases inline (for example `const genres = {{genresList}};`). This preserves quotes and backslashes and prevents data from becoming executable Templater syntax. The plugin's existing auto-trigger behavior is unchanged; do not add a second execution trigger.

## Development

- **Requirements**: Node >= 20, pnpm >= 9 (see `.nvmrc`).
- **Install**: `pnpm install`
- **Dev watch**: `pnpm dev` — builds `main.js` on change; copy `main.js`, `manifest.json`, `styles.css` to `VaultFolder/.obsidian/plugins/igdb-game-search/`.
- **Verify**: `pnpm lint` (prettier + eslint + typecheck) and `pnpm test` (jest)
- **Translations**: every new UI string must add a key to `src/locales/en.ts` and every locale file, and get a README row.
- **Build**: `pnpm build`
- **Release**: `pnpm release` (standard-version) prepares the local version commit and tag; it does not push them. Keep `versions.json` synchronized using `version-bump.mjs`, then push the release commit and exact version tag. The tag-push GitHub Actions workflow runs lint/tests/build and publishes `main.js`, `manifest.json`, and `styles.css`. Merging into `master` alone does not publish a release.

## Acknowledgements

This project started as a fork of [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin) and was adapted for IGDB-based game metadata.
