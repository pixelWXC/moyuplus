import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '../../..');

describe('typing legacy-stack removal', () => {
  it.each([
    'src/typing/TypingPracticeController.ts',
    'src/typing/typingPracticeCommands.ts',
    'src/typing/typingSourceCatalog.ts',
    'src/storage/workspaceSessionStore.ts',
    'src/domain/models.ts',
    'src/test/unit/typingPracticeController.test.ts',
    'src/test/unit/typingSourceCatalog.test.ts',
    'src/test/unit/storage.test.ts',
    'src/test/unit/typingPracticeIntegration.test.ts',
    'src/typing/registration/editorRegistration.ts',
    'src/test/extensionHost/typingPracticeEditorHost.ts',
    'src/test/extensionHost/typingPracticeImeManual.ts',
    'src/typing/assets/builtInPack.ts',
    'src/typing/assets/index.ts',
    'src/typing/adapters/sources/BuiltInPackProvider.ts',
    'src/test/unit/typingBuiltInContent.test.ts',
    'src/commands/shortcutRouter.ts',
    'src/settings/vscodeSettingsConfiguration.ts'
  ])('removes %s', async relativePath => {
    await expect(access(path.join(projectRoot, relativePath)))
      .rejects.toThrow();
  });

  it('removes the obsolete global Tab route and settings surface', async () => {
    const files = [
      'package.json',
      'src/shortcuts/shortcutSettings.ts',
      'src/settings/settingsMessages.ts',
      'src/settings/settingsAuthority.ts',
      'src/settings/MoyuPlusSettingsPanel.ts',
      'src/webview/settingsApp.ts'
    ];
    const combined = (await Promise.all(files.map(file => (
      readFile(path.join(projectRoot, file), 'utf8')
    )))).join('\n');

    expect(combined).not.toContain('moyuplus.routeTab');
    expect(combined).not.toContain('moyuplus.routeEnter');
    expect(combined).not.toContain('enableTabRouter');
    expect(combined).not.toContain('moyuplus.typing.tabMode');
    expect(combined).not.toContain('nextPracticeLine');
  });

  it('keeps the production typing stack free of the removed built-in material contract', async () => {
    const files = [
      'src/extension.ts',
      ...await collectTypeScriptFiles(path.join(projectRoot, 'src/typing')),
      'src/webview/typingApp.ts',
      'src/webview/typingViewRender.ts'
    ];
    const combined = (await Promise.all(files.map(file => (
      readFile(path.isAbsolute(file) ? file : path.join(projectRoot, file), 'utf8')
    )))).join('\n');

    expect(combined).not.toMatch(/BuiltInPack|builtIn|内置素材/);
  });
});

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await import('node:fs/promises').then(fs =>
    fs.readdir(directory, { withFileTypes: true })
  );
  const nested = await Promise.all(entries.map(entry => {
    const value = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(value);
    return entry.isFile() && entry.name.endsWith('.ts') ? [value] : [];
  }));
  return nested.flat();
}
