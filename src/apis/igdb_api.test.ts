import { ApiError, apiRequest, ConfigurationError } from '@apis/base_api';
import { createSettings } from '../../test/settings_fixture';
import { IgdbApi } from './igdb_api';
import { IgdbGame, TwitchAccessTokenResponse } from './models/igdb_response';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@apis/base_api', () => {
  const actual = jest.requireActual<typeof import('@apis/base_api')>('@apis/base_api');
  return {
    ...actual,
    apiRequest: jest.fn(),
  };
});

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('IgdbApi', () => {
  const saveSettings = jest.fn(() => Promise.resolve());

  const settings = createSettings({ twitchClientId: 'client', twitchClientSecret: 'secret' });

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
      similar_games: [
        { id: 1, name: 'Dark Souls' },
        { id: 2, name: 'Bloodborne' },
      ],
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
    expect(mapped.similarGames).toEqual(['Dark Souls', 'Bloodborne']);
    expect(mapped.similarGame).toBe('Dark Souls, Bloodborne');
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

describe('IGDB auth path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const twitchTokenResponse: TwitchAccessTokenResponse = {
    access_token: 'fresh-token',
    expires_in: 5000,
    token_type: 'bearer',
  };

  const makeApi = (overrides: Partial<ReturnType<typeof createSettings>> = {}) =>
    new IgdbApi(
      createSettings({ twitchClientId: 'client', twitchClientSecret: 'secret', ...overrides }),
      jest.fn(() => Promise.resolve()),
    );

  it('uses the cached token without calling Twitch', async () => {
    const api = makeApi({
      igdbAccessToken: 'cached-token',
      igdbAccessTokenExpiresAt: Date.now() + 120_000,
    });
    mockedApiRequest.mockResolvedValueOnce([]);

    await expect(api.getByQuery('Elden Ring')).resolves.toEqual([]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
    const [, options] = mockedApiRequest.mock.calls[0];
    expect(options?.headers?.Authorization).toBe('Bearer cached-token');
  });

  it('refreshes the token when expired', async () => {
    const saveSettings = jest.fn(() => Promise.resolve());
    const api = new IgdbApi(
      createSettings({
        twitchClientId: 'client',
        twitchClientSecret: 'secret',
        igdbAccessToken: 'old-token',
        igdbAccessTokenExpiresAt: Date.now() - 1000,
      }),
      saveSettings,
    );
    mockedApiRequest.mockResolvedValueOnce(twitchTokenResponse).mockResolvedValueOnce([]);

    await expect(api.getByQuery('Elden Ring')).resolves.toEqual([]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    expect(mockedApiRequest.mock.calls[0][0]).toBe('https://id.twitch.tv/oauth2/token');
    const [, searchOptions] = mockedApiRequest.mock.calls[1];
    expect(searchOptions?.headers?.Authorization).toBe('Bearer fresh-token');
    expect(saveSettings).toHaveBeenCalled();
  });

  it('refreshes the token when near expiry (within the 60s buffer)', async () => {
    const api = makeApi({
      igdbAccessToken: 'old-token',
      igdbAccessTokenExpiresAt: Date.now() + 30_000,
    });
    mockedApiRequest.mockResolvedValueOnce(twitchTokenResponse).mockResolvedValueOnce([]);

    await expect(api.getByQuery('Elden Ring')).resolves.toEqual([]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    const [, refreshedSearchOptions] = mockedApiRequest.mock.calls[1];
    expect(refreshedSearchOptions?.headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('retries once with a fresh token on 401', async () => {
    const api = makeApi({
      igdbAccessToken: 'stale-token',
      igdbAccessTokenExpiresAt: Date.now() + 120_000,
    });
    mockedApiRequest
      .mockRejectedValueOnce(new ApiError('Request failed with status 401', 401))
      .mockResolvedValueOnce(twitchTokenResponse)
      .mockResolvedValueOnce([]);

    await expect(api.getByQuery('Elden Ring')).resolves.toEqual([]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(3);
    const [, retryOptions] = mockedApiRequest.mock.calls[2];
    expect(retryOptions?.headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('rethrows non-401 errors without retrying', async () => {
    const api = makeApi({
      igdbAccessToken: 'cached-token',
      igdbAccessTokenExpiresAt: Date.now() + 120_000,
    });
    const error = new ApiError('Request failed with status 500', 500);
    mockedApiRequest.mockRejectedValueOnce(error);

    await expect(api.getByQuery('Elden Ring')).rejects.toBe(error);

    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
  });
});
