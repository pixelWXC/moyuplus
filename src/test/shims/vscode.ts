export interface Disposable {
  dispose(): void;
}

type CommandCallback = (...args: unknown[]) => unknown;
type QuickPickItem = { label: string; [key: string]: unknown };
type MessageCallback = (message: unknown) => unknown;
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

export function resetVSCodeShim(): void {
  registeredCommands.clear();
  registeredWebviewViewProviders.clear();
  window.informationMessages.length = 0;
  window.warningMessages.length = 0;
  window.errorMessages.length = 0;
  window.openDialogResult = undefined;
  window.quickPickResult = undefined;
  workspace.workspaceFolders = undefined;
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
