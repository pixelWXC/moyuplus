import * as vscode from 'vscode';
import { type TxtEncoding } from '../domain/models';
import { TxtFileMissingError, TxtFileService } from '../txt/txtFileService';

export const IMPORT_TXT_COMMAND_ID = 'moyuplus.importTxt';
export const REMOVE_IMPORTED_TXT_COMMAND_ID = 'moyuplus.removeImportedTxt';
export const CHECK_IMPORTED_TXT_COMMAND_ID = 'moyuplus.checkImportedTxtFiles';

interface EncodingQuickPickItem extends vscode.QuickPickItem {
  encoding: TxtEncoding;
}

interface ImportedFileQuickPickItem extends vscode.QuickPickItem {
  fileId: string;
}

export function registerTxtCommands(context: vscode.ExtensionContext, txtFileService: TxtFileService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(IMPORT_TXT_COMMAND_ID, async () => importTxt(txtFileService)),
    vscode.commands.registerCommand(REMOVE_IMPORTED_TXT_COMMAND_ID, async (fileId?: string) =>
      removeImportedTxt(txtFileService, fileId)
    ),
    vscode.commands.registerCommand(CHECK_IMPORTED_TXT_COMMAND_ID, async () => checkImportedTxtFiles(txtFileService))
  );
}

async function importTxt(txtFileService: TxtFileService): Promise<unknown> {
  const selectedUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'Text files': ['txt'],
      'All files': ['*']
    },
    title: 'Import TXT'
  });
  const selectedUri = selectedUris?.[0];
  if (!selectedUri) {
    return undefined;
  }

  const encodingItem = await vscode.window.showQuickPick(
    [
      { label: 'UTF-8', encoding: 'utf8' },
      { label: 'GBK', encoding: 'gbk' }
    ] satisfies EncodingQuickPickItem[],
    { placeHolder: 'Select TXT encoding' }
  );
  if (!encodingItem) {
    return undefined;
  }

  try {
    const file = await txtFileService.importTxtFile({
      uri: selectedUri.toString(),
      encoding: encodingItem.encoding,
      workspaceFolderUris: getWorkspaceFolderUris()
    });
    await vscode.window.showInformationMessage(`Imported TXT: ${file.name}`);
    return file;
  } catch (error) {
    await vscode.window.showErrorMessage(toUserFacingErrorMessage(error));
    return undefined;
  }
}

async function removeImportedTxt(txtFileService: TxtFileService, fileId?: string): Promise<unknown> {
  const selectedFile = fileId
    ? txtFileService.listImportedFiles().find((file) => file.id === fileId)
    : await pickImportedFile(txtFileService);
  if (!selectedFile) {
    return undefined;
  }

  await txtFileService.removeImportedFile(selectedFile.id);
  await vscode.window.showInformationMessage(`Removed TXT: ${selectedFile.name}`);
  return selectedFile.id;
}

async function checkImportedTxtFiles(txtFileService: TxtFileService): Promise<unknown> {
  const invalidFiles = await txtFileService.findInvalidImportedFiles();
  if (invalidFiles.length === 0) {
    await vscode.window.showInformationMessage('All imported TXT files are available.');
    return [];
  }

  await vscode.window.showWarningMessage(`${invalidFiles.length} imported TXT file(s) are missing or unavailable.`);
  return invalidFiles;
}

async function pickImportedFile(txtFileService: TxtFileService): Promise<ReturnType<TxtFileService['listImportedFiles']>[number] | undefined> {
  const files = txtFileService.listImportedFiles();
  if (files.length === 0) {
    await vscode.window.showInformationMessage('No imported TXT files.');
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(
    files.map((file): ImportedFileQuickPickItem => ({
      label: file.name,
      description: file.source,
      detail: file.uri,
      fileId: file.id
    })),
    { placeHolder: 'Select imported TXT to remove' }
  );

  return selected ? files.find((file) => file.id === selected.fileId) : undefined;
}

function getWorkspaceFolderUris(): string[] {
  return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.toString()) ?? [];
}

function toUserFacingErrorMessage(error: unknown): string {
  if (error instanceof TxtFileMissingError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'TXT operation failed.';
}
