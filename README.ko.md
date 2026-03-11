# IGDB Game Search

[![English](https://img.shields.io/badge/Language-English-blueviolet)](README.md)
[![Japanese](https://img.shields.io/badge/Language-%E6%97%A5%E6%9C%AC%E8%AA%9E-blueviolet)](README.ja.md)

IGDB에서 게임 정보를 검색해 Obsidian에 게임 노트를 쉽게 만들 수 있습니다.

<br>

## 데모

https://github.com/user-attachments/assets/e19ee2d0-1c84-4092-87d9-ee2f84b636d1

<br>

## 설명

이 플러그인으로 다음 항목으로 게임을 검색할 수 있습니다.

- 게임 제목

게임 메타데이터는 IGDB API를 사용해 가져옵니다.

<br>

## 설치 방법

현재는 수동 설치 방식입니다.

1. `VaultFolder/.obsidian/plugins/igdb-game-search/` 폴더를 만듭니다.
2. `manifest.json`, `main.js`, `styles.css` 를 해당 폴더에 복사합니다.
3. Obsidian을 다시 불러옵니다.
4. Community plugins에서 `IGDB Game Search` 를 활성화합니다.

<br>

## 사용 방법

### 1. 리본 아이콘을 누르거나 `Create new game note` 명령을 실행합니다.

<img width="700" src="https://github.com/user-attachments/assets/17cf8a9b-b618-4769-bde8-26fe5ac6f54e">

### 2. 게임 제목으로 검색합니다.

<img width="700" src="https://github.com/user-attachments/assets/2389fa36-3761-4441-a6ef-b61030196441" />

### 3. 검색 결과에서 게임을 선택합니다.

<img width="700" src="https://github.com/user-attachments/assets/96ecd455-6e51-4ece-a700-aeb40b215b92" />

### 4. 선택한 메타데이터를 바탕으로 노트가 생성됩니다.

<img width="700" src="https://github.com/user-attachments/assets/3925b5b3-dd7a-4f36-b241-a8641b1a2752" />

<br>

## Twitch Client ID / Client Secret 발급 방법

1. 아직 없다면 Twitch 계정을 생성합니다.
2. Twitch 계정에서 2단계 인증을 활성화합니다.
3. Twitch Developer Portal을 엽니다: https://dev.twitch.tv/console
4. 새 애플리케이션을 등록합니다.
5. OAuth Redirect URL을 요구하면 `localhost` 를 추가하고 진행합니다.
6. Client Type을 `Confidential` 로 설정합니다. 그래야 Client Secret 을 만들 수 있습니다.
7. 새로 만든 애플리케이션 관리 화면을 엽니다.
8. `New Secret` 버튼을 눌러 Client Secret 을 생성합니다.
9. `Client ID` 와 `Client Secret` 을 모두 복사해 둡니다.
10. Obsidian 플러그인 설정에 두 값을 붙여넣습니다.

IGDB API에 대한 자세한 내용은 공식 문서를 참고하세요: https://api-docs.igdb.com

IGDB API는 Twitch Developer Service Agreement 조건에 따라 비상업적 용도에서는 무료로 사용할 수 있습니다.

<br>

## 설정 항목

<img width="700" src="https://github.com/user-attachments/assets/58c30330-45fa-4398-b643-2caecdd57337" />

### Twitch Client ID / Client Secret

플러그인 설정에 Twitch `Client ID` 와 `Client Secret` 을 입력합니다.

플러그인은 이 정보를 사용해 IGDB용 액세스 토큰을 자동으로 가져옵니다.

### New file location

새로 만드는 게임 노트의 저장 폴더를 설정합니다.

비워 두면 vault 루트에 생성됩니다.

### New file name

생성될 노트의 파일 이름 형식을 설정합니다.

기본값은 `{{title}}` 입니다.

`{{DATE}}` 또는 `{{DATE:YYYYMMDD}}` 도 사용할 수 있습니다.

### Template file

노트를 만들 때 사용할 템플릿 파일 경로를 설정합니다.

설정하지 않으면 플러그인의 기본 메타데이터 렌더링을 사용합니다.

### Show cover images in search

검색 결과에 IGDB 커버 이미지를 표시합니다.

### Open new game note

노트 생성 후 자동으로 해당 노트를 엽니다.

### Cover image saving

선택한 게임의 커버 이미지를 vault 안에 저장합니다.

템플릿에서 저장된 이미지를 사용하려면 `{{localCoverImage}}` 를 사용하세요.

### Cover image folder

다운로드한 커버 이미지의 저장 폴더를 설정합니다.

<br>

## 템플릿 예시

아래 템플릿에서 사용하는 변수는 뒤의 변수 목록에서도 확인할 수 있습니다.

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

## 템플릿 변수 목록

템플릿에서는 `{{name}}` 형식으로 변수를 작성하고, `name` 부분을 원하는 필드명으로 바꿔 사용합니다.

| Field | Description |
| --- | --- |
| `title` | 게임 제목 |
| `alternativeTitle` | 대체 제목의 쉼표 구분 문자열 |
| `alternativeTitles` | 대체 제목 배열 |
| `slug` | IGDB slug |
| `summary` | 게임 요약 |
| `storyline` | 스토리 설명 |
| `igdbUrl` | IGDB 페이지 URL |
| `website` | 웹사이트 URL의 쉼표 구분 문자열 |
| `websites` | 웹사이트 URL 배열 |
| `platform` | 플랫폼 이름의 쉼표 구분 문자열 |
| `platforms` | 플랫폼 이름 배열 |
| `genre` | 장르 이름의 쉼표 구분 문자열 |
| `genres` | 장르 이름 배열 |
| `theme` | 테마 이름의 쉼표 구분 문자열 |
| `themes` | 테마 이름 배열 |
| `gameMode` | 게임 모드 이름의 쉼표 구분 문자열 |
| `gameModes` | 게임 모드 이름 배열 |
| `playerPerspective` | 시점 이름의 쉼표 구분 문자열 |
| `playerPerspectives` | 시점 이름 배열 |
| `developer` | 개발사 이름의 쉼표 구분 문자열 |
| `developers` | 개발사 이름 배열 |
| `publisher` | 퍼블리셔 이름의 쉼표 구분 문자열 |
| `publishers` | 퍼블리셔 이름 배열 |
| `franchise` | 첫 번째 프랜차이즈 이름 |
| `collection` | 첫 번째 컬렉션 이름 |
| `firstReleaseDate` | `YYYY-MM-DD` 형식의 출시일 |
| `releaseYear` | 출시 연도 |
| `rating` | IGDB rating |
| `ratingCount` | rating 개수 |
| `aggregatedRating` | aggregated rating |
| `aggregatedRatingCount` | aggregated rating 개수 |
| `totalRating` | total rating |
| `totalRatingCount` | total rating 개수 |
| `coverUrl` | 커버 이미지 URL |
| `coverSmallUrl` | 작은 커버 이미지 URL |
| `coverLargeUrl` | 큰 커버 이미지 URL |
| `screenshot` | 스크린샷 URL의 쉼표 구분 문자열 |
| `screenshots` | 스크린샷 URL 배열 |
| `localCoverImage` | 다운로드한 커버 이미지의 로컬 경로 |

<br>

## Advanced

### Inline Script

- `game` 객체를 통해 플러그인이 가져온 모든 속성에 접근할 수 있습니다.
- `<%= game %>` 또는 `<%= JSON.stringify(game, null, 2) %>` 로 내용을 확인할 수 있습니다.

예시:

````md
```json
<%= JSON.stringify(game, null, 2) %>
```
````

## Acknowledgements

이 프로젝트는 [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin)을 바탕으로 IGDB 기반 게임 메타데이터에 맞게 수정한 플러그인입니다.
