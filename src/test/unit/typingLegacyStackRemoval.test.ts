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
    'src/test/extensionHost/typingPracticeImeManual.ts'
  ])('removes %s', async relativePath => {
    await expect(access(path.join(projectRoot, relativePath)))
      .rejects.toThrow();
  });

  it('removes the obsolete global Tab route and settings surface', async () => {
    const files = [
      'package.json',
      'src/commands/shortcutRouter.ts',
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
    expect(combined).not.toContain('enableTabRouter');
    expect(combined).not.toContain('moyuplus.typing.tabMode');
    expect(combined).not.toContain('nextPracticeLine');
  });
});
