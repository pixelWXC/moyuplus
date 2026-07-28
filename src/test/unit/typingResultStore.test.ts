import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PracticeResult } from '../../typing';
import {
  DailyProjectionStore,
  HistoryProjectionStore,
  MasteryProjectionStore,
  ProjectedResultCommitter,
  ResultStore
} from '../../typing/adapters/storage';

const temporaryRoots: string[] = [];

describe('ResultStore', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(temporaryRoots.splice(0).map(root =>
      rm(root, { recursive: true, force: true })
    ));
  });

  it('writes one immutable atomic file per result and never overwrites an id', async () => {
    const root = await temporaryRoot();
    const store = new ResultStore(root);
    const original = result('result-1', Date.UTC(2026, 6, 23, 10));

    await store.commit(original);
    await store.commit(structuredClone(original));
    await expect(store.commit({
      ...original,
      outcome: 'abandoned'
    })).rejects.toThrow('Result id already exists with different content: result-1');
    await expect(store.commit({
      ...original,
      endedAt: Date.UTC(2026, 7, 23, 10)
    })).rejects.toThrow('Result id already exists with different content: result-1');

    await expect(store.get(original.id)).resolves.toEqual(original);
    await expect(store.list()).resolves.toEqual([original]);
    const persisted = JSON.parse(await readFile(
      path.join(root, 'results', '2026-07', 'result-1.json'),
      'utf8'
    ));
    expect(persisted).toEqual(original);
  });

  it('clears committed records and id claims so storage cannot grow without bound', async () => {
    const root = await temporaryRoot();
    const store = new ResultStore(root);
    const original = result('result-clear', Date.UTC(2026, 6, 23, 10));

    await store.commit(original);
    await store.clearAll();

    await expect(store.list()).resolves.toEqual([]);
    await expect(store.get(original.id)).resolves.toBeUndefined();
    await store.commit(original);
    await expect(store.list()).resolves.toEqual([original]);
  });
});

describe('result projections', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(temporaryRoots.splice(0).map(root =>
      rm(root, { recursive: true, force: true })
    ));
  });

  it('increments by result watermark and rebuilds history, daily and mastery from facts', async () => {
    const root = await temporaryRoot();
    const results = new ResultStore(root);
    const completed = result('result-1', Date.UTC(2026, 6, 23, 10));
    const restarted = result('result-2', Date.UTC(2026, 6, 24, 10), {
      outcome: 'restarted',
      masteryObservations: [{
        key: '你',
        kind: 'grapheme',
        wrongCount: 1,
        reinforcementCorrectCount: 0
      }]
    });
    await results.commit(completed);
    await results.commit(restarted);

    const history = new HistoryProjectionStore(root, results);
    const daily = new DailyProjectionStore(root, results, {
      dateKey: timestamp => new Date(timestamp).toISOString().slice(0, 10)
    });
    const mastery = new MasteryProjectionStore(root, results);

    expect((await history.refresh()).items.map(item => item.resultId)).toEqual(['result-1']);
    expect((await daily.refresh()).days.map(day => ({
      date: day.date,
      resultIds: day.resultIds
    }))).toEqual([
      { date: '2026-07-23', resultIds: ['result-1'] },
      { date: '2026-07-24', resultIds: ['result-2'] }
    ]);
    expect((await mastery.refresh()).entries).toEqual([
      expect.objectContaining({ key: '你', wrongCount: 1 })
    ]);

    const later = result('result-3', Date.UTC(2026, 6, 25, 10), {
      metrics: {
        ...completed.metrics,
        effectiveCpm: 10
      }
    });
    await results.commit(later);
    expect((await history.refresh()).sourceResultIds).toEqual([
      'result-1',
      'result-2',
      'result-3'
    ]);
    expect((await history.read()).items.map(item => item.resultId)).toEqual([
      'result-1',
      'result-3'
    ]);
    expect((await history.read()).bestByBenchmark).toEqual([
      {
        benchmarkKey: completed.benchmarkKey,
        resultId: 'result-3',
        effectiveCpm: 10,
        accuracy: 100
      }
    ]);

    const projectionDirectory = path.join(root, 'projections');
    await Promise.all([
      writeFile(path.join(projectionDirectory, 'history.v1.json'), '{broken', 'utf8'),
      writeFile(path.join(projectionDirectory, 'daily.v1.json'), '{broken', 'utf8'),
      writeFile(path.join(projectionDirectory, 'mastery.v1.json'), '{broken', 'utf8')
    ]);
    expect((await history.read()).sourceResultIds).toHaveLength(3);
    expect((await daily.read()).days).toHaveLength(3);
    expect((await mastery.read()).entries[0]).toMatchObject({ key: '你', wrongCount: 1 });
  });

  it('commits the immutable result before refreshing derived projections', async () => {
    const root = await temporaryRoot();
    const results = new ResultStore(root);
    const history = new HistoryProjectionStore(root, results);
    const daily = new DailyProjectionStore(root, results);
    const mastery = new MasteryProjectionStore(root, results);
    const committer = new ProjectedResultCommitter(results, [
      history,
      daily,
      mastery
    ]);
    const original = result('result-commit', Date.UTC(2026, 6, 23, 12));

    await committer.commit(original);

    await expect(results.get(original.id)).resolves.toEqual(original);
    expect((await history.read()).sourceResultIds).toEqual([original.id]);
    expect((await daily.read()).sourceResultIds).toEqual([original.id]);
    expect((await mastery.read()).sourceResultIds).toEqual([original.id]);

    const projectionFailure = new ProjectedResultCommitter(results, [{
      async refresh() {
        throw new Error('projection unavailable');
      }
    }]);
    const durable = result('result-durable', Date.UTC(2026, 6, 23, 13));
    await expect(projectionFailure.commit(durable)).rejects.toThrow('projection unavailable');
    await expect(results.get(durable.id)).resolves.toEqual(durable);
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-results-'));
  temporaryRoots.push(root);
  return root;
}

function result(
  id: string,
  endedAt: number,
  overrides: Partial<PracticeResult> = {}
): PracticeResult {
  const value: PracticeResult = {
    schemaVersion: 1,
    id,
    sessionId: `session-${id}`,
    attemptId: `attempt-${id}`,
    snapshotId: `snapshot-${id}`,
    sourceRevision: `revision-${id}`,
    outcome: 'completed',
    contentProfile: { kind: 'chinese', category: 'adHoc' },
    completion: { kind: 'free' },
    evaluation: { errorPolicy: 'block' },
    textPolicy: {
      punctuation: { mode: 'equivalent', mappingVersion: 'zh-punctuation-v1' },
      whitespace: { mode: 'strict' },
      caseSensitive: true
    },
    startedAt: endedAt - 60_000,
    endedAt,
    wallElapsedMs: 60_000,
    activeElapsedMs: 60_000,
    metrics: {
      totalAttempts: 1,
      correctAttempts: 1,
      errorAttempts: 0,
      completedUnits: 1,
      printableAttempts: 1,
      completedPrintableUnits: 1,
      completedHanzi: 1,
      completedEnglishCharacters: 0,
      completedEnglishWords: 0,
      accuracy: 100,
      rawCpm: 1,
      effectiveCpm: 1,
      hanziPerMinute: 1,
      standardWpm: 0,
      completeWordsPerMinute: 0,
      longestCorrectStreak: 1,
      correctionCounts: {
        backspace: 0,
        delete: 0,
        undo: 0,
        redo: 0,
        selectionDelete: 0,
        other: 0
      }
    },
    speedBuckets: [{
      wallStartedAt: endedAt - 10_000,
      activeElapsedMs: 10_000,
      rawCpm: 6,
      effectiveCpm: 6,
      accuracy: 100,
      correctAttempts: 1,
      errorAttempts: 0,
      backspaces: 0,
      otherCorrections: 0
    }],
    errorPairs: [],
    errorWords: [],
    masteryObservations: [],
    benchmarkKey: 'chinese|free|character:block|strict:equivalent-v1'
  };
  return { ...value, ...overrides };
}
