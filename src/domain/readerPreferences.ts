export type ReaderFontFamily = 'system' | 'serif' | 'sans-serif';
export type ReaderTextAlign = 'left' | 'justify';
export type ReaderTheme = 'system' | 'light' | 'sepia' | 'dark';
export type ReaderColor = 'theme' | `#${string}`;

export interface ReaderPreferences {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  textColor: ReaderColor;
  backgroundColor: ReaderColor;
  pagePadding: number;
  textAlign: ReaderTextAlign;
  theme: ReaderTheme;
}

export const READER_PREFERENCE_LIMITS = {
  fontSize: { min: 12, max: 32 },
  lineHeight: { min: 1.2, max: 2.4 },
  letterSpacing: { min: -0.05, max: 0.2 },
  paragraphSpacing: { min: 0, max: 3 },
  pagePadding: { min: 8, max: 64 }
} as const;

export function createDefaultReaderPreferences(): ReaderPreferences {
  return {
    fontFamily: 'system',
    fontSize: 16,
    lineHeight: 1.6,
    letterSpacing: 0,
    paragraphSpacing: 0.75,
    textColor: 'theme',
    backgroundColor: 'theme',
    pagePadding: 24,
    textAlign: 'left',
    theme: 'system'
  };
}

export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  const defaults = createDefaultReaderPreferences();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    fontFamily: isFontFamily(value.fontFamily) ? value.fontFamily : defaults.fontFamily,
    fontSize: normalizeNumber(value.fontSize, READER_PREFERENCE_LIMITS.fontSize, defaults.fontSize),
    lineHeight: normalizeNumber(value.lineHeight, READER_PREFERENCE_LIMITS.lineHeight, defaults.lineHeight),
    letterSpacing: normalizeNumber(
      value.letterSpacing,
      READER_PREFERENCE_LIMITS.letterSpacing,
      defaults.letterSpacing
    ),
    paragraphSpacing: normalizeNumber(
      value.paragraphSpacing,
      READER_PREFERENCE_LIMITS.paragraphSpacing,
      defaults.paragraphSpacing
    ),
    textColor: normalizeReaderColor(value.textColor) ?? defaults.textColor,
    backgroundColor: normalizeReaderColor(value.backgroundColor) ?? defaults.backgroundColor,
    pagePadding: normalizeNumber(value.pagePadding, READER_PREFERENCE_LIMITS.pagePadding, defaults.pagePadding),
    textAlign: isTextAlign(value.textAlign) ? value.textAlign : defaults.textAlign,
    theme: isTheme(value.theme) ? value.theme : defaults.theme
  };
}

function normalizeNumber(
  value: unknown,
  limits: { readonly min: number; readonly max: number },
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(limits.max, Math.max(limits.min, value));
}

function normalizeReaderColor(value: unknown): ReaderColor | undefined {
  if (value === 'theme') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
  if (shortHex) {
    return `#${[...shortHex[1]].map((digit) => digit.repeat(2)).join('')}`.toLowerCase() as ReaderColor;
  }
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() as ReaderColor : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFontFamily(value: unknown): value is ReaderFontFamily {
  return value === 'system' || value === 'serif' || value === 'sans-serif';
}

function isTextAlign(value: unknown): value is ReaderTextAlign {
  return value === 'left' || value === 'justify';
}

function isTheme(value: unknown): value is ReaderTheme {
  return value === 'system' || value === 'light' || value === 'sepia' || value === 'dark';
}
