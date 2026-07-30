import { describe, expect, it, vi } from 'vitest';
import { Uri, createWebviewView } from '../shims/vscode';
import {
  TYPING_VIEW_PAGES,
  TYPING_VIEW_PRIMARY_PAGES,
  TYPING_VIEW_PROTOCOL_VERSION,
  TypingViewProvider,
  type TypingViewPage,
  type TypingViewShellSnapshot
} from '../../typing/adapters/view';

function snapshot(activePage: TypingViewPage): TypingViewShellSnapshot {
  return {
    activePage,
    availablePages: activePage === 'setup'
      ? [...TYPING_VIEW_PAGES]
      : [...TYPING_VIEW_PRIMARY_PAGES],
    activeSessionStatus: null,
    pendingResultCount: 0,
    recovery: null,
    content: activePage === 'materials'
      ? {
        kind: 'materials',
        library: [],
        actions: {
          paste: true,
          importTxt: true,
          importEpub: true
        }
      }
      : {
        kind: 'unavailable',
        page: activePage
      }
  };
}

describe('TypingViewProvider', () => {
  it('boots a script-restricted Webview and answers the guarded handshake', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query);
    const view = createWebviewView();

    provider.resolveWebviewView(view as never);

    expect(view.webview.options.enableScripts).toBe(true);
    expect(view.webview.options.localResourceRoots?.map(uri => uri.toString())).toEqual([
      Uri.file('/extension/media').toString()
    ]);
    expect(view.webview.html).toContain('typingApp.js');
    expect(view.webview.html).toContain('Content-Security-Policy');

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    expect(query.shellSnapshot).toHaveBeenCalledWith('materials');
    expect(view.webview.postedMessages).toContainEqual({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'shellSnapshot',
      snapshotRevision: 1,
      snapshot: snapshot('materials')
    });
  });

  it('binds one Webview instance and ignores malformed or stale navigation', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'navigate',
      requestId: 'navigate-history',
      clientRevision: 2,
      page: 'history'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'navigate',
      requestId: 'stale',
      clientRevision: 1,
      page: 'mastery'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-2',
      type: 'navigate',
      requestId: 'foreign',
      clientRevision: 3,
      page: 'result'
    });
    await view.webview.receiveMessage({
      protocolVersion: 999,
      instanceId: 'typing-view-1',
      type: 'navigate',
      requestId: 'bad-version',
      clientRevision: 4,
      page: 'live'
    });

    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['history']
    ]);
    expect(view.webview.postedMessages).toHaveLength(2);
    expect(view.webview.postedMessages[1]).toEqual(expect.objectContaining({
      instanceId: 'typing-view-1',
      snapshotRevision: 2,
      snapshot: snapshot('history')
    }));
  });

  it('adopts a guarded query fallback when setup is no longer available', async () => {
    const fallback = snapshot('materials');
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => (
        page === 'setup' ? fallback : snapshot(page)
      ))
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'navigate',
      requestId: 'navigate-stale-setup',
      clientRevision: 1,
      page: 'setup'
    });
    await provider.refreshCurrent();

    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['setup'],
      ['materials']
    ]);
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: fallback
    }));
  });

  it('synchronizes a completed result into the existing sidebar without refocusing it', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    await provider.syncPage('result');

    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['result']
    ]);
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshotRevision: 2,
      snapshot: snapshot('result')
    }));
  });

  it('routes material commands through the injected port and refreshes the authoritative page', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      removeMaterial: vi.fn(async () => true),
      undoRemoveMaterial: vi.fn(async () => true),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'selectMaterial',
      requestId: 'select-1',
      clientRevision: 1,
      materialId: 'custom-1',
      materialOrigin: 'custom'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'usePastedText',
      requestId: 'paste-1',
      clientRevision: 2,
      text: '自由练习内容'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'importMaterial',
      requestId: 'txt-1',
      clientRevision: 3,
      format: 'txt'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'importMaterial',
      requestId: 'epub-1',
      clientRevision: 4,
      format: 'epub'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'removeMaterial',
      requestId: 'remove-1',
      clientRevision: 5,
      materialId: 'custom-1'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'undoRemoveMaterial',
      requestId: 'undo-remove-1',
      clientRevision: 6,
      materialId: 'custom-1'
    });

    expect(commands.selectMaterial).toHaveBeenCalledWith({
      materialId: 'custom-1',
      materialOrigin: 'custom'
    });
    expect(commands.usePastedText).toHaveBeenCalledWith('自由练习内容');
    expect(commands.importTxt).toHaveBeenCalledTimes(1);
    expect(commands.importEpub).toHaveBeenCalledTimes(1);
    expect(commands.removeMaterial).toHaveBeenCalledWith('custom-1');
    expect(commands.undoRemoveMaterial).toHaveBeenCalledWith('custom-1');
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['setup'],
      ['setup'],
      ['materials'],
      ['materials'],
      ['materials'],
      ['materials']
    ]);
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshotRevision: 7,
      snapshot: snapshot('materials')
    }));
  });

  it('ignores stale material commands before they can mutate application state', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'navigate',
      requestId: 'navigate-2',
      clientRevision: 2,
      page: 'materials'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'importMaterial',
      requestId: 'stale-import',
      clientRevision: 1,
      format: 'txt'
    });

    expect(commands.importTxt).not.toHaveBeenCalled();
    expect(query.shellSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps the current page when a material command reports that it was not applied', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => false),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'usePastedText',
      requestId: 'invalid-paste',
      clientRevision: 1,
      text: 'not empty but rejected by the domain'
    });

    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['materials']
    ]);
  });

  it('routes setup configuration through the command port and refreshes setup facts', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined),
      configureSetup: vi.fn(async () => undefined)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    const setup = {
      selectedRange: {
        kind: 'whole'
      },
      plan: {
        completion: {
          kind: 'free'
        },
        evaluation: {
          errorPolicy: 'block'
        },
        textPolicy: {
          punctuation: {
            mode: 'strict',
            mappingVersion: 'strict-v1'
          },
          whitespace: {
            mode: 'trimLineEdges'
          },
          caseSensitive: true
        },
        flowPolicy: {
          lineAdvance: 'automatic',
          presentation: 'continuous'
        },
        displayPolicy: {
          showLiveMetrics: true,
          showWhitespace: false
        }
      }
    } as const;
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'configureSetup',
      requestId: 'configure-1',
      clientRevision: 1,
      ...setup
    });

    expect(commands.configureSetup).toHaveBeenCalledWith(setup);
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['setup']
    ]);
  });

  it('routes explicit start and conflict resolution to authoritative destination pages', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined),
      configureSetup: vi.fn(async () => undefined),
      startPractice: vi.fn(async () => 'setup' as const),
      resolveSessionConflict: vi.fn(async () => 'live' as const)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'startPractice',
      requestId: 'start-1',
      clientRevision: 1,
      selectedRange: { kind: 'whole' },
      plan: {
        completion: { kind: 'free' },
        evaluation: { errorPolicy: 'block' },
        textPolicy: {
          punctuation: { mode: 'strict', mappingVersion: 'strict-v1' },
          whitespace: { mode: 'trimLineEdges' },
          caseSensitive: true
        },
        flowPolicy: {
          lineAdvance: 'automatic',
          presentation: 'continuous'
        },
        displayPolicy: {
          showLiveMetrics: true,
          showWhitespace: false
        }
      }
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'resolveSessionConflict',
      requestId: 'resolve-1',
      clientRevision: 2,
      resolution: 'returnCurrent'
    });

    expect(commands.startPractice).toHaveBeenCalledTimes(1);
    expect(commands.resolveSessionConflict).toHaveBeenCalledWith('returnCurrent');
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['setup'],
      ['live']
    ]);
  });

  it('contains rejected commands and reports them without leaking an unhandled promise', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const failure = new Error('mastery provider unavailable');
    const commands = {
      startMasteryPractice: vi.fn(async () => {
        throw failure;
      })
    };
    const reportError = vi.fn(async () => undefined);
    const provider = new TypingViewProvider(
      Uri.file('/extension'),
      query,
      commands as never,
      reportError
    );
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });

    await expect(view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'startMasteryPractice',
      requestId: 'start-mastery-1',
      clientRevision: 1
    })).resolves.toBeUndefined();

    expect(reportError).toHaveBeenCalledWith(failure);
    expect(query.shellSnapshot).toHaveBeenCalledTimes(1);
  });

  it('routes live controls without accepting a Webview-selected session id', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined),
      configureSetup: vi.fn(async () => undefined),
      startPractice: vi.fn(async () => 'live' as const),
      resolveSessionConflict: vi.fn(async () => 'live' as const),
      controlPractice: vi.fn(async () => 'live' as const)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'controlPractice',
      requestId: 'pause-1',
      clientRevision: 1,
      action: 'pause'
    });

    expect(commands.controlPractice).toHaveBeenCalledWith('pause');
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['live']
    ]);
  });

  it('routes recovery decisions without accepting a Webview-selected session id', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined),
      configureSetup: vi.fn(async () => undefined),
      startPractice: vi.fn(async () => 'live' as const),
      resolveSessionConflict: vi.fn(async () => 'live' as const),
      controlPractice: vi.fn(async () => 'live' as const),
      recoverPractice: vi.fn(async () => true),
      dismissRecovery: vi.fn(async () => undefined)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'recoverPractice',
      requestId: 'recover-1',
      clientRevision: 1
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'dismissRecovery',
      requestId: 'dismiss-1',
      clientRevision: 2
    });

    expect(commands.recoverPractice).toHaveBeenCalledTimes(1);
    expect(commands.dismissRecovery).toHaveBeenCalledTimes(1);
    expect(commands.importEpub).not.toHaveBeenCalled();
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['live'],
      ['live']
    ]);
  });

  it('routes explicit default saving and the host-owned language settings entry', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const commands = {
      selectMaterial: vi.fn(async () => undefined),
      usePastedText: vi.fn(async () => undefined),
      importTxt: vi.fn(async () => undefined),
      importEpub: vi.fn(async () => undefined),
      configureSetup: vi.fn(async () => undefined),
      saveSetupAsDefault: vi.fn(async () => undefined),
      openPracticeEditorSettings: vi.fn(async () => undefined)
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query, commands);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    const setup = {
      selectedRange: { kind: 'whole' as const },
      plan: {
        completion: { kind: 'free' as const },
        evaluation: { errorPolicy: 'block' as const },
        textPolicy: {
          punctuation: { mode: 'strict' as const, mappingVersion: 'strict-v1' },
          whitespace: { mode: 'trimLineEdges' as const },
          caseSensitive: true
        },
        flowPolicy: {
          lineAdvance: 'automatic' as const,
          presentation: 'continuous' as const
        },
        displayPolicy: {
          showLiveMetrics: true,
          showWhitespace: false
        }
      }
    };
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'saveSetupAsDefault',
      requestId: 'save-defaults-1',
      clientRevision: 1,
      ...setup
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'openPracticeEditorSettings',
      requestId: 'open-language-settings-1',
      clientRevision: 2
    });

    expect(commands.saveSetupAsDefault).toHaveBeenCalledWith(setup);
    expect(commands.openPracticeEditorSettings).toHaveBeenCalledOnce();
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['setup'],
      ['setup']
    ]);
  });
});
