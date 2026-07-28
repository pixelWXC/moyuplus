import * as vscode from 'vscode';
import type {
  TypingViewControlDestination
} from '../application/TypingViewPracticeCommands';
import type { TypingViewPage } from '../adapters/view';

export const START_TYPING_PRACTICE_COMMAND_ID =
  'moyuplus.startTypingPractice';
export const STOP_TYPING_PRACTICE_COMMAND_ID =
  'moyuplus.stopTypingPractice';
export const NEXT_TYPING_PRACTICE_LINE_COMMAND_ID =
  'moyuplus.nextTypingPracticeLine';
export const RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID =
  'moyuplus.resetTypingPracticeProgress';
export const JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID =
  'moyuplus.jumpToTypingPracticeLine';
export const TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID =
  'moyuplus.toggleTypingPracticeLineEdgeTrim';
export const SHOW_TYPING_PRACTICE_MENU_COMMAND_ID =
  'moyuplus.showTypingPracticeMenu';
export const TOGGLE_TYPING_PRACTICE_COMMAND_ID =
  'moyuplus.toggleTypingPractice';

export interface LegacyTypingCommandRegistrationContext {
  readonly subscriptions: vscode.Disposable[];
}

export interface LegacyTypingCommandAliasPort {
  openPage(page: TypingViewPage): PromiseLike<void>;
  controlPractice(
    action: 'restart' | 'finish'
  ): PromiseLike<TypingViewControlDestination>;
  hasActivePractice(): PromiseLike<boolean>;
}

export function registerLegacyTypingCommandAliases(
  context: LegacyTypingCommandRegistrationContext,
  port: LegacyTypingCommandAliasPort
): void {
  const openDestination = async (
    destination: TypingViewControlDestination
  ): Promise<void> => {
    await port.openPage(destination);
  };
  const openMaterials = async (): Promise<void> => {
    await port.openPage('materials');
  };
  const finish = async (): Promise<void> => {
    if (!await port.hasActivePractice()) {
      await openMaterials();
      return;
    }
    await openDestination(await port.controlPractice('finish'));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      START_TYPING_PRACTICE_COMMAND_ID,
      openMaterials
    ),
    vscode.commands.registerCommand(
      STOP_TYPING_PRACTICE_COMMAND_ID,
      finish
    ),
    vscode.commands.registerCommand(
      RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
      async () => {
        if (!await port.hasActivePractice()) {
          await openMaterials();
          return;
        }
        await openDestination(await port.controlPractice('restart'));
      }
    ),
    vscode.commands.registerCommand(
      TOGGLE_TYPING_PRACTICE_COMMAND_ID,
      async () => {
        if (await port.hasActivePractice()) {
          await finish();
        } else {
          await openMaterials();
        }
      }
    )
  );

  for (const commandId of [
    NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
    JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
    TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
    SHOW_TYPING_PRACTICE_MENU_COMMAND_ID
  ]) {
    context.subscriptions.push(vscode.commands.registerCommand(
      commandId,
      async () => {
        await vscode.window.showInformationMessage(
          '此旧命令已停用。请在新版打字练习视图中选择素材、范围和控制操作。'
        );
        await openMaterials();
      }
    ));
  }
}
