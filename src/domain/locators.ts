export interface LocatorBase {
  sectionId: string;
  progression: number;
}

export type TxtLocator = LocatorBase & { kind: 'txt'; offset?: number; offsetSpace?: 'book' };
export type EpubLocator = LocatorBase & {
  kind: 'epub';
  cfi?: string;
  fragment?: string;
  textOffset?: number;
  immersiveOffset?: number;
  sourceRevision?: string;
  projectionRevision?: string;
};
export type ReadingLocator = TxtLocator | EpubLocator;

export interface ReadingPosition {
  bookId: string;
  locator: ReadingLocator;
  bookProgression: number;
  updatedAt: number;
}

export function normalizeReadingLocator(value: unknown): ReadingLocator | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.sectionId)) {
    return undefined;
  }

  const base: LocatorBase = {
    sectionId: value.sectionId,
    progression: normalizeProgression(value.progression)
  };

  if (value.kind === 'txt') {
    const locator: TxtLocator = { kind: 'txt', ...base };
    if (isNonNegativeFiniteNumber(value.offset)) {
      locator.offset = Math.trunc(value.offset);
    }
    if (value.offsetSpace === 'book') locator.offsetSpace = 'book';
    return locator;
  }

  if (value.kind === 'epub') {
    const locator: EpubLocator = { kind: 'epub', ...base };
    if (isNonEmptyString(value.cfi)) {
      locator.cfi = value.cfi;
    }
    if (isNonEmptyString(value.fragment)) {
      locator.fragment = value.fragment;
    }
    if (isNonNegativeFiniteNumber(value.textOffset)) {
      locator.textOffset = Math.trunc(value.textOffset);
    }
    if (isNonNegativeFiniteNumber(value.immersiveOffset)) {
      locator.immersiveOffset = Math.trunc(value.immersiveOffset);
    }
    if (isNonEmptyString(value.sourceRevision)) {
      locator.sourceRevision = value.sourceRevision;
    }
    if (isNonEmptyString(value.projectionRevision)) {
      locator.projectionRevision = value.projectionRevision;
    }
    return locator;
  }

  return undefined;
}

export function normalizeReadingPosition(value: unknown): ReadingPosition | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.bookId) || !isNonNegativeFiniteNumber(value.updatedAt)) {
    return undefined;
  }
  const locator = normalizeReadingLocator(value.locator);
  if (!locator) {
    return undefined;
  }

  return {
    bookId: value.bookId,
    locator,
    bookProgression: normalizeProgression(value.bookProgression),
    updatedAt: value.updatedAt
  };
}

export function normalizeProgression(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
