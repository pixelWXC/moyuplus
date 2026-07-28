import { describe, expect, it } from 'vitest';
import type { GeneratorKind } from '../../typing';
import { GeneratedContentProvider } from '../../typing/adapters/sources';

const supportedGenerators: GeneratorKind[] = [
  'commonSentences',
  'englishWords',
  'englishSentences',
  'mixedProgrammer',
  'mixedOffice',
  'frequentHanzi',
  'idiom',
  'phrase',
  'phone',
  'date',
  'amount',
  'punctuation',
  'specialSymbol',
  'code'
];

describe('typing generated content provider', () => {
  it('produces deterministic non-empty content for every non-mastery generator', async () => {
    const provider = new GeneratedContentProvider();

    for (const generator of supportedGenerators) {
      const recipe = { kind: 'generated', generator, seed: 'seed-42', length: 80 } as const;
      const first = await provider.prepare(recipe, { kind: 'whole' });
      const second = await provider.prepare(recipe, { kind: 'whole' });

      expect(first.normalizedText, generator).not.toHaveLength(0);
      expect(second.normalizedText, generator).toBe(first.normalizedText);
      expect(first.generatorSeed, generator).toBe('seed-42');
      expect(first.sourceRevision, generator).toContain(`${generator}-v1-`);
      expect(first.selectedRange, generator).toEqual({ kind: 'whole' });
    }
  });

  it('changes random combinations when the seed changes while retaining the seed', async () => {
    const provider = new GeneratedContentProvider();
    const first = await provider.prepare(
      { kind: 'generated', generator: 'englishWords', seed: 'alpha', length: 100 },
      { kind: 'whole' }
    );
    const second = await provider.prepare(
      { kind: 'generated', generator: 'englishWords', seed: 'beta', length: 100 },
      { kind: 'whole' }
    );

    expect(second.normalizedText).not.toBe(first.normalizedText);
    expect(first.generatorSeed).toBe('alpha');
    expect(second.generatorSeed).toBe('beta');
  });

  it('generates both valid mainland phone displays and valid calendar dates including leap day', async () => {
    const provider = new GeneratedContentProvider();
    const phones = await provider.prepare(
      { kind: 'generated', generator: 'phone', seed: 'phones', length: 40 },
      { kind: 'whole' }
    );
    const dates = await provider.prepare(
      { kind: 'generated', generator: 'date', seed: 'dates', length: 80 },
      { kind: 'whole' }
    );

    const phoneLines = phones.normalizedText.split('\n');
    expect(phoneLines.some(line => /^1[3-9]\d{9}$/.test(line))).toBe(true);
    expect(phoneLines.some(line => /^1[3-9]\d \d{4} \d{4}$/.test(line))).toBe(true);
    for (const value of phoneLines) {
      expect(value.replaceAll(' ', '')).toMatch(/^1[3-9]\d{9}$/);
    }

    const dateLines = dates.normalizedText.split('\n');
    expect(dateLines).toContain('2024-02-29');
    for (const value of dateLines) {
      expect(isValidGeneratedDate(value), value).toBe(true);
    }
  });

  it('covers integer, decimal, grouped, currency, and yuan amount displays', async () => {
    const provider = new GeneratedContentProvider();
    const prepared = await provider.prepare(
      { kind: 'generated', generator: 'amount', seed: 'amounts', length: 80 },
      { kind: 'whole' }
    );
    const lines = prepared.normalizedText.split('\n');

    expect(lines.some(value => /^\d+$/.test(value))).toBe(true);
    expect(lines.some(value => /^\d+\.\d{2}$/.test(value))).toBe(true);
    expect(lines.some(value => /^\d{1,3}(,\d{3})+(\.\d{2})?$/.test(value))).toBe(true);
    expect(lines.some(value => /^¥\d/.test(value))).toBe(true);
    expect(lines.some(value => /^\d+(\.\d{2})?元$/.test(value))).toBe(true);
  });

  it('rejects unsupported mastery recipes and invalid generated lengths', async () => {
    const provider = new GeneratedContentProvider();

    await expect(provider.prepare(
      { kind: 'generated', generator: 'mastery', seed: 'seed', length: 20 },
      { kind: 'whole' }
    )).rejects.toThrow('MasteryContentProvider');
    await expect(provider.prepare(
      { kind: 'generated', generator: 'phone', seed: 'seed', length: 0 },
      { kind: 'whole' }
    )).rejects.toThrow('positive target length');
  });
});

function isValidGeneratedDate(value: string): boolean {
  const normalized = value
    .replace(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/, '$1-$2-$3')
    .replaceAll('/', '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}
