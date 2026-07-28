import { describe, expect, it, vi } from 'vitest';
import {
  PracticeApplicationCoordinator,
  type PracticeApplicationPorts,
  type PracticePlan,
  type PracticeResult,
  type PracticeSessionState,
  type PracticeSnapshot,
  type PreparedContent
} from '../../typing';

const plan: PracticePlan = {
  contentRecipe: { kind: 'adHoc', text: '你好' },
  completion: { kind: 'free' },
  evaluation: { errorPolicy: 'block' },
  textPolicy: {
    punctuation: { mode: 'equivalent', mappingVersion: 'zh-punctuation-v1' },
    whitespace: { mode: 'strict' },
    caseSensitive: true
  },
  flowPolicy: { lineAdvance: 'automatic', presentation: 'continuous' },
  displayPolicy: { showLiveMetrics: true, showWhitespace: false }
};

const prepared: PreparedContent = {
  sourceRevision: 'adhoc:sha256',
  normalizedText: '你好',
  counts: { graphemes: 2, hanGraphemes: 2, englishWords: 0, printableUnits: 2 },
  estimatedSeconds: 2,
  selectedRange: { kind: 'selection', start: 0, end: 2 },
  targetUnits: [
    { index: 0, value: '你', display: '你', kind: 'grapheme', lineIndex: 0 },
    { index: 1, value: '好', display: '好', kind: 'grapheme', lineIndex: 0 }
  ],
  displayLines: [{ index: 0, text: '你好', targetStart: 0, targetEnd: 2 }]
};

const snapshot: PracticeSnapshot = {
  schemaVersion: 1,
  id: 'snapshot-1',
  sourceRevision: prepared.sourceRevision,
  plan,
  targetUnits: prepared.targetUnits,
  displayLines: prepared.displayLines,
  selectedRange: prepared.selectedRange,
  createdAt: 1_000
};

const readySession: PracticeSessionState = {
  schemaVersion: 1,
  id: 'session-1',
  snapshotId: snapshot.id,
  attemptId: 'attempt-1',
  status: 'ready',
  targetIndex: 0,
  blockedInputCount: 0,
  correctionCounts: {
    backspace: 0,
    delete: 0,
    undo: 0,
    redo: 0,
    selectionDelete: 0,
    other: 0
  },
  createdAt: 1_000,
  updatedAt: 1_000
};

const runningSession: PracticeSessionState = {
  ...readySession,
  status: 'running',
  startedAt: 1_010,
  updatedAt: 1_010
};

const pausedSession: PracticeSessionState = {
  ...runningSession,
  status: 'paused',
  updatedAt: 1_020
};

const resumedSession: PracticeSessionState = {
  ...runningSession,
  updatedAt: 1_030
};

const restartedSession: PracticeSessionState = {
  ...readySession,
  id: 'session-2',
  attemptId: 'attempt-2',
  updatedAt: 1_040
};

const finishedSession: PracticeSessionState = {
  ...runningSession,
  status: 'completed',
  endedAt: 1_050,
  updatedAt: 1_050
};

const result: PracticeResult = {
  schemaVersion: 1,
  id: 'result-1',
  sessionId: runningSession.id,
  attemptId: runningSession.attemptId,
  snapshotId: snapshot.id,
  sourceRevision: snapshot.sourceRevision,
  outcome: 'completed',
  contentProfile: { kind: 'chinese', category: 'adHoc' },
  completion: plan.completion,
  evaluation: plan.evaluation,
  textPolicy: plan.textPolicy,
  startedAt: 1_010,
  endedAt: 1_050,
  wallElapsedMs: 40,
  activeElapsedMs: 40,
  metrics: {
    totalAttempts: 0,
    correctAttempts: 0,
    errorAttempts: 0,
    completedUnits: 0,
    printableAttempts: 0,
    completedPrintableUnits: 0,
    completedHanzi: 0,
    completedEnglishCharacters: 0,
    completedEnglishWords: 0,
    accuracy: 0,
    rawCpm: 0,
    effectiveCpm: 0,
    hanziPerMinute: 0,
    standardWpm: 0,
    completeWordsPerMinute: 0,
    longestCorrectStreak: 0,
    correctionCounts: readySession.correctionCounts
  },
  speedBuckets: [],
  errorPairs: [],
  errorWords: [],
  benchmarkKey: 'chinese:adHoc|free|character:block|strict:equivalent-v1'
};

describe('PracticeApplicationCoordinator', () => {
  it('prepares an immutable snapshot through content and snapshot ports', async () => {
    const { coordinator, ports } = createHarness();

    const event = await coordinator.prepare({ type: 'prepare', plan, range: prepared.selectedRange });

    expect(ports.content.prepare).toHaveBeenCalledWith(plan.contentRecipe, prepared.selectedRange);
    expect(ports.snapshotBuilder.build).toHaveBeenCalledWith({
      id: 'snapshot-1',
      createdAt: 1_000,
      plan,
      prepared
    });
    expect(ports.snapshots.save).toHaveBeenCalledWith(snapshot);
    expect(ports.events.publish).toHaveBeenCalledWith(event);
    expect(event).toEqual({ type: 'practicePrepared', snapshot });
  });

  it('starts a stored snapshot without relying on coordinator-local session state', async () => {
    const { coordinator, ports } = createHarness();

    const event = await coordinator.start({ type: 'start', snapshotId: snapshot.id });

    expect(ports.snapshots.get).toHaveBeenCalledWith(snapshot.id);
    expect(ports.lease.acquire).toHaveBeenCalledWith('session-1');
    expect(ports.lease.acquire.mock.invocationCallOrder[0])
      .toBeLessThan(ports.runtime.start.mock.invocationCallOrder[0]!);
    expect(ports.runtime.start).toHaveBeenCalledWith({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    expect(ports.sessions.save).toHaveBeenCalledWith(runningSession);
    expect(ports.panel.open).toHaveBeenCalledWith(snapshot, runningSession);
    expect(event).toEqual({ type: 'practiceStarted', session: runningSession });
  });

  it('reports the authoritative lease conflict without starting or opening a session', async () => {
    const { coordinator, ports } = createHarness();
    ports.lease.acquire.mockResolvedValueOnce({
      acquired: false,
      activeSession: {
        id: 'session-other-window',
        status: 'paused'
      }
    });

    const event = await coordinator.start({
      type: 'start',
      snapshotId: snapshot.id
    });

    expect(event).toEqual({
      type: 'practiceStartBlocked',
      activeSession: {
        id: 'session-other-window',
        status: 'paused'
      }
    });
    expect(ports.runtime.start).not.toHaveBeenCalled();
    expect(ports.sessions.save).not.toHaveBeenCalled();
    expect(ports.panel.open).not.toHaveBeenCalled();
  });

  it('releases a newly acquired lease when session startup fails', async () => {
    const { coordinator, ports } = createHarness();
    ports.panel.open.mockRejectedValueOnce(new Error('panel unavailable'));

    await expect(coordinator.start({
      type: 'start',
      snapshotId: snapshot.id
    })).rejects.toThrow('panel unavailable');

    expect(ports.lease.release).toHaveBeenCalledWith('session-1');
  });

  it('pauses and resumes by loading and saving the session through ports', async () => {
    const { coordinator, ports } = createHarness();

    const paused = await coordinator.pause({ type: 'pause', sessionId: runningSession.id });
    ports.sessions.get.mockResolvedValueOnce(pausedSession);
    const resumed = await coordinator.resume({ type: 'resume', sessionId: runningSession.id });

    expect(ports.runtime.pause).toHaveBeenCalledWith(runningSession, 500);
    expect(ports.runtime.resume).toHaveBeenCalledWith(pausedSession, 500);
    expect(ports.sessions.save).toHaveBeenNthCalledWith(1, pausedSession);
    expect(ports.sessions.save).toHaveBeenNthCalledWith(2, resumedSession);
    expect(ports.panel.render).toHaveBeenNthCalledWith(1, pausedSession);
    expect(ports.panel.render).toHaveBeenNthCalledWith(2, resumedSession);
    expect(paused.type).toBe('practicePaused');
    expect(resumed.type).toBe('practiceResumed');
  });

  it('restarts from the same stored snapshot and commits the restarted attempt result', async () => {
    const { coordinator, ports } = createHarness();
    vi.mocked(ports.ids.next).mockImplementation(kind => ({
      snapshot: 'snapshot-2',
      session: 'session-2',
      attempt: 'attempt-2',
      result: 'result-1',
      material: 'material-1'
    })[kind]);
    ports.runtime.restart.mockReturnValue({
      previousSession: { ...finishedSession, status: 'abandoned' },
      nextSession: restartedSession,
      result: { ...result, outcome: 'restarted' }
    });

    const event = await coordinator.restart({ type: 'restart', sessionId: runningSession.id });

    expect(ports.snapshots.get).toHaveBeenCalledWith(snapshot.id);
    expect(ports.runtime.restart).toHaveBeenCalledWith({
      session: runningSession,
      snapshot,
      nextSessionId: 'session-2',
      nextAttemptId: 'attempt-2',
      resultId: 'result-1',
      wallTime: 1_000,
      monotonicTime: 500
    });
    expect(ports.results.commit).toHaveBeenCalledWith({ ...result, outcome: 'restarted' });
    expect(ports.sessions.save).toHaveBeenCalledWith(restartedSession);
    expect(ports.panel.open).toHaveBeenCalledWith(snapshot, restartedSession);
    expect(ports.lease.transition).toHaveBeenCalledWith(
      runningSession.id,
      restartedSession.id
    );
    expect(event).toMatchObject({ type: 'practiceRestarted', session: restartedSession });
  });

  it('finishes through the runtime before committing the immutable result', async () => {
    const { coordinator, ports } = createHarness();

    const event = await coordinator.finish({
      type: 'finish',
      sessionId: runningSession.id,
      outcome: 'completed'
    });

    expect(ports.runtime.finish).toHaveBeenCalledWith({
      session: runningSession,
      snapshot,
      resultId: 'result-1',
      outcome: 'completed',
      wallTime: 1_000,
      monotonicTime: 500
    });
    expect(ports.sessions.save).toHaveBeenCalledWith(finishedSession);
    expect(ports.results.commit).toHaveBeenCalledWith(result);
    expect(ports.panel.complete).toHaveBeenCalledWith(finishedSession, result);
    expect(ports.lease.release).toHaveBeenCalledWith(finishedSession.id);
    expect(event).toEqual({ type: 'practiceFinished', session: finishedSession, result });
  });

  it('rejects missing snapshots and sessions before invoking domain runtime ports', async () => {
    const { coordinator, ports } = createHarness();
    ports.snapshots.get.mockResolvedValueOnce(undefined);

    await expect(coordinator.start({ type: 'start', snapshotId: 'missing' }))
      .rejects.toThrow('Practice snapshot not found: missing');

    ports.sessions.get.mockResolvedValueOnce(undefined);
    await expect(coordinator.pause({ type: 'pause', sessionId: 'missing' }))
      .rejects.toThrow('Practice session not found: missing');
    expect(ports.runtime.start).not.toHaveBeenCalled();
    expect(ports.runtime.pause).not.toHaveBeenCalled();
  });
});

function createHarness(): {
  coordinator: PracticeApplicationCoordinator;
  ports: PracticeApplicationPorts & {
    content: { prepare: ReturnType<typeof vi.fn> };
    snapshotBuilder: { build: ReturnType<typeof vi.fn> };
    snapshots: { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    sessions: { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    runtime: {
      start: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      restart: ReturnType<typeof vi.fn>;
      finish: ReturnType<typeof vi.fn>;
    };
    results: { commit: ReturnType<typeof vi.fn> };
    lease: {
      acquire: ReturnType<typeof vi.fn>;
      transition: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };
    panel: {
      open: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      complete: ReturnType<typeof vi.fn>;
    };
    events: { publish: ReturnType<typeof vi.fn> };
  };
} {
  const ids = {
    snapshot: ['snapshot-1'],
    session: ['session-1', 'session-2'],
    attempt: ['attempt-1', 'attempt-2'],
    result: ['result-1']
  };
  const ports = {
    clock: { wallNow: vi.fn(() => 1_000), monotonicNow: vi.fn(() => 500) },
    ids: { next: vi.fn((kind: keyof typeof ids) => ids[kind].shift() ?? `${kind}-fallback`) },
    content: { prepare: vi.fn(async () => prepared) },
    snapshotBuilder: { build: vi.fn(() => snapshot) },
    snapshots: {
      get: vi.fn(async () => snapshot as PracticeSnapshot | undefined),
      save: vi.fn(async () => undefined)
    },
    sessions: {
      get: vi.fn(async () => runningSession as PracticeSessionState | undefined),
      save: vi.fn(async () => undefined)
    },
    runtime: {
      start: vi.fn(() => runningSession),
      pause: vi.fn(() => pausedSession),
      resume: vi.fn(() => resumedSession),
      restart: vi.fn(() => ({
        previousSession: { ...finishedSession, status: 'abandoned' as const },
        nextSession: restartedSession,
        result: { ...result, outcome: 'restarted' as const }
      })),
      finish: vi.fn(() => ({ session: finishedSession, result }))
    },
    results: { commit: vi.fn(async () => undefined) },
    lease: {
      acquire: vi.fn(async () => ({ acquired: true as const })),
      transition: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined)
    },
    panel: {
      open: vi.fn(async () => undefined),
      render: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined)
    },
    events: { publish: vi.fn() }
  } satisfies PracticeApplicationPorts;
  return {
    coordinator: new PracticeApplicationCoordinator(ports),
    ports
  };
}
