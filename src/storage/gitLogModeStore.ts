import { normalizeReadingLocator, type ReadingLocator } from '../domain/locators';
import type { StateMemento } from './memento';
import { GIT_LOG_MODE_KEY } from './storageKeys';

export interface GitLogResumeTarget {
  bookId: string;
  locator: ReadingLocator;
  bookProgression: number;
  presentationMode?: 'webview' | 'immersive';
}

export interface GitLogModeRecord {
  active: boolean;
  resumeTarget?: GitLogResumeTarget;
}

export class GitLogModeStore {
  constructor(private readonly state: StateMemento) {}

  get(): GitLogModeRecord {
    return normalizeModeRecord(this.state.get<unknown>(GIT_LOG_MODE_KEY));
  }

  async save(value: GitLogModeRecord): Promise<GitLogModeRecord> {
    const normalized = normalizeModeRecord(value);
    await this.state.update(GIT_LOG_MODE_KEY, normalized);
    return normalized;
  }

  async claimResumeTarget(): Promise<GitLogResumeTarget | undefined> {
    const current = this.get();
    if (!current.resumeTarget) return undefined;
    await this.state.update(GIT_LOG_MODE_KEY, { active: current.active });
    return current.resumeTarget;
  }
}

function normalizeModeRecord(value: unknown): GitLogModeRecord {
  if (!isRecord(value)) return { active: false };
  const record: GitLogModeRecord = { active: value.active === true };
  const target = normalizeResumeTarget(value.resumeTarget);
  if (target) record.resumeTarget = target;
  return record;
}

function normalizeResumeTarget(value: unknown): GitLogResumeTarget | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.bookId)
    || typeof value.bookProgression !== 'number' || !Number.isFinite(value.bookProgression)
    || value.bookProgression < 0 || value.bookProgression > 1) return undefined;
  const locator = normalizeReadingLocator(value.locator);
  return locator ? {
    bookId: value.bookId, locator, bookProgression: value.bookProgression,
    ...(value.presentationMode === 'immersive' || value.presentationMode === 'webview'
      ? { presentationMode: value.presentationMode }
      : {})
  } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
