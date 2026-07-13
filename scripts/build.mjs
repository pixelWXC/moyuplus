import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const webviewOnly = process.argv.includes('--webview-only');
if (!webviewOnly) await rm('out', { recursive: true, force: true });

const sharedOptions = {
  bundle: true,
  logLevel: 'info',
  sourcemap: true
};

const webviewBuild = build({
  ...sharedOptions,
  entryPoints: ['src/webview/readerApp.ts'],
  format: 'iife',
  outfile: 'media/readerApp.js',
  platform: 'browser',
  target: ['chrome120']
});

const builds = [webviewBuild];
if (!webviewOnly) {
  builds.push(build({
    ...sharedOptions,
    entryPoints: ['src/extension.ts'],
    external: ['vscode'],
    format: 'cjs',
    outfile: 'out/extension.js',
    platform: 'node',
    target: 'node20'
  }));
}

await Promise.all(builds);
