import * as vscode from 'vscode';
import {
  TYPING_VIEW_ID,
  TypingViewProvider,
  type TypingViewCommandPort,
  type TypingViewQueryPort
} from '../adapters/view';

export interface TypingViewRegistrationContext {
  subscriptions: vscode.Disposable[];
}

export function registerTypingView(
  context: TypingViewRegistrationContext,
  extensionUri: vscode.Uri,
  query: TypingViewQueryPort,
  commands?: TypingViewCommandPort
): TypingViewProvider {
  const provider = new TypingViewProvider(extensionUri, query, commands);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(TYPING_VIEW_ID, provider)
  );
  return provider;
}
