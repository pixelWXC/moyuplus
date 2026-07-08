import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { READER_VIEW_ID } from '../../reader/readerMessages';

describe('package contributions', () => {
  it('contributes the reader webview to the VS Code sidebar', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.activationEvents).toContain(`onView:${READER_VIEW_ID}`);
    expect(packageJson.contributes.views.explorer).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: READER_VIEW_ID,
          type: 'webview',
          name: 'MoyuPlus Reader'
        })
      ])
    );
  });
});
