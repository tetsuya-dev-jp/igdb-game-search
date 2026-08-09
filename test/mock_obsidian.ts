/* eslint-disable @typescript-eslint/no-explicit-any -- test mock: loose typing is intentional */
import * as obsidian from 'obsidian';

export const requestUrl: typeof obsidian.requestUrl = (request: string | obsidian.RequestUrlParam) => {
  return fetch(request as string).then(res => res.json()) as obsidian.RequestUrlResponsePromise;
};

export class Plugin {
  app: any = {};
  manifest = { id: 'igdb-game-search', version: '0.0.0', minAppVersion: '0.0.0' };
  loadData = jest.fn().mockResolvedValue({});
  saveData = jest.fn().mockResolvedValue(undefined);
  addRibbonIcon = jest.fn().mockReturnValue({ addClass: jest.fn() });
  addCommand = jest.fn();
  addSettingTab = jest.fn();
}

export class Notice {
  constructor(message: any) {
    this.message = message;
  }
  message: any;
}

export class Modal {
  app: any;
  contentEl: any;
  constructor(app: any) {
    this.app = app;
    this.contentEl = { empty: jest.fn(), createEl: jest.fn().mockReturnValue({ addClass: jest.fn() }) };
  }
  open = jest.fn();
  close = jest.fn();
  onOpen() {}
  onClose() {}
}

export class SuggestModal extends Modal {
  constructor(app: any) {
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
  constructor(_containerEl: any) {}
  setName = jest.fn().mockReturnValue(this);
  setDesc = jest.fn().mockReturnValue(this);
  setHeading = jest.fn().mockReturnValue(this);
  addText = jest.fn().mockReturnValue(this);
  addToggle = jest.fn().mockReturnValue(this);
  addDropdown = jest.fn().mockReturnValue(this);
  addButton = jest.fn().mockReturnValue(this);
  addSearch = jest.fn().mockReturnValue(this);
}

export const normalizePath = (p: string) => p.replace(/\/+/g, '/');
