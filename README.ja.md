# IGDB Game Search

[![English](https://img.shields.io/badge/Language-English-blueviolet)](README.md)
[![Korean](https://img.shields.io/badge/Language-%ED%95%9C%EA%B5%AD%EC%96%B4-blueviolet)](README.ko.md)

IGDB からゲーム情報を検索して、Obsidian にゲームノートを簡単に作成できます。

<br>

## デモ

https://github.com/user-attachments/assets/e19ee2d0-1c84-4092-87d9-ee2f84b636d1

<br>

## 概要

このプラグインでは、次の内容でゲームを検索できます。

- ゲームタイトル

ゲームのメタデータ取得には IGDB API を使用します。

<br>

## インストール方法

現時点では手動インストールです。

1. `VaultFolder/.obsidian/plugins/igdb-game-search/` を作成します。
2. `manifest.json`、`main.js`、`styles.css` をそのフォルダにコピーします。
3. Obsidian を再読み込みします。
4. Community plugins で `IGDB Game Search` を有効化します。

![プラグインのインストールまたは有効化画面]()

<br>

## 使い方

### 1. リボンアイコン、または `Create new game note` コマンドを実行します。

<img width="700" src="https://github.com/user-attachments/assets/17cf8a9b-b618-4769-bde8-26fe5ac6f54e">

### 2. タイトルでゲームを検索します。

<img width="700" src="https://github.com/user-attachments/assets/2389fa36-3761-4441-a6ef-b61030196441" />

### 3. 検索結果からゲームを選択します。

<img width="700" src="https://github.com/user-attachments/assets/96ecd455-6e51-4ece-a700-aeb40b215b92" />

### 4. 選択したメタデータをもとにノートが作成されます。

<img width="700" src="https://github.com/user-attachments/assets/3925b5b3-dd7a-4f36-b241-a8641b1a2752" />

<br>

## Twitch Client ID / Client Secret の取得方法

1. まだ持っていない場合は、Twitch アカウントを作成します。
2. Twitch アカウントで二要素認証を有効にします。
3. Twitch Developer Portal を開きます: https://dev.twitch.tv/console
4. 新しいアプリケーションを登録します。
5. OAuth Redirect URL を求められたら、`localhost` を追加して進みます。
6. Client Type は `Confidential` に設定します。これを選ばないと Client Secret を生成できません。
7. 作成したアプリケーションの管理画面を開きます。
8. `New Secret` を押して Client Secret を生成します。
9. `Client ID` と `Client Secret` の両方を控えます。
10. Obsidian のプラグイン設定に両方を貼り付けます。

IGDB API の詳細は公式ドキュメントを参照してください: https://api-docs.igdb.com

IGDB API は、Twitch Developer Service Agreement の条件のもとで、非商用利用については無料です。

<br>

## 設定項目

<img width="700" src="https://github.com/user-attachments/assets/58c30330-45fa-4398-b643-2caecdd57337" />

### Twitch Client ID / Client Secret

プラグイン設定に Twitch の `Client ID` と `Client Secret` を入力します。

これらの情報を使って、プラグインが IGDB 用のアクセストークンを自動取得します。

### New file location

新しく作成するゲームノートの保存先フォルダを設定します。

空欄の場合は vault 直下に作成されます。

### New file name

作成されるノートのファイル名フォーマットを設定します。

デフォルトは `{{title}}` です。

`{{DATE}}` や `{{DATE:YYYYMMDD}}` も使用できます。

### Template file

ノート作成時に使うテンプレートファイルのパスを設定します。

設定しない場合は、プラグインの標準メタデータ出力が使われます。

### Show cover images in search

検索結果に IGDB のカバー画像を表示します。

### Open new game note

ノート作成後に自動でそのノートを開きます。

### Cover image saving

選択したゲームのカバー画像を vault 内に保存します。

テンプレートで保存済み画像を使いたい場合は `{{localCoverImage}}` を使ってください。

### Cover image folder

ダウンロードしたカバー画像の保存先フォルダを設定します。

<br>

## テンプレート例

下のテンプレートで使っている変数は、この後の変数一覧でも確認できます。

```md
---
type: game
title: "{{title}}"
aliases: "{{alternativeTitle}}"
platforms: "{{platform}}"
genres: "{{genre}}"
developers: "{{developer}}"
publishers: "{{publisher}}"
franchise: "{{franchise}}"
collection: "{{collection}}"
released: "{{firstReleaseDate}}"
year: "{{releaseYear}}"
rating: "{{totalRating}}"
igdb: "{{igdbUrl}}"
cover: "{{coverLargeUrl}}"
localCover: "{{localCoverImage}}"
created: "{{DATE:YYYY-MM-DD HH:mm:ss}}"
updated: "{{DATE:YYYY-MM-DD HH:mm:ss}}"
---

<%* if (tp.frontmatter.cover && tp.frontmatter.cover.trim() !== "") { tR += `![cover|200](${tp.frontmatter.cover})` } %>

# {{title}}

## Summary

{{summary}}

## Storyline

{{storyline}}

## Screenshots

<%= game.screenshots?.map((url) => `![screenshot](${url})`).join('\n') ?? '' %>
```

<br>

## テンプレート変数一覧

テンプレート内では `{{name}}` の形で変数を書き、`name` を必要なフィールド名に置き換えて使います。

| Field | Description |
| --- | --- |
| `title` | ゲームタイトル |
| `alternativeTitle` | 代替タイトルのカンマ区切り文字列 |
| `alternativeTitles` | 代替タイトルの配列 |
| `slug` | IGDB の slug |
| `summary` | ゲーム概要 |
| `storyline` | ストーリー説明 |
| `igdbUrl` | IGDB ページ URL |
| `website` | Web サイト URL のカンマ区切り文字列 |
| `websites` | Web サイト URL の配列 |
| `platform` | プラットフォーム名のカンマ区切り文字列 |
| `platforms` | プラットフォーム名の配列 |
| `genre` | ジャンル名のカンマ区切り文字列 |
| `genres` | ジャンル名の配列 |
| `theme` | テーマ名のカンマ区切り文字列 |
| `themes` | テーマ名の配列 |
| `gameMode` | ゲームモード名のカンマ区切り文字列 |
| `gameModes` | ゲームモード名の配列 |
| `playerPerspective` | 視点名のカンマ区切り文字列 |
| `playerPerspectives` | 視点名の配列 |
| `developer` | 開発会社名のカンマ区切り文字列 |
| `developers` | 開発会社名の配列 |
| `publisher` | 販売会社名のカンマ区切り文字列 |
| `publishers` | 販売会社名の配列 |
| `franchise` | 最初のフランチャイズ名 |
| `collection` | 最初のコレクション名 |
| `firstReleaseDate` | `YYYY-MM-DD` 形式の発売日 |
| `releaseYear` | 発売年 |
| `rating` | IGDB の rating |
| `ratingCount` | rating 件数 |
| `aggregatedRating` | aggregated rating |
| `aggregatedRatingCount` | aggregated rating 件数 |
| `totalRating` | total rating |
| `totalRatingCount` | total rating 件数 |
| `coverUrl` | カバー画像 URL |
| `coverSmallUrl` | 小さいカバー画像 URL |
| `coverLargeUrl` | 大きいカバー画像 URL |
| `screenshot` | スクリーンショット URL のカンマ区切り文字列 |
| `screenshots` | スクリーンショット URL の配列 |
| `localCoverImage` | ダウンロード済みカバー画像のローカルパス |

<br>

## Advanced

### Inline Script

- `game` オブジェクトから、プラグインが取得したすべての属性にアクセスできます。
- `<%= game %>` や `<%= JSON.stringify(game, null, 2) %>` で中身を確認できます。

例:

````md
```json
<%= JSON.stringify(game, null, 2) %>
```
````

## Acknowledgements

このプロジェクトは [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin) をベースに、IGDB のゲームメタデータ向けに作り直したものです。
