import type {
  TypingViewMaterialSummary,
  TypingViewLegacyResumeHint,
  TypingViewPageContent,
  TypingViewRecoverySnapshot
} from '../typing/adapters/view/typingViewProtocol';

const profileLabels: Readonly<Record<string, string>> = {
  'chinese.modernArticle': '中文文章',
  'chinese.news': '中文新闻',
  'chinese.fiction': '中文小说',
  'chinese.commonSentence': '中文句子',
  'chinese.adHoc': '中文自由内容',
  'english.word': '英文单词',
  'english.sentence': '英文句子',
  'english.article': '英文文章',
  'english.adHoc': '英文自由内容',
  'mixed.programmer': '中英混合 · 程序员',
  'mixed.office': '中英混合 · 办公',
  'mixed.adHoc': '中英混合 · 自由内容',
  'randomChinese.frequentHanzi': '高频汉字',
  'randomChinese.idiom': '成语',
  'randomChinese.phrase': '词组',
  'numberSymbol.phone': '手机号',
  'numberSymbol.date': '日期',
  'numberSymbol.amount': '金额',
  'numberSymbol.punctuation': '标点',
  'numberSymbol.specialSymbol': '特殊符号',
  'mastery.grapheme': '错字强化',
  'mastery.word': '错词强化',
  'mastery.codeToken': '代码词元强化',
  'mastery.mixed': '综合强化'
};

const originLabels = {
  custom: '自定义',
  txtImport: 'TXT 导入',
  epubImport: 'EPUB 导入',
  readerBook: '书架',
  generated: '生成内容',
  mastery: '强化内容',
  adHoc: '自由练习'
} as const;

export function renderTypingRecoveryBanner(
  recovery: TypingViewRecoverySnapshot
): string {
  return `
    <aside class="recovery-banner" role="status" aria-labelledby="recovery-title">
      <h2 id="recovery-title">发现可恢复的练习</h2>
      <p>上次练习停在 ${recovery.completedUnits} / ${recovery.totalUnits}，状态为“${sessionStatusLabel(recovery.status)}”。恢复后会先保持暂停。</p>
      <p class="fact-note">检查点保存于 ${formatDateTime(recovery.savedAt)}</p>
      <div class="material-actions" role="group" aria-label="旧练习恢复选择">
        <button class="material-action is-primary" type="button" data-recovery-action="recover">恢复练习</button>
        <button class="material-action" type="button" data-recovery-action="dismiss">暂不恢复</button>
      </div>
    </aside>`;
}

export function renderTypingLegacyResumeHintBanner(
  hint: TypingViewLegacyResumeHint
): string {
  const whitespace = [
    hint.whitespace.skipEmptyLines ? '跳过空行' : '保留空行',
    hint.whitespace.ignoreAllSpaces
      ? '忽略全部空格'
      : hint.whitespace.trimLeadingSpaces
        && hint.whitespace.trimTrailingSpaces
        ? '忽略行首尾空格'
        : hint.whitespace.trimLeadingSpaces
          ? '忽略行首空格'
          : hint.whitespace.trimTrailingSpaces
            ? '忽略行尾空格'
            : '严格匹配空格'
  ].join(' · ');
  const availability = hint.sourceAvailable
    ? '来源已在新版书架中找到。'
    : '来源当前不可用；可忽略此提示，或先在书架重新导入。';
  return `
    <aside class="recovery-banner legacy-resume-banner" role="status" aria-labelledby="legacy-resume-title">
      <h2 id="legacy-resume-title">发现旧版练习设置</h2>
      <p>“${escapeHtml(hint.sourceTitle)}”曾练习到第 ${hint.physicalLineNumber} 行附近。${availability}</p>
      <p class="fact-note">${escapeHtml(whitespace)}。迁移后请在设置页确认范围和规则，再开始新练习；不会生成旧成绩。</p>
      <div class="material-actions" role="group" aria-label="旧版练习设置处理方式">
        ${hint.sourceAvailable
          ? '<button class="material-action is-primary" type="button" data-legacy-resume-action="resume">迁移到新版设置</button>'
          : ''}
        <button class="material-action" type="button" data-legacy-resume-action="dismiss">忽略旧练习</button>
      </div>
    </aside>`;
}

export function renderTypingPageContent(content: TypingViewPageContent): string {
  if (content.kind === 'unavailable') {
    return '<p class="empty-guidance">该页面的数据查询尚未加载。</p>';
  }
  if (content.kind === 'sessionConflict') {
    return `
      <section class="session-conflict" aria-labelledby="session-conflict-title">
        <h3 id="session-conflict-title">已有活动练习</h3>
        <p>当前练习处于“${sessionStatusLabel(content.status)}”状态。选择如何继续；MoyuPlus 不会自动覆盖它。</p>
        <div class="material-actions" role="group" aria-label="活动练习处理方式">
          <button class="material-action is-primary" type="button" data-conflict-resolution="returnCurrent">返回当前练习</button>
          <button class="material-action" type="button" data-conflict-resolution="finishAndStart">结束当前练习并新建</button>
          <button class="material-action" type="button" data-conflict-resolution="cancel">取消</button>
        </div>
      </section>`;
  }
  if (content.kind === 'live') {
    return renderLive(content);
  }
  if (content.kind === 'result') {
    return renderResult(content);
  }
  if (content.kind === 'recent') {
    return renderRecent(content);
  }
  if (content.kind === 'history') {
    return renderHistory(content);
  }
  if (content.kind === 'mastery') {
    return renderMastery(content);
  }
  if (content.kind === 'setup') {
    return renderSetup(content);
  }
  return `
    <section class="materials-page" aria-label="练习素材">
      ${renderMaterialActions(content.actions)}
      ${renderMaterialSection(
        '我的素材',
        content.library,
        '粘贴一段文字，或导入 TXT / EPUB，创建第一份自己的练习素材。'
      )}
    </section>`;
}

function renderRecent(
  content: Extract<TypingViewPageContent, { kind: 'recent' }>
): string {
  if (content.items.length === 0) {
    return '<p class="empty-guidance">还没有最近练习。完成一次练习后，这里会显示最近 20 条只读摘要。</p>';
  }
  return `
    <section class="facts-page" aria-label="最近练习">
      <h3>最近练习</h3>
      <ol class="fact-list">
        ${content.items.map(item => `
          <li>
            <div>
              <strong>${escapeHtml(item.materialId ?? item.profileKey)}</strong>
              <span>${formatDateTime(item.endedAt)}</span>
            </div>
            <span>${formatMetric(item.effectiveCpm)} 有效 CPM · ${formatMetric(item.accuracy)}% · ${formatDuration(item.activeElapsedMs)}</span>
          </li>`
        ).join('')}
      </ol>
    </section>`;
}

function renderResult(
  content: Extract<TypingViewPageContent, { kind: 'result' }>
): string {
  const result = content.result;
  if (!result) {
    return '<p class="empty-guidance">还没有练习结果。完成一次练习后，摘要和错误排行会显示在这里。</p>';
  }
  const benchmark = content.benchmarkBest
    ? `<p class="fact-note">${content.benchmarkBest.isCurrentResult
      ? '这是当前基准下的最佳成绩。'
      : `历史最佳：${formatMetric(content.benchmarkBest.effectiveCpm)} 有效 CPM，准确率 ${formatMetric(content.benchmarkBest.accuracy)}%。`
    }</p>`
    : '';
  const errorPairs = result.errorPairs.length > 0
    ? `<ol class="fact-list">${result.errorPairs.map(item => `
        <li><span>${escapeHtml(item.expected)} → ${escapeHtml(item.actual || '∅')}</span><strong>${item.count} 次</strong></li>`
      ).join('')}</ol>`
    : '<p class="material-empty">没有字符错误。</p>';
  const errorWords = result.errorWords.length > 0
    ? `<ol class="fact-list">${result.errorWords.map(item => `
        <li><span>${escapeHtml(item.word)}</span><strong>${item.count} 次</strong></li>`
      ).join('')}</ol>`
    : '<p class="material-empty">没有错词记录。</p>';
  return `
    <section class="result-page" aria-label="本次练习结果">
      <p class="fact-note">${escapeHtml(outcomeLabel(result.outcome))} · ${formatDateTime(result.endedAt)}</p>
      <dl class="live-metrics result-metrics">
        <div><dt>准确率</dt><dd>${formatMetric(result.metrics.accuracy)}%</dd></div>
        <div><dt>有效 CPM</dt><dd>${formatMetric(result.metrics.effectiveCpm)}</dd></div>
        <div><dt>原始 CPM</dt><dd>${formatMetric(result.metrics.rawCpm)}</dd></div>
        <div><dt>活动时间</dt><dd>${formatDuration(result.activeElapsedMs)}</dd></div>
        <div><dt>完成单元</dt><dd>${result.metrics.completedUnits}</dd></div>
        <div><dt>最长连续正确</dt><dd>${result.metrics.longestCorrectStreak}</dd></div>
      </dl>
      ${benchmark}
      <section class="fact-section">
        <h3>字符错误排行</h3>
        ${errorPairs}
      </section>
      <section class="fact-section">
        <h3>错词排行</h3>
        ${errorWords}
      </section>
      <p class="fact-note">速度曲线包含 ${result.speedBuckets.length} 个 10 秒桶。</p>
    </section>`;
}

function renderHistory(
  content: Extract<TypingViewPageContent, { kind: 'history' }>
): string {
  const totalPages = Math.max(1, Math.ceil(content.totalItems / content.pageSize));
  const days = content.days.length > 0
    ? `<ul class="history-days">${content.days.map(day => `
        <li>
          <strong>${escapeHtml(day.date)}</strong>
          <span>${day.resultCount} 次 · ${formatDuration(day.activeElapsedMs)} · ${day.correctAttempts} 正确 / ${day.errorAttempts} 错误</span>
        </li>`
      ).join('')}</ul>`
    : '<p class="material-empty">暂无日统计。</p>';
  return `
    <section class="history-page" aria-label="练习历史">
      <div class="history-toolbar">
        <div>
          <h3>记录管理</h3>
          <p class="fact-note">清理后会同时移除历史、每日统计和错题强化数据。</p>
        </div>
        <button
          class="material-action danger-action"
          type="button"
          data-clear-practice-history
          ${content.totalItems === 0 ? 'disabled' : ''}
        >清理全部记录</button>
      </div>
      ${content.totalItems === 0
        ? '<p class="empty-guidance">还没有可显示的练习历史。</p>'
        : ''}
      <section class="fact-section">
        <h3>最近日统计</h3>
        ${days}
      </section>
      <section class="fact-section">
        <h3>成绩记录</h3>
        <p class="fact-note">第 ${content.page} 页 / 共 ${totalPages} 页 · 每页 ${content.pageSize} 条</p>
        ${content.items.length > 0 ? `<ol class="history-list">${content.items.map(item => `
          <li>
            <div>
              <strong>${formatDateTime(item.endedAt)}</strong>
              <span>${escapeHtml(outcomeLabel(item.outcome))}</span>
            </div>
            <span>${formatMetric(item.metrics.effectiveCpm)} 有效 CPM · ${formatMetric(item.metrics.accuracy)}%</span>
          </li>`
        ).join('')}</ol>` : '<p class="material-empty">暂无成绩记录。</p>'}
      </section>
    </section>`;
}

function renderMastery(
  content: Extract<TypingViewPageContent, { kind: 'mastery' }>
): string {
  if (content.totalEntries === 0) {
    return '<p class="empty-guidance">还没有需要强化的错字或错词。</p>';
  }
  return `
    <section class="mastery-page" aria-label="错字与错词强化">
      <p class="fact-note">按当前掌握度分数排列，共 ${content.totalEntries} 项。</p>
      <ol class="mastery-list">${content.entries.map(entry => `
        <li>
          <div>
            <strong>${escapeHtml(entry.key)}</strong>
            <span>${escapeHtml(masteryKindLabel(entry.kind))}</span>
          </div>
          <span>错误 ${entry.wrongCount} 次 · 强化连续正确 ${entry.reinforcementCorrectStreak} 次</span>
        </li>`
      ).join('')}</ol>
    </section>`;
}

function renderSetup(
  content: Extract<TypingViewPageContent, { kind: 'setup' }>
): string {
  const completion = content.plan.completion;
  return `
    <section class="setup-page" aria-label="本次练习设置">
      <div class="setup-source">
        <p class="setup-source-label">当前素材</p>
        <h3>${escapeHtml(content.source.title)}</h3>
        <p>${escapeHtml(profileLabels[content.source.profileKey] ?? content.source.profileKey)} · ${content.source.counts.printableUnits} 个可打印单元</p>
      </div>
      <form class="setup-form" data-setup-form>
        <fieldset>
          <legend>内容范围</legend>
          <label>
            范围
            <select name="range">
              ${content.ranges.map((item, index) => `
                <option value="${index}"${sameRange(item.range, content.selectedRange) ? ' selected' : ''}>${escapeHtml(item.label)}</option>`
              ).join('')}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>完成条件</legend>
          <label>
            类型
            <select name="completionKind">
              ${option('sourceRange', '完成所选范围', completion.kind)}
              ${option('timed', '限时', completion.kind)}
              ${option('length', '定长', completion.kind)}
              ${option('free', '自由练习', completion.kind)}
            </select>
          </label>
          <label>
            限时秒数
            <input name="completionSeconds" type="number" min="1" step="1" value="${completion.kind === 'timed' ? completion.seconds : 180}">
          </label>
          <label>
            目标单元数
            <input name="completionUnits" type="number" min="1" step="1" value="${completion.kind === 'length' ? completion.targetUnits : 100}">
          </label>
        </fieldset>
        <fieldset>
          <legend>判定</legend>
          <label>
            错误处理
            <select name="errorPolicy">
              ${option('block', '必须修正', content.plan.evaluation.errorPolicy)}
              ${option('allowSkip', '允许跳错', content.plan.evaluation.errorPolicy)}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>文本</legend>
          <label>
            标点
            <select name="punctuationMode">
              ${option('strict', '严格匹配', content.plan.textPolicy.punctuation.mode)}
              ${option('equivalent', '中文标点等价', content.plan.textPolicy.punctuation.mode)}
            </select>
          </label>
          <label>
            空白
            <select name="whitespaceMode">
              ${option('strict', '严格匹配', content.plan.textPolicy.whitespace.mode)}
              ${option('trimLineEdges', '忽略行首尾', content.plan.textPolicy.whitespace.mode)}
              ${option('collapse', '合并连续空白', content.plan.textPolicy.whitespace.mode)}
              ${option('ignore', '忽略空白', content.plan.textPolicy.whitespace.mode)}
            </select>
          </label>
          ${checkbox('caseSensitive', '区分大小写', content.plan.textPolicy.caseSensitive)}
        </fieldset>
        <fieldset>
          <legend>推进与显示</legend>
          <label>
            换行推进
            <select name="lineAdvance">
              ${option('automatic', '自动推进', content.plan.flowPolicy.lineAdvance)}
              ${option('enter', '按 Enter 推进', content.plan.flowPolicy.lineAdvance)}
            </select>
          </label>
          <label>
            呈现方式
            <select name="presentation">
              ${option('continuous', '连续滚动', content.plan.flowPolicy.presentation)}
              ${option('lineFocus', '逐行聚焦', content.plan.flowPolicy.presentation)}
            </select>
          </label>
          ${checkbox('showLiveMetrics', '显示实时指标', content.plan.displayPolicy.showLiveMetrics)}
          ${checkbox('showWhitespace', '显示空白符', content.plan.displayPolicy.showWhitespace)}
        </fieldset>
        <div class="setup-actions" role="group" aria-label="练习设置操作">
          <button class="material-action is-primary" type="submit" data-start-practice>保存并开始练习</button>
          <button class="material-action" type="button" data-save-setup-defaults>设为默认</button>
          <button class="material-action" type="button" data-open-practice-editor-settings>编辑练习字体与外观</button>
        </div>
        <p class="setup-defaults-note">“设为默认”只保存判定、文本、推进与显示策略；本次素材范围和完成条件不会写入全局默认。</p>
      </form>
    </section>`;
}

function renderMaterialActions(
  actions: Extract<TypingViewPageContent, { kind: 'materials' }>['actions']
): string {
  const buttons = [
    actions.paste
      ? '<button class="material-action is-primary" type="button" data-action="paste">自由粘贴</button>'
      : '',
    actions.importTxt
      ? '<button class="material-action" type="button" data-action="importTxt">导入 TXT</button>'
      : '',
    actions.importEpub
      ? '<button class="material-action" type="button" data-action="importEpub">导入 EPUB</button>'
      : ''
  ].filter(Boolean);
  if (buttons.length === 0) return '';
  return `
    <div class="material-actions" role="group" aria-label="添加练习素材">
      ${buttons.join('')}
    </div>
    ${actions.paste ? `
      <form class="paste-composer" data-paste-form hidden>
        <label for="typing-paste-content">粘贴练习内容</label>
        <textarea
          id="typing-paste-content"
          name="text"
          rows="7"
          maxlength="400000"
          placeholder="在这里粘贴要练习的文字"
          required
        ></textarea>
        <div class="paste-actions">
          <button class="material-action is-primary" type="submit">开始设置</button>
          <button class="material-action" type="button" data-action="cancelPaste">取消</button>
        </div>
      </form>`
      : ''}`;
}

function renderLive(
  content: Extract<TypingViewPageContent, { kind: 'live' }>
): string {
  const controls = [
    content.controls.pause
      ? '<button class="material-action is-primary" type="button" data-live-action="pause">暂停</button>'
      : '',
    content.controls.resume
      ? '<button class="material-action is-primary" type="button" data-live-action="resume">继续</button>'
      : '',
    content.controls.restart
      ? '<button class="material-action" type="button" data-live-action="restart">重新开始</button>'
      : '',
    content.controls.finish
      ? '<button class="material-action" type="button" data-live-action="finish">结束练习</button>'
      : ''
  ].filter(Boolean);
  const facts = content.progress && content.metrics
    ? `
      <div class="live-progress">
        <strong>${content.progress.completedUnits} / ${content.progress.totalUnits}</strong>
        <span>已完成目标</span>
      </div>
      <dl class="live-metrics">
        <div><dt>准确率</dt><dd>${formatMetric(content.metrics.accuracy)}%</dd></div>
        <div><dt>有效 CPM</dt><dd>${formatMetric(content.metrics.effectiveCpm)}</dd></div>
        <div><dt>原始 CPM</dt><dd>${formatMetric(content.metrics.rawCpm)}</dd></div>
        <div><dt>活动时间</dt><dd>${formatDuration(content.metrics.activeElapsedMs)}</dd></div>
      </dl>`
    : '<p class="live-state" role="status">练习中</p>';
  return `
    <section class="live-page" aria-label="实时练习状态">
      ${facts}
      <div class="material-actions" role="group" aria-label="练习控制">
        ${controls.join('')}
      </div>
    </section>`;
}

function renderMaterialSection(
  title: string,
  materials: readonly TypingViewMaterialSummary[],
  emptyGuidance: string
): string {
  return `
    <section class="material-section">
      <h3>${title} <span class="section-count">${materials.length}</span></h3>
      ${materials.length > 0
        ? `<ul class="material-list">${materials.map(renderMaterial).join('')}</ul>`
        : `<p class="material-empty">${escapeHtml(emptyGuidance || '暂无可用素材。')}</p>`}
    </section>`;
}

function renderMaterial(material: TypingViewMaterialSummary): string {
  const profile = profileLabels[material.profileKey]
    ?? (material.profileKey.startsWith('code.')
      ? `代码 · ${material.profileKey.slice('code.'.length)}`
      : material.profileKey);
  const tags = material.tags.length > 0
    ? `<p class="material-tags">${material.tags
      .map(tag => `<span>${escapeHtml(tag)}</span>`)
      .join('')}</p>`
    : '';
  const sourceNotice = material.sourceNotice
    ? `<p class="source-notice">${escapeHtml(material.sourceNotice.license)} · ${escapeHtml(material.sourceNotice.attribution)}</p>`
    : '';
  return `
    <li class="material-row">
      <button
        class="material-select"
        type="button"
        data-material-id="${escapeHtml(encodeURIComponent(material.id))}"
        data-material-origin="${material.origin}"
      >
        <span class="material-title">${escapeHtml(material.title)}</span>
        <span class="material-profile">${escapeHtml(profile)}</span>
        <span class="material-meta">${material.counts.printableUnits} 个可打印单元 · ${formatEstimate(material.estimatedSeconds)}</span>
        <span class="material-origin">${originLabels[material.origin]}</span>
      </button>
      ${tags}
      ${sourceNotice}
    </li>`;
}

function formatEstimate(seconds: number): string {
  if (seconds < 60) return `约 ${seconds} 秒`;
  return `约 ${Math.ceil(seconds / 60)} 分钟`;
}

function option(value: string, label: string, selectedValue: string): string {
  return `<option value="${value}"${value === selectedValue ? ' selected' : ''}>${label}</option>`;
}

function checkbox(name: string, label: string, checked: boolean): string {
  return `<label class="setup-checkbox"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}> ${label}</label>`;
}

function sameRange(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sessionStatusLabel(status: 'ready' | 'running' | 'blockedOnError' | 'paused'): string {
  if (status === 'ready') return '准备开始';
  if (status === 'running') return '练习中';
  if (status === 'blockedOnError') return '等待修正';
  return '已暂停';
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function outcomeLabel(
  outcome: 'completed' | 'timedOut' | 'abandoned' | 'restarted'
): string {
  if (outcome === 'completed') return '已完成';
  if (outcome === 'timedOut') return '限时结束';
  if (outcome === 'restarted') return '已重新开始';
  return '已结束';
}

function masteryKindLabel(kind: 'grapheme' | 'word' | 'codeToken'): string {
  if (kind === 'grapheme') return '字符';
  if (kind === 'word') return '词语';
  return '代码词元';
}
