export type GitLogLayout = 'lines' | 'inline';

export interface GitLogPreferences {
  showHash: boolean;
  showAuthor: boolean;
  showRelativeTime: boolean;
  showAbsoluteDate: boolean;
  layout: GitLogLayout;
  maxCommits: number;
}

export interface GitLogCommit {
  hash: string;
  subject: string;
  author: string;
  authoredAt: number;
}

export function createDefaultGitLogPreferences(): GitLogPreferences {
  return {
    showHash: true,
    showAuthor: true,
    showRelativeTime: true,
    showAbsoluteDate: true,
    layout: 'lines',
    maxCommits: 200
  };
}

export function normalizeGitLogPreferences(value: unknown): GitLogPreferences {
  const defaults = createDefaultGitLogPreferences();
  if (!isRecord(value)) return defaults;
  const maxCommits = typeof value.maxCommits === 'number' && Number.isFinite(value.maxCommits)
    ? Math.round(Math.min(1000, Math.max(20, value.maxCommits)))
    : defaults.maxCommits;
  return {
    showHash: booleanOr(value.showHash, defaults.showHash),
    showAuthor: booleanOr(value.showAuthor, defaults.showAuthor),
    showRelativeTime: booleanOr(value.showRelativeTime, defaults.showRelativeTime),
    showAbsoluteDate: booleanOr(value.showAbsoluteDate, defaults.showAbsoluteDate),
    layout: value.layout === 'inline' || value.layout === 'lines' ? value.layout : defaults.layout,
    maxCommits
  };
}

export function normalizeGitLogCommit(value: unknown): GitLogCommit | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.hash) || !isNonEmptyString(value.subject)
    || !isNonEmptyString(value.author) || typeof value.authoredAt !== 'number' || !Number.isFinite(value.authoredAt)) {
    return undefined;
  }
  return { hash: value.hash, subject: value.subject, author: value.author, authoredAt: value.authoredAt };
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
