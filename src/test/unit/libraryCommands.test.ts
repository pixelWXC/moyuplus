import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMPORT_BOOK_COMMAND_ID,
  RELOCATE_BOOK_COMMAND_ID,
  REMOVE_BOOK_COMMAND_ID,
  registerLibraryCommands
} from '../../commands/libraryCommands';
import { commands, resetVSCodeShim, Uri, window, workspace, type Disposable } from '../shims/vscode';

beforeEach(() => resetVSCodeShim());

describe('Reader v2 library commands', () => {
  it('registers only v2 library commands', async () => {
    const service = { importBook: vi.fn(), removeBook: vi.fn(), relocateBook: vi.fn() };
    const context = { subscriptions: [] as Disposable[] };
    registerLibraryCommands(context as never, service as never);

    expect(commands.registeredCommandIds()).toEqual([
      IMPORT_BOOK_COMMAND_ID,
      REMOVE_BOOK_COMMAND_ID,
      RELOCATE_BOOK_COMMAND_ID
    ]);

    window.openDialogResult = [Uri.file('/books/legacy.txt')];
    workspace.workspaceFolders = [{ uri: Uri.file('/books') }];
    await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);
    expect(service.importBook).toHaveBeenCalledWith(expect.stringContaining('legacy.txt'), 'workspace');
  });

  it('imports either TXT or EPUB and derives whether the file is in the workspace', async () => {
    const service = { importBook: vi.fn().mockResolvedValue({ id: 'book-1' }), removeBook: vi.fn(), relocateBook: vi.fn() };
    registerLibraryCommands({ subscriptions: [] } as never, service as never);
    workspace.workspaceFolders = [{ uri: Uri.file('/workspace') }];
    window.openDialogResult = [Uri.file('/outside/book.epub')];

    await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);

    expect(service.importBook).toHaveBeenCalledWith(expect.stringContaining('book.epub'), 'external');
  });
});
