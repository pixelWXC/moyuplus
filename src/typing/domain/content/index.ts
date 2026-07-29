import type {
  DisplayPolicy,
  EvaluationPolicy,
  FlowPolicy,
  TextPolicy
} from '../policies';

export const TYPING_SCHEMA_VERSION = 1;

export type MaterialOrigin =
  | 'custom'
  | 'txtImport'
  | 'epubImport'
  | 'readerBook'
  | 'generated'
  | 'mastery'
  | 'adHoc';

export type ContentProfile =
  | {
    kind: 'chinese';
    category: 'modernArticle' | 'news' | 'fiction' | 'commonSentence' | 'adHoc';
  }
  | {
    kind: 'english';
    category: 'word' | 'sentence' | 'article' | 'adHoc';
  }
  | {
    kind: 'mixed';
    category: 'programmer' | 'office' | 'adHoc';
  }
  | {
    kind: 'randomChinese';
    category: 'frequentHanzi' | 'idiom' | 'phrase';
  }
  | {
    kind: 'numberSymbol';
    category: 'phone' | 'date' | 'amount' | 'punctuation' | 'specialSymbol';
  }
  | {
    kind: 'code';
    language: 'javascript' | 'typescript' | 'html' | 'css' | (string & {});
  }
  | {
    kind: 'mastery';
    category: 'grapheme' | 'word' | 'codeToken' | 'mixed';
  };

export type MaterialSourceRef =
  | { kind: 'managed'; bodyRevision: string }
  | { kind: 'txtImport'; originalUri?: string; encoding: string }
  | { kind: 'epubImport'; originalUri?: string; chapterIds: string[] }
  | { kind: 'readerBook'; bookId: string }
  | { kind: 'generated'; generator: GeneratorKind; seed: string; algorithmVersion: string }
  | { kind: 'adHoc' };

export interface MaterialCounts {
  graphemes: number;
  hanGraphemes: number;
  englishWords: number;
  printableUnits: number;
}

export interface PracticeMaterialRecord {
  schemaVersion: number;
  id: string;
  revision: string;
  title: string;
  origin: MaterialOrigin;
  contentProfile: ContentProfile;
  tags: string[];
  source: MaterialSourceRef;
  chapters?: MaterialChapterIndex[];
  counts: MaterialCounts;
  estimatedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface MaterialChapterIndex {
  id: string;
  title?: string;
  start: number;
  end: number;
}

export type GeneratorKind =
  | 'commonSentences'
  | 'englishWords'
  | 'englishSentences'
  | 'mixedProgrammer'
  | 'mixedOffice'
  | 'frequentHanzi'
  | 'idiom'
  | 'phrase'
  | 'phone'
  | 'date'
  | 'amount'
  | 'punctuation'
  | 'specialSymbol'
  | 'code'
  | 'mastery';

export type ContentRecipe =
  | { kind: 'custom'; materialId: string }
  | { kind: 'readerBook'; bookId: string; suggestedSectionId?: string }
  | { kind: 'generated'; generator: GeneratorKind; seed: string; length?: number }
  | { kind: 'mastery'; seed: string; length: number }
  | { kind: 'adHoc'; text: string }
  | { kind: 'online'; providerId: string; contentId: string };

export type CompletionConstraint =
  | { kind: 'timed'; seconds: 60 | 180 | 300 | number }
  | { kind: 'length'; targetUnits: 100 | 500 | number }
  | { kind: 'sourceRange'; range: 'article' | 'chapter' | 'selection' }
  | { kind: 'free' };

export type SourceRange =
  | { kind: 'whole' }
  | { kind: 'article'; articleId?: string }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'selection'; start: number; end: number };

export interface PracticePlan {
  contentRecipe: ContentRecipe;
  completion: CompletionConstraint;
  evaluation: EvaluationPolicy;
  textPolicy: TextPolicy;
  flowPolicy: FlowPolicy;
  displayPolicy: DisplayPolicy;
}

export type TargetUnitKind = 'grapheme' | 'space' | 'tab' | 'lineBreak';

export interface TargetUnit {
  index: number;
  value: string;
  display: string;
  kind: TargetUnitKind;
  lineIndex: number;
  wordKey?: string;
}

export interface PracticeDisplayLine {
  index: number;
  text: string;
  targetStart: number;
  targetEnd: number;
}

export interface PracticeSnapshot {
  schemaVersion: number;
  id: string;
  materialId?: string;
  sourceRevision: string;
  contentProfile: ContentProfile;
  plan: PracticePlan;
  generatorSeed?: string;
  targetUnits: TargetUnit[];
  displayLines: PracticeDisplayLine[];
  selectedRange: SourceRange;
  createdAt: number;
}

export interface PreparedContent {
  materialId?: string;
  sourceRevision: string;
  contentProfile: ContentProfile;
  generatorSeed?: string;
  normalizedText: string;
  counts: MaterialCounts;
  estimatedSeconds: number;
  selectedRange: SourceRange;
  targetUnits: TargetUnit[];
  displayLines: PracticeDisplayLine[];
}

export interface ContentDescriptor {
  title: string;
  sourceRevision: string;
  contentProfile: ContentProfile;
  counts: MaterialCounts;
  ranges: SourceRange[];
}

export interface ContentProvider {
  canResolve(recipe: ContentRecipe): boolean;
  inspect(recipe: ContentRecipe): Promise<ContentDescriptor>;
  prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent>;
}

export interface CreateDefaultPracticePlanOptions {
  contentRecipe: ContentRecipe;
  contentProfile: ContentProfile;
  completion?: CompletionConstraint;
}

export function createDefaultPracticePlan(
  options: CreateDefaultPracticePlanOptions
): PracticePlan {
  const isCode = options.contentProfile.kind === 'code';
  const isChinese = options.contentProfile.kind === 'chinese';
  const completion = options.completion ?? {
    kind: 'sourceRange',
    range: 'article'
  };

  return {
    contentRecipe: options.contentRecipe,
    completion,
    evaluation: {
      errorPolicy: 'block'
    },
    textPolicy: {
      punctuation: isChinese
        ? { mode: 'equivalent', mappingVersion: 'zh-punctuation-v1' }
        : { mode: 'strict', mappingVersion: 'strict-v1' },
      whitespace: isCode ? { mode: 'strict' } : { mode: 'trimLineEdges' },
      caseSensitive: true
    },
    flowPolicy: {
      lineAdvance: isCode ? 'enter' : 'automatic',
      presentation: 'continuous'
    },
    displayPolicy: {
      showLiveMetrics: true,
      showWhitespace: false
    }
  };
}

export * from './contentPreparation';
