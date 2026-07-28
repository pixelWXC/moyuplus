import * as vscode from 'vscode';
import { ReaderViewProvider } from '../reader/ReaderViewProvider';

export const ROUTE_ENTER_COMMAND_ID = 'moyuplus.routeEnter';

interface EnterRouteOptions {
  insertNewLine: boolean;
  nextReaderPage: boolean;
}

export function registerShortcutRouter(
  context: vscode.ExtensionContext,
  readerViewProvider: ReaderViewProvider
): void {
  const router = new ShortcutRouter(readerViewProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand(ROUTE_ENTER_COMMAND_ID, async () => router.routeEnter())
  );
}

class ShortcutRouter {
  constructor(
    private readonly readerViewProvider: ReaderViewProvider
  ) {}

  async routeEnter(): Promise<void> {
    const options = readEnterRouteOptions();
    if (options.insertNewLine) {
      await vscode.commands.executeCommand('type', { text: '\n' });
    }
    if (options.nextReaderPage) {
      await this.readerViewProvider.requestNextPage();
    }
  }
}

function readEnterRouteOptions(): EnterRouteOptions {
  const configuration = vscode.workspace.getConfiguration('moyuplus.enter');
  return {
    insertNewLine: configuration.get<boolean>('insertNewLine', true),
    nextReaderPage: configuration.get<boolean>('nextReaderPage', false)
  };
}
