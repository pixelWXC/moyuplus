import * as vscode from 'vscode';
import { CHECK_IMPORTED_TXT_COMMAND_ID, IMPORT_TXT_COMMAND_ID, REMOVE_IMPORTED_TXT_COMMAND_ID } from './commands/txtCommands';
import {
  registerShortcutRouter,
  ROUTE_ENTER_COMMAND_ID,
  ROUTE_TAB_COMMAND_ID
} from './commands/shortcutRouter';
import { READER_VIEW_ID, registerReaderView } from './reader/ReaderViewProvider';
import { WorkspaceSessionStore } from './storage/workspaceSessionStore';
import { TypingPracticeController } from './typing/TypingPracticeController';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
  registerTypingPractice
} from './typing/typingPracticeCommands';
import { BookLibraryStore } from './storage/bookLibraryStore';
import { TxtAdapter } from './adapters/txt/txtAdapter';
import { TypingSourceCatalog } from './typing/typingSourceCatalog';
import { AdapterRegistry } from './adapters/adapterRegistry';
import { EpubAdapter } from './adapters/epub/epubAdapter';
import { ReadingProgressStore } from './storage/readingProgressStore';
import { LibraryService } from './library/libraryService';
import { ReaderController } from './reader/readerController';
import { migrateV1ToV2 } from './storage/migrations/migrateV1ToV2';
import {
  IMPORT_BOOK_COMMAND_ID,
  RELOCATE_BOOK_COMMAND_ID,
  REMOVE_BOOK_COMMAND_ID,
  registerLibraryCommands
} from './commands/libraryCommands';

export const SMOKE_COMMAND_ID = 'moyuplus.smokeTest';
export const SMOKE_MESSAGE = 'MoyuPlus extension is active.';
export { CHECK_IMPORTED_TXT_COMMAND_ID, IMPORT_TXT_COMMAND_ID, READER_VIEW_ID, REMOVE_IMPORTED_TXT_COMMAND_ID };
export { IMPORT_BOOK_COMMAND_ID, REMOVE_BOOK_COMMAND_ID, RELOCATE_BOOK_COMMAND_ID };
export { ROUTE_ENTER_COMMAND_ID, ROUTE_TAB_COMMAND_ID };
export {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
};

export function registerSmokeCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(SMOKE_COMMAND_ID, async () => {
    await vscode.window.showInformationMessage(SMOKE_MESSAGE);
    return SMOKE_MESSAGE;
  });

  context.subscriptions.push(disposable);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    await migrateV1ToV2(context.globalState, context.workspaceState);
  } catch (error) {
    console.error('MoyuPlus Reader v2 migration failed; activation will continue.', error instanceof Error ? error.message : 'Unknown error');
  }

  const sessionStore = new WorkspaceSessionStore(context.workspaceState);
  const books = new BookLibraryStore(context.globalState);
  const progress = new ReadingProgressStore(context.globalState);
  const txtAdapter = new TxtAdapter();
  const adapters = new AdapterRegistry([txtAdapter, new EpubAdapter()]);
  const typingSources = new TypingSourceCatalog(books, txtAdapter);
  const typingPracticeController = new TypingPracticeController(typingSources, sessionStore);
  const library = new LibraryService(books, progress, adapters, {
    clearTyping: async (bookId) => {
      const session = sessionStore.getTypingPracticeSession();
      if (session.fileId === bookId) await typingPracticeController.stop();
    }
  });
  let readerViewProvider: ReturnType<typeof registerReaderView> | undefined;
  const readerController = new ReaderController(books, progress, adapters, async (message) => {
    await readerViewProvider?.postMessage(message);
  });

  registerSmokeCommand(context);
  registerLibraryCommands(context, library);
  readerViewProvider = registerReaderView(context, readerController);
  registerTypingPractice(context, typingPracticeController);
  registerShortcutRouter(context, typingPracticeController, readerViewProvider);
}

export function deactivate(): void {}
