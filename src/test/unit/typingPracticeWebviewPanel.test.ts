import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Uri, resetVSCodeShim, window } from '../shims/vscode';
import {
  PracticeWebviewPanel,
  TYPING_PRACTICE_PANEL_VIEW_TYPE
} from '../../typing/adapters/panel';

describe('PracticeWebviewPanel', () => {
  beforeEach(() => resetVSCodeShim());

  it('creates one restricted panel per session and reveals repeat opens', () => {
    const owner = createOwner();

    owner.panel.open('session-1');
    owner.panel.open('session-1');

    expect(window.createdWebviewPanels).toHaveLength(1);
    const panel = window.createdWebviewPanels[0];
    expect(panel.viewType).toBe(TYPING_PRACTICE_PANEL_VIEW_TYPE);
    expect(panel.webview.options).toMatchObject({
      enableScripts: true
    });
    expect(panel.webview.options).not.toHaveProperty('retainContextWhenHidden');
    expect(panel.revealCalls).toHaveLength(1);
    expect(panel.webview.html).toContain("default-src 'none'");
    expect(panel.webview.html).toMatch(/script-src 'nonce-[^']+'/);
  });

  it('publishes authority on ready and routes submit through the coordinator', async () => {
    const owner = createOwner();
    owner.panel.open('session-1');
    const webview = window.createdWebviewPanels[0].webview;

    await webview.receiveMessage({
      protocolVersion: 1,
      type: 'practice/ready',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 1
    });
    await webview.receiveMessage({
      protocolVersion: 1,
      type: 'practice/submit',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 1,
      transactionId: 'transaction-1',
      baseRevision: 0,
      inputKind: 'direct',
      text: 'a'
    });

    expect(owner.snapshot).toHaveBeenCalledWith('session-1');
    expect(owner.submit).toHaveBeenCalledWith({
      sessionId: 'session-1',
      transactionId: 'transaction-1',
      baseRevision: 0,
      kind: 'direct',
      text: 'a'
    });
    expect(webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'practice/snapshot',
      snapshot: expect.objectContaining({ revision: 0 })
    }));
    expect(webview.postedMessages.at(-1)).toMatchObject({
      type: 'practice/ack',
      panelInstanceId: 'panel-1',
      sequence: 1,
      transactionId: 'transaction-1'
    });
  });

  it('rejects messages from a replaced panel instance and pauses after accepted work', async () => {
    const owner = createOwner();
    owner.panel.open('session-1');
    const panel = window.createdWebviewPanels[0];
    await panel.webview.receiveMessage(ready('panel-old'));
    await panel.webview.receiveMessage(ready('panel-new'));
    await panel.webview.receiveMessage({
      protocolVersion: 1,
      type: 'practice/submit',
      sessionId: 'session-1',
      panelInstanceId: 'panel-old',
      sequence: 1,
      transactionId: 'late',
      baseRevision: 0,
      inputKind: 'direct',
      text: 'x'
    });

    expect(owner.submit).not.toHaveBeenCalled();
    await panel.dispose();
    await vi.waitFor(() => expect(owner.pause).toHaveBeenCalledWith('session-1'));
  });

  it('ends a timed session when the authoritative remaining time elapses', async () => {
    vi.useFakeTimers();
    try {
      const owner = createOwner(true);
      owner.panel.open('session-1');
      const webview = window.createdWebviewPanels[0].webview;

      await webview.receiveMessage(ready('panel-timed'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(owner.timeout).toHaveBeenCalledWith('session-1');
    } finally {
      vi.useRealTimers();
    }
  });
});

function createOwner(timed = false) {
  const snapshotValue = {
    sessionId: 'session-1',
    revision: 0,
    status: 'running' as const,
    targetIndex: 0,
    totalUnits: 1,
    showMetrics: true,
    metrics: {
      activeElapsedMs: 0,
      currentCpm: 0,
      accuracy: 100,
      remaining: timed
        ? {
          kind: 'time' as const,
          remainingMs: 1_000,
          totalMs: 1_000
        }
        : {
          kind: 'units' as const,
          remainingUnits: 1
        }
    },
    window: {
      start: 0,
      end: 1,
      units: [{
        index: 0,
        text: 'a',
        display: 'a',
        state: 'target' as const
      }]
    },
    updatedAt: 1
  };
  const snapshot = vi.fn(async () => snapshotValue);
  const submit = vi.fn(async () => ({
    outcome: 'applied' as const,
    transactionRevision: 1,
    currentRevision: 1,
    consumedText: 'a',
    unconsumedText: '',
    snapshot: { ...snapshotValue, revision: 1, targetIndex: 1 }
  }));
  const correct = vi.fn();
  const pause = vi.fn(async () => undefined);
  const timeout = vi.fn(async () => undefined);
  return {
    snapshot,
    submit,
    correct,
    pause,
    timeout,
    panel: new PracticeWebviewPanel({
      extensionUri: Uri.file('/extension'),
      coordinator: { snapshot, submit, correct },
      pause,
      timeout,
      reportError: vi.fn()
    })
  };
}

function ready(panelInstanceId: string) {
  return {
    protocolVersion: 1,
    type: 'practice/ready',
    sessionId: 'session-1',
    panelInstanceId,
    sequence: 1
  };
}
