import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '../../..');
const typingRoot = path.join(projectRoot, 'src/typing');

describe('typing architecture boundary', () => {
  it('provides public entries for every work-package-one domain and application module', async () => {
    const expected = [
      'src/typing/index.ts',
      'src/typing/domain/content/index.ts',
      'src/typing/domain/session/index.ts',
      'src/typing/domain/analytics/index.ts',
      'src/typing/domain/mastery/index.ts',
      'src/typing/domain/policies/index.ts',
      'src/typing/application/commands/index.ts',
      'src/typing/application/events/index.ts',
      'src/typing/application/ports/index.ts',
      'src/typing/application/PracticeApplicationCoordinator.ts'
    ];

    await expect(Promise.all(expected.map(file => readFile(path.join(projectRoot, file), 'utf8'))))
      .resolves.toHaveLength(expected.length);
  });

  it('keeps domain and application free of vscode, Node filesystem, and webview imports', async () => {
    const files = await collectTypeScriptFiles(path.join(typingRoot, 'domain'))
      .then(async domain => domain.concat(await collectTypeScriptFiles(path.join(typingRoot, 'application'))));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, relative(file)).not.toMatch(/from\s+['"]vscode['"]|require\(['"]vscode['"]\)/);
      expect(source, relative(file)).not.toMatch(/from\s+['"]node:(?:fs|path|os|crypto)['"]/);
      expect(source, relative(file)).not.toMatch(/from\s+['"][^'"]*webview/i);
    }
  });

  it('uses module public entries instead of cross-module deep imports', async () => {
    const files = await collectTypeScriptFiles(path.join(typingRoot, 'domain'))
      .then(async domain => domain.concat(await collectTypeScriptFiles(path.join(typingRoot, 'application'))));

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, relative(file)).not.toMatch(
        /from\s+['"]\.\.\/(?:content|session|analytics|mastery|policies|commands|events|ports)\/(?!index(?:['"]|\/))/
      );
    }
  });
});

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const value = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(value);
    return entry.isFile() && entry.name.endsWith('.ts') ? [value] : [];
  }));
  return nested.flat();
}

function relative(file: string): string {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
}
