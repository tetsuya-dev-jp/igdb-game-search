import { IgdbApi } from '@apis/igdb_api';
import { GameEntry } from '@models/game.model';
import { GameSearchModal } from './game_search_modal';
import { GameSuggestModal } from './game_suggest_modal';
import { createSettings } from '../../test/settings_fixture';

jest.mock('@apis/igdb_api', () => ({
  ...jest.requireActual('@apis/igdb_api'),
  IgdbApi: jest.fn(),
}));

const MockIgdbApi = IgdbApi as jest.Mock;

function makeSearchModal(callback: (error: Error | null, result?: GameEntry[]) => void) {
  const plugin = {
    app: {},
    settings: createSettings(),
    saveSettings: jest.fn(),
  };
  return { modal: new GameSearchModal(plugin as never, 'Elden Ring', callback), plugin };
}

function makeSuggestModal(onChoose: (error: Error | null, result?: GameEntry) => void) {
  const app = {};
  const games: GameEntry[] = [{ title: 'Elden Ring' }, { title: 'Bloodborne' }];
  return new GameSuggestModal(app as never, false, games, onChoose);
}

describe('GameSearchModal', () => {
  let mockGetByQuery: jest.Mock;

  beforeEach(() => {
    mockGetByQuery = jest.fn();
    MockIgdbApi.mockImplementation(() => ({ getByQuery: mockGetByQuery }));
  });

  it('dismissing without a search resolves the callback with an empty list, exactly once', () => {
    const callback = jest.fn();
    const { modal } = makeSearchModal(callback);

    modal.onClose();
    modal.onClose(); // double close must not double-callback

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, []);
  });

  it('Esc during an in-flight search discards the result and still settles the callback', async () => {
    const callback = jest.fn();
    const { modal } = makeSearchModal(callback);
    let resolveSearch!: (value: GameEntry[]) => void;
    mockGetByQuery.mockReturnValue(new Promise<GameEntry[]>(resolve => (resolveSearch = resolve)));

    const searchPromise = (modal as never as { searchGame(): Promise<void> }).searchGame();
    modal.onClose(); // user presses Esc while the request is in flight

    resolveSearch([{ title: 'Elden Ring' }]);
    await searchPromise;

    // the cancelled flag discards the late result; the onClose callback already settled the promise
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, []);
    expect(modal.close).toHaveBeenCalled();
  });

  it('a successful search delivers results and does not double-callback on later close', async () => {
    const callback = jest.fn();
    const { modal } = makeSearchModal(callback);
    const results: GameEntry[] = [{ title: 'Elden Ring' }];
    mockGetByQuery.mockResolvedValue(results);

    await (modal as never as { searchGame(): Promise<void> }).searchGame();
    modal.onClose(); // close after delivery must be a no-op for the callback

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, results);
    expect(modal.close).toHaveBeenCalled();
  });

  it('a failed search rejects the callback and does not double-callback on close', async () => {
    const callback = jest.fn();
    const { modal } = makeSearchModal(callback);
    const error = new Error('boom');
    mockGetByQuery.mockRejectedValue(error);

    await (modal as never as { searchGame(): Promise<void> }).searchGame();
    modal.onClose();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(error, undefined);
  });
});

describe('GameSuggestModal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('choosing a suggestion delivers the game, exactly once', () => {
    const onChoose = jest.fn();
    const modal = makeSuggestModal(onChoose);
    const game: GameEntry = { title: 'Elden Ring' };

    modal.onChooseSuggestion(game);
    modal.onClose(); // close after delivery is a no-op
    jest.advanceTimersByTime(0);

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(null, game);
  });

  it('dismissing without a choice resolves with undefined, exactly once', () => {
    const onChoose = jest.fn();
    const modal = makeSuggestModal(onChoose);

    modal.onClose();
    modal.onClose(); // double close must not double-callback
    jest.advanceTimersByTime(0);

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(null, undefined);
  });

  it('a selection wins over the close-triggered cancel (Obsidian closes before onChooseSuggestion)', () => {
    const onChoose = jest.fn();
    const modal = makeSuggestModal(onChoose);
    const game: GameEntry = { title: 'Elden Ring' };

    // Real Obsidian order (verified against obsidian.asar): selectSuggestion
    // calls close() first, then onChooseSuggestion() synchronously. The
    // deferred cancel must lose to the selection.
    modal.onClose();
    modal.onChooseSuggestion(game);
    jest.advanceTimersByTime(0);

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(null, game);
  });
});
