import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { App } from 'obsidian';
import GameSearchPlugin from './main';
import { IgdbApi } from '@apis/igdb_api';
import { DeepLApi } from '@apis/deepl_api';
import { createSettings } from '../test/settings_fixture';

let plugin: GameSearchPlugin;
let getTime: jest.SpiedFunction<IgdbApi['getTimeToBeat']>;
beforeEach(() => {
  plugin = Object.create(GameSearchPlugin.prototype) as GameSearchPlugin;
  plugin.settings = createSettings({
    useDefaultFrontmatter: false,
    frontmatter: '',
    content: '{{timeToBeatMain}} / {{timeToBeatAverage}} / {{timeToBeatCompletionist}}',
    enableCoverImageSave: false,
    enableScreenshotSave: false,
    enableSteam: false,
  });
  plugin.app = {} as App;
  jest.spyOn(DeepLApi.prototype, 'translateGameEntry').mockImplementation(async game => game);
  getTime = jest
    .spyOn(IgdbApi.prototype, 'getTimeToBeat')
    .mockResolvedValue({ main: 8, average: 10, completionist: 16 });
});
afterEach(() => jest.restoreAllMocks());

describe('automatic time-to-beat metadata', () => {
  it('fetches time for the selected game without enabling a setting', async () => {
    expect(await plugin.getRenderedContents({ title: 'Selected game', igdbId: 123 })).toBe('8 / 10 / 16');
    expect(getTime).toHaveBeenCalledWith(123);
  });
  it.each([false, true])(
    'ignores and removes legacy enableTimeToBeat=%s without changing other settings',
    async legacy => {
      const original = Object.freeze({
        enableTimeToBeat: legacy,
        fileNameFormat: '{{title}}',
        content: '{{timeToBeatMain}}',
        useDefaultFrontmatter: false,
      });
      plugin.loadData = jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue(original);
      const saveData = jest.fn<(data: unknown) => Promise<void>>().mockResolvedValue(undefined);
      plugin.saveData = saveData;
      await plugin.loadSettings();
      expect(plugin.settings).not.toHaveProperty('enableTimeToBeat');
      expect(plugin.settings.fileNameFormat).toBe('{{title}}');
      expect(await plugin.getRenderedContents({ title: 'Selected game', igdbId: 123 })).toBe('8');
      await plugin.saveSettings();
      expect(saveData).toHaveBeenCalledWith(expect.not.objectContaining({ enableTimeToBeat: legacy }));
      expect(original.enableTimeToBeat).toBe(legacy);
    },
  );
  it('keeps missing estimates blank instead of blocking note rendering', async () => {
    getTime.mockResolvedValue({ main: '', average: '', completionist: '' });
    expect(await plugin.getRenderedContents({ title: 'No estimates', igdbId: 124 })).toBe('/  /');
    expect(getTime).toHaveBeenCalledWith(124);
  });
  it('does not request time for metadata without an IGDB game id', async () => {
    expect(await plugin.getRenderedContents({ title: 'No id' })).toBe('/  /');
    expect(getTime).not.toHaveBeenCalled();
  });
});
