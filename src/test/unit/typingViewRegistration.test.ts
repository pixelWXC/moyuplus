import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Uri,
  createWebviewView,
  resetVSCodeShim,
  window
} from '../shims/vscode';
import {
  registerTypingView
} from '../../typing/registration';
import {
  TYPING_VIEW_ID,
  TYPING_VIEW_PAGES,
  TYPING_VIEW_PROTOCOL_VERSION
} from '../../typing/adapters/view/typingViewProtocol';

describe('Typing View registration', () => {
  beforeEach(() => resetVSCodeShim());

  it('registers the independent provider and disposes it with the extension context', async () => {
    const subscriptions: Array<{ dispose(): unknown }> = [];
    const query = {
      shellSnapshot: vi.fn(async () => ({
        activePage: 'materials' as const,
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'materials' as const,
          builtIn: [],
          library: [],
          actions: {
            paste: true,
            importTxt: true,
            importEpub: true
          }
        }
      }))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined)
    };

    registerTypingView(
      { subscriptions },
      Uri.file('/extension') as never,
      query,
      commands
    );

    expect(window.registeredWebviewViewProviderIds()).toContain(TYPING_VIEW_ID);
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    expect(query.shellSnapshot).toHaveBeenCalledWith('materials');
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'importMaterial',
      requestId: 'import-txt',
      clientRevision: 1,
      format: 'txt'
    });
    expect(commands.importTxt).toHaveBeenCalledTimes(1);
    expect(query.shellSnapshot).toHaveBeenLastCalledWith('materials');
    subscriptions.reverse().forEach(disposable => disposable.dispose());
    expect(window.registeredWebviewViewProviderIds()).not.toContain(TYPING_VIEW_ID);
  });
});
