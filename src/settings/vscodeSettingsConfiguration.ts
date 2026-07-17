import * as vscode from 'vscode';
import type {
  ConfigurationInspection,
  SettingsConfigurationBridge,
  SettingsWorkspaceFolder
} from './settingsAuthority';

export function createVSCodeSettingsConfigurationBridge(): SettingsConfigurationBridge {
  return {
    workspaceFolders: () => (vscode.workspace.workspaceFolders ?? []).map(folder => ({
      name: folder.name,
      resource: folder.uri
    })),
    activeResource: () => vscode.window.activeTextEditor?.document.uri,
    workspaceFolderFor: resource => {
      const folder = vscode.workspace.getWorkspaceFolder(resource as vscode.Uri);
      return folder ? { name: folder.name, resource: folder.uri } : undefined;
    },
    inspect: (key, resource) => {
      const inspected = vscode.workspace.getConfiguration(undefined, resource as vscode.Uri | undefined).inspect(key);
      return {
        defaultValue: inspected?.defaultValue,
        ...(inspected?.globalValue === undefined ? {} : { globalValue: inspected.globalValue }),
        ...(inspected?.workspaceValue === undefined ? {} : { workspaceValue: inspected.workspaceValue }),
        ...(inspected?.workspaceFolderValue === undefined ? {} : { workspaceFolderValue: inspected.workspaceFolderValue })
      } satisfies ConfigurationInspection;
    },
    effectiveValue: (key, resource) => vscode.workspace
      .getConfiguration(undefined, resource as vscode.Uri | undefined)
      .get(key),
    updateGlobal: async (key, value) => {
      await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
    }
  };
}

export function toSettingsWorkspaceFolder(folder: vscode.WorkspaceFolder): SettingsWorkspaceFolder {
  return { name: folder.name, resource: folder.uri };
}
