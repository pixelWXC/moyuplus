import type {
  ContentRecipe,
  PracticePlan,
  SourceRange
} from '../domain/content';
import type { PracticeAppearancePreferences } from '../domain/policies';

export interface PracticeSetupDraftSnapshot {
  contentRecipe: ContentRecipe;
  selectedRange?: SourceRange;
  plan?: PracticePlan;
  startPosition?: PracticeStartPosition;
}

export type PracticeStartPosition =
  | { kind: 'beginning' }
  | { kind: 'continuation' }
  | { kind: 'percentage'; percent: number };

export interface PracticeSetupConfiguration {
  selectedRange: SourceRange;
  plan: Omit<PracticePlan, 'contentRecipe'>;
  startPosition?: PracticeStartPosition;
  appearance?: PracticeAppearancePreferences;
}

export class PracticeSetupDraft {
  private current?: PracticeSetupDraftSnapshot;

  selectContent(
    contentRecipe: ContentRecipe,
    selectedRange?: SourceRange
  ): void {
    this.current = {
      contentRecipe: structuredClone(contentRecipe),
      ...(selectedRange
        ? { selectedRange: structuredClone(selectedRange) }
        : {})
    };
  }

  configure(configuration: PracticeSetupConfiguration): void {
    if (!this.current) {
      throw new Error('Practice setup source has not been selected.');
    }
    this.current = {
      contentRecipe: structuredClone(this.current.contentRecipe),
      selectedRange: structuredClone(configuration.selectedRange),
      startPosition: structuredClone(
        configuration.startPosition ?? { kind: 'beginning' }
      ),
      plan: {
        contentRecipe: structuredClone(this.current.contentRecipe),
        ...structuredClone(configuration.plan)
      }
    };
  }

  snapshot(): PracticeSetupDraftSnapshot | undefined {
    return this.current ? structuredClone(this.current) : undefined;
  }
}
