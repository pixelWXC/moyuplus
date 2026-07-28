import './typingStyles.css';
import {
  TYPING_VIEW_PAGES,
  TYPING_VIEW_PROTOCOL_VERSION,
  type TypingViewMaterialOrigin,
  type TypingViewPage,
  type TypingViewSetupPlan,
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

const pageCopy: Record<TypingViewPage, {
  label: string;
  title: string;
  description: string;
}> = {
  materials: {
    label: '素材',
    title: '选择练习内容',
    description: '从内置素材、自定义素材、导入内容或自由练习开始。'
  },
  recent: {
    label: '最近',
    title: '继续最近练习',
    description: '最近结果和使用过的来源会按时间排列。'
  },
  setup: {
    label: '设置',
    title: '设置本次练习',
    description: '选择范围、完成条件、判定方式和推进策略。'
  },
  live: {
    label: '进行中',
    title: '练习进行中',
    description: '在编辑器中输入；这里提供会话状态和控制命令。'
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
    title: '错字与错词',
    description: '从反复出错的内容生成可复现的强化练习。'
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
    ? renderTypingPageContent(state.content)
    : '<p class="empty-guidance">正在准备页面内容…</p>';
  const recovery = state.recovery
    ? renderTypingRecoveryBanner(state.recovery)
    : '';
  const legacyResume = state.legacyResumeHint
    ? renderTypingLegacyResumeHintBanner(state.legacyResumeHint)
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
        ${TYPING_VIEW_PAGES.map(page => {
          const available = state.availablePages.includes(page);
          const current = page === state.activePage;
          return `<button
            class="page-tab${current ? ' is-current' : ''}"
            type="button"
            data-page="${page}"
            ${current ? 'aria-current="page"' : ''}
            ${available ? '' : 'disabled'}
          >${pageCopy[page].label}</button>`;
        }).join('')}
      </nav>
      <main class="typing-content" id="typing-content" tabindex="-1">
        ${loading}
        <p class="page-kicker">${copy.label}</p>
        <h2>${copy.title}</h2>
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
    const currentConfiguration = () => {
      if (!setupForm.reportValidity()) return;
      const data = new FormData(setupForm);
      return createTypingSetupConfiguration(setupContent, {
        range: String(data.get('range')),
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

  if (focusedPage) {
    app.querySelector<HTMLButtonElement>(
      `.page-tab[data-page="${focusedPage}"]`
    )?.focus();
  }
}

function postRequest(
  request:
    | {
      type: 'selectMaterial';
      materialId: string;
      materialOrigin: TypingViewMaterialOrigin;
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
      plan: TypingViewSetupPlan;
    }
    | {
      type: 'saveSetupAsDefault';
      selectedRange: TypingViewSourceRange;
      plan: TypingViewSetupPlan;
    }
    | {
      type: 'openPracticeEditorSettings';
    }
    | {
      type: 'startPractice';
      selectedRange: TypingViewSourceRange;
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
): void {
  vscode?.postMessage({
    protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
    instanceId,
    requestId: `${request.type}-${Date.now()}-${clientRevision + 1}`,
    clientRevision: ++clientRevision,
    ...request
  });
}
