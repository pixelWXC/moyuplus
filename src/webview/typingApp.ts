import './typingStyles.css';
import {
  TYPING_VIEW_PROTOCOL_VERSION,
  type TypingViewMaterialOrigin,
  type TypingViewPage,
  type TypingViewSetupPlan,
  type TypingViewStartPosition,
  type TypingViewSourceRange
} from '../typing/adapters/view/typingViewProtocol';
import {
  createTypingViewState,
  reduceTypingViewMessage
} from './typingState';
import {
  renderTypingPageContent,
  renderTypingLegacyResumeHintBanner,
  renderTypingRecoveryBanner
} from './typingViewRender';
import { createTypingSetupConfiguration } from './typingSetupForm';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const vscode = window.acquireVsCodeApi?.();
const app = document.querySelector<HTMLElement>('#app');
const instanceId = `typing-${crypto.randomUUID().replace(/-/g, '')}`;
let state = createTypingViewState(instanceId);
let clientRevision = 0;
let pasteComposerOpen = false;
let pasteDraft = '';
let shouldFocusActiveHeading = false;

const pageCopy: Record<TypingViewPage, {
  label: string;
  title: string;
  description: string;
}> = {
  materials: {
    label: '素材',
    title: '选择练习内容',
    description: '从自定义素材、导入内容或自由练习开始。'
  },
  recent: {
    label: '最近',
    title: '继续最近练习',
    description: '最近结果和使用过的来源会按时间排列。'
  },
  setup: {
    label: '本次设置',
    title: '设置本次练习',
    description: '选择范围、完成条件、判定方式和推进策略。'
  },
  live: {
    label: '进行中',
    title: '练习进行中',
    description: '局内数据在练习窗口实时显示；练习完成后，结果会同步到此侧栏。'
  },
  result: {
    label: '结果',
    title: '本次结果',
    description: '查看摘要、速度变化、错误排行和历史比较。'
  },
  history: {
    label: '历史',
    title: '练习历史',
    description: '按时间查看练习记录和日、周统计。'
  },
  mastery: {
    label: '强化',
    title: '专项强化',
    description: '每个错词正确通过一次即稳定，仍然出错则进入下一轮。'
  }
};

const sessionLabels = {
  ready: '准备开始',
  running: '练习中',
  blockedOnError: '等待修正',
  paused: '已暂停',
  completed: '已完成',
  abandoned: '已结束'
} as const;

vscode?.postMessage({
  protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
  instanceId,
  type: 'typingReady'
});
render();

window.addEventListener('message', event => {
  const next = reduceTypingViewMessage(state, event.data);
  if (next === state) return;
  shouldFocusActiveHeading = next.activePage !== state.activePage;
  state = next;
  if (state.activePage !== 'materials') {
    pasteComposerOpen = false;
    pasteDraft = '';
  }
  render();
});

function render(): void {
  if (!app) return;
  const focusedPage = app.querySelector<HTMLButtonElement>(
    '.page-tab:focus'
  )?.dataset.page;
  const copy = pageCopy[state.activePage];
  const session = state.activeSessionStatus
    ? `<span class="session-state" role="status" aria-live="polite">${sessionLabels[state.activeSessionStatus]}</span>`
    : '<span class="session-state is-idle" role="status" aria-live="polite">无活动练习</span>';
  const pending = state.pendingResultCount > 0
    ? `<p class="pending-notice" role="status">待保存成绩：${state.pendingResultCount}</p>`
    : '';
  const loading = state.snapshotRevision === 0
    ? '<p class="loading-state" role="status">正在读取练习状态…</p>'
    : '';
  const content = state.content
    ? renderTypingPageContent(state.content, state.activeSessionStatus)
    : '<p class="empty-guidance">正在准备页面内容…</p>';
  const recovery = state.recovery
    ? renderTypingRecoveryBanner(state.recovery)
    : '';
  const legacyResume = state.legacyResumeHint
    ? renderTypingLegacyResumeHintBanner(state.legacyResumeHint)
    : '';
  const primaryNavigation = state.availablePages
    .filter(page => page !== 'setup')
    .map(page => {
      const current = page === state.activePage;
      return `<button
        class="page-tab${current ? ' is-current' : ''}"
        type="button"
        data-page="${page}"
        ${current ? 'aria-current="page"' : ''}
      >${pageCopy[page].label}</button>`;
    })
    .join('');
  const setupNavigation = state.activePage === 'setup'
    && state.availablePages.includes('setup')
    ? `<span class="setup-context" aria-current="page">${pageCopy.setup.label}</span>`
    : '';

  app.innerHTML = `
    <section class="typing-shell" aria-label="MoyuPlus 打字练习">
      <header class="typing-header">
        <div>
          <p class="eyebrow">MOYUPLUS</p>
          <h1>打字练习</h1>
        </div>
        ${session}
      </header>
      <nav class="page-navigation" aria-label="打字练习页面">
        ${primaryNavigation}
        ${setupNavigation}
      </nav>
      <main class="typing-content" id="typing-content" aria-labelledby="typing-page-title">
        ${loading}
        <p class="page-kicker">${copy.label}</p>
        <h2 id="typing-page-title" tabindex="-1">${copy.title}</h2>
        <p class="page-description">${copy.description}</p>
        <div class="content-rule" aria-hidden="true"></div>
        ${recovery}
        ${legacyResume}
        ${content}
      </main>
      ${pending}
    </section>`;

  app.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      const page = button.dataset.page as TypingViewPage | undefined;
      if (!page || page === state.activePage || !state.availablePages.includes(page)) return;
      vscode?.postMessage({
        protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
        instanceId,
        type: 'navigate',
        requestId: `navigate-${Date.now()}-${++clientRevision}`,
        clientRevision,
        page
      });
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-material-id]').forEach(button => {
    button.addEventListener('click', () => {
      const encodedId = button.dataset.materialId;
      const materialOrigin = button.dataset.materialOrigin as TypingViewMaterialOrigin | undefined;
      if (!encodedId || !materialOrigin) return;
      let materialId: string;
      try {
        materialId = decodeURIComponent(encodedId);
      } catch {
        return;
      }
      postRequest({
        type: 'selectMaterial',
        materialId,
        materialOrigin
      });
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-remove-material-id]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const materialId = decodeMaterialId(button.dataset.removeMaterialId);
        if (!materialId) return;
        postRequest({
          type: 'removeMaterial',
          materialId
        });
      });
    });

  app.querySelectorAll<HTMLButtonElement>('[data-undo-material-id]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const materialId = decodeMaterialId(button.dataset.undoMaterialId);
        if (!materialId) return;
        postRequest({
          type: 'undoRemoveMaterial',
          materialId
        });
      });
    });

  app.querySelector<HTMLButtonElement>('[data-action="paste"]')
    ?.addEventListener('click', () => {
      pasteComposerOpen = !pasteComposerOpen;
      render();
      if (pasteComposerOpen) {
        app.querySelector<HTMLTextAreaElement>('#typing-paste-content')?.focus();
      }
    });
  app.querySelector<HTMLButtonElement>('[data-action="cancelPaste"]')
    ?.addEventListener('click', () => {
      pasteComposerOpen = false;
      pasteDraft = '';
      render();
    });
  app.querySelector<HTMLButtonElement>('[data-action="importTxt"]')
    ?.addEventListener('click', () => postRequest({
      type: 'importMaterial',
      format: 'txt'
    }));
  app.querySelector<HTMLButtonElement>('[data-action="importEpub"]')
    ?.addEventListener('click', () => postRequest({
      type: 'importMaterial',
      format: 'epub'
    }));

  const pasteForm = app.querySelector<HTMLFormElement>('[data-paste-form]');
  const pasteInput = pasteForm?.elements.namedItem('text') as HTMLTextAreaElement | null;
  if (pasteForm && pasteInput) {
    pasteForm.hidden = !pasteComposerOpen;
    pasteInput.value = pasteDraft;
    pasteInput.addEventListener('input', () => {
      pasteDraft = pasteInput.value;
    });
    pasteForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!pasteInput.reportValidity()) return;
      pasteDraft = pasteInput.value;
      postRequest({
        type: 'usePastedText',
        text: pasteDraft
      });
    });
  }

  const setupForm = app.querySelector<HTMLFormElement>('[data-setup-form]');
  if (setupForm && state.content?.kind === 'setup') {
    const setupContent = state.content;
    const rangeSelect = setupForm.elements.namedItem('range') as HTMLSelectElement | null;
    const completionSelect = setupForm.elements.namedItem('completionKind') as HTMLSelectElement | null;
    const completionSourceRange = completionSelect?.querySelector<HTMLOptionElement>(
      '[data-completion-source-range]'
    );
    const completionHelp = setupForm.querySelector<HTMLElement>('[data-completion-help]');
    const completionSettings = Array.from(
      setupForm.querySelectorAll<HTMLElement>('[data-completion-setting]')
    );
    const startSelect = setupForm.elements.namedItem(
      'startKind'
    ) as HTMLSelectElement | null;
    const continuationOption = startSelect?.querySelector<HTMLOptionElement>(
      '[data-start-continuation]'
    );
    const startHelp = setupForm.querySelector<HTMLElement>('[data-start-help]');
    const startSettings = Array.from(
      setupForm.querySelectorAll<HTMLElement>('[data-start-setting]')
    );
    const syncCompletionControls = () => {
      if (!rangeSelect || !completionSelect) return;
      const rangeKind = rangeSelect.selectedOptions[0]?.dataset.rangeKind;
      const supportsSourceRange = rangeKind === 'article'
        || rangeKind === 'chapter'
        || rangeKind === 'selection';
      if (completionSourceRange) {
        completionSourceRange.disabled = !supportsSourceRange;
        completionSourceRange.hidden = !supportsSourceRange;
      }
      if (!supportsSourceRange && completionSelect.value === 'sourceRange') {
        completionSelect.value = 'free';
      }

      const completionKind = completionSelect.value;
      for (const setting of completionSettings) {
        const visible = setting.dataset.completionSetting === completionKind;
        setting.hidden = !visible;
        setting.querySelectorAll<HTMLInputElement>('input').forEach(input => {
          input.disabled = !visible;
        });
      }
      if (completionHelp) {
        completionHelp.textContent = completionKind === 'sourceRange'
          ? '输入到上方所选范围的末尾后自动结束。'
          : completionKind === 'timed'
            ? '到达设定时长后自动结束。'
            : completionKind === 'length'
              ? '完成设定数量的可打印单元后自动结束。'
              : '不设时间和单元数限制，需要时可在练习页手动结束。';
      }
    };
    const syncStartControls = () => {
      if (!rangeSelect || !startSelect) return;
      const range = setupContent.ranges[Number(rangeSelect.value)]?.range;
      const continuation = setupContent.continuations?.find(item =>
        sameRange(item.range, range)
      );
      if (continuationOption) {
        continuationOption.disabled = !continuation;
      }
      if (!continuation && startSelect.value === 'continuation') {
        startSelect.value = 'beginning';
      }
      if (startHelp) {
        startHelp.textContent = continuation
          ? `上次停在第 ${continuation.targetIndex.toLocaleString('zh-CN')} 个字符（约 ${Math.round(continuation.targetIndex / continuation.totalUnits * 100)}%）。`
          : '当前范围还没有可继续的练习位置。';
      }
      for (const setting of startSettings) {
        const visible = setting.dataset.startSetting === startSelect.value;
        setting.hidden = !visible;
        setting.querySelectorAll<HTMLInputElement>('input').forEach(input => {
          input.disabled = !visible;
        });
      }
    };
    rangeSelect?.addEventListener('change', () => {
      syncCompletionControls();
      syncStartControls();
    });
    completionSelect?.addEventListener('change', syncCompletionControls);
    startSelect?.addEventListener('change', syncStartControls);
    syncCompletionControls();
    syncStartControls();

    const currentConfiguration = () => {
      if (!setupForm.reportValidity()) return;
      const data = new FormData(setupForm);
      return createTypingSetupConfiguration(setupContent, {
        range: String(data.get('range')),
        startKind: String(data.get('startKind')),
        startPercent: String(data.get('startPercent')),
        completionKind: String(data.get('completionKind')),
        completionSeconds: String(data.get('completionSeconds')),
        completionUnits: String(data.get('completionUnits')),
        errorPolicy: String(data.get('errorPolicy')),
        punctuationMode: String(data.get('punctuationMode')),
        whitespaceMode: String(data.get('whitespaceMode')),
        caseSensitive: data.has('caseSensitive'),
        lineAdvance: String(data.get('lineAdvance')),
        presentation: String(data.get('presentation')),
        showLiveMetrics: data.has('showLiveMetrics'),
        showWhitespace: data.has('showWhitespace')
      });
    };
    setupForm.addEventListener('submit', event => {
      event.preventDefault();
      const configuration = currentConfiguration();
      if (!configuration) return;
      postRequest({
        type: 'startPractice',
        ...configuration
      });
    });
    setupForm.querySelector<HTMLButtonElement>('[data-save-setup-defaults]')
      ?.addEventListener('click', () => {
        const configuration = currentConfiguration();
        if (!configuration) return;
        postRequest({
          type: 'saveSetupAsDefault',
          ...configuration
        });
      });
    setupForm.querySelector<HTMLButtonElement>('[data-open-practice-editor-settings]')
      ?.addEventListener('click', () => {
        postRequest({ type: 'openPracticeEditorSettings' });
      });
  }

  app.querySelectorAll<HTMLButtonElement>('[data-conflict-resolution]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const resolution = button.dataset.conflictResolution;
        if (
          resolution !== 'returnCurrent'
          && resolution !== 'finishAndStart'
          && resolution !== 'cancel'
        ) return;
        postRequest({
          type: 'resolveSessionConflict',
          resolution
        });
      });
    });

  app.querySelectorAll<HTMLButtonElement>('[data-live-action]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.liveAction;
        if (
          action !== 'pause'
          && action !== 'resume'
          && action !== 'restart'
          && action !== 'finish'
        ) return;
        postRequest({
          type: 'controlPractice',
          action
        });
      });
    });

  app.querySelectorAll<HTMLButtonElement>('[data-recovery-action]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.recoveryAction;
        if (action === 'recover') {
          postRequest({ type: 'recoverPractice' });
        } else if (action === 'dismiss') {
          postRequest({ type: 'dismissRecovery' });
        }
      });
    });

  app.querySelectorAll<HTMLButtonElement>('[data-legacy-resume-action]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.legacyResumeAction;
        if (action === 'resume') {
          postRequest({ type: 'resumeLegacyPractice' });
        } else if (action === 'dismiss') {
          postRequest({ type: 'dismissLegacyResumeHint' });
        }
      });
    });

  app.querySelector<HTMLButtonElement>('[data-clear-practice-history]')
    ?.addEventListener('click', () => {
      postRequest({ type: 'clearPracticeHistory' });
    });

  app.querySelectorAll<HTMLButtonElement>('[data-mastery-action]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.masteryAction;
        if (action === 'start') {
          postRequest({ type: 'startMasteryPractice' });
        } else if (action === 'adjust') {
          postRequest({ type: 'adjustMasteryPractice' });
        }
      });
    });

  if (focusedPage) {
    app.querySelector<HTMLButtonElement>(
      `.page-tab[data-page="${focusedPage}"]`
    )?.focus();
  } else if (shouldFocusActiveHeading) {
    app.querySelector<HTMLElement>('#typing-page-title')?.focus();
  }
  shouldFocusActiveHeading = false;
}

function postRequest(
  request:
    | {
      type: 'selectMaterial';
      materialId: string;
      materialOrigin: TypingViewMaterialOrigin;
    }
    | {
      type: 'removeMaterial' | 'undoRemoveMaterial';
      materialId: string;
    }
    | {
      type: 'usePastedText';
      text: string;
    }
    | {
      type: 'importMaterial';
      format: 'txt' | 'epub';
    }
    | {
      type: 'configureSetup';
      selectedRange: TypingViewSourceRange;
      startPosition?: TypingViewStartPosition;
      plan: TypingViewSetupPlan;
    }
    | {
      type: 'saveSetupAsDefault';
      selectedRange: TypingViewSourceRange;
      startPosition?: TypingViewStartPosition;
      plan: TypingViewSetupPlan;
    }
    | {
      type: 'openPracticeEditorSettings';
    }
    | {
      type: 'startPractice';
      selectedRange: TypingViewSourceRange;
      startPosition?: TypingViewStartPosition;
      plan: TypingViewSetupPlan;
    }
    | {
      type: 'resolveSessionConflict';
      resolution: 'returnCurrent' | 'finishAndStart' | 'cancel';
    }
    | {
      type: 'controlPractice';
      action: 'pause' | 'resume' | 'restart' | 'finish';
    }
    | {
      type: 'recoverPractice' | 'dismissRecovery';
    }
    | {
      type: 'resumeLegacyPractice' | 'dismissLegacyResumeHint';
    }
    | {
      type: 'clearPracticeHistory';
    }
    | {
      type: 'startMasteryPractice' | 'adjustMasteryPractice';
    }
): void {
  vscode?.postMessage({
    protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
    instanceId,
    requestId: `${request.type}-${Date.now()}-${clientRevision + 1}`,
    clientRevision: ++clientRevision,
    ...request
  });
}

function decodeMaterialId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function sameRange(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
