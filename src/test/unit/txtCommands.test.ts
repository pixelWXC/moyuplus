import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECK_IMPORTED_TXT_COMMAND_ID,
  IMPORT_TXT_COMMAND_ID,
  REMOVE_IMPORTED_TXT_COMMAND_ID,
  activate
} from '../../extension';
import {
  commands,
  resetVSCodeShim,
  Uri,
  type Disposable,
  window,
  workspace
} from '../shims/vscode';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-command-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resetVSCodeShim();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('TXT command registration', () => {
  it('registers import, remove, and invalid-file check commands on activation', () => {
    const context = {
      globalState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };

    activate(context);

    expect(commands.registeredCommandIds()).toEqual([
      'moyuplus.smokeTest',
      IMPORT_TXT_COMMAND_ID,
      REMOVE_IMPORTED_TXT_COMMAND_ID,
      CHECK_IMPORTED_TXT_COMMAND_ID
    ]);
  });

  it('imports a selected TXT file with the chosen encoding', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'picked.txt');
    await writeFile(filePath, 'picked', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    workspace.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    activate(context);

    const result = await commands.executeRegisteredCommand(IMPORT_TXT_COMMAND_ID);

    expect(result).toMatchObject({
      name: 'picked.txt',
      encoding: 'utf8',
      source: 'workspace'
    });
    expect(window.informationMessages).toEqual(['Imported TXT: picked.txt']);
  });

  it('removes an imported TXT record selected from quick pick', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'picked.txt');
    await writeFile(filePath, 'picked', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    activate(context);
    const imported = await commands.executeRegisteredCommand(IMPORT_TXT_COMMAND_ID);
    window.quickPickResult = { label: 'picked.txt', fileId: imported.id };

    await commands.executeRegisteredCommand(REMOVE_IMPORTED_TXT_COMMAND_ID);

    expect(window.informationMessages).toContain('Removed TXT: picked.txt');
  });
});
