import { ConfigurationError } from '@apis/base_api';
import type { GameSearchPluginSettings } from '@settings/settings';
import { IgdbApi } from './igdb_api';
import { IgdbGame } from './models/igdb_response';

describe('IgdbApi', () => {
  const saveSettings = jest.fn(() => Promise.resolve());

  const settings: GameSearchPluginSettings = {
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
    enableTranslation: false,
    translationTargetLanguage: 'auto',
    deeplApiKey: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps IGDB games into template-friendly metadata', () => {
    const api = new IgdbApi({ ...settings }, saveSettings);
    const game: IgdbGame = {
      name: 'The Legend of Zelda: Breath of the Wild',
      slug: 'the-legend-of-zelda-breath-of-the-wild',
      summary: 'Open-air adventure.',
      storyline: 'Link awakens after 100 years.',
      url: 'https://www.igdb.com/games/the-legend-of-zelda-breath-of-the-wild',
      first_release_date: 1488499200,
      alternative_names: [{ name: 'ゼルダの伝説 ブレス オブ ザ ワイルド' }],
      platforms: [{ name: 'Nintendo Switch' }, { name: 'Wii U' }],
      genres: [{ name: 'Adventure' }, { name: 'Role-playing (RPG)' }],
      themes: [{ name: 'Open world' }],
      game_modes: [{ name: 'Single player' }],
      player_perspectives: [{ name: 'Third person' }],
      involved_companies: [
        { company: { name: 'Nintendo' }, developer: true, publisher: true },
        { company: { name: 'Monolith Soft' }, developer: true, publisher: false },
      ],
      franchises: [{ name: 'The Legend of Zelda' }],
      collections: [{ name: 'Nintendo Switch Collection' }],
      rating: 96.44,
      rating_count: 500,
      aggregated_rating: 97.1,
      aggregated_rating_count: 120,
      total_rating: 96.7,
      total_rating_count: 620,
      cover: { image_id: 'cover-id' },
      screenshots: [{ image_id: 'screen-1' }, { image_id: 'screen-2' }],
      websites: [{ url: 'https://zelda.com/breath-of-the-wild/' }],
    };

    const mapped = api.createGameEntry(game);

    expect(mapped.title).toBe(game.name);
    expect(mapped.platform).toBe('Nintendo Switch, Wii U');
    expect(mapped.developer).toBe('Nintendo, Monolith Soft');
    expect(mapped.publisher).toBe('Nintendo');
    expect(mapped.releaseYear).toBe('2017');
    expect(mapped.coverLargeUrl).toContain('/t_cover_big_2x/cover-id.jpg');
    expect(mapped.screenshots).toHaveLength(2);
    expect(mapped.website).toBe('https://zelda.com/breath-of-the-wild/');
    expect(mapped.totalRating).toBe(96.7);
  });

  it('builds an escaped IGDB search body', () => {
    const api = new IgdbApi({ ...settings }, saveSettings);

    const body = api.buildSearchBody('Persona "Reload"');

    expect(body).toContain('search "Persona \\"Reload\\"";');
    expect(body).toContain('fields');
    expect(body).toContain('limit 20;');
  });

  it('throws when Twitch credentials are missing', async () => {
    const api = new IgdbApi(
      {
        ...settings,
        twitchClientId: '',
        twitchClientSecret: '',
      },
      saveSettings,
    );

    await expect(api.ensureAccessToken()).rejects.toBeInstanceOf(ConfigurationError);
  });
});
