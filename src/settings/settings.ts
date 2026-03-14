import { replaceDateInString } from '@utils/utils';
import { AUTO_TRANSLATION_LANGUAGE, DEEPL_TARGET_LANGUAGES } from '@utils/deepl_languages';
import { App, PluginSettingTab, Setting } from 'obsidian';
import GameSearchPlugin from '../main';
import { FileNameFormatSuggest } from './suggesters/FileNameFormatSuggester';
import { FileSuggest } from './suggesters/FileSuggester';
import { FolderSuggest } from './suggesters/FolderSuggester';

const docUrl = 'https://github.com/tetsuya-dev-jp/igdb-game-search';

export enum DefaultFrontmatterKeyType {
  snakeCase = 'Snake Case',
  camelCase = 'Camel Case',
}

export interface GameSearchPluginSettings {
  folder: string;
  fileNameFormat: string;
  frontmatter: string;
  content: string;
  useDefaultFrontmatter: boolean;
  defaultFrontmatterKeyType: DefaultFrontmatterKeyType;
  templateFile: string;
  twitchClientId: string;
  twitchClientSecret: string;
  igdbAccessToken: string;
  igdbAccessTokenExpiresAt: number;
  openPageOnCompletion: boolean;
  showCoverImageInSearch: boolean;
  enableCoverImageSave: boolean;
  coverImagePath: string;
  enableScreenshotSave: boolean;
  screenshotImagePath: string;
  enableTranslation: boolean;
  translationTargetLanguage: string;
  deeplApiKey: string;
}

export const DEFAULT_SETTINGS: GameSearchPluginSettings = {
  folder: '',
  fileNameFormat: '{{title}}',
  frontmatter: '',
  content: '',
  useDefaultFrontmatter: true,
  defaultFrontmatterKeyType: DefaultFrontmatterKeyType.camelCase,
  templateFile: '',
  twitchClientId: '',
  twitchClientSecret: '',
  igdbAccessToken: '',
  igdbAccessTokenExpiresAt: 0,
  openPageOnCompletion: true,
  showCoverImageInSearch: false,
  enableCoverImageSave: false,
  coverImagePath: '',
  enableScreenshotSave: false,
  screenshotImagePath: '',
  enableTranslation: false,
  translationTargetLanguage: AUTO_TRANSLATION_LANGUAGE,
  deeplApiKey: '',
};

export class GameSearchSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: GameSearchPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.classList.add('game-search-plugin__settings');

    this.createGeneralSettings(containerEl);
    this.createTemplateFileSetting(containerEl);
    this.createIgdbSettings(containerEl);
    this.createTranslationSettings(containerEl);
    this.createSearchSettings(containerEl);
    this.createNoteSettings(containerEl);
  }

  private createGeneralSettings(containerEl: HTMLElement) {
    this.createHeader('General settings', containerEl);
    this.createFileLocationSetting(containerEl);
    this.createFileNameFormatSetting(containerEl);
  }

  private createHeader(title: string, containerEl: HTMLElement): void {
    new Setting(containerEl).setName(title).setHeading();
  }

  private createFileLocationSetting(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName('New file location')
      .setDesc('New game notes will be placed here.')
      .addText(text => {
        const saveValue = async (value: string) => {
          this.plugin.settings.folder = value.trim();
          await this.plugin.saveSettings();
        };

        try {
          new FolderSuggest(this.app, text.inputEl, saveValue);
        } catch (error) {
          console.error(error);
        }

        text.setPlaceholder('Example: games').setValue(this.plugin.settings.folder).onChange(saveValue);
      });
  }

  private createFileNameFormatSetting(containerEl: HTMLElement) {
    const previewEl = createEl('code', {
      text: replaceDateInString(this.plugin.settings.fileNameFormat) || '{{title}}',
    });

    new Setting(containerEl)
      .setClass('game-search-plugin__settings--new_file_name')
      .setName('New file name')
      .setDesc('Enter the file name format.')
      .addSearch(cb => {
        try {
          new FileNameFormatSuggest(this.app, cb.inputEl);
        } catch (error) {
          console.error(error);
        }

        cb.setPlaceholder('Example: {{title}}')
          .setValue(this.plugin.settings.fileNameFormat)
          .onChange(async value => {
            this.plugin.settings.fileNameFormat = value.trim();
            previewEl.setText(replaceDateInString(value) || '{{title}}');
            await this.plugin.saveSettings();
          });
      });

    containerEl
      .createEl('div', {
        cls: ['setting-item-description', 'game-search-plugin__settings--new_file_name_hint'],
      })
      .append(previewEl);
  }

  private createTemplateFileSetting(containerEl: HTMLElement) {
    const templateFileDesc = document.createDocumentFragment();
    templateFileDesc.createDiv({ text: 'Files will be available as templates.' });
    templateFileDesc.createEl('a', {
      text: 'Example template',
      href: `${docUrl}#example-template`,
    });

    new Setting(containerEl)
      .setName('Template file')
      .setDesc(templateFileDesc)
      .addText(text => {
        const saveValue = async (value: string) => {
          this.plugin.settings.templateFile = value.trim();
          await this.plugin.saveSettings();
        };

        try {
          new FileSuggest(this.app, text.inputEl, saveValue);
        } catch (error) {
          console.error(error);
        }

        text
          .setPlaceholder('Example: templates/game-note')
          .setValue(this.plugin.settings.templateFile)
          .onChange(saveValue);
      });
  }

  private createIgdbSettings(containerEl: HTMLElement) {
    this.createHeader('IGDB authentication', containerEl);

    new Setting(containerEl)
      .setName('Twitch client ID')
      .setDesc('Used to request an access token for game metadata.')
      .addText(text =>
        text.setValue(this.plugin.settings.twitchClientId).onChange(async value => {
          this.plugin.settings.twitchClientId = value.trim();
          this.plugin.settings.igdbAccessToken = '';
          this.plugin.settings.igdbAccessTokenExpiresAt = 0;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Twitch client secret')
      .setDesc('Stored locally in plugin data and used to refresh the access token.')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue(this.plugin.settings.twitchClientSecret).onChange(async value => {
          this.plugin.settings.twitchClientSecret = value.trim();
          this.plugin.settings.igdbAccessToken = '';
          this.plugin.settings.igdbAccessTokenExpiresAt = 0;
          await this.plugin.saveSettings();
        });
      });
  }

  private createSearchSettings(containerEl: HTMLElement) {
    this.createHeader('Search experience', containerEl);

    new Setting(containerEl)
      .setName('Show cover images in search')
      .setDesc('Display cover art in the suggestion list.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.showCoverImageInSearch).onChange(async value => {
          this.plugin.settings.showCoverImageInSearch = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private createTranslationSettings(containerEl: HTMLElement) {
    this.createHeader('Translation', containerEl);

    new Setting(containerEl)
      .setName('Enable translation')
      .setDesc('Translate summary and storyline with DeepL before rendering note content.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableTranslation).onChange(async value => {
          this.plugin.settings.enableTranslation = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName('Translation target language')
      .setDesc('Choose the target language, or follow your current Obsidian language automatically.')
      .addDropdown(dropdown => {
        Object.entries(DEEPL_TARGET_LANGUAGES).forEach(([value, label]) => {
          dropdown.addOption(value, label);
        });

        dropdown
          .setValue(this.plugin.settings.translationTargetLanguage)
          .setDisabled(!this.plugin.settings.enableTranslation)
          .onChange(async value => {
            this.plugin.settings.translationTargetLanguage = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('DeepL API key')
      .setDesc('Stored locally in plugin data and used only for translating summary and storyline.')
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('DeepL API key')
          .setValue(this.plugin.settings.deeplApiKey)
          .setDisabled(!this.plugin.settings.enableTranslation)
          .onChange(async value => {
            this.plugin.settings.deeplApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }

  private createNoteSettings(containerEl: HTMLElement) {
    this.createHeader('Note creation', containerEl);

    new Setting(containerEl)
      .setName('Open new game note')
      .setDesc('Automatically open the created note.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.openPageOnCompletion).onChange(async value => {
          this.plugin.settings.openPageOnCompletion = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Enable cover image save')
      .setDesc('Download the selected game cover into your vault.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableCoverImageSave).onChange(async value => {
          this.plugin.settings.enableCoverImageSave = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Cover image folder')
      .setDesc('Folder used when cover image saving is enabled.')
      .addText(text => {
        const saveValue = async (value: string) => {
          this.plugin.settings.coverImagePath = value.trim();
          await this.plugin.saveSettings();
        };

        try {
          new FolderSuggest(this.app, text.inputEl, saveValue);
        } catch (error) {
          console.error(error);
        }

        text
          .setPlaceholder('Example: assets/game-covers')
          .setValue(this.plugin.settings.coverImagePath)
          .onChange(saveValue);
      });

    new Setting(containerEl)
      .setName('Enable screenshot save')
      .setDesc('Download IGDB screenshots into your vault.')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableScreenshotSave).onChange(async value => {
          this.plugin.settings.enableScreenshotSave = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName('Screenshot folder')
      .setDesc('Root folder used when screenshot saving is enabled. Each game gets its own subfolder.')
      .addText(text => {
        const saveValue = async (value: string) => {
          this.plugin.settings.screenshotImagePath = value.trim();
          await this.plugin.saveSettings();
        };

        try {
          new FolderSuggest(this.app, text.inputEl, saveValue);
        } catch (error) {
          console.error(error);
        }

        text
          .setPlaceholder('Example: assets/game-screenshots')
          .setValue(this.plugin.settings.screenshotImagePath)
          .setDisabled(!this.plugin.settings.enableScreenshotSave)
          .onChange(saveValue);
      });
  }
}
