import type { ContentProfile } from '../content';

export interface MasteryEntry {
  schemaVersion: number;
  key: string;
  kind: 'grapheme' | 'word' | 'codeToken';
  contentProfile: ContentProfile;
  wrongCount: number;
  reinforcementCorrectStreak: number;
  lastErrorAt: number;
  lastPracticedAt: number;
  score: number;
  algorithmVersion: string;
}

export * from './MasteryScorer';
