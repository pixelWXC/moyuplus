import * as vscode from 'vscode';
import { type TypingTabMode } from '../domain/models';
import { ReaderViewProvider } from '../reader/ReaderViewProvider';
import { TypingPracticeController } from '../typing/TypingPracticeController';
import { NEXT_TYPING_PRACTICE_LINE_COMMAND_ID } from '../typing/typingPracticeCommands';

export const ROUTE_ENTER_COMMAND_ID = 'moyuplus.routeEnter';
export const ROUTE_TAB_COMMAND_ID = 'moyuplus.routeTab';

interface EnterRouteOptions {
  insertNewLine: boolean;
  nextPracticeLine: boolean;
  nextReaderPage: boolean;
}

export function registerShortcutRouter(
  context: vscode.ExtensionContext,
  typingPracticeController: TypingPracticeController,
  readerViewProvider: ReaderViewProvider
): void {
  const router = new ShortcutRouter(typingPracticeController, readerViewProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand(ROUTE_ENTER_COMMAND_ID, async () => router.routeEnter()),
    vscode.commands.registerCommand(ROUTE_TAB_COMMAND_ID, async () => router.routeTab())
  );
}

class ShortcutRouter {
  constructor(
    private readonly typingPracticeController: TypingPracticeController,
    private readonly readerViewProvider: ReaderViewProvider
  ) {}

  async routeEnter(): Promise<void> {
    const options = readEnterRouteOptions();
    if (options.insertNewLine) {
      await vscode.commands.executeCommand('type', { text: '\n' });
    }
    if (options.nextPracticeLine) {
      await vscode.commands.executeCommand(NEXT_TYPING_PRACTICE_LINE_COMMAND_ID);
    }
    if (options.nextReaderPage) {
      await this.readerViewProvider.requestNextPage();
    }
  }

  async routeTab(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await executeNativeTab();
      return;
    }

    const position = editor.selection.active;
    const editorLineText = editor.document.lineAt(position.line).text;
    const completion = await this.typingPracticeController.getTabCompletion(
      editorLineText,
      position.character,
      readTypingTabMode()
    );
    if (!completion) {
      await executeNativeTab();
      return;
    }

    const applied = await editor.edit((editBuilder) => {
      if (completion.replaceCurrentLine) {
        editBuilder.replace(new vscode.Range(position.line, 0, position.line, editorLineText.length), completion.text);
        return;
      }

      editBuilder.insert(position, completion.text);
    });

    if (!applied) {
      await executeNativeTab();
    }
  }
}

function readTypingTabMode(): TypingTabMode {
  const value = vscode.workspace.getConfiguration('moyuplus.typing').get<unknown>('tabMode', 'completeRest');
  return value === 'replaceLine' ? 'replaceLine' : 'completeRest';
}

function readEnterRouteOptions(): EnterRouteOptions {
  const configuration = vscode.workspace.getConfiguration('moyuplus.enter');
  return {
    insertNewLine: configuration.get<boolean>('insertNewLine', true),
    nextPracticeLine: configuration.get<boolean>('nextPracticeLine', false),
    nextReaderPage: configuration.get<boolean>('nextReaderPage', false)
  };
}

async function executeNativeTab(): Promise<void> {
  await vscode.commands.executeCommand('tab');
}
