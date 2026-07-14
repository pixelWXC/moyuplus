import { normalizeGitLogCommit, type GitLogCommit, type GitLogPreferences } from './gitLogModels';
import type { GitLogResult } from './gitLogService';

export interface GitLogDisplayResult {
  repositoryName: string;
  branchName: string;
  detached: boolean;
  commits: GitLogCommit[];
}

export type ExtensionToGitLogMessage =
  | {
      type: 'modeGitLog';
      sessionId: string;
      modeGeneration: number;
      preferences: GitLogPreferences;
      readerPreferences: unknown;
      cached?: GitLogDisplayResult;
    }
  | ({ type: 'gitLogReady'; sessionId: string } & GitLogDisplayResult)
  | { type: 'gitLogError'; sessionId: string; code: string; message: string }
  | { type: 'gitLogRefreshFailed'; sessionId: string; code: string; message: string }
  | { type: 'gitLogInvalidated'; sessionId: string }
  | { type: 'modeInvalidated'; sessionId?: string; modeGeneration: number };

export type GitLogToExtensionMessage =
  | { type: 'saveGitLogPreferences'; preferences: GitLogPreferences };

export function toGitLogDisplayResult(result: GitLogResult): GitLogDisplayResult {
  return {
    repositoryName: result.repositoryName,
    branchName: result.branchName,
    detached: result.detached,
    commits: result.commits.map(commit => ({
      hash: commit.hash,
      subject: commit.subject,
      author: commit.author,
      authoredAt: commit.authoredAt
    }))
  };
}

export function isExtensionToGitLogMessage(value: unknown): value is ExtensionToGitLogMessage {
  if (!isRecord(value) || !isNonEmptyString(value.type)) return false;
  if (value.type === 'modeInvalidated') {
    return hasOnlyKeys(value, ['type', 'sessionId', 'modeGeneration'])
      && (value.sessionId === undefined || isNonEmptyString(value.sessionId))
      && isModeGeneration(value.modeGeneration);
  }
  if (!isNonEmptyString(value.sessionId)) return false;
  if (value.type === 'gitLogReady') {
    return hasOnlyKeys(value, ['type', 'sessionId', 'repositoryName', 'branchName', 'detached', 'commits'])
      && hasDisplayFields(value);
  }
  if (value.type === 'gitLogError' || value.type === 'gitLogRefreshFailed') {
    return hasOnlyKeys(value, ['type', 'sessionId', 'code', 'message'])
      && isNonEmptyString(value.code) && isNonEmptyString(value.message);
  }
  if (value.type === 'gitLogInvalidated') {
    return hasOnlyKeys(value, ['type', 'sessionId']);
  }
  return value.type === 'modeGitLog'
    && hasOnlyKeys(value, ['type', 'sessionId', 'modeGeneration', 'preferences', 'readerPreferences', 'cached'])
    && isModeGeneration(value.modeGeneration)
    && isStrictPreferences(value.preferences)
    && isRecord(value.readerPreferences)
    && (value.cached === undefined || isStrictDisplayResult(value.cached));
}

export function isGitLogToExtensionMessage(value: unknown): value is GitLogToExtensionMessage {
  return isRecord(value) && hasOnlyKeys(value, ['type', 'preferences'])
    && value.type === 'saveGitLogPreferences' && isStrictPreferences(value.preferences);
}

function isStrictDisplayResult(value: unknown): value is GitLogDisplayResult {
  return isRecord(value)
    && hasOnlyKeys(value, ['repositoryName', 'branchName', 'detached', 'commits'])
    && hasDisplayFields(value);
}

function hasDisplayFields(value: Record<string, unknown>): value is Record<string, unknown> & GitLogDisplayResult {
  return isNonEmptyString(value.repositoryName)
    && isNonEmptyString(value.branchName)
    && typeof value.detached === 'boolean'
    && Array.isArray(value.commits)
    && value.commits.every(isStrictCommit);
}

function isStrictCommit(value: unknown): value is GitLogCommit {
  return isRecord(value)
    && hasOnlyKeys(value, ['hash', 'subject', 'author', 'authoredAt'])
    && normalizeGitLogCommit(value) !== undefined;
}

function isStrictPreferences(value: unknown): value is GitLogPreferences {
  return isRecord(value)
    && hasOnlyKeys(value, ['showHash', 'showAuthor', 'showRelativeTime', 'showAbsoluteDate', 'layout', 'maxCommits'])
    && typeof value.showHash === 'boolean'
    && typeof value.showAuthor === 'boolean'
    && typeof value.showRelativeTime === 'boolean'
    && typeof value.showAbsoluteDate === 'boolean'
    && (value.layout === 'lines' || value.layout === 'inline')
    && typeof value.maxCommits === 'number' && Number.isInteger(value.maxCommits)
    && value.maxCommits >= 20 && value.maxCommits <= 1000;
}

function isModeGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every(key => allowedKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
