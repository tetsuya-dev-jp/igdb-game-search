import { apiRequest } from '@apis/base_api';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveSteamAppId, steamStoreUrl, SteamApi } from './steam_api';

jest.mock('@apis/base_api', () => ({ apiRequest: jest.fn() }));
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Steam integration', () => {
  beforeEach(() => request.mockReset());

  it('resolves only trusted Steam store URLs or Steam external-game records', () => {
    expect(resolveSteamAppId(['https://store.steampowered.com/app/123/Game/'])).toBe(123);
    expect(resolveSteamAppId(['https://store.steampowered.com.evil.test/app/123/'])).toBeUndefined();
    expect(resolveSteamAppId([], [{ uid: '456', external_game_source: { name: 'Steam' } }])).toBe(456);
    expect(resolveSteamAppId([], [{ uid: '456', external_game_source: { name: 'GOG' } }])).toBeUndefined();
    expect(steamStoreUrl([], 123)).toBe('https://store.steampowered.com/app/123/');
  });

  it('maps playtime and achievement details and caches the response', async () => {
    request.mockResolvedValueOnce({ response: { games: [{ appid: 10, playtime_forever: 90 }] } });
    request.mockResolvedValueOnce({
      playerstats: { success: true, achievements: [{ apiname: 'ACH', achieved: 1, unlocktime: 22 }] },
    });
    const api = new SteamApi('76561198000000000', 'key');
    const expected = {
      playtimeHours: 1.5,
      achievements: [{ apiname: 'ACH', achieved: true, unlocktime: 22 }],
      achieved: 1,
      total: 1,
    };
    await expect(api.getGameData(10)).resolves.toEqual(expected);
    await expect(api.getGameData(10)).resolves.toEqual(expected);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('accepts zero playtime and zero achievements; missing data stays blank', async () => {
    request.mockResolvedValueOnce({ response: { games: [{ appid: 11, playtime_forever: 0 }] } });
    request.mockResolvedValueOnce({ playerstats: { success: true } });
    const api = new SteamApi('76561198000000000', 'key');
    await expect(api.getGameData(11)).resolves.toEqual({ playtimeHours: 0, achievements: [], achieved: 0, total: 0 });
    await expect(api.getGameData(12)).resolves.toEqual({
      playtimeHours: '',
      achievements: [],
      achieved: '',
      total: '',
    });
  });

  it('does not request with missing key and tolerates private profiles and partial errors', async () => {
    await expect(new SteamApi('player', '').getGameData(1)).resolves.toMatchObject({
      playtimeHours: '',
      achieved: '',
      total: '',
    });
    expect(request).not.toHaveBeenCalled();
    request.mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce({ playerstats: { success: false } });
    const result = await new SteamApi('76561198000000000', 'key').getGameData(1);
    expect(result.playtimeHours).toBe('');
    expect(result.achieved).toBe('');
    expect(result.total).toBe('');
  });

  it('resolves vanity and profile URLs but rejects malformed identifiers without network requests', async () => {
    request.mockResolvedValueOnce({ response: { success: 1, steamid: '76561198000000000' } });
    const api = new SteamApi('https://steamcommunity.com/id/example', 'key');
    await api.getGameData(1);
    expect(request).toHaveBeenCalledTimes(3);
    request.mockReset();
    const malformed = new SteamApi('765', 'key');
    await malformed.getGameData(1);
    expect(request).not.toHaveBeenCalled();
  });
});
