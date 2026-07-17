import {
  createDefaultGitLogPreferences,
  normalizeGitLogPreferences,
  type GitLogCommit,
  type GitLogPreferences
} from '../git/gitLogModels';
import type { GitLogDisplayResult } from '../git/gitLogMessages';

export interface GitLogState {
  sessionId?: string;
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  repositoryName?: string;
  branchName?: string;
  detached: boolean;
  commits: GitLogCommit[];
  pageIndex: number;
  pageCount: number;
  preferences: GitLogPreferences;
  error?: string;
  refreshNotice?: string;
}

export type GitLogAction =
  | { type: 'begin'; sessionId: string; cached?: GitLogDisplayResult }
  | { type: 'ready'; sessionId: string; repositoryName: string; branchName: string; detached: boolean; commits: GitLogCommit[] }
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'refreshFailed'; sessionId: string; message: string }
  | { type: 'invalidate'; sessionId: string }
  | { type: 'preferencesLoaded'; preferences: GitLogPreferences }
  | { type: 'pageChanged'; pageIndex: number; pageCount: number };

export function createInitialGitLogState(): GitLogState {
  const preferences = createDefaultGitLogPreferences();
  return {
    status: 'idle', detached: false, commits: [], pageIndex: 0, pageCount: 1, preferences
  };
}

export function gitLogReducer(state: GitLogState, action: GitLogAction): GitLogState {
  switch (action.type) {
    case 'begin':
      return action.cached
        ? {
            ...createInitialGitLogState(),
            sessionId: action.sessionId,
            status: action.cached.commits.length ? 'ready' : 'empty',
            repositoryName: action.cached.repositoryName,
            branchName: action.cached.branchName,
            detached: action.cached.detached,
            commits: action.cached.commits,
            preferences: state.preferences
          }
        : { ...createInitialGitLogState(), sessionId: action.sessionId, status: 'loading', preferences: state.preferences };
    case 'ready':
      if (state.sessionId !== action.sessionId) return state;
      return {
        ...state, status: action.commits.length ? 'ready' : 'empty', repositoryName: action.repositoryName,
        branchName: action.branchName, detached: action.detached, commits: action.commits, pageIndex: 0, pageCount: 1,
        error: undefined, refreshNotice: undefined
      };
    case 'error':
      return state.sessionId === action.sessionId ? { ...state, status: 'error', error: action.message, commits: [] } : state;
    case 'refreshFailed':
      return state.sessionId === action.sessionId && state.status === 'ready'
        ? { ...state, refreshNotice: action.message }
        : state;
    case 'invalidate':
      return state.sessionId === action.sessionId
        ? { ...createInitialGitLogState(), sessionId: undefined, preferences: state.preferences }
        : state;
    case 'preferencesLoaded': {
      const preferences = normalizeGitLogPreferences(action.preferences);
      return { ...state, preferences, pageIndex: 0 };
    }
    case 'pageChanged': return { ...state, pageIndex: action.pageIndex, pageCount: Math.max(1, action.pageCount) };
  }
}
