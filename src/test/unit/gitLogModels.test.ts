import { describe, expect, it } from 'vitest';
import {
  createDefaultGitLogPreferences,
  normalizeGitLogCommit,
  normalizeGitLogPreferences
} from '../../git/gitLogModels';
import * as gitLogModels from '../../git/gitLogModels';

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

  it('shares one commit-limit normalizer for rounding, clamping, and invalid fallback', () => {
    const normalize = (gitLogModels as unknown as {
      normalizeGitLogMaxCommits?: (value: unknown) => number;
    }).normalizeGitLogMaxCommits;

    expect(normalize).toBeTypeOf('function');
    expect(normalize?.(19.6)).toBe(20);
    expect(normalize?.(20.6)).toBe(21);
    expect(normalize?.(1000.6)).toBe(1000);
    expect(normalize?.(Number.POSITIVE_INFINITY)).toBe(200);
    expect(normalize?.('200')).toBe(200);
  });

  it('accepts only complete commits with a finite authored timestamp', () => {
    expect(normalizeGitLogCommit({ hash: 'abc1234', subject: 'Ship it', author: 'Purvar', authoredAt: 50 })).toEqual({
      hash: 'abc1234', subject: 'Ship it', author: 'Purvar', authoredAt: 50
    });
    expect(normalizeGitLogCommit({ hash: '', subject: 'Ship it', author: 'Purvar', authoredAt: 50 })).toBeUndefined();
    expect(normalizeGitLogCommit({ hash: 'abc', subject: 'Ship it', author: 'Purvar', authoredAt: Number.NaN })).toBeUndefined();
  });
});
