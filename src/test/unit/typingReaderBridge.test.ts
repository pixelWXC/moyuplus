import { describe, expect, it, vi } from 'vitest';
import { commands, createWebviewView, Uri } from '../shims/vscode';
import { PracticeSetupDraft } from '../../typing/application';
import {
  ReaderTypingEntryPoint
} from '../../typing/adapters/reader/ReaderTypingEntryPoint';
import {
  TYPING_VIEW_ID,
  TYPING_VIEW_PAGES,
  TYPING_VIEW_PROTOCOL_VERSION,
  TypingViewProvider,
  type TypingViewPage,
  type TypingViewShellSnapshot
} from '../../typing/adapters/view';

describe('Reader Typing Bridge', () => {
  it('narrows a Reader locator to a suggested chapter before opening setup', async () => {
    const draft = new PracticeSetupDraft();
    const openSetup = vi.fn(async () => undefined);
    const entryPoint = new ReaderTypingEntryPoint(draft, { openSetup });

    await entryPoint.openFromBook('book-1', {
      kind: 'epub',
      sectionId: 'chapter-2',
      progression: 0.42,
      cfi: 'epubcfi(/6/4)'
    });

    expect(draft.snapshot()).toEqual({
      contentRecipe: {
        kind: 'readerBook',
        bookId: 'book-1',
        suggestedSectionId: 'chapter-2'
      },
      selectedRange: {
        kind: 'chapter',
        chapterId: 'chapter-2'
      }
    });
    expect(openSetup).toHaveBeenCalledTimes(1);
  });

  it('keeps an unavailable source out of Typing state and asks Reader to relocate it', async () => {
    const draft = new PracticeSetupDraft();
    const openSetup = vi.fn(async () => undefined);
    const reportUnavailable = vi.fn(async () => undefined);
    const requestRelocation = vi.fn(async () => undefined);
    const entryPoint = new ReaderTypingEntryPoint(
      draft,
      { openSetup },
      {
        isAvailable: async () => false,
        reportUnavailable,
        requestRelocation
      }
    );

    await entryPoint.openFromBook('missing-book', {
      kind: 'txt',
      sectionId: 'txt:1',
      progression: 0.5,
      offset: 42,
      offsetSpace: 'book'
    });

    expect(draft.snapshot()).toBeUndefined();
    expect(openSetup).not.toHaveBeenCalled();
    expect(reportUnavailable).toHaveBeenCalledWith('missing-book');
    expect(requestRelocation).toHaveBeenCalledWith('missing-book');
  });

  it('focuses the Typing View and refreshes an existing instance directly to setup', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-reader-bridge',
      type: 'typingReady'
    });

    await provider.openPage('setup');

    expect(commands.executedBuiltinCommands()).toContainEqual({
      commandId: `${TYPING_VIEW_ID}.focus`,
      args: []
    });
    expect(query.shellSnapshot.mock.calls).toEqual([
      ['materials'],
      ['setup']
    ]);
    expect(view.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: snapshot('setup')
      })
    );
  });

  it('preserves the requested setup page across a cold Typing View bootstrap', async () => {
    const query = {
      shellSnapshot: vi.fn(async (page: TypingViewPage) => snapshot(page))
    };
    const provider = new TypingViewProvider(Uri.file('/extension'), query);

    await provider.openPage('setup');

    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-reader-cold-start',
      type: 'typingReady'
    });

    expect(query.shellSnapshot).toHaveBeenCalledWith('setup');
    expect(view.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: snapshot('setup')
      })
    );
  });
});

function snapshot(activePage: TypingViewPage): TypingViewShellSnapshot {
  return {
    activePage,
    availablePages: [...TYPING_VIEW_PAGES],
    activeSessionStatus: null,
    pendingResultCount: 0,
    recovery: null,
    content: {
      kind: 'unavailable',
      page: activePage
    }
  };
}
