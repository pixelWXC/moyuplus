import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { AuthoritySnapshot } from './settingsAuthority';
import {
  SETTINGS_PROTOCOL_VERSION,
  isSettingsToHostMessage,
  type SettingsDomain,
  type SettingsSection,
  type SettingsToHostMessage
} from './settingsMessages';

export const SETTINGS_PANEL_VIEW_TYPE = 'moyuplus.settings';
export const OPEN_SETTINGS_COMMAND_ID = 'moyuplus.openSettings';

export interface SettingsPanelAuthority {
  snapshot(section: SettingsSection): AuthoritySnapshot;
  change(domain: SettingsDomain, key: string, value: unknown): Promise<unknown>;
  reset(section: 'reader' | 'immersive' | 'gitLog'): Promise<unknown>;
}

export class MoyuPlusSettingsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private section: SettingsSection = 'reader';
  private currentInstance?: string;
  private initializedInstance?: string;
  private stateVersion = 0;
  private queue: Promise<void> = Promise.resolve();
  private panelSubscriptions: vscode.Disposable[] = [];
  private disposed = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authority: SettingsPanelAuthority
  ) {}

  open(section: SettingsSection): void {
    if (this.disposed) return;
    this.section = section;
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, false);
      if (this.currentInstance && this.initializedInstance === this.currentInstance) {
        void this.enqueue(() => this.publishSnapshot(this.currentInstance!));
      }
      return;
    }
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      SETTINGS_PANEL_VIEW_TYPE,
      'MoyuPlus Settings',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [mediaRoot] }
    );
    this.panel = panel;
    panel.webview.html = getSettingsWebviewHtml(
      panel.webview,
      panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'settingsApp.js')),
      panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'settingsApp.css'))
    );
    this.panelSubscriptions = [
      panel.webview.onDidReceiveMessage(value => this.handleMessage(value)),
      panel.onDidChangeViewState(event => {
        if (event.webviewPanel.visible && this.currentInstance && this.initializedInstance === this.currentInstance) {
          return this.enqueue(() => this.publishSnapshot(this.currentInstance!));
        }
        return undefined;
      }),
      panel.onDidDispose(() => this.releasePanel(panel))
    ];
  }

  refresh(): void {
    const instanceId = this.currentInstance;
    if (!instanceId || this.initializedInstance !== instanceId || !this.panel?.visible) return;
    void this.enqueue(() => this.publishSnapshot(instanceId));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const panel = this.panel;
    this.releasePanel(panel);
    panel?.dispose();
  }

  private handleMessage(value: unknown): Promise<void> | void {
    if (this.disposed || !this.panel) return;
    if (isRecord(value) && value.type === 'settingsReady' && value.protocolVersion !== SETTINGS_PROTOCOL_VERSION) {
      return this.post({ type: 'settingsProtocolError', message: '请重新加载窗口或更新扩展。' });
    }
    if (!isSettingsToHostMessage(value)) return;
    if (value.type === 'settingsReady') {
      this.currentInstance = value.instanceId;
      this.initializedInstance = undefined;
      return this.enqueue(async () => {
        if (this.currentInstance !== value.instanceId) return;
        await this.publishSnapshot(value.instanceId);
        if (this.currentInstance === value.instanceId) this.initializedInstance = value.instanceId;
      });
    }
    if (value.instanceId !== this.currentInstance || this.initializedInstance !== value.instanceId) return;
    if (value.type === 'retrySnapshot') return this.enqueue(() => this.publishSnapshot(value.instanceId));
    if (value.type === 'selectSection') {
      this.section = value.section;
      return this.enqueue(() => this.publishSnapshot(value.instanceId));
    }
    if (value.type === 'changeSetting') return this.enqueue(() => this.applyChange(value));
    if (value.type === 'resetSection') return this.enqueue(() => this.applyReset(value));
    return this.enqueue(() => this.openKeyboardShortcuts(value));
  }

  private async applyChange(message: Extract<SettingsToHostMessage, { type: 'changeSetting' }>): Promise<void> {
    if (message.instanceId !== this.currentInstance) return;
    const oldValue = this.authoritativeValue(message.domain, message.key);
    try {
      const saved = await this.authority.change(message.domain, message.key, message.value);
      await this.postChangeResult('changeSaved', message, saved);
    } catch {
      await this.postChangeResult('changeFailed', message, this.authoritativeValue(message.domain, message.key), '保存失败，请重试。');
    }
  }

  private async applyReset(message: Extract<SettingsToHostMessage, { type: 'resetSection' }>): Promise<void> {
    if (message.instanceId !== this.currentInstance) return;
    try {
      const value = await this.authority.reset(message.section);
      this.stateVersion += 1;
      await this.post({
        type: 'sectionReset', protocolVersion: SETTINGS_PROTOCOL_VERSION,
        instanceId: message.instanceId, requestId: message.requestId,
        clientRevision: message.clientRevision, stateVersion: this.stateVersion,
        section: message.section, value
      });
    } catch {
      this.stateVersion += 1;
      await this.post({
        type: 'sectionResetFailed', protocolVersion: SETTINGS_PROTOCOL_VERSION,
        instanceId: message.instanceId, requestId: message.requestId,
        clientRevision: message.clientRevision, stateVersion: this.stateVersion,
        section: message.section, message: '恢复默认值失败，请重试。'
      });
    }
  }

  private async openKeyboardShortcuts(message: Extract<SettingsToHostMessage, { type: 'openKeyboardShortcuts' }>): Promise<void> {
    if (message.instanceId !== this.currentInstance) return;
    try {
      await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'moyuplus');
      await this.post({ type: 'keyboardShortcutsOpened', instanceId: message.instanceId, requestId: message.requestId, clientRevision: message.clientRevision });
    } catch {
      await this.post({ type: 'keyboardShortcutsFailed', instanceId: message.instanceId, requestId: message.requestId, clientRevision: message.clientRevision, message: '无法打开键盘快捷方式，请重试。' });
    }
  }

  private async publishSnapshot(instanceId: string): Promise<void> {
    if (instanceId !== this.currentInstance || !this.panel) return;
    try {
      const snapshot = this.authority.snapshot(this.section);
      this.stateVersion += 1;
      await this.post({
        type: 'settingsSnapshot', protocolVersion: SETTINGS_PROTOCOL_VERSION,
        instanceId, stateVersion: this.stateVersion, ...snapshot
      });
    } catch {
      await this.post({ type: 'settingsSnapshotError', instanceId, message: '设置读取失败，请重试。' });
    }
  }

  private authoritativeValue(domain: SettingsDomain, key: string): unknown {
    const snapshot = this.authority.snapshot(this.section);
    if (domain === 'reader') return snapshot.reader[key as keyof typeof snapshot.reader];
    if (domain === 'immersive') return snapshot.immersive[key as keyof typeof snapshot.immersive];
    return snapshot.gitLog[key as keyof typeof snapshot.gitLog];
  }

  private async postChangeResult(
    type: 'changeSaved' | 'changeFailed',
    message: Extract<SettingsToHostMessage, { type: 'changeSetting' }>,
    value: unknown,
    errorMessage?: string
  ): Promise<void> {
    this.stateVersion += 1;
    await this.post({
      type, protocolVersion: SETTINGS_PROTOCOL_VERSION,
      instanceId: message.instanceId, requestId: message.requestId,
      clientRevision: message.clientRevision, stateVersion: this.stateVersion,
      domain: message.domain, key: message.key, value,
      ...(errorMessage ? { message: errorMessage } : {})
    });
  }

  private enqueue(operation: () => void | Promise<void>): Promise<void> {
    const run = this.queue.then(async () => {
      if (!this.disposed) await operation();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private post(message: unknown): Promise<void> {
    const panel = this.panel;
    if (!panel || this.disposed) return Promise.resolve();
    return Promise.resolve(panel.webview.postMessage(message)).then(() => undefined);
  }

  private releasePanel(panel?: vscode.WebviewPanel): void {
    if (!panel || this.panel !== panel) return;
    this.panel = undefined;
    this.currentInstance = undefined;
    this.initializedInstance = undefined;
    const subscriptions = this.panelSubscriptions;
    this.panelSubscriptions = [];
    subscriptions.forEach(subscription => subscription.dispose());
  }
}

export function getSettingsWebviewHtml(_webview: vscode.Webview, scriptUri: vscode.Uri, styleUri: vscode.Uri): string {
  const nonce = randomBytes(18).toString('base64url');
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    "frame-src 'none'",
    "media-src 'none'"
  ].join('; ');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>MoyuPlus Settings</title>
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri.toString()}">
</head>
<body>
  <main id="app"></main>
  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
