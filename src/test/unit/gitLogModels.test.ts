import { describe, expect, it } from 'vitest';
import {
  createDefaultGitLogPreferences,
  normalizeGitLogCommit,
  normalizeGitLogPreferences
} from '../../git/gitLogModels';

describe('Git Log models', () => {
  it('creates the approved visible-field and pagination defaults', () => {
    expect(createDefaultGitLogPreferences()).toEqual({
      showHash: true,
      showAuthor: true,
      showRelativeTime: true,
      showAbsoluteDate: true,
      layout: 'lines',
      maxCommits: 200
    });
  });

  it('normalizes damaged preferences and clamps the commit limit', () => {
    expect(normalizeGitLogPreferences({ layout: 'inline', maxCommits: 9999, showHash: false })).toEqual({
      ...createDefaultGitLogPreferences(),
      showHash: false,
      layout: 'inline',
      maxCommits: 1000
    });
    expect(normalizeGitLogPreferences('damaged')).toEqual(createDefaultGitLogPreferences());
  });

  it('accepts only complete commits with a finite authored timestamp', () => {
    expect(normalizeGitLogCommit({ hash: 'abc1234', subject: 'Ship it', author: 'Purvar', authoredAt: 50 })).toEqual({
      hash: 'abc1234', subject: 'Ship it', author: 'Purvar', authoredAt: 50
    });
    expect(normalizeGitLogCommit({ hash: '', subject: 'Ship it', author: 'Purvar', authoredAt: 50 })).toBeUndefined();
    expect(normalizeGitLogCommit({ hash: 'abc', subject: 'Ship it', author: 'Purvar', authoredAt: Number.NaN })).toBeUndefined();
  });
});
