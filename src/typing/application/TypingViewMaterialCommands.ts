import type { TxtEncoding } from '../../domain/books';
import {
  inferAdHocContentProfile,
  normalizeMaterialText,
  preparePracticeContent,
  type ContentProfile,
  type MaterialOrigin
} from '../domain/content';
import type { PracticeSetupDraft } from './PracticeSetupDraft';
import type { PracticeSetupConfiguration } from './PracticeSetupDraft';
import type {
  EpubMaterialChapterSummary
} from '../adapters/sources/EpubMaterialImporter';
import type { MaterialRemovalCoordinator } from './MaterialRemovalCoordinator';

interface TxtImportRequest {
  bytes: Uint8Array;
  encoding: TxtEncoding;
  title: string;
  sourceUri?: string;
  contentProfile?: ContentProfile;
}

interface EpubImportRequest {
  sourceUri: string;
  chapterIds?: string[];
  contentProfile?: ContentProfile;
}

export interface TypingViewSelectedTxtFile {
  bytes: Uint8Array;
  title: string;
  sourceUri?: string;
}

export interface TypingViewSelectedEpubFile {
  sourceUri: string;
}

export interface TypingViewMaterialCommandsOptions {
  draft: PracticeSetupDraft;
  txtImporter: {
    import(request: TxtImportRequest): PromiseLike<unknown>;
  };
  epubImporter: {
    import(request: EpubImportRequest): PromiseLike<unknown>;
    listChapters(sourceUri: string): PromiseLike<EpubMaterialChapterSummary[]>;
  };
  selectTxtFile(): PromiseLike<TypingViewSelectedTxtFile | undefined>;
  selectEpubFile(): PromiseLike<TypingViewSelectedEpubFile | undefined>;
  selectEpubChapters(
    chapters: readonly EpubMaterialChapterSummary[]
  ): PromiseLike<readonly string[] | undefined>;
  selectTxtEncoding(error: Error): PromiseLike<TxtEncoding | undefined>;
  reportError(error: Error): PromiseLike<void>;
  removals?: Pick<MaterialRemovalCoordinator, 'remove' | 'undo'>;
}

export class TypingViewMaterialCommands {
  constructor(private readonly options: TypingViewMaterialCommandsOptions) {}

  async selectMaterial(input: {
    materialId: string;
    materialOrigin: MaterialOrigin;
  }): Promise<boolean> {
    this.options.draft.selectContent(
      { kind: 'custom', materialId: input.materialId }
    );
    return true;
  }

  async removeMaterial(materialId: string): Promise<boolean> {
    if (!this.options.removals) return false;
    try {
      return await this.options.removals.remove(materialId);
    } catch (error) {
      await this.options.reportError(asError(error, 'Material removal failed.'));
      return false;
    }
  }

  async undoRemoveMaterial(materialId: string): Promise<boolean> {
    if (!this.options.removals) return false;
    try {
      return await this.options.removals.undo(materialId);
    } catch (error) {
      await this.options.reportError(asError(error, 'Material restore failed.'));
      return false;
    }
  }

  configureSetup(configuration: PracticeSetupConfiguration): boolean {
    this.options.draft.configure(configuration);
    return true;
  }

  async usePastedText(text: string): Promise<boolean> {
    try {
      const normalized = normalizeMaterialText(text);
      preparePracticeContent(normalized, {
        sourceRevision: 'ad-hoc-draft',
        contentProfile: inferAdHocContentProfile(normalized),
        range: { kind: 'whole' }
      });
      this.options.draft.selectContent({
        kind: 'adHoc',
        text: normalized
      });
      return true;
    } catch (error) {
      await this.options.reportError(asError(error, 'Pasted practice content is invalid.'));
      return false;
    }
  }

  async importTxt(): Promise<boolean> {
    let file: TypingViewSelectedTxtFile | undefined;
    try {
      file = await this.options.selectTxtFile();
    } catch (error) {
      await this.options.reportError(asError(error, 'TXT file selection failed.'));
      return false;
    }
    if (!file) return false;
    try {
      await this.options.txtImporter.import({
        ...file,
        encoding: 'utf8'
      });
      return true;
    } catch (error) {
      if (!isTxtDecodeError(error)) {
        await this.options.reportError(asError(error, 'TXT import failed.'));
        return false;
      }
      const encoding = await this.options.selectTxtEncoding(error);
      if (!encoding) return false;
      try {
        await this.options.txtImporter.import({
          ...file,
          encoding
        });
        return true;
      } catch (retryError) {
        await this.options.reportError(asError(retryError, 'TXT import failed.'));
        return false;
      }
    }
  }

  async importEpub(): Promise<boolean> {
    let file: TypingViewSelectedEpubFile | undefined;
    try {
      file = await this.options.selectEpubFile();
    } catch (error) {
      await this.options.reportError(asError(error, 'EPUB file selection failed.'));
      return false;
    }
    if (!file) return false;
    try {
      const chapters = await this.options.epubImporter.listChapters(file.sourceUri);
      if (chapters.length === 0) {
        throw new Error(
          'EPUB 中没有可用于打字练习的文本章节；纯图片章节需要先进行 OCR。'
        );
      }
      const chapterIds = await this.options.selectEpubChapters(chapters);
      if (!chapterIds || chapterIds.length === 0) return false;
      await this.options.epubImporter.import({
        ...file,
        chapterIds: [...chapterIds]
      });
      return true;
    } catch (error) {
      await this.options.reportError(asError(error, 'EPUB import failed.'));
      return false;
    }
  }
}

function isTxtDecodeError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'TxtDecodeError';
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}
