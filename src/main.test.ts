/* eslint-disable @typescript-eslint/no-explicit-any -- test: plugin instance is assembled without onload, loose typing is intentional */
import { GameEntry } from '@models/game.model';
import GameSearchPlugin from './main';
import { createSettings } from '../test/settings_fixture';

jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  requestUrl: jest.fn(),
}));

import { requestUrl } from 'obsidian';

const mockRequestUrl = requestUrl as jest.Mock;

describe('GameSearchPlugin.getRenderedContents', () => {
  const game: GameEntry = {
    title: 'Elden Ring',
    summary: 'A dark fantasy action RPG',
    genre: 'RPG',
    releaseYear: '2022',
  };

  let plugin: any;

  beforeEach(() => {
    plugin = Object.create(GameSearchPlugin.prototype);
    plugin.settings = createSettings();
    plugin.app = {
      vault: { cachedRead: jest.fn().mockResolvedValue('') },
      metadataCache: {},
    };
  });

  it('renders the default frontmatter block when no template or content is set', async () => {
    const output = await plugin.getRenderedContents(game);

    expect(output.startsWith('---\n')).toBe(true);
    expect(output.endsWith('---\n')).toBe(true);
    expect(output).toContain('title: Elden Ring');
    expect(output).toContain('summary: A dark fantasy action RPG');
  });

  it('substitutes variables in the content setting', async () => {
    plugin.settings.content = '## {{title}}\n{{summary}}';

    const output = await plugin.getRenderedContents(game);

    expect(output).toContain('## Elden Ring');
    expect(output).toContain('A dark fantasy action RPG');
  });

  it('uses the template file when set, substituting variables', async () => {
    plugin.settings.templateFile = 'templates/game';
    plugin.app.metadataCache = {
      getFirstLinkpathDest: jest.fn().mockReturnValue({ path: 'templates/game' }),
    };
    plugin.app.vault.cachedRead.mockResolvedValue('## {{title}}\n{{summary}}');

    const output = await plugin.getRenderedContents(game);

    expect(output).toBe('## Elden Ring\nA dark fantasy action RPG');
    expect(plugin.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('templates/game', '');
    expect(plugin.app.vault.cachedRead).toHaveBeenCalledTimes(1);
  });

  it('emits no frontmatter block when useDefaultFrontmatter is off', async () => {
    plugin.settings.useDefaultFrontmatter = false;

    const output = await plugin.getRenderedContents(game);

    expect(output).not.toContain('---');
    expect(output).toBe('');
  });

  it('emits the extra frontmatter block when set without the default frontmatter', async () => {
    plugin.settings.useDefaultFrontmatter = false;
    plugin.settings.frontmatter = 'play_status: backlog';
    plugin.settings.content = 'Body text';

    const output = await plugin.getRenderedContents(game);

    expect(output.startsWith('---\n')).toBe(true);
    expect(output).toContain('play_status: backlog');
    expect(output).toContain('Body text');
  });

  it('still renders when translation is enabled (no key / english locale short-circuits)', async () => {
    plugin.settings.enableTranslation = true;

    const output = await plugin.getRenderedContents(game);

    expect(output).toContain('title: Elden Ring');
  });
});

describe('GameSearchPlugin.downloadAndSaveImage', () => {
  let plugin: any;

  beforeEach(() => {
    mockRequestUrl.mockReset();
    mockRequestUrl.mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(8) });

    plugin = Object.create(GameSearchPlugin.prototype);
    plugin.settings = createSettings();
    plugin.app = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          mkdir: jest.fn().mockResolvedValue(undefined),
          writeBinary: jest.fn().mockResolvedValue(undefined),
          readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        },
      },
      metadataCache: {},
    };
  });

  it('writes a fresh file to the requested path', async () => {
    const result = await plugin.downloadAndSaveImage(
      'cover.jpg',
      'assets/covers',
      'https://images.igdb.com/x/cover.jpg',
    );

    expect(result).toBe('assets/covers/cover.jpg');
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledTimes(1);
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledWith(
      'assets/covers/cover.jpg',
      expect.any(ArrayBuffer),
    );
  });

  it('picks a suffixed path when the file already exists', async () => {
    plugin.app.vault.adapter.exists.mockImplementation(async (p: string) => p.endsWith('cover.jpg'));

    const result = await plugin.downloadAndSaveImage(
      'cover.jpg',
      'assets/covers',
      'https://images.igdb.com/x/cover.jpg',
    );

    expect(result).toBe('assets/covers/cover-2.jpg');
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledWith(
      'assets/covers/cover-2.jpg',
      expect.any(ArrayBuffer),
    );
  });

  it('keeps incrementing the suffix through multiple collisions', async () => {
    plugin.app.vault.adapter.exists.mockImplementation(
      async (p: string) => p.endsWith('cover.jpg') || p.endsWith('cover-2.jpg'),
    );

    const result = await plugin.downloadAndSaveImage(
      'cover.jpg',
      'assets/covers',
      'https://images.igdb.com/x/cover.jpg',
    );

    expect(result).toBe('assets/covers/cover-3.jpg');
  });

  it('writes to a clean root path when the directory is empty (no double slash)', async () => {
    plugin.app.vault.adapter.exists.mockResolvedValue(false);
    plugin.app.vault.adapter.writeBinary.mockResolvedValue(undefined);
    plugin.app.vault.adapter.readBinary.mockResolvedValue(new ArrayBuffer(8));

    const result = await plugin.downloadAndSaveImage('cover.jpg', '', 'https://images.igdb.com/x/cover.jpg');

    // Regression: real Obsidian normalizePath('') returns '/', which used to
    // produce '//cover.jpg' — un-resolvable by vault.getAbstractFileByPath.
    expect(result).toBe('cover.jpg');
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledWith('cover.jpg', expect.anything());
  });

  it('writes to a clean path with no leading slash when directory is empty', async () => {
    const result = await plugin.downloadAndSaveImage('cover.jpg', '', 'https://images.igdb.com/x/cover.jpg');

    expect(result).toBe('cover.jpg');
    expect(result.startsWith('/')).toBe(false);
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledWith('cover.jpg', expect.any(ArrayBuffer));

    // round-trip: the path embedded in frontmatter is exactly the path the file was written to,
    // so vault.getAbstractFileByPath resolves it to the written file
    const writtenPath = plugin.app.vault.adapter.writeBinary.mock.calls[0][0];
    plugin.app.vault.getAbstractFileByPath = jest.fn((p: string) => (p === writtenPath ? { path: p } : null));
    expect(plugin.app.vault.getAbstractFileByPath(result)).toEqual({ path: 'cover.jpg' });
  });

  it('resolves names without an extension', async () => {
    plugin.app.vault.adapter.exists.mockImplementation(async (p: string) => p.endsWith('cover'));

    const result = await plugin.downloadAndSaveImage('cover', 'assets', 'https://images.igdb.com/x/cover.jpg');

    expect(result).toBe('assets/cover-2');
  });

  it('returns an empty string and skips the write when the download fails', async () => {
    mockRequestUrl.mockRejectedValue(new Error('network down'));

    const result = await plugin.downloadAndSaveImage(
      'cover.jpg',
      'assets/covers',
      'https://images.igdb.com/x/cover.jpg',
    );

    expect(result).toBe('');
    expect(plugin.app.vault.adapter.writeBinary).not.toHaveBeenCalled();
  });

  it('re-resolves and rewrites when another save clobbers the path mid-write', async () => {
    const adapter = plugin.app.vault.adapter;
    let coverExistsCalls = 0;
    // ensureDirectory also probes exists() for each path segment; count only
    // probes of the candidate itself. Initial resolve sees cover.jpg free; by
    // the re-check it is claimed.
    adapter.exists.mockImplementation(async (p: string) => {
      if (p.endsWith('cover.jpg')) {
        coverExistsCalls += 1;
        return coverExistsCalls > 1;
      }
      return false;
    });
    // Bytes on disk are not ours (different length than the 8-byte write).
    adapter.readBinary.mockResolvedValue(new ArrayBuffer(4));

    const result = await plugin.downloadAndSaveImage(
      'cover.jpg',
      'assets/covers',
      'https://images.igdb.com/x/cover.jpg',
    );

    expect(result).toBe('assets/covers/cover-2.jpg');
    expect(adapter.writeBinary).toHaveBeenCalledTimes(2);
    expect(adapter.writeBinary).toHaveBeenNthCalledWith(1, 'assets/covers/cover.jpg', expect.any(ArrayBuffer));
    expect(adapter.writeBinary).toHaveBeenNthCalledWith(2, 'assets/covers/cover-2.jpg', expect.any(ArrayBuffer));
  });
});

describe('GameSearchPlugin.getScreenshotDirectory', () => {
  let plugin: any;

  beforeEach(() => {
    plugin = Object.create(GameSearchPlugin.prototype);
    plugin.settings = createSettings();
    plugin.app = { vault: {}, metadataCache: {} };
  });

  it('returns the game folder with no leading slash when the root directory is empty', () => {
    expect(plugin.getScreenshotDirectory({ title: 'Elden Ring' }, '')).toBe('Elden Ring');
  });

  it('prefixes the game folder with the root directory when set', () => {
    expect(plugin.getScreenshotDirectory({ title: 'Elden Ring' }, 'assets')).toBe('assets/Elden Ring');
  });
});
