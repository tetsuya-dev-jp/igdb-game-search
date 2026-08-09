# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.4.0](https://github.com/tetsuya-dev-jp/igdb-game-search/compare/0.3.0...0.4.0) (2026-08-09)


### Bug Fixes

* pass Obsidian community directory automated review ([222d7b4](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/222d7b4c2938fb3334508b9ecad00bcf676f0860))

## [0.3.0](https://github.com/tetsuya-dev-jp/igdb-game-search/compare/0.2.0...0.3.0) (2026-08-09)


### Features

* expose frontmatter and content settings in the settings tab ([0d7c2a4](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/0d7c2a4011f0b333719abc2586935f89e9e3b5a8))
* fetch IGDB similar games into game notes ([21076a6](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/21076a65d714ce682d0af18da31f7697738c58ce))
* localize plugin UI with en/ja/ko string maps ([7eece07](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/7eece07f8e0edf55bab4988e2198acec44d26f2e))


### Bug Fixes

* avoid overwriting existing cover and screenshot files ([3cc5233](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/3cc5233425ecf94de5b422a8f8b474cf9fb7c88e))
* close the image-save race with a verify-after-write guard ([4426936](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/442693600f1b7604b7024461cbb1cae8d46d6119))
* escape frontmatter quotes and stop interpreting $ in variable substitution ([e45e18b](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/e45e18bdb30b4079146158e0d5ac37275241f48e))
* guard root-normalized paths in resolveUniquePath and align the jest mock ([149ff93](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/149ff93c76b4089cae9edc7f22f74d09bcf8005f))
* make {{time}} render the time and add template-engine tests ([90010b5](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/90010b5f049700fd0903a23bbbfee440c1521ff9))
* normalize empty image directories to avoid double-slash paths ([316993f](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/316993f3a7b4797c772c28abb63cc9c70300c957))
* quote truncated frontmatter values containing colons ([6737fac](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/6737fac074e1bed85a84aaf3cfbe270153bb35ee))
* resolve pending modal promises on dismiss and honor cancel ([a7946ff](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/a7946ffc9c8cff4008e49af60ac074b503e2a304))
* selection lost to close-triggered cancel in suggest modal ([83f1013](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/83f10130fd1236c2954ac06d1803dbcc57ab1133))
* support negative day offsets in {{DATE}} file-name syntax ([20c25c3](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/20c25c350b04862116118e0ccb3e8c586c6326f1))
* surface HTTP error statuses in apiRequest so the 401 retry can fire ([2ab0c0e](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/2ab0c0ea411d48c6a0799f23ba8f73c45a369d0d))
* time out hung network requests so the UI cannot block forever ([603197f](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/603197faa491467180fb5b62e187e4ec47cfa3ac))


### Docs

* document insert-metadata command and development workflow ([5289ca0](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/5289ca0fdd63ee282172f700a790560b0371b591))
* i18n design spike for UI strings ([7df2e05](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/7df2e05fe4cc5d7f1ef25ecec8b0c2ba501fae48))


### Code Refactoring

* unify locale detection into the shared i18n detector ([2448674](https://github.com/tetsuya-dev-jp/igdb-game-search/commit/244867417040758fba049e995cbdb250370ec9d1))

## [0.2.0](https://github.com/tetsuya-dev-jp/igdb-game-search/compare/0.1.0...0.2.0) (2026-05-17)

### Features

- Add DeepL translation for long-form IGDB text (`summary` and `storyline`).
- Add IGDB screenshot download support with per-game subfolders.
- Save IGDB screenshots and expose screenshot template variables.

### Bug Fixes

- Persist selected file and folder suggestions in settings.
- Persist selected search suggestions.
- Align settings labels with sentence case.

### Docs

- Add attribution for the original plugin.
- Sync localized README files and expand setup instructions.

## [0.1.0](https://github.com/tetsuya-dev-jp/igdb-game-search/releases/tag/0.1.0) (2026-05-17)

### Features

- Initial IGDB Game Search release.
