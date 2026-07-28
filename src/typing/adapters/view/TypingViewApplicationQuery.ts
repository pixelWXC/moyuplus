import {
  BUILT_IN_PACK_MANIFEST,
  type BuiltInPackManifest
} from '../../assets';
import {
  createDefaultPracticePlan,
  preparePracticeContent,
  type ContentDescriptor,
  type ContentProfile,
  type ContentRecipe,
  type PracticePlan,
  type PracticeMaterialRecord
} from '../../domain/content';
import type { PracticePreferences } from '../../domain/policies';
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
  type TypingViewHistoryContent,
  type TypingViewLegacyResumeHint,
  type TypingViewMaterialSummary,
  type TypingViewLiveContent,
  type TypingViewMasteryContent,
  type TypingViewPage,
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
  builtInManifest?: BuiltInPackManifest;
  activeSessionStatus?: () => PromiseLike<TypingViewSessionStatus | null>;
  pendingResultCount?: () => PromiseLike<number>;
  setupDraft?: {
    snapshot(): PracticeSetupDraftSnapshot | undefined;
  };
  inspectContent?: (recipe: ContentRecipe) => PromiseLike<ContentDescriptor>;
  practicePreferences?: () => PromiseLike<PracticePreferences>;
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
  legacyResumeHint?: () =>
    | TypingViewLegacyResumeHint
    | undefined
    | PromiseLike<TypingViewLegacyResumeHint | undefined>;
}

export class TypingViewApplicationQuery {
  private readonly builtIn: readonly TypingViewMaterialSummary[];

  constructor(private readonly options: TypingViewApplicationQueryOptions) {
    this.builtIn = projectBuiltInMaterials(
      options.builtInManifest ?? BUILT_IN_PACK_MANIFEST
    );
  }

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
      const content = await this.setupContent();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PAGES],
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
    if (page === 'live') {
      const active = await this.options.activePractice?.();
      return {
        activePage: page,
        availablePages: [...TYPING_VIEW_PAGES],
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
        availablePages: [...TYPING_VIEW_PAGES],
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
        availablePages: [...TYPING_VIEW_PAGES],
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
        availablePages: [...TYPING_VIEW_PAGES],
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
        availablePages: [...TYPING_VIEW_PAGES],
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
        availablePages: [...TYPING_VIEW_PAGES],
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

    const records = await this.options.catalog.list();
    return {
      activePage: page,
      availablePages: [...TYPING_VIEW_PAGES],
      activeSessionStatus,
      pendingResultCount,
      recovery: recovery ? structuredClone(recovery) : null,
      ...legacyResumeField,
      content: {
        kind: 'materials',
        builtIn: structuredClone(this.builtIn),
        library: [...records]
          .sort((left, right) => (
            right.updatedAt - left.updatedAt || left.title.localeCompare(right.title)
          ))
          .map(projectCatalogMaterial),
        actions: {
          paste: true,
          importTxt: true,
          importEpub: true
        }
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
    const projection = await this.options.mastery.read();
    return {
      kind: 'mastery',
      totalEntries: projection.entries.length,
      entries: [...projection.entries]
        .sort((left, right) => (
          right.score - left.score
            || right.wrongCount - left.wrongCount
            || left.key.localeCompare(right.key)
        ))
        .slice(0, 100)
        .map(entry => ({
          key: entry.key,
          kind: entry.kind,
          wrongCount: entry.wrongCount,
          reinforcementCorrectStreak: entry.reinforcementCorrectStreak,
          lastErrorAt: entry.lastErrorAt,
          score: entry.score
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
      plan: {
        completion: structuredClone(plan.completion),
        evaluation: structuredClone(plan.evaluation),
        textPolicy: structuredClone(plan.textPolicy),
        flowPolicy: structuredClone(plan.flowPolicy),
        displayPolicy: structuredClone(plan.displayPolicy)
      }
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
  const attempts = session.inputAttempts;
  const correctAttempts = attempts.filter(attempt => attempt.correct);
  const activeElapsedMs = activeElapsed(session, input.monotonicNow);
  const activeMinutes = activeElapsedMs / 60_000;
  const printableAttempts = attempts.filter(
    attempt => isPrintable(attempt.actual)
  ).length;
  const completedPrintable = correctAttempts.filter(
    attempt => isPrintable(attempt.expected)
  ).length;
  const canPause = session.status === 'running'
    || session.status === 'blockedOnError';
  const showLiveMetrics = snapshot.plan.displayPolicy.showLiveMetrics;
  return {
    kind: 'live',
    status: session.status,
    progress: showLiveMetrics
      ? {
        completedUnits: Math.min(
          session.targetIndex,
          snapshot.targetUnits.length
        ),
        totalUnits: snapshot.targetUnits.length
      }
      : null,
    metrics: showLiveMetrics
      ? {
        activeElapsedMs,
        totalAttempts: attempts.length,
        correctAttempts: correctAttempts.length,
        errorAttempts: attempts.length - correctAttempts.length,
        accuracy: attempts.length === 0
          ? 100
          : correctAttempts.length / attempts.length * 100,
        rawCpm: perMinute(printableAttempts, activeMinutes),
        effectiveCpm: perMinute(completedPrintable, activeMinutes)
      }
      : null,
    controls: {
      pause: canPause,
      resume: session.status === 'paused',
      restart: true,
      finish: true
    }
  };
}

function activeElapsed(
  session: PracticeSessionState,
  monotonicNow: number
): number {
  if (session.startedAtMonotonic === undefined) return 0;
  let elapsed = Math.max(
    0,
    monotonicNow
      - session.startedAtMonotonic
      - (session.accumulatedPausedMs ?? 0)
  );
  if (session.pausedAtMonotonic !== undefined) {
    elapsed = Math.max(
      0,
      elapsed - Math.max(0, monotonicNow - session.pausedAtMonotonic)
    );
  }
  return elapsed;
}

function perMinute(value: number, minutes: number): number {
  return minutes <= 0 ? 0 : value / minutes;
}

function isPrintable(value: string): boolean {
  return value.length > 0 && !/^[\r\n\t]$/u.test(value);
}

function projectBuiltInMaterials(
  manifest: BuiltInPackManifest
): TypingViewMaterialSummary[] {
  return manifest.entries.map(entry => {
    const prepared = preparePracticeContent(entry.body, {
      materialId: entry.id,
      sourceRevision: entry.revision,
      contentProfile: entry.contentProfile,
      range: { kind: 'whole' }
    });
    return {
      id: entry.id,
      revision: entry.revision,
      title: entry.title,
      origin: 'builtIn',
      profileKey: profileKey(entry.contentProfile),
      tags: [...entry.tags],
      counts: structuredClone(prepared.counts),
      estimatedSeconds: prepared.estimatedSeconds,
      sourceNotice: structuredClone(entry.source)
    };
  });
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
