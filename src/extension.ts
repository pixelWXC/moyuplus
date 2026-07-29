import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  registerShortcutRouter,
  ROUTE_ENTER_COMMAND_ID
} from './commands/shortcutRouter';
import { READER_VIEW_ID, registerReaderView } from './reader/ReaderViewProvider';
import { BookLibraryStore } from './storage/bookLibraryStore';
import { TxtAdapter } from './adapters/txt/txtAdapter';
import { AdapterRegistry } from './adapters/adapterRegistry';
import { EpubAdapter } from './adapters/epub/epubAdapter';
import { ReadingProgressStore } from './storage/readingProgressStore';
import { LibraryService } from './library/libraryService';
import { ReaderSessionCoordinator } from './reader/ReaderSessionCoordinator';
import { ImmersiveDecorationPresenter } from './reader/ImmersiveDecorationPresenter';
import { migrateV1ToV2 } from './storage/migrations/migrateV1ToV2';
import { ReaderPreferencesStore } from './storage/readerPreferencesStore';
import { ImmersiveReaderPreferencesStore } from './storage/immersiveReaderPreferencesStore';
import { GitLogPreferencesStore } from './storage/gitLogPreferencesStore';
import { GitLogModeStore } from './storage/gitLogModeStore';
import { GitLogService } from './git/gitLogService';
import {
  IMPORT_BOOK_COMMAND_ID,
  RELOCATE_BOOK_COMMAND_ID,
  REMOVE_BOOK_COMMAND_ID,
  registerLibraryCommands
} from './commands/libraryCommands';
import { registerMoyuplusImagePreviewService } from './reader/imagePreviewService';
import { SettingsAuthority, SETTINGS_CONFIGURATION_KEYS } from './settings/settingsAuthority';
import { MoyuPlusSettingsPanel, OPEN_SETTINGS_COMMAND_ID } from './settings/MoyuPlusSettingsPanel';
import { createVSCodeSettingsConfigurationBridge } from './settings/vscodeSettingsConfiguration';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
  registerLegacyTypingCommandAliases,
  registerTypingView
} from './typing/registration';
import {
  dismissLegacyResumeHint,
  migrateLegacyTypingSession,
  readLegacyResumeHint
} from './typing/migration';
import {
  ActivePracticeStateStore,
  TypingViewApplicationQuery
} from './typing/adapters/view';
import {
  ContentCatalogStore,
  DailyProjectionStore,
  HistoryProjectionStore,
  MasteryProjectionStore,
  PracticeContinuationStore,
  PracticePreferencesStore,
  PracticeTransactionJournalStore,
  ProjectedResultCommitter,
  ResultStore,
  SessionLeaseStore,
  WorkspacePracticeSessionLease,
  WorkspaceSessionStore as TypingWorkspaceSessionStore
} from './typing/adapters/storage';
import { PracticeWebviewPanel } from './typing/adapters/panel';
import {
  AdHocContentProvider,
  CustomMaterialProvider,
  EpubMaterialImporter,
  TxtMaterialImporter
} from './typing/adapters/sources';
import {
  ReaderBookSourceProvider,
  ReaderTypingEntryPoint
} from './typing/adapters/reader';
import {
  PracticeApplicationCoordinator,
  PracticeInputTransactionCoordinator,
  MaterialRemovalCoordinator,
  type PracticeOutcome,
  type PracticePanelPort,
  type PracticeSessionState,
  type PracticeSnapshot,
  PracticeSessionRecovery,
  PracticeSessionRuntime,
  PracticeSetupDraft,
  PracticeTransactionEngine,
  TypingViewMaterialCommands,
  TypingViewPracticeCommands,
  buildPracticeResult,
  buildPracticeSnapshot,
  createDefaultPracticePlan
} from './typing';

export const SMOKE_COMMAND_ID = 'moyuplus.smokeTest';
export const SMOKE_MESSAGE = 'MoyuPlus extension is active.';
export { READER_VIEW_ID };
export { IMPORT_BOOK_COMMAND_ID, REMOVE_BOOK_COMMAND_ID, RELOCATE_BOOK_COMMAND_ID };
export { ROUTE_ENTER_COMMAND_ID };
export {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
};

export function registerSmokeCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(SMOKE_COMMAND_ID, async () => {
    await vscode.window.showInformationMessage(SMOKE_MESSAGE);
    return SMOKE_MESSAGE;
  });

  context.subscriptions.push(disposable);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = createMoyuplusOutputChannel();
  if (output) context.subscriptions.push(output);
  try {
    await migrateV1ToV2(context.globalState, context.workspaceState);
  } catch (error) {
    console.error('MoyuPlus Reader v2 migration failed; activation will continue.', error instanceof Error ? error.message : 'Unknown error');
  }
  try {
    await migrateLegacyTypingSession(
      context.globalState,
      context.workspaceState
    );
  } catch (error) {
    console.error(
      'MoyuPlus legacy typing migration failed; the old session was preserved.',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  const books = new BookLibraryStore(context.globalState);
  const progress = new ReadingProgressStore(context.globalState);
  const preferences = new ReaderPreferencesStore(context.globalState);
  const immersivePreferences = new ImmersiveReaderPreferencesStore(context.globalState);
  const gitLogPreferences = new GitLogPreferencesStore(context.globalState);
  const gitLogMode = new GitLogModeStore(context.workspaceState);
  const gitLogService = new GitLogService();
  const txtAdapter = new TxtAdapter();
  const adapters = new AdapterRegistry([txtAdapter, new EpubAdapter()]);
  const typingStorageDirectory = context.globalStorageUri?.fsPath
    ?? context.extensionUri?.fsPath
    ?? '.';
  const typingContentCatalog = new ContentCatalogStore(typingStorageDirectory, {
    ownerId: `extension-host-${process.pid}`
  });
  const typingSetupDraft = new PracticeSetupDraft();
  const typingPracticePreferences = new PracticePreferencesStore(typingStorageDirectory);
  const typingContinuations = new PracticeContinuationStore(
    typingStorageDirectory
  );
  const typingResults = new ResultStore(typingStorageDirectory);
  const typingHistory = new HistoryProjectionStore(
    typingStorageDirectory,
    typingResults
  );
  const typingDaily = new DailyProjectionStore(
    typingStorageDirectory,
    typingResults
  );
  const typingMastery = new MasteryProjectionStore(
    typingStorageDirectory,
    typingResults
  );
  const typingResultCommitter = new ProjectedResultCommitter(
    typingResults,
    [typingHistory, typingDaily, typingMastery]
  );
  const typingContentProviders = [
    new CustomMaterialProvider(typingContentCatalog),
    new ReaderBookSourceProvider(books, adapters),
    new AdHocContentProvider()
  ];
  const typingRuntimeState = new ActivePracticeStateStore();
  const typingWorkspaceDirectory = context.storageUri?.fsPath
    ?? path.join(typingStorageDirectory, 'workspace-default');
  const typingWorkspaceStore =
    new TypingWorkspaceSessionStore(typingWorkspaceDirectory);
  const typingTransactionJournal =
    new PracticeTransactionJournalStore(typingWorkspaceDirectory);
  const typingSessionLeaseStore = new SessionLeaseStore(
    typingWorkspaceDirectory,
    {
      ownerId: `extension-host-${process.pid}-${randomUUID()}`,
      ownerIsAlive: isExtensionHostOwnerAlive
    }
  );
  const typingSessionLease = new WorkspacePracticeSessionLease(
    typingSessionLeaseStore,
    typingWorkspaceStore,
    {
      onHeartbeatError: error => {
        output?.appendLine(
          `[typing.lease] heartbeat failed: ${safeError(error)}`
        );
      }
    }
  );
  let typingPracticePanel: PracticeWebviewPanel;
  let typingViewProvider: ReturnType<typeof registerTypingView> | undefined;
  const typingMaterialRemovals = new MaterialRemovalCoordinator({
    catalog: typingContentCatalog,
    activeMaterialIds: async () => {
      const session = await typingRuntimeState.currentSession();
      if (!session) return new Set<string>();
      const snapshot = await typingRuntimeState.snapshots.get(session.snapshotId);
      return snapshot?.materialId
        ? new Set([snapshot.materialId])
        : new Set<string>();
    },
    onChanged: () => typingViewProvider?.refreshCurrent(),
    onPurged: records => Promise.all(records.map(record =>
      typingContinuations.clearSource({
        kind: 'custom',
        materialId: record.id
      })
    )).then(() => undefined),
    onError: error => {
      output?.appendLine(
        `[typing.materials] removal cleanup failed: ${safeError(error)}`
      );
    }
  });
  context.subscriptions.push(typingMaterialRemovals);
  const typingPanelPort: PracticePanelPort = {
    open: async (
      snapshot: PracticeSnapshot,
      session: PracticeSessionState
    ) => {
      await typingWorkspaceStore.saveSnapshot(session.id, snapshot);
      await typingWorkspaceStore.saveCheckpoint({
        schemaVersion: 1,
        session,
        acceptedTextByLine: [],
        savedAt: Date.now()
      });
      await typingWorkspaceStore.saveActiveSession(session.id);
      await typingContinuations.update(snapshot, session);
      typingPracticePanel.open(session.id);
    },
    render: async (session: PracticeSessionState) => {
      await typingWorkspaceStore.saveCheckpoint({
        schemaVersion: 1,
        session,
        acceptedTextByLine: [],
        savedAt: Date.now()
      });
      const snapshot = await typingRuntimeState.snapshots.get(
        session.snapshotId
      );
      if (snapshot) await typingContinuations.update(snapshot, session);
      await typingTransactionJournal.compact(session.id, session.revision);
      void typingPracticePanel.refresh(session.id).catch(error => {
        output?.appendLine(`[typing.panel] refresh failed: ${safeError(error)}`);
      });
    },
    complete: async (session: PracticeSessionState) => {
      await typingWorkspaceStore.saveCheckpoint({
        schemaVersion: 1,
        session,
        acceptedTextByLine: [],
        savedAt: Date.now()
      });
      const snapshot = await typingRuntimeState.snapshots.get(
        session.snapshotId
      );
      if (snapshot) await typingContinuations.update(snapshot, session);
      await typingTransactionJournal.compact(session.id, session.revision);
      await typingWorkspaceStore.clearActiveSession(session.id);
      void typingPracticePanel.refresh(session.id).catch(error => {
        output?.appendLine(`[typing.panel] refresh failed: ${safeError(error)}`);
      });
    }
  };
  const typingApplication = new PracticeApplicationCoordinator({
    clock: {
      wallNow: Date.now,
      monotonicNow: () => performance.now()
    },
    ids: {
      next: kind => `${kind}-${randomUUID()}`
    },
    content: {
      prepare: async (recipe, range) => {
        const provider = typingContentProviders.find(
          candidate => candidate.canResolve(recipe)
        );
        if (!provider) {
          throw new Error(
            `No practice content provider can prepare recipe: ${recipe.kind}`
          );
        }
        return provider.prepare(recipe, range);
      }
    },
    snapshotBuilder: {
      build: buildPracticeSnapshot
    },
    snapshots: typingRuntimeState.snapshots,
    sessions: typingRuntimeState.sessions,
    runtime: new PracticeSessionRuntime(),
    results: typingResultCommitter,
    lease: typingSessionLease,
    panel: typingPanelPort,
    events: {
      publish: () => undefined
    }
  });
  const typingTransactionEngine = new PracticeTransactionEngine();
  const commitTypingResult = async (
    session: PracticeSessionState,
    snapshot: PracticeSnapshot,
    outcome: PracticeOutcome = 'completed'
  ): Promise<void> => {
    const endedAt = session.endedAt ?? session.updatedAt;
    const startedAt = session.startedAt ?? endedAt;
    const result = buildPracticeResult({
      id: `result-${session.id}`,
      session,
      snapshot,
      outcome,
      wallTime: endedAt,
      monotonicTime: (session.startedAtMonotonic ?? 0)
        + Math.max(0, endedAt - startedAt)
    });
    await typingResultCommitter.commit(result);
  };
  const syncTypingResult = async (): Promise<void> => {
    await typingViewProvider?.syncPage('result');
  };
  const finishTimedPractice = async (sessionId: string): Promise<void> => {
    const session = await typingRuntimeState.sessions.get(sessionId);
    if (
      !session
      || (session.status !== 'running' && session.status !== 'blockedOnError')
    ) {
      return;
    }
    await typingApplication.finish({
      type: 'finish',
      sessionId,
      outcome: 'timedOut'
    });
    await syncTypingResult();
  };
  const typingInputTransactions = new PracticeInputTransactionCoordinator({
    authority: {
      get: sessionId => typingRuntimeState.sessions.get(sessionId),
      replace: session => typingRuntimeState.sessions.save(session)
    },
    snapshots: typingRuntimeState.snapshots,
    journal: typingTransactionJournal,
    engine: typingTransactionEngine,
    clock: {
      wallNow: Date.now,
      monotonicNow: () => performance.now()
    },
    nextAttemptId: () => `inputAttempt-${randomUUID()}`,
    timeout: finishTimedPractice,
    complete: async (session, snapshot) => {
      await typingPanelPort.complete(session);
      await commitTypingResult(session, snapshot);
      await typingSessionLease.release(session.id);
      await syncTypingResult();
    }
  });
  typingPracticePanel = new PracticeWebviewPanel({
    extensionUri: context.extensionUri ?? vscode.Uri.file('.'),
    coordinator: typingInputTransactions,
    pause: async sessionId => {
      const session = await typingRuntimeState.sessions.get(sessionId);
      if (
        session
        && (session.status === 'running' || session.status === 'blockedOnError')
      ) {
        await typingApplication.pause({
          type: 'pause',
          sessionId
        });
      }
    },
    resume: async sessionId => {
      const session = await typingRuntimeState.sessions.get(sessionId);
      if (session?.status === 'paused') {
        await typingApplication.resume({
          type: 'resume',
          sessionId
        });
      }
    },
    timeout: finishTimedPractice,
    reportError: error => {
      output?.appendLine(`[typing.panel] ${safeError(error)}`);
      void vscode.window.showErrorMessage(
        error instanceof Error ? error.message : '打字练习面板发生错误。'
      );
    }
  });
  context.subscriptions.push(
    typingPracticePanel,
    {
      dispose: () => {
        void typingSessionLease.dispose().catch(error => {
          output?.appendLine(
            `[typing.lease] release failed: ${safeError(error)}`
          );
        });
      }
    }
  );
  const typingPracticeCommands = new TypingViewPracticeCommands({
    draft: typingSetupDraft,
    coordinator: typingApplication,
    preferences: typingPracticePreferences,
    continuations: typingContinuations,
    active: {
      current: () => typingRuntimeState.current(),
      focus: async () => {
        const session = await typingRuntimeState.currentSession();
        if (session) typingPracticePanel.open(session.id);
      }
    }
  });
  const typingSessionRecovery = new PracticeSessionRecovery({
    source: {
      candidate: () => typingSessionLease.recoveryCandidate(),
      acquire: sessionId => typingSessionLease.claimRecovery(sessionId),
      release: sessionId => typingSessionLease.release(sessionId)
    },
    snapshots: typingRuntimeState.snapshots,
    sessions: typingRuntimeState.sessions,
    panel: {
      restore: async sessionId => {
        const checkpoint = await typingWorkspaceStore.getCheckpoint(sessionId);
        if (!checkpoint) {
          throw new Error(`Practice checkpoint not found: ${sessionId}`);
        }
        const session = structuredClone(checkpoint.session);
        const deltas = await typingTransactionJournal.recover(
          sessionId,
          session.revision
        );
        for (const delta of deltas) {
          typingTransactionEngine.applyDelta(session, delta);
        }
        return session;
      },
      render: async session => {
        typingPracticePanel.open(session.id);
      }
    },
    complete: async (session, snapshot) => {
      await commitTypingResult(session, snapshot);
      await typingContinuations.update(snapshot, session);
      await typingWorkspaceStore.clearActiveSession(session.id);
    },
    clock: {
      monotonicNow: () => performance.now()
    }
  });
  const typingViewQuery = new TypingViewApplicationQuery({
    catalog: typingContentCatalog,
    results: typingResults,
    history: typingHistory,
    daily: typingDaily,
    mastery: typingMastery,
    setupDraft: typingSetupDraft,
    inspectContent: async recipe => {
      const provider = typingContentProviders.find(candidate => candidate.canResolve(recipe));
      if (!provider) {
        throw new Error(`No practice content provider can inspect recipe: ${recipe.kind}`);
      }
      return provider.inspect(recipe);
    },
    practicePreferences: async () => (
      await typingPracticePreferences.load()
    ).preferences,
    continuations: typingContinuations,
    activeSessionStatus: async () => (
      await typingRuntimeState.current()
    )?.status ?? null,
    recoverablePractice: () => typingSessionRecovery.snapshot(),
    pendingMaterialRemovals: () => typingMaterialRemovals.snapshot(),
    legacyResumeHint: () => {
      const hint = readLegacyResumeHint(context.workspaceState);
      return hint
        ? {
          sourceTitle: hint.source.title,
          sourceAvailable: hint.source.available,
          physicalLineNumber: hint.physicalLineIndex + 1,
          whitespace: structuredClone(hint.whitespace)
        }
        : undefined;
    },
    sessionConflict: () => typingPracticeCommands.conflictSnapshot(),
    activePractice: async () => {
      const session = await typingRuntimeState.currentSession();
      if (!session) return undefined;
      const snapshot = await typingRuntimeState.snapshots.get(session.snapshotId);
      return snapshot
        ? {
          session,
          snapshot,
          monotonicNow: performance.now()
        }
        : undefined;
    }
  });
  const typingMaterialCommands = new TypingViewMaterialCommands({
    draft: typingSetupDraft,
    txtImporter: new TxtMaterialImporter(typingContentCatalog, {
      createId: randomUUID
    }),
    epubImporter: new EpubMaterialImporter(typingContentCatalog, {
      createId: randomUUID
    }),
    selectTxtFile: async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'TXT files': ['txt'] },
        openLabel: '导入 TXT 素材'
      });
      const uri = selected?.[0];
      if (!uri) return undefined;
      return {
        bytes: new Uint8Array(await vscode.workspace.fs.readFile(uri)),
        title: path.basename(uri.fsPath, path.extname(uri.fsPath)),
        sourceUri: uri.toString()
      };
    },
    selectEpubFile: async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'EPUB files': ['epub'] },
        openLabel: '导入 EPUB 素材'
      });
      const uri = selected?.[0];
      return uri ? { sourceUri: uri.toString() } : undefined;
    },
    selectEpubChapters: async chapters => {
      const selected = await vscode.window.showQuickPick(
        chapters.map((chapter, index) => ({
          label: chapter.title,
          description: `第 ${index + 1} 章 · ${chapter.graphemes.toLocaleString()} 个可练习字符`,
          chapterId: chapter.id,
          picked: false
        })),
        {
          canPickMany: true,
          placeHolder: '选择要导入的文本章节（合计不超过 200,000 个字符）',
          title: '选择练习章节'
        }
      );
      return selected?.map(item => item.chapterId);
    },
    selectTxtEncoding: async () => {
      const selected = await vscode.window.showQuickPick([
        {
          label: 'GBK / GB18030',
          description: '使用中文 Windows 常见编码重试',
          encoding: 'gbk' as const
        }
      ], {
        placeHolder: 'UTF-8 解码失败，请选择其他编码'
      });
      return selected?.encoding;
    },
    reportError: async error => {
      await vscode.window.showErrorMessage(error.message);
    },
    removals: typingMaterialRemovals
  });
  let resumeLegacyPractice = async (): Promise<boolean> => false;
  let dismissLegacyPractice = async (): Promise<void> => undefined;
  const typingViewCommands = {
    selectMaterial: typingMaterialCommands.selectMaterial.bind(typingMaterialCommands),
    removeMaterial: typingMaterialCommands.removeMaterial.bind(typingMaterialCommands),
    undoRemoveMaterial:
      typingMaterialCommands.undoRemoveMaterial.bind(typingMaterialCommands),
    usePastedText: typingMaterialCommands.usePastedText.bind(typingMaterialCommands),
    importTxt: typingMaterialCommands.importTxt.bind(typingMaterialCommands),
    importEpub: typingMaterialCommands.importEpub.bind(typingMaterialCommands),
    configureSetup: typingMaterialCommands.configureSetup.bind(typingMaterialCommands),
    saveSetupAsDefault: async (
      configuration: Parameters<
        TypingViewPracticeCommands['saveSetupAsDefault']
      >[0]
    ) => {
      await typingPracticeCommands.saveSetupAsDefault(configuration);
      await vscode.window.showInformationMessage('已保存为新的打字练习默认设置。');
    },
    openPracticeEditorSettings: async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:local.moyuplus moyuplus.typing'
      );
    },
    startPractice: typingPracticeCommands.startPractice.bind(typingPracticeCommands),
    resolveSessionConflict:
      typingPracticeCommands.resolveSessionConflict.bind(typingPracticeCommands),
    controlPractice:
      typingPracticeCommands.controlPractice.bind(typingPracticeCommands),
    recoverPractice: () => typingSessionRecovery.recover(),
    dismissRecovery: () => typingSessionRecovery.dismiss(),
    resumeLegacyPractice: () => resumeLegacyPractice(),
    dismissLegacyResumeHint: () => dismissLegacyPractice(),
    clearPracticeHistory: async () => {
      const confirmation = await vscode.window.showWarningMessage(
        '确定清理全部打字练习记录吗？历史成绩、每日统计和错题强化数据都会被移除，且无法恢复。',
        { modal: true },
        '清理全部记录'
      );
      if (confirmation !== '清理全部记录') return false;
      await typingResults.clearAll();
      await Promise.all([
        typingHistory.rebuild(),
        typingDaily.rebuild(),
        typingMastery.rebuild()
      ]);
      await vscode.window.showInformationMessage('已清理全部打字练习记录。');
      return true;
    }
  };
  const imagePreview = registerMoyuplusImagePreviewService(context);
  const library = new LibraryService(books, progress, adapters, {
    reportInspectError: (format, error) => output?.appendLine(
      `[library.inspect] adapter=${format} error=${safeError(error)}`
    )
  });
  const typingEntryPoint = new ReaderTypingEntryPoint(
    typingSetupDraft,
    {
      openSetup: async () => {
        if (!typingViewProvider) {
          throw new Error('Typing View is not registered.');
        }
        await typingViewProvider.openPage('setup');
      }
    },
    {
      isAvailable: async bookId => (
        await library.scanAvailability()
      )[bookId] === true,
      reportUnavailable: async () => {
        await vscode.window.showErrorMessage(
          '书架源文件已移动或删除，请先重新定位后再开始练习。'
        );
      },
      requestRelocation: async bookId => {
        await vscode.commands.executeCommand(
          RELOCATE_BOOK_COMMAND_ID,
          bookId
        );
      }
    }
  );
  resumeLegacyPractice = async (): Promise<boolean> => {
    const hint = readLegacyResumeHint(context.workspaceState);
    const bookId = hint?.source.bookId;
    if (!hint || !hint.source.available || !bookId) return false;
    if ((await library.scanAvailability())[bookId] !== true) {
      await vscode.window.showErrorMessage(
        '旧练习来源已移动或删除，请先在书架重新定位。'
      );
      await vscode.commands.executeCommand(
        RELOCATE_BOOK_COMMAND_ID,
        bookId
      );
      return false;
    }
    const recipe = { kind: 'readerBook' as const, bookId };
    const provider = typingContentProviders.find(
      candidate => candidate.canResolve(recipe)
    );
    if (!provider) return false;
    const descriptor = await provider.inspect(recipe);
    const selectedRange = descriptor.ranges[0];
    if (!selectedRange) return false;
    const basePlan = createDefaultPracticePlan({
      contentRecipe: recipe,
      contentProfile: descriptor.contentProfile
    });
    const whitespaceMode = hint.whitespace.ignoreAllSpaces
      ? 'ignore' as const
      : hint.whitespace.trimLeadingSpaces
        && hint.whitespace.trimTrailingSpaces
        ? 'trimLineEdges' as const
        : 'strict' as const;
    const migratedPlan = {
      ...basePlan,
      textPolicy: {
        ...basePlan.textPolicy,
        whitespace: { mode: whitespaceMode }
      }
    };
    const {
      contentRecipe: _contentRecipe,
      ...planWithoutRecipe
    } = migratedPlan;
    typingSetupDraft.selectContent(recipe, selectedRange);
    typingSetupDraft.configure({
      selectedRange,
      plan: planWithoutRecipe
    });
    await dismissLegacyResumeHint(context.workspaceState);
    return true;
  };
  dismissLegacyPractice = () => dismissLegacyResumeHint(
    context.workspaceState
  );
  let readerViewProvider: ReturnType<typeof registerReaderView> | undefined;
  const immersivePresenter = new ImmersiveDecorationPresenter(immersivePreferences.get());
  const readerController = new ReaderSessionCoordinator(books, progress, adapters, async (message) => {
    await readerViewProvider?.postMessage(message);
  }, immersivePresenter, {
    openImagePreview: payload => imagePreview.open(payload),
    showInformation: async message => { await vscode.window.showInformationMessage(message); },
    setImmersiveContext: active => vscode.commands.executeCommand('setContext', 'moyuplus.immersiveReadingActive', active),
    preflight: async book => {
      try { await vscode.workspace.fs.stat(vscode.Uri.parse(book.uri)); return true; }
      catch { return false; }
    }
  });
  const settingsAuthority = new SettingsAuthority({
    readerStore: preferences,
    immersiveStore: immersivePreferences,
    gitLogStore: gitLogPreferences,
    configuration: createVSCodeSettingsConfigurationBridge(),
    onReaderSaved: value => readerViewProvider?.applyReaderPreferences(value),
    onImmersiveSaved: value => immersivePresenter.applyPreferences(value),
    onGitLogSaved: (value, previous) => readerViewProvider?.applyGitLogPreferences(value, previous)
  });
  const settingsPanel = new MoyuPlusSettingsPanel(context.extensionUri ?? vscode.Uri.file('.'), settingsAuthority);

  registerSmokeCommand(context);
  registerLibraryCommands(context, library);
  context.subscriptions.push(
    settingsPanel,
    vscode.commands.registerCommand(OPEN_SETTINGS_COMMAND_ID, () => {
      readerController.suspendImmersive();
      settingsPanel.open(readerController.presentationMode === 'immersive' ? 'immersive' : 'reader');
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (SETTINGS_CONFIGURATION_KEYS.some(key => event.affectsConfiguration(key))) settingsPanel.refresh();
    })
  );
  readerViewProvider = registerReaderView(context, readerController, {
    snapshot: async () => ({
      books: books.list(),
      availability: await library.scanAvailability(),
      progress: Object.fromEntries(progress.list().map(position => [position.bookId, position.bookProgression])),
      preferences: preferences.get()
    }),
    importBook: () => vscode.commands.executeCommand(IMPORT_BOOK_COMMAND_ID),
    removeBook: (bookId) => library.removeBook(bookId),
    relocateBook: (bookId) => vscode.commands.executeCommand(RELOCATE_BOOK_COMMAND_ID, bookId),
    startTypingPractice: async bookId => {
      const visible = readerViewProvider?.captureVisibleReaderPosition();
      const persisted = progress.get(bookId);
      const locator = visible?.bookId === bookId
        ? visible.locator
        : persisted?.locator;
      await typingEntryPoint.openFromBook(bookId, locator);
    },
    savePreferences: (value) => preferences.save(value as never),
    openSettings: section => {
      readerController.suspendImmersive();
      settingsPanel.open(section);
    }
  }, {
    modeStore: gitLogMode,
    preferencesStore: gitLogPreferences,
    service: gitLogService,
    readerPreferences: () => preferences.get(),
    workspaceRoots: () => (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath),
    activeFilePath: () => {
      const document = vscode.window.activeTextEditor?.document as vscode.TextDocument & { uri?: vscode.Uri } | undefined;
      const uri = document?.uri;
      return uri?.scheme === 'file' && vscode.workspace.getWorkspaceFolder(uri) ? uri.fsPath : undefined;
    },
    saveResumeTarget: async target => { await progress.save({ ...target, updatedAt: Date.now() }); }
  });
  try {
    await typingMaterialRemovals.initialize();
  } catch (error) {
    output?.appendLine(
      `[typing.materials] startup cleanup failed: ${safeError(error)}`
    );
  }
  typingViewProvider = registerTypingView(
    context,
    context.extensionUri ?? vscode.Uri.file('.'),
    typingViewQuery,
    typingViewCommands
  );
  registerLegacyTypingCommandAliases(context, {
    openPage: page => typingViewProvider!.openPage(page),
    controlPractice: action => typingPracticeCommands.controlPractice(action),
    hasActivePractice: async () => (
      await typingRuntimeState.current()
    ) !== undefined
  });
  registerShortcutRouter(context, readerViewProvider);
}

export function deactivate(): void {}

interface MoyuplusOutputChannel extends vscode.Disposable {
  appendLine(value: string): void;
}

function createMoyuplusOutputChannel(): MoyuplusOutputChannel | undefined {
  const windowWithOutput = vscode.window as typeof vscode.window & {
    createOutputChannel?: (name: string) => MoyuplusOutputChannel;
  };
  return windowWithOutput.createOutputChannel?.('MoyuPlus');
}

function safeError(error: unknown): string {
  const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return value.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function isExtensionHostOwnerAlive(ownerId: string): boolean {
  const match = /^extension-host-(\d+)-/.exec(ownerId);
  if (!match) return true;
  const ownerPid = Number(match[1]);
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) return true;
  try {
    process.kill(ownerPid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error
      && 'code' in error
      && error.code === 'ESRCH'
    );
  }
}
