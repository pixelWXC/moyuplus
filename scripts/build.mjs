import { build } from 'esbuild';

const sharedOptions = {
  bundle: true,
  logLevel: 'info',
  sourcemap: true
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: ['src/extension.ts'],
    external: ['vscode'],
    format: 'cjs',
    outfile: 'out/extension.js',
    platform: 'node',
    target: 'node20'
  }),
  build({
    ...sharedOptions,
    entryPoints: ['src/webview/readerApp.ts'],
    format: 'iife',
    outfile: 'media/readerApp.js',
    platform: 'browser',
    target: ['chrome120']
  })
]);
