import * as obsidian from 'obsidian';
import { jest } from '@jest/globals';

export const requestUrl: typeof obsidian.requestUrl = (request: string | obsidian.RequestUrlParam) => {
  return fetch(request as string).then(res => res.json()) as obsidian.RequestUrlResponsePromise;
};

export class Plugin {
  app: unknown = {};
  manifest = { id: 'igdb-game-search', version: '0.0.0', minAppVersion: '0.0.0' };
  loadData = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
  saveData = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  addRibbonIcon = jest.fn<() => { addClass: () => void }>().mockReturnValue({ addClass: jest.fn() });
  addCommand = jest.fn();
  addSettingTab = jest.fn();
}

export class Notice {
  constructor(message: string) {
    this.message = message;
  }
  message: string;
}

export class Modal {
  app: App;
  contentEl: unknown;
  constructor(app: App) {
    this.app = app;
    this.contentEl = {
      empty: jest.fn(),
      createEl: jest.fn().mockReturnValue({ addClass: jest.fn(), createEl: jest.fn(), createDiv: jest.fn() }),
      createDiv: jest.fn((_cls?: unknown, cb?: (el: unknown) => void) => {
        cb?.({});
        return {};
      }),
    };
  }
  open = jest.fn();
  close = jest.fn();
  onOpen() {}
  onClose() {}
}

export class SuggestModal extends Modal {
  constructor(app: App) {
    super(app);
  }
  setPlaceholder = jest.fn();
}

export class AbstractInputSuggest {}

export class PluginSettingTab {}

export class TFile {}

export class MarkdownView {}

export class App {}

export class Setting {
  constructor(_containerEl: unknown) {}
  setName = jest.fn().mockReturnValue(this);
  setDesc = jest.fn().mockReturnValue(this);
  setHeading = jest.fn().mockReturnValue(this);
  addText = jest.fn().mockReturnValue(this);
  addToggle = jest.fn().mockReturnValue(this);
  addDropdown = jest.fn().mockReturnValue(this);
  addButton = jest.fn((cb?: (btn: ButtonComponent) => void) => {
    cb?.(new ButtonComponent());
    return this;
  });
  addSearch = jest.fn().mockReturnValue(this);
}

// Faithful to real Obsidian: normalizePath('') returns '/' (root), which is
// truthy — callers must guard the root case or they build '//' paths.
export const normalizePath = (p: string) => (p === '' ? '/' : p.replace(/\/+/g, '/'));

export class TextComponent {
  inputEl: HTMLInputElement;
  constructor() {
    this.inputEl = createEl('input');
  }
  setValue = jest.fn((v: string) => {
    this.inputEl.value = v;
    return this;
  });
  setPlaceholder = jest.fn().mockReturnValue(this);
  onChange = jest.fn().mockReturnValue(this);
}

export class ButtonComponent {
  setButtonText = jest.fn().mockReturnValue(this);
  setCta = jest.fn().mockReturnValue(this);
  setDisabled = jest.fn().mockReturnValue(this);
  onClick = jest.fn().mockReturnValue(this);
}
