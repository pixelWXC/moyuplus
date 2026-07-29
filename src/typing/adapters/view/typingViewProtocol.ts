export const TYPING_VIEW_ID = 'moyuplus.typingView';
export const TYPING_VIEW_PROTOCOL_VERSION = 13 as const;

export const TYPING_VIEW_PAGES = [
  'materials',
  'recent',
  'setup',
  'live',
  'result',
  'history',
  'mastery'
] as const;

export type TypingViewPage = typeof TYPING_VIEW_PAGES[number];

export interface TypingViewLegacyResumeHint {
  sourceTitle: string;
  sourceAvailable: boolean;
  physicalLineNumber: number;
  whitespace: {
    skipEmptyLines: boolean;
    trimLeadingSpaces: boolean;
    trimTrailingSpaces: boolean;
    ignoreAllSpaces: boolean;
  };
}
export type TypingViewSessionStatus =
  | 'ready'
  | 'running'
  | 'blockedOnError'
  | 'paused'
  | 'completed'
  | 'abandoned';

export type TypingViewMaterialOrigin =
  | 'custom'
  | 'txtImport'
  | 'epubImport'
  | 'readerBook'
  | 'generated'
  | 'mastery'
  | 'adHoc';

export interface TypingViewMaterialCounts {
  graphemes: number;
  hanGraphemes: number;
  englishWords: number;
  printableUnits: number;
}

export interface TypingViewMaterialSummary {
  id: string;
  revision: string;
  title: string;
  origin: TypingViewMaterialOrigin;
  profileKey: string;
  tags: readonly string[];
  counts: TypingViewMaterialCounts;
  estimatedSeconds: number;
  sourceNotice?: {
    license: string;
    attribution: string;
  };
}

export interface TypingViewPendingMaterialRemoval {
  materialId: string;
  title: string;
  deleteAfter: number;
  waitingForPractice: boolean;
}

export type TypingViewSourceRange =
  | { kind: 'whole' }
  | { kind: 'article'; articleId?: string }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'selection'; start: number; end: number };

export type TypingViewStartPosition =
  | { kind: 'beginning' }
  | { kind: 'continuation' }
  | { kind: 'percentage'; percent: number };

export type TypingViewCompletionConstraint =
  | { kind: 'timed'; seconds: number }
  | { kind: 'length'; targetUnits: number }
  | { kind: 'sourceRange'; range: 'article' | 'chapter' | 'selection' }
  | { kind: 'free' };

export interface TypingViewSetupPlan {
  completion: TypingViewCompletionConstraint;
  evaluation: {
    errorPolicy: 'allowSkip' | 'block';
  };
  textPolicy: {
    punctuation: {
      mode: 'strict' | 'equivalent';
      mappingVersion: string;
    };
    whitespace: {
      mode: 'strict' | 'collapse' | 'trimLineEdges' | 'ignore';
    };
    caseSensitive: boolean;
  };
  flowPolicy: {
    lineAdvance: 'automatic' | 'enter';
    presentation: 'continuous' | 'lineFocus';
  };
  displayPolicy: {
    showLiveMetrics: boolean;
    showWhitespace: boolean;
  };
}

export interface TypingViewSetupContent {
  kind: 'setup';
  source: {
    title: string;
    profileKey: string;
    counts: TypingViewMaterialCounts;
  };
  ranges: readonly {
    label: string;
    range: TypingViewSourceRange;
  }[];
  selectedRange: TypingViewSourceRange;
  startPosition?: TypingViewStartPosition;
  continuations?: readonly {
    range: TypingViewSourceRange;
    sourceRevision: string;
    targetIndex: number;
    totalUnits: number;
    updatedAt: number;
  }[];
  plan: TypingViewSetupPlan;
}

export interface TypingViewSessionConflictContent {
  kind: 'sessionConflict';
  page: 'setup';
  sessionId: string;
  status: Extract<
    TypingViewSessionStatus,
    'ready' | 'running' | 'blockedOnError' | 'paused'
  >;
}

export interface TypingViewLiveContent {
  kind: 'live';
  status: Extract<
    TypingViewSessionStatus,
    'ready' | 'running' | 'blockedOnError' | 'paused'
  >;
  progress: {
    completedUnits: number;
    totalUnits: number;
  } | null;
  metrics: {
    activeElapsedMs: number;
    totalAttempts: number;
    correctAttempts: number;
    errorAttempts: number;
    accuracy: number;
    rawCpm: number;
    effectiveCpm: number;
  } | null;
  controls: {
    pause: boolean;
    resume: boolean;
    restart: boolean;
    finish: boolean;
  };
}

export interface TypingViewRecoverySnapshot {
  status: Extract<
    TypingViewSessionStatus,
    'ready' | 'running' | 'blockedOnError' | 'paused'
  >;
  savedAt: number;
  completedUnits: number;
  totalUnits: number;
}

export interface TypingViewResultContent {
  kind: 'result';
  result: {
    id: string;
    outcome: 'completed' | 'timedOut' | 'abandoned' | 'restarted';
    endedAt: number;
    activeElapsedMs: number;
    metrics: {
      totalAttempts: number;
      correctAttempts: number;
      errorAttempts: number;
      completedUnits: number;
      accuracy: number;
      rawCpm: number;
      effectiveCpm: number;
      longestCorrectStreak: number;
      correctionCount: number;
    };
    speedBuckets: readonly {
      activeElapsedMs: number;
      rawCpm: number;
      effectiveCpm: number;
      accuracy: number;
    }[];
    errorPairs: readonly {
      expected: string;
      actual: string;
      count: number;
    }[];
    errorWords: readonly {
      word: string;
      count: number;
    }[];
  } | null;
  benchmarkBest: {
    effectiveCpm: number;
    accuracy: number;
    isCurrentResult: boolean;
  } | null;
}

export interface TypingViewRecentContent {
  kind: 'recent';
  items: readonly {
    resultId: string;
    materialId?: string;
    sourceRevision: string;
    profileKey: string;
    outcome: 'completed' | 'timedOut' | 'abandoned' | 'restarted';
    endedAt: number;
    activeElapsedMs: number;
    accuracy: number;
    effectiveCpm: number;
  }[];
}

export interface TypingViewHistoryContent {
  kind: 'history';
  page: number;
  pageSize: number;
  totalItems: number;
  items: readonly {
    resultId: string;
    outcome: 'completed' | 'timedOut';
    endedAt: number;
    benchmarkKey: string;
    metrics: {
      totalAttempts: number;
      correctAttempts: number;
      errorAttempts: number;
      accuracy: number;
      rawCpm: number;
      effectiveCpm: number;
    };
  }[];
  days: readonly {
    date: string;
    activeElapsedMs: number;
    correctAttempts: number;
    errorAttempts: number;
    resultCount: number;
  }[];
}

export interface TypingViewMasteryContent {
  kind: 'mastery';
  totalEntries: number;
  entries: readonly {
    key: string;
    kind: 'grapheme' | 'word' | 'codeToken';
    wrongCount: number;
    reinforcementCorrectStreak: number;
    lastErrorAt: number;
    score: number;
  }[];
}

export type TypingViewPageContent =
  | {
    kind: 'materials';
    library: readonly TypingViewMaterialSummary[];
    pendingRemovals?: readonly TypingViewPendingMaterialRemoval[];
    actions: {
      paste: boolean;
      importTxt: boolean;
      importEpub: boolean;
    };
  }
  | TypingViewSetupContent
  | TypingViewSessionConflictContent
  | TypingViewLiveContent
  | TypingViewRecentContent
  | TypingViewResultContent
  | TypingViewHistoryContent
  | TypingViewMasteryContent
  | {
    kind: 'unavailable';
    page: Exclude<TypingViewPage, 'materials'>;
  };

export interface TypingViewShellSnapshot {
  activePage: TypingViewPage;
  availablePages: readonly TypingViewPage[];
  activeSessionStatus: TypingViewSessionStatus | null;
  pendingResultCount: number;
  recovery: TypingViewRecoverySnapshot | null;
  legacyResumeHint?: TypingViewLegacyResumeHint;
  content: TypingViewPageContent;
}

interface TypingViewEnvelope {
  protocolVersion: typeof TYPING_VIEW_PROTOCOL_VERSION;
  instanceId: string;
}

interface TypingViewRequestEnvelope extends TypingViewEnvelope {
  requestId: string;
  clientRevision: number;
}

export type TypingViewToHostMessage =
  | (TypingViewEnvelope & { type: 'typingReady' })
  | (TypingViewEnvelope & { type: 'retrySnapshot' })
  | (TypingViewRequestEnvelope & {
    type: 'navigate';
    page: TypingViewPage;
  })
  | (TypingViewRequestEnvelope & {
    type: 'selectMaterial';
    materialId: string;
    materialOrigin: TypingViewMaterialOrigin;
  })
  | (TypingViewRequestEnvelope & {
    type: 'removeMaterial';
    materialId: string;
  })
  | (TypingViewRequestEnvelope & {
    type: 'undoRemoveMaterial';
    materialId: string;
  })
  | (TypingViewRequestEnvelope & {
    type: 'usePastedText';
    text: string;
  })
  | (TypingViewRequestEnvelope & {
    type: 'importMaterial';
    format: 'txt' | 'epub';
  })
  | (TypingViewRequestEnvelope & {
    type: 'configureSetup';
    selectedRange: TypingViewSourceRange;
    startPosition?: TypingViewStartPosition;
    plan: TypingViewSetupPlan;
  })
  | (TypingViewRequestEnvelope & {
    type: 'saveSetupAsDefault';
    selectedRange: TypingViewSourceRange;
    startPosition?: TypingViewStartPosition;
    plan: TypingViewSetupPlan;
  })
  | (TypingViewRequestEnvelope & {
    type: 'openPracticeEditorSettings';
  })
  | (TypingViewRequestEnvelope & {
    type: 'startPractice';
    selectedRange: TypingViewSourceRange;
    startPosition?: TypingViewStartPosition;
    plan: TypingViewSetupPlan;
  })
  | (TypingViewRequestEnvelope & {
    type: 'resolveSessionConflict';
    resolution: 'returnCurrent' | 'finishAndStart' | 'cancel';
  })
  | (TypingViewRequestEnvelope & {
    type: 'controlPractice';
    action: 'pause' | 'resume' | 'restart' | 'finish';
  })
  | (TypingViewRequestEnvelope & {
    type: 'recoverPractice';
  })
  | (TypingViewRequestEnvelope & {
    type: 'dismissRecovery';
  })
  | (TypingViewRequestEnvelope & {
    type: 'resumeLegacyPractice';
  })
  | (TypingViewRequestEnvelope & {
    type: 'dismissLegacyResumeHint';
  })
  | (TypingViewRequestEnvelope & {
    type: 'clearPracticeHistory';
  });

export type HostToTypingViewMessage = TypingViewEnvelope & {
  type: 'shellSnapshot';
  snapshotRevision: number;
  snapshot: TypingViewShellSnapshot;
};

export function isTypingViewToHostMessage(value: unknown): value is TypingViewToHostMessage {
  if (!isRecord(value)
    || value.protocolVersion !== TYPING_VIEW_PROTOCOL_VERSION
    || !isInstanceId(value.instanceId)) {
    return false;
  }
  if (value.type === 'typingReady' || value.type === 'retrySnapshot') {
    return hasOnlyKeys(value, ['type', 'protocolVersion', 'instanceId']);
  }
  const requestKeys = [
    'type',
    'protocolVersion',
    'instanceId',
    'requestId',
    'clientRevision'
  ];
  if (
    !isNonEmptyString(value.requestId)
    || !isPositiveSafeInteger(value.clientRevision)
  ) {
    return false;
  }
  if (value.type === 'navigate') {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'page'
    ]) && isTypingViewPage(value.page);
  }
  if (value.type === 'selectMaterial') {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'materialId',
      'materialOrigin'
    ])
      && isSafeMaterialId(value.materialId)
      && isTypingViewMaterialOrigin(value.materialOrigin);
  }
  if (
    value.type === 'removeMaterial'
    || value.type === 'undoRemoveMaterial'
  ) {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'materialId'
    ]) && isSafeMaterialId(value.materialId);
  }
  if (value.type === 'usePastedText') {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'text'
    ]) && isNonEmptyString(value.text);
  }
  if (value.type === 'importMaterial') {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'format'
    ])
    && (value.format === 'txt' || value.format === 'epub');
  }
  if (
    value.type === 'configureSetup'
    || value.type === 'saveSetupAsDefault'
    || value.type === 'startPractice'
  ) {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'selectedRange',
      'plan',
      ...(value.startPosition === undefined ? [] : ['startPosition'])
    ])
    && isTypingViewSourceRange(value.selectedRange)
    && (
      value.startPosition === undefined
      || isTypingViewStartPosition(value.startPosition)
    )
    && isTypingViewSetupPlan(value.plan);
  }
  if (value.type === 'resolveSessionConflict') {
    return hasOnlyKeys(value, [
      ...requestKeys,
      'resolution'
    ])
    && (
      value.resolution === 'returnCurrent'
      || value.resolution === 'finishAndStart'
      || value.resolution === 'cancel'
    );
  }
  if (
    value.type === 'recoverPractice'
    || value.type === 'dismissRecovery'
    || value.type === 'resumeLegacyPractice'
    || value.type === 'dismissLegacyResumeHint'
    || value.type === 'openPracticeEditorSettings'
    || value.type === 'clearPracticeHistory'
  ) {
    return hasOnlyKeys(value, requestKeys);
  }
  return value.type === 'controlPractice'
    && hasOnlyKeys(value, [
      ...requestKeys,
      'action'
    ])
    && (
      value.action === 'pause'
      || value.action === 'resume'
      || value.action === 'restart'
      || value.action === 'finish'
    );
}

export function isHostToTypingViewMessage(value: unknown): value is HostToTypingViewMessage {
  if (!isRecord(value)
    || value.protocolVersion !== TYPING_VIEW_PROTOCOL_VERSION
    || !isInstanceId(value.instanceId)
    || value.type !== 'shellSnapshot'
    || !isPositiveSafeInteger(value.snapshotRevision)
    || !hasOnlyKeys(value, [
      'type',
      'protocolVersion',
      'instanceId',
      'snapshotRevision',
      'snapshot'
    ])
    || !isRecord(value.snapshot)
    || !hasOnlyKeys(
      value.snapshot,
      value.snapshot.legacyResumeHint === undefined
        ? [
          'activePage',
          'availablePages',
          'activeSessionStatus',
          'pendingResultCount',
          'recovery',
          'content'
        ]
        : [
          'activePage',
          'availablePages',
          'activeSessionStatus',
          'pendingResultCount',
          'recovery',
          'legacyResumeHint',
          'content'
        ]
    )) {
    return false;
  }
  return isTypingViewPage(value.snapshot.activePage)
    && Array.isArray(value.snapshot.availablePages)
    && value.snapshot.availablePages.every(isTypingViewPage)
    && isTypingViewSessionStatusOrNull(value.snapshot.activeSessionStatus)
    && isNonNegativeSafeInteger(value.snapshot.pendingResultCount)
    && (
      value.snapshot.recovery === null
      || isTypingViewRecoverySnapshot(value.snapshot.recovery)
    )
    && (
      value.snapshot.legacyResumeHint === undefined
      || isTypingViewLegacyResumeHint(value.snapshot.legacyResumeHint)
    )
    && isTypingViewPageContent(value.snapshot.content, value.snapshot.activePage);
}

function isTypingViewLegacyResumeHint(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'sourceTitle',
      'sourceAvailable',
      'physicalLineNumber',
      'whitespace'
    ])
    && isNonEmptyString(value.sourceTitle)
    && typeof value.sourceAvailable === 'boolean'
    && isPositiveSafeInteger(value.physicalLineNumber)
    && isRecord(value.whitespace)
    && hasOnlyKeys(value.whitespace, [
      'skipEmptyLines',
      'trimLeadingSpaces',
      'trimTrailingSpaces',
      'ignoreAllSpaces'
    ])
    && typeof value.whitespace.skipEmptyLines === 'boolean'
    && typeof value.whitespace.trimLeadingSpaces === 'boolean'
    && typeof value.whitespace.trimTrailingSpaces === 'boolean'
    && typeof value.whitespace.ignoreAllSpaces === 'boolean';
}

function isTypingViewRecoverySnapshot(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'status',
      'savedAt',
      'completedUnits',
      'totalUnits'
    ])
    && (
      value.status === 'ready'
      || value.status === 'running'
      || value.status === 'blockedOnError'
      || value.status === 'paused'
    )
    && isNonNegativeFinite(value.savedAt)
    && isNonNegativeSafeInteger(value.completedUnits)
    && isNonNegativeSafeInteger(value.totalUnits)
    && value.completedUnits <= value.totalUnits;
}

function isTypingViewPageContent(
  value: unknown,
  activePage: TypingViewPage
): value is TypingViewPageContent {
  if (!isRecord(value)) return false;
  if (value.kind === 'recent') {
    return activePage === 'recent'
      && hasOnlyKeys(value, ['kind', 'items'])
      && Array.isArray(value.items)
      && value.items.length <= 20
      && value.items.every(isTypingViewRecentItem);
  }
  if (value.kind === 'live') {
    return activePage === 'live'
      && hasOnlyKeys(value, [
        'kind',
        'status',
        'progress',
        'metrics',
        'controls'
      ])
      && (
        value.status === 'ready'
        || value.status === 'running'
        || value.status === 'blockedOnError'
        || value.status === 'paused'
      )
      && (
        (
          isRecord(value.progress)
          && hasOnlyKeys(value.progress, ['completedUnits', 'totalUnits'])
          && isNonNegativeSafeInteger(value.progress.completedUnits)
          && isNonNegativeSafeInteger(value.progress.totalUnits)
          && value.progress.completedUnits <= value.progress.totalUnits
          && isLiveMetrics(value.metrics)
        )
        || (value.progress === null && value.metrics === null)
      )
      && isRecord(value.controls)
      && hasOnlyKeys(value.controls, ['pause', 'resume', 'restart', 'finish'])
      && typeof value.controls.pause === 'boolean'
      && typeof value.controls.resume === 'boolean'
      && typeof value.controls.restart === 'boolean'
      && typeof value.controls.finish === 'boolean';
  }
  if (value.kind === 'sessionConflict') {
    return activePage === 'setup'
      && hasOnlyKeys(value, [
        'kind',
        'page',
        'sessionId',
        'status'
      ])
      && value.page === 'setup'
      && isSafeMaterialId(value.sessionId)
      && (
        value.status === 'ready'
        || value.status === 'running'
        || value.status === 'blockedOnError'
        || value.status === 'paused'
      );
  }
  if (value.kind === 'result') {
    return activePage === 'result'
      && hasOnlyKeys(value, ['kind', 'result', 'benchmarkBest'])
      && (value.result === null || isTypingViewResult(value.result))
      && (
        value.benchmarkBest === null
        || (
          isRecord(value.benchmarkBest)
          && hasOnlyKeys(value.benchmarkBest, [
            'effectiveCpm',
            'accuracy',
            'isCurrentResult'
          ])
          && isNonNegativeFinite(value.benchmarkBest.effectiveCpm)
          && isFiniteBetween(value.benchmarkBest.accuracy, 0, 100)
          && typeof value.benchmarkBest.isCurrentResult === 'boolean'
        )
      );
  }
  if (value.kind === 'history') {
    return activePage === 'history'
      && hasOnlyKeys(value, [
        'kind',
        'page',
        'pageSize',
        'totalItems',
        'items',
        'days'
      ])
      && isPositiveSafeInteger(value.page)
      && value.pageSize === 50
      && isNonNegativeSafeInteger(value.totalItems)
      && Array.isArray(value.items)
      && value.items.length <= value.pageSize
      && value.items.every(isTypingViewHistoryItem)
      && Array.isArray(value.days)
      && value.days.every(isTypingViewHistoryDay);
  }
  if (value.kind === 'mastery') {
    return activePage === 'mastery'
      && hasOnlyKeys(value, ['kind', 'totalEntries', 'entries'])
      && isNonNegativeSafeInteger(value.totalEntries)
      && Array.isArray(value.entries)
      && value.entries.length <= value.totalEntries
      && value.entries.every(isTypingViewMasteryEntry);
  }
  if (value.kind === 'unavailable') {
    return activePage !== 'materials'
      && hasOnlyKeys(value, ['kind', 'page'])
      && value.page === activePage;
  }
  if (activePage === 'materials') {
    return value.kind === 'materials'
    && hasOnlyKeys(
      value,
      value.pendingRemovals === undefined
        ? ['kind', 'library', 'actions']
        : ['kind', 'library', 'pendingRemovals', 'actions']
    )
    && Array.isArray(value.library)
    && value.library.every(isTypingViewMaterialSummary)
    && (
      value.pendingRemovals === undefined
      || (
        Array.isArray(value.pendingRemovals)
        && value.pendingRemovals.every(isTypingViewPendingMaterialRemoval)
      )
    )
    && isRecord(value.actions)
    && hasOnlyKeys(value.actions, ['paste', 'importTxt', 'importEpub'])
    && typeof value.actions.paste === 'boolean'
    && typeof value.actions.importTxt === 'boolean'
    && typeof value.actions.importEpub === 'boolean';
  }
  if (activePage !== 'setup' || value.kind !== 'setup') return false;
  const selectedRange = value.selectedRange;
  if (
    !hasOnlyKeys(value, [
      'kind',
      'source',
      'ranges',
      'selectedRange',
      'plan',
      ...(value.startPosition === undefined ? [] : ['startPosition']),
      ...(value.continuations === undefined ? [] : ['continuations'])
    ])
    || !isRecord(value.source)
    || !hasOnlyKeys(value.source, ['title', 'profileKey', 'counts'])
    || !isNonEmptyString(value.source.title)
    || !isNonEmptyString(value.source.profileKey)
    || !isTypingViewMaterialCounts(value.source.counts)
    || !Array.isArray(value.ranges)
    || value.ranges.length === 0
    || !value.ranges.every(isTypingViewSetupRange)
    || !isTypingViewSourceRange(selectedRange)
    || (
      value.startPosition !== undefined
      && !isTypingViewStartPosition(value.startPosition)
    )
    || (
      value.continuations !== undefined
      && (
        !Array.isArray(value.continuations)
        || !value.continuations.every(isTypingViewContinuation)
      )
    )
    || !isTypingViewSetupPlan(value.plan)
  ) {
    return false;
  }
  return value.ranges.some(item => (
    isRecord(item) && sameRange(item.range, selectedRange)
  ));
}

function isTypingViewContinuation(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'range',
      'sourceRevision',
      'targetIndex',
      'totalUnits',
      'updatedAt'
    ])
    && isTypingViewSourceRange(value.range)
    && isNonEmptyString(value.sourceRevision)
    && isPositiveSafeInteger(value.targetIndex)
    && isPositiveSafeInteger(value.totalUnits)
    && value.targetIndex < value.totalUnits
    && isNonNegativeFinite(value.updatedAt);
}

function isTypingViewStartPosition(
  value: unknown
): value is TypingViewStartPosition {
  if (!isRecord(value)) return false;
  if (value.kind === 'beginning' || value.kind === 'continuation') {
    return hasOnlyKeys(value, ['kind']);
  }
  return value.kind === 'percentage'
    && hasOnlyKeys(value, ['kind', 'percent'])
    && typeof value.percent === 'number'
    && Number.isSafeInteger(value.percent)
    && value.percent >= 0
    && value.percent <= 99;
}

function isTypingViewPendingMaterialRemoval(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'materialId',
      'title',
      'deleteAfter',
      'waitingForPractice'
    ])
    && isSafeMaterialId(value.materialId)
    && isNonEmptyString(value.title)
    && isNonNegativeFinite(value.deleteAfter)
    && typeof value.waitingForPractice === 'boolean';
}

function isTypingViewRecentItem(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = [
    'resultId',
    'sourceRevision',
    'profileKey',
    'outcome',
    'endedAt',
    'activeElapsedMs',
    'accuracy',
    'effectiveCpm'
  ];
  return hasOnlyKeys(
    value,
    value.materialId === undefined ? keys : [...keys, 'materialId']
  )
    && isSafeOpaqueId(value.resultId)
    && (value.materialId === undefined || isSafeOpaqueId(value.materialId))
    && isNonEmptyString(value.sourceRevision)
    && isNonEmptyString(value.profileKey)
    && (
      value.outcome === 'completed'
      || value.outcome === 'timedOut'
      || value.outcome === 'abandoned'
      || value.outcome === 'restarted'
    )
    && isNonNegativeFinite(value.endedAt)
    && isNonNegativeFinite(value.activeElapsedMs)
    && isFiniteBetween(value.accuracy, 0, 100)
    && isNonNegativeFinite(value.effectiveCpm);
}

function isTypingViewSetupRange(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['label', 'range'])
    && isNonEmptyString(value.label)
    && isTypingViewSourceRange(value.range);
}

function isTypingViewSourceRange(value: unknown): value is TypingViewSourceRange {
  if (!isRecord(value)) return false;
  if (value.kind === 'whole') return hasOnlyKeys(value, ['kind']);
  if (value.kind === 'article') {
    return hasOnlyKeys(
      value,
      value.articleId === undefined ? ['kind'] : ['kind', 'articleId']
    ) && (value.articleId === undefined || isSafeOpaqueId(value.articleId));
  }
  if (value.kind === 'chapter') {
    return hasOnlyKeys(value, ['kind', 'chapterId'])
      && isSafeOpaqueId(value.chapterId);
  }
  return value.kind === 'selection'
    && hasOnlyKeys(value, ['kind', 'start', 'end'])
    && isNonNegativeSafeInteger(value.start)
    && isPositiveSafeInteger(value.end)
    && value.end > value.start;
}

function isTypingViewSetupPlan(value: unknown): value is TypingViewSetupPlan {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'completion',
      'evaluation',
      'textPolicy',
      'flowPolicy',
      'displayPolicy'
    ])
    && isTypingViewCompletion(value.completion)
    && isRecord(value.evaluation)
    && hasOnlyKeys(value.evaluation, ['errorPolicy'])
    && (value.evaluation.errorPolicy === 'allowSkip' || value.evaluation.errorPolicy === 'block')
    && isTypingViewTextPolicy(value.textPolicy)
    && isRecord(value.flowPolicy)
    && hasOnlyKeys(value.flowPolicy, ['lineAdvance', 'presentation'])
    && (value.flowPolicy.lineAdvance === 'automatic' || value.flowPolicy.lineAdvance === 'enter')
    && (value.flowPolicy.presentation === 'continuous' || value.flowPolicy.presentation === 'lineFocus')
    && isRecord(value.displayPolicy)
    && hasOnlyKeys(value.displayPolicy, ['showLiveMetrics', 'showWhitespace'])
    && typeof value.displayPolicy.showLiveMetrics === 'boolean'
    && typeof value.displayPolicy.showWhitespace === 'boolean';
}

function isTypingViewCompletion(value: unknown): value is TypingViewCompletionConstraint {
  if (!isRecord(value)) return false;
  if (value.kind === 'free') return hasOnlyKeys(value, ['kind']);
  if (value.kind === 'timed') {
    return hasOnlyKeys(value, ['kind', 'seconds'])
      && isPositiveSafeInteger(value.seconds);
  }
  if (value.kind === 'length') {
    return hasOnlyKeys(value, ['kind', 'targetUnits'])
      && isPositiveSafeInteger(value.targetUnits);
  }
  return value.kind === 'sourceRange'
    && hasOnlyKeys(value, ['kind', 'range'])
    && (
      value.range === 'article'
      || value.range === 'chapter'
      || value.range === 'selection'
    );
}

function isTypingViewTextPolicy(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['punctuation', 'whitespace', 'caseSensitive'])
    && isRecord(value.punctuation)
    && hasOnlyKeys(value.punctuation, ['mode', 'mappingVersion'])
    && (value.punctuation.mode === 'strict' || value.punctuation.mode === 'equivalent')
    && isNonEmptyString(value.punctuation.mappingVersion)
    && isRecord(value.whitespace)
    && hasOnlyKeys(value.whitespace, ['mode'])
    && (
      value.whitespace.mode === 'strict'
      || value.whitespace.mode === 'collapse'
      || value.whitespace.mode === 'trimLineEdges'
      || value.whitespace.mode === 'ignore'
    )
    && typeof value.caseSensitive === 'boolean';
}

function sameRange(left: unknown, right: TypingViewSourceRange): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTypingViewMaterialSummary(value: unknown): value is TypingViewMaterialSummary {
  if (!isRecord(value)) return false;
  const requiredKeys = [
    'id',
    'revision',
    'title',
    'origin',
    'profileKey',
    'tags',
    'counts',
    'estimatedSeconds'
  ];
  const allowedKeys = value.sourceNotice === undefined
    ? requiredKeys
    : [...requiredKeys, 'sourceNotice'];
  return hasOnlyKeys(value, allowedKeys)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.revision)
    && isNonEmptyString(value.title)
    && isTypingViewMaterialOrigin(value.origin)
    && isNonEmptyString(value.profileKey)
    && Array.isArray(value.tags)
    && value.tags.every(tag => typeof tag === 'string')
    && isTypingViewMaterialCounts(value.counts)
    && isPositiveSafeInteger(value.estimatedSeconds)
    && (
      value.sourceNotice === undefined
      || (
        isRecord(value.sourceNotice)
        && hasOnlyKeys(value.sourceNotice, ['license', 'attribution'])
        && isNonEmptyString(value.sourceNotice.license)
        && isNonEmptyString(value.sourceNotice.attribution)
      )
    );
}

function isTypingViewMaterialCounts(value: unknown): value is TypingViewMaterialCounts {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'graphemes',
      'hanGraphemes',
      'englishWords',
      'printableUnits'
    ])
    && isNonNegativeSafeInteger(value.graphemes)
    && isNonNegativeSafeInteger(value.hanGraphemes)
    && isNonNegativeSafeInteger(value.englishWords)
    && isNonNegativeSafeInteger(value.printableUnits);
}

function isLiveMetrics(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'activeElapsedMs',
    'totalAttempts',
    'correctAttempts',
    'errorAttempts',
    'accuracy',
    'rawCpm',
    'effectiveCpm'
  ])) return false;
  return isNonNegativeFinite(value.activeElapsedMs)
    && isNonNegativeSafeInteger(value.totalAttempts)
    && isNonNegativeSafeInteger(value.correctAttempts)
    && isNonNegativeSafeInteger(value.errorAttempts)
    && value.correctAttempts + value.errorAttempts === value.totalAttempts
    && isFiniteBetween(value.accuracy, 0, 100)
    && isNonNegativeFinite(value.rawCpm)
    && isNonNegativeFinite(value.effectiveCpm);
}

function isTypingViewResult(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'id',
      'outcome',
      'endedAt',
      'activeElapsedMs',
      'metrics',
      'speedBuckets',
      'errorPairs',
      'errorWords'
    ])
    && isSafeMaterialId(value.id)
    && isPracticeOutcome(value.outcome)
    && isNonNegativeFinite(value.endedAt)
    && isNonNegativeFinite(value.activeElapsedMs)
    && isTypingViewResultMetrics(value.metrics)
    && Array.isArray(value.speedBuckets)
    && value.speedBuckets.every(isTypingViewSpeedBucket)
    && Array.isArray(value.errorPairs)
    && value.errorPairs.every(isTypingViewErrorPair)
    && Array.isArray(value.errorWords)
    && value.errorWords.every(isTypingViewErrorWord);
}

function isTypingViewResultMetrics(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'totalAttempts',
    'correctAttempts',
    'errorAttempts',
    'completedUnits',
    'accuracy',
    'rawCpm',
    'effectiveCpm',
    'longestCorrectStreak',
    'correctionCount'
  ])) return false;
  return isNonNegativeSafeInteger(value.totalAttempts)
    && isNonNegativeSafeInteger(value.correctAttempts)
    && isNonNegativeSafeInteger(value.errorAttempts)
    && value.correctAttempts + value.errorAttempts === value.totalAttempts
    && isNonNegativeSafeInteger(value.completedUnits)
    && isFiniteBetween(value.accuracy, 0, 100)
    && isNonNegativeFinite(value.rawCpm)
    && isNonNegativeFinite(value.effectiveCpm)
    && isNonNegativeSafeInteger(value.longestCorrectStreak)
    && isNonNegativeSafeInteger(value.correctionCount);
}

function isTypingViewSpeedBucket(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'activeElapsedMs',
      'rawCpm',
      'effectiveCpm',
      'accuracy'
    ])
    && isNonNegativeFinite(value.activeElapsedMs)
    && isNonNegativeFinite(value.rawCpm)
    && isNonNegativeFinite(value.effectiveCpm)
    && isFiniteBetween(value.accuracy, 0, 100);
}

function isTypingViewErrorPair(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['expected', 'actual', 'count'])
    && typeof value.expected === 'string'
    && typeof value.actual === 'string'
    && isPositiveSafeInteger(value.count);
}

function isTypingViewErrorWord(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['word', 'count'])
    && isNonEmptyString(value.word)
    && isPositiveSafeInteger(value.count);
}

function isTypingViewHistoryItem(value: unknown): boolean {
  if (!isRecord(value)
    || !hasOnlyKeys(value, [
      'resultId',
      'outcome',
      'endedAt',
      'benchmarkKey',
      'metrics'
    ])
    || !isSafeMaterialId(value.resultId)
    || (value.outcome !== 'completed' && value.outcome !== 'timedOut')
    || !isNonNegativeFinite(value.endedAt)
    || !isNonEmptyString(value.benchmarkKey)
    || !isRecord(value.metrics)
    || !hasOnlyKeys(value.metrics, [
      'totalAttempts',
      'correctAttempts',
      'errorAttempts',
      'accuracy',
      'rawCpm',
      'effectiveCpm'
    ])) return false;
  return isNonNegativeSafeInteger(value.metrics.totalAttempts)
    && isNonNegativeSafeInteger(value.metrics.correctAttempts)
    && isNonNegativeSafeInteger(value.metrics.errorAttempts)
    && value.metrics.correctAttempts + value.metrics.errorAttempts
      === value.metrics.totalAttempts
    && isFiniteBetween(value.metrics.accuracy, 0, 100)
    && isNonNegativeFinite(value.metrics.rawCpm)
    && isNonNegativeFinite(value.metrics.effectiveCpm);
}

function isTypingViewHistoryDay(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'date',
      'activeElapsedMs',
      'correctAttempts',
      'errorAttempts',
      'resultCount'
    ])
    && typeof value.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    && isNonNegativeFinite(value.activeElapsedMs)
    && isNonNegativeSafeInteger(value.correctAttempts)
    && isNonNegativeSafeInteger(value.errorAttempts)
    && isNonNegativeSafeInteger(value.resultCount);
}

function isTypingViewMasteryEntry(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'key',
      'kind',
      'wrongCount',
      'reinforcementCorrectStreak',
      'lastErrorAt',
      'score'
    ])
    && isNonEmptyString(value.key)
    && (
      value.kind === 'grapheme'
      || value.kind === 'word'
      || value.kind === 'codeToken'
    )
    && isNonNegativeSafeInteger(value.wrongCount)
    && isNonNegativeSafeInteger(value.reinforcementCorrectStreak)
    && isNonNegativeFinite(value.lastErrorAt)
    && isNonNegativeFinite(value.score);
}

function isPracticeOutcome(value: unknown): boolean {
  return value === 'completed'
    || value === 'timedOut'
    || value === 'abandoned'
    || value === 'restarted';
}

function isTypingViewMaterialOrigin(value: unknown): value is TypingViewMaterialOrigin {
  return value === 'custom'
    || value === 'txtImport'
    || value === 'epubImport'
    || value === 'readerBook'
    || value === 'generated'
    || value === 'mastery'
    || value === 'adHoc';
}

function isTypingViewPage(value: unknown): value is TypingViewPage {
  return typeof value === 'string'
    && (TYPING_VIEW_PAGES as readonly string[]).includes(value);
}

function isInstanceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeMaterialId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function isSafeOpaqueId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && !value.includes('..')
    && !/[\/\\\u0000-\u001f\u007f]/.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFiniteBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= min
    && value <= max;
}

function isTypingViewSessionStatusOrNull(
  value: unknown
): value is TypingViewSessionStatus | null {
  return value === null
    || value === 'ready'
    || value === 'running'
    || value === 'blockedOnError'
    || value === 'paused'
    || value === 'completed'
    || value === 'abandoned';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}
