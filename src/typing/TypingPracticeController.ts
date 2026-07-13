import { type TypingTabMode, type TypingPracticeSession } from '../domain/models';
import type { BookRecord } from '../domain/books';
import { type WorkspaceSessionStore } from '../storage/workspaceSessionStore';
import type { TypingSourceCatalogLike } from './typingSourceCatalog';

export interface TypingPracticeLine {
  fileId: string;
  fileName: string;
  lineIndex: number;
  lineNumber: number;
  totalLines: number;
  text: string;
}

export interface TypingTabCompletion {
  mode: TypingTabMode;
  text: string;
  replaceCurrentLine: boolean;
}

export class TypingPracticeFileNotFoundError extends Error {
  constructor(readonly fileId: string) {
    super(`Imported TXT file record was not found: ${fileId}`);
    this.name = 'TypingPracticeFileNotFoundError';
  }
}

export class TypingPracticeNoUsableLinesError extends Error {
  constructor(readonly file: BookRecord) {
    super(`TXT file has no usable practice lines: ${file.title}`);
    this.name = 'TypingPracticeNoUsableLinesError';
  }
}

export class TypingPracticeController {
  private linesCache?: { fileId: string; lines: string[] };

  constructor(
    private readonly typingSources: TypingSourceCatalogLike,
    private readonly sessionStore: WorkspaceSessionStore
  ) {}

  listPracticeFiles(): BookRecord[] {
    return this.typingSources.list();
  }

  async start(fileId: string): Promise<TypingPracticeLine> {
    const file = this.getImportedFile(fileId);
    const lines = await this.loadLines(file.id);
    const session = this.sessionStore.getTypingPracticeSession();
    const lineIndex = this.findNextUsableLineIndex(lines, 0, session);
    if (lineIndex === undefined) {
      throw new TypingPracticeNoUsableLinesError(file);
    }

    const nextSession: TypingPracticeSession = {
      ...session,
      active: true,
      fileId: file.id,
      lineIndex,
      totalLines: lines.length
    };

    await this.sessionStore.saveTypingPracticeSession(nextSession);
    return this.toPracticeLine(file, lines[lineIndex], nextSession);
  }

  async stop(): Promise<void> {
    const session = this.sessionStore.getTypingPracticeSession();
    await this.sessionStore.saveTypingPracticeSession({
      ...session,
      active: false,
      lineIndex: 0,
      totalLines: 0
    });
  }

  async getCurrentLine(): Promise<TypingPracticeLine | undefined> {
    const session = this.sessionStore.getTypingPracticeSession();
    if (!session.active || !session.fileId) {
      return undefined;
    }

    const file = this.getPracticeFile(session.fileId);
    if (!file) {
      await this.stop();
      return undefined;
    }
    const lines = await this.loadLines(file.id);
    const lineIndex = this.findNearestUsableLineIndex(lines, session.lineIndex, session);
    if (lineIndex === undefined) {
      return undefined;
    }

    const normalizedSession: TypingPracticeSession = {
      ...session,
      lineIndex,
      totalLines: lines.length
    };
    if (lineIndex !== session.lineIndex || lines.length !== session.totalLines) {
      await this.sessionStore.saveTypingPracticeSession(normalizedSession);
    }

    return this.toPracticeLine(file, lines[lineIndex], normalizedSession);
  }

  async getTabCompletion(
    editorLineText: string,
    cursorCharacter: number,
    tabMode?: TypingTabMode
  ): Promise<TypingTabCompletion | undefined> {
    const currentLine = await this.getCurrentLine();
    if (!currentLine) {
      return undefined;
    }

    const session = this.sessionStore.getTypingPracticeSession();
    const mode = tabMode ?? session.tabMode;
    if (mode === 'replaceLine') {
      return {
        mode,
        text: currentLine.text,
        replaceCurrentLine: true
      };
    }

    const prefixEnd = Math.max(0, Math.min(Math.trunc(cursorCharacter), editorLineText.length));
    const linePrefix = editorLineText.slice(0, prefixEnd);
    const text = currentLine.text.startsWith(linePrefix)
      ? currentLine.text.slice(linePrefix.length)
      : currentLine.text;
    if (text.length === 0) {
      return undefined;
    }

    return {
      mode,
      text,
      replaceCurrentLine: false
    };
  }

  async nextLine(): Promise<TypingPracticeLine | undefined> {
    const session = this.sessionStore.getTypingPracticeSession();
    if (!session.active || !session.fileId) {
      return undefined;
    }

    const file = this.getImportedFile(session.fileId);
    const lines = await this.loadLines(file.id);
    const nextLineIndex =
      this.findNextUsableLineIndex(lines, session.lineIndex + 1, session) ??
      this.findNearestUsableLineIndex(lines, session.lineIndex, session);
    if (nextLineIndex === undefined) {
      throw new TypingPracticeNoUsableLinesError(file);
    }

    const nextSession: TypingPracticeSession = {
      ...session,
      lineIndex: nextLineIndex,
      totalLines: lines.length
    };
    await this.sessionStore.saveTypingPracticeSession(nextSession);
    return this.toPracticeLine(file, lines[nextLineIndex], nextSession);
  }

  async reset(): Promise<TypingPracticeLine | undefined> {
    const session = this.sessionStore.getTypingPracticeSession();
    if (!session.active || !session.fileId) {
      return undefined;
    }

    const file = this.getImportedFile(session.fileId);
    const lines = await this.loadLines(file.id);
    const lineIndex = this.findNextUsableLineIndex(lines, 0, session);
    if (lineIndex === undefined) {
      throw new TypingPracticeNoUsableLinesError(file);
    }

    const nextSession: TypingPracticeSession = {
      ...session,
      lineIndex,
      totalLines: lines.length
    };
    await this.sessionStore.saveTypingPracticeSession(nextSession);
    return this.toPracticeLine(file, lines[lineIndex], nextSession);
  }

  async jumpToLine(lineNumber: number): Promise<TypingPracticeLine | undefined> {
    const session = this.sessionStore.getTypingPracticeSession();
    if (!session.active || !session.fileId) {
      return undefined;
    }

    const file = this.getImportedFile(session.fileId);
    const lines = await this.loadLines(file.id);
    const requestedIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(lineNumber) - 1));
    const lineIndex =
      this.findNextUsableLineIndex(lines, requestedIndex, session) ??
      this.findPreviousUsableLineIndex(lines, requestedIndex, session);
    if (lineIndex === undefined) {
      throw new TypingPracticeNoUsableLinesError(file);
    }

    const nextSession: TypingPracticeSession = {
      ...session,
      lineIndex,
      totalLines: lines.length
    };
    await this.sessionStore.saveTypingPracticeSession(nextSession);
    return this.toPracticeLine(file, lines[lineIndex], nextSession);
  }

  async toggleLineEdgeTrimming(): Promise<TypingPracticeLine | undefined> {
    const session = this.sessionStore.getTypingPracticeSession();
    const enabled = !(session.trimLeadingSpaces && session.trimTrailingSpaces);
    await this.sessionStore.saveTypingPracticeSession({
      ...session,
      trimLeadingSpaces: enabled,
      trimTrailingSpaces: enabled
    });

    return this.getCurrentLine();
  }

  private getImportedFile(fileId: string): BookRecord {
    const file = this.getPracticeFile(fileId);
    if (!file) {
      throw new Error(`Book ${fileId} is not available for typing practice.`);
    }

    return file;
  }

  private getPracticeFile(fileId: string): BookRecord | undefined {
    return this.typingSources
      .list()
      .find((candidate) => candidate.id === fileId && candidate.format === 'txt' && candidate.capabilities.typing);
  }

  private async loadLines(fileId: string): Promise<string[]> {
    if (this.linesCache?.fileId === fileId) {
      return this.linesCache.lines;
    }

    const lines = await this.typingSources.getPhysicalLines(fileId);
    this.linesCache = { fileId, lines };
    return lines;
  }

  private findNearestUsableLineIndex(
    lines: string[],
    startIndex: number,
    session: TypingPracticeSession
  ): number | undefined {
    return (
      this.findNextUsableLineIndex(lines, startIndex, session) ??
      this.findPreviousUsableLineIndex(lines, startIndex, session)
    );
  }

  private findNextUsableLineIndex(
    lines: string[],
    startIndex: number,
    session: TypingPracticeSession
  ): number | undefined {
    for (let index = Math.max(0, startIndex); index < lines.length; index += 1) {
      if (this.isUsableLine(lines[index], session)) {
        return index;
      }
    }

    return undefined;
  }

  private findPreviousUsableLineIndex(
    lines: string[],
    startIndex: number,
    session: TypingPracticeSession
  ): number | undefined {
    for (let index = Math.min(lines.length - 1, startIndex); index >= 0; index -= 1) {
      if (this.isUsableLine(lines[index], session)) {
        return index;
      }
    }

    return undefined;
  }

  private isUsableLine(line: string | undefined, session: TypingPracticeSession): boolean {
    if (line === undefined) {
      return false;
    }

    return !session.skipEmptyLines || (line.trim().length > 0 && this.formatPracticeText(line, session).length > 0);
  }

  private toPracticeLine(
    file: BookRecord,
    rawLine: string,
    session: TypingPracticeSession
  ): TypingPracticeLine {
    return {
      fileId: file.id,
      fileName: file.title,
      lineIndex: session.lineIndex,
      lineNumber: session.lineIndex + 1,
      totalLines: session.totalLines,
      text: this.formatPracticeText(rawLine, session)
    };
  }

  private formatPracticeText(rawLine: string, session: TypingPracticeSession): string {
    let text = rawLine;
    if (session.trimLeadingSpaces) {
      text = text.trimStart();
    }
    if (session.trimTrailingSpaces) {
      text = text.trimEnd();
    }
    if (session.ignoreAllSpaces) {
      text = text.replace(/\s+/g, '');
    }

    return text;
  }
}
