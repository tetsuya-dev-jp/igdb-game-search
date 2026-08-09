/* eslint-disable @typescript-eslint/no-explicit-any -- test: plugin instance is assembled without onload, loose typing is intentional */
import { GameEntry } from '@models/game.model';
import GameSearchPlugin from './main';
import { createSettings } from '../test/settings_fixture';

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
