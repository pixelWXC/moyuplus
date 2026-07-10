import * as vscode from 'vscode';
import {
  TypingPracticeController,
  TypingPracticeFileNotFoundError,
  TypingPracticeNoUsableLinesError,
  type TypingPracticeLine
} from './TypingPracticeController';

export const START_TYPING_PRACTICE_COMMAND_ID = 'moyuplus.startTypingPractice';
export const STOP_TYPING_PRACTICE_COMMAND_ID = 'moyuplus.stopTypingPractice';
export const NEXT_TYPING_PRACTICE_LINE_COMMAND_ID = 'moyuplus.nextTypingPracticeLine';
export const RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID = 'moyuplus.resetTypingPracticeProgress';
export const JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID = 'moyuplus.jumpToTypingPracticeLine';
export const TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID = 'moyuplus.toggleTypingPracticeLineEdgeTrim';
export const SHOW_TYPING_PRACTICE_MENU_COMMAND_ID = 'moyuplus.showTypingPracticeMenu';
export const TOGGLE_TYPING_PRACTICE_COMMAND_ID = 'moyuplus.toggleTypingPractice';
const TYPING_PRACTICE_SAFETY_NOTICE_KEY = 'moyuplus.typingPracticeSafetyNoticeShown';

interface PracticeFileQuickPickItem extends vscode.QuickPickItem {
  fileId: string;
}

interface TypingPracticeMenuItem extends vscode.QuickPickItem {
  commandId: string;
}

class TypingInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  constructor(private readonly controller: TypingPracticeController) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const currentLine = await getCurrentLineIfAvailable(this.controller);
    if (!currentLine) {
      return undefined;
    }

    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const insertText = currentLine.text.startsWith(linePrefix)
      ? currentLine.text.slice(linePrefix.length)
      : currentLine.text;
    if (insertText.length === 0) {
      return undefined;
    }

    return [{ insertText }];
  }
}

export function registerTypingPractice(
  context: vscode.ExtensionContext,
  controller: TypingPracticeController
): void {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = SHOW_TYPING_PRACTICE_MENU_COMMAND_ID;
  context.subscriptions.push(statusBarItem);
  void vscode.commands.executeCommand('setContext', 'moyuplus.typingPracticeActive', false);

  const updateStatusBar = async (): Promise<void> => {
    const currentLine = await getCurrentLineIfAvailable(controller);
    await vscode.commands.executeCommand('setContext', 'moyuplus.typingPracticeActive', Boolean(currentLine));
    if (!currentLine) {
      statusBarItem.hide();
      return;
    }

    statusBarItem.text = formatStatusBarText(currentLine);
    statusBarItem.tooltip = 'MoyuPlus Typing Practice';
    statusBarItem.command = SHOW_TYPING_PRACTICE_MENU_COMMAND_ID;
    statusBarItem.show();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(START_TYPING_PRACTICE_COMMAND_ID, async () => {
      const result = await startTypingPractice(controller, context.globalState);
      await updateStatusBar();
      return result;
    }),
    vscode.commands.registerCommand(STOP_TYPING_PRACTICE_COMMAND_ID, async () => {
      await controller.stop();
      await updateStatusBar();
      return undefined;
    }),
    vscode.commands.registerCommand(NEXT_TYPING_PRACTICE_LINE_COMMAND_ID, async () => {
      const result = await runPracticeAction(() => controller.nextLine());
      await updateStatusBar();
      return result;
    }),
    vscode.commands.registerCommand(RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID, async () => {
      const result = await runPracticeAction(() => controller.reset());
      await updateStatusBar();
      return result;
    }),
    vscode.commands.registerCommand(JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID, async () => {
      const result = await jumpToPracticeLine(controller);
      await updateStatusBar();
      return result;
    }),
    vscode.commands.registerCommand(TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID, async () => {
      const result = await runPracticeAction(() => controller.toggleLineEdgeTrimming());
      await updateStatusBar();
      return result;
    }),
    vscode.commands.registerCommand(SHOW_TYPING_PRACTICE_MENU_COMMAND_ID, async () => {
      const result = await showTypingPracticeMenu(controller);
      await updateStatusBar();
      return result;
    }),
    vscode.commands.registerCommand(TOGGLE_TYPING_PRACTICE_COMMAND_ID, async () => {
      const currentLine = await getCurrentLineIfAvailable(controller);
      const result = currentLine
        ? await controller.stop().then(() => undefined)
        : await startTypingPractice(controller, context.globalState);
      await updateStatusBar();
      return result;
    }),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new TypingInlineCompletionProvider(controller))
  );

  void updateStatusBar();
}

async function getCurrentLineIfAvailable(
  controller: TypingPracticeController
): Promise<TypingPracticeLine | undefined> {
  try {
    return await controller.getCurrentLine();
  } catch {
    return undefined;
  }
}

async function startTypingPractice(
  controller: TypingPracticeController,
  globalState: vscode.Memento
): Promise<TypingPracticeLine | undefined> {
  const files = controller.listPracticeFiles();
  if (files.length === 0) {
    await vscode.window.showInformationMessage('No imported TXT files. Import a TXT before starting typing practice.');
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(
    files.map((file): PracticeFileQuickPickItem => ({
      label: file.name,
      description: file.source,
      detail: file.uri,
      fileId: file.id
    })),
    { placeHolder: 'Select TXT for typing practice' }
  );
  if (!selected) {
    return undefined;
  }

  await showSafetyNoticeOnce(globalState);
  return runPracticeAction(() => controller.start(selected.fileId));
}

async function showSafetyNoticeOnce(globalState: vscode.Memento): Promise<void> {
  if (globalState.get<boolean>(TYPING_PRACTICE_SAFETY_NOTICE_KEY, false)) {
    return;
  }

  await vscode.window.showWarningMessage(
    '练习输入会真实写入当前编辑器文件。建议在临时文件、草稿文件或专门练习文件中使用，避免误修改项目源码。'
  );
  await globalState.update(TYPING_PRACTICE_SAFETY_NOTICE_KEY, true);
}

async function showTypingPracticeMenu(controller: TypingPracticeController): Promise<TypingPracticeLine | undefined> {
  const selected = await vscode.window.showQuickPick(
    [
      { label: 'Next Line', commandId: NEXT_TYPING_PRACTICE_LINE_COMMAND_ID },
      { label: 'Reset Progress', commandId: RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID },
      { label: 'Jump to Line', commandId: JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID },
      { label: 'Toggle Trim Line Edges', commandId: TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID },
      { label: 'Stop Practice', commandId: STOP_TYPING_PRACTICE_COMMAND_ID }
    ] satisfies TypingPracticeMenuItem[],
    { placeHolder: 'Typing practice action' }
  );
  if (!selected) {
    return undefined;
  }

  if (selected.commandId === NEXT_TYPING_PRACTICE_LINE_COMMAND_ID) {
    return runPracticeAction(() => controller.nextLine());
  }
  if (selected.commandId === RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID) {
    return runPracticeAction(() => controller.reset());
  }
  if (selected.commandId === JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID) {
    return jumpToPracticeLine(controller);
  }
  if (selected.commandId === TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID) {
    return runPracticeAction(() => controller.toggleLineEdgeTrimming());
  }

  await controller.stop();
  return undefined;
}

async function jumpToPracticeLine(controller: TypingPracticeController): Promise<TypingPracticeLine | undefined> {
  const input = await vscode.window.showInputBox({
    placeHolder: 'Line number',
    prompt: 'Jump to physical TXT line number'
  });
  if (!input) {
    return undefined;
  }

  const lineNumber = Number.parseInt(input, 10);
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    await vscode.window.showErrorMessage('Line number must be a positive integer.');
    return undefined;
  }

  return runPracticeAction(() => controller.jumpToLine(lineNumber));
}

async function runPracticeAction(
  action: () => Promise<TypingPracticeLine | undefined>
): Promise<TypingPracticeLine | undefined> {
  try {
    return await action();
  } catch (error) {
    await vscode.window.showErrorMessage(toUserFacingErrorMessage(error));
    return undefined;
  }
}

function formatStatusBarText(currentLine: TypingPracticeLine): string {
  return `Typing: ${currentLine.fileName} ${currentLine.lineNumber}/${currentLine.totalLines}`;
}

function toUserFacingErrorMessage(error: unknown): string {
  if (error instanceof TypingPracticeNoUsableLinesError || error instanceof TypingPracticeFileNotFoundError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Typing practice operation failed.';
}
