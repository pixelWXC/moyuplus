import * as vscode from 'vscode';
import type { BookSource } from '../domain/books';
import type { LibraryService } from '../library/libraryService';

export const IMPORT_BOOK_COMMAND_ID = 'moyuplus.importBook';
export const IMPORT_TXT_ALIAS_COMMAND_ID = 'moyuplus.importTxt';
export const REMOVE_BOOK_COMMAND_ID = 'moyuplus.removeBook';
export const RELOCATE_BOOK_COMMAND_ID = 'moyuplus.relocateBook';

export function registerLibraryCommands(
  context: vscode.ExtensionContext,
  library: Pick<LibraryService, 'importBook' | 'removeBook' | 'relocateBook'>
): void {
  const importBook = async () => {
    const selected = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { Books: ['txt', 'epub'] },
      openLabel: 'Import Book'
    });
    const uri = selected?.[0];
    if (!uri) return undefined;
    try {
      return await library.importBook(uri.toString(), sourceOf(uri));
    } catch (error) {
      await vscode.window.showErrorMessage(messageOf(error));
      return undefined;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(IMPORT_BOOK_COMMAND_ID, importBook),
    vscode.commands.registerCommand(IMPORT_TXT_ALIAS_COMMAND_ID, importBook),
    vscode.commands.registerCommand(REMOVE_BOOK_COMMAND_ID, async (bookId: string) => {
      if (typeof bookId !== 'string' || bookId.length === 0) return undefined;
      await library.removeBook(bookId);
      return undefined;
    }),
    vscode.commands.registerCommand(RELOCATE_BOOK_COMMAND_ID, async (bookId: string) => {
      if (typeof bookId !== 'string' || bookId.length === 0) return undefined;
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Relocate Book' });
      const uri = selected?.[0];
      return uri ? library.relocateBook(bookId, uri.toString()) : undefined;
    })
  );
}

function sourceOf(uri: vscode.Uri): BookSource {
  const value = uri.toString();
  return vscode.workspace.workspaceFolders?.some((folder) => {
    const root = folder.uri.toString().replace(/\/$/, '');
    return value === root || value.startsWith(`${root}/`);
  }) ? 'workspace' : 'external';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Book operation failed.';
}
