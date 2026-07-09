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
import { TypingPracticeController } from './typing/TypingPracticeController';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
  registerTypingPractice
} from './typing/typingPracticeCommands';
import { TxtFileService } from './txt/txtFileService';

export const SMOKE_COMMAND_ID = 'moyuplus.smokeTest';
export const SMOKE_MESSAGE = 'MoyuPlus extension is active.';
export { CHECK_IMPORTED_TXT_COMMAND_ID, IMPORT_TXT_COMMAND_ID, READER_VIEW_ID, REMOVE_IMPORTED_TXT_COMMAND_ID };
export {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
};

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
  const typingPracticeController = new TypingPracticeController(txtFileService, sessionStore);

  registerSmokeCommand(context);
  registerTxtCommands(context, txtFileService);
  registerReaderView(context, txtFileService, sessionStore);
  registerTypingPractice(context, typingPracticeController);
}

export function deactivate(): void {}
