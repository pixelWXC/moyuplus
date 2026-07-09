export interface Disposable {
  dispose(): void;
}

type CommandCallback = (...args: unknown[]) => unknown;
type QuickPickItem = { label: string; [key: string]: unknown };
type MessageCallback = (message: unknown) => unknown;
type InlineCompletionProvider = {
  provideInlineCompletionItems(
    document: TextDocument,
    position: Position,
    context?: unknown,
    token?: unknown
  ): unknown;
};
type WebviewViewProvider = {
  resolveWebviewView(webviewView: WebviewView): unknown;
};

export interface Webview {
  html: string;
  options: { enableScripts?: boolean };
  readonly cspSource: string;
  readonly postedMessages: unknown[];
  onDidReceiveMessage(callback: MessageCallback): Disposable;
  postMessage(message: unknown): Promise<boolean>;
  receiveMessage(message: unknown): Promise<void>;
}

export interface WebviewView {
  webview: Webview;
}

export interface TextLine {
  text: string;
}

export interface TextDocument {
  lineAt(line: number): TextLine;
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}
}

export class Uri {
  private constructor(private readonly value: string) {}

  static file(filePath: string): Uri {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const prefixedPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return new Uri(`file://${encodeURI(prefixedPath)}`);
  }

  toString(): string {
    return this.value;
  }
}

const registeredCommands = new Map<string, CommandCallback>();
const registeredWebviewViewProviders = new Map<string, WebviewViewProvider>();
const registeredInlineCompletionProviders: Array<{ selector: unknown; provider: InlineCompletionProvider }> = [];

export const commands = {
  registerCommand(commandId: string, callback: CommandCallback): Disposable {
    registeredCommands.set(commandId, callback);

    return {
      dispose(): void {
        registeredCommands.delete(commandId);
      }
    };
  },

  async executeRegisteredCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    const callback = registeredCommands.get(commandId);
    if (!callback) {
      throw new Error(`Command is not registered: ${commandId}`);
    }

    return callback(...args);
  },

  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  }
};

export const window = {
  informationMessages: [] as string[],
  warningMessages: [] as string[],
  errorMessages: [] as string[],
  openDialogResult: undefined as Uri[] | undefined,
  quickPickResult: undefined as QuickPickItem | undefined,
  inputBoxResult: undefined as string | undefined,
  statusBarItems: [] as TestStatusBarItem[],

  async showInformationMessage(message: string): Promise<string> {
    window.informationMessages.push(message);
    return message;
  },

  async showWarningMessage(message: string): Promise<string> {
    window.warningMessages.push(message);
    return message;
  },

  async showErrorMessage(message: string): Promise<string> {
    window.errorMessages.push(message);
    return message;
  },

  async showOpenDialog(): Promise<Uri[] | undefined> {
    return window.openDialogResult;
  },

  async showQuickPick<T extends QuickPickItem>(): Promise<T | undefined> {
    return window.quickPickResult as T | undefined;
  },

  async showInputBox(): Promise<string | undefined> {
    return window.inputBoxResult;
  },

  createStatusBarItem(): TestStatusBarItem {
    const item = new TestStatusBarItem();
    window.statusBarItems.push(item);
    return item;
  },

  registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable {
    registeredWebviewViewProviders.set(viewId, provider);

    return {
      dispose(): void {
        registeredWebviewViewProviders.delete(viewId);
      }
    };
  },

  registeredWebviewViewProviderIds(): string[] {
    return [...registeredWebviewViewProviders.keys()];
  },

  registeredWebviewViewProvider(viewId: string): WebviewViewProvider | undefined {
    return registeredWebviewViewProviders.get(viewId);
  }
};

export const workspace = {
  workspaceFolders: undefined as { uri: Uri }[] | undefined
};

export const languages = {
  registerInlineCompletionItemProvider(selector: unknown, provider: InlineCompletionProvider): Disposable {
    registeredInlineCompletionProviders.push({ selector, provider });

    return {
      dispose(): void {
        const index = registeredInlineCompletionProviders.findIndex((entry) => entry.provider === provider);
        if (index >= 0) {
          registeredInlineCompletionProviders.splice(index, 1);
        }
      }
    };
  },

  registeredInlineCompletionSelectors(): unknown[] {
    return registeredInlineCompletionProviders.map((entry) => entry.selector);
  },

  async provideInlineCompletionItems(document: TextDocument, position: Position): Promise<unknown> {
    const provider = registeredInlineCompletionProviders.at(-1)?.provider;
    if (!provider) {
      throw new Error('No inline completion provider is registered.');
    }

    return provider.provideInlineCompletionItems(document, position);
  }
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2
} as const;

export function resetVSCodeShim(): void {
  registeredCommands.clear();
  registeredWebviewViewProviders.clear();
  registeredInlineCompletionProviders.length = 0;
  window.informationMessages.length = 0;
  window.warningMessages.length = 0;
  window.errorMessages.length = 0;
  window.openDialogResult = undefined;
  window.quickPickResult = undefined;
  window.inputBoxResult = undefined;
  window.statusBarItems.length = 0;
  workspace.workspaceFolders = undefined;
}

export function createTextDocument(lines: string[]): TextDocument {
  return {
    lineAt(line: number): TextLine {
      return { text: lines[line] ?? '' };
    }
  };
}

export function createWebviewView(): WebviewView {
  return {
    webview: new TestWebview()
  };
}

class TestWebview implements Webview {
  html = '';
  options: { enableScripts?: boolean } = {};
  readonly cspSource = 'vscode-resource:';
  readonly postedMessages: unknown[] = [];
  private readonly messageCallbacks: MessageCallback[] = [];

  onDidReceiveMessage(callback: MessageCallback): Disposable {
    this.messageCallbacks.push(callback);

    return {
      dispose: () => {
        const index = this.messageCallbacks.indexOf(callback);
        if (index >= 0) {
          this.messageCallbacks.splice(index, 1);
        }
      }
    };
  }

  async postMessage(message: unknown): Promise<boolean> {
    this.postedMessages.push(message);
    return true;
  }

  async receiveMessage(message: unknown): Promise<void> {
    for (const callback of this.messageCallbacks) {
      await callback(message);
    }
  }
}

class TestStatusBarItem implements Disposable {
  text = '';
  tooltip: string | undefined;
  command: string | undefined;
  visible = false;

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  dispose(): void {
    this.visible = false;
  }
}
