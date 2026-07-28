import * as vscode from 'vscode';
import type {
  CorrectPracticeInputTransaction,
  PracticeInputTransactionAck,
  PracticeInputTransactionCoordinator,
  PracticePanelSnapshot,
  SubmitPracticeInputTransaction
} from '../../application';
import {
  TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
  decodePracticePanelClientMessage,
  wrapPracticeTransactionAck,
  type PracticePanelClientMessage
} from './typingPracticePanelProtocol';
import { createTypingPracticePanelHtml } from './typingPracticePanelHtml';
import type {
  TypingPracticePanelAppearance
} from './typingPracticePanelHtml';

export const TYPING_PRACTICE_PANEL_VIEW_TYPE =
  'moyuplus.typingPractice';

export interface PracticeWebviewPanelOptions {
  extensionUri: vscode.Uri;
  coordinator: Pick<
    PracticeInputTransactionCoordinator,
    'snapshot' | 'submit' | 'correct'
  >;
  pause(sessionId: string): PromiseLike<void>;
  reportError(error: unknown): void;
}

interface PanelBinding {
  sessionId: string;
  panel: vscode.WebviewPanel;
  panelInstanceId?: string;
  lastTransactionSequence: number;
  queue: Promise<void>;
  subscriptions: vscode.Disposable[];
  disposing: boolean;
}

export class PracticeWebviewPanel implements vscode.Disposable {
  private readonly bindings = new Map<string, PanelBinding>();
  private readonly configurationSubscription: vscode.Disposable;
  private disposed = false;

  constructor(private readonly options: PracticeWebviewPanelOptions) {
    this.configurationSubscription = vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('moyuplus.typing')) return;
      for (const binding of this.bindings.values()) {
        this.renderHtml(binding);
      }
    });
  }

  open(sessionId: string): vscode.WebviewPanel | undefined {
    if (this.disposed) return undefined;
    const existing = this.bindings.get(sessionId);
    if (existing && !existing.disposing) {
      existing.panel.reveal(vscode.ViewColumn.Active, false);
      return existing.panel;
    }
    const mediaRoot = vscode.Uri.joinPath(this.options.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      TYPING_PRACTICE_PANEL_VIEW_TYPE,
      '打字练习',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [mediaRoot]
      }
    );
    const binding: PanelBinding = {
      sessionId,
      panel,
      lastTransactionSequence: 0,
      queue: Promise.resolve(),
      subscriptions: [],
      disposing: false
    };
    this.bindings.set(sessionId, binding);
    this.renderHtml(binding);
    binding.subscriptions = [
      panel.webview.onDidReceiveMessage(value =>
        this.enqueue(binding, () => this.handleMessage(binding, value))
      ),
      panel.onDidDispose(() =>
        this.enqueue(binding, () => this.release(binding))
      )
    ];
    return panel;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.configurationSubscription.dispose();
    for (const binding of [...this.bindings.values()]) {
      binding.panel.dispose();
    }
  }

  private renderHtml(binding: PanelBinding): void {
    const mediaRoot = vscode.Uri.joinPath(this.options.extensionUri, 'media');
    binding.panel.webview.html = createTypingPracticePanelHtml({
      webview: binding.panel.webview,
      sessionId: binding.sessionId,
      scriptUri: binding.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(mediaRoot, 'typingPracticePanelApp.js')
      ),
      styleUri: binding.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(mediaRoot, 'typingPracticePanelApp.css')
      ),
      appearance: readAppearance()
    });
  }

  private async handleMessage(
    binding: PanelBinding,
    value: unknown
  ): Promise<void> {
    if (binding.disposing || this.bindings.get(binding.sessionId) !== binding) {
      return;
    }
    const message = decodePracticePanelClientMessage(value);
    if (!message || message.sessionId !== binding.sessionId) return;
    if (message.type === 'practice/ready') {
      binding.panelInstanceId = message.panelInstanceId;
      binding.lastTransactionSequence = 0;
      await this.publishSnapshot(binding, message.panelInstanceId);
      return;
    }
    if (message.panelInstanceId !== binding.panelInstanceId) return;
    if (message.type === 'practice/requestSnapshot') {
      await this.publishSnapshot(binding, message.panelInstanceId);
      return;
    }
    if (message.type === 'practice/pause') {
      await this.options.pause(binding.sessionId);
      await this.publishSnapshot(binding, message.panelInstanceId);
      return;
    }
    if (message.sequence <= binding.lastTransactionSequence) return;
    binding.lastTransactionSequence = message.sequence;
    const ack = await this.applyTransaction(message);
    await this.post(binding, wrapPracticeTransactionAck({
      sessionId: binding.sessionId,
      panelInstanceId: message.panelInstanceId,
      sequence: message.sequence,
      transactionId: message.transactionId,
      ack
    }));
  }

  private applyTransaction(
    message: Extract<
      PracticePanelClientMessage,
      { type: 'practice/submit' | 'practice/correct' }
    >
  ): Promise<PracticeInputTransactionAck> {
    if (message.type === 'practice/submit') {
      const command: SubmitPracticeInputTransaction = {
        sessionId: message.sessionId,
        transactionId: message.transactionId,
        baseRevision: message.baseRevision,
        kind: message.inputKind,
        text: message.text
      };
      return this.options.coordinator.submit(command);
    }
    const command: CorrectPracticeInputTransaction = {
      sessionId: message.sessionId,
      transactionId: message.transactionId,
      baseRevision: message.baseRevision
    };
    return this.options.coordinator.correct(command);
  }

  private async publishSnapshot(
    binding: PanelBinding,
    panelInstanceId: string
  ): Promise<void> {
    const snapshot: PracticePanelSnapshot =
      await this.options.coordinator.snapshot(binding.sessionId);
    await this.post(binding, {
      protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
      type: 'practice/snapshot',
      sessionId: binding.sessionId,
      panelInstanceId,
      snapshot
    });
  }

  private async release(binding: PanelBinding): Promise<void> {
    if (binding.disposing) return;
    binding.disposing = true;
    try {
      await this.options.pause(binding.sessionId);
    } finally {
      if (this.bindings.get(binding.sessionId) === binding) {
        this.bindings.delete(binding.sessionId);
      }
      const subscriptions = binding.subscriptions;
      binding.subscriptions = [];
      subscriptions.forEach(subscription => subscription.dispose());
    }
  }

  private async post(binding: PanelBinding, message: unknown): Promise<void> {
    if (binding.disposing) return;
    const delivered = await binding.panel.webview.postMessage(message);
    if (!delivered) {
      throw new Error('Practice Webview message could not be delivered.');
    }
  }

  private enqueue(
    binding: PanelBinding,
    operation: () => Promise<void>
  ): Promise<void> {
    const run = binding.queue.then(operation);
    binding.queue = run.catch(error => {
      this.options.reportError(error);
    });
    return run;
  }
}

function readAppearance(): TypingPracticePanelAppearance {
  const configuration = vscode.workspace.getConfiguration('moyuplus.typing');
  return {
    fontSize: clamp(configuration.get('practiceFontSize', 34), 18, 64),
    lineHeight: clamp(configuration.get('practiceLineHeight', 1.6), 1.2, 2.4),
    fontFamily: configuration.get<string>('practiceFontFamily', 'editor') === 'interface'
      ? 'interface'
      : 'editor',
    showVirtualKeyboard: configuration.get('showVirtualKeyboard', true),
    colorKeyboardHands: configuration.get('colorKeyboardHands', true)
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
