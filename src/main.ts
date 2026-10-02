import { MarkdownView, Notice, Plugin, TFile, normalizePath, requestUrl } from 'obsidian';
import { GameSearchModal } from '@views/game_search_modal';
import { GameSuggestModal } from '@views/game_suggest_modal';
import { CursorJumper } from '@utils/cursor_jumper';
import { GameEntry } from '@models/game.model';
import { DEFAULT_SETTINGS, GameSearchPluginSettings, GameSearchSettingTab } from '@settings/settings';
import { DeepLApi } from '@apis/deepl_api';
import { IgdbApi } from '@apis/igdb_api';
import { SteamApi, resolveSteamAppId, steamStoreUrl } from '@apis/steam_api';
import { withTimeout } from '@apis/base_api';
import { t } from '@utils/i18n';
import { applyTemplateTransformations, getTemplateContents, useTemplaterPluginInFile } from '@utils/template';
import {
  applyDefaultFrontMatter,
  makeFileName,
  makeFileStem,
  makeScreenshotFileName,
  replaceVariableSyntax,
  toStringFrontMatter,
} from '@utils/utils';

export default class GameSearchPlugin extends Plugin {
  settings: GameSearchPluginSettings;
  private steamClient?: { profile: string; key: string; api: SteamApi };

  private async enrichSteam(game: GameEntry): Promise<void> {
    game.steamAppId ??= resolveSteamAppId(game.websites);
    game.steamStoreUrl = steamStoreUrl(game.websites, game.steamAppId);
    if (
      !this.settings.enableSteam ||
      !game.steamAppId ||
      !this.settings.steamApiKeySecretName ||
      !this.settings.steamProfile
    ) {
      this.steamClient = undefined;
      return;
    }
    try {
      const key = this.app.secretStorage?.getSecret(this.settings.steamApiKeySecretName);
      if (!key) {
        this.steamClient = undefined;
        return;
      }
      const profile = this.settings.steamProfile.trim();
      if (!this.steamClient || this.steamClient.profile !== profile || this.steamClient.key !== key) {
        this.steamClient = { profile, key, api: new SteamApi(profile, key) };
      }
      const data = await this.steamClient.api.getGameData(game.steamAppId);
      game.steamPlaytimeHours = data.playtimeHours;
      game.steamAchievements = data.achievements;
      game.steamAchievementsUnlocked = data.achieved;
      game.steamAchievementsTotal = data.total;
    } catch {
      // Secret storage unavailable/locked: optional enrichment never blocks a note.
      this.steamClient = undefined;
    }
  }

  onload(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadSettings();

      const ribbonIconEl = this.addRibbonIcon(
        'gamepad-2',
        t('command.createGameNote', this.settings.uiLanguage),
        () => {
          void this.createNewGameNote();
        },
      );
      ribbonIconEl.addClass('igdb-game-search-ribbon-class');

      this.addCommand({
        id: 'open-game-search-modal',
        name: t('command.createGameNote', this.settings.uiLanguage),
        callback: () => {
          void this.createNewGameNote();
        },
      });

      this.addCommand({
        id: 'open-game-search-modal-to-insert',
        name: t('command.insertMetadata', this.settings.uiLanguage),
        callback: () => {
          void this.insertMetadata();
        },
      });

      this.addSettingTab(new GameSearchSettingTab(this.app, this));
      console.debug(
        `IGDB Game Search loaded: version ${this.manifest.version} (requires ${this.manifest.minAppVersion})`,
      );
    } catch (error) {
      console.error('Failed to initialize IGDB Game Search', error);
      this.showNotice(error);
    }
  }

  private toNoticeMessage(message: unknown): string {
    const unexpectedError = t('notice.unexpectedError', this.settings?.uiLanguage);

    if (message instanceof Error) {
      return message.message || unexpectedError;
    }

    if (typeof message === 'string') {
      return message;
    }

    if (message === null || message === undefined) {
      return unexpectedError;
    }

    if (typeof message === 'object') {
      try {
        return JSON.stringify(message);
      } catch {
        return unexpectedError;
      }
    }

    if (typeof message === 'number' || typeof message === 'boolean' || typeof message === 'bigint') {
      return `${message}`;
    }

    return unexpectedError;
  }

  showNotice(message: unknown): void {
    try {
      new Notice(this.toNoticeMessage(message));
    } catch {
      // noop
    }
  }

  async searchGameMetadata(query?: string): Promise<GameEntry | undefined> {
    const searchedGames = await this.openGameSearchModal(query);
    if (!searchedGames.length) {
      return undefined; // user cancelled the search (or no results)
    }
    return this.openGameSuggestModal(searchedGames);
  }

  async getRenderedContents(game: GameEntry) {
    const localizedGame = { ...(await this.translateGameEntry(game)) };
    await this.enrichSteam(localizedGame);
    if (this.settings.enableTimeToBeat && localizedGame.igdbId) {
      const time = await new IgdbApi(this.settings, () => this.saveSettings()).getTimeToBeat(localizedGame.igdbId);
      localizedGame.timeToBeatMain = time.main;
      localizedGame.timeToBeatAverage = time.average;
      localizedGame.timeToBeatCompletionist = time.completionist;
    }
    const {
      templateFile,
      useDefaultFrontmatter,
      defaultFrontmatterKeyType,
      enableCoverImageSave,
      coverImagePath,
      enableScreenshotSave,
      screenshotImagePath,
      frontmatter,
      content,
    } = this.settings;

    let contentBody = '';

    if (enableCoverImageSave) {
      const coverImageUrl = localizedGame.coverLargeUrl || localizedGame.coverUrl || localizedGame.coverSmallUrl;
      if (coverImageUrl) {
        const imageName = makeFileName(localizedGame, this.settings.fileNameFormat, 'jpg');
        localizedGame.localCoverImage = await this.downloadAndSaveImage(imageName, coverImagePath, coverImageUrl);
        localizedGame.localCoverWikilink = localizedGame.localCoverImage ? `[[${localizedGame.localCoverImage}]]` : '';
      }
    }

    if (enableScreenshotSave) {
      const screenshotDirectory = this.getScreenshotDirectory(localizedGame, screenshotImagePath);
      const localScreenshots = await this.downloadAndSaveImages(localizedGame.screenshots ?? [], screenshotDirectory);
      localizedGame.localScreenshots = localScreenshots;
      localizedGame.localScreenshot = localScreenshots.join(', ');
      localizedGame.firstScreenshotWikilink = localScreenshots[0] ? `[[${localScreenshots[0]}]]` : '';
    }

    if (templateFile) {
      const templateContents = await getTemplateContents(this.app, templateFile);
      contentBody += replaceVariableSyntax(localizedGame, applyTemplateTransformations(templateContents));
    } else {
      let replacedVariableFrontmatter = replaceVariableSyntax(localizedGame, frontmatter);
      if (useDefaultFrontmatter) {
        replacedVariableFrontmatter = toStringFrontMatter(
          applyDefaultFrontMatter(localizedGame, replacedVariableFrontmatter, defaultFrontmatterKeyType),
        );
      }
      const replacedVariableContent = replaceVariableSyntax(localizedGame, content);
      contentBody += replacedVariableFrontmatter
        ? `---\n${replacedVariableFrontmatter}\n---\n${replacedVariableContent}`
        : replacedVariableContent;
    }

    return contentBody;
  }

  private async translateGameEntry(game: GameEntry): Promise<GameEntry> {
    try {
      return await new DeepLApi(this.settings).translateGameEntry(game);
    } catch (error) {
      console.warn('Failed to translate game metadata', error);
      this.showNotice(error);
      return game;
    }
  }

  async downloadAndSaveImage(imageName: string, directory: string, imageUrl: string): Promise<string> {
    try {
      const response = await withTimeout(
        requestUrl({
          url: imageUrl,
          method: 'GET',
          headers: {
            Accept: 'image/*',
          },
        }),
      );

      if (response.status !== 200) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      const imageData = response.arrayBuffer;
      const normalizedDirectory = this.normalizeDirectory(directory);
      await this.ensureDirectory(normalizedDirectory);
      const filePath = await this.resolveUniquePath(normalizedDirectory, imageName);
      await this.app.vault.adapter.writeBinary(filePath, imageData);

      // Race guard: a concurrent save may have claimed this path between our
      // exists() check and writeBinary. Verify our bytes are the ones on disk;
      // if another writer clobbered us, re-resolve and write again.
      let onDisk: ArrayBuffer | null = null;
      try {
        onDisk = await this.app.vault.adapter.readBinary(filePath);
      } catch {
        // treat a read failure as a clobbered write; the retry re-resolves the path
      }
      const expected = new Uint8Array(imageData);
      if (!onDisk || onDisk.byteLength !== expected.byteLength) {
        const retryPath = await this.resolveUniquePath(normalizedDirectory, filePath.split('/').pop() ?? imageName);
        await this.app.vault.adapter.writeBinary(retryPath, imageData);
        return retryPath;
      }
      return filePath;
    } catch (error) {
      console.error('Error downloading or saving image:', error);
      return '';
    }
  }

  private normalizeDirectory(directory: string): string {
    const normalized = normalizePath(directory);
    return normalized === '/' ? '' : normalized;
  }

  private async resolveUniquePath(directory: string, fileName: string): Promise<string> {
    const base = this.normalizeDirectory(directory);
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

  private async downloadAndSaveImages(imageUrls: string[], directory: string): Promise<string[]> {
    const localPaths: string[] = [];

    for (const [index, imageUrl] of imageUrls.entries()) {
      const fileName = makeScreenshotFileName(index);
      const localPath = await this.downloadAndSaveImage(fileName, directory, imageUrl);
      if (localPath) {
        localPaths.push(localPath);
      }
    }

    return localPaths;
  }

  private getScreenshotDirectory(game: GameEntry, rootDirectory: string): string {
    const gameFolderName = makeFileStem(game, this.settings.fileNameFormat);
    const normalizedRootDirectory = this.normalizeDirectory(rootDirectory);
    return normalizedRootDirectory ? `${normalizedRootDirectory}/${gameFolderName}` : gameFolderName;
  }

  private async ensureDirectory(directory: string): Promise<void> {
    if (!directory) {
      return;
    }

    const parts = normalizePath(directory).split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(currentPath))) {
        await this.app.vault.adapter.mkdir(currentPath);
      }
    }
  }

  async insertMetadata(): Promise<void> {
    try {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!markdownView) {
        console.warn('Can not find an active markdown view');
        return;
      }

      const game = await this.searchGameMetadata(markdownView.file.basename);
      if (!game) return; // user cancelled

      if (!markdownView.editor) {
        console.warn('Can not find editor from the active markdown view');
        return;
      }

      const renderedContents = await this.getRenderedContents(game);
      markdownView.editor.replaceRange(renderedContents, { line: 0, ch: 0 });
    } catch (err) {
      console.warn(err);
      this.showNotice(err);
    }
  }

  async createNewGameNote(): Promise<void> {
    try {
      const game = await this.searchGameMetadata();
      if (!game) return; // user cancelled

      const renderedContents = await this.getRenderedContents(game);

      const fileName = makeFileName(game, this.settings.fileNameFormat);
      const filePath = this.settings.folder ? `${this.settings.folder}/${fileName}` : fileName;
      const targetFile = await this.app.vault.create(filePath, renderedContents);

      await useTemplaterPluginInFile(this.app, targetFile);
      await this.openNewGameNote(targetFile);
    } catch (err) {
      console.warn(err);
      this.showNotice(err);
    }
  }

  async openNewGameNote(targetFile: TFile) {
    if (!this.settings.openPageOnCompletion) return;

    const activeLeaf = this.app.workspace.getLeaf();
    if (!activeLeaf) {
      console.warn('No active leaf');
      return;
    }

    await activeLeaf.openFile(targetFile, { state: { mode: 'source' } });
    activeLeaf.setEphemeralState({ rename: 'all' });
    await new CursorJumper(this.app).jumpToNextCursorLocation();
  }

  async openGameSearchModal(query = ''): Promise<GameEntry[]> {
    return new Promise((resolve, reject) => {
      const modal = new GameSearchModal(this, query, (error, results) => {
        return error ? reject(error) : resolve(results);
      });
      modal.open();
    });
  }

  async openGameSuggestModal(games: GameEntry[]): Promise<GameEntry | undefined> {
    return new Promise((resolve, reject) => {
      const modal = new GameSuggestModal(
        this.app,
        this.settings.showCoverImageInSearch,
        games,
        (error, selectedGame) => {
          return error ? reject(error) : resolve(selectedGame);
        },
      );
      modal.open();
    });
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<GameSearchPluginSettings>;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
