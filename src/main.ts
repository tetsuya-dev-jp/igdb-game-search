import { MarkdownView, Notice, Plugin, TFile, normalizePath, requestUrl } from 'obsidian';
import { GameSearchModal } from '@views/game_search_modal';
import { GameSuggestModal } from '@views/game_suggest_modal';
import { CursorJumper } from '@utils/cursor_jumper';
import { GameEntry } from '@models/game.model';
import { DEFAULT_SETTINGS, GameSearchPluginSettings, GameSearchSettingTab } from '@settings/settings';
import { DeepLApi } from '@apis/deepl_api';
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

  onload(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadSettings();

      const ribbonIconEl = this.addRibbonIcon('gamepad-2', 'Create new game note', () => {
        void this.createNewGameNote();
      });
      ribbonIconEl.addClass('igdb-game-search-ribbon-class');

      this.addCommand({
        id: 'open-game-search-modal',
        name: 'Create new game note',
        callback: () => {
          void this.createNewGameNote();
        },
      });

      this.addCommand({
        id: 'open-game-search-modal-to-insert',
        name: 'Insert metadata',
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
    if (message instanceof Error) {
      return message.message || 'An unexpected error occurred.';
    }

    if (typeof message === 'string') {
      return message;
    }

    if (message === null || message === undefined) {
      return 'An unexpected error occurred.';
    }

    if (typeof message === 'object') {
      try {
        return JSON.stringify(message);
      } catch {
        return 'An unexpected error occurred.';
      }
    }

    if (typeof message === 'number' || typeof message === 'boolean' || typeof message === 'bigint') {
      return `${message}`;
    }

    return 'An unexpected error occurred.';
  }

  showNotice(message: unknown): void {
    try {
      new Notice(this.toNoticeMessage(message));
    } catch {
      // noop
    }
  }

  async searchGameMetadata(query?: string): Promise<GameEntry> {
    const searchedGames = await this.openGameSearchModal(query);
    return this.openGameSuggestModal(searchedGames);
  }

  async getRenderedContents(game: GameEntry) {
    const localizedGame = await this.translateGameEntry(game);
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
      }
    }

    if (enableScreenshotSave) {
      const screenshotDirectory = this.getScreenshotDirectory(localizedGame, screenshotImagePath);
      const localScreenshots = await this.downloadAndSaveImages(localizedGame.screenshots ?? [], screenshotDirectory);
      localizedGame.localScreenshots = localScreenshots;
      localizedGame.localScreenshot = localScreenshots.join(', ');
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
      const response = await requestUrl({
        url: imageUrl,
        method: 'GET',
        headers: {
          Accept: 'image/*',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      const imageData = response.arrayBuffer;
      const normalizedDirectory = normalizePath(directory);
      await this.ensureDirectory(normalizedDirectory);
      const filePath = normalizedDirectory ? `${normalizedDirectory}/${imageName}` : imageName;
      await this.app.vault.adapter.writeBinary(filePath, imageData);
      return filePath;
    } catch (error) {
      console.error('Error downloading or saving image:', error);
      return '';
    }
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
    const normalizedRootDirectory = normalizePath(rootDirectory);
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

  async openGameSuggestModal(games: GameEntry[]): Promise<GameEntry> {
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
