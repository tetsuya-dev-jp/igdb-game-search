import { GameEntry } from '@models/game.model';
import * as utils from './utils';

jest.mock('@settings/settings', () => jest.fn());

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
