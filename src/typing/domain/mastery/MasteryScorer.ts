import type { PracticeResult } from '../analytics';
import type { MasteryEntry } from './index';

export const MASTERY_ALGORITHM_VERSION = 'mastery-v1';
const MASTERY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1_000;

export function projectMasteryResults(results: readonly PracticeResult[]): MasteryEntry[] {
  return applyMasteryResults([], results);
}

export function applyMasteryResults(
  current: readonly MasteryEntry[],
  results: readonly PracticeResult[]
): MasteryEntry[] {
  const entries = new Map(
    current.map(entry => [
      `${entry.kind}\u0000${entry.key}`,
      structuredClone(entry)
    ])
  );
  const ordered = [...results].sort(
    (left, right) => left.endedAt - right.endedAt || left.id.localeCompare(right.id)
  );
  for (const result of ordered) {
    for (const observation of result.masteryObservations) {
      if (observation.kind === 'grapheme') continue;
      const mapKey = `${observation.kind}\u0000${observation.key}`;
      if (
        result.contentProfile.kind === 'mastery'
        && observation.wrongCount === 0
        && observation.reinforcementCorrectCount > 0
      ) {
        entries.delete(mapKey);
        continue;
      }
      let entry = entries.get(mapKey);
      if (!entry) {
        if (observation.wrongCount === 0) {
          continue;
        }
        entry = {
          schemaVersion: 1,
          key: observation.key,
          kind: observation.kind,
          contentProfile: structuredClone(result.contentProfile),
          wrongCount: 0,
          reinforcementCorrectStreak: 0,
          lastErrorAt: 0,
          lastPracticedAt: result.endedAt,
          score: 0,
          algorithmVersion: MASTERY_ALGORITHM_VERSION
        };
      } else {
        entry = decayMasteryEntry(entry, result.endedAt);
      }

      for (let index = 0; index < observation.wrongCount; index += 1) {
        entry.score += 1 + Math.log2(entry.wrongCount + 2);
        entry.wrongCount += 1;
        entry.reinforcementCorrectStreak = 0;
        entry.lastErrorAt = result.endedAt;
      }
      if (observation.reinforcementCorrectCount > 0) {
        entry.reinforcementCorrectStreak += observation.reinforcementCorrectCount;
      }
      entry.lastPracticedAt = result.endedAt;
      entries.set(mapKey, entry);
    }
  }
  return [...entries.values()]
    .map(entry => structuredClone(entry))
    .sort((left, right) => (
      left.lastPracticedAt - right.lastPracticedAt
        || right.score - left.score
        || left.key.localeCompare(right.key)
    ));
}

export function decayMasteryEntry(entry: MasteryEntry, at: number): MasteryEntry {
  if (at <= entry.lastPracticedAt) {
    return structuredClone(entry);
  }
  const elapsed = at - entry.lastPracticedAt;
  return {
    ...structuredClone(entry),
    score: entry.score * (0.5 ** (elapsed / MASTERY_HALF_LIFE_MS)),
    lastPracticedAt: at,
    algorithmVersion: MASTERY_ALGORITHM_VERSION
  };
}
