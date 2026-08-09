import { GameEntry } from '@models/game.model';
import { DefaultFrontmatterKeyType } from '@settings/settings';
import * as utils from './utils';

// The real @settings/settings module cannot be loaded here: its import graph cycles
// through main.ts → obsidian, and jest.requireActual inside the mock factory returns a
// partial module (DefaultFrontmatterKeyType unassigned) mid-cycle. The enum's values are
// stable strings, so provide them directly.
jest.mock('@settings/settings', () => ({
  DefaultFrontmatterKeyType: { snakeCase: 'Snake Case', camelCase: 'Camel Case' },
  __esModule: true,
}));

describe('utils', () => {
  const game: GameEntry = {
    title: 'Final Fantasy VII Rebirth',
    developer: 'Square Enix',
    developers: ['Square Enix'],
  };

  it('replaceIllegalFileNameCharactersInString removes invalid characters', () => {
    expect(utils.replaceIllegalFileNameCharactersInString('Like a Dragon: Infinite Wealth')).toBe(
      'Like a Dragon Infinite Wealth',
    );
  });

  it('replaceIllegalFileNameCharactersInString removes separators', () => {
    expect(utils.replaceIllegalFileNameCharactersInString('Monster Hunter Wilds | Deluxe')).toBe(
      'Monster Hunter Wilds Deluxe',
    );
  });

  it('makeFileName uses the default title', () => {
    expect(utils.makeFileName(game)).toBe('Final Fantasy VII Rebirth.md');
  });

  it('makeFileName removes invalid title characters', () => {
    const newGame = {
      ...game,
      title: 'Metaphor: ReFantazio',
    };
    expect(utils.makeFileName(newGame)).toBe('Metaphor ReFantazio.md');
  });

  it('makeFileName supports template variables', () => {
    expect(utils.makeFileName(game, '{{developer}}-{{title}}')).toBe('Square Enix-Final Fantasy VII Rebirth.md');
  });

  it('makeFileName supports mixed variables', () => {
    const newGame = {
      ...game,
      title: 'Like a Dragon: Infinite Wealth',
    };
    expect(utils.makeFileName(newGame, '{{title}} - {{developer}}')).toBe(
      'Like a Dragon Infinite Wealth - Square Enix.md',
    );
  });

  it('makeFileStem matches the generated file name without extension', () => {
    expect(utils.makeFileStem(game, '{{developer}}-{{title}}')).toBe('Square Enix-Final Fantasy VII Rebirth');
  });

  it('makeScreenshotFileName creates zero-padded screenshot names', () => {
    expect(utils.makeScreenshotFileName(0)).toBe('screenshot-01.jpg');
    expect(utils.makeScreenshotFileName(11)).toBe('screenshot-12.jpg');
  });
});

describe('applyDefaultFrontMatter', () => {
  const makeGame = (): GameEntry => ({
    title: 'Elden Ring',
    developer: 'FromSoftware',
    genre: 'RPG',
    platform: 'PS5',
    ratingCount: 92,
  });

  it('keeps camelCase keys when the camelCase key type is requested', () => {
    const result = utils.applyDefaultFrontMatter(makeGame(), {}, DefaultFrontmatterKeyType.camelCase);
    expect(result).toMatchObject({
      title: 'Elden Ring',
      developer: 'FromSoftware',
      genre: 'RPG',
      ratingCount: 92,
    });
  });

  it('converts camelCase keys to snake_case for the snakeCase key type', () => {
    const result = utils.applyDefaultFrontMatter(makeGame(), {}, DefaultFrontmatterKeyType.snakeCase);
    expect(result).toMatchObject({
      title: 'Elden Ring',
      rating_count: 92,
      genre: 'RPG',
    });
  });

  it('merges a conflicting extra key as "existing, new"', () => {
    const result = utils.applyDefaultFrontMatter(makeGame(), { platform: 'PC' }, DefaultFrontmatterKeyType.camelCase);
    expect(result).toMatchObject({ platform: 'PS5, PC' });
  });

  it('leaves the value unchanged when the extra key matches the existing value', () => {
    const result = utils.applyDefaultFrontMatter(makeGame(), { platform: 'PS5' }, DefaultFrontmatterKeyType.camelCase);
    expect(result).toMatchObject({ platform: 'PS5' });
  });

  it('appends a new extra key', () => {
    const result = utils.applyDefaultFrontMatter(
      makeGame(),
      { publisher: 'Bandai Namco' },
      DefaultFrontmatterKeyType.camelCase,
    );
    expect(result).toMatchObject({ publisher: 'Bandai Namco' });
  });

  it('parses a YAML-string frontmatter argument and merges it', () => {
    const result = utils.applyDefaultFrontMatter(makeGame(), 'genre: Action', DefaultFrontmatterKeyType.camelCase);
    expect(result).toMatchObject({ genre: 'RPG, Action' });
  });
});

describe('parseFrontMatter / toStringFrontMatter', () => {
  it('parses plain key: value lines', () => {
    expect(utils.parseFrontMatter('title: Elden Ring\nrating: 92')).toEqual({
      title: 'Elden Ring',
      rating: '92',
    });
  });

  it('round-trips plain values through serialize then parse', () => {
    const serialized = utils.toStringFrontMatter({ title: 'Elden Ring', rating: '92' });
    expect(serialized).toBe('title: Elden Ring\nrating: 92');
    expect(utils.parseFrontMatter(serialized)).toEqual({ title: 'Elden Ring', rating: '92' });
  });

  it('wraps values containing colon-space in double quotes', () => {
    expect(utils.toStringFrontMatter({ website: 'https://example.com/x: y' })).toBe(
      'website: "https://example.com/x: y"',
    );
  });

  it('emits an empty key line for an empty value', () => {
    expect(utils.toStringFrontMatter({ key: '' })).toBe('key:');
  });

  it('passes quotes through unescaped when the value is not quoted', () => {
    expect(utils.toStringFrontMatter({ summary: 'He said "hi" there' })).toBe('summary: He said "hi" there');
  });

  it('escapes quotes inside quoted values with backslash', () => {
    expect(utils.toStringFrontMatter({ summary: 'He said "hi": there' })).toBe('summary: "He said \\"hi\\": there"');
  });

  it('truncates the value at the first newline instead of dropping the key', () => {
    expect(utils.toStringFrontMatter({ summary: 'line1\nline2' })).toBe('summary: line1');
  });

  it('round-trips a quoted, truncated value through serialize then parse', () => {
    expect(utils.parseFrontMatter(utils.toStringFrontMatter({ summary: 'He said "hi" then\ncontinued' }))).toEqual({
      summary: 'He said "hi" then',
    });
  });

  it('treats a comment line as a key with an empty value', () => {
    // parseFrontMatter behavior deliberately unchanged — plan 007 only touched serialization and substitution.
    expect(utils.parseFrontMatter('# foo')).toEqual({ '# foo': '' });
  });
});

describe('replaceVariableSyntax', () => {
  it('replaces a known placeholder with its value', () => {
    expect(utils.replaceVariableSyntax({ title: 'X' }, '{{title}}')).toBe('X');
  });

  it('preserves unknown placeholders (user template syntax)', () => {
    expect(utils.replaceVariableSyntax({ title: 'X' }, 'a {{nonexistent}} b')).toBe('a {{nonexistent}} b');
  });

  it('leaves text without placeholders unchanged', () => {
    expect(utils.replaceVariableSyntax({ title: 'X' }, 'plain text')).toBe('plain text');
  });

  it('treats $ patterns in values literally', () => {
    expect(utils.replaceVariableSyntax({ title: "Toy $' Story" }, '{{title}}')).toBe("Toy $' Story");
    expect(utils.replaceVariableSyntax({ title: 'A $& B $$ C' }, '{{title}}')).toBe('A $& B $$ C');
  });

  it('replaces known placeholders with empty values, leaving nothing dangling', () => {
    expect(utils.replaceVariableSyntax({ title: 'X', summary: '' }, '{{summary}}|{{title}}')).toBe('|X');
  });

  it('substitutes array variables like {{similarGames}}', () => {
    const similarGame: GameEntry = { title: 'X', similarGames: ['Dark Souls', 'Bloodborne'] };
    expect(utils.replaceVariableSyntax(similarGame, 'Liked: {{similarGames}}')).toBe('Liked: Dark Souls,Bloodborne');
  });

  it('returns an empty string for empty or whitespace-only text', () => {
    expect(utils.replaceVariableSyntax({ title: 'X' }, '   ')).toBe('');
  });
});

describe('replaceDateInString / getDate', () => {
  interface MomentApi {
    add(duration: { days: number }): MomentApi;
    format(fmt: string): string;
  }
  interface MomentStub {
    (): MomentApi;
    duration(offset: number, unit: string): { days: number };
  }

  // Deviation from the plan's fake-timer approach: window.moment is undefined in the
  // jsdom test env (moment is not a dependency). A frozen-clock moment stub is installed
  // instead — the utils.ts date logic (regex, offsets, formats) runs against real code.
  let momentApi: MomentApi;

  beforeAll(() => {
    const moment = (() => {
      const d = new Date('2026-01-15T12:00:00Z');
      momentApi = {
        add: (duration: { days: number }) => {
          d.setUTCDate(d.getUTCDate() + (duration?.days ?? 0));
          return momentApi;
        },
        format: (fmt: string) =>
          fmt
            .replace('YYYY', String(d.getUTCFullYear()))
            .replace('MM', String(d.getUTCMonth() + 1).padStart(2, '0'))
            .replace('DD', String(d.getUTCDate()).padStart(2, '0')),
      };
      return momentApi;
    }) as unknown as MomentStub;
    moment.duration = (offset: number) => ({ days: offset });
    (window as unknown as { moment?: MomentStub }).moment = moment;
  });

  afterAll(() => {
    delete (window as unknown as { moment?: MomentStub }).moment;
  });

  it('replaces {{DATE}} with the current date', () => {
    expect(utils.replaceDateInString('{{DATE}}')).toBe('2026-01-15');
  });

  it('applies day offsets to {{DATE±N}}', () => {
    expect(utils.replaceDateInString('{{DATE+1}}')).toBe('2026-01-16');
    expect(utils.replaceDateInString('{{DATE-2}}')).toBe('2026-01-13');
  });

  it('supports a custom format in {{DATE:format}}', () => {
    expect(utils.replaceDateInString('{{DATE:YYYY/MM/DD}}')).toBe('2026/01/15');
  });

  it('combines format and offset in {{DATE:format±N}}', () => {
    expect(utils.replaceDateInString('{{DATE:YYYY-MM-DD+7}}')).toBe('2026-01-22');
    expect(utils.replaceDateInString('{{DATE:YYYY-MM-DD-7}}')).toBe('2026-01-08');
  });

  it('leaves text without a date placeholder unchanged', () => {
    expect(utils.replaceDateInString('no date here')).toBe('no date here');
  });

  it('getDate applies the offset and format', () => {
    expect(utils.getDate({ format: 'YYYY-MM-DD', offset: 3 })).toBe('2026-01-18');
    expect(utils.getDate({ offset: 0 })).toBe('2026-01-15');
  });
});
