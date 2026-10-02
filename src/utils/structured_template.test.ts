import { describe, expect, it } from '@jest/globals';
import { replaceVariableSyntax, toStringFrontMatter } from './utils';
import { GameEntry } from '@models/game.model';

const game: GameEntry = {
  title: 'Resident Evil Requiem',
  genres: ['Shooter', 'Puzzle', 'Adventure'],
  platforms: ['Xbox Series X|S', 'Nintendo Switch 2', 'PC (Microsoft Windows)', 'PlayStation 5'],
  developers: ['Capcom Development Division 1', 'Other'],
  publishers: ['Capcom', 'Other'],
  websites: [
    'https://www.residentevil.com/requiem/en-us/',
    'https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/',
  ],
  steamStoreUrl: 'https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/',
  localCoverImage: '00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem.jpg',
  localScreenshots: [
    '00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem/screenshot-01.jpg',
    'other.jpg',
  ],
  firstReleaseDate: '2026-02-27',
  totalRatingCount: 333,
};

describe('structured game template variables', () => {
  it('reproduces the Resident Evil Requiem cleanup with real lists and wikilinks', () => {
    const text = replaceVariableSyntax(
      game,
      'Title: {{title}}\nGenre: {{genres|yaml}}\nPlatform: {{platforms|yaml}}\nCover: {{localCoverWikilink|yaml}}\nBackdrop: {{firstScreenshotWikilink|yaml}}\nDeveloper: {{developers|first}}\nPublisher: {{publishers|first}}\nStoreUrl: {{steamStoreUrl}}\nReleaseDate: {{firstReleaseDate}}\nMetacritic: {{totalRatingCount}}',
    );
    expect(text).toBe(
      'Title: Resident Evil Requiem\nGenre: ["Shooter","Puzzle","Adventure"]\nPlatform: ["Xbox Series X|S","Nintendo Switch 2","PC (Microsoft Windows)","PlayStation 5"]\nCover: "[[00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem.jpg]]"\nBackdrop: "[[00 - Atlas/Archive/Attachments/09 - The Arcade/Resident Evil Requiem/screenshot-01.jpg]]"\nDeveloper: Capcom Development Division 1\nPublisher: Capcom\nStoreUrl: https://store.steampowered.com/app/3764200/Resident_Evil_Requiem/\nReleaseDate: 2026-02-27\nMetacritic: 333',
    );
  });
  it('preserves old CSV array interpolation and unknown placeholders', () => {
    expect(replaceVariableSyntax(game, '{{genres}} {{UNKNOWN}} {{GENRES}}')).toBe(
      'Shooter,Puzzle,Adventure {{UNKNOWN}} Shooter,Puzzle,Adventure',
    );
    expect(toStringFrontMatter({ genres: ['A', 'B'] })).toBe('genres: A,B');
  });
  it('offers JSON aliases for every existing multi-value field', () => {
    for (const name of [
      'platforms',
      'genres',
      'developers',
      'publishers',
      'screenshots',
      'websites',
      'alternativeTitles',
      'themes',
      'gameModes',
      'playerPerspectives',
      'similarGames',
      'localScreenshots',
    ]) {
      const context = { ...game, [name]: ['A, B', 'It\'s "quoted"', 'line\nbreak'] };
      expect(JSON.parse(replaceVariableSyntax(context, `{{${name}List}}`))).toEqual(
        context[name as keyof typeof context],
      );
    }
  });
  it('provides empty safe defaults without credentials or images', () => {
    expect(
      replaceVariableSyntax({ title: 'x' }, '{{genresList}} {{steamAchievements}} {{timeToBeatList}} {{timeToBeat}}'),
    ).toBe('[] [] ["","",""] {"main":"","average":"","completionist":""}');
    expect(
      replaceVariableSyntax(
        { title: 'x' },
        'Cover: {{localCoverWikilink|yaml}}\nBackdrop: {{firstScreenshotWikilink|yaml}}\nSteam: {{steamPlaytimeHours|yaml}}',
      ),
    ).toBe('Cover: ""\nBackdrop: ""\nSteam: ""');
  });
  it('uses first and custom join filters with quote control', () => {
    expect(
      replaceVariableSyntax(
        { ...game, developers: ['ACME: "One"', 'B'] },
        '{{developers|first|yaml}} {{genres|join: / }}',
      ),
    ).toBe('"ACME: \\"One\\"" Shooter / Puzzle / Adventure');
  });
  it('does not expand placeholders or Templater delimiters inside metadata', () => {
    const title = 'It\'s "quoted" $& {{genres}} <%x%>\nnext';
    const rendered = replaceVariableSyntax({ ...game, title }, 'const title = {{title|json}}; {{title}}');
    expect(rendered).toContain('\\u003c%x%\\u003e');
    expect(rendered).toContain('{{genres}}');
    expect(JSON.parse(replaceVariableSyntax({ ...game, title }, '{{title|json}}'))).toBe(title);
  });
  it('keeps unsupported filters intact without evaluating code', () => {
    expect(replaceVariableSyntax(game, '{{genres|eval}} <%= globalThis.hacked = true %>')).toBe(
      '{{genres|eval}} <%= globalThis.hacked = true %>',
    );
  });
});
