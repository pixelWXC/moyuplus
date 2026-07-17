export type ImmersiveFontWeight = 'normal' | '500' | '600' | 'bold';

export interface ImmersiveReaderPreferences {
  visualLines: number;
  graphemesPerLine: number;
  textColor: 'theme' | `#${string}`;
  backgroundColor: 'transparent' | `#${string}`;
  fontWeight: ImmersiveFontWeight;
  italic: boolean;
  leftMargin: number;
}

export function createDefaultImmersiveReaderPreferences(): ImmersiveReaderPreferences {
  return {
    visualLines: 3,
    graphemesPerLine: 40,
    textColor: 'theme',
    backgroundColor: 'transparent',
    fontWeight: 'normal',
    italic: false,
    leftMargin: 12
  };
}

export function normalizeImmersiveReaderPreferences(value: unknown): ImmersiveReaderPreferences {
  const defaults = createDefaultImmersiveReaderPreferences();
  if (!isRecord(value)) return defaults;
  return {
    visualLines: integerBetween(value.visualLines, 1, 12, defaults.visualLines),
    graphemesPerLine: integerBetween(value.graphemesPerLine, 8, 160, defaults.graphemesPerLine),
    textColor: normalizeColor(value.textColor, 'theme'),
    backgroundColor: normalizeColor(value.backgroundColor, 'transparent'),
    fontWeight: isFontWeight(value.fontWeight) ? value.fontWeight : defaults.fontWeight,
    italic: typeof value.italic === 'boolean' ? value.italic : defaults.italic,
    leftMargin: integerBetween(value.leftMargin, 0, 64, defaults.leftMargin)
  };
}

function normalizeColor<T extends 'theme' | 'transparent'>(value: unknown, fallback: T): T | `#${string}` {
  if (value === fallback) return fallback;
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase() as `#${string}`
    : fallback;
}

function integerBetween(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.trunc(value)))
    : fallback;
}

function isFontWeight(value: unknown): value is ImmersiveFontWeight {
  return value === 'normal' || value === '500' || value === '600' || value === 'bold';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
