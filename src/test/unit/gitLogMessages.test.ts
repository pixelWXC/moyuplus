import { describe, expect, it } from 'vitest';
import { isExtensionToGitLogMessage, isGitLogToExtensionMessage } from '../../git/gitLogMessages';

describe('Git Log message guards', () => {
  it('accepts complete session-scoped results and rejects stale shapes', () => {
    expect(isExtensionToGitLogMessage({
      type: 'modeGitLog', sessionId: 'g1',
      preferences: { showHash: true, showAuthor: true, showRelativeTime: true, showAbsoluteDate: true, layout: 'lines', maxCommits: 200 },
      readerPreferences: { fontSize: 16 }
    })).toBe(true);
    expect(isExtensionToGitLogMessage({
      type: 'gitLogReady', sessionId: 'g1', repositoryName: 'repo', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }]
    })).toBe(true);
    expect(isExtensionToGitLogMessage({ type: 'gitLogReady', sessionId: '', commits: [] })).toBe(false);
    expect(isExtensionToGitLogMessage({ type: 'libraryState', books: [] })).toBe(false);
    expect(isExtensionToGitLogMessage({ type: 'gitLogLoading', sessionId: 'g1' })).toBe(false);
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
