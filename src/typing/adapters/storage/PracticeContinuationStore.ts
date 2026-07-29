import { createHash } from 'node:crypto';
import { readFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import type {
  ContentRecipe,
  PracticeSnapshot,
  SourceRange
} from '../../domain/content';
import type { PracticeSessionState } from '../../domain/session';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';

export interface PracticeContinuation {
  schemaVersion: 1;
  contentRecipe: Extract<
    ContentRecipe,
    { kind: 'custom' | 'readerBook' | 'online' }
  >;
  sourceRevision: string;
  selectedRange: SourceRange;
  targetIndex: number;
  totalUnits: number;
  updatedAt: number;
}

export interface PracticeContinuationStoreOptions {
  atomicWriter?: AtomicFileWriterPort;
  now?: () => number;
}

export class PracticeContinuationStore {
  private readonly directory: string;
  private readonly writer: AtomicFileWriterPort;
  private readonly now: () => number;

  constructor(
    typingStorageDirectory: string,
    options: PracticeContinuationStoreOptions = {}
  ) {
    this.directory = path.join(
      path.resolve(typingStorageDirectory),
      'continuations'
    );
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
    this.now = options.now ?? Date.now;
  }

  async update(
    snapshot: PracticeSnapshot,
    session: PracticeSessionState
  ): Promise<void> {
    if (session.snapshotId !== snapshot.id) {
      throw new Error('Practice continuation session does not match its snapshot.');
    }
    const recipe = persistentRecipe(snapshot.plan.contentRecipe);
    if (!recipe) return;
    const totalUnits = snapshot.targetUnits.length;
    const targetIndex = Math.max(
      0,
      Math.min(totalUnits, Math.trunc(session.targetIndex))
    );
    if (targetIndex <= 0 || targetIndex >= totalUnits) {
      await this.clear(recipe, snapshot.selectedRange);
      return;
    }
    const continuation: PracticeContinuation = {
      schemaVersion: 1,
      contentRecipe: structuredClone(recipe),
      sourceRevision: snapshot.sourceRevision,
      selectedRange: structuredClone(snapshot.selectedRange),
      targetIndex,
      totalUnits,
      updatedAt: this.now()
    };
    await this.writer.write(
      this.file(recipe, snapshot.selectedRange),
      `${JSON.stringify(continuation, undefined, 2)}\n`
    );
  }

  async get(
    recipe: ContentRecipe,
    range: SourceRange
  ): Promise<PracticeContinuation | undefined> {
    const persistent = persistentRecipe(recipe);
    if (!persistent) return undefined;
    try {
      const value = JSON.parse(
        await readFile(this.file(persistent, range), 'utf8')
      ) as unknown;
      if (!isContinuation(value)) return undefined;
      if (
        stableJson(value.contentRecipe) !== stableJson(persistent)
        || stableJson(value.selectedRange) !== stableJson(range)
      ) {
        return undefined;
      }
      return structuredClone(value);
    } catch (error) {
      if (isNotFound(error) || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  async clear(recipe: ContentRecipe, range: SourceRange): Promise<boolean> {
    const persistent = persistentRecipe(recipe);
    if (!persistent) return false;
    try {
      await unlink(this.file(persistent, range));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async clearSource(recipe: ContentRecipe): Promise<void> {
    const persistent = persistentRecipe(recipe);
    if (!persistent) return;
    await rm(this.sourceDirectory(persistent), {
      recursive: true,
      force: true
    });
  }

  private file(
    recipe: PracticeContinuation['contentRecipe'],
    range: SourceRange
  ): string {
    return path.join(
      this.sourceDirectory(recipe),
      `${digest(stableJson(range))}.v1.json`
    );
  }

  private sourceDirectory(
    recipe: PracticeContinuation['contentRecipe']
  ): string {
    return path.join(this.directory, digest(stableJson(recipe)));
  }
}

function persistentRecipe(
  recipe: ContentRecipe
): PracticeContinuation['contentRecipe'] | undefined {
  if (recipe.kind === 'custom') {
    return { kind: 'custom', materialId: recipe.materialId };
  }
  if (recipe.kind === 'readerBook') {
    return { kind: 'readerBook', bookId: recipe.bookId };
  }
  if (recipe.kind === 'online') {
    return {
      kind: 'online',
      providerId: recipe.providerId,
      contentId: recipe.contentId
    };
  }
  return undefined;
}

function isContinuation(value: unknown): value is PracticeContinuation {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PracticeContinuation>;
  return record.schemaVersion === 1
    && isPersistentRecipe(record.contentRecipe)
    && typeof record.sourceRevision === 'string'
    && record.sourceRevision.length > 0
    && isSourceRange(record.selectedRange)
    && Number.isSafeInteger(record.targetIndex)
    && Number(record.targetIndex) > 0
    && Number.isSafeInteger(record.totalUnits)
    && Number(record.totalUnits) > Number(record.targetIndex)
    && Number.isFinite(record.updatedAt);
}

function isPersistentRecipe(
  value: unknown
): value is PracticeContinuation['contentRecipe'] {
  if (!value || typeof value !== 'object') return false;
  const recipe = value as Record<string, unknown>;
  return (
    recipe.kind === 'custom'
    && typeof recipe.materialId === 'string'
  ) || (
    recipe.kind === 'readerBook'
    && typeof recipe.bookId === 'string'
  ) || (
    recipe.kind === 'online'
    && typeof recipe.providerId === 'string'
    && typeof recipe.contentId === 'string'
  );
}

function isSourceRange(value: unknown): value is SourceRange {
  if (!value || typeof value !== 'object') return false;
  const range = value as Record<string, unknown>;
  return range.kind === 'whole'
    || (
      range.kind === 'article'
      && (range.articleId === undefined || typeof range.articleId === 'string')
    )
    || (range.kind === 'chapter' && typeof range.chapterId === 'string')
    || (
      range.kind === 'selection'
      && Number.isSafeInteger(range.start)
      && Number.isSafeInteger(range.end)
      && Number(range.start) >= 0
      && Number(range.end) > Number(range.start)
    );
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
