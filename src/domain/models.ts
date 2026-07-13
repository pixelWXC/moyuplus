export type TypingTabMode = 'replaceLine' | 'completeRest';

export interface EnterBehavior {
  insertNewLine: boolean;
  nextPracticeLine: boolean;
  nextReaderPage: boolean;
}

export interface TypingPracticeSession {
  active: boolean;
  fileId?: string;
  lineIndex: number;
  totalLines: number;
  skipEmptyLines: boolean;
  trimLeadingSpaces: boolean;
  trimTrailingSpaces: boolean;
  ignoreAllSpaces: boolean;
  tabMode: TypingTabMode;
  enterBehavior: EnterBehavior;
}

export interface ShortcutConfig {
  nextPage?: string;
  previousPage?: string;
  closeReader?: string;
  toggleReader?: string;
  switchReaderFile?: string;
  increaseFontSize?: string;
  decreaseFontSize?: string;
  toggleTypingPractice?: string;
  enterRouter?: string;
  tabRouter?: string;
}

export function createDefaultTypingPracticeSession(): TypingPracticeSession {
  return {
    active: false,
    lineIndex: 0,
    totalLines: 0,
    skipEmptyLines: true,
    trimLeadingSpaces: false,
    trimTrailingSpaces: false,
    ignoreAllSpaces: false,
    tabMode: 'completeRest',
    enterBehavior: {
      insertNewLine: true,
      nextPracticeLine: false,
      nextReaderPage: false
    }
  };
}

export function createDefaultShortcutConfig(): ShortcutConfig {
  return {};
}

export function normalizeTypingPracticeSession(value: unknown): TypingPracticeSession {
  const defaults = createDefaultTypingPracticeSession();
  if (!isRecord(value)) {
    return defaults;
  }

  const session: TypingPracticeSession = {
    active: typeof value.active === 'boolean' ? value.active : defaults.active,
    lineIndex: isNonNegativeNumber(value.lineIndex) ? value.lineIndex : defaults.lineIndex,
    totalLines: isNonNegativeNumber(value.totalLines) ? value.totalLines : defaults.totalLines,
    skipEmptyLines: typeof value.skipEmptyLines === 'boolean' ? value.skipEmptyLines : defaults.skipEmptyLines,
    trimLeadingSpaces: typeof value.trimLeadingSpaces === 'boolean' ? value.trimLeadingSpaces : defaults.trimLeadingSpaces,
    trimTrailingSpaces: typeof value.trimTrailingSpaces === 'boolean' ? value.trimTrailingSpaces : defaults.trimTrailingSpaces,
    ignoreAllSpaces: typeof value.ignoreAllSpaces === 'boolean' ? value.ignoreAllSpaces : defaults.ignoreAllSpaces,
    tabMode: isTypingTabMode(value.tabMode) ? value.tabMode : defaults.tabMode,
    enterBehavior: normalizeEnterBehavior(value.enterBehavior)
  };

  if (isNonEmptyString(value.fileId)) {
    session.fileId = value.fileId;
  }

  return session;
}

function normalizeEnterBehavior(value: unknown): EnterBehavior {
  const defaults = createDefaultTypingPracticeSession().enterBehavior;
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    insertNewLine: typeof value.insertNewLine === 'boolean' ? value.insertNewLine : defaults.insertNewLine,
    nextPracticeLine: typeof value.nextPracticeLine === 'boolean' ? value.nextPracticeLine : defaults.nextPracticeLine,
    nextReaderPage: typeof value.nextReaderPage === 'boolean' ? value.nextReaderPage : defaults.nextReaderPage
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTypingTabMode(value: unknown): value is TypingTabMode {
  return value === 'replaceLine' || value === 'completeRest';
}
