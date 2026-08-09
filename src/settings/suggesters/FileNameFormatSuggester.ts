import { AbstractInputSuggest, App } from 'obsidian';

// == Format Syntax Suggestion == //
export const DATE_SYNTAX = '{{DATE}}';
export const DATE_FORMAT_SYNTAX = '{{DATE:}}';
export const DATE_SYNTAX_SUGGEST_REGEX = /{{D?A?T?E?}?}?$/i;
export const DATE_FORMAT_SYNTAX_SUGGEST_REGEX = /{{D?A?T?E?:?$|{{DATE:[^\n\r}]*}}$/i;

export const TITLE_SYNTAX = '{{title}}';
export const TITLE_SYNTAX_SUGGEST_REGEX = /{{t?i?t?l?e?}?}?$/i;

export class FileNameFormatSuggest extends AbstractInputSuggest<string> {
  private lastInput = '';
  private readonly textInputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.textInputEl = inputEl;
  }

  protected getSuggestions(inputStr: string): string[] {
    const cursorPosition = this.textInputEl.selectionStart ?? inputStr.length;
    const lookbehind = 15;
    const inputBeforeCursor = inputStr.slice(Math.max(0, cursorPosition - lookbehind), cursorPosition);
    const suggestions: string[] = [];

    this.processToken(inputBeforeCursor, (match: RegExpMatchArray, suggestion: string) => {
      this.lastInput = match[0];
      suggestions.push(suggestion);
    });

    return suggestions;
  }

  selectSuggestion(item: string, _evt: MouseEvent | KeyboardEvent): void {
    const cursorPosition = this.textInputEl.selectionStart ?? this.textInputEl.value.length;
    const lastInputLength = this.lastInput.length;
    const currentInputValue = this.textInputEl.value;
    let insertedEndPosition = 0;

    const insert = (text: string, offset = 0) => {
      const start = cursorPosition - lastInputLength + offset;
      return `${currentInputValue.slice(0, start)}${text}${currentInputValue.slice(cursorPosition)}`;
    };

    this.processToken(item, (_match, suggestion) => {
      if (item.includes(suggestion)) {
        this.textInputEl.value = insert(item);
        insertedEndPosition = cursorPosition - lastInputLength + item.length;

        if (item === DATE_FORMAT_SYNTAX) {
          insertedEndPosition -= 2;
        }
      }
    });

    this.textInputEl.trigger('input');
    this.close();
    this.textInputEl.setSelectionRange(insertedEndPosition, insertedEndPosition);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    if (value) el.setText(value);
  }

  private processToken(input: string, callback: (match: RegExpMatchArray, suggestion: string) => void) {
    const dateFormatMatch = DATE_FORMAT_SYNTAX_SUGGEST_REGEX.exec(input);
    if (dateFormatMatch) callback(dateFormatMatch, DATE_FORMAT_SYNTAX);

    const dateMatch = DATE_SYNTAX_SUGGEST_REGEX.exec(input);
    if (dateMatch) callback(dateMatch, DATE_SYNTAX);

    const titleMatch = TITLE_SYNTAX_SUGGEST_REGEX.exec(input);
    if (titleMatch) callback(titleMatch, TITLE_SYNTAX);
  }
}
