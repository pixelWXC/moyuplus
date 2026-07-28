import { describe, expect, it, vi } from 'vitest';
import { TxtDecodeError } from '../../adapters/txt/txtEncoding';
import {
  PracticeSetupDraft,
  TypingViewMaterialCommands
} from '../../typing';

describe('Typing View material commands', () => {
  it('keeps the configured plan and range with the selected source in the application draft', () => {
    const draft = new PracticeSetupDraft();
    draft.selectContent({
      kind: 'builtIn',
      materialId: 'builtin-zh-1'
    });

    draft.configure({
      selectedRange: {
        kind: 'article',
        articleId: 'builtin-zh-1'
      },
      plan: {
        completion: {
          kind: 'timed',
          seconds: 180
        },
        evaluation: {
          errorPolicy: 'block'
        },
        textPolicy: {
          punctuation: {
            mode: 'equivalent',
            mappingVersion: 'zh-punctuation-v1'
          },
          whitespace: {
            mode: 'trimLineEdges'
          },
          caseSensitive: true
        },
        flowPolicy: {
          lineAdvance: 'automatic',
          presentation: 'continuous'
        },
        displayPolicy: {
          showLiveMetrics: true,
          showWhitespace: false
        }
      }
    });

    expect(draft.snapshot()).toEqual({
      contentRecipe: {
        kind: 'builtIn',
        materialId: 'builtin-zh-1'
      },
      selectedRange: {
        kind: 'article',
        articleId: 'builtin-zh-1'
      },
      plan: {
        contentRecipe: {
          kind: 'builtIn',
          materialId: 'builtin-zh-1'
        },
        completion: {
          kind: 'timed',
          seconds: 180
        },
        evaluation: {
          errorPolicy: 'block'
        },
        textPolicy: {
          punctuation: {
            mode: 'equivalent',
            mappingVersion: 'zh-punctuation-v1'
          },
          whitespace: {
            mode: 'trimLineEdges'
          },
          caseSensitive: true
        },
        flowPolicy: {
          lineAdvance: 'automatic',
          presentation: 'continuous'
        },
        displayPolicy: {
          showLiveMetrics: true,
          showWhitespace: false
        }
      }
    });
  });

  it('stores selected and pasted sources as setup drafts without persisting pasted text', async () => {
    const draft = new PracticeSetupDraft();
    const txtImporter = { import: vi.fn(async () => undefined) };
    const epubImporter = {
      import: vi.fn(async () => undefined),
      listChapters: vi.fn(async () => [])
    };
    const commands = new TypingViewMaterialCommands({
      draft,
      txtImporter,
      epubImporter,
      selectTxtFile: async () => undefined,
      selectEpubFile: async () => undefined,
      selectEpubChapters: async () => undefined,
      selectTxtEncoding: async () => undefined,
      reportError: async () => undefined
    });

    await commands.selectMaterial({
      materialId: 'builtin-zh-1',
      materialOrigin: 'builtIn'
    });
    expect(draft.snapshot()).toEqual({
      contentRecipe: {
        kind: 'builtIn',
        materialId: 'builtin-zh-1'
      }
    });

    await commands.selectMaterial({
      materialId: 'txt-material-1',
      materialOrigin: 'txtImport'
    });
    expect(draft.snapshot()).toEqual({
      contentRecipe: {
        kind: 'custom',
        materialId: 'txt-material-1'
      }
    });

    await commands.usePastedText('\uFEFF第一行\r\n\r\n\r\n第二行');
    expect(draft.snapshot()).toEqual({
      contentRecipe: {
        kind: 'adHoc',
        text: '第一行\n\n第二行'
      }
    });
    expect(txtImporter.import).not.toHaveBeenCalled();
    expect(epubImporter.import).not.toHaveBeenCalled();
  });

  it('rejects empty pasted content without replacing the current draft', async () => {
    const draft = new PracticeSetupDraft();
    draft.selectContent({ kind: 'builtIn', materialId: 'keep-me' });
    const reportError = vi.fn(async () => undefined);
    const commands = new TypingViewMaterialCommands({
      draft,
      txtImporter: { import: async () => undefined },
      epubImporter: emptyEpubImporter(),
      selectTxtFile: async () => undefined,
      selectEpubFile: async () => undefined,
      selectEpubChapters: async () => undefined,
      selectTxtEncoding: async () => undefined,
      reportError
    });

    await expect(commands.usePastedText('\r\n  \r\n')).resolves.toBe(false);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Practice content is empty.'
    }));
    expect(draft.snapshot()).toEqual({
      contentRecipe: { kind: 'builtIn', materialId: 'keep-me' }
    });
  });

  it('reports file selection failures instead of rejecting the Webview message handler', async () => {
    const reportError = vi.fn(async () => undefined);
    const commands = new TypingViewMaterialCommands({
      draft: new PracticeSetupDraft(),
      txtImporter: { import: async () => undefined },
      epubImporter: emptyEpubImporter(),
      selectTxtFile: async () => {
        throw new Error('picker unavailable');
      },
      selectEpubFile: async () => {
        throw new Error('picker unavailable');
      },
      selectEpubChapters: async () => undefined,
      selectTxtEncoding: async () => undefined,
      reportError
    });

    await expect(commands.importTxt()).resolves.toBe(false);
    await expect(commands.importEpub()).resolves.toBe(false);
    expect(reportError.mock.calls).toEqual([
      [expect.objectContaining({ message: 'picker unavailable' })],
      [expect.objectContaining({ message: 'picker unavailable' })]
    ]);
  });

  it('imports TXT, retries a decode failure with the selected encoding, and reports terminal errors', async () => {
    const reportError = vi.fn(async () => undefined);
    const txtImporter = {
      import: vi.fn()
        .mockRejectedValueOnce(new TxtDecodeError('utf8'))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('write failed'))
    };
    const commands = new TypingViewMaterialCommands({
      draft: new PracticeSetupDraft(),
      txtImporter,
      epubImporter: emptyEpubImporter(),
      selectTxtFile: async () => ({
        bytes: new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]),
        title: '练习文本',
        sourceUri: 'file:///practice.txt'
      }),
      selectEpubFile: async () => undefined,
      selectEpubChapters: async () => undefined,
      selectTxtEncoding: async () => 'gbk',
      reportError
    });

    await commands.importTxt();
    expect(txtImporter.import.mock.calls).toEqual([
      [{
        bytes: new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]),
        encoding: 'utf8',
        title: '练习文本',
        sourceUri: 'file:///practice.txt'
      }],
      [{
        bytes: new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]),
        encoding: 'gbk',
        title: '练习文本',
        sourceUri: 'file:///practice.txt'
      }]
    ]);
    expect(reportError).not.toHaveBeenCalled();

    await commands.importTxt();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'write failed'
    }));
  });

  it('imports a selected EPUB and turns import errors into visible reports', async () => {
    const reportError = vi.fn(async () => undefined);
    const epubImporter = {
      listChapters: vi.fn(async () => [
        { id: 'chapter-1', title: '第一章' },
        { id: 'chapter-2', title: '第二章' }
      ]),
      import: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('unsafe epub'))
    };
    const commands = new TypingViewMaterialCommands({
      draft: new PracticeSetupDraft(),
      txtImporter: { import: async () => undefined },
      epubImporter,
      selectTxtFile: async () => undefined,
      selectEpubFile: async () => ({ sourceUri: 'file:///book.epub' }),
      selectEpubChapters: async chapters => [chapters[1]!.id],
      selectTxtEncoding: async () => undefined,
      reportError
    });

    await commands.importEpub();
    expect(epubImporter.import).toHaveBeenCalledWith({
      sourceUri: 'file:///book.epub',
      chapterIds: ['chapter-2']
    });
    expect(reportError).not.toHaveBeenCalled();

    await commands.importEpub();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'unsafe epub'
    }));
  });
});

function emptyEpubImporter() {
  return {
    import: async () => undefined,
    listChapters: async () => []
  };
}
