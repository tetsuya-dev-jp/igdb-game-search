import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApiError, apiRequest } from './base_api';
import { IgdbApi } from './igdb_api';
import { createSettings } from '../../test/settings_fixture';

jest.mock('./base_api', () => ({
  ...jest.requireActual<typeof import('./base_api')>('./base_api'),
  apiRequest: jest.fn(),
}));
const request = jest.mocked(apiRequest);
let gameId = 10000000;
const makeApi = () =>
  new IgdbApi(
    createSettings({
      twitchClientId: 'client',
      twitchClientSecret: 'test-secret',
      igdbAccessToken: 'token',
      igdbAccessTokenExpiresAt: Date.now() + 3600000,
    }),
    async () => {},
  );
const empty = { main: '', average: '', completionist: '' };

beforeEach(() => {
  request.mockReset();
  gameId++;
});
afterEach(() => jest.restoreAllMocks());

describe('IGDB time to beat', () => {
  it('fetches by selected game id and converts three second metrics to hours', async () => {
    request.mockResolvedValue([{ hastily: 45000, normally: 60000, completely: 90000 }]);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual({ main: 12.5, average: 16.67, completionist: 25 });
    expect(request).toHaveBeenCalledWith(
      'https://api.igdb.com/v4/game_time_to_beats',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining(`where game_id = ${gameId}`) }),
    );
  });
  it('caches data and no-result across instances for one hour', async () => {
    let now = 1000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    request.mockResolvedValue([]);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual(empty);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual(empty);
    expect(request).toHaveBeenCalledTimes(1);
    now += 3600001;
    await makeApi().getTimeToBeat(gameId);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('refreshes Twitch authentication once on 401', async () => {
    request
      .mockRejectedValueOnce(new ApiError('expired', 401))
      .mockResolvedValueOnce({ access_token: 'new-token', expires_in: 3600 })
      .mockResolvedValueOnce([{ hastily: 3600, normally: 7200, completely: 10800 }]);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual({ main: 1, average: 2, completionist: 3 });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('degrades repeated 401 without looping', async () => {
    request
      .mockRejectedValueOnce(new ApiError('expired', 401))
      .mockResolvedValueOnce({ access_token: 'new', expires_in: 3600 })
      .mockRejectedValueOnce(new ApiError('expired', 401));
    expect(await makeApi().getTimeToBeat(gameId)).toEqual(empty);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('does not poison the cache with missing credentials or transient failures', async () => {
    expect(await new IgdbApi(createSettings(), async () => {}).getTimeToBeat(gameId)).toEqual(empty);
    request.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([{ hastily: 3600 }]);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual(empty);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual({ main: 1, average: '', completionist: '' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid ids without requests and discards nonfinite/negative/zero metrics', async () => {
    for (const id of [NaN, Infinity, -1, 0, 1.5]) expect(await makeApi().getTimeToBeat(id)).toEqual(empty);
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue([{ hastily: Infinity, normally: 0, completely: -5 }]);
    expect(await makeApi().getTimeToBeat(gameId)).toEqual(empty);
  });
});
