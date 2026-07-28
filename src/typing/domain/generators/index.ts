import type { GeneratorKind } from '../content';

export interface GeneratorRequest {
  seed: string;
  targetUnits: number;
}

export interface GeneratorOutput {
  seed: string;
  algorithmVersion: string;
  text: string;
}

export type DeterministicGeneratorKind = Exclude<GeneratorKind, 'mastery'>;

export interface GeneratorPools {
  commonSentences: readonly string[];
  englishWords: readonly string[];
  englishSentences: readonly string[];
  mixedProgrammer: readonly string[];
  mixedOffice: readonly string[];
  frequentHanzi: readonly string[];
  idiom: readonly string[];
  phrase: readonly string[];
  punctuation: readonly string[];
  specialSymbol: readonly string[];
  code: readonly string[];
}

export interface DeterministicGeneratorRequest extends GeneratorRequest {
  kind: DeterministicGeneratorKind;
}

export const GENERATOR_ALGORITHM_VERSION = 'v1';

export function generateDeterministicContent(
  request: DeterministicGeneratorRequest,
  pools: GeneratorPools
): GeneratorOutput {
  if (!request.seed.trim()) throw new Error('Generated practice content requires a seed.');
  if (!Number.isInteger(request.targetUnits) || request.targetUnits <= 0) {
    throw new Error('Generated practice content requires a positive target length.');
  }
  const random = createDeterministicRandom(`${request.kind}:${request.seed}`);
  const text = request.kind === 'phone'
    ? generatePhones(request.targetUnits, random)
    : request.kind === 'date'
      ? generateDates(request.targetUnits, random)
      : request.kind === 'amount'
        ? generateAmounts(request.targetUnits, random)
        : generateFromPool(pools[request.kind], request.targetUnits, random, separator(request.kind));
  return {
    seed: request.seed,
    algorithmVersion: GENERATOR_ALGORITHM_VERSION,
    text
  };
}

function separator(kind: DeterministicGeneratorKind): string {
  return ['frequentHanzi', 'punctuation', 'specialSymbol'].includes(kind) ? '' : '\n';
}

function generateFromPool(
  source: readonly string[],
  targetUnits: number,
  random: () => number,
  joiner: string
): string {
  const pool = source.filter(value => value.length > 0);
  if (pool.length === 0) throw new Error('Generated practice content pool is empty.');
  const output: string[] = [];
  let length = 0;
  while (length < targetUnits) {
    const shuffled = shuffle(pool, random);
    for (const value of shuffled) {
      output.push(value);
      length += Array.from(value).length + (output.length > 1 ? Array.from(joiner).length : 0);
      if (length >= targetUnits) break;
    }
  }
  return output.join(joiner);
}

function generatePhones(targetUnits: number, random: () => number): string {
  const output: string[] = [];
  let length = 0;
  while (length < targetUnits || output.length < 2) {
    const digits = `1${3 + randomInt(random, 7)}${randomDigits(random, 9)}`;
    const display = output.length % 2 === 0
      ? digits
      : `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    output.push(display);
    length += display.length + (output.length > 1 ? 1 : 0);
  }
  return output.join('\n');
}

function generateDates(targetUnits: number, random: () => number): string {
  const output = ['2024-02-29'];
  let length = output[0].length;
  while (length < targetUnits || output.length < 4) {
    const year = 2000 + randomInt(random, 51);
    const month = 1 + randomInt(random, 12);
    const maximumDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = 1 + randomInt(random, maximumDay);
    const format = output.length % 3;
    const display = format === 0
      ? `${year}-${pad2(month)}-${pad2(day)}`
      : format === 1
        ? `${year}/${pad2(month)}/${pad2(day)}`
        : `${year}年${month}月${day}日`;
    output.push(display);
    length += display.length + 1;
  }
  return output.join('\n');
}

function generateAmounts(targetUnits: number, random: () => number): string {
  const output: string[] = [];
  let length = 0;
  while (length < targetUnits || output.length < 5) {
    const whole = 1_000 + randomInt(random, 999_000);
    const decimal = pad2(randomInt(random, 100));
    const format = output.length % 5;
    const display = format === 0
      ? `${whole}`
      : format === 1
        ? `${whole}.${decimal}`
        : format === 2
          ? `${whole.toLocaleString('en-US')}.${decimal}`
          : format === 3
            ? `¥${whole}.${decimal}`
            : `${whole}.${decimal}元`;
    output.push(display);
    length += display.length + (output.length > 1 ? 1 : 0);
  }
  return output.join('\n');
}

export function createDeterministicRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (const value of seed) {
    state ^= value.codePointAt(0) ?? 0;
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(random, index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function randomInt(random: () => number, exclusiveMaximum: number): number {
  return Math.floor(random() * exclusiveMaximum);
}

function randomDigits(random: () => number, count: number): string {
  return Array.from({ length: count }, () => randomInt(random, 10)).join('');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
