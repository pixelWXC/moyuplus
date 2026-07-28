import { describe, expect, it } from 'vitest';
import type { MasteryEntry } from '../../typing';
import { MasteryContentProvider } from '../../typing/adapters/sources';

describe('typing mastery content provider', () => {
  it('explains the empty state when no mastery entries exist', async () => {
    const provider = new MasteryContentProvider({
      list: async () => []
    });

    await expect(provider.prepare(
      { kind: 'mastery', seed: 'empty', length: 20 },
      { kind: 'whole' }
    )).rejects.toThrow('No mastery entries are available yet');
  });

  it.each([1, 5, 20])(
    'prepares a deterministic reinforcement sequence from %i mastery entries',
    async count => {
      const entries = Array.from({ length: count }, (_, index) => masteryEntry(
        `entry-${index + 1}`,
        String.fromCodePoint(0x4e00 + index),
        index + 1
      ));
      const provider = new MasteryContentProvider({
        list: async () => entries
      });
      const recipe = { kind: 'mastery', seed: 'repeatable', length: 80 } as const;

      const first = await provider.prepare(recipe, { kind: 'whole' });
      const second = await provider.prepare(recipe, { kind: 'whole' });

      expect(first.normalizedText).toBe(second.normalizedText);
      expect(first.generatorSeed).toBe('repeatable');
      expect(first.sourceRevision).toMatch(/^mastery-v1-[a-f0-9]{16}$/);
      expect(first.contentProfile).toEqual({ kind: 'mastery', category: 'grapheme' });
      expect(new Set(first.normalizedText.split('\n')).size).toBeLessThanOrEqual(count);
    }
  );

  it('weights repeated errors more heavily while remaining seed-reproducible', async () => {
    const entries = [
      masteryEntry('high', '错', 1_000),
      ...Array.from({ length: 20 }, (_, index) => masteryEntry(
        `low-${index}`,
        String.fromCodePoint(0x5000 + index),
        1
      ))
    ];
    const provider = new MasteryContentProvider({
      list: async () => entries
    });
    const prepared = await provider.prepare(
      { kind: 'mastery', seed: 'weighted', length: 200 },
      { kind: 'whole' }
    );
    const values = prepared.normalizedText.split('\n');

    expect(values.filter(value => value === '错').length)
      .toBeGreaterThan(values.filter(value => value !== '错').length);
    expect(values.every(value => entries.some(entry => entry.key === value))).toBe(true);
  });
});

function masteryEntry(id: string, key: string, score: number): MasteryEntry {
  return {
    schemaVersion: 1,
    key,
    kind: 'grapheme',
    contentProfile: { kind: 'chinese', category: 'modernArticle' },
    wrongCount: score,
    reinforcementCorrectStreak: 0,
    lastErrorAt: 1,
    lastPracticedAt: 1,
    score,
    algorithmVersion: 'mastery-score-v1'
  };
}
