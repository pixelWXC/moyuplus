import { describe, expect, it } from 'vitest';
import { ReaderNavigationHistory, type ReaderHistoryLocation } from '../../webview/readerNavigationHistory';

function location(index: number): ReaderHistoryLocation {
  return {
    sectionId: `section-${index}`,
    textOffset: index,
    progression: index / 100,
    sourceRevision: `revision-${index}`
  };
}

describe('ReaderNavigationHistory', () => {
  it('keeps at most 50 distinct consecutive locations in LIFO order', () => {
    const history = new ReaderNavigationHistory();
    for (let index = 0; index < 52; index += 1) history.push(location(index));
    history.push(location(51));

    expect(history.size).toBe(50);
    expect(history.pop()).toEqual(location(51));
    expect(history.pop()).toEqual(location(50));
    for (let index = 0; index < 48; index += 1) history.pop();
    expect(history.pop()).toBeUndefined();
  });

  it('returns defensive copies and clears the current book session', () => {
    const history = new ReaderNavigationHistory();
    const first = { ...location(1), fragment: 'note-1' };
    history.push(first);
    first.textOffset = 999;

    expect(history.pop()).toEqual({ ...location(1), fragment: 'note-1' });
    history.push(location(2));
    history.clear();
    expect(history.size).toBe(0);
    expect(history.canUndo).toBe(false);
  });
});
