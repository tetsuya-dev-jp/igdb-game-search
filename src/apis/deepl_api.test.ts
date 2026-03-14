import { ConfigurationError, apiRequest } from '@apis/base_api';
import type { GameSearchPluginSettings } from '@settings/settings';
import { DeepLApi, DEEPL_FREE_TRANSLATE_URL, DEEPL_PRO_TRANSLATE_URL } from './deepl_api';

jest.mock('@apis/base_api', () => {
  const actual = jest.requireActual('@apis/base_api');
  return {
    ...actual,
    apiRequest: jest.fn(),
  };
});

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('DeepLApi', () => {
  const momentWindow = window as Window & { moment?: { locale: () => string } };
  const originalMoment = momentWindow.moment;

  const createSettings = (overrides: Partial<GameSearchPluginSettings> = {}): GameSearchPluginSettings => ({
    folder: '',
    fileNameFormat: '{{title}}',
    frontmatter: '',
    content: '',
    useDefaultFrontmatter: true,
    defaultFrontmatterKeyType: 'Camel Case' as GameSearchPluginSettings['defaultFrontmatterKeyType'],
    templateFile: '',
    twitchClientId: 'client',
    twitchClientSecret: 'secret',
    igdbAccessToken: '',
    igdbAccessTokenExpiresAt: 0,
    openPageOnCompletion: true,
    showCoverImageInSearch: false,
    enableCoverImageSave: false,
    coverImagePath: '',
    enableScreenshotSave: false,
    screenshotImagePath: '',
    enableTranslation: true,
    translationTargetLanguage: 'JA',
    deeplApiKey: 'test-key',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    momentWindow.moment = {
      locale: () => 'en',
    };
  });

  afterAll(() => {
    momentWindow.moment = originalMoment;
  });

  it('translates summary and storyline with DeepL', async () => {
    mockedApiRequest.mockResolvedValue({
      translations: [
        { detected_source_language: 'EN', text: '広大な冒険。' },
        { detected_source_language: 'EN', text: '100年後に目覚める。' },
      ],
    });

    const api = new DeepLApi(createSettings());
    const translated = await api.translateGameEntry({
      title: 'The Legend of Zelda: Breath of the Wild',
      summary: 'Open-air adventure.',
      storyline: 'Link awakens after 100 years.',
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      DEEPL_PRO_TRANSLATE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'DeepL-Auth-Key test-key',
        },
        body: JSON.stringify({
          text: ['Open-air adventure.', 'Link awakens after 100 years.'],
          target_lang: 'JA',
        }),
      }),
    );
    expect(translated.summary).toBe('広大な冒険。');
    expect(translated.storyline).toBe('100年後に目覚める。');
  });

  it('uses the free endpoint for DeepL Free keys', async () => {
    mockedApiRequest.mockResolvedValue({
      translations: [{ detected_source_language: 'EN', text: '概要' }],
    });

    const api = new DeepLApi(
      createSettings({
        deeplApiKey: 'free-key:fx',
      }),
    );

    await api.translateGameEntry({
      title: 'Halo',
      summary: 'Master Chief returns.',
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      DEEPL_FREE_TRANSLATE_URL,
      expect.objectContaining({
        body: JSON.stringify({
          text: ['Master Chief returns.'],
          target_lang: 'JA',
        }),
      }),
    );
  });

  it('falls back to the original text when a translation is missing', async () => {
    mockedApiRequest.mockResolvedValue({
      translations: [{ detected_source_language: 'EN', text: '要約だけ翻訳' }],
    });

    const api = new DeepLApi(createSettings());
    const translated = await api.translateGameEntry({
      title: 'Halo',
      summary: 'Master Chief returns.',
      storyline: 'Fight the Covenant.',
    });

    expect(translated.summary).toBe('要約だけ翻訳');
    expect(translated.storyline).toBe('Fight the Covenant.');
  });

  it('skips translation when it is disabled', async () => {
    const api = new DeepLApi(
      createSettings({
        enableTranslation: false,
      }),
    );

    const original = {
      title: 'Halo',
      summary: 'Master Chief returns.',
    };

    await expect(api.translateGameEntry(original)).resolves.toEqual(original);
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it('skips translation when auto target language resolves to English', async () => {
    momentWindow.moment = {
      locale: () => 'en-gb',
    };

    const api = new DeepLApi(
      createSettings({
        translationTargetLanguage: 'auto',
      }),
    );

    const original = {
      title: 'Halo',
      summary: 'Master Chief returns.',
    };

    await expect(api.translateGameEntry(original)).resolves.toEqual(original);
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });

  it('uses the current Obsidian language when the target language is auto', async () => {
    momentWindow.moment = {
      locale: () => 'ko',
    };

    mockedApiRequest.mockResolvedValue({
      translations: [{ detected_source_language: 'EN', text: '요약' }],
    });

    const api = new DeepLApi(
      createSettings({
        translationTargetLanguage: 'auto',
      }),
    );

    await api.translateGameEntry({
      title: 'Halo',
      summary: 'Master Chief returns.',
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      DEEPL_PRO_TRANSLATE_URL,
      expect.objectContaining({
        body: JSON.stringify({
          text: ['Master Chief returns.'],
          target_lang: 'KO',
        }),
      }),
    );
  });

  it('throws when translation is enabled but the API key is missing', async () => {
    const api = new DeepLApi(
      createSettings({
        deeplApiKey: '',
      }),
    );

    await expect(
      api.translateGameEntry({
        title: 'Halo',
        summary: 'Master Chief returns.',
      }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });
});
