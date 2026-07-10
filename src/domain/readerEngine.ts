import type { BookFormat } from './books';
import { normalizeProgression, type ReadingLocator, type ReadingPosition } from './locators';

export interface ReaderSection {
  readonly id: string;
  readonly title: string;
  readonly progressionWeight: number;
}

export interface SectionBoundary {
  readonly atStart: boolean;
  readonly atEnd: boolean;
  readonly locator?: ReadingLocator;
}

export interface ReaderCapabilities {
  readonly canPreviousPage: boolean;
  readonly canNextPage: boolean;
  readonly canPreviousSection: boolean;
  readonly canNextSection: boolean;
}

export type BookBoundary = 'bookStart' | 'bookEnd';

export interface ReaderEngineState {
  readonly bookId: string;
  readonly format: BookFormat;
  readonly sections: readonly ReaderSection[];
  readonly currentSectionIndex: number;
  readonly locator: ReadingLocator;
  readonly sectionBoundary: SectionBoundary;
  readonly bookBoundary?: BookBoundary;
  readonly capabilities: ReaderCapabilities;
}

export type ReaderEffect =
  | { readonly type: 'turnPage'; readonly direction: 'previous' | 'next' }
  | {
      readonly type: 'loadSection';
      readonly sectionId: string;
      readonly locator: ReadingLocator;
      readonly edge: 'start' | 'end' | 'locator';
    }
  | { readonly type: 'showBoundary'; readonly boundary: BookBoundary };

export interface ReaderTransition {
  readonly state: ReaderEngineState;
  readonly effects: readonly ReaderEffect[];
}

export interface OpenBookRequest {
  readonly bookId: string;
  readonly format: BookFormat;
  readonly sections: readonly ReaderSection[];
  readonly position?: ReadingPosition;
}

export function openBook(request: OpenBookRequest): ReaderTransition {
  validateOpenRequest(request);
  const sections = freezeSections(request.sections);
  const restoredLocator = selectInitialLocator(request, sections);
  const currentSectionIndex = sections.findIndex((section) => section.id === restoredLocator.sectionId);
  const edge = request.position ? 'locator' : 'start';
  const state = createState({
    bookId: request.bookId,
    format: request.format,
    sections,
    currentSectionIndex,
    locator: restoredLocator,
    sectionBoundary: {
      atStart: restoredLocator.progression === 0,
      atEnd: restoredLocator.progression === 1
    }
  });

  return createTransition(state, [
    { type: 'loadSection', sectionId: restoredLocator.sectionId, locator: restoredLocator, edge }
  ]);
}

export function reportSectionBoundary(state: ReaderEngineState, boundary: SectionBoundary): ReaderEngineState {
  const locator = isCurrentLocator(state, boundary.locator)
    ? boundary.locator
    : createLocator(
        state.format,
        state.locator.sectionId,
        boundary.atStart ? 0 : boundary.atEnd ? 1 : state.locator.progression,
        state.locator
      );

  return createState({
    ...state,
    locator,
    sectionBoundary: { atStart: boundary.atStart, atEnd: boundary.atEnd }
  });
}

export function goToSection(state: ReaderEngineState, sectionId: string): ReaderTransition {
  const sectionIndex = state.sections.findIndex((section) => section.id === sectionId);
  return sectionIndex < 0 ? createTransition(state, []) : moveToSection(state, sectionIndex, 'start');
}

export function goToNextSection(state: ReaderEngineState): ReaderTransition {
  if (!state.capabilities.canNextSection) {
    return createTransition(state, [{ type: 'showBoundary', boundary: 'bookEnd' }]);
  }
  return moveToSection(state, state.currentSectionIndex + 1, 'start');
}

export function goToPreviousSection(state: ReaderEngineState): ReaderTransition {
  if (!state.capabilities.canPreviousSection) {
    return createTransition(state, [{ type: 'showBoundary', boundary: 'bookStart' }]);
  }
  return moveToSection(state, state.currentSectionIndex - 1, 'end');
}

export function goToNextPage(state: ReaderEngineState): ReaderTransition {
  if (!state.sectionBoundary.atEnd) {
    return createTransition(state, [{ type: 'turnPage', direction: 'next' }]);
  }
  if (state.capabilities.canNextSection) {
    return moveToSection(state, state.currentSectionIndex + 1, 'start');
  }
  return createTransition(state, [{ type: 'showBoundary', boundary: 'bookEnd' }]);
}

export function goToPreviousPage(state: ReaderEngineState): ReaderTransition {
  if (!state.sectionBoundary.atStart) {
    return createTransition(state, [{ type: 'turnPage', direction: 'previous' }]);
  }
  if (state.capabilities.canPreviousSection) {
    return moveToSection(state, state.currentSectionIndex - 1, 'end');
  }
  return createTransition(state, [{ type: 'showBoundary', boundary: 'bookStart' }]);
}

export function mapLocatorToBookProgression(sections: readonly ReaderSection[], locator: ReadingLocator): number {
  const sectionIndex = sections.findIndex((section) => section.id === locator.sectionId);
  if (sectionIndex < 0 || sections.length === 0) {
    return 0;
  }
  const weights = sections.map(effectiveWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const precedingWeight = weights.slice(0, sectionIndex).reduce((sum, weight) => sum + weight, 0);
  return normalizeProgression((precedingWeight + weights[sectionIndex] * normalizeProgression(locator.progression)) / totalWeight);
}

export function mapBookProgressionToLocator(
  sections: readonly ReaderSection[],
  bookProgression: number,
  format: BookFormat
): ReadingLocator {
  if (sections.length === 0) {
    throw new Error('Reader Engine requires at least one section.');
  }
  const progression = normalizeProgression(bookProgression);
  if (progression === 1) {
    return createLocator(format, sections[sections.length - 1].id, 1);
  }

  const weights = sections.map(effectiveWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const targetWeight = progression * totalWeight;
  let precedingWeight = 0;
  for (let index = 0; index < sections.length; index += 1) {
    const sectionWeight = weights[index];
    if (targetWeight < precedingWeight + sectionWeight || index === sections.length - 1) {
      return createLocator(format, sections[index].id, (targetWeight - precedingWeight) / sectionWeight);
    }
    precedingWeight += sectionWeight;
  }

  return createLocator(format, sections[sections.length - 1].id, 1);
}

function moveToSection(
  state: ReaderEngineState,
  sectionIndex: number,
  edge: 'start' | 'end'
): ReaderTransition {
  const section = state.sections[sectionIndex];
  const locator = createLocator(state.format, section.id, edge === 'start' ? 0 : 1);
  const nextState = createState({
    ...state,
    currentSectionIndex: sectionIndex,
    locator,
    sectionBoundary: { atStart: edge === 'start', atEnd: edge === 'end' }
  });
  return createTransition(nextState, [{ type: 'loadSection', sectionId: section.id, locator, edge }]);
}

function selectInitialLocator(request: OpenBookRequest, sections: readonly ReaderSection[]): ReadingLocator {
  const position = request.position;
  if (position && position.bookId === request.bookId && locatorMatchesFormat(position.locator, request.format)) {
    if (sections.some((section) => section.id === position.locator.sectionId)) {
      return freezeLocator(position.locator);
    }
    return freezeLocator(mapBookProgressionToLocator(sections, position.bookProgression, request.format));
  }
  return freezeLocator(createLocator(request.format, sections[0].id, 0));
}

function createState(
  value: Omit<ReaderEngineState, 'capabilities' | 'bookBoundary'> & { readonly bookBoundary?: BookBoundary }
): ReaderEngineState {
  const sectionBoundary = Object.freeze({
    atStart: value.sectionBoundary.atStart,
    atEnd: value.sectionBoundary.atEnd
  });
  const lastSectionIndex = value.sections.length - 1;
  const bookBoundary =
    sectionBoundary.atStart && value.currentSectionIndex === 0
      ? 'bookStart'
      : sectionBoundary.atEnd && value.currentSectionIndex === lastSectionIndex
        ? 'bookEnd'
        : undefined;
  const capabilities = Object.freeze({
    canPreviousPage: !sectionBoundary.atStart || value.currentSectionIndex > 0,
    canNextPage: !sectionBoundary.atEnd || value.currentSectionIndex < lastSectionIndex,
    canPreviousSection: value.currentSectionIndex > 0,
    canNextSection: value.currentSectionIndex < lastSectionIndex
  });

  return Object.freeze({
    bookId: value.bookId,
    format: value.format,
    sections: value.sections,
    currentSectionIndex: value.currentSectionIndex,
    locator: freezeLocator(value.locator),
    sectionBoundary,
    bookBoundary,
    capabilities
  });
}

function createTransition(state: ReaderEngineState, effects: readonly ReaderEffect[]): ReaderTransition {
  return Object.freeze({
    state,
    effects: Object.freeze(effects.map((effect) => Object.freeze(effect)))
  });
}

function createLocator(
  format: BookFormat,
  sectionId: string,
  progression: number,
  existing?: ReadingLocator
): ReadingLocator {
  const normalizedProgression = normalizeProgression(progression);
  if (format === 'txt') {
    return {
      kind: 'txt',
      sectionId,
      progression: normalizedProgression,
      ...(existing?.kind === 'txt' && existing.offset !== undefined ? { offset: existing.offset } : {})
    };
  }
  return {
    kind: 'epub',
    sectionId,
    progression: normalizedProgression,
    ...(existing?.kind === 'epub' && existing.cfi ? { cfi: existing.cfi } : {}),
    ...(existing?.kind === 'epub' && existing.fragment ? { fragment: existing.fragment } : {})
  };
}

function freezeLocator(locator: ReadingLocator): ReadingLocator {
  return Object.freeze({ ...locator });
}

function freezeSections(sections: readonly ReaderSection[]): readonly ReaderSection[] {
  return Object.freeze(
    sections.map((section) =>
      Object.freeze({ id: section.id, title: section.title, progressionWeight: section.progressionWeight })
    )
  );
}

function validateOpenRequest(request: OpenBookRequest): void {
  if (request.bookId.trim().length === 0 || request.sections.length === 0) {
    throw new Error('Reader Engine requires a book ID and at least one section.');
  }
  const ids = new Set<string>();
  for (const section of request.sections) {
    if (section.id.trim().length === 0 || ids.has(section.id)) {
      throw new Error('Reader Engine section IDs must be non-empty and unique.');
    }
    ids.add(section.id);
  }
}

function locatorMatchesFormat(locator: ReadingLocator, format: BookFormat): boolean {
  return locator.kind === format;
}

function isCurrentLocator(state: ReaderEngineState, locator: ReadingLocator | undefined): locator is ReadingLocator {
  return locator !== undefined && locator.kind === state.format && locator.sectionId === state.locator.sectionId;
}

function effectiveWeight(section: ReaderSection): number {
  return Number.isFinite(section.progressionWeight) ? Math.max(1, section.progressionWeight) : 1;
}
