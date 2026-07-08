import * as vscode from 'vscode';
import {
  CHECK_IMPORTED_TXT_COMMAND_ID,
  IMPORT_TXT_COMMAND_ID,
  registerTxtCommands,
  REMOVE_IMPORTED_TXT_COMMAND_ID
} from './commands/txtCommands';
import { READER_VIEW_ID, registerReaderView } from './reader/ReaderViewProvider';
import { TxtLibraryStore } from './storage/txtLibraryStore';
import { WorkspaceSessionStore } from './storage/workspaceSessionStore';
import { TxtFileService } from './txt/txtFileService';

export const SMOKE_COMMAND_ID = 'moyuplus.smokeTest';
export const SMOKE_MESSAGE = 'MoyuPlus extension is active.';
export { CHECK_IMPORTED_TXT_COMMAND_ID, IMPORT_TXT_COMMAND_ID, READER_VIEW_ID, REMOVE_IMPORTED_TXT_COMMAND_ID };

export function registerSmokeCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(SMOKE_COMMAND_ID, async () => {
    await vscode.window.showInformationMessage(SMOKE_MESSAGE);
    return SMOKE_MESSAGE;
  });

  context.subscriptions.push(disposable);
}

export function activate(context: vscode.ExtensionContext): void {
  const txtLibraryStore = new TxtLibraryStore(context.globalState);
  const sessionStore = new WorkspaceSessionStore(context.workspaceState);
  const txtFileService = new TxtFileService(txtLibraryStore);

  registerSmokeCommand(context);
  registerTxtCommands(context, txtFileService);
  registerReaderView(context, txtFileService, sessionStore);
}

export function deactivate(): void {}
