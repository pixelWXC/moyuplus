import { describe, expect, it } from 'vitest';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';
import { createInitialGitLogState, gitLogReducer } from '../../webview/gitLogState';

const commit = { hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 };

describe('Git Log Webview state', () => {
  it('starts every session empty and accepts only matching results', () => {
    const loading = gitLogReducer(createInitialGitLogState(), { type: 'begin', sessionId: 'g1' });
    const stale = gitLogReducer(loading, {
      type: 'ready', sessionId: 'old', repositoryName: 'old', branchName: 'old', detached: false, commits: [commit]
    });
    expect(stale).toEqual(loading);
    expect(gitLogReducer(loading, {
      type: 'ready', sessionId: 'g1', repositoryName: 'repo', branchName: 'main', detached: false, commits: [commit]
    })).toMatchObject({ status: 'ready', commits: [commit], pageIndex: 0 });
  });

  it('keeps a separate settings draft and resets page on save', () => {
    let state = gitLogReducer(createInitialGitLogState(), { type: 'begin', sessionId: 'g1' });
    state = gitLogReducer(state, { type: 'preferencesLoaded', preferences: createDefaultGitLogPreferences() });
    state = gitLogReducer(state, { type: 'openSettings' });
    state = gitLogReducer(state, { type: 'previewPreferences', patch: { layout: 'inline', showHash: false } });
    state = { ...state, pageIndex: 3 };
    state = gitLogReducer(state, { type: 'preferencesSaved' });
    expect(state).toMatchObject({ settingsOpen: false, pageIndex: 0, preferences: { layout: 'inline', showHash: false } });
  });

  it('invalidates commits and page data without retaining the old session', () => {
    let state = gitLogReducer(createInitialGitLogState(), { type: 'begin', sessionId: 'g1' });
    state = gitLogReducer(state, { type: 'ready', sessionId: 'g1', repositoryName: 'repo', branchName: 'main', detached: false, commits: [commit] });
    expect(gitLogReducer(state, { type: 'invalidate', sessionId: 'g1' })).toMatchObject({
      sessionId: undefined, status: 'idle', commits: [], pageIndex: 0, pageCount: 1
    });
  });
});
