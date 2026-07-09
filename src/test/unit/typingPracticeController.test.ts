import { beforeEach, describe, expect, it } from 'vitest';
import { type ImportedTxtFile, createDefaultTypingPracticeSession } from '../../domain/models';
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

class FakeTxtFileService {
  readonly file: ImportedTxtFile = {
    id: 'file-1',
    name: 'book.txt',
    uri: 'file:///book.txt',
    encoding: 'utf8',
    source: 'workspace',
    createdAt: 1,
    updatedAt: 1
  };

  lines: string[] = [];

  listImportedFiles(): ImportedTxtFile[] {
    return [this.file];
  }

  async readPracticePhysicalLines(fileId: string): Promise<string[]> {
    if (fileId !== this.file.id) {
      throw new Error(`Unknown file: ${fileId}`);
    }

    return this.lines;
  }
}

let txtFileService: FakeTxtFileService;
let sessionStore: WorkspaceSessionStore;
let controller: TypingPracticeController;

beforeEach(() => {
  txtFileService = new FakeTxtFileService();
  sessionStore = new WorkspaceSessionStore(new MemoryMemento());
  controller = new TypingPracticeController(txtFileService, sessionStore);
});

describe('TypingPracticeController', () => {
  it('starts practice at the first usable physical line and saves workspace progress', async () => {
    txtFileService.lines = ['', '  first line', 'second line'];

    const currentLine = await controller.start(txtFileService.file.id);

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
    txtFileService.lines = ['one', '', 'three'];
    await controller.start(txtFileService.file.id);

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
    controller = new TypingPracticeController(txtFileService, sessionStore);
    txtFileService.lines = ['  a b\tc'];

    await expect(controller.start(txtFileService.file.id)).resolves.toMatchObject({ text: 'abc' });
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
    controller = new TypingPracticeController(txtFileService, sessionStore);
    txtFileService.lines = ['   ', '  first line  '];

    await expect(controller.start(txtFileService.file.id)).resolves.toMatchObject({
      lineNumber: 2,
      text: 'first line'
    });
  });

  it('stops practice so no current ghost text is available', async () => {
    txtFileService.lines = ['one'];
    await controller.start(txtFileService.file.id);

    await controller.stop();

    expect(await controller.getCurrentLine()).toBeUndefined();
    expect(sessionStore.getTypingPracticeSession()).toMatchObject({ active: false });
  });

  it('rejects files without a usable practice line', async () => {
    txtFileService.lines = ['', '   '];

    await expect(controller.start(txtFileService.file.id)).rejects.toBeInstanceOf(TypingPracticeNoUsableLinesError);
    expect(sessionStore.getTypingPracticeSession()).toEqual(createDefaultTypingPracticeSession());
  });
});
