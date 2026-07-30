import {
  TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
  type PracticePanelCorrectMessage,
  type PracticePanelSubmitMessage
} from '../typing/adapters/panel/typingPracticePanelProtocol';
import type {
  PracticeInputOrigin,
  PracticeSessionStatus
} from '../typing/domain/session';

export type PracticeInputCompositionState =
  | { kind: 'idle' }
  | {
    kind: 'composing';
    compositionId: string;
    draftText: string;
    discardOnEnd: boolean;
  };

export type PracticeInputAuthorityState =
  | { kind: 'loading' }
  | { kind: 'ready'; revision: number }
  | { kind: 'blocked'; revision: number; blockedAttemptId: string }
  | { kind: 'paused' | 'completed' | 'error'; revision: number };

export type PendingPracticeInputTransaction =
  | {
    type: 'submit';
    transactionId: string;
    inputKind: PracticeInputOrigin;
    text: string;
    envelope?: PracticePanelSubmitMessage;
  }
  | {
    type: 'correct';
    transactionId: string;
    envelope?: PracticePanelCorrectMessage;
  };

export interface TypingPracticeInputState {
  panelInstanceId: string;
  composition: PracticeInputCompositionState;
  transport: {
    pending: PendingPracticeInputTransaction[];
    nextSequence: number;
    resyncing: boolean;
  };
  authority: PracticeInputAuthorityState;
  suppressedCompositionInput?: {
    compositionId: string;
    domChangeSequence: number;
  };
}

export type TypingPracticeInputAction =
  | {
    type: 'snapshot';
    revision: number;
    status: PracticeSessionStatus;
    blockedAttemptId?: string;
  }
  | { type: 'compositionStart' }
  | { type: 'compositionUpdate'; text: string }
  | {
    type: 'compositionEnd';
    text: string;
    domChangeSequence: number;
  }
  | {
    type: 'directInput';
    text: string;
    domChangeSequence: number;
    compositionId?: string;
  }
  | { type: 'paste'; text: string }
  | { type: 'backspace' }
  | {
    type: 'ack';
    panelInstanceId: string;
    sequence: number;
    transactionId: string;
    outcome: 'applied' | 'blocked' | 'stale' | 'completed';
    currentRevision: number;
    blockedAttemptId?: string;
  }
  | { type: 'beginResync' };

export interface TypingPracticeInputEffect {
  type: 'postMessage';
  message: PracticePanelSubmitMessage | PracticePanelCorrectMessage;
}

export interface TypingPracticeInputTransition {
  state: TypingPracticeInputState;
  effects: TypingPracticeInputEffect[];
}

export interface PendingSmartQuoteProbe {
  opening: '“' | '‘';
  closing: '”' | '’';
}

export interface SmartQuoteInputResolution {
  probe?: PendingSmartQuoteProbe;
  submitText?: string;
  discard:
    | 'none'
    | 'previousOpening'
    | 'insertedOpening'
    | 'insertedClosing';
  suppressTrailingClosing?: PendingSmartQuoteProbe['closing'];
}

export interface TypingPracticeInputStateMachineOptions {
  sessionId: string;
  nextCompositionId(): string;
  nextTransactionId(): string;
}

export function createTypingPracticeInputState(
  panelInstanceId: string
): TypingPracticeInputState {
  return {
    panelInstanceId,
    composition: { kind: 'idle' },
    transport: {
      pending: [],
      nextSequence: 1,
      resyncing: false
    },
    authority: { kind: 'loading' }
  };
}

export function restoreTypingPracticeInputState(
  state: TypingPracticeInputState,
  panelInstanceId: string
): TypingPracticeInputState {
  return {
    panelInstanceId,
    composition: { kind: 'idle' },
    transport: {
      pending: state.transport.pending.map(pending => ({
        ...pending,
        envelope: undefined
      })),
      nextSequence: 1,
      resyncing: false
    },
    authority: { kind: 'loading' }
  };
}

const SMART_QUOTE_PAIRS: readonly PendingSmartQuoteProbe[] = [
  { opening: '“', closing: '”' },
  { opening: '‘', closing: '’' }
];

/**
 * Resolves only the local IME scaffolding needed to produce a closing smart
 * quote. The opening probe is never submitted as an attempt. All other text is
 * returned unchanged for the authoritative transaction engine to evaluate.
 */
export function resolveSmartQuoteInput(
  expected: string,
  followingExpected: string | undefined,
  text: string,
  probe?: PendingSmartQuoteProbe
): SmartQuoteInputResolution {
  if (probe) {
    if (expected !== probe.closing) {
      return {
        ...resolveSmartQuoteInput(expected, followingExpected, text),
        discard: 'previousOpening'
      };
    }
    if (text === probe.closing) {
      return {
        submitText: text,
        discard: 'previousOpening',
        suppressTrailingClosing: probe.closing
      };
    }
    if (text === probe.opening) {
      return { probe, discard: 'previousOpening' };
    }
    return {
      ...(text.length === 0 ? {} : { submitText: text }),
      discard: 'previousOpening'
    };
  }

  const closingPair = SMART_QUOTE_PAIRS.find(value => value.closing === expected);
  if (closingPair) {
    if (text === closingPair.opening) {
      return { probe: closingPair, discard: 'none' };
    }
    if (text === `${closingPair.opening}${closingPair.closing}`) {
      return {
        submitText: closingPair.closing,
        discard: 'insertedOpening',
        suppressTrailingClosing: closingPair.closing
      };
    }
    if (text === closingPair.closing) {
      return {
        submitText: text,
        discard: 'none',
        suppressTrailingClosing: closingPair.closing
      };
    }
    return {
      ...(text.length === 0 ? {} : { submitText: text }),
      discard: 'none'
    };
  }

  const openingPair = SMART_QUOTE_PAIRS.find(value => value.opening === expected);
  if (openingPair) {
    if (text === `${openingPair.opening}${openingPair.closing}`) {
      return followingExpected === openingPair.closing
        ? { submitText: text, discard: 'none' }
        : {
          submitText: openingPair.opening,
          discard: 'insertedClosing'
        };
    }
    if (text === openingPair.opening) {
      return {
        submitText: text,
        discard: 'none',
        ...(followingExpected === openingPair.closing
          ? {}
          : { suppressTrailingClosing: openingPair.closing })
      };
    }
  }

  return {
    ...(text.length === 0 ? {} : { submitText: text }),
    discard: 'none'
  };
}

export class TypingPracticeInputStateMachine {
  constructor(private readonly options: TypingPracticeInputStateMachineOptions) {}

  dispatch(
    state: TypingPracticeInputState,
    action: TypingPracticeInputAction
  ): TypingPracticeInputTransition {
    switch (action.type) {
      case 'snapshot':
        return this.snapshot(state, action);
      case 'compositionStart':
        return this.compositionStart(state);
      case 'compositionUpdate':
        return this.compositionUpdate(state, action.text);
      case 'compositionEnd':
        return this.compositionEnd(state, action.text, action.domChangeSequence);
      case 'directInput':
        return this.directInput(state, action);
      case 'paste':
        return canCaptureSubmit(state) && action.text.length > 0
          ? this.enqueueSubmit(state, 'paste', action.text)
          : unchanged(state);
      case 'backspace':
        return this.backspace(state);
      case 'ack':
        return this.ack(state, action);
      case 'beginResync': {
        const next = structuredClone(state);
        next.transport.resyncing = true;
        return { state: next, effects: [] };
      }
    }
  }

  private snapshot(
    state: TypingPracticeInputState,
    action: Extract<TypingPracticeInputAction, { type: 'snapshot' }>
  ): TypingPracticeInputTransition {
    const next = structuredClone(state);
    next.transport.resyncing = false;
    next.authority = authorityFromSnapshot(action);
    return flush(this.options.sessionId, next);
  }

  private compositionStart(
    state: TypingPracticeInputState
  ): TypingPracticeInputTransition {
    if (!canCaptureSubmit(state)) return unchanged(state);
    const next = structuredClone(state);
    next.composition = {
      kind: 'composing',
      compositionId: this.options.nextCompositionId(),
      draftText: '',
      discardOnEnd: false
    };
    delete next.suppressedCompositionInput;
    return { state: next, effects: [] };
  }

  private compositionUpdate(
    state: TypingPracticeInputState,
    text: string
  ): TypingPracticeInputTransition {
    if (state.composition.kind !== 'composing') return unchanged(state);
    const next = structuredClone(state);
    if (next.composition.kind === 'composing') {
      next.composition.draftText = text;
    }
    return { state: next, effects: [] };
  }

  private compositionEnd(
    state: TypingPracticeInputState,
    text: string,
    domChangeSequence: number
  ): TypingPracticeInputTransition {
    if (state.composition.kind !== 'composing') return unchanged(state);
    const composition = state.composition;
    const next = structuredClone(state);
    next.composition = { kind: 'idle' };
    next.suppressedCompositionInput = {
      compositionId: composition.compositionId,
      domChangeSequence
    };
    if (
      composition.discardOnEnd
      || text.length === 0
      || !canCaptureSubmit(next)
    ) {
      return { state: next, effects: [] };
    }
    return this.enqueueSubmit(next, 'composition', text);
  }

  private directInput(
    state: TypingPracticeInputState,
    action: Extract<TypingPracticeInputAction, { type: 'directInput' }>
  ): TypingPracticeInputTransition {
    if (
      state.suppressedCompositionInput
      && action.compositionId === state.suppressedCompositionInput.compositionId
      && action.domChangeSequence === state.suppressedCompositionInput.domChangeSequence
    ) {
      const next = structuredClone(state);
      delete next.suppressedCompositionInput;
      return { state: next, effects: [] };
    }
    if (!canCaptureSubmit(state) || action.text.length === 0) {
      return unchanged(state);
    }
    const next = structuredClone(state);
    delete next.suppressedCompositionInput;
    return this.enqueueSubmit(next, 'direct', action.text);
  }

  private enqueueSubmit(
    state: TypingPracticeInputState,
    inputKind: PracticeInputOrigin,
    text: string
  ): TypingPracticeInputTransition {
    const next = structuredClone(state);
    next.transport.pending.push({
      type: 'submit',
      transactionId: this.options.nextTransactionId(),
      inputKind,
      text
    });
    return flush(this.options.sessionId, next);
  }

  private backspace(
    state: TypingPracticeInputState
  ): TypingPracticeInputTransition {
    if (
      state.authority.kind !== 'blocked'
      || state.transport.resyncing
      || state.transport.pending.some(value => value.type === 'correct')
    ) {
      return unchanged(state);
    }
    const next = structuredClone(state);
    next.transport.pending.push({
      type: 'correct',
      transactionId: this.options.nextTransactionId()
    });
    return flush(this.options.sessionId, next);
  }

  private ack(
    state: TypingPracticeInputState,
    action: Extract<TypingPracticeInputAction, { type: 'ack' }>
  ): TypingPracticeInputTransition {
    const head = state.transport.pending[0];
    if (
      !head?.envelope
      || action.panelInstanceId !== state.panelInstanceId
      || action.panelInstanceId !== head.envelope.panelInstanceId
      || action.sequence !== head.envelope.sequence
      || action.transactionId !== head.transactionId
    ) {
      return unchanged(state);
    }
    const next = structuredClone(state);
    if (action.outcome === 'stale') {
      const staleHead = next.transport.pending[0];
      if (staleHead) staleHead.envelope = undefined;
      next.transport.resyncing = true;
      next.authority = { kind: 'loading' };
      return { state: next, effects: [] };
    }

    next.transport.pending.shift();
    if (action.outcome === 'blocked') {
      next.authority = {
        kind: 'blocked',
        revision: action.currentRevision,
        blockedAttemptId: action.blockedAttemptId ?? 'blocked'
      };
      next.transport.pending = next.transport.pending
        .filter(value => value.type !== 'submit');
      if (next.composition.kind === 'composing') {
        next.composition.discardOnEnd = true;
      }
      return { state: next, effects: [] };
    }
    if (action.outcome === 'completed') {
      next.authority = {
        kind: 'completed',
        revision: action.currentRevision
      };
      next.transport.pending = [];
      return { state: next, effects: [] };
    }
    next.authority = { kind: 'ready', revision: action.currentRevision };
    return flush(this.options.sessionId, next);
  }
}

function flush(
  sessionId: string,
  state: TypingPracticeInputState
): TypingPracticeInputTransition {
  if (state.transport.resyncing) return { state, effects: [] };
  const revision = authorityRevisionForSend(state.authority);
  const head = state.transport.pending[0];
  if (revision === undefined || !head || head.envelope) {
    return { state, effects: [] };
  }
  const sequence = state.transport.nextSequence;
  state.transport.nextSequence += 1;
  const common = {
    protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
    sessionId,
    panelInstanceId: state.panelInstanceId,
    sequence,
    transactionId: head.transactionId,
    baseRevision: revision
  } as const;
  head.envelope = head.type === 'submit'
    ? {
      ...common,
      type: 'practice/submit',
      inputKind: head.inputKind,
      text: head.text
    }
    : {
      ...common,
      type: 'practice/correct'
    };
  return {
    state,
    effects: [{
      type: 'postMessage',
      message: structuredClone(head.envelope)
    }]
  };
}

function canCaptureSubmit(state: TypingPracticeInputState): boolean {
  return !state.transport.resyncing
    && (
      state.authority.kind === 'ready'
      || (
        state.authority.kind === 'blocked'
        && state.transport.pending.some(value => value.type === 'correct')
      )
    );
}

function authorityRevisionForSend(
  authority: PracticeInputAuthorityState
): number | undefined {
  return authority.kind === 'ready' || authority.kind === 'blocked'
    ? authority.revision
    : undefined;
}

function authorityFromSnapshot(
  action: Extract<TypingPracticeInputAction, { type: 'snapshot' }>
): PracticeInputAuthorityState {
  switch (action.status) {
    case 'running':
    case 'ready':
      return { kind: 'ready', revision: action.revision };
    case 'blockedOnError':
      return {
        kind: 'blocked',
        revision: action.revision,
        blockedAttemptId: action.blockedAttemptId ?? 'blocked'
      };
    case 'paused':
      return { kind: 'paused', revision: action.revision };
    case 'completed':
      return { kind: 'completed', revision: action.revision };
    default:
      return { kind: 'error', revision: action.revision };
  }
}

function unchanged(state: TypingPracticeInputState): TypingPracticeInputTransition {
  return { state, effects: [] };
}
