import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { createHash } from 'node:crypto';
import iconv from 'iconv-lite';
import { type ImportedTxtFile, type TxtEncoding, type TxtFileSource } from '../domain/models';
import { TxtLibraryStore } from '../storage/txtLibraryStore';

export class TxtFileMissingError extends Error {
  constructor(readonly file: ImportedTxtFile) {
    super(`Imported TXT file is missing or unavailable: ${file.name}`);
    this.name = 'TxtFileMissingError';
  }
}

export class TxtFileNotImportedError extends Error {
  constructor(readonly fileId: string) {
    super(`Imported TXT file record was not found: ${fileId}`);
    this.name = 'TxtFileNotImportedError';
  }
}

export class TxtDecodeError extends Error {
  constructor(readonly encoding: TxtEncoding, cause?: unknown) {
    super(`Failed to decode TXT file as ${formatEncodingName(encoding)}.`);
    this.name = 'TxtDecodeError';
    this.cause = cause;
  }
}

export interface ImportTxtFileInput {
  uri: string;
  encoding: TxtEncoding;
  workspaceFolderUris: string[];
}

interface TxtFileSystem {
  readFile(filePath: string): Promise<Buffer>;
  stat(filePath: string): Promise<{ isFile(): boolean }>;
}

interface TxtFileServiceOptions {
  fileSystem?: TxtFileSystem;
  now?: () => number;
}

const nodeFileSystem: TxtFileSystem = {
  readFile: fs.readFile,
  stat: fs.stat
};

export function decodeTxtBuffer(buffer: Buffer, encoding: TxtEncoding): string {
  const decoded =
    encoding === 'utf8'
      ? decodeUtf8(buffer)
      : iconv.decode(buffer, 'gbk');

  return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
}

export function splitPhysicalLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

export function determineTxtFileSource(fileUri: string, workspaceFolderUris: string[]): TxtFileSource {
  const filePath = normalizePath(fileUriToPath(fileUri));

  for (const workspaceFolderUri of workspaceFolderUris) {
    const workspacePath = normalizePath(fileUriToPath(workspaceFolderUri));
    const relativePath = path.relative(workspacePath, filePath);
    if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
      return 'workspace';
    }
  }

  return 'external';
}

export class TxtFileService {
  private readonly fileSystem: TxtFileSystem;
  private readonly now: () => number;

  constructor(private readonly libraryStore: TxtLibraryStore, options: TxtFileServiceOptions = {}) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
    this.now = options.now ?? Date.now;
  }

  listImportedFiles(): ImportedTxtFile[] {
    return this.libraryStore.list();
  }

  async importTxtFile(input: ImportTxtFileInput): Promise<ImportedTxtFile> {
    await this.assertUriAvailable(input.uri);
    const now = this.now();
    const existingFile = this.libraryStore.list().find((file) => file.uri === input.uri);
    const file: ImportedTxtFile = {
      id: existingFile?.id ?? createImportedTxtFileId(input.uri),
      name: path.basename(fileUriToPath(input.uri)),
      uri: input.uri,
      encoding: input.encoding,
      source: determineTxtFileSource(input.uri, input.workspaceFolderUris),
      createdAt: existingFile?.createdAt ?? now,
      updatedAt: now
    };

    await this.libraryStore.upsert(file);
    return file;
  }

  async removeImportedFile(fileId: string): Promise<ImportedTxtFile[]> {
    return this.libraryStore.remove(fileId);
  }

  async updateImportedFileEncoding(fileId: string, encoding: TxtEncoding): Promise<ImportedTxtFile> {
    const file = this.getImportedFile(fileId);
    const updated: ImportedTxtFile = {
      ...file,
      encoding,
      updatedAt: this.now()
    };
    await this.libraryStore.upsert(updated);
    return updated;
  }

  async readFullText(fileId: string): Promise<string> {
    const file = this.getImportedFile(fileId);
    const buffer = await this.readImportedFileBuffer(file);
    return decodeTxtBuffer(buffer, file.encoding);
  }

  async readPracticePhysicalLines(fileId: string): Promise<string[]> {
    return splitPhysicalLines(await this.readFullText(fileId));
  }

  async findInvalidImportedFiles(): Promise<ImportedTxtFile[]> {
    const invalidFiles: ImportedTxtFile[] = [];
    for (const file of this.libraryStore.list()) {
      if (!(await this.isUriAvailable(file.uri))) {
        invalidFiles.push(file);
      }
    }

    return invalidFiles;
  }

  private getImportedFile(fileId: string): ImportedTxtFile {
    const file = this.libraryStore.getById(fileId);
    if (!file) {
      throw new TxtFileNotImportedError(fileId);
    }

    return file;
  }

  private async readImportedFileBuffer(file: ImportedTxtFile): Promise<Buffer> {
    if (!(await this.isUriAvailable(file.uri))) {
      throw new TxtFileMissingError(file);
    }

    return this.fileSystem.readFile(fileUriToPath(file.uri));
  }

  private async assertUriAvailable(uri: string): Promise<void> {
    if (!(await this.isUriAvailable(uri))) {
      throw new Error(`TXT file is missing or unavailable: ${uri}`);
    }
  }

  private async isUriAvailable(uri: string): Promise<boolean> {
    try {
      const stat = await this.fileSystem.stat(fileUriToPath(uri));
      return stat.isFile();
    } catch {
      return false;
    }
  }
}

function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new TxtDecodeError('utf8', error);
  }
}

function createImportedTxtFileId(uri: string): string {
  return `txt-${createHash('sha1').update(uri).digest('hex').slice(0, 16)}`;
}

function formatEncodingName(encoding: TxtEncoding): string {
  return encoding === 'utf8' ? 'UTF-8' : 'GBK';
}

function fileUriToPath(uri: string): string {
  return fileURLToPath(uri);
}

function normalizePath(filePath: string): string {
  const normalizedPath = path.resolve(filePath);
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}
