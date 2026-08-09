import { DefaultFrontmatterKeyType, GameSearchPluginSettings } from '@settings/settings';

export function createSettings(overrides: Partial<GameSearchPluginSettings> = {}): GameSearchPluginSettings {
  return {
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
    translationTargetLanguage: 'auto',
    deeplApiKey: '',
    uiLanguage: 'auto',
    ...overrides,
  };
}
