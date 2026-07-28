import { pinyin } from 'pinyin-pro';
import type { PracticePanelSnapshot } from '../typing/application';
import type { TypingPracticeInputState } from './typingPracticeInputState';

export interface TypingPracticePanelRenderSegment {
  text: string;
  className: string;
}

export interface TypingPracticeKeyboardTarget {
  code?: string;
  shiftCode?: 'ShiftLeft' | 'ShiftRight';
  label: string;
  hint: string;
}

export interface TypingPracticePanelRenderModel {
  referenceSegments: TypingPracticePanelRenderSegment[];
  inputSegments: TypingPracticePanelRenderSegment[];
  keyboardTarget: TypingPracticeKeyboardTarget;
  errorMessage?: string;
  focusMessage?: string;
  inputLabel: string;
  progressLabel: string;
}

const SHIFTED_KEYS: Readonly<Record<string, { code: string; label: string }>> = {
  '!': { code: 'Digit1', label: '1' },
  '@': { code: 'Digit2', label: '2' },
  '#': { code: 'Digit3', label: '3' },
  '$': { code: 'Digit4', label: '4' },
  '%': { code: 'Digit5', label: '5' },
  '^': { code: 'Digit6', label: '6' },
  '&': { code: 'Digit7', label: '7' },
  '*': { code: 'Digit8', label: '8' },
  '(': { code: 'Digit9', label: '9' },
  ')': { code: 'Digit0', label: '0' },
  '_': { code: 'Minus', label: '-' },
  '+': { code: 'Equal', label: '=' },
  '{': { code: 'BracketLeft', label: '[' },
  '}': { code: 'BracketRight', label: ']' },
  '|': { code: 'Backslash', label: '\\' },
  ':': { code: 'Semicolon', label: ';' },
  '"': { code: 'Quote', label: '\'' },
  '<': { code: 'Comma', label: ',' },
  '>': { code: 'Period', label: '.' },
  '?': { code: 'Slash', label: '/' },
  '~': { code: 'Backquote', label: '`' }
};

const DIRECT_KEYS: Readonly<Record<string, { code: string; label: string }>> = {
  '-': { code: 'Minus', label: '-' },
  '=': { code: 'Equal', label: '=' },
  '[': { code: 'BracketLeft', label: '[' },
  ']': { code: 'BracketRight', label: ']' },
  '\\': { code: 'Backslash', label: '\\' },
  ';': { code: 'Semicolon', label: ';' },
  '\'': { code: 'Quote', label: '\'' },
  ',': { code: 'Comma', label: ',' },
  '.': { code: 'Period', label: '.' },
  '/': { code: 'Slash', label: '/' },
  '`': { code: 'Backquote', label: '`' }
};

export function createTypingPracticePanelRenderModel(input: {
  snapshot: PracticePanelSnapshot;
  input: TypingPracticeInputState;
  focused: boolean;
}): TypingPracticePanelRenderModel {
  const units = visibleLineUnits(input.snapshot);
  const referenceSegments = units.map(unit => segment(
    unit.display,
    unit.state === 'target' || unit.state === 'blocked'
      ? 'reference-target'
      : unit.state === 'correct'
        ? 'reference-passed'
        : 'reference'
  ));
  const inputSegments: TypingPracticePanelRenderSegment[] = [];

  for (const unit of units) {
    if (unit.state === 'correct') {
      inputSegments.push(segment(unit.display, 'correct'));
      continue;
    }
    if (unit.state === 'blocked' && input.snapshot.blockedAttempt) {
      inputSegments.push(segment(input.snapshot.blockedAttempt.actual, 'error'));
    }
    if (unit.state === 'target' || unit.state === 'blocked') {
      for (const pending of input.input.transport.pending) {
        if (pending.type === 'submit') {
          inputSegments.push(segment(pending.text, 'pending'));
        }
      }
      if (input.input.composition.kind === 'composing') {
        inputSegments.push(segment(
          input.input.composition.draftText,
          'composition'
        ));
      }
      inputSegments.push(segment(unit.display, 'input-target'));
      continue;
    }
    inputSegments.push(segment(unit.display, 'input-remaining'));
  }

  const expected = input.snapshot.blockedAttempt?.expected
    ?? input.snapshot.window.units.find(unit =>
      unit.index === input.snapshot.targetIndex
    )?.text
    ?? '';

  return {
    referenceSegments,
    inputSegments,
    keyboardTarget: keyboardTarget(
      expected,
      input.snapshot,
      input.input.composition.kind === 'composing'
        ? input.input.composition.draftText
        : ''
    ),
    ...(input.snapshot.blockedAttempt
      ? { errorMessage: '输入有误，按退格修正。' }
      : {}),
    ...(!input.focused ? { focusMessage: '点击继续输入' } : {}),
    inputLabel: '练习输入',
    progressLabel: `${input.snapshot.targetIndex} / ${input.snapshot.totalUnits}`
  };
}

function visibleLineUnits(
  snapshot: PracticePanelSnapshot
): PracticePanelSnapshot['window']['units'] {
  const units = snapshot.window.units;
  if (units.length === 0) return [];
  let anchor = units.findIndex(unit =>
    unit.index === snapshot.targetIndex
  );
  if (anchor < 0) anchor = units.length - 1;

  let lineStart = anchor;
  while (lineStart > 0 && units[lineStart - 1]?.text !== '\n') {
    lineStart -= 1;
  }
  let lineEnd = anchor + 1;
  while (lineEnd < units.length && units[lineEnd]?.text !== '\n') {
    lineEnd += 1;
  }

  const viewportStart = Math.max(lineStart, anchor - 24);
  const viewportEnd = Math.min(lineEnd, Math.max(anchor + 42, viewportStart + 66));
  return units.slice(viewportStart, viewportEnd);
}

function keyboardTarget(
  expected: string,
  snapshot: PracticePanelSnapshot,
  compositionDraft: string
): TypingPracticeKeyboardTarget {
  if (expected === '') {
    return { label: '完成', hint: '当前行已完成' };
  }
  if (expected === '\n') {
    return { code: 'Enter', label: 'Enter', hint: '下一个按键：Enter' };
  }
  if (expected === '\t') {
    return { code: 'Tab', label: 'Tab', hint: '下一个按键：Tab' };
  }
  if (expected === ' ') {
    return { code: 'Space', label: '空格', hint: '下一个按键：空格' };
  }
  if (/^\p{Script=Han}$/u.test(expected)) {
    return chineseKeyboardTarget(snapshot, expected, compositionDraft);
  }
  if (/^[a-z]$/u.test(expected)) {
    const label = expected.toLocaleUpperCase();
    return { code: `Key${label}`, label, hint: `下一个按键：${label}` };
  }
  if (/^[A-Z]$/u.test(expected)) {
    return {
      code: `Key${expected}`,
      shiftCode: rightHandCode(`Key${expected}`) ? 'ShiftLeft' : 'ShiftRight',
      label: expected,
      hint: `下一个按键：Shift + ${expected}`
    };
  }
  if (/^[0-9]$/u.test(expected)) {
    return {
      code: `Digit${expected}`,
      label: expected,
      hint: `下一个按键：${expected}`
    };
  }
  const direct = DIRECT_KEYS[expected];
  if (direct) {
    return {
      ...direct,
      hint: `下一个按键：${direct.label}`
    };
  }
  const shifted = SHIFTED_KEYS[expected];
  if (shifted) {
    return {
      ...shifted,
      shiftCode: rightHandCode(shifted.code) ? 'ShiftLeft' : 'ShiftRight',
      hint: `下一个按键：Shift + ${shifted.label}`
    };
  }
  return {
    label: expected,
    hint: `目标「${expected}」没有可预测的物理键位`
  };
}

function chineseKeyboardTarget(
  snapshot: PracticePanelSnapshot,
  expected: string,
  compositionDraft: string
): TypingPracticeKeyboardTarget {
  const phrase = targetHanPhrase(snapshot) || expected;
  const primarySyllables = pinyin(phrase, {
    type: 'array',
    toneType: 'none',
    v: true
  });
  const firstCandidates = pinyin(expected, {
    type: 'array',
    toneType: 'none',
    multiple: true,
    v: true
  });
  const sequences = unique([
    primarySyllables.join(''),
    ...firstCandidates.map(candidate => (
      [candidate, ...primarySyllables.slice(1)].join('')
    ))
  ]).filter(value => /^[a-zv]+$/u.test(value));
  const draft = compositionDraft
    .toLocaleLowerCase()
    .replaceAll('ü', 'v')
    .replace(/[^a-zv]/gu, '');
  const sequence = sequences.find(value => value.startsWith(draft))
    ?? sequences[0]
    ?? '';
  const pronunciation = primarySyllables.join(' ');

  if (sequence.length === 0) {
    return {
      label: expected,
      hint: `目标「${expected}」暂时无法解析拼音`
    };
  }
  if (draft.length > 0 && !sequence.startsWith(draft)) {
    return {
      code: 'Space',
      label: '空格',
      hint: `目标「${expected}」· 当前输入与推荐拼音 ${pronunciation} 不同，可按 Space 选择候选`
    };
  }
  if (draft.length >= sequence.length) {
    return {
      code: 'Space',
      label: '空格',
      hint: `目标「${expected}」· 拼音 ${pronunciation} · 按 Space 选择候选`
    };
  }
  const next = sequence[draft.length]!.toLocaleUpperCase();
  return {
    code: `Key${next}`,
    label: next,
    hint: `目标「${expected}」· 拼音 ${pronunciation} · 下一个按键：${next}`
  };
}

function targetHanPhrase(snapshot: PracticePanelSnapshot): string {
  const units = snapshot.window.units;
  const target = units.findIndex(unit => unit.index === snapshot.targetIndex);
  if (target < 0) return '';
  const characters: string[] = [];
  for (let index = target; index < units.length && characters.length < 6; index += 1) {
    const value = units[index]!.text;
    if (!/^\p{Script=Han}$/u.test(value)) break;
    characters.push(value);
  }
  return characters.join('');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function rightHandCode(code: string): boolean {
  return new Set([
    'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
    'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
    'KeyH', 'KeyJ', 'KeyK', 'KeyL',
    'KeyN', 'KeyM',
    'BracketLeft', 'BracketRight', 'Backslash',
    'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'
  ]).has(code);
}

function segment(
  text: string,
  state:
    | 'correct'
    | 'error'
    | 'composition'
    | 'pending'
    | 'reference'
    | 'reference-passed'
    | 'reference-target'
    | 'input-target'
    | 'input-remaining'
): TypingPracticePanelRenderSegment {
  return {
    text,
    className: `practice-unit practice-unit--${state}`
  };
}
