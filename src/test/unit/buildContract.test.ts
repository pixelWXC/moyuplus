import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, '../../..');

describe('dual-target build contract', () => {
  it('declares the Reader v2 toolchain and verification scripts', async () => {
    const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));

    expect(packageJson.scripts).toMatchObject({
      build: 'node scripts/build.mjs',
      'build:webview': 'node scripts/build.mjs --webview-only',
      compile: 'tsc -p ./ --noEmit && npm run build',
      'test:unit': 'vitest run',
      'test:layout': 'playwright test --config playwright.config.ts',
      test: 'npm run test:unit && npm run test:layout',
      package: 'npm run compile && npm test && vsce package'
    });
    expect(packageJson.dependencies).toMatchObject({
      'fast-xml-parser': expect.any(String),
      parse5: expect.any(String),
      yauzl: expect.any(String)
    });
    expect(packageJson.dependencies).not.toHaveProperty('css-tree');
    expect(packageJson.devDependencies).toMatchObject({
      '@playwright/test': expect.any(String),
      '@types/yauzl': expect.any(String),
      '@types/yazl': expect.any(String),
      '@vscode/vsce': expect.any(String),
      esbuild: expect.any(String),
      yazl: expect.any(String)
    });
    expect(packageJson.devDependencies).not.toHaveProperty('@types/css-tree');
  });

  it('ships only runtime artifacts and excludes development and user-content paths', async () => {
    const ignore = await readFile(path.join(projectRoot, '.vscodeignore'), 'utf8');
    expect(ignore).toMatch(/^src\/test\/$/m);
    expect(ignore).toMatch(/^tests\/$/m);
    expect(ignore).toMatch(/^test-results\/$/m);
    expect(ignore).toMatch(/^docs\/$/m);
    expect(ignore).toMatch(/^\.superpowers\/$/m);
    expect(ignore).toMatch(/^\*\*\/\*\.epub$/m);
    expect(ignore).toMatch(/^\*\*\/\*\.txt$/m);
    expect(ignore).toMatch(/^\*\*\/\*\.map$/m);
    expect(ignore).not.toMatch(/^out\/$/m);
    expect(ignore).not.toMatch(/^media\/$/m);
  });

  it('emits an external-vscode CommonJS extension bundle', async () => {
    await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot });
    const extensionBundle = await readFile(path.join(projectRoot, 'out/extension.js'), 'utf8');

    expect(extensionBundle).toContain('module.exports');
    expect(extensionBundle).toMatch(/\bactivate\b/);
    expect(extensionBundle).toMatch(/\bdeactivate\b/);
    expect(extensionBundle).toMatch(/require\(["']vscode["']\)/);
  }, 15_000);

  it('loads the packaged CommonJS bundle without import.meta/createRequire failures', async () => {
    await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot });
    const script = [
      "const Module = require('module');",
      'const originalLoad = Module._load;',
      "Module._load = function(id, parent, main) { if (id === 'vscode') return {}; return originalLoad.call(this, id, parent, main); };",
      "require('./out/extension.js');"
    ].join(' ');

    await expect(execFileAsync(process.execPath, ['-e', script], { cwd: projectRoot })).resolves.toBeDefined();
  }, 15_000);

  it('emits a self-contained browser Webview bundle and stylesheet', async () => {
    await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: projectRoot });
    const webviewBundle = await readFile(path.join(projectRoot, 'media/readerApp.js'), 'utf8');
    const webviewStyles = await readFile(path.join(projectRoot, 'media/readerApp.css'), 'utf8');

    expect(webviewBundle).not.toMatch(/\brequire\s*\(/);
    expect(webviewBundle).not.toMatch(/(?:from\s+|require\s*\()["']node:/);
    expect(webviewBundle).not.toMatch(/https?:\/\//);
    expect(webviewBundle).not.toMatch(/(?:css-tree|fast-xml-parser|parse5|yauzl)/);
    expect(webviewBundle).toContain('Git Log');
    expect(webviewBundle).toContain('saveGitLogPreferences');
    expect(webviewStyles).toContain('.git-log-view');
    expect(webviewStyles).toContain('.git-log-content');
    expect(webviewStyles.trim()).not.toBe('');
  }, 15_000);
});
