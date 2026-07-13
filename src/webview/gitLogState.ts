import {
  createDefaultGitLogPreferences,
  normalizeGitLogPreferences,
  type GitLogCommit,
  type GitLogPreferences
} from '../git/gitLogModels';

export interface GitLogState {
  sessionId?: string;
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  repositoryName?: string;
  branchName?: string;
  detached: boolean;
  commits: GitLogCommit[];
  pageIndex: number;
  pageCount: number;
  settingsOpen: boolean;
  preferences: GitLogPreferences;
  preferencesDraft: GitLogPreferences;
  error?: string;
}

export type GitLogAction =
  | { type: 'begin'; sessionId: string }
  | { type: 'ready'; sessionId: string; repositoryName: string; branchName: string; detached: boolean; commits: GitLogCommit[] }
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'invalidate'; sessionId: string }
  | { type: 'preferencesLoaded'; preferences: GitLogPreferences }
  | { type: 'openSettings' }
  | { type: 'closeSettings' }
  | { type: 'previewPreferences'; patch: Partial<GitLogPreferences> }
  | { type: 'preferencesSaved' }
  | { type: 'pageChanged'; pageIndex: number; pageCount: number };

export function createInitialGitLogState(): GitLogState {
  const preferences = createDefaultGitLogPreferences();
  return {
    status: 'idle', detached: false, commits: [], pageIndex: 0, pageCount: 1,
    settingsOpen: false, preferences, preferencesDraft: preferences
  };
}

export function gitLogReducer(state: GitLogState, action: GitLogAction): GitLogState {
  switch (action.type) {
    case 'begin':
      return { ...createInitialGitLogState(), sessionId: action.sessionId, status: 'loading', preferences: state.preferences, preferencesDraft: state.preferences };
    case 'ready':
      if (state.sessionId !== action.sessionId) return state;
      return {
        ...state, status: action.commits.length ? 'ready' : 'empty', repositoryName: action.repositoryName,
        branchName: action.branchName, detached: action.detached, commits: action.commits, pageIndex: 0, pageCount: 1, error: undefined
      };
    case 'error':
      return state.sessionId === action.sessionId ? { ...state, status: 'error', error: action.message, commits: [] } : state;
    case 'invalidate':
      return state.sessionId === action.sessionId
        ? { ...createInitialGitLogState(), sessionId: undefined, preferences: state.preferences, preferencesDraft: state.preferences }
        : state;
    case 'preferencesLoaded': {
      const preferences = normalizeGitLogPreferences(action.preferences);
      return { ...state, preferences, preferencesDraft: preferences };
    }
    case 'openSettings': return { ...state, settingsOpen: true, preferencesDraft: state.preferences };
    case 'closeSettings': return { ...state, settingsOpen: false, preferencesDraft: state.preferences };
    case 'previewPreferences': return { ...state, preferencesDraft: normalizeGitLogPreferences({ ...state.preferencesDraft, ...action.patch }) };
    case 'preferencesSaved': return { ...state, preferences: state.preferencesDraft, settingsOpen: false, pageIndex: 0 };
    case 'pageChanged': return { ...state, pageIndex: action.pageIndex, pageCount: Math.max(1, action.pageCount) };
  }
}
