import { describe, expect, it } from 'vitest';
import { isExtensionToGitLogMessage, isGitLogToExtensionMessage } from '../../git/gitLogMessages';
import * as gitLogMessages from '../../git/gitLogMessages';

describe('Git Log message guards', () => {
  it('accepts complete session-scoped results and rejects stale shapes', () => {
    expect(isExtensionToGitLogMessage({
      type: 'modeGitLog', sessionId: 'g1',
      modeGeneration: 1,
      preferences: { showHash: true, showAuthor: true, showRelativeTime: true, showAbsoluteDate: true, layout: 'lines', maxCommits: 200 },
      readerPreferences: { fontSize: 16 },
      cached: {
        repositoryName: 'repo', branchName: 'main', detached: false,
        commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }]
      }
    })).toBe(true);
    expect(isExtensionToGitLogMessage({
      type: 'gitLogReady', sessionId: 'g1', repositoryName: 'repo', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }]
    })).toBe(true);
    expect(isExtensionToGitLogMessage({ type: 'gitLogReady', sessionId: '', commits: [] })).toBe(false);
    expect(isExtensionToGitLogMessage({ type: 'libraryState', books: [] })).toBe(false);
    expect(isExtensionToGitLogMessage({ type: 'gitLogLoading', sessionId: 'g1' })).toBe(false);
    expect(isExtensionToGitLogMessage({
      type: 'modeGitLog', sessionId: 'g1', modeGeneration: 0,
      preferences: { showHash: true, showAuthor: true, showRelativeTime: true, showAbsoluteDate: true, layout: 'lines', maxCommits: 200 },
      readerPreferences: {}
    })).toBe(false);
  });

  it('projects results through a strict display whitelist and rejects leaked internal fields', () => {
    const toDisplayResult = (gitLogMessages as unknown as {
      toGitLogDisplayResult?: (result: Record<string, unknown>) => Record<string, unknown>;
    }).toGitLogDisplayResult;
    const internal = {
      repositoryRoot: 'D:/private/repo', repositoryName: 'repo', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }],
      fingerprint: 'secret', futureInternalField: 'also-secret'
    };

    expect(toDisplayResult).toBeTypeOf('function');
    expect(toDisplayResult?.(internal)).toEqual({
      repositoryName: 'repo', branchName: 'main', detached: false, commits: internal.commits
    });
    expect(isExtensionToGitLogMessage({ type: 'gitLogReady', sessionId: 'g1', ...internal })).toBe(false);
    expect(isExtensionToGitLogMessage({
      type: 'modeGitLog', sessionId: 'g1', modeGeneration: 1,
      preferences: { showHash: true, showAuthor: true, showRelativeTime: true, showAbsoluteDate: true, layout: 'lines', maxCommits: 200 },
      readerPreferences: {}, cached: internal
    })).toBe(false);
  });

  it('accepts refresh failures and generation tombstones only in their complete forms', () => {
    expect(isExtensionToGitLogMessage({
      type: 'gitLogRefreshFailed', sessionId: 'g1', code: 'queryFailed', message: 'Refresh failed.'
    })).toBe(true);
    expect(isExtensionToGitLogMessage({ type: 'gitLogRefreshFailed', sessionId: 'g1', code: 'queryFailed' })).toBe(false);
    expect(isExtensionToGitLogMessage({ type: 'modeInvalidated', sessionId: 'g1', modeGeneration: 2 })).toBe(true);
    expect(isExtensionToGitLogMessage({ type: 'modeInvalidated', modeGeneration: 3 })).toBe(true);
    expect(isExtensionToGitLogMessage({ type: 'modeInvalidated', modeGeneration: 2.5 })).toBe(false);
  });

  it('accepts only normalized settings save messages from the Webview', () => {
    expect(isGitLogToExtensionMessage({
      type: 'saveGitLogPreferences', preferences: {
        showHash: true, showAuthor: false, showRelativeTime: true, showAbsoluteDate: true,
        layout: 'inline', maxCommits: 200
      }
    })).toBe(true);
    expect(isGitLogToExtensionMessage({ type: 'saveGitLogPreferences', preferences: { maxCommits: 'many' } })).toBe(false);
  });
});
