export type TxtEncoding = 'utf8' | 'gbk';
export type TxtFileSource = 'workspace' | 'external';

export interface ImportedTxtFile {
  id: string;
  name: string;
  uri: string;
  encoding: TxtEncoding;
  source: TxtFileSource;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
}

export interface PageRange {
  startOffset: number;
  endOffset: number;
}

export interface ReaderViewportSnapshot {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
}

export interface ReaderSession {
  active: boolean;
  fileId?: string;
  offset: number;
  approximatePercent: number;
  fontSize: number;
  lineHeight: number;
  viewportSnapshot?: ReaderViewportSnapshot;
  pageHistory: PageRange[];
}

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

export function createDefaultReaderSession(): ReaderSession {
  return {
    active: false,
    offset: 0,
    approximatePercent: 0,
    fontSize: 16,
    lineHeight: 1.6,
    pageHistory: []
  };
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

export function normalizeImportedTxtFile(value: unknown): ImportedTxtFile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.uri) ||
    !isTxtEncoding(value.encoding) ||
    !isTxtFileSource(value.source) ||
    !isNonNegativeNumber(value.createdAt) ||
    !isNonNegativeNumber(value.updatedAt)
  ) {
    return undefined;
  }

  const file: ImportedTxtFile = {
    id: value.id,
    name: value.name,
    uri: value.uri,
    encoding: value.encoding,
    source: value.source,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };

  if (isNonNegativeNumber(value.lastOpenedAt)) {
    file.lastOpenedAt = value.lastOpenedAt;
  }

  return file;
}

export function normalizeReaderSession(value: unknown): ReaderSession {
  const defaults = createDefaultReaderSession();
  if (!isRecord(value)) {
    return defaults;
  }

  const session: ReaderSession = {
    active: typeof value.active === 'boolean' ? value.active : defaults.active,
    offset: isNonNegativeNumber(value.offset) ? value.offset : defaults.offset,
    approximatePercent: isPercent(value.approximatePercent) ? value.approximatePercent : defaults.approximatePercent,
    fontSize: isPositiveNumber(value.fontSize) ? value.fontSize : defaults.fontSize,
    lineHeight: isPositiveNumber(value.lineHeight) ? value.lineHeight : defaults.lineHeight,
    pageHistory: normalizePageHistory(value.pageHistory)
  };

  if (isNonEmptyString(value.fileId)) {
    session.fileId = value.fileId;
  }

  const viewportSnapshot = normalizeViewportSnapshot(value.viewportSnapshot);
  if (viewportSnapshot) {
    session.viewportSnapshot = viewportSnapshot;
  }

  return session;
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

function normalizePageHistory(value: unknown): PageRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      isRecord(entry) &&
      isNonNegativeNumber(entry.startOffset) &&
      isNonNegativeNumber(entry.endOffset) &&
      entry.startOffset <= entry.endOffset
    ) {
      return [{ startOffset: entry.startOffset, endOffset: entry.endOffset }];
    }

    return [];
  });
}

function normalizeViewportSnapshot(value: unknown): ReaderViewportSnapshot | undefined {
  if (
    isRecord(value) &&
    isPositiveNumber(value.width) &&
    isPositiveNumber(value.height) &&
    isPositiveNumber(value.fontSize) &&
    isPositiveNumber(value.lineHeight)
  ) {
    return {
      width: value.width,
      height: value.height,
      fontSize: value.fontSize,
      lineHeight: value.lineHeight
    };
  }

  return undefined;
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

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPercent(value: unknown): value is number {
  return isNonNegativeNumber(value) && value <= 1;
}

function isTxtEncoding(value: unknown): value is TxtEncoding {
  return value === 'utf8' || value === 'gbk';
}

function isTxtFileSource(value: unknown): value is TxtFileSource {
  return value === 'workspace' || value === 'external';
}

function isTypingTabMode(value: unknown): value is TypingTabMode {
  return value === 'replaceLine' || value === 'completeRest';
}
