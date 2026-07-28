export interface Disposable {
  dispose(): void;
}

export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64
} as const;

export const FileChangeType = {
  Changed: 1,
  Created: 2,
  Deleted: 3
} as const;

export class FileSystemError extends Error {
  static FileNotFound(uri?: Uri): FileSystemError {
    return new FileSystemError(`File not found: ${uri?.toString() ?? ''}`);
  }

  static FileExists(uri?: Uri): FileSystemError {
    return new FileSystemError(`File exists: ${uri?.toString() ?? ''}`);
  }

  static NoPermissions(message?: string): FileSystemError {
    return new FileSystemError(message ?? 'No permissions.');
  }
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
type CustomReadonlyEditorProvider = {
  openCustomDocument(uri: Uri, openContext: unknown, token: unknown): unknown;
  resolveCustomEditor(document: unknown, webviewPanel: { webview: Webview }, token: unknown): unknown;
};

export interface Webview {
  html: string;
  options: { enableScripts?: boolean; localResourceRoots?: Uri[] };
  readonly cspSource: string;
  readonly postedMessages: unknown[];
  onDidReceiveMessage(callback: MessageCallback): Disposable;
  postMessage(message: unknown): Promise<boolean>;
  deferNextPostMessage(): DeferredPostMessage;
  receiveMessage(message: unknown): Promise<void>;
  asWebviewUri(uri: Uri): Uri;
}

export interface DeferredPostMessage {
  readonly message: unknown;
  resolve(result?: boolean): void;
}

export interface WebviewView {
  webview: Webview;
  visible: boolean;
  onDidChangeVisibility(callback: () => unknown): Disposable;
  onDidDispose(callback: () => unknown): Disposable;
  setVisible(visible: boolean): Promise<void>;
  dispose(): Promise<void>;
}

export interface WebviewPanel {
  readonly viewType: string;
  readonly title: string;
  readonly webview: Webview;
  visible: boolean;
  active: boolean;
  readonly revealCalls: Array<{ viewColumn?: number; preserveFocus?: boolean }>;
  reveal(viewColumn?: number, preserveFocus?: boolean): void;
  onDidChangeViewState(callback: (event: { webviewPanel: WebviewPanel }) => unknown): Disposable;
  onDidDispose(callback: () => unknown): Disposable;
  setVisible(visible: boolean): Promise<void>;
  dispose(): Promise<void>;
}

export interface TextLine {
  text: string;
}

export interface TextDocument {
  readonly uri?: Uri;
  languageId?: string;
  lineAt(line: number): TextLine;
}

export interface TextEditor {
  document: TextDocument;
  selection: Selection;
  edit(callback: (editBuilder: TextEditorEdit) => void): Promise<boolean>;
}

export interface TextEditorEdit {
  insert(position: Position, text: string): void;
  replace(range: Range, text: string): void;
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class Selection {
  constructor(readonly active: Position) {}
}

export class Uri {
  private constructor(private readonly value: string) {}

  static file(filePath: string): Uri {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const prefixedPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return new Uri(`file://${encodeURI(prefixedPath)}`);
  }

  static parse(value: string): Uri {
    return new Uri(value);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(`${base.toString().replace(/\/$/, '')}/${segments.map(encodeURIComponent).join('/')}`);
  }

  toString(): string {
    return this.value;
  }

  get scheme(): string {
    return this.value.split(':', 1)[0];
  }

  get fsPath(): string {
    return decodeURI(this.value.replace(/^file:\/\//, ''));
  }
}

const registeredCommands = new Map<string, CommandCallback>();
const registeredWebviewViewProviders = new Map<string, WebviewViewProvider>();
const registeredCustomEditorProviders = new Map<string, CustomReadonlyEditorProvider>();
const registeredInlineCompletionProviders: Array<{ selector: unknown; provider: InlineCompletionProvider }> = [];
const registeredFileSystemProviders = new Map<string, unknown>();
const executedBuiltinCommandCalls: Array<{ commandId: string; args: unknown[] }> = [];
const failedBuiltinCommands = new Map<string, Error[]>();
const contextValues = new Map<string, unknown>();

export const commands = {
  registerCommand(commandId: string, callback: CommandCallback): Disposable {
    registeredCommands.set(commandId, callback);

    return {
      dispose(): void {
        registeredCommands.delete(commandId);
      }
    };
  },

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    const callback = registeredCommands.get(commandId);
    if (callback) {
      return callback(...args);
    }

    if (commandId === 'setContext') {
      contextValues.set(String(args[0]), args[1]);
      return undefined;
    }

    executedBuiltinCommandCalls.push({ commandId, args });
    const failures = failedBuiltinCommands.get(commandId);
    const failure = failures?.shift();
    if (failures?.length === 0) failedBuiltinCommands.delete(commandId);
    if (failure) throw failure;
    return undefined;
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
  },

  executedBuiltinCommands(): Array<{ commandId: string; args: unknown[] }> {
    return [...executedBuiltinCommandCalls];
  },

  failNextBuiltinCommand(commandId: string, error: Error): void {
    const failures = failedBuiltinCommands.get(commandId) ?? [];
    failures.push(error);
    failedBuiltinCommands.set(commandId, failures);
  },

  contextValue(key: string): unknown {
    return contextValues.get(key);
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
  activeTextEditor: undefined as TextEditor | undefined,
  nextWarningMessageResult: undefined as string | false | undefined,
  createdWebviewPanels: [] as WebviewPanel[],

  async showInformationMessage(message: string): Promise<string> {
    window.informationMessages.push(message);
    return message;
  },

  async showWarningMessage(message: string): Promise<string> {
    window.warningMessages.push(message);
    const result = window.nextWarningMessageResult;
    window.nextWarningMessageResult = undefined;
    return result === false ? undefined as never : (result ?? message);
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

  createTextEditorDecorationType(): Disposable {
    return { dispose() {} };
  },

  async showTextDocument(document: TextDocument): Promise<TextEditor> {
    const editor = createHostTextEditor(document);
    window.activeTextEditor = editor;
    return editor;
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
  },

  registerCustomEditorProvider(viewType: string, provider: CustomReadonlyEditorProvider): Disposable {
    registeredCustomEditorProviders.set(viewType, provider);
    return { dispose: () => { registeredCustomEditorProviders.delete(viewType); } };
  },

  registeredCustomEditorProviderIds(): string[] {
    return [...registeredCustomEditorProviders.keys()];
  },

  registeredCustomEditorProvider(viewType: string): CustomReadonlyEditorProvider | undefined {
    return registeredCustomEditorProviders.get(viewType);
  },

  createWebviewPanel(
    viewType: string,
    title: string,
    _showOptions: unknown,
    options: { enableScripts?: boolean; localResourceRoots?: Uri[] }
  ): WebviewPanel {
    const panel = new TestWebviewPanel(viewType, title, options);
    window.createdWebviewPanels.push(panel);
    return panel;
  }
};

export const workspace = {
  workspaceFolders: undefined as { name?: string; uri: Uri }[] | undefined,
  fileContents: new Map<string, Uint8Array>(),
  configurationValues: {} as Record<string, unknown>,
  configurationDefaults: {} as Record<string, unknown>,
  configurationCallbacks: [] as Array<(event: { affectsConfiguration(key: string): boolean }) => unknown>,
  fs: {
    async readFile(uri: Uri): Promise<Uint8Array> {
      const bytes = workspace.fileContents.get(uri.toString());
      if (!bytes) throw FileSystemError.FileNotFound(uri);
      return new Uint8Array(bytes);
    },
    async stat(_uri: Uri): Promise<{ type: number; ctime: number; mtime: number; size: number }> {
      return { type: 1, ctime: 0, mtime: 0, size: 0 };
    }
  },

  async openTextDocument(uri: Uri): Promise<TextDocument> {
    const provider = registeredFileSystemProviders.get(uri.scheme) as {
      readFile?(uri: Uri): Uint8Array;
    } | undefined;
    if (!provider?.readFile) throw FileSystemError.FileNotFound(uri);
    return createHostTextDocument(
      uri,
      new TextDecoder().decode(provider.readFile(uri))
    );
  },

  onDidChangeTextDocument(): Disposable {
    return { dispose() {} };
  },

  onDidSaveTextDocument(): Disposable {
    return { dispose() {} };
  },

  onDidCloseTextDocument(): Disposable {
    return { dispose() {} };
  },

  registerFileSystemProvider(
    scheme: string,
    provider: unknown,
    _options?: { isCaseSensitive?: boolean; isReadonly?: boolean }
  ): Disposable {
    registeredFileSystemProviders.set(scheme, provider);
    return {
      dispose(): void {
        registeredFileSystemProviders.delete(scheme);
      }
    };
  },

  registeredFileSystemProviderSchemes(): string[] {
    return [...registeredFileSystemProviders.keys()];
  },

  registeredFileSystemProvider(scheme: string): unknown {
    return registeredFileSystemProviders.get(scheme);
  },

  getConfiguration(section?: string, _scope?: Uri): {
    get<T>(key: string, defaultValue?: T): T;
    inspect<T>(key: string): { defaultValue?: T; globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined;
    update(key: string, value: unknown, target?: number): Promise<void>;
  } {
    return {
      get<T>(key: string, defaultValue?: T): T {
        const fullKey = section ? `${section}.${key}` : key;
        if (Object.prototype.hasOwnProperty.call(workspace.configurationValues, fullKey)) {
          return workspace.configurationValues[fullKey] as T;
        }

        return defaultValue as T;
      },

      inspect<T>(key: string) {
        const fullKey = section ? `${section}.${key}` : key;
        return {
          defaultValue: workspace.configurationDefaults[fullKey] as T | undefined,
          globalValue: workspace.configurationValues[fullKey] as T | undefined
        };
      },

      async update(key: string, value: unknown, _target?: number): Promise<void> {
        const fullKey = section ? `${section}.${key}` : key;
        workspace.configurationValues[fullKey] = value;
      }
    };
  },

  getWorkspaceFolder(uri: Uri): { name: string; uri: Uri } | undefined {
    return workspace.workspaceFolders?.map((folder, index) => ({ name: folder.name ?? `Folder ${index + 1}`, uri: folder.uri }))
      .find(folder => uri.toString().startsWith(folder.uri.toString()));
  },

  onDidChangeConfiguration(callback: (event: { affectsConfiguration(key: string): boolean }) => unknown): Disposable {
    workspace.configurationCallbacks.push(callback);
    return { dispose: () => {
      const index = workspace.configurationCallbacks.indexOf(callback);
      if (index >= 0) workspace.configurationCallbacks.splice(index, 1);
    } };
  },

  async fireConfigurationChange(...keys: string[]): Promise<void> {
    const event = { affectsConfiguration: (key: string) => keys.includes(key) };
    for (const callback of workspace.configurationCallbacks) await callback(event);
  }
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
} as const;

export const ViewColumn = {
  Active: -1,
  Beside: -2
} as const;

export const languages = {
  async setTextDocumentLanguage(
    document: TextDocument,
    languageId: string
  ): Promise<TextDocument> {
    document.languageId = languageId;
    return document;
  },

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
  registeredCustomEditorProviders.clear();
  registeredInlineCompletionProviders.length = 0;
  registeredFileSystemProviders.clear();
  executedBuiltinCommandCalls.length = 0;
  failedBuiltinCommands.clear();
  contextValues.clear();
  window.informationMessages.length = 0;
  window.warningMessages.length = 0;
  window.errorMessages.length = 0;
  window.openDialogResult = undefined;
  window.quickPickResult = undefined;
  window.inputBoxResult = undefined;
  window.statusBarItems.length = 0;
  window.activeTextEditor = undefined;
  window.nextWarningMessageResult = undefined;
  window.createdWebviewPanels.length = 0;
  workspace.workspaceFolders = undefined;
  workspace.fileContents.clear();
  workspace.configurationValues = {};
  workspace.configurationDefaults = {};
  workspace.configurationCallbacks.length = 0;
}

export function createTextDocument(lines: string[]): TextDocument {
  return {
    lineAt(line: number): TextLine {
      return { text: lines[line] ?? '' };
    }
  };
}

export function createTextEditor(lines: string[], active: Position): TextEditor {
  return new TestTextEditor(lines, active);
}

export function createWebviewView(): WebviewView {
  return new TestWebviewView();
}

class TestWebviewView implements WebviewView {
  readonly webview = new TestWebview();
  visible = true;
  private readonly visibilityCallbacks: Array<() => unknown> = [];
  private readonly disposeCallbacks: Array<() => unknown> = [];

  onDidChangeVisibility(callback: () => unknown): Disposable {
    this.visibilityCallbacks.push(callback);
    return { dispose: () => this.remove(this.visibilityCallbacks, callback) };
  }

  onDidDispose(callback: () => unknown): Disposable {
    this.disposeCallbacks.push(callback);
    return { dispose: () => this.remove(this.disposeCallbacks, callback) };
  }

  async setVisible(visible: boolean): Promise<void> {
    this.visible = visible;
    for (const callback of this.visibilityCallbacks) await callback();
  }

  async dispose(): Promise<void> {
    for (const callback of this.disposeCallbacks) await callback();
  }

  private remove(callbacks: Array<() => unknown>, callback: () => unknown): void {
    const index = callbacks.indexOf(callback);
    if (index >= 0) callbacks.splice(index, 1);
  }
}

class TestWebviewPanel implements WebviewPanel {
  readonly webview = new TestWebview();
  visible = true;
  active = true;
  readonly revealCalls: Array<{ viewColumn?: number; preserveFocus?: boolean }> = [];
  private readonly viewStateCallbacks: Array<(event: { webviewPanel: WebviewPanel }) => unknown> = [];
  private readonly disposeCallbacks: Array<() => unknown> = [];

  constructor(
    readonly viewType: string,
    readonly title: string,
    options: { enableScripts?: boolean; localResourceRoots?: Uri[] }
  ) {
    this.webview.options = options;
  }

  reveal(viewColumn?: number, preserveFocus?: boolean): void {
    this.visible = true;
    this.active = true;
    this.revealCalls.push({ viewColumn, preserveFocus });
  }

  onDidChangeViewState(callback: (event: { webviewPanel: WebviewPanel }) => unknown): Disposable {
    this.viewStateCallbacks.push(callback);
    return { dispose: () => this.remove(this.viewStateCallbacks, callback) };
  }

  onDidDispose(callback: () => unknown): Disposable {
    this.disposeCallbacks.push(callback);
    return { dispose: () => this.remove(this.disposeCallbacks, callback) };
  }

  async setVisible(visible: boolean): Promise<void> {
    this.visible = visible;
    this.active = visible;
    for (const callback of this.viewStateCallbacks) await callback({ webviewPanel: this });
  }

  async dispose(): Promise<void> {
    this.visible = false;
    this.active = false;
    for (const callback of this.disposeCallbacks) await callback();
  }

  private remove<T>(callbacks: T[], callback: T): void {
    const index = callbacks.indexOf(callback);
    if (index >= 0) callbacks.splice(index, 1);
  }
}

class TestWebview implements Webview {
  html = '';
  options: { enableScripts?: boolean; localResourceRoots?: Uri[] } = {};
  readonly cspSource = 'vscode-resource:';
  readonly postedMessages: unknown[] = [];
  private readonly messageCallbacks: MessageCallback[] = [];
  private readonly deferredPosts: TestDeferredPostMessage[] = [];

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
    const deferred = this.deferredPosts.shift();
    if (deferred) {
      deferred.capture(message);
      const result = await deferred.promise;
      if (result) this.postedMessages.push(message);
      return result;
    }
    this.postedMessages.push(message);
    return true;
  }

  readonly deferNextPostMessage = (): DeferredPostMessage => {
    const deferred = new TestDeferredPostMessage();
    this.deferredPosts.push(deferred);
    return deferred;
  };

  async receiveMessage(message: unknown): Promise<void> {
    for (const callback of this.messageCallbacks) {
      await callback(message);
    }
  }

  asWebviewUri(uri: Uri): Uri {
    return Uri.file(`/webview/${encodeURIComponent(uri.toString())}`);
  }
}

class TestDeferredPostMessage implements DeferredPostMessage {
  message: unknown;
  readonly promise: Promise<boolean>;
  private resolvePromise!: (result: boolean) => void;

  constructor() {
    this.promise = new Promise<boolean>(resolve => { this.resolvePromise = resolve; });
  }

  capture(message: unknown): void {
    this.message = message;
  }

  resolve(result = true): void {
    this.resolvePromise(result);
  }
}

class TestTextEditor implements TextEditor {
  readonly document: TextDocument;
  selection: Selection;

  constructor(
    private readonly lines: string[],
    active: Position
  ) {
    this.selection = new Selection(active);
    this.document = {
      lineAt: (line: number): TextLine => {
        return { text: this.lines[line] ?? '' };
      }
    };
  }

  async edit(callback: (editBuilder: TextEditorEdit) => void): Promise<boolean> {
    const editBuilder = new TestTextEditorEdit(this.lines, (position) => {
      this.selection = new Selection(position);
    });
    callback(editBuilder);
    return true;
  }
}

function createHostTextDocument(uri: Uri, initialText: string): TextDocument {
  let text = initialText;
  return {
    uri,
    get lineCount() {
      return text.split('\n').length;
    },
    get version() {
      return 1;
    },
    lineAt(line: number): TextLine {
      return { text: text.split('\n')[line] ?? '' };
    },
    getText(): string {
      return text;
    },
    async save(): Promise<boolean> {
      return true;
    },
    __replaceText(value: string): void {
      text = value;
    }
  } as TextDocument;
}

function createHostTextEditor(document: TextDocument): TextEditor {
  const editor = {
    document,
    selection: new Selection(new Position(0, 0)),
    selections: [new Selection(new Position(0, 0))],
    visibleRanges: [new Range(0, 0, Math.max(0, Number(
      (document as TextDocument & { lineCount?: number }).lineCount ?? 1
    ) - 1), 0)],
    async edit(): Promise<boolean> {
      return true;
    },
    setDecorations(): void {},
    revealRange(): void {}
  };
  return editor as unknown as TextEditor;
}

class TestTextEditorEdit implements TextEditorEdit {
  constructor(
    private readonly lines: string[],
    private readonly updateSelection: (position: Position) => void
  ) {}

  insert(position: Position, text: string): void {
    const currentLine = this.lines[position.line] ?? '';
    const character = Math.max(0, Math.min(position.character, currentLine.length));
    this.lines[position.line] = `${currentLine.slice(0, character)}${text}${currentLine.slice(character)}`;
    this.updateSelection(new Position(position.line, character + text.length));
  }

  replace(range: Range, text: string): void {
    if (range.start.line !== range.end.line) {
      throw new Error('TestTextEditorEdit only supports single-line replacements.');
    }

    const currentLine = this.lines[range.start.line] ?? '';
    const start = Math.max(0, Math.min(range.start.character, currentLine.length));
    const end = Math.max(start, Math.min(range.end.character, currentLine.length));
    this.lines[range.start.line] = `${currentLine.slice(0, start)}${text}${currentLine.slice(end)}`;
    this.updateSelection(new Position(range.start.line, start + text.length));
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
