import type {
  PracticeInputTransactionAck,
  PracticePanelSnapshot
} from '../../application';
import type { PracticeInputOrigin } from '../../domain/session';

export const TYPING_PRACTICE_PANEL_PROTOCOL_VERSION = 1;

interface PracticePanelMessageBase {
  protocolVersion: typeof TYPING_PRACTICE_PANEL_PROTOCOL_VERSION;
  sessionId: string;
  panelInstanceId: string;
  sequence: number;
}

export interface PracticePanelReadyMessage extends PracticePanelMessageBase {
  type: 'practice/ready';
}

export interface PracticePanelRequestSnapshotMessage
  extends PracticePanelMessageBase {
  type: 'practice/requestSnapshot';
}

export interface PracticePanelPauseMessage extends PracticePanelMessageBase {
  type: 'practice/pause';
}

export interface PracticePanelResumeMessage extends PracticePanelMessageBase {
  type: 'practice/resume';
}

export interface PracticePanelSubmitMessage extends PracticePanelMessageBase {
  type: 'practice/submit';
  transactionId: string;
  baseRevision: number;
  inputKind: PracticeInputOrigin;
  text: string;
}

export interface PracticePanelCorrectMessage extends PracticePanelMessageBase {
  type: 'practice/correct';
  transactionId: string;
  baseRevision: number;
}

export type PracticePanelClientMessage =
  | PracticePanelReadyMessage
  | PracticePanelRequestSnapshotMessage
  | PracticePanelPauseMessage
  | PracticePanelResumeMessage
  | PracticePanelSubmitMessage
  | PracticePanelCorrectMessage;

export interface PracticePanelTransactionAckMessage
  extends PracticePanelMessageBase {
  type: 'practice/ack';
  transactionId: string;
  outcome: PracticeInputTransactionAck['outcome'];
  transactionRevision?: number;
  currentRevision: number;
  consumedText: string;
  unconsumedText: string;
  snapshot: PracticePanelSnapshot;
}

export function decodePracticePanelClientMessage(
  value: unknown
): PracticePanelClientMessage | undefined {
  if (!isRecord(value) || !validBase(value)) return undefined;
  const base: PracticePanelMessageBase = {
    protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    panelInstanceId: value.panelInstanceId,
    sequence: value.sequence
  };
  switch (value.type) {
    case 'practice/ready':
    case 'practice/requestSnapshot':
    case 'practice/pause':
    case 'practice/resume':
      return { ...base, type: value.type };
    case 'practice/submit':
      if (
        !validTransaction(value)
        || !isInputKind(value.inputKind)
        || typeof value.text !== 'string'
        || value.text.length === 0
      ) {
        return undefined;
      }
      return {
        ...base,
        type: value.type,
        transactionId: value.transactionId,
        baseRevision: value.baseRevision,
        inputKind: value.inputKind,
        text: value.text
      };
    case 'practice/correct':
      if (!validTransaction(value)) return undefined;
      return {
        ...base,
        type: value.type,
        transactionId: value.transactionId,
        baseRevision: value.baseRevision
      };
    default:
      return undefined;
  }
}

export function wrapPracticeTransactionAck(input: {
  sessionId: string;
  panelInstanceId: string;
  sequence: number;
  transactionId: string;
  ack: PracticeInputTransactionAck;
}): PracticePanelTransactionAckMessage {
  return {
    protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
    type: 'practice/ack',
    sessionId: input.sessionId,
    panelInstanceId: input.panelInstanceId,
    sequence: input.sequence,
    transactionId: input.transactionId,
    outcome: input.ack.outcome,
    ...(input.ack.transactionRevision === undefined
      ? {}
      : { transactionRevision: input.ack.transactionRevision }),
    currentRevision: input.ack.currentRevision,
    consumedText: input.ack.consumedText,
    unconsumedText: input.ack.unconsumedText,
    snapshot: input.ack.snapshot
  };
}

function validBase(value: Record<string, unknown>): value is Record<string, unknown> & {
  protocolVersion: 1;
  sessionId: string;
  panelInstanceId: string;
  sequence: number;
  type: string;
} {
  return value.protocolVersion === TYPING_PRACTICE_PANEL_PROTOCOL_VERSION
    && nonEmptyString(value.sessionId)
    && nonEmptyString(value.panelInstanceId)
    && positiveInteger(value.sequence)
    && typeof value.type === 'string';
}

function validTransaction(value: Record<string, unknown>): value is Record<string, unknown> & {
  transactionId: string;
  baseRevision: number;
} {
  return nonEmptyString(value.transactionId)
    && nonNegativeInteger(value.baseRevision);
}

function isInputKind(value: unknown): value is PracticeInputOrigin {
  return value === 'direct' || value === 'composition' || value === 'paste';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
