import { describe, expect, it } from 'vitest';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';
import { createInitialGitLogState, gitLogReducer } from '../../webview/gitLogState';

const commit = { hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 };

describe('Git Log Webview state', () => {
  it('begins directly in ready state with cached data and keeps cache misses loading', () => {
    const initial = createInitialGitLogState();
    expect(gitLogReducer(initial, { type: 'begin', sessionId: 'g1' })).toMatchObject({
      sessionId: 'g1', status: 'loading', commits: []
    });
    expect(gitLogReducer(initial, {
      type: 'begin', sessionId: 'g2', cached: {
        repositoryName: 'repo', branchName: 'main', detached: false, commits: [commit]
      }
    })).toMatchObject({
      sessionId: 'g2', status: 'ready', repositoryName: 'repo', branchName: 'main', commits: [commit], pageIndex: 0
    });
  });

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

  it('keeps ready data, pagination, and settings intact when cached refresh fails', () => {
    let state = gitLogReducer(createInitialGitLogState(), {
      type: 'begin', sessionId: 'g1', cached: {
        repositoryName: 'repo', branchName: 'main', detached: false, commits: [commit]
      }
    });
    state = { ...state, pageIndex: 3, pageCount: 5, settingsOpen: true };
    const failed = gitLogReducer(state, { type: 'refreshFailed', sessionId: 'g1', message: '刷新失败，正在显示上次结果。' });

    expect(failed).toMatchObject({
      status: 'ready', commits: [commit], pageIndex: 3, pageCount: 5, settingsOpen: true,
      refreshNotice: '刷新失败，正在显示上次结果。'
    });
    expect(gitLogReducer(failed, { type: 'refreshFailed', sessionId: 'stale', message: 'stale' })).toEqual(failed);
    expect(gitLogReducer(failed, {
      type: 'ready', sessionId: 'g1', repositoryName: 'repo', branchName: 'next', detached: false, commits: [commit]
    }).refreshNotice).toBeUndefined();
    expect(gitLogReducer(failed, { type: 'begin', sessionId: 'g2' }).refreshNotice).toBeUndefined();
  });
});
