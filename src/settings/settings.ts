import { replaceDateInString } from '@utils/utils';
import { AUTO_TRANSLATION_LANGUAGE, DEEPL_TARGET_LANGUAGES } from '@utils/deepl_languages';
import { App, PluginSettingTab, Setting } from 'obsidian';
import { t, I18nKey } from '@utils/i18n';
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
  uiLanguage: string;
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
  uiLanguage: 'auto',
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
    this.createNoteContentSettings(containerEl);
  }

  private get lang(): string {
    return this.plugin.settings.uiLanguage;
  }

  private createGeneralSettings(containerEl: HTMLElement) {
    this.createHeader('settings.general.header', containerEl);
    this.createFileLocationSetting(containerEl);
    this.createFileNameFormatSetting(containerEl);
    this.createUiLanguageSetting(containerEl);
  }

  private createUiLanguageSetting(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName(t('settings.uiLanguage.name', this.lang))
      .setDesc(t('settings.uiLanguage.desc', this.lang))
      .addDropdown(dropdown => {
        ['auto', 'en', 'ja', 'ko'].forEach(value => {
          dropdown.addOption(value, value);
        });

        dropdown.setValue(this.plugin.settings.uiLanguage).onChange(async value => {
          this.plugin.settings.uiLanguage = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });
  }

  private createHeader(title: I18nKey, containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t(title, this.lang)).setHeading();
  }

  private createFileLocationSetting(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName(t('settings.general.location.name', this.lang))
      .setDesc(t('settings.general.location.desc', this.lang))
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

        text
          .setPlaceholder(t('settings.general.location.placeholder', this.lang))
          .setValue(this.plugin.settings.folder)
          .onChange(saveValue);
      });
  }

  private createFileNameFormatSetting(containerEl: HTMLElement) {
    const previewEl = createEl('code', {
      text: replaceDateInString(this.plugin.settings.fileNameFormat) || '{{title}}',
    });

    new Setting(containerEl)
      .setClass('game-search-plugin__settings--new_file_name')
      .setName(t('settings.general.fileName.name', this.lang))
      .setDesc(t('settings.general.fileName.desc', this.lang))
      .addSearch(cb => {
        try {
          new FileNameFormatSuggest(this.app, cb.inputEl);
        } catch (error) {
          console.error(error);
        }

        cb.setPlaceholder(t('settings.general.fileName.placeholder', this.lang))
          .setValue(this.plugin.settings.fileNameFormat)
          .onChange(async value => {
            this.plugin.settings.fileNameFormat = value.trim();
            previewEl.setText(replaceDateInString(value) || '{{title}}');
            await this.plugin.saveSettings();
          });
      });

    containerEl
      .createDiv({
        cls: ['setting-item-description', 'game-search-plugin__settings--new_file_name_hint'],
      })
      .append(previewEl);
  }

  private createTemplateFileSetting(containerEl: HTMLElement) {
    const templateFileDesc = createFragment();
    templateFileDesc.createDiv({ text: t('settings.template.desc', this.lang) });
    templateFileDesc.createEl('a', {
      text: t('settings.template.exampleButton', this.lang),
      href: `${docUrl}#example-template`,
    });

    new Setting(containerEl)
      .setName(t('settings.template.name', this.lang))
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
          .setPlaceholder(t('settings.template.placeholder', this.lang))
          .setValue(this.plugin.settings.templateFile)
          .onChange(saveValue);
      });
  }

  private createIgdbSettings(containerEl: HTMLElement) {
    this.createHeader('settings.igdb.header', containerEl);

    new Setting(containerEl)
      .setName(t('settings.igdb.clientId.name', this.lang))
      .setDesc(t('settings.igdb.clientId.desc', this.lang))
      .addText(text =>
        text.setValue(this.plugin.settings.twitchClientId).onChange(async value => {
          this.plugin.settings.twitchClientId = value.trim();
          this.plugin.settings.igdbAccessToken = '';
          this.plugin.settings.igdbAccessTokenExpiresAt = 0;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.igdb.clientSecret.name', this.lang))
      .setDesc(t('settings.igdb.clientSecret.desc', this.lang))
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
    this.createHeader('settings.search.header', containerEl);

    new Setting(containerEl)
      .setName(t('settings.search.cover.name', this.lang))
      .setDesc(t('settings.search.cover.desc', this.lang))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.showCoverImageInSearch).onChange(async value => {
          this.plugin.settings.showCoverImageInSearch = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private createTranslationSettings(containerEl: HTMLElement) {
    this.createHeader('settings.translation.header', containerEl);

    new Setting(containerEl)
      .setName(t('settings.translation.enable.name', this.lang))
      .setDesc(t('settings.translation.enable.desc', this.lang))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableTranslation).onChange(async value => {
          this.plugin.settings.enableTranslation = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.translation.target.name', this.lang))
      .setDesc(t('settings.translation.target.desc', this.lang))
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
      .setName(t('settings.translation.key.name', this.lang))
      .setDesc(t('settings.translation.key.desc', this.lang))
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder(t('settings.translation.key.name', this.lang))
          .setValue(this.plugin.settings.deeplApiKey)
          .setDisabled(!this.plugin.settings.enableTranslation)
          .onChange(async value => {
            this.plugin.settings.deeplApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }

  private createNoteSettings(containerEl: HTMLElement) {
    this.createHeader('settings.note.header', containerEl);

    new Setting(containerEl)
      .setName(t('settings.note.open.name', this.lang))
      .setDesc(t('settings.note.open.desc', this.lang))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.openPageOnCompletion).onChange(async value => {
          this.plugin.settings.openPageOnCompletion = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.note.coverSave.name', this.lang))
      .setDesc(t('settings.note.coverSave.desc', this.lang))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableCoverImageSave).onChange(async value => {
          this.plugin.settings.enableCoverImageSave = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.note.coverFolder.name', this.lang))
      .setDesc(t('settings.note.coverFolder.desc', this.lang))
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
          .setPlaceholder(t('settings.note.coverFolder.placeholder', this.lang))
          .setValue(this.plugin.settings.coverImagePath)
          .onChange(saveValue);
      });

    new Setting(containerEl)
      .setName(t('settings.note.screenshotSave.name', this.lang))
      .setDesc(t('settings.note.screenshotSave.desc', this.lang))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableScreenshotSave).onChange(async value => {
          this.plugin.settings.enableScreenshotSave = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.note.screenshotFolder.name', this.lang))
      .setDesc(t('settings.note.screenshotFolder.desc', this.lang))
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
          .setPlaceholder(t('settings.note.screenshotFolder.placeholder', this.lang))
          .setValue(this.plugin.settings.screenshotImagePath)
          .setDisabled(!this.plugin.settings.enableScreenshotSave)
          .onChange(saveValue);
      });
  }

  private createNoteContentSettings(containerEl: HTMLElement) {
    this.createHeader('settings.content.header', containerEl);

    new Setting(containerEl)
      .setName(t('settings.content.defaultFm.name', this.lang))
      .setDesc(t('settings.content.defaultFm.desc', this.lang))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.useDefaultFrontmatter).onChange(async value => {
          this.plugin.settings.useDefaultFrontmatter = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.content.keyStyle.name', this.lang))
      .setDesc(t('settings.content.keyStyle.desc', this.lang))
      .addDropdown(dropdown => {
        Object.values(DefaultFrontmatterKeyType).forEach(value => {
          dropdown.addOption(value, value);
        });

        dropdown
          .setValue(this.plugin.settings.defaultFrontmatterKeyType)
          .setDisabled(!this.plugin.settings.useDefaultFrontmatter)
          .onChange(async value => {
            this.plugin.settings.defaultFrontmatterKeyType = value as DefaultFrontmatterKeyType;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.content.extraFm.name', this.lang))
      .setDesc(t('settings.content.extraFm.desc', this.lang))
      .addTextArea(text =>
        text
          .setPlaceholder(t('settings.content.extraFm.placeholder', this.lang))
          .setValue(this.plugin.settings.frontmatter)
          .onChange(async value => {
            this.plugin.settings.frontmatter = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settings.content.body.name', this.lang))
      .setDesc(t('settings.content.body.desc', this.lang))
      .addTextArea(text =>
        text
          .setPlaceholder(t('settings.content.body.placeholder', this.lang))
          .setValue(this.plugin.settings.content)
          .onChange(async value => {
            this.plugin.settings.content = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
