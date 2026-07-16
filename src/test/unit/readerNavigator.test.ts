import { describe, expect, it, vi } from 'vitest';
import { ReaderNavigator } from '../../webview/readerNavigator';
import type { ReaderHistoryLocation } from '../../webview/readerNavigationHistory';

function location(sectionId: string, textOffset: number): ReaderHistoryLocation {
  return { sectionId, textOffset, progression: textOffset / 100, sourceRevision: `rev-${sectionId}` };
}

describe('ReaderNavigator', () => {
  it('commits only successful position changes and never records a failed target', () => {
    const navigator = new ReaderNavigator();
    const start = location('chapter-1', 10);

    expect(navigator.commit(start, start)).toBe(false);
    expect(navigator.commit(start, location('chapter-1', 40))).toBe(true);
    expect(navigator.canUndo).toBe(true);
    expect(navigator.historySize).toBe(1);
  });

  it('restores in LIFO order without pushing the current location and skips invalid entries', async () => {
    const navigator = new ReaderNavigator();
    const first = location('chapter-1', 10);
    const second = location('chapter-2', 20);
    navigator.commit(first, second);
    navigator.commit(second, location('chapter-3', 30));
    const restore = vi.fn(async (target: ReaderHistoryLocation) => target.sectionId === 'chapter-1');

    await expect(navigator.undo(restore)).resolves.toBe(true);
    expect(restore.mock.calls.map(([target]) => target.sectionId)).toEqual(['chapter-2', 'chapter-1']);
    expect(navigator.canUndo).toBe(false);
  });

  it('clears all history when the reader session changes', () => {
    const navigator = new ReaderNavigator();
    navigator.commit(location('chapter-1', 0), location('chapter-1', 10));
    navigator.clear();
    expect(navigator.canUndo).toBe(false);
    expect(navigator.historySize).toBe(0);
  });
});
