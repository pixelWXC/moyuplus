import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activate,
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  ROUTE_ENTER_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  SMOKE_COMMAND_ID,
  SMOKE_MESSAGE,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
} from '../../extension';
import { IMPORT_BOOK_COMMAND_ID, RELOCATE_BOOK_COMMAND_ID, REMOVE_BOOK_COMMAND_ID } from '../../commands/libraryCommands';
import { READER_VIEW_ID } from '../../reader/readerMessages';
import {
  CLOSE_READER_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID,
  UNDO_READER_LOCATION_COMMAND_ID
} from '../../shortcuts/shortcutSettings';
import {
  NEXT_READER_CHAPTER_COMMAND_ID, OPEN_READER_LIBRARY_COMMAND_ID, OPEN_READER_SETTINGS_COMMAND_ID,
  OPEN_READER_TOC_COMMAND_ID, PREVIOUS_READER_CHAPTER_COMMAND_ID,
  STOP_IMMERSIVE_READING_COMMAND_ID
} from '../../shortcuts/shortcutSettings';
import {
  Uri,
  commands,
  createWebviewView,
  languages,
  resetVSCodeShim,
  type Disposable,
  window,
  workspace
} from '../shims/vscode';
import { BOOK_LIBRARY_KEY, READER_V2_MIGRATION_KEY, TXT_LIBRARY_KEY } from '../../storage/storageKeys';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';
import { IMAGE_PREVIEW_VIEW_TYPE } from '../../reader/imagePreviewService';
import { OPEN_SETTINGS_COMMAND_ID, SETTINGS_PANEL_VIEW_TYPE } from '../../settings/MoyuPlusSettingsPanel';
import {
  TYPING_VIEW_ID,
  TYPING_VIEW_PROTOCOL_VERSION
} from '../../typing/adapters/view/typingViewProtocol';
import { TYPING_PRACTICE_PANEL_VIEW_TYPE } from '../../typing/adapters/panel';
import {
  PracticeSessionRuntime,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type PracticeCheckpoint
} from '../../typing';
import {
  PracticeContinuationStore,
  SessionLeaseStore,
  WorkspaceSessionStore as TypingWorkspaceSessionStore
} from '../../typing/adapters/storage';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initial: Record<string, unknown> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const temporaryRoots: string[] = [];

describe('extension activation', () => {
  beforeEach(() => {
    resetVSCodeShim();
  });

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, {
      recursive: true,
      force: true
    })));
  });

  it('registers the new typing stack and smoke command without global completion', async () => {
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };

    await activate(context);

    expect(commands.registeredCommandIds()).toEqual([
      SMOKE_COMMAND_ID,
      IMPORT_BOOK_COMMAND_ID,
      REMOVE_BOOK_COMMAND_ID,
      RELOCATE_BOOK_COMMAND_ID,
      OPEN_SETTINGS_COMMAND_ID,
      NEXT_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_PAGE_COMMAND_ID,
      UNDO_READER_LOCATION_COMMAND_ID,
      FOCUS_READER_COMMAND_ID,
      CLOSE_READER_COMMAND_ID,
      OPEN_READER_LIBRARY_COMMAND_ID,
      PREVIOUS_READER_CHAPTER_COMMAND_ID,
      NEXT_READER_CHAPTER_COMMAND_ID,
      OPEN_READER_TOC_COMMAND_ID,
      OPEN_READER_SETTINGS_COMMAND_ID,
      STOP_IMMERSIVE_READING_COMMAND_ID,
      TOGGLE_GIT_LOG_COMMAND_ID,
      START_TYPING_PRACTICE_COMMAND_ID,
      STOP_TYPING_PRACTICE_COMMAND_ID,
      RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_COMMAND_ID,
      NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
      JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
      SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
      ROUTE_ENTER_COMMAND_ID
    ]);
    expect(window.registeredWebviewViewProviderIds()).toEqual([READER_VIEW_ID, TYPING_VIEW_ID]);
    expect(window.registeredCustomEditorProviderIds()).toEqual([IMAGE_PREVIEW_VIEW_TYPE]);
    expect(languages.registeredInlineCompletionSelectors()).toEqual([]);
    expect(window.statusBarItems).toEqual([]);
    expect(context.subscriptions.length).toBeGreaterThan(0);

    const result = await commands.executeRegisteredCommand(SMOKE_COMMAND_ID);

    expect(result).toBe(SMOKE_MESSAGE);
    expect(window.informationMessages).toEqual([SMOKE_MESSAGE]);

    await commands.executeRegisteredCommand(OPEN_SETTINGS_COMMAND_ID, { ignored: 'resource argument' });
    expect(window.createdWebviewPanels).toHaveLength(1);
    expect(window.createdWebviewPanels[0].viewType).toBe(SETTINGS_PANEL_VIEW_TYPE);
  });

  it('migrates legacy TXT records before registration and remains idempotent across activation', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [{
        id: 'legacy-1', name: 'legacy.txt', uri: 'file:///legacy.txt', encoding: 'utf8',
        source: 'external', createdAt: 1, updatedAt: 1
      }]
    });
    const workspaceState = new MemoryMemento();

    await activate({ globalState, workspaceState, subscriptions: [] as Disposable[] });
    const firstBooks = globalState.get<unknown[]>(BOOK_LIBRARY_KEY);
    const firstMarker = globalState.get(READER_V2_MIGRATION_KEY);
    await activate({ globalState, workspaceState, subscriptions: [] as Disposable[] });

    expect(firstBooks).toHaveLength(1);
    expect(globalState.get(BOOK_LIBRARY_KEY)).toEqual(firstBooks);
    expect(globalState.get(READER_V2_MIGRATION_KEY)).toEqual(firstMarker);
  });

  it('wires the Typing View to the application material query during activation', async () => {
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: Uri.file('D:/moyuplus-test-global-storage'),
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-activation',
      type: 'typingReady'
    });

    expect(view.webview.postedMessages).toHaveLength(1);
    expect(view.webview.postedMessages[0]).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'materials',
        content: expect.objectContaining({
          kind: 'materials',
          library: []
        })
      })
    }));
    expect(view.webview.postedMessages[0]?.snapshot?.content)
      .not.toHaveProperty('builtIn');
  });

  it('routes the Reader shelf typing action into the new Typing View setup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-reader-typing-'));
    temporaryRoots.push(root);
    const sourcePath = path.join(root, 'reader-source.txt');
    await writeFile(sourcePath, '第一章\nReader typing bridge', 'utf8');
    const sourceUri = Uri.file(sourcePath).toString();
    const globalState = new MemoryMemento({
      [BOOK_LIBRARY_KEY]: [{
        schemaVersion: 2,
        id: 'reader-book-1',
        uri: sourceUri,
        source: 'external',
        title: '书架练习源',
        authors: [],
        capabilities: { readable: true, typing: true, toc: true },
        format: 'txt',
        formatData: { encoding: 'utf8' },
        createdAt: 1,
        updatedAt: 1
      }]
    });
    await activate({
      globalState,
      workspaceState: new MemoryMemento(),
      globalStorageUri: Uri.file(path.join(root, 'global-storage')),
      storageUri: {
        fsPath: path.join(root, 'workspace-storage')
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const typingView = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(typingView);
    await typingView.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'reader-typing-entry',
      type: 'typingReady'
    });
    const readerView = createWebviewView();
    await window.registeredWebviewViewProvider(READER_VIEW_ID)
      ?.resolveWebviewView(readerView);

    await readerView.webview.receiveMessage({
      type: 'startTypingPractice',
      bookId: 'reader-book-1'
    });

    expect(typingView.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          activePage: 'setup',
          content: expect.objectContaining({
            kind: 'setup',
            source: expect.objectContaining({
              title: '书架练习源'
            })
          })
        })
      })
    );
    expect(commands.executedBuiltinCommands()).toContainEqual({
      commandId: `${TYPING_VIEW_ID}.focus`,
      args: []
    });

    const setup = typingView.webview.postedMessages.at(-1)?.snapshot?.content;
    expect(setup?.kind).toBe('setup');
    await typingView.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'reader-typing-entry',
      type: 'startPractice',
      requestId: 'start-reader-source',
      clientRevision: 1,
      selectedRange: setup?.selectedRange,
      plan: setup?.plan
    });

    expect(typingView.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          activePage: 'live',
          activeSessionStatus: 'running',
          content: expect.objectContaining({
            kind: 'live',
            status: 'running'
          })
        })
      })
    );
    expect(window.createdWebviewPanels.some(
      panel => panel.viewType === TYPING_PRACTICE_PANEL_VIEW_TYPE
    )).toBe(true);
  });

  it('wires recent, result, history and mastery pages to the real empty fact stores', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-facts-'));
    temporaryRoots.push(root);
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: path.join(root, 'global-storage')
      } as Uri,
      storageUri: {
        fsPath: path.join(root, 'workspace-storage')
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-facts',
      type: 'typingReady'
    });

    for (const [clientRevision, page, kind] of [
      [1, 'recent', 'recent'],
      [2, 'result', 'result'],
      [3, 'history', 'history'],
      [4, 'mastery', 'mastery']
    ] as const) {
      await view.webview.receiveMessage({
        protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
        instanceId: 'typing-view-facts',
        type: 'navigate',
        requestId: `navigate-${page}`,
        clientRevision,
        page
      });
      expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
        snapshot: expect.objectContaining({
          activePage: page,
          content: expect.objectContaining({ kind })
        })
      }));
    }
  });

  it('starts a mastery batch through the registered mastery content provider', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-mastery-'));
    temporaryRoots.push(root);
    const globalStorage = path.join(root, 'global-storage');
    const projectionDirectory = path.join(globalStorage, 'projections');
    await mkdir(projectionDirectory, { recursive: true });
    await writeFile(
      path.join(projectionDirectory, 'mastery.v1.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        sourceResultIds: [],
        entries: [{
          schemaVersion: 1,
          key: '错词',
          kind: 'word',
          contentProfile: { kind: 'chinese', category: 'adHoc' },
          wrongCount: 1,
          reinforcementCorrectStreak: 0,
          lastErrorAt: 1_000,
          lastPracticedAt: 1_000,
          score: 1,
          algorithmVersion: 'mastery-v2'
        }]
      }, undefined, 2)}\n`,
      'utf8'
    );
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: globalStorage
      } as Uri,
      storageUri: {
        fsPath: path.join(root, 'workspace-storage')
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-mastery',
      type: 'typingReady'
    });

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-mastery',
      type: 'startMasteryPractice',
      requestId: 'start-mastery',
      clientRevision: 1
    });

    expect(window.errorMessages).toEqual([]);
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'live',
        activeSessionStatus: 'running',
        content: expect.objectContaining({
          kind: 'live',
          status: 'running'
        })
      })
    }));
    expect(window.createdWebviewPanels.some(
      panel => panel.viewType === TYPING_PRACTICE_PANEL_VIEW_TYPE
    )).toBe(true);
  });

  it('inspects pasted text into an authoritative setup snapshot', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-setup-'));
    temporaryRoots.push(root);
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: path.join(root, 'global-storage')
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-setup',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-setup',
      type: 'usePastedText',
      requestId: 'paste-setup-source',
      clientRevision: 1,
      text: '清晨的街道逐渐醒来。'
    });

    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'setup',
        content: expect.objectContaining({
          kind: 'setup',
          source: expect.objectContaining({
            title: expect.any(String),
            counts: expect.objectContaining({
              printableUnits: expect.any(Number)
            })
          }),
          ranges: expect.any(Array),
          plan: expect.objectContaining({
            evaluation: expect.any(Object),
            textPolicy: expect.any(Object)
          })
        })
      })
    }));

  });

  it('saves setup defaults explicitly and opens the native practice language settings', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-defaults-'));
    temporaryRoots.push(root);
    const globalStorage = path.join(root, 'global-storage');
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: globalStorage
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-defaults',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-defaults',
      type: 'usePastedText',
      requestId: 'paste-default-source',
      clientRevision: 1,
      text: '保存这一段自由练习作为默认设置测试。'
    });
    const setup = view.webview.postedMessages.at(-1)?.snapshot?.content;
    expect(setup?.kind).toBe('setup');
    const plan = {
      ...setup?.plan,
      evaluation: {
        errorPolicy: 'allowSkip'
      },
      displayPolicy: {
        showLiveMetrics: false,
        showWhitespace: true
      }
    };

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-defaults',
      type: 'saveSetupAsDefault',
      requestId: 'save-defaults',
      clientRevision: 2,
      selectedRange: setup?.selectedRange,
      plan
    });

    const saved = JSON.parse(await readFile(
      path.join(globalStorage, 'preferences', 'practice.v1.json'),
      'utf8'
    ));
    expect(saved).toMatchObject({
      schemaVersion: 1,
      evaluation: {
        errorPolicy: 'allowSkip'
      },
      displayPolicy: {
        showLiveMetrics: false,
        showWhitespace: true
      }
    });
    expect(saved).not.toHaveProperty('completion');
    expect(window.informationMessages).toContain(
      '已保存为新的打字练习默认设置。'
    );

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-defaults',
      type: 'openPracticeEditorSettings',
      requestId: 'open-practice-settings',
      clientRevision: 3
    });
    expect(commands.executedBuiltinCommands()).toContainEqual({
      commandId: 'workbench.action.openSettings',
      args: ['@ext:local.moyuplus moyuplus.typing']
    });
  });

  it('starts the configured Typing View draft through the real application coordinator', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-start-'));
    temporaryRoots.push(root);
    const workspaceStorage = path.join(root, 'workspace-storage');
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: path.join(root, 'global-storage')
      } as Uri,
      storageUri: {
        fsPath: workspaceStorage
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'usePastedText',
      requestId: 'paste-start-source',
      clientRevision: 1,
      text: '开始一段可以稳定完成的自由练习。'
    });
    const setup = view.webview.postedMessages.at(-1)?.snapshot?.content;
    expect(setup?.kind).toBe('setup');

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'startPractice',
      requestId: 'start-configured-source',
      clientRevision: 2,
      selectedRange: setup?.selectedRange,
      plan: setup?.plan
    });

    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'live',
        activeSessionStatus: 'running',
        content: expect.objectContaining({
          kind: 'live',
          status: 'running'
        })
      })
    }));
    expect(workspace.registeredFileSystemProviderSchemes()).toEqual([]);
    expect(window.createdWebviewPanels.some(
      panel => panel.viewType === TYPING_PRACTICE_PANEL_VIEW_TYPE
    )).toBe(true);
    const workspaceSessions = new TypingWorkspaceSessionStore(workspaceStorage);
    await expect(workspaceSessions.getActiveSessionId())
      .resolves.toMatch(/^session-/);

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'controlPractice',
      requestId: 'pause-live-session',
      clientRevision: 3,
      action: 'pause'
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'live',
        activeSessionStatus: 'paused',
        content: expect.objectContaining({
          kind: 'live',
          status: 'paused',
          controls: expect.objectContaining({
            pause: false,
            resume: true
          })
        })
      })
    }));

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'startPractice',
      requestId: 'start-with-active-session',
      clientRevision: 4,
      selectedRange: setup?.selectedRange,
      plan: setup?.plan
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'setup',
        content: expect.objectContaining({
          kind: 'sessionConflict',
          status: 'paused'
        })
      })
    }));
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'resolveSessionConflict',
      requestId: 'return-current-session',
      clientRevision: 5,
      resolution: 'returnCurrent'
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'live',
        activeSessionStatus: 'paused'
      })
    }));

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-start',
      type: 'controlPractice',
      requestId: 'finish-live-session',
      clientRevision: 6,
      action: 'finish'
    });
    await expect(workspaceSessions.getActiveSessionId())
      .resolves.toBeUndefined();
  });

  it('offers and restores an indexed workspace checkpoint after its lease was released', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-recovery-'));
    temporaryRoots.push(root);
    const workspaceStorage = path.join(root, 'workspace-storage');
    const contentProfile = { kind: 'english', category: 'adHoc' } as const;
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-recovery',
      createdAt: 1_000,
      plan: createDefaultPracticePlan({
        contentRecipe: { kind: 'adHoc', text: 'ab' },
        contentProfile
      }),
      prepared: preparePracticeContent('ab', {
        sourceRevision: 'recovery-v1',
        contentProfile,
        range: { kind: 'whole' }
      })
    });
    const session = new PracticeSessionRuntime().start({
      sessionId: 'session-recovery',
      attemptId: 'attempt-recovery',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    const checkpoint: PracticeCheckpoint = {
      schemaVersion: 1,
      session: {
        ...session,
        targetIndex: 1,
        updatedAt: 2_000
      },
      acceptedTextByLine: ['a'],
      savedAt: 2_000
    };
    const workspaceSessions = new TypingWorkspaceSessionStore(workspaceStorage);
    await workspaceSessions.saveSnapshot(session.id, snapshot);
    await workspaceSessions.saveCheckpoint(checkpoint);
    await workspaceSessions.saveActiveSession(session.id);

    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: path.join(root, 'global-storage')
      } as Uri,
      storageUri: {
        fsPath: workspaceStorage
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-recovery',
      type: 'typingReady'
    });

    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        recovery: {
          status: 'running',
          savedAt: 2_000,
          completedUnits: 1,
          totalUnits: 2
        }
      })
    }));

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-recovery',
      type: 'recoverPractice',
      requestId: 'recover-expired-session',
      clientRevision: 1
    });

    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'live',
        activeSessionStatus: 'paused',
        recovery: null,
        content: expect.objectContaining({
          kind: 'live',
          status: 'paused',
          progress: null,
          metrics: null
        })
      })
    }));
    expect(window.createdWebviewPanels.some(
      panel => panel.viewType === TYPING_PRACTICE_PANEL_VIEW_TYPE
    )).toBe(true);
  });

  it('imports a TXT through the Typing View command port and refreshes the material catalog', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-view-'));
    temporaryRoots.push(root);
    const globalStorage = path.join(root, 'global-storage');
    const source = Uri.file(path.join(root, '练习.txt'));
    workspace.fileContents.set(source.toString(), Buffer.from('中文和 English', 'utf8'));
    window.openDialogResult = [source];

    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: globalStorage
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'importMaterial',
      requestId: 'import-txt',
      clientRevision: 1,
      format: 'txt'
    });

    expect(window.errorMessages).toEqual([]);
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        activePage: 'materials',
        content: expect.objectContaining({
          library: [
            expect.objectContaining({
              title: '练习',
              origin: 'txtImport',
              profileKey: 'mixed.adHoc'
            })
          ]
        })
      })
    }));
    const imported = view.webview.postedMessages.at(-1)?.snapshot?.content;
    const materialId = imported?.kind === 'materials'
      ? imported.library[0]?.id
      : undefined;
    expect(materialId).toBeTruthy();

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'removeMaterial',
      requestId: 'remove-imported-txt',
      clientRevision: 2,
      materialId
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        content: expect.objectContaining({
          kind: 'materials',
          library: [],
          pendingRemovals: [
            expect.objectContaining({
              materialId,
              waitingForPractice: false
            })
          ]
        })
      })
    }));

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'undoRemoveMaterial',
      requestId: 'undo-remove-imported-txt',
      clientRevision: 3,
      materialId
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        content: expect.objectContaining({
          kind: 'materials',
          library: [
            expect.objectContaining({ id: materialId })
          ],
          pendingRemovals: []
        })
      })
    }));

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'selectMaterial',
      requestId: 'select-imported-txt',
      clientRevision: 4,
      materialId,
      materialOrigin: 'txtImport'
    });
    const setup = view.webview.postedMessages.at(-1)?.snapshot?.content;
    expect(setup?.kind).toBe('setup');
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'startPractice',
      requestId: 'start-imported-txt',
      clientRevision: 5,
      selectedRange: setup?.selectedRange,
      startPosition: { kind: 'beginning' },
      plan: setup?.plan
    });

    const workspaceSessions = new TypingWorkspaceSessionStore(
      path.join(globalStorage, 'workspace-default')
    );
    const sessionId = await workspaceSessions.getActiveSessionId();
    expect(sessionId).toBeTruthy();
    const practiceSnapshot = await workspaceSessions.getSnapshot(sessionId!);
    const firstTarget = practiceSnapshot?.targetUnits[0]?.value;
    expect(firstTarget).toBeTruthy();
    const practicePanel = window.createdWebviewPanels.find(
      panel => panel.viewType === TYPING_PRACTICE_PANEL_VIEW_TYPE
    );
    await practicePanel?.webview.receiveMessage({
      protocolVersion: 1,
      type: 'practice/ready',
      sessionId,
      panelInstanceId: 'panel-imported-txt',
      sequence: 1
    });
    await practicePanel?.webview.receiveMessage({
      protocolVersion: 1,
      type: 'practice/submit',
      sessionId,
      panelInstanceId: 'panel-imported-txt',
      sequence: 1,
      transactionId: 'input-imported-txt-1',
      baseRevision: 0,
      inputKind: 'direct',
      text: firstTarget
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'controlPractice',
      requestId: 'finish-imported-txt',
      clientRevision: 6,
      action: 'finish'
    });

    await expect(new PracticeContinuationStore(globalStorage).get(
      { kind: 'custom', materialId: materialId! },
      { kind: 'whole' }
    )).resolves.toMatchObject({
      targetIndex: 1
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'navigate',
      requestId: 'return-to-materials',
      clientRevision: 7,
      page: 'materials'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-import',
      type: 'selectMaterial',
      requestId: 'reselect-imported-txt',
      clientRevision: 8,
      materialId,
      materialOrigin: 'txtImport'
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(expect.objectContaining({
      snapshot: expect.objectContaining({
        content: expect.objectContaining({
          kind: 'setup',
          startPosition: { kind: 'continuation' },
          continuations: [
            expect.objectContaining({ targetIndex: 1 })
          ]
        })
      })
    }));
  });

  it('starts freely pasted content through the real application coordinator', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-paste-'));
    temporaryRoots.push(root);
    await activate({
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      globalStorageUri: {
        fsPath: path.join(root, 'global-storage')
      } as Uri,
      storageUri: {
        fsPath: path.join(root, 'workspace-storage')
      } as Uri,
      extensionUri: Uri.file('D:/moyuplus-test-extension'),
      subscriptions: [] as Disposable[]
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-paste',
      type: 'typingReady'
    });

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-paste',
      type: 'usePastedText',
      requestId: 'paste-free-content',
      clientRevision: 1,
      text: '自由练习 with English'
    });
    const setup = view.webview.postedMessages.at(-1)?.snapshot?.content;
    expect(setup).toEqual(expect.objectContaining({
      kind: 'setup',
      source: expect.objectContaining({
        profileKey: 'mixed.adHoc'
      })
    }));

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-paste',
      type: 'startPractice',
      requestId: 'start-free-content',
      clientRevision: 2,
      selectedRange: setup?.selectedRange,
      plan: setup?.plan
    });

    expect(view.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          activePage: 'live',
          activeSessionStatus: 'running',
          content: expect.objectContaining({
            kind: 'live',
            status: 'running'
          })
        })
      })
    );
    expect(window.createdWebviewPanels.some(
      panel => panel.viewType === TYPING_PRACTICE_PANEL_VIEW_TYPE
    )).toBe(true);
  });
});
