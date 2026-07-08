import { type ImportedTxtFile, normalizeImportedTxtFile } from '../domain/models';
import { type StateMemento } from './memento';
import { TXT_LIBRARY_KEY } from './storageKeys';

export class TxtLibraryStore {
  constructor(private readonly globalState: StateMemento) {}

  list(): ImportedTxtFile[] {
    const value = this.globalState.get<unknown>(TXT_LIBRARY_KEY);
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      const file = normalizeImportedTxtFile(entry);
      return file ? [file] : [];
    });
  }

  getById(fileId: string): ImportedTxtFile | undefined {
    return this.list().find((file) => file.id === fileId);
  }

  async upsert(file: ImportedTxtFile): Promise<ImportedTxtFile[]> {
    const normalizedFile = normalizeImportedTxtFile(file);
    if (!normalizedFile) {
      throw new Error('Cannot store an invalid imported TXT file.');
    }

    const files = this.list();
    const existingIndex = files.findIndex((existingFile) => existingFile.id === normalizedFile.id);
    if (existingIndex >= 0) {
      files[existingIndex] = normalizedFile;
    } else {
      files.push(normalizedFile);
    }

    await this.globalState.update(TXT_LIBRARY_KEY, files);
    return files;
  }

  async remove(fileId: string): Promise<ImportedTxtFile[]> {
    const files = this.list().filter((file) => file.id !== fileId);
    await this.globalState.update(TXT_LIBRARY_KEY, files);
    return files;
  }

  async replaceAll(files: ImportedTxtFile[]): Promise<ImportedTxtFile[]> {
    const normalizedFiles = files.flatMap((file) => {
      const normalizedFile = normalizeImportedTxtFile(file);
      return normalizedFile ? [normalizedFile] : [];
    });

    await this.globalState.update(TXT_LIBRARY_KEY, normalizedFiles);
    return normalizedFiles;
  }
}
