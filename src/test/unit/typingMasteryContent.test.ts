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
    'prepares one deterministic queue pass from %i mastery entries',
    async count => {
      const entries = Array.from({ length: count }, (_, index) => masteryEntry(
        `entry-${index + 1}`,
        String.fromCodePoint(0x4e00 + index),
        index + 1
      ));
      const provider = new MasteryContentProvider({
        list: async () => entries
      });
      const recipe = { kind: 'mastery', seed: 'repeatable', length: 20 } as const;

      const first = await provider.prepare(recipe, { kind: 'whole' });
      const second = await provider.prepare(recipe, { kind: 'whole' });

      expect(first.normalizedText).toBe(second.normalizedText);
      expect(first.generatorSeed).toBe('repeatable');
      expect(first.sourceRevision).toMatch(/^mastery-v1-[a-f0-9]{16}$/);
      expect(first.contentProfile).toEqual({ kind: 'mastery', category: 'word' });
      expect(first.normalizedText.split('\n')).toHaveLength(count);
      expect(new Set(first.normalizedText.split('\n')).size).toBe(count);
    }
  );

  it('takes the oldest pending words first and never repeats one within a batch', async () => {
    const entries = [
      { ...masteryEntry('recent', '最近', 1_000), lastPracticedAt: 100 },
      ...Array.from({ length: 20 }, (_, index) => masteryEntry(
        `low-${index}`,
        `词-${index}`,
        1
      ))
    ];
    const provider = new MasteryContentProvider({
      list: async () => entries
    });
    const prepared = await provider.prepare(
      { kind: 'mastery', seed: 'queue', length: 20 },
      { kind: 'whole' }
    );
    const values = prepared.normalizedText.split('\n');

    expect(values).toHaveLength(20);
    expect(new Set(values).size).toBe(20);
    expect(values).not.toContain('最近');
    expect(values.every(value => entries.some(entry => entry.key === value))).toBe(true);
  });
});

function masteryEntry(id: string, key: string, score: number): MasteryEntry {
  return {
    schemaVersion: 1,
    key,
    kind: 'word',
    contentProfile: { kind: 'chinese', category: 'modernArticle' },
    wrongCount: score,
    reinforcementCorrectStreak: 0,
    lastErrorAt: 1,
    lastPracticedAt: 1,
    score,
    algorithmVersion: 'mastery-score-v1'
  };
}
