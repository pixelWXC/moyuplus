import { describe, expect, it } from 'vitest';
import {
  TypingPracticeInputStateMachine,
  createTypingPracticeInputState
} from '../../webview/typingPracticeInputState';
import {
  createTypingPracticePanelRenderModel
} from '../../webview/typingPracticePanelRender';

describe('typing practice panel render model', () => {
  it('keeps authoritative, pending, composition and blocked semantics distinct', () => {
    const machine = new TypingPracticeInputStateMachine({
      sessionId: 'session-1',
      nextCompositionId: () => 'composition-1',
      nextTransactionId: () => 'transaction-1'
    });
    let input = machine.dispatch(createTypingPracticeInputState('panel-1'), {
      type: 'snapshot',
      revision: 1,
      status: 'blockedOnError',
      blockedAttemptId: 'input-1'
    }).state;
    input = {
      ...input,
      composition: {
        kind: 'composing',
        compositionId: 'composition-1',
        draftText: 'zhu',
        discardOnEnd: false
      }
    };
    const model = createTypingPracticePanelRenderModel({
      snapshot: {
        sessionId: 'session-1',
        revision: 1,
        status: 'blockedOnError',
        targetIndex: 1,
        totalUnits: 3,
        blockedAttempt: {
          attemptId: 'input-1',
          expected: '主',
          actual: 'X'
        },
        window: {
          start: 0,
          end: 3,
          units: [
            { index: 0, text: 'a', display: 'a', state: 'correct' },
            { index: 1, text: '主', display: '主', state: 'blocked' },
            { index: 2, text: '题', display: '题', state: 'remaining' }
          ]
        },
        updatedAt: 10
      },
      input,
      focused: true
    });

    expect(model.referenceSegments).toEqual([
      { text: 'a', className: 'practice-unit practice-unit--reference-passed' },
      { text: '主', className: 'practice-unit practice-unit--reference-target' },
      { text: '题', className: 'practice-unit practice-unit--reference' }
    ]);
    expect(model.inputSegments).toEqual([
      { text: 'a', className: 'practice-unit practice-unit--correct' },
      { text: 'X', className: 'practice-unit practice-unit--error' },
      { text: 'zhu', className: 'practice-unit practice-unit--composition' },
      { text: '主', className: 'practice-unit practice-unit--input-target' },
      { text: '题', className: 'practice-unit practice-unit--input-remaining' }
    ]);
    expect(model.keyboardTarget).toMatchObject({
      code: 'KeyT',
      label: 'T'
    });
    expect(model.keyboardTarget.hint).toContain('拼音 zhu ti');
    expect(model.errorMessage).toBe('输入有误，按退格修正。');
    expect(model.inputLabel).toBe('练习输入');
  });
});
