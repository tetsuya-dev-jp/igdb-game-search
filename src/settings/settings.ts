import { replaceDateInString } from '@utils/utils';
import { AUTO_TRANSLATION_LANGUAGE, DEEPL_TARGET_LANGUAGES } from '@utils/deepl_languages';
import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import { t } from '@utils/i18n';
import GameSearchPlugin from '../main';
import { FileNameFormatSuggest } from './suggesters/FileNameFormatSuggester';

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

const UI_LANGUAGES: Record<string, string> = {
  auto: 'auto',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
};

const FRONTMATTER_KEY_TYPES: Record<string, string> = Object.fromEntries(
  Object.values(DefaultFrontmatterKeyType).map(value => [value, value]),
);

// Text-bearing settings are trimmed before persistence.
const TRIMMED_SETTING_KEYS = new Set<string>([
  'folder',
  'fileNameFormat',
  'templateFile',
  'coverImagePath',
  'screenshotImagePath',
  'deeplApiKey',
]);

export class GameSearchSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: GameSearchPlugin,
  ) {
    super(app, plugin);
  }

  private get lang(): string {
    return this.plugin.settings.uiLanguage;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const lang = this.lang;
    const settings = this.plugin.settings;

    return [
      {
        type: 'group',
        heading: t('settings.general.header', lang),
        items: [
          {
            name: t('settings.general.location.name', lang),
            desc: t('settings.general.location.desc', lang),
            control: {
              type: 'folder',
              key: 'folder',
              placeholder: t('settings.general.location.placeholder', lang),
              includeRoot: true,
            },
          },
          {
            name: t('settings.general.fileName.name', lang),
            desc: t('settings.general.fileName.desc', lang),
            render: setting => this.renderFileNameFormat(setting),
          },
          {
            name: t('settings.uiLanguage.name', lang),
            desc: t('settings.uiLanguage.desc', lang),
            control: {
              type: 'dropdown',
              key: 'uiLanguage',
              options: UI_LANGUAGES,
            },
          },
        ],
      },
      {
        type: 'group',
        items: [
          {
            name: t('settings.template.name', lang),
            desc: this.templateFileDesc(lang),
            control: {
              type: 'file',
              key: 'templateFile',
              placeholder: t('settings.template.placeholder', lang),
              filter: file => file.extension === 'md',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.igdb.header', lang),
        items: [
          {
            name: t('settings.igdb.clientId.name', lang),
            desc: t('settings.igdb.clientId.desc', lang),
            control: { type: 'text', key: 'twitchClientId' },
          },
          {
            name: t('settings.igdb.clientSecret.name', lang),
            desc: t('settings.igdb.clientSecret.desc', lang),
            render: setting => this.renderSecret(setting, 'twitchClientSecret', '', false),
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.search.header', lang),
        items: [
          {
            name: t('settings.search.cover.name', lang),
            desc: t('settings.search.cover.desc', lang),
            control: { type: 'toggle', key: 'showCoverImageInSearch' },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.translation.header', lang),
        items: [
          {
            name: t('settings.translation.enable.name', lang),
            desc: t('settings.translation.enable.desc', lang),
            control: { type: 'toggle', key: 'enableTranslation' },
          },
          {
            name: t('settings.translation.target.name', lang),
            desc: t('settings.translation.target.desc', lang),
            control: {
              type: 'dropdown',
              key: 'translationTargetLanguage',
              options: DEEPL_TARGET_LANGUAGES,
              disabled: () => !settings.enableTranslation,
            },
          },
          {
            name: t('settings.translation.key.name', lang),
            desc: t('settings.translation.key.desc', lang),
            render: setting =>
              this.renderSecret(
                setting,
                'deeplApiKey',
                t('settings.translation.key.name', lang),
                !settings.enableTranslation,
              ),
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.note.header', lang),
        items: [
          {
            name: t('settings.note.open.name', lang),
            desc: t('settings.note.open.desc', lang),
            control: { type: 'toggle', key: 'openPageOnCompletion' },
          },
          {
            name: t('settings.note.coverSave.name', lang),
            desc: t('settings.note.coverSave.desc', lang),
            control: { type: 'toggle', key: 'enableCoverImageSave' },
          },
          {
            name: t('settings.note.coverFolder.name', lang),
            desc: t('settings.note.coverFolder.desc', lang),
            control: {
              type: 'folder',
              key: 'coverImagePath',
              placeholder: t('settings.note.coverFolder.placeholder', lang),
              includeRoot: true,
            },
          },
          {
            name: t('settings.note.screenshotSave.name', lang),
            desc: t('settings.note.screenshotSave.desc', lang),
            control: { type: 'toggle', key: 'enableScreenshotSave' },
          },
          {
            name: t('settings.note.screenshotFolder.name', lang),
            desc: t('settings.note.screenshotFolder.desc', lang),
            control: {
              type: 'folder',
              key: 'screenshotImagePath',
              placeholder: t('settings.note.screenshotFolder.placeholder', lang),
              includeRoot: true,
              disabled: () => !settings.enableScreenshotSave,
            },
          },
        ],
      },
      {
        type: 'group',
        heading: t('settings.content.header', lang),
        items: [
          {
            name: t('settings.content.defaultFm.name', lang),
            desc: t('settings.content.defaultFm.desc', lang),
            control: { type: 'toggle', key: 'useDefaultFrontmatter' },
          },
          {
            name: t('settings.content.keyStyle.name', lang),
            desc: t('settings.content.keyStyle.desc', lang),
            control: {
              type: 'dropdown',
              key: 'defaultFrontmatterKeyType',
              options: FRONTMATTER_KEY_TYPES,
              disabled: () => !settings.useDefaultFrontmatter,
            },
          },
          {
            name: t('settings.content.extraFm.name', lang),
            desc: t('settings.content.extraFm.desc', lang),
            control: {
              type: 'textarea',
              key: 'frontmatter',
              placeholder: t('settings.content.extraFm.placeholder', lang),
            },
          },
          {
            name: t('settings.content.body.name', lang),
            desc: t('settings.content.body.desc', lang),
            control: {
              type: 'textarea',
              key: 'content',
              placeholder: t('settings.content.body.placeholder', lang),
            },
          },
        ],
      },
    ];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'uiLanguage') {
      this.plugin.settings.uiLanguage = value as string;
      await this.plugin.saveSettings();
      this.update();
      return;
    }

    if (key === 'twitchClientId' || key === 'twitchClientSecret') {
      (this.plugin.settings as unknown as Record<string, unknown>)[key] = (value as string).trim();
      this.plugin.settings.igdbAccessToken = '';
      this.plugin.settings.igdbAccessTokenExpiresAt = 0;
      await this.plugin.saveSettings();
      this.refreshDomState();
      return;
    }

    if (TRIMMED_SETTING_KEYS.has(key)) {
      (this.plugin.settings as unknown as Record<string, unknown>)[key] = (value as string).trim();
      await this.plugin.saveSettings();
      return;
    }

    if (key === 'enableTranslation' || key === 'enableScreenshotSave' || key === 'useDefaultFrontmatter') {
      await super.setControlValue(key, value);
      // These toggles gate the disabled state of sibling settings; a full
      // re-render refreshes both the declarative predicates and the
      // imperatively rendered secret inputs.
      this.update();
      return;
    }

    await super.setControlValue(key, value);
    this.refreshDomState();
  }

  private templateFileDesc(lang: string): DocumentFragment {
    const templateFileDesc = createFragment();
    templateFileDesc.createDiv({ text: t('settings.template.desc', lang) });
    templateFileDesc.createEl('a', {
      text: t('settings.template.exampleButton', lang),
      href: `${docUrl}#example-template`,
    });
    return templateFileDesc;
  }

  private renderFileNameFormat(setting: Setting): void | (() => void) {
    const lang = this.lang;
    const settings = this.plugin.settings;
    const previewEl = createEl('code', {
      text: replaceDateInString(settings.fileNameFormat) || '{{title}}',
    });

    setting.settingEl.addClass('game-search-plugin__settings--new_file_name');
    setting.addSearch(cb => {
      try {
        new FileNameFormatSuggest(this.app, cb.inputEl);
      } catch (error) {
        console.error(error);
      }

      cb.setPlaceholder(t('settings.general.fileName.placeholder', lang))
        .setValue(settings.fileNameFormat)
        .onChange(async value => {
          previewEl.setText(replaceDateInString(value) || '{{title}}');
          await this.setControlValue('fileNameFormat', value);
        });
    });

    const hintEl = createDiv({
      cls: ['setting-item-description', 'game-search-plugin__settings--new_file_name_hint'],
    });
    hintEl.append(previewEl);
    // The framework attaches the row to the list only after render() returns,
    // which orphans any sibling inserted here. Schedule the insertion so the
    // hint lands right below the row once it is in the DOM; re-renders are
    // deduped by removing stale hints first.
    const timer = window.setTimeout(() => {
      document.querySelectorAll('.game-search-plugin__settings--new_file_name_hint').forEach(el => el.remove());
      setting.settingEl.after(hintEl);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      hintEl.remove();
    };
  }

  private renderSecret(setting: Setting, key: string, placeholder: string, disabled: boolean): void {
    setting.addText(text => {
      text.inputEl.type = 'password';
      text
        .setPlaceholder(placeholder)
        .setDisabled(disabled)
        .setValue((this.getControlValue(key) as string) ?? '')
        .onChange(async value => {
          await this.setControlValue(key, value);
        });
    });
  }
}
