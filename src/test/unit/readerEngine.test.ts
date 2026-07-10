import { describe, expect, it } from 'vitest';
import {
  goToNextPage,
  goToNextSection,
  goToPreviousPage,
  goToPreviousSection,
  goToSection,
  mapBookProgressionToLocator,
  mapLocatorToBookProgression,
  openBook,
  reportSectionBoundary,
  type ReaderEngineState,
  type ReaderSection
} from '../../domain/readerEngine';
import type { ReadingPosition } from '../../domain/locators';

const sections: ReaderSection[] = [
  { id: 'one', title: 'One', progressionWeight: 10 },
  { id: 'two', title: 'Two', progressionWeight: 20 },
  { id: 'three', title: 'Three', progressionWeight: 30 }
];

function openAtStart(): ReaderEngineState {
  return openBook({ bookId: 'book-1', format: 'txt', sections }).state;
}

describe('Reader Engine opening and section navigation', () => {
  it('opens the first section or restores an existing logical locator', () => {
    const initial = openBook({ bookId: 'book-1', format: 'txt', sections });
    expect(initial.state.currentSectionIndex).toBe(0);
    expect(initial.state.locator).toEqual({ kind: 'txt', sectionId: 'one', progression: 0 });
    expect(initial.effects).toEqual([
      { type: 'loadSection', sectionId: 'one', locator: initial.state.locator, edge: 'start' }
    ]);

    const position: ReadingPosition = {
      bookId: 'book-1',
      locator: { kind: 'txt', sectionId: 'two', progression: 0.4, offset: 120 },
      bookProgression: 0.3,
      updatedAt: 1
    };
    const restored = openBook({ bookId: 'book-1', format: 'txt', sections, position });
    expect(restored.state.currentSectionIndex).toBe(1);
    expect(restored.state.locator).toEqual(position.locator);
    expect(restored.effects[0]).toMatchObject({ type: 'loadSection', sectionId: 'two', edge: 'locator' });
  });

  it('supports TOC jumps and previous/next section navigation', () => {
    const start = openAtStart();
    const jumped = goToSection(start, 'two');
    expect(jumped.state.currentSectionIndex).toBe(1);
    expect(jumped.effects).toEqual([
      {
        type: 'loadSection',
        sectionId: 'two',
        locator: { kind: 'txt', sectionId: 'two', progression: 0 },
        edge: 'start'
      }
    ]);

    expect(goToNextSection(jumped.state).state.currentSectionIndex).toBe(2);
    const previous = goToPreviousSection(jumped.state);
    expect(previous.state.currentSectionIndex).toBe(0);
    expect(previous.effects[0]).toMatchObject({ type: 'loadSection', sectionId: 'one', edge: 'end' });
  });
});

describe('Reader Engine page and book boundaries', () => {
  it('turns within a section, then loads the next section from its start', () => {
    const start = openAtStart();
    expect(goToNextPage(start).effects).toEqual([{ type: 'turnPage', direction: 'next' }]);

    const atEnd = reportSectionBoundary(start, { atStart: false, atEnd: true });
    const next = goToNextPage(atEnd);
    expect(next.state.currentSectionIndex).toBe(1);
    expect(next.state.locator).toEqual({ kind: 'txt', sectionId: 'two', progression: 0 });
    expect(next.effects[0]).toMatchObject({ type: 'loadSection', sectionId: 'two', edge: 'start' });
  });

  it('keeps the last page and reports bookEnd without throwing', () => {
    const last = goToSection(openAtStart(), 'three').state;
    const atBookEnd = reportSectionBoundary(last, { atStart: false, atEnd: true });
    const result = goToNextPage(atBookEnd);

    expect(result.state.currentSectionIndex).toBe(2);
    expect(result.state.bookBoundary).toBe('bookEnd');
    expect(result.effects).toEqual([{ type: 'showBoundary', boundary: 'bookEnd' }]);
  });

  it('loads the previous section at its end and reports bookStart symmetrically', () => {
    const second = goToSection(openAtStart(), 'two').state;
    const atStart = reportSectionBoundary(second, { atStart: true, atEnd: false });
    const previous = goToPreviousPage(atStart);
    expect(previous.state.currentSectionIndex).toBe(0);
    expect(previous.state.locator).toEqual({ kind: 'txt', sectionId: 'one', progression: 1 });
    expect(previous.effects[0]).toMatchObject({ type: 'loadSection', sectionId: 'one', edge: 'end' });

    const first = reportSectionBoundary(openAtStart(), { atStart: true, atEnd: false });
    expect(goToPreviousPage(first).effects).toEqual([{ type: 'showBoundary', boundary: 'bookStart' }]);
  });

  it('derives all navigation capabilities from the same immutable state', () => {
    const start = openAtStart();
    expect(start.capabilities).toEqual({
      canPreviousPage: false,
      canNextPage: true,
      canPreviousSection: false,
      canNextSection: true
    });
    expect(Object.isFrozen(start)).toBe(true);
    expect(Object.isFrozen(start.capabilities)).toBe(true);

    const end = reportSectionBoundary(goToSection(start, 'three').state, { atStart: false, atEnd: true });
    expect(end.capabilities).toEqual({
      canPreviousPage: true,
      canNextPage: false,
      canPreviousSection: true,
      canNextSection: false
    });
  });
});

describe('Reader Engine whole-book progression', () => {
  const weightedSections: ReaderSection[] = [
    { id: 'long', title: 'Long', progressionWeight: 10 },
    { id: 'empty', title: 'Empty', progressionWeight: 0 },
    { id: 'longer', title: 'Longer', progressionWeight: 30 }
  ];

  it('maps section locators to whole-book progress with a minimum empty-section weight', () => {
    expect(
      mapLocatorToBookProgression(weightedSections, { kind: 'txt', sectionId: 'empty', progression: 0.5 })
    ).toBeCloseTo(10.5 / 41);
  });

  it('maps whole-book progress back to a section locator in either direction', () => {
    expect(mapBookProgressionToLocator(weightedSections, 10.5 / 41, 'txt')).toEqual({
      kind: 'txt',
      sectionId: 'empty',
      progression: 0.5
    });
    expect(mapBookProgressionToLocator(weightedSections, 1, 'epub')).toEqual({
      kind: 'epub',
      sectionId: 'longer',
      progression: 1
    });
  });
});
