import {
  createDefaultPracticePlan,
  type ContentDescriptor,
  type ContentProfile,
  type ContentRecipe,
  type PracticePlan,
  type PracticeMaterialRecord,
  type SourceRange
} from '../../domain/content';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  type PracticePreferences
} from '../../domain/policies';
import type { PracticeSetupDraftSnapshot } from '../../application';
import type { PracticeSnapshot } from '../../domain/content';
import type { PracticeSessionState } from '../../domain/session';
import type {
  PracticeMetrics,
  PracticeOutcome,
  PracticeResult
} from '../../domain/analytics';
import type { MasteryEntry } from '../../domain/mastery';
import {
  TYPING_VIEW_PAGES,
  TYPING_VIEW_PRIMARY_PAGES,
  type TypingViewHistoryContent,
  type TypingViewLegacyResumeHint,
  type TypingViewMaterialSummary,
  type TypingViewLiveContent,
  type TypingViewMasteryContent,
  type TypingViewPage,
  type TypingViewPageContent,
  type TypingViewRecentContent,
  type TypingViewResultContent,
  type TypingViewRecoverySnapshot,
  type TypingViewSessionConflictContent,
  type TypingViewSessionStatus,
  type TypingViewSetupContent,
  type TypingViewShellSnapshot
} from './typingViewProtocol';

export interface TypingViewMaterialCatalogPort {
  list(): PromiseLike<readonly PracticeMaterialRecord[]>;
}

export interface TypingViewResultFactsPort {
  list(): PromiseLike<readonly PracticeResult[]>;
}

export interface TypingViewHistoryProjectionPort {
  read(): PromiseLike<{
    items: readonly {
      resultId: string;
      outcome: PracticeOutcome;
      endedAt: number;
      benchmarkKey: string;
      metrics: PracticeMetrics;
    }[];
    bestByBenchmark: readonly {
      benchmarkKey: string;
      resultId: string;
      effectiveCpm: number;
      accuracy: number;
    }[];
  }>;
}

export interface TypingViewDailyProjectionPort {
  read(): PromiseLike<{
    days: readonly {
      date: string;
      activeElapsedMs: number;
      correctAttempts: number;
      errorAttempts: number;
      resultIds: readonly string[];
    }[];
  }>;
}

export interface TypingViewMasteryProjectionPort {
  read(): PromiseLike<{
    entries: readonly MasteryEntry[];
  }>;
}

export interface TypingViewApplicationQueryOptions {
  catalog: TypingViewMaterialCatalogPort;
  results?: TypingViewResultFactsPort;
  history?: TypingViewHistoryProjectionPort;
  daily?: TypingViewDailyProjectionPort;
  mastery?: TypingViewMasteryProjectionPort;
  activeSessionStatus?: () => PromiseLike<TypingViewSessionStatus | null>;
  pendingResultCount?: () => PromiseLike<number>;
  setupDraft?: {
    snapshot(): PracticeSetupDraftSnapshot | undefined;
  };
  inspectContent?: (recipe: ContentRecipe) => PromiseLike<ContentDescriptor>;
  practicePreferences?: () => PromiseLike<PracticePreferences>;
  continuations?: {
    get(
      recipe: ContentRecipe,
      range: SourceRange
    ): PromiseLike<{
      sourceRevision: string;
      targetIndex: number;
      totalUnits: number;
      updatedAt: number;
    } | undefined>;
  };
  sessionConflict?: () => {
    sessionId: string;
    status: TypingViewSessionConflictContent['status'];
  } | undefined;
  activePractice?: () => PromiseLike<{
    session: PracticeSessionState;
    snapshot: PracticeSnapshot;
    monotonicNow: number;
  } | undefined>;
  recoverablePractice?: () => PromiseLike<
    TypingViewRecoverySnapshot | undefined
  >;
  pendingMaterialRemovals?: () => PromiseLike<readonly {
    materialId: string;
    title: string;
    deleteAfter: number;
    waitingForPractice: boolean;
  }[]>;
  legacyResumeHint?: () =>
    | TypingViewLegacyResumeHint
    | undefined
    | PromiseLike<TypingViewLegacyResumeHint | undefined>;
}

export class TypingViewApplicationQuery {
  constructor(private readonly options: TypingViewApplicationQueryOptions) {}

  async shellSnapshot(page: TypingViewPage): Promise<TypingViewShellSnapshot> {
    const [
      activeSessionStatus,
      pendingResultCount,
      recovery,
      legacyResumeHint
    ] = await Promise.all([
      this.options.activeSessionStatus?.() ?? null,
      this.options.pendingResultCount?.() ?? 0,
      this.options.recoverablePractice?.() ?? undefined,
      this.options.legacyResumeHint?.() ?? undefined
    ]);
    const legacyResumeField = legacyResumeHint
      ? { legacyResumeHint: structuredClone(legacyResumeHint) }
      : {};
    if (page === 'setup') {
      const conflict = this.options.sessionConflict?.();
      if (conflict) {
        return {
          activePage: page,
          availablePages: [...TYPING_VIEW_PAGES],
          activeSessionStatus,
          pendingResultCount,
          recovery: recovery ? structuredClone(recovery) : null,
          ...legacyResumeField,
          content: {
            kind: 'sessionConflict',
            page: 'setup',
            ...structuredClone(conflict)
          }
        };
      }
      let content: TypingViewSetupContent | undefined;
      try {
        content = await this.setupContent();
      } catch {
        content = undefined;
      }
      if (!content) {
        return {
          activePage: 'materials',
          availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
          activeSessionStatus,
          pendingResultCount,
          recovery: recovery ? structuredClone(recovery) : null,
          ...legacyResumeField,
          content: await this.materialsContent(
            '请先选择有效的练习素材，再设置本次练习。'
          )
        };
      }
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content
      };
    }
    if (page === 'live') {
      const active = await this.options.activePractice?.();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content: active
          ? projectLiveContent(active)
          : {
            kind: 'unavailable',
            page
          }
      };
    }
    if (page === 'result') {
      const content = await this.resultContent();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content: content ?? {
          kind: 'unavailable',
          page
        }
      };
    }
    if (page === 'recent') {
      const content = await this.recentContent();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content: content ?? {
          kind: 'unavailable',
          page
        }
      };
    }
    if (page === 'history') {
      const content = await this.historyContent();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content: content ?? {
          kind: 'unavailable',
          page
        }
      };
    }
    if (page === 'mastery') {
      const content = await this.masteryContent();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content: content ?? {
          kind: 'unavailable',
          page
        }
      };
    }
    if (page !== 'materials') {
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus,
        pendingResultCount,
        recovery: recovery ? structuredClone(recovery) : null,
        ...legacyResumeField,
        content: {
          kind: 'unavailable',
          page
        }
      };
    }

    return {
      activePage: page,
      availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
      activeSessionStatus,
      pendingResultCount,
      recovery: recovery ? structuredClone(recovery) : null,
      ...legacyResumeField,
      content: await this.materialsContent()
    };
  }

  private async materialsContent(
    notice?: string
  ): Promise<Extract<TypingViewPageContent, { kind: 'materials' }>> {
    const [records, pendingRemovals] = await Promise.all([
      this.options.catalog.list(),
      this.options.pendingMaterialRemovals?.() ?? []
    ]);
    return {
      kind: 'materials',
      library: [...records]
        .sort((left, right) => (
          right.updatedAt - left.updatedAt || left.title.localeCompare(right.title)
        ))
        .map(projectCatalogMaterial),
      pendingRemovals: pendingRemovals.map(item => structuredClone(item)),
      ...(notice ? { notice } : {}),
      actions: {
        paste: true,
        importTxt: true,
        importEpub: true
      }
    };
  }

  private async resultContent(): Promise<TypingViewResultContent | undefined> {
    if (!this.options.results) return undefined;
    const results = [...await this.options.results.list()]
      .sort((left, right) => (
        right.endedAt - left.endedAt || left.id.localeCompare(right.id)
      ));
    const latest = results[0];
    if (!latest) {
      return {
        kind: 'result',
        result: null,
        benchmarkBest: null
      };
    }
    const history = await this.options.history?.read();
    const best = history?.bestByBenchmark.find(
      item => item.benchmarkKey === latest.benchmarkKey
    );
    return {
      kind: 'result',
      result: {
        id: latest.id,
        outcome: latest.outcome,
        endedAt: latest.endedAt,
        activeElapsedMs: latest.activeElapsedMs,
        metrics: {
          totalAttempts: latest.metrics.totalAttempts,
          correctAttempts: latest.metrics.correctAttempts,
          errorAttempts: latest.metrics.errorAttempts,
          completedUnits: latest.metrics.completedUnits,
          accuracy: latest.metrics.accuracy,
          rawCpm: latest.metrics.rawCpm,
          effectiveCpm: latest.metrics.effectiveCpm,
          longestCorrectStreak: latest.metrics.longestCorrectStreak,
          correctionCount: correctionCount(latest.metrics)
        },
        speedBuckets: latest.speedBuckets.map(bucket => ({
          activeElapsedMs: bucket.activeElapsedMs,
          rawCpm: bucket.rawCpm,
          effectiveCpm: bucket.effectiveCpm,
          accuracy: bucket.accuracy
        })),
        errorPairs: latest.errorPairs.map(item => structuredClone(item)),
        errorWords: latest.errorWords.map(item => structuredClone(item))
      },
      benchmarkBest: best
        ? {
          effectiveCpm: best.effectiveCpm,
          accuracy: best.accuracy,
          isCurrentResult: best.resultId === latest.id
        }
        : null
    };
  }

  private async recentContent(): Promise<TypingViewRecentContent | undefined> {
    if (!this.options.results) return undefined;
    return {
      kind: 'recent',
      items: [...await this.options.results.list()]
        .sort((left, right) => (
          right.endedAt - left.endedAt || left.id.localeCompare(right.id)
        ))
        .slice(0, 20)
        .map(result => ({
          resultId: result.id,
          ...(result.materialId ? { materialId: result.materialId } : {}),
          sourceRevision: result.sourceRevision,
          profileKey: profileKey(result.contentProfile),
          outcome: result.outcome,
          endedAt: result.endedAt,
          activeElapsedMs: result.activeElapsedMs,
          accuracy: result.metrics.accuracy,
          effectiveCpm: result.metrics.effectiveCpm
        }))
    };
  }

  private async historyContent(): Promise<TypingViewHistoryContent | undefined> {
    if (!this.options.history || !this.options.daily) return undefined;
    const [history, daily] = await Promise.all([
      this.options.history.read(),
      this.options.daily.read()
    ]);
    const items = [...history.items]
      .filter((item): item is typeof item & {
        outcome: 'completed' | 'timedOut';
      } => item.outcome === 'completed' || item.outcome === 'timedOut')
      .sort((left, right) => (
        right.endedAt - left.endedAt
          || left.resultId.localeCompare(right.resultId)
      ))
      .slice(0, 50)
      .map(item => ({
        resultId: item.resultId,
        outcome: item.outcome,
        endedAt: item.endedAt,
        benchmarkKey: item.benchmarkKey,
        metrics: {
          totalAttempts: item.metrics.totalAttempts,
          correctAttempts: item.metrics.correctAttempts,
          errorAttempts: item.metrics.errorAttempts,
          accuracy: item.metrics.accuracy,
          rawCpm: item.metrics.rawCpm,
          effectiveCpm: item.metrics.effectiveCpm
        }
      }));
    return {
      kind: 'history',
      page: 1,
      pageSize: 50,
      totalItems: history.items.length,
      items,
      days: [...daily.days]
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 14)
        .map(day => ({
          date: day.date,
          activeElapsedMs: day.activeElapsedMs,
          correctAttempts: day.correctAttempts,
          errorAttempts: day.errorAttempts,
          resultCount: day.resultIds.length
        }))
    };
  }

  private async masteryContent(): Promise<TypingViewMasteryContent | undefined> {
    if (!this.options.mastery) return undefined;
    const [projection, results] = await Promise.all([
      this.options.mastery.read(),
      this.options.results?.list() ?? []
    ]);
    const entries = [...projection.entries]
      .filter((entry): entry is MasteryEntry & {
        kind: 'word' | 'codeToken';
      } => entry.kind === 'word' || entry.kind === 'codeToken')
      .sort((left, right) => (
        left.lastPracticedAt - right.lastPracticedAt
          || right.score - left.score
          || left.key.localeCompare(right.key)
      ));
    const batchKind = entries[0]?.kind;
    const batchSize = batchKind
      ? Math.min(20, entries.filter(entry => entry.kind === batchKind).length)
      : 0;
    const orderedEntries = batchKind
      ? [
        ...entries.filter(entry => entry.kind === batchKind),
        ...entries.filter(entry => entry.kind !== batchKind)
      ]
      : entries;
    const latestResult = [...results]
      .reverse()
      .find(result => result.contentProfile.kind === 'mastery');
    const latestBatch = latestResult
      ? {
        endedAt: latestResult.endedAt,
        stableCount: latestResult.masteryObservations.filter(observation => (
          observation.wrongCount === 0
          && observation.reinforcementCorrectCount > 0
        )).length,
        retryCount: latestResult.masteryObservations.filter(
          observation => observation.wrongCount > 0
        ).length
      }
      : null;
    return {
      kind: 'mastery',
      hasPracticeHistory: results.length > 0,
      totalEntries: entries.length,
      batchSize,
      remainingAfterBatch: entries.length - batchSize,
      latestBatch,
      entries: orderedEntries
        .slice(0, 100)
        .map(entry => ({
          key: entry.key,
          kind: entry.kind,
          wrongCount: entry.wrongCount,
          lastErrorAt: entry.lastErrorAt
        }))
    };
  }

  private async setupContent(): Promise<TypingViewSetupContent | undefined> {
    const draft = this.options.setupDraft?.snapshot();
    if (!draft || !this.options.inspectContent) return undefined;
    const descriptor = await this.options.inspectContent(draft.contentRecipe);
    if (descriptor.ranges.length === 0) return undefined;
    const draftRange = draft.selectedRange;
    const selectedRange = draftRange
      && descriptor.ranges.some(range => sameRange(range, draftRange))
      ? draftRange
      : descriptor.ranges[0]!;
    const defaultPlan = createDefaultPracticePlan({
      contentRecipe: draft.contentRecipe,
      contentProfile: descriptor.contentProfile,
      completion: completionForRange(selectedRange)
    });
    const preferences = await this.options.practicePreferences?.();
    const continuations = (
      await Promise.all(descriptor.ranges.map(async range => {
        const continuation = await this.options.continuations?.get(
          draft.contentRecipe,
          range
        );
        const revisionMatchesDescriptor = draft.contentRecipe.kind === 'readerBook'
          || continuation?.sourceRevision === descriptor.sourceRevision;
        return continuation && revisionMatchesDescriptor
          ? {
            range: structuredClone(range),
            sourceRevision: continuation.sourceRevision,
            targetIndex: continuation.targetIndex,
            totalUnits: continuation.totalUnits,
            updatedAt: continuation.updatedAt
          }
          : undefined;
      }))
    ).filter(value => value !== undefined);
    const selectedContinuation = continuations.find(item =>
      sameRange(item.range, selectedRange)
    );
    const startPosition = draft.startPosition
      ?? (
        selectedContinuation
          ? { kind: 'continuation' as const }
          : { kind: 'beginning' as const }
      );
    const plan: PracticePlan = draft.plan ?? {
      ...defaultPlan,
      ...(preferences
        ? {
          evaluation: structuredClone(preferences.evaluation),
          textPolicy: structuredClone(preferences.textPolicy),
          flowPolicy: structuredClone(preferences.flowPolicy),
          displayPolicy: structuredClone(preferences.displayPolicy)
        }
        : {})
    };
    return {
      kind: 'setup',
      source: {
        title: descriptor.title,
        profileKey: profileKey(descriptor.contentProfile),
        counts: structuredClone(descriptor.counts)
      },
      ranges: descriptor.ranges.map((range, index) => ({
        label: rangeLabel(range, descriptor.ranges.length, index),
        range: structuredClone(range)
      })),
      selectedRange: structuredClone(selectedRange),
      startPosition: structuredClone(startPosition),
      continuations,
      plan: {
        completion: structuredClone(plan.completion),
        evaluation: structuredClone(plan.evaluation),
        textPolicy: structuredClone(plan.textPolicy),
        flowPolicy: structuredClone(plan.flowPolicy),
        displayPolicy: structuredClone(plan.displayPolicy)
      },
      appearance: structuredClone(
        preferences?.appearance
        ?? DEFAULT_PRACTICE_PREFERENCES.appearance
      )
    };
  }
}

function correctionCount(metrics: PracticeMetrics): number {
  const counts = metrics.correctionCounts;
  return counts.backspace
    + counts.delete
    + counts.undo
    + counts.redo
    + counts.selectionDelete
    + counts.other;
}

function projectLiveContent(input: {
  session: PracticeSessionState;
  snapshot: PracticeSnapshot;
  monotonicNow: number;
}): TypingViewLiveContent {
  const { session, snapshot } = input;
  if (session.snapshotId !== snapshot.id) {
    throw new Error('Active practice session does not match its snapshot.');
  }
  if (
    session.status !== 'ready'
    && session.status !== 'running'
    && session.status !== 'blockedOnError'
    && session.status !== 'paused'
  ) {
    throw new Error('Active practice session has no live projection.');
  }
  const canPause = session.status === 'running'
    || session.status === 'blockedOnError';
  return {
    kind: 'live',
    status: session.status,
    progress: null,
    metrics: null,
    controls: {
      pause: canPause,
      resume: session.status === 'paused',
      restart: true,
      finish: true
    }
  };
}

function projectCatalogMaterial(
  record: PracticeMaterialRecord
): TypingViewMaterialSummary {
  return {
    id: record.id,
    revision: record.revision,
    title: record.title,
    origin: record.origin,
    profileKey: profileKey(record.contentProfile),
    tags: [...record.tags],
    counts: structuredClone(record.counts),
    estimatedSeconds: record.estimatedSeconds
  };
}

function profileKey(profile: ContentProfile): string {
  if (profile.kind === 'code') {
    return `${profile.kind}.${profile.language}`;
  }
  return `${profile.kind}.${profile.category}`;
}

function completionForRange(
  range: ContentDescriptor['ranges'][number]
): PracticePlan['completion'] {
  if (range.kind === 'article') {
    return { kind: 'sourceRange', range: 'article' };
  }
  if (range.kind === 'chapter') {
    return { kind: 'sourceRange', range: 'chapter' };
  }
  if (range.kind === 'selection') {
    return { kind: 'sourceRange', range: 'selection' };
  }
  return { kind: 'free' };
}

function rangeLabel(
  range: ContentDescriptor['ranges'][number],
  rangeCount: number,
  index: number
): string {
  if (range.kind === 'whole') return '全部内容';
  if (range.kind === 'article') return rangeCount === 1 ? '全文' : `文章 ${index + 1}`;
  if (range.kind === 'chapter') return `章节 ${index + 1}`;
  return `选区 ${index + 1}`;
}

function sameRange(
  left: ContentDescriptor['ranges'][number],
  right: ContentDescriptor['ranges'][number]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
