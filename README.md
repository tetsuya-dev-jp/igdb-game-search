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

## How to install

Currently, install it manually:

1. Create `VaultFolder/.obsidian/plugins/igdb-game-search/`.
2. Copy `manifest.json`, `main.js`, and `styles.css` into the folder.
3. Reload Obsidian.
4. Enable `IGDB Game Search` in Community plugins.

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

### Twitch Client ID / Client Secret

Enter your Twitch `Client ID` and `Client Secret` in the plugin settings.

The plugin uses these credentials to get an IGDB access token automatically.

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

<br>

## Advanced

### Templater

- This plugin replaces `{{variables}}` and date placeholders, but it no longer executes custom `<%= ... %>` expressions.
- Use the Templater plugin for loops, conditions, or any other scripting inside templates.
- If you want to render screenshots or add conditional sections, use Templater on top of the generated metadata.

## Acknowledgements

This project started as a fork of [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin) and was adapted for IGDB-based game metadata.
