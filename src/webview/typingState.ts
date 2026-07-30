import {
  TYPING_VIEW_PRIMARY_PAGES,
  isHostToTypingViewMessage,
  type TypingViewPage,
  type TypingViewPageContent,
  type TypingViewLegacyResumeHint,
  type TypingViewRecoverySnapshot,
  type TypingViewSessionStatus
} from '../typing/adapters/view/typingViewProtocol';

export interface TypingViewState {
  instanceId: string;
  activePage: TypingViewPage;
  availablePages: readonly TypingViewPage[];
  activeSessionStatus: TypingViewSessionStatus | null;
  pendingResultCount: number;
  recovery: TypingViewRecoverySnapshot | null;
  legacyResumeHint: TypingViewLegacyResumeHint | null;
  content: TypingViewPageContent | null;
  snapshotRevision: number;
}

export function createTypingViewState(instanceId: string): TypingViewState {
  return {
    instanceId,
    activePage: 'materials',
    availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
    activeSessionStatus: null,
    pendingResultCount: 0,
    recovery: null,
    legacyResumeHint: null,
    content: null,
    snapshotRevision: 0
  };
}

export function reduceTypingViewMessage(
  state: TypingViewState,
  value: unknown
): TypingViewState {
  if (
    !isHostToTypingViewMessage(value)
    || value.instanceId !== state.instanceId
    || value.snapshotRevision <= state.snapshotRevision
  ) {
    return state;
  }
  return {
    instanceId: state.instanceId,
    activePage: value.snapshot.activePage,
    availablePages: [...value.snapshot.availablePages],
    activeSessionStatus: value.snapshot.activeSessionStatus,
    pendingResultCount: value.snapshot.pendingResultCount,
    recovery: value.snapshot.recovery
      ? structuredClone(value.snapshot.recovery)
      : null,
    legacyResumeHint: value.snapshot.legacyResumeHint
      ? structuredClone(value.snapshot.legacyResumeHint)
      : null,
    content: structuredClone(value.snapshot.content),
    snapshotRevision: value.snapshotRevision
  };
}
