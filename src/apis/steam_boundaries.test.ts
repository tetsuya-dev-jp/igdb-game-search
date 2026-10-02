import { apiRequest } from '@apis/base_api';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resolveSteamAppId, steamStoreUrl, SteamApi } from './steam_api';

jest.mock('@apis/base_api', () => ({ apiRequest: jest.fn() }));
const request = jest.mocked(apiRequest);
beforeEach(() => request.mockReset());
afterEach(() => jest.restoreAllMocks());
const id = '76561198000000000';
const empty: Awaited<ReturnType<SteamApi['getGameData']>> = {
  playtimeHours: '',
  achievements: [],
  achieved: '',
  total: '',
};

describe('Steam API failure and cache boundaries', () => {
  it('accepts a profile URL without a vanity call and filters requests to the matched app', async () => {
    request
      .mockResolvedValueOnce({ response: { games: [{ appid: 3764200, playtime_forever: 60 }] } })
      .mockResolvedValueOnce({ playerstats: { success: false } });
    expect(
      (await new SteamApi(`https://steamcommunity.com/profiles/${id}/`, 'unit-key').getGameData(3764200)).playtimeHours,
    ).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]?.params?.appids_filter).toBe('[3764200]');
  });
  it('rejects hostile and malformed profile URLs without any API request', async () => {
    for (const profile of [
      'https://steamcommunity.com.evil.test/id/a',
      'http://steamcommunity.com/id/a',
      'https://a@steamcommunity.com/id/b',
      'https://steamcommunity.com:8080/id/a',
      '765',
      '',
      `https://steamcommunity.com/profiles/765`,
    ]) {
      expect(await new SteamApi(profile, 'unit-key').getGameData(1)).toEqual(empty);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it('caches missing/private games and retries after one hour', async () => {
    let now = 1000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    request.mockResolvedValue({ response: { games: [] }, playerstats: { success: false } });
    const api = new SteamApi(id, 'unit-key');
    expect(await api.getGameData(100)).toEqual(empty);
    expect(await api.getGameData(100)).toEqual(empty);
    expect(request).toHaveBeenCalledTimes(2);
    now += 3600001;
    await api.getGameData(100);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('retains owned playtime when achievements fail and retries transient errors', async () => {
    request
      .mockResolvedValueOnce({ response: { games: [{ appid: 100, playtime_forever: 120 }] } })
      .mockRejectedValueOnce(new Error('offline'));
    const api = new SteamApi(id, 'unit-key');
    expect(await api.getGameData(100)).toEqual({ ...empty, playtimeHours: 2 });
    request
      .mockResolvedValueOnce({ response: { games: [{ appid: 100, playtime_forever: 120 }] } })
      .mockResolvedValueOnce({ playerstats: { success: true, achievements: [] } });
    expect(await api.getGameData(100)).toEqual({ playtimeHours: 2, achievements: [], achieved: 0, total: 0 });
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('retries transient vanity errors instead of permanently caching a rejected lookup', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    const api = new SteamApi('https://steamcommunity.com/id/example', 'unit-key');
    expect(await api.getGameData(1)).toEqual(empty);
    request
      .mockResolvedValueOnce({ response: { success: 1, steamid: id } })
      .mockResolvedValueOnce({ response: { games: [] } })
      .mockResolvedValueOnce({ playerstats: { success: false } });
    expect(await api.getGameData(1)).toEqual(empty);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('keeps the original Steam-only URL, resolves external URLs, and blanks non-app stores', () => {
    const url = 'https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/';
    expect(steamStoreUrl(['https://example.com/', url])).toBe(url);
    expect(resolveSteamAppId([], [{ url }])).toBe(3764200);
    expect(steamStoreUrl(['https://store.steampowered.com/sub/123/'])).toBe('');
  });
  it('ignores malformed achievement data without falsely claiming unlocked progress', async () => {
    request.mockResolvedValueOnce({ response: { games: [] } }).mockResolvedValueOnce({
      playerstats: {
        success: true,
        achievements: [
          null,
          { apiname: 'BAD', achieved: 1, unlocktime: -1 },
          { apiname: 'GOOD', achieved: 0, unlocktime: 0 },
        ],
      },
    });
    expect(await new SteamApi(id, 'unit-key').getGameData(100)).toEqual({
      playtimeHours: '',
      achievements: [{ apiname: 'GOOD', achieved: false, unlocktime: 0 }],
      achieved: 0,
      total: 1,
    });
  });
});
