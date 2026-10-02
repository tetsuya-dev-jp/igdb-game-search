import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { App } from 'obsidian';
import GameSearchPlugin from './main';
import { DeepLApi } from '@apis/deepl_api';
import { IgdbApi } from '@apis/igdb_api';
import { SteamApi } from '@apis/steam_api';
import { createSettings } from '../test/settings_fixture';

const steam = {
  playtimeHours: 12.5,
  achievements: [{ apiname: 'ACH_1', achieved: true, unlocktime: 100 }],
  achieved: 1,
  total: 1,
};
let plugin: GameSearchPlugin;
let getSecret: jest.Mock<(name: string) => string | null>;
let getData: jest.SpiedFunction<SteamApi['getGameData']>;
let getTime: jest.SpiedFunction<IgdbApi['getTimeToBeat']>;
const game = {
  title: 'Requiem',
  igdbId: 123,
  websites: ['https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/'],
};

beforeEach(() => {
  plugin = Object.create(GameSearchPlugin.prototype) as GameSearchPlugin;
  plugin.settings = createSettings({
    useDefaultFrontmatter: false,
    enableCoverImageSave: false,
    enableScreenshotSave: false,
    frontmatter: '',
    content:
      '{{steamPlaytimeHours}} {{steamAchievements}} {{timeToBeatMain}} {{timeToBeatAverage}} {{timeToBeatCompletionist}}',
    enableSteam: false,
    enableTimeToBeat: false,
    steamProfile: '76561198000000000',
    steamApiKeySecretName: 'steam-test',
  });
  getSecret = jest.fn<(name: string) => string | null>().mockReturnValue('unit-test-key');
  plugin.app = { secretStorage: { getSecret } } as unknown as App;
  jest.spyOn(DeepLApi.prototype, 'translateGameEntry').mockImplementation(async g => g);
  getData = jest.spyOn(SteamApi.prototype, 'getGameData').mockResolvedValue(steam);
  getTime = jest
    .spyOn(IgdbApi.prototype, 'getTimeToBeat')
    .mockResolvedValue({ main: 8, average: 10, completionist: 16 });
});
afterEach(() => jest.restoreAllMocks());

describe('optional note enrichment', () => {
  it('makes no external enrichment or secret access when disabled', async () => {
    expect(await plugin.getRenderedContents(game)).toBe('[]');
    expect(getData).not.toHaveBeenCalled();
    expect(getTime).not.toHaveBeenCalled();
    expect(getSecret).not.toHaveBeenCalled();
  });
  it('uses the secret identifier, enriches the selected game, and keeps the input immutable', async () => {
    plugin.settings.enableSteam = true;
    plugin.settings.enableTimeToBeat = true;
    expect(await plugin.getRenderedContents(game)).toBe(
      '12.5 [{"apiname":"ACH_1","achieved":true,"unlocktime":100}] 8 10 16',
    );
    expect(getSecret).toHaveBeenCalledWith('steam-test');
    expect(getData).toHaveBeenCalledWith(3764200);
    expect(getTime).toHaveBeenCalledWith(123);
    expect(game).not.toHaveProperty('steamPlaytimeHours');
    expect(JSON.stringify(plugin.settings)).not.toContain('unit-test-key');
  });
  it('degrades missing/locked secret storage without blocking notes', async () => {
    plugin.settings.enableSteam = true;
    getSecret.mockReturnValue(null);
    expect(await plugin.getRenderedContents(game)).toBe('[]');
    expect(getData).not.toHaveBeenCalled();
    getSecret.mockImplementation(() => {
      throw new Error('locked');
    });
    expect(await plugin.getRenderedContents(game)).toBe('[]');
    plugin.app = {} as App;
    expect(await plugin.getRenderedContents(game)).toBe('[]');
  });
  it('keeps a cached client only while profile and secret values remain unchanged', async () => {
    plugin.settings.enableSteam = true;
    await plugin.getRenderedContents(game);
    await plugin.getRenderedContents(game);
    expect(getData.mock.contexts[0]).toBe(getData.mock.contexts[1]);
    getSecret.mockReturnValue('unit-test-rotated-key');
    await plugin.getRenderedContents(game);
    expect(getData.mock.contexts[2]).not.toBe(getData.mock.contexts[1]);
  });
  it('does not fetch Steam when profile, secret name or app match is absent', async () => {
    plugin.settings.enableSteam = true;
    plugin.settings.steamProfile = '';
    await plugin.getRenderedContents(game);
    plugin.settings.steamProfile = '76561198000000000';
    plugin.settings.steamApiKeySecretName = '';
    await plugin.getRenderedContents(game);
    plugin.settings.steamApiKeySecretName = 'steam-test';
    await plugin.getRenderedContents({ title: 'no Steam game' });
    expect(getData).not.toHaveBeenCalled();
  });
});
