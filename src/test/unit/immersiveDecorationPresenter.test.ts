import { describe, expect, it, vi } from 'vitest';
import { createDefaultImmersiveReaderPreferences } from '../../domain/immersiveReaderPreferences';
import { ImmersiveDecorationPresenter, type ImmersiveDecorationHost } from '../../reader/ImmersiveDecorationPresenter';
import type { SafeSectionDocument } from '../../adapters/bookAdapter';

function section(text: string): SafeSectionDocument {
  return {
    sectionId: 'section', sanitizedHtml: '', localResources: [], sourceRevision: 'revision',
    immersiveProjection: {
      text, projectionRevision: 'projection',
      segments: [{ kind: 'identity', sourceStart: 0, sourceEnd: text.length, immersiveStart: 0, immersiveEnd: text.length, safeSourceFloor: 0, safeImmersiveFloor: 0 }]
    },
    locatorSpace: { kind: 'txt', sectionStart: 0, sectionEnd: text.length }
  };
}

describe('ImmersiveDecorationPresenter', () => {
  it('waits for an editor and only consumes rows successfully submitted to real document lines', async () => {
    const harness = createHost();
    const presenter = new ImmersiveDecorationPresenter(
      { ...createDefaultImmersiveReaderPreferences(), visualLines: 3, graphemesPerLine: 8 },
      harness.host
    );
    await presenter.activate({ bookId: 'book', format: 'txt', sections: [], section: section('abcdefghijklmnop'), localOffset: 0 });
    expect(await presenter.nextPage()).toBe('unavailable');

    const editor = harness.editor(['const x = 1;', 'return x;'], 1);
    harness.activate(editor);
    await harness.settle();
    expect(editor.applied.at(-1)?.map(option => option.text)).toEqual(['abcdefgh']);
    expect(presenter.capturePosition()).toEqual({ sectionId: 'section', localOffset: 0 });

    expect(await presenter.nextPage()).toBe('moved');
    expect(presenter.capturePosition()).toEqual({ sectionId: 'section', localOffset: 8 });
    expect(editor.applied.at(-1)?.map(option => option.text)).toEqual(['ijklmnop']);
    expect(harness.createdTypes).toBe(1);
  });

  it('reanchors without advancing and clears the previous editor on switches', async () => {
    const harness = createHost();
    const first = harness.editor(['one', 'two', 'three'], 0);
    const second = harness.editor(['alpha', 'beta'], 0);
    harness.current = first;
    const presenter = new ImmersiveDecorationPresenter(createDefaultImmersiveReaderPreferences(), harness.host);
    await presenter.activate({ bookId: 'book', format: 'txt', sections: [], section: section('abcdefghijkl'), localOffset: 3 });
    expect(first.applied).toHaveLength(0);
    harness.activate(first);
    await harness.settle();
    const before = presenter.capturePosition();

    first.selection.active.line = 1;
    harness.move(first);
    await harness.settle(80);
    expect(presenter.capturePosition()).toEqual(before);

    harness.activate(second);
    await harness.settle();
    expect(first.clearCalls).toBeGreaterThan(0);
    expect(second.applied.length).toBeGreaterThan(0);
    expect(harness.createdTypes).toBe(1);

    await presenter.dispose();
    expect(second.clearCalls).toBeGreaterThan(0);
    expect(harness.disposedTypes).toBe(1);
  });

});

function createHost() {
  type Callback<T> = (value: T) => void;
  const activeCallbacks: Array<Callback<TestEditor | undefined>> = [];
  const selectionCallbacks: Array<Callback<{ textEditor: TestEditor }>> = [];
  const documentCallbacks: Array<Callback<{ document: object }>> = [];
  const windowCallbacks: Array<Callback<{ focused: boolean }>> = [];
  const harness = {
    current: undefined as TestEditor | undefined,
    createdTypes: 0,
    disposedTypes: 0,
    host: undefined as unknown as ImmersiveDecorationHost,
    editor(lines: string[], activeLine: number, scheme = 'file') {
      return new TestEditor(lines, activeLine, scheme);
    },
    activate(editor: TestEditor | undefined) { this.current = editor; activeCallbacks.forEach(callback => callback(editor)); },
    move(editor: TestEditor) { selectionCallbacks.forEach(callback => callback({ textEditor: editor })); },
    async settle(ms = 0) { await new Promise(resolve => setTimeout(resolve, ms)); }
  };
  harness.host = {
    activeTextEditor: () => harness.current,
    createDecorationType: () => {
      harness.createdTypes += 1;
      return { dispose: () => { harness.disposedTypes += 1; } };
    },
    themeColor: id => id,
    createRange: (line, character) => ({ line, character }),
    onDidChangeActiveTextEditor: callback => disposable(activeCallbacks, callback as Callback<TestEditor | undefined>),
    onDidChangeTextEditorSelection: callback => disposable(selectionCallbacks, callback as Callback<{ textEditor: TestEditor }>),
    onDidChangeTextDocument: callback => disposable(documentCallbacks, callback as Callback<{ document: object }>),
    onDidChangeWindowState: callback => disposable(windowCallbacks, callback),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancelScheduled: token => clearTimeout(token as ReturnType<typeof setTimeout>)
  };
  return harness;
}

function disposable<T>(values: T[], value: T) {
  values.push(value);
  return { dispose: vi.fn(() => { const index = values.indexOf(value); if (index >= 0) values.splice(index, 1); }) };
}

class TestEditor {
  readonly selection: { active: { line: number } };
  readonly document: {
    uri: { scheme: string };
    lineCount: number;
    lineAt(line: number): { text: string };
  };
  readonly applied: Array<Array<{ text: string }>> = [];
  clearCalls = 0;

  constructor(
    private readonly lines: string[],
    activeLine: number,
    scheme: string
  ) {
    this.selection = { active: { line: activeLine } };
    this.document = {
      uri: { scheme },
      lineCount: lines.length,
      lineAt: line => ({ text: lines[line] ?? '' })
    };
  }

  setDecorations(_type: unknown, options: Array<{ renderOptions?: { after?: { contentText?: string } } }>): void {
    if (options.length === 0) this.clearCalls += 1;
    this.applied.push(options.map(option => ({ text: option.renderOptions?.after?.contentText ?? '' })));
  }
}
