import { describe, expect, it } from 'vitest';
import type {
  PracticeSessionState,
  PracticeSnapshot
} from '../../typing';
import {
  InMemoryPracticeSessionStore,
  InMemoryPracticeSnapshotStore,
  ManualTypingClock,
  SequenceTypingIdGenerator
} from '../typing/helpers/inMemoryTypingPorts';

describe('typing application test doubles', () => {
  it('offers a manually advanced wall and monotonic clock', () => {
    const clock = new ManualTypingClock(1_000, 50);

    clock.advance(250);

    expect(clock.wallNow()).toBe(1_250);
    expect(clock.monotonicNow()).toBe(300);
  });

  it('generates stable per-entity sequences', () => {
    const ids = new SequenceTypingIdGenerator('test');

    expect(ids.next('session')).toBe('test-session-1');
    expect(ids.next('snapshot')).toBe('test-snapshot-1');
    expect(ids.next('session')).toBe('test-session-2');
  });

  it('round-trips snapshots and sessions without exposing mutable stored values', async () => {
    const snapshots = new InMemoryPracticeSnapshotStore();
    const sessions = new InMemoryPracticeSessionStore();
    const snapshot = {
      schemaVersion: 1,
      id: 'snapshot-1',
      sourceRevision: 'r1',
      plan: {
        contentRecipe: { kind: 'adHoc', text: 'a' },
        completion: { kind: 'free' },
        evaluation: { errorPolicy: 'block' },
        textPolicy: {
          punctuation: { mode: 'strict', mappingVersion: 'strict-v1' },
          whitespace: { mode: 'strict' },
          caseSensitive: true
        },
        flowPolicy: { lineAdvance: 'automatic', presentation: 'continuous' },
        displayPolicy: { showLiveMetrics: true, showWhitespace: false }
      },
      targetUnits: [{ index: 0, value: 'a', display: 'a', kind: 'grapheme', lineIndex: 0 }],
      displayLines: [{ index: 0, text: 'a', targetStart: 0, targetEnd: 1 }],
      selectedRange: { kind: 'selection', start: 0, end: 1 },
      createdAt: 1
    } satisfies PracticeSnapshot;
    const session = {
      schemaVersion: 1,
      id: 'session-1',
      snapshotId: snapshot.id,
      attemptId: 'attempt-1',
      status: 'ready',
      targetIndex: 0,
      blockedInputCount: 0,
      correctionCounts: {
        backspace: 0,
        delete: 0,
        undo: 0,
        redo: 0,
        selectionDelete: 0,
        other: 0
      },
      createdAt: 1,
      updatedAt: 1
    } satisfies PracticeSessionState;

    await snapshots.save(snapshot);
    await sessions.save(session);
    const loadedSnapshot = await snapshots.get(snapshot.id);
    const loadedSession = await sessions.get(session.id);
    loadedSnapshot!.targetUnits[0].value = 'changed';
    loadedSession!.targetIndex = 99;

    expect((await snapshots.get(snapshot.id))?.targetUnits[0].value).toBe('a');
    expect((await sessions.get(session.id))?.targetIndex).toBe(0);
  });
});
