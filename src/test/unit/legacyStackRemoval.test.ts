import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '../../..');

describe('Reader v2 legacy-stack removal', () => {
  it.each([
    'src/txt/txtFileService.ts',
    'src/storage/txtLibraryStore.ts',
    'src/commands/txtCommands.ts',
    'src/test/unit/txtFileService.test.ts'
  ])('removes %s', async (relativePath) => {
    await expect(access(path.join(projectRoot, relativePath))).rejects.toThrow();
  });

  it('keeps v1 Reader shapes isolated inside the read-only migration module', async () => {
    const runtimeFiles = [
      'src/domain/models.ts',
      'src/reader/readerMessages.ts',
      'src/storage/workspaceSessionStore.ts',
      'src/extension.ts'
    ];
    const sources = await Promise.all(runtimeFiles.map(file => readFile(path.join(projectRoot, file), 'utf8')));
    const combined = sources.join('\n');

    expect(combined).not.toMatch(/\bReaderSession\b|\bPageRange\b|pageHistory|TxtFileService|TxtLibraryStore/);
    expect(combined).not.toMatch(/removeImportedTxt|checkImportedTxtFiles|reader\.selectFile|reader\.increaseFont|reader\.decreaseFont/);
  });

  it('removes the Reader and Git Log in-place settings drawers and save controls', async () => {
    const sources = await Promise.all([
      'src/webview/readerApp.ts',
      'src/webview/readerState.ts',
      'src/webview/gitLogView.ts',
      'src/webview/gitLogState.ts'
    ].map(file => readFile(path.join(projectRoot, file), 'utf8')));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/renderSettingsDrawer|settingsDrawer|saveGitLogPreferences|preferencesDraft|settingsOpen/);
    expect(combined.match(/openUnifiedSettings/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
