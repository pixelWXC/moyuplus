import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  PracticeWebviewPanel,
  TYPING_PRACTICE_PANEL_VIEW_TYPE
} from '../../typing/adapters/panel';
import type { PracticePanelSnapshot } from '../../typing/application';

const SESSION_ID = 'extension-host-webview-session';

export async function run(): Promise<void> {
  const editorBefore = vscode.window.activeTextEditor;
  let snapshotRequested = false;
  let unhandled: unknown;
  const onUnhandled = (reason: unknown) => {
    unhandled = reason;
  };
  process.on('unhandledRejection', onUnhandled);

  const panel = new PracticeWebviewPanel({
    extensionUri: vscode.Uri.file(process.env.MOYUPLUS_PROJECT_ROOT ?? process.cwd()),
    coordinator: {
      snapshot: async sessionId => {
        assert.equal(sessionId, SESSION_ID);
        snapshotRequested = true;
        return snapshot();
      },
      submit: async () => {
        throw new Error('The Extension Host smoke does not synthesize DOM input.');
      },
      correct: async () => {
        throw new Error('The Extension Host smoke does not synthesize DOM input.');
      }
    },
    pause: async () => undefined,
    timeout: async () => undefined,
    reportError: error => {
      throw error;
    }
  });

  try {
    panel.open(SESSION_ID);
    await waitUntil(() => snapshotRequested);
    assert.equal(vscode.window.activeTextEditor, editorBefore);
    assert.equal(
      vscode.window.tabGroups.activeTabGroup.activeTab?.label,
      '打字练习'
    );
    assert.equal(unhandled, undefined);
  } finally {
    panel.dispose();
    process.off('unhandledRejection', onUnhandled);
    await vscode.commands.executeCommand(
      'workbench.action.closeActiveEditor'
    );
  }
}

function snapshot(): PracticePanelSnapshot {
  return {
    sessionId: SESSION_ID,
    revision: 0,
    status: 'running',
    targetIndex: 0,
    totalUnits: 3,
    showMetrics: true,
    metrics: {
      activeElapsedMs: 0,
      currentCpm: 0,
      accuracy: 100,
      remaining: {
        kind: 'units',
        remainingUnits: 3
      }
    },
    window: {
      start: 0,
      end: 3,
      units: [
        { index: 0, text: 'a', display: 'a', state: 'target' },
        { index: 1, text: 'b', display: 'b', state: 'remaining' },
        { index: 2, text: 'c', display: 'c', state: 'remaining' }
      ]
    },
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for ${TYPING_PRACTICE_PANEL_VIEW_TYPE} ready.`
      );
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
