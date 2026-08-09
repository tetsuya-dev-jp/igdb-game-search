import { App, SuggestModal } from 'obsidian';
import { GameEntry } from '@models/game.model';

export class GameSuggestModal extends SuggestModal<GameEntry> {
  // Cancel contract: dismissing the modal without a choice resolves the caller's
  // promise with (null, undefined) exactly once.
  private delivered = false;

  constructor(
    app: App,
    private readonly showCoverImageInSearch: boolean,
    private readonly suggestion: GameEntry[],
    private readonly onChoose: (error: Error | null, result?: GameEntry) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): GameEntry[] {
    const searchQuery = query.toLowerCase();
    return this.suggestion.filter(game => {
      return (
        game.title?.toLowerCase().includes(searchQuery) ||
        game.platform?.toLowerCase().includes(searchQuery) ||
        game.developer?.toLowerCase().includes(searchQuery) ||
        game.publisher?.toLowerCase().includes(searchQuery)
      );
    });
  }

  renderSuggestion(game: GameEntry, el: HTMLElement) {
    el.addClass('game-suggestion-item');

    const coverImageUrl = game.coverLargeUrl || game.coverUrl || game.coverSmallUrl;
    if (this.showCoverImageInSearch && coverImageUrl) {
      el.createEl('img', {
        cls: 'game-cover-image',
        attr: {
          src: coverImageUrl,
          alt: `Cover Image for ${game.title}`,
        },
      });
    }

    const textContainer = el.createDiv({ cls: 'game-text-info' });
    textContainer.createDiv({ text: game.title });

    const releaseYear = game.releaseYear ? `(${game.releaseYear})` : '';
    const platform = game.platform ? ` ${game.platform}` : '';
    const developer = game.developer ? `, ${game.developer}` : '';
    textContainer.createEl('small', { text: `${releaseYear}${platform}${developer}`.trim() });
  }

  onChooseSuggestion(game: GameEntry) {
    this.delivered = true;
    this.onChoose(null, game);
  }

  onClose(): void {
    // Obsidian's SuggestModal.selectSuggestion calls close() BEFORE
    // onChooseSuggestion() (verified against obsidian.asar). If we delivered
    // the cancel synchronously here, every selection would be swallowed as a
    // cancel (the close-triggered cancel wins the promise). Defer the cancel
    // by one tick: a real selection sets delivered synchronously right after
    // close(), so the deferred cancel sees it and no-ops; a genuine dismiss
    // (Esc / click-away) has no pending selection and delivers undefined.
    if (this.delivered) return;
    window.setTimeout(() => {
      if (!this.delivered) {
        this.delivered = true;
        this.onChoose(null, undefined);
      }
    }, 0);
  }
}
