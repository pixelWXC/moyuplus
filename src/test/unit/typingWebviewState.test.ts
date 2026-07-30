import { describe, expect, it } from 'vitest';
import {
  createTypingViewState,
  reduceTypingViewMessage
} from '../../webview/typingState';
import {
  TYPING_VIEW_PRIMARY_PAGES,
  TYPING_VIEW_PROTOCOL_VERSION
} from '../../typing/adapters/view';

describe('Typing Webview state', () => {
  it('starts on materials with no leaked metrics or session state', () => {
    expect(createTypingViewState('typing-view-1')).toEqual({
      instanceId: 'typing-view-1',
      activePage: 'materials',
      availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
      activeSessionStatus: null,
      pendingResultCount: 0,
      recovery: null,
      legacyResumeHint: null,
      content: null,
      snapshotRevision: 0
    });
  });

  it('accepts only newer snapshots for the current Webview instance', () => {
    const initial = createTypingViewState('typing-view-1');
    const current = reduceTypingViewMessage(initial, {
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'shellSnapshot',
      snapshotRevision: 2,
      snapshot: {
        activePage: 'live',
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus: 'running',
        pendingResultCount: 1,
        recovery: {
          status: 'paused',
          savedAt: 2_000,
          completedUnits: 4,
          totalUnits: 10
        },
        content: {
          kind: 'unavailable',
          page: 'live'
        }
      }
    });

    expect(current).toEqual(expect.objectContaining({
      activePage: 'live',
      activeSessionStatus: 'running',
      pendingResultCount: 1,
      recovery: {
        status: 'paused',
        savedAt: 2_000,
        completedUnits: 4,
        totalUnits: 10
      },
      content: {
        kind: 'unavailable',
        page: 'live'
      },
      snapshotRevision: 2
    }));
    expect(reduceTypingViewMessage(current, {
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'shellSnapshot',
      snapshotRevision: 1,
      snapshot: {
        activePage: 'history',
        availablePages: ['history'],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'unavailable',
          page: 'history'
        }
      }
    })).toBe(current);
    expect(reduceTypingViewMessage(current, {
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-2',
      type: 'shellSnapshot',
      snapshotRevision: 3,
      snapshot: {
        activePage: 'mastery',
        availablePages: ['mastery'],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'unavailable',
          page: 'mastery'
        }
      }
    })).toBe(current);
  });
});
