import * as vscode from 'vscode';
import {
  TYPING_VIEW_ID,
  TYPING_VIEW_PROTOCOL_VERSION,
  isTypingViewToHostMessage,
  type TypingViewPage,
  type TypingViewAppearancePreferences,
  type TypingViewMaterialOrigin,
  type TypingViewSetupPlan,
  type TypingViewStartPosition,
  type TypingViewSourceRange,
  type TypingViewShellSnapshot,
  type TypingViewToHostMessage
} from './typingViewProtocol';
import { getTypingViewHtml } from './typingViewHtml';

export interface TypingViewQueryPort {
  shellSnapshot(page: TypingViewPage): PromiseLike<TypingViewShellSnapshot>;
}

export interface TypingViewCommandPort {
  selectMaterial(input: {
    materialId: string;
    materialOrigin: TypingViewMaterialOrigin;
  }): PromiseLike<void | boolean>;
  removeMaterial(materialId: string): PromiseLike<void | boolean>;
  undoRemoveMaterial(materialId: string): PromiseLike<void | boolean>;
  usePastedText(text: string): PromiseLike<void | boolean>;
  importTxt(): PromiseLike<void | boolean>;
  importEpub(): PromiseLike<void | boolean>;
  configureSetup(input: {
    selectedRange: TypingViewSourceRange;
    startPosition?: TypingViewStartPosition;
    plan: TypingViewSetupPlan;
  }): void | boolean | PromiseLike<void | boolean>;
  saveSetupAsDefault(input: {
    selectedRange: TypingViewSourceRange;
    startPosition?: TypingViewStartPosition;
    plan: TypingViewSetupPlan;
    appearance: TypingViewAppearancePreferences;
  }): PromiseLike<void>;
  startPractice(input: {
    selectedRange: TypingViewSourceRange;
    startPosition?: TypingViewStartPosition;
    plan: TypingViewSetupPlan;
    appearance: TypingViewAppearancePreferences;
  }): PromiseLike<TypingViewPage>;
  startMasteryPractice(): PromiseLike<TypingViewPage>;
  adjustMasteryPractice(): PromiseLike<TypingViewPage>;
  resolveSessionConflict(
    resolution: 'returnCurrent' | 'finishAndStart' | 'cancel'
  ): PromiseLike<TypingViewPage>;
  controlPractice(
    action: 'pause' | 'resume' | 'restart' | 'finish'
  ): PromiseLike<TypingViewPage>;
  recoverPractice(): PromiseLike<boolean>;
  dismissRecovery(): PromiseLike<void>;
  resumeLegacyPractice?(): PromiseLike<boolean>;
  dismissLegacyResumeHint?(): PromiseLike<void>;
  clearPracticeHistory(): PromiseLike<boolean>;
}

export type TypingViewErrorReporter = (error: Error) => void | PromiseLike<void>;

const NOOP_COMMANDS: TypingViewCommandPort = {
  selectMaterial: async () => undefined,
  removeMaterial: async () => undefined,
  undoRemoveMaterial: async () => undefined,
  usePastedText: async () => undefined,
  importTxt: async () => undefined,
  importEpub: async () => undefined,
  configureSetup: async () => undefined,
  saveSetupAsDefault: async () => undefined,
  startPractice: async () => 'setup',
  startMasteryPractice: async () => 'mastery',
  adjustMasteryPractice: async () => 'mastery',
  resolveSessionConflict: async () => 'setup',
  controlPractice: async () => 'materials',
  recoverPractice: async () => false,
  dismissRecovery: async () => undefined,
  resumeLegacyPractice: async () => false,
  dismissLegacyResumeHint: async () => undefined,
  clearPracticeHistory: async () => false
};

export class TypingViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private instanceId?: string;
  private activePage: TypingViewPage = 'materials';
  private clientRevision = 0;
  private snapshotRevision = 0;
  private requestGeneration = 0;
  private disposed = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly query: TypingViewQueryPort,
    private readonly commands: TypingViewCommandPort = NOOP_COMMANDS,
    private readonly reportError: TypingViewErrorReporter = async error => {
      await vscode.window.showErrorMessage(`无法完成打字练习操作：${error.message}`);
    }
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    if (this.disposed) return;
    this.view = view;
    this.instanceId = undefined;
    this.clientRevision = 0;
    this.snapshotRevision = 0;
    this.requestGeneration += 1;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot]
    };
    view.webview.onDidReceiveMessage(value => this.handleMessageSafely(value, view));
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
        this.instanceId = undefined;
        this.requestGeneration += 1;
      }
    });
    view.webview.html = getTypingViewHtml(
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'typingApp.js')),
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'typingApp.css'))
    );
  }

  dispose(): void {
    this.disposed = true;
    this.view = undefined;
    this.instanceId = undefined;
    this.requestGeneration += 1;
  }

  async openPage(page: TypingViewPage): Promise<void> {
    if (this.disposed) return;
    this.activePage = page;
    await vscode.commands.executeCommand(`${TYPING_VIEW_ID}.focus`);
    const view = this.view;
    const instanceId = this.instanceId;
    if (view && instanceId) {
      await this.refresh(view, instanceId, page);
    }
  }

  async syncPage(page: TypingViewPage): Promise<void> {
    if (this.disposed) return;
    this.activePage = page;
    const view = this.view;
    const instanceId = this.instanceId;
    if (view && instanceId) {
      await this.refresh(view, instanceId, page);
    }
  }

  async refreshCurrent(): Promise<void> {
    if (this.disposed) return;
    const view = this.view;
    const instanceId = this.instanceId;
    if (view && instanceId) {
      await this.refresh(view, instanceId, this.activePage);
    }
  }

  private async handleMessage(
    value: unknown,
    view: vscode.WebviewView
  ): Promise<void> {
    if (this.disposed || this.view !== view || !isTypingViewToHostMessage(value)) {
      return;
    }
    if (value.type === 'typingReady') {
      this.instanceId = value.instanceId;
      this.clientRevision = 0;
      await this.refresh(view, value.instanceId, this.activePage);
      return;
    }
    if (value.instanceId !== this.instanceId) return;
    if (value.type === 'retrySnapshot') {
      await this.refresh(view, value.instanceId, this.activePage);
      return;
    }
    if (value.type === 'navigate') {
      await this.navigate(value, view);
      return;
    }
    await this.executeCommand(value, view);
  }

  private async handleMessageSafely(
    value: unknown,
    view: vscode.WebviewView
  ): Promise<void> {
    try {
      await this.handleMessage(value, view);
    } catch (error) {
      const normalized = error instanceof Error
        ? error
        : new Error(String(error));
      try {
        await this.reportError(normalized);
      } catch (reportError) {
        console.error(
          'MoyuPlus failed to report a Typing View command error.',
          reportError
        );
      }
    }
  }

  private async navigate(
    message: Extract<TypingViewToHostMessage, { type: 'navigate' }>,
    view: vscode.WebviewView
  ): Promise<void> {
    if (message.clientRevision <= this.clientRevision) return;
    this.clientRevision = message.clientRevision;
    this.activePage = message.page;
    await this.refresh(view, message.instanceId, message.page);
  }

  private async executeCommand(
    message: Exclude<
      TypingViewToHostMessage,
      { type: 'typingReady' | 'retrySnapshot' | 'navigate' }
    >,
    view: vscode.WebviewView
  ): Promise<void> {
    if (message.clientRevision <= this.clientRevision) return;
    this.clientRevision = message.clientRevision;
    let page: TypingViewPage = 'materials';
    let applied: void | boolean;
    if (message.type === 'startPractice') {
      page = await this.commands.startPractice({
        selectedRange: message.selectedRange,
        startPosition: message.startPosition,
        plan: message.plan,
        appearance: message.appearance
      });
      applied = true;
    } else if (message.type === 'startMasteryPractice') {
      page = await this.commands.startMasteryPractice();
      applied = true;
    } else if (message.type === 'adjustMasteryPractice') {
      page = await this.commands.adjustMasteryPractice();
      applied = true;
    } else if (message.type === 'resolveSessionConflict') {
      page = await this.commands.resolveSessionConflict(message.resolution);
      applied = true;
    } else if (message.type === 'controlPractice') {
      page = await this.commands.controlPractice(message.action);
      applied = true;
    } else if (message.type === 'recoverPractice') {
      applied = await this.commands.recoverPractice();
      page = applied ? 'live' : this.activePage;
    } else if (message.type === 'dismissRecovery') {
      await this.commands.dismissRecovery();
      applied = true;
      page = this.activePage;
    } else if (message.type === 'resumeLegacyPractice') {
      applied = await this.commands.resumeLegacyPractice?.() ?? false;
      page = applied ? 'setup' : this.activePage;
    } else if (message.type === 'dismissLegacyResumeHint') {
      await this.commands.dismissLegacyResumeHint?.();
      applied = true;
      page = this.activePage;
    } else if (message.type === 'clearPracticeHistory') {
      applied = await this.commands.clearPracticeHistory();
      page = 'history';
    } else if (message.type === 'configureSetup') {
      applied = await this.commands.configureSetup({
        selectedRange: message.selectedRange,
        startPosition: message.startPosition,
        plan: message.plan
      });
      page = 'setup';
    } else if (message.type === 'saveSetupAsDefault') {
      await this.commands.saveSetupAsDefault({
        selectedRange: message.selectedRange,
        startPosition: message.startPosition,
        plan: message.plan,
        appearance: message.appearance
      });
      applied = true;
      page = 'setup';
    } else if (message.type === 'removeMaterial') {
      applied = await this.commands.removeMaterial(message.materialId);
      page = 'materials';
    } else if (message.type === 'undoRemoveMaterial') {
      applied = await this.commands.undoRemoveMaterial(message.materialId);
      page = 'materials';
    } else if (message.type === 'selectMaterial') {
      applied = await this.commands.selectMaterial({
        materialId: message.materialId,
        materialOrigin: message.materialOrigin
      });
      page = 'setup';
    } else if (message.type === 'usePastedText') {
      applied = await this.commands.usePastedText(message.text);
      page = 'setup';
    } else if (message.format === 'txt') {
      applied = await this.commands.importTxt();
    } else {
      applied = await this.commands.importEpub();
    }
    if (applied === false) page = this.activePage;
    this.activePage = page;
    await this.refresh(view, message.instanceId, page);
  }

  private async refresh(
    view: vscode.WebviewView,
    instanceId: string,
    page: TypingViewPage
  ): Promise<void> {
    const generation = ++this.requestGeneration;
    const snapshot = await this.query.shellSnapshot(page);
    if (
      this.disposed
      || this.view !== view
      || this.instanceId !== instanceId
      || generation !== this.requestGeneration
    ) {
      return;
    }
    this.activePage = snapshot.activePage;
    await view.webview.postMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId,
      type: 'shellSnapshot',
      snapshotRevision: ++this.snapshotRevision,
      snapshot
    });
  }
}
