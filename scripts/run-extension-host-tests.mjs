import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const projectRoot = path.resolve(import.meta.dirname, '..');
const testBundle = path.join(projectRoot, 'out', 'extensionHostTests.js');
const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-vscode-test-'));
const userDataDir = path.join(isolatedRoot, 'user-data');
const extensionsDir = path.join(isolatedRoot, 'extensions');
await Promise.all([
  mkdir(userDataDir, { recursive: true }),
  mkdir(extensionsDir, { recursive: true })
]);

try {
  await build({
    entryPoints: [
      path.join(
        projectRoot,
        'src',
        'test',
        'extensionHost',
        'typingPracticeWebviewHost.ts'
      )
    ],
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    outfile: testBundle,
    platform: 'node',
    target: 'node20',
    sourcemap: true
  });

  const codeCli = process.env.MOYUPLUS_CODE_CLI
    ?? (process.platform === 'win32'
      ? path.join(
        process.env.LOCALAPPDATA ?? '',
        'Programs',
        'Microsoft VS Code',
        'Code.exe'
      )
      : 'code');
  const args = [
    '--disable-extensions',
    '--disable-workspace-trust',
    '--skip-release-notes',
    '--skip-welcome',
    '--user-data-dir',
    userDataDir,
    '--extensions-dir',
    extensionsDir,
    `--extensionDevelopmentPath=${projectRoot}`,
    `--extensionTestsPath=${testBundle}`,
    projectRoot
  ];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(codeCli, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        MOYUPLUS_PROJECT_ROOT: projectRoot
      }
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`VS Code Extension Host tests failed with exit code ${exitCode}.`);
  }
} finally {
  await rm(isolatedRoot, { recursive: true, force: true });
}
