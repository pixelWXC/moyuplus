import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/test/shims/vscode.ts')
    }
  },
  test: {
    include: ['src/test/**/*.test.ts']
  }
});
