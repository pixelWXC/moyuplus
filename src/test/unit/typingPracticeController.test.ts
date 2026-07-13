import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultTypingPracticeSession } from '../../domain/models';
import { createBookCapabilities, type BookRecord } from '../../domain/books';
import { WorkspaceSessionStore } from '../../storage/workspaceSessionStore';
import { TypingPracticeController, TypingPracticeNoUsableLinesError } from '../../typing/TypingPracticeController';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initialValues: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

class FakeTypingSourceCatalog {
  readonly file: BookRecord = {
    schemaVersion: 2,
    id: 'file-1',
    uri: 'file:///book.txt',
    source: 'workspace',
    title: 'book.txt',
    authors: [],
    format: 'txt',
    formatData: { encoding: 'utf8' },
    capabilities: createBookCapabilities('txt'),
    createdAt: 1,
    updatedAt: 1
  };

  lines: string[] = [];

  list(): BookRecord[] {
    return [this.file];
  }

  async getPhysicalLines(fileId: string): Promise<string[]> {
    if (fileId !== this.file.id) {
      throw new Error(`Unknown file: ${fileId}`);
    }

    return this.lines;
  }
}

let typingSources: FakeTypingSourceCatalog;
let sessionStore: WorkspaceSessionStore;
let controller: TypingPracticeController;

beforeEach(() => {
  typingSources = new FakeTypingSourceCatalog();
  sessionStore = new WorkspaceSessionStore(new MemoryMemento());
  controller = new TypingPracticeController(typingSources, sessionStore);
});

describe('TypingPracticeController', () => {
  it('starts practice at the first usable physical line and saves workspace progress', async () => {
    typingSources.lines = ['', '  first line', 'second line'];

    const currentLine = await controller.start(typingSources.file.id);

    expect(currentLine).toEqual({
      fileId: 'file-1',
      fileName: 'book.txt',
      lineIndex: 1,
      lineNumber: 2,
      totalLines: 3,
      text: '  first line'
    });
    expect(sessionStore.getTypingPracticeSession()).toEqual({
      ...createDefaultTypingPracticeSession(),
      active: true,
      fileId: 'file-1',
      lineIndex: 1,
      totalLines: 3
    });
  });

  it('moves through usable physical lines, resets, and jumps by one-based line number', async () => {
    typingSources.lines = ['one', '', 'three'];
    await controller.start(typingSources.file.id);

    await expect(controller.nextLine()).resolves.toMatchObject({ lineNumber: 3, text: 'three' });
    await expect(controller.nextLine()).resolves.toMatchObject({ lineNumber: 3, text: 'three' });
    await expect(controller.jumpToLine(1)).resolves.toMatchObject({ lineNumber: 1, text: 'one' });
    await expect(controller.jumpToLine(2)).resolves.toMatchObject({ lineNumber: 3, text: 'three' });
    await expect(controller.reset()).resolves.toMatchObject({ lineNumber: 1, text: 'one' });
  });

  it('applies line filtering options before returning ghost text', async () => {
    sessionStore = new WorkspaceSessionStore(
      new MemoryMemento({
        'moyuplus.typingPracticeSession.v1': {
          ...createDefaultTypingPracticeSession(),
          trimLeadingSpaces: true,
          ignoreAllSpaces: true
        }
      })
    );
    controller = new TypingPracticeController(typingSources, sessionStore);
    typingSources.lines = ['  a b\tc'];

    await expect(controller.start(typingSources.file.id)).resolves.toMatchObject({ text: 'abc' });
  });

  it('calculates Tab completion edits from the configured mode and current editor prefix', async () => {
    typingSources.lines = ['hello world'];
    await controller.start(typingSources.file.id);

    await expect(controller.getTabCompletion('hello', 5, 'completeRest')).resolves.toEqual({
      mode: 'completeRest',
      text: ' world',
      replaceCurrentLine: false
    });
    await expect(controller.getTabCompletion('draft text', 5, 'replaceLine')).resolves.toEqual({
      mode: 'replaceLine',
      text: 'hello world',
      replaceCurrentLine: true
    });
  });

  it('trims both line edges when leading and trailing space options are enabled', async () => {
    sessionStore = new WorkspaceSessionStore(
      new MemoryMemento({
        'moyuplus.typingPracticeSession.v1': {
          ...createDefaultTypingPracticeSession(),
          trimLeadingSpaces: true,
          trimTrailingSpaces: true
        }
      })
    );
    controller = new TypingPracticeController(typingSources, sessionStore);
    typingSources.lines = ['   ', '  first line  '];

    await expect(controller.start(typingSources.file.id)).resolves.toMatchObject({
      lineNumber: 2,
      text: 'first line'
    });
  });

  it('stops practice so no current ghost text is available', async () => {
    typingSources.lines = ['one'];
    await controller.start(typingSources.file.id);

    await controller.stop();

    expect(await controller.getCurrentLine()).toBeUndefined();
    expect(sessionStore.getTypingPracticeSession()).toMatchObject({ active: false });
  });

  it('rejects files without a usable practice line', async () => {
    typingSources.lines = ['', '   '];

    await expect(controller.start(typingSources.file.id)).rejects.toBeInstanceOf(TypingPracticeNoUsableLinesError);
    expect(sessionStore.getTypingPracticeSession()).toEqual(createDefaultTypingPracticeSession());
  });

  it('safely stops a persisted practice session after its TXT is removed from the library', async () => {
    typingSources.lines = ['one'];
    await controller.start(typingSources.file.id);
    typingSources.list = () => [];

    await expect(controller.getCurrentLine()).resolves.toBeUndefined();
    expect(sessionStore.getTypingPracticeSession()).toMatchObject({ active: false });
  });

  it('never starts typing practice for an EPUB record', async () => {
    const epub: BookRecord = {
      ...typingSources.file,
      id: 'epub-1',
      uri: 'file:///book.epub',
      format: 'epub',
      formatData: {},
      capabilities: createBookCapabilities('epub')
    };
    typingSources.list = () => [epub];

    await expect(controller.start(epub.id)).rejects.toThrow('not available for typing practice');
  });
});
