import * as vscode from 'vscode';

export const SMOKE_COMMAND_ID = 'moyuplus.smokeTest';
export const SMOKE_MESSAGE = 'MoyuPlus extension is active.';

export function registerSmokeCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(SMOKE_COMMAND_ID, async () => {
    await vscode.window.showInformationMessage(SMOKE_MESSAGE);
    return SMOKE_MESSAGE;
  });

  context.subscriptions.push(disposable);
}

export function activate(context: vscode.ExtensionContext): void {
  registerSmokeCommand(context);
}

export function deactivate(): void {}
