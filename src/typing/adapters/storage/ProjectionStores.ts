import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PracticeMetrics, PracticeOutcome, PracticeResult } from '../../domain/analytics';
import {
  applyMasteryResults,
  projectMasteryResults,
  type MasteryEntry
} from '../../domain/mastery';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';
import type { ResultStore } from './ResultStore';

export interface HistoryProjectionItem {
  resultId: string;
  outcome: PracticeOutcome;
  endedAt: number;
  benchmarkKey: string;
  metrics: PracticeMetrics;
}

export interface HistoryProjection {
  schemaVersion: 1;
  sourceResultIds: string[];
  items: HistoryProjectionItem[];
  bestByBenchmark: HistoryBenchmarkBest[];
}

export interface HistoryBenchmarkBest {
  benchmarkKey: string;
  resultId: string;
  effectiveCpm: number;
  accuracy: number;
}

export interface DailyProjectionDay {
  date: string;
  activeElapsedMs: number;
  correctAttempts: number;
  errorAttempts: number;
  backspaces: number;
  otherCorrections: number;
  resultIds: string[];
}

export interface DailyProjection {
  schemaVersion: 1;
  sourceResultIds: string[];
  days: DailyProjectionDay[];
}

export interface MasteryProjection {
  schemaVersion: 1;
  sourceResultIds: string[];
  entries: MasteryEntry[];
}

export interface ProjectionStoreOptions {
  atomicWriter?: AtomicFileWriterPort;
}

export interface DailyProjectionStoreOptions extends ProjectionStoreOptions {
  dateKey?: (timestamp: number) => string;
}

abstract class ProjectionStore<T extends { schemaVersion: 1; sourceResultIds: string[] }> {
  protected readonly file: string;
  protected readonly writer: AtomicFileWriterPort;

  constructor(
    typingStorageDirectory: string,
    fileName: string,
    protected readonly results: ResultStore,
    options: ProjectionStoreOptions
  ) {
    this.file = path.join(path.resolve(typingStorageDirectory), 'projections', fileName);
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
  }

  async read(): Promise<T> {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8')) as T;
      this.validate(value);
      return structuredClone(value);
    } catch {
      return this.rebuild();
    }
  }

  async refresh(): Promise<T> {
    const facts = await this.results.list();
    let current: T | undefined;
    try {
      current = JSON.parse(await readFile(this.file, 'utf8')) as T;
      this.validate(current);
    } catch {
      current = undefined;
    }
    const sourceResultIds = facts.map(result => result.id);
    if (
      current
      && current.sourceResultIds.length === sourceResultIds.length
      && current.sourceResultIds.every((id, index) => id === sourceResultIds[index])
    ) {
      return structuredClone(current);
    }
    if (
      current
      && current.sourceResultIds.every((id, index) => id === sourceResultIds[index])
    ) {
      return this.save(this.merge(
        current,
        facts.slice(current.sourceResultIds.length),
        facts
      ));
    }
    return this.rebuildFrom(facts);
  }

  async rebuild(): Promise<T> {
    return this.rebuildFrom(await this.results.list());
  }

  protected abstract build(results: PracticeResult[]): T;

  protected merge(
    _current: T,
    _missing: PracticeResult[],
    all: PracticeResult[]
  ): T {
    return this.build(all);
  }

  protected validate(value: T): void {
    if (
      !value
      || value.schemaVersion !== 1
      || !Array.isArray(value.sourceResultIds)
    ) {
      throw new Error('Typing projection is invalid or uses an unsupported schema.');
    }
  }

  private async rebuildFrom(results: PracticeResult[]): Promise<T> {
    return this.save(this.build(results));
  }

  private async save(projection: T): Promise<T> {
    await this.writer.write(this.file, `${JSON.stringify(projection, undefined, 2)}\n`);
    return structuredClone(projection);
  }
}

export class HistoryProjectionStore extends ProjectionStore<HistoryProjection> {
  constructor(
    typingStorageDirectory: string,
    results: ResultStore,
    options: ProjectionStoreOptions = {}
  ) {
    super(typingStorageDirectory, 'history.v1.json', results, options);
  }

  protected build(results: PracticeResult[]): HistoryProjection {
    const eligible = results
      .filter(result => result.outcome === 'completed' || result.outcome === 'timedOut');
    return {
      schemaVersion: 1,
      sourceResultIds: results.map(result => result.id),
      items: eligible.map(result => ({
          resultId: result.id,
          outcome: result.outcome,
          endedAt: result.endedAt,
          benchmarkKey: result.benchmarkKey,
          metrics: structuredClone(result.metrics)
        })),
      bestByBenchmark: bestByBenchmark(eligible)
    };
  }

  protected override merge(
    current: HistoryProjection,
    missing: PracticeResult[],
    all: PracticeResult[]
  ): HistoryProjection {
    const appended = missing
      .filter(result => result.outcome === 'completed' || result.outcome === 'timedOut')
      .map(result => ({
        resultId: result.id,
        outcome: result.outcome,
        endedAt: result.endedAt,
        benchmarkKey: result.benchmarkKey,
        metrics: structuredClone(result.metrics)
      }));
    const eligible = all
      .filter(result => result.outcome === 'completed' || result.outcome === 'timedOut');
    return {
      schemaVersion: 1,
      sourceResultIds: all.map(result => result.id),
      items: [...current.items, ...appended],
      bestByBenchmark: bestByBenchmark(eligible)
    };
  }

  protected override validate(value: HistoryProjection): void {
    super.validate(value);
    if (!Array.isArray(value.items) || !Array.isArray(value.bestByBenchmark)) {
      throw new Error('Typing history projection is invalid.');
    }
  }
}

function bestByBenchmark(results: PracticeResult[]): HistoryBenchmarkBest[] {
  const best = new Map<string, PracticeResult>();
  for (const result of results) {
    const current = best.get(result.benchmarkKey);
    if (!current || compareBenchmarkResult(result, current) < 0) {
      best.set(result.benchmarkKey, result);
    }
  }
  return [...best.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([benchmarkKey, result]) => ({
      benchmarkKey,
      resultId: result.id,
      effectiveCpm: result.metrics.effectiveCpm,
      accuracy: result.metrics.accuracy
    }));
}

function compareBenchmarkResult(left: PracticeResult, right: PracticeResult): number {
  return right.metrics.effectiveCpm - left.metrics.effectiveCpm
    || right.metrics.accuracy - left.metrics.accuracy
    || right.endedAt - left.endedAt
    || left.id.localeCompare(right.id);
}

export class DailyProjectionStore extends ProjectionStore<DailyProjection> {
  private readonly dateKey: (timestamp: number) => string;

  constructor(
    typingStorageDirectory: string,
    results: ResultStore,
    options: DailyProjectionStoreOptions = {}
  ) {
    super(typingStorageDirectory, 'daily.v1.json', results, options);
    this.dateKey = options.dateKey ?? localDateKey;
  }

  protected build(results: PracticeResult[]): DailyProjection {
    const days = new Map<string, DailyProjectionDay>();
    addResultsToDays(days, results, this.dateKey);
    return {
      schemaVersion: 1,
      sourceResultIds: results.map(result => result.id),
      days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date))
    };
  }

  protected override merge(
    current: DailyProjection,
    missing: PracticeResult[],
    all: PracticeResult[]
  ): DailyProjection {
    const days = new Map(
      current.days.map(day => [day.date, structuredClone(day)])
    );
    addResultsToDays(days, missing, this.dateKey);
    return {
      schemaVersion: 1,
      sourceResultIds: all.map(result => result.id),
      days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date))
    };
  }

  protected override validate(value: DailyProjection): void {
    super.validate(value);
    if (!Array.isArray(value.days)) {
      throw new Error('Typing daily projection is invalid.');
    }
  }
}

function addResultsToDays(
  days: Map<string, DailyProjectionDay>,
  results: PracticeResult[],
  dateKey: (timestamp: number) => string
): void {
    for (const result of results) {
      const buckets = result.speedBuckets.length > 0
        ? result.speedBuckets
        : [{
          wallStartedAt: result.startedAt,
          activeElapsedMs: result.activeElapsedMs,
          correctAttempts: result.metrics.correctAttempts,
          errorAttempts: result.metrics.errorAttempts,
          backspaces: result.metrics.correctionCounts.backspace,
          otherCorrections: otherCorrections(result)
        }];
      for (const bucket of buckets) {
        const date = dateKey(bucket.wallStartedAt);
        const day = days.get(date) ?? {
          date,
          activeElapsedMs: 0,
          correctAttempts: 0,
          errorAttempts: 0,
          backspaces: 0,
          otherCorrections: 0,
          resultIds: []
        };
        day.activeElapsedMs += bucket.activeElapsedMs;
        day.correctAttempts += bucket.correctAttempts;
        day.errorAttempts += bucket.errorAttempts;
        day.backspaces += bucket.backspaces;
        day.otherCorrections += bucket.otherCorrections;
        if (!day.resultIds.includes(result.id)) {
          day.resultIds.push(result.id);
        }
        days.set(date, day);
      }
    }
}

export class MasteryProjectionStore extends ProjectionStore<MasteryProjection> {
  constructor(
    typingStorageDirectory: string,
    results: ResultStore,
    options: ProjectionStoreOptions = {}
  ) {
    super(typingStorageDirectory, 'mastery.v1.json', results, options);
  }

  protected build(results: PracticeResult[]): MasteryProjection {
    return {
      schemaVersion: 1,
      sourceResultIds: results.map(result => result.id),
      entries: projectMasteryResults(results)
    };
  }

  protected override merge(
    current: MasteryProjection,
    missing: PracticeResult[],
    all: PracticeResult[]
  ): MasteryProjection {
    return {
      schemaVersion: 1,
      sourceResultIds: all.map(result => result.id),
      entries: applyMasteryResults(current.entries, missing)
    };
  }

  protected override validate(value: MasteryProjection): void {
    super.validate(value);
    if (!Array.isArray(value.entries)) {
      throw new Error('Typing mastery projection is invalid.');
    }
  }
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function otherCorrections(result: PracticeResult): number {
  const counts = result.metrics.correctionCounts;
  return counts.delete + counts.undo + counts.redo + counts.selectionDelete + counts.other;
}
