import { normalizeGitLogCommit, type GitLogCommit, type GitLogPreferences } from './gitLogModels';

export type ExtensionToGitLogMessage =
  | { type: 'modeGitLog'; sessionId: string; preferences: GitLogPreferences; readerPreferences: unknown }
  | { type: 'gitLogReady'; sessionId: string; repositoryName: string; branchName: string; detached: boolean; commits: GitLogCommit[] }
  | { type: 'gitLogError'; sessionId: string; code: string; message: string }
  | { type: 'gitLogInvalidated'; sessionId: string };

export type GitLogToExtensionMessage =
  | { type: 'saveGitLogPreferences'; preferences: GitLogPreferences };

export function isExtensionToGitLogMessage(value: unknown): value is ExtensionToGitLogMessage {
  if (!isRecord(value) || !isNonEmptyString(value.type) || !isNonEmptyString(value.sessionId)) return false;
  if (value.type === 'gitLogReady') {
    return isNonEmptyString(value.repositoryName) && isNonEmptyString(value.branchName)
      && typeof value.detached === 'boolean' && Array.isArray(value.commits)
      && value.commits.every(commit => normalizeGitLogCommit(commit) !== undefined);
  }
  if (value.type === 'gitLogError') return isNonEmptyString(value.code) && isNonEmptyString(value.message);
  if (value.type === 'gitLogInvalidated') return true;
  return value.type === 'modeGitLog' && isStrictPreferences(value.preferences) && isRecord(value.readerPreferences);
}

export function isGitLogToExtensionMessage(value: unknown): value is GitLogToExtensionMessage {
  return isRecord(value) && value.type === 'saveGitLogPreferences' && isStrictPreferences(value.preferences);
}

function isStrictPreferences(value: unknown): value is GitLogPreferences {
  return isRecord(value)
    && typeof value.showHash === 'boolean'
    && typeof value.showAuthor === 'boolean'
    && typeof value.showRelativeTime === 'boolean'
    && typeof value.showAbsoluteDate === 'boolean'
    && (value.layout === 'lines' || value.layout === 'inline')
    && typeof value.maxCommits === 'number' && Number.isFinite(value.maxCommits)
    && value.maxCommits >= 20 && value.maxCommits <= 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
