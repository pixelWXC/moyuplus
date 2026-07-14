"use strict";
(() => {
  // src/webview/layoutEngine.ts
  var LayoutEngine = class {
    constructor(viewport, onReflow) {
      this.viewport = viewport;
      this.onReflow = onReflow;
      this.source = document.createElement("div");
      this.measure = document.createElement("div");
      Object.assign(this.source.style, { position: "fixed", left: "-100000px", top: "0", visibility: "hidden" });
      Object.assign(this.measure.style, { position: "fixed", left: "-100000px", top: "0", visibility: "hidden", overflow: "hidden" });
      document.body.append(this.source, this.measure);
      window.addEventListener("resize", this.scheduleFromEnvironment);
      document.fonts?.addEventListener("loadingdone", this.scheduleFromEnvironment);
    }
    viewport;
    onReflow;
    source;
    measure;
    sectionId = "";
    pages = [{ start: 0, end: 0 }];
    spans = [];
    totalLength = 0;
    pageIndex = 0;
    scheduledFrame;
    reflowPasses = 0;
    scheduleFromEnvironment = () => this.requestReflow();
    setContent(sectionId, sanitizedHtml, progression = 0) {
      this.sectionId = sectionId;
      this.source.innerHTML = sanitizedHtml;
      this.indexText();
      this.paginate(Math.max(0, Math.min(1, progression)) * this.totalLength);
    }
    reflow() {
      const anchor = this.pages[this.pageIndex]?.start ?? 0;
      this.paginate(anchor);
      this.onReflow?.(this.getState());
    }
    requestReflow() {
      if (this.scheduledFrame !== void 0) return;
      this.scheduledFrame = requestAnimationFrame(() => {
        this.scheduledFrame = void 0;
        this.reflow();
      });
    }
    getReflowPasses() {
      return this.reflowPasses;
    }
    nextPage() {
      if (this.pageIndex >= this.pages.length - 1) return false;
      this.pageIndex += 1;
      this.render();
      return true;
    }
    previousPage() {
      if (this.pageIndex <= 0) return false;
      this.pageIndex -= 1;
      this.render();
      return true;
    }
    getState() {
      const page = this.pages[this.pageIndex] ?? { start: 0, end: 0 };
      return {
        sectionId: this.sectionId,
        pageIndex: this.pageIndex,
        pageCount: this.pages.length,
        progression: this.totalLength === 0 ? 0 : page.start / this.totalLength,
        startOffset: page.start,
        endOffset: page.end,
        canPreviousPage: this.pageIndex > 0,
        canNextPage: this.pageIndex < this.pages.length - 1,
        isSectionStart: this.pageIndex === 0,
        isSectionEnd: this.pageIndex === this.pages.length - 1
      };
    }
    dispose() {
      if (this.scheduledFrame !== void 0) cancelAnimationFrame(this.scheduledFrame);
      window.removeEventListener("resize", this.scheduleFromEnvironment);
      document.fonts?.removeEventListener("loadingdone", this.scheduleFromEnvironment);
      this.source.remove();
      this.measure.remove();
    }
    indexText() {
      this.spans = [];
      this.totalLength = 0;
      const walker = document.createTreeWalker(this.source, NodeFilter.SHOW_TEXT);
      let node2 = walker.nextNode();
      while (node2) {
        const text = node2;
        const start = this.totalLength;
        this.totalLength += text.data.length;
        this.spans.push({ node: text, start, end: this.totalLength });
        node2 = walker.nextNode();
      }
    }
    paginate(anchor) {
      this.reflowPasses += 1;
      this.syncMeasureStyle();
      if (this.totalLength === 0) {
        this.pages = [{ start: 0, end: 0 }];
        this.pageIndex = 0;
        this.viewport.innerHTML = this.source.innerHTML;
        return;
      }
      const pages = [];
      let start = 0;
      while (start < this.totalLength) {
        let step = 256;
        let low = start + 1;
        let high = Math.min(this.totalLength, start + step);
        let best = low;
        while (high < this.totalLength && this.fits(start, high)) {
          best = high;
          low = high + 1;
          step *= 2;
          high = Math.min(this.totalLength, start + step);
        }
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (this.fits(start, middle)) {
            best = middle;
            low = middle + 1;
          } else high = middle - 1;
        }
        const end = this.snapBoundary(start, best);
        pages.push({ start, end });
        start = end > start ? end : start + 1;
      }
      this.pages = pages;
      this.pageIndex = Math.max(0, pages.findIndex((page) => anchor >= page.start && anchor < page.end));
      if (this.pageIndex < 0) this.pageIndex = pages.length - 1;
      this.render();
    }
    syncMeasureStyle() {
      const style = getComputedStyle(this.viewport);
      for (const name of ["box-sizing", "width", "height", "padding", "font", "font-size", "font-family", "font-weight", "line-height", "letter-spacing", "word-break", "white-space"]) {
        this.measure.style.setProperty(name, style.getPropertyValue(name));
      }
      this.measure.style.width = `${this.viewport.clientWidth}px`;
      this.measure.style.height = `${this.viewport.clientHeight}px`;
    }
    fits(start, end) {
      this.measure.replaceChildren(this.fragment(start, end));
      return this.measure.scrollHeight <= this.measure.clientHeight + 1;
    }
    render() {
      const page = this.pages[this.pageIndex];
      this.viewport.replaceChildren(this.fragment(page.start, page.end));
    }
    fragment(start, end) {
      const range = document.createRange();
      const startPoint = this.point(start, false);
      const endPoint = this.point(end, true);
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      return range.cloneContents();
    }
    point(offset, atEnd) {
      const span = this.spans.find((item) => offset < item.end || atEnd && offset === item.end) ?? this.spans[this.spans.length - 1];
      return { node: span.node, offset: Math.max(0, Math.min(span.node.length, offset - span.start)) };
    }
    snapBoundary(start, candidate) {
      if (candidate >= this.totalLength) return this.totalLength;
      const text = this.source.textContent ?? "";
      const floor = Math.max(start + 1, candidate - 80);
      for (let index = candidate; index >= floor; index -= 1) {
        if (/\s|[，。！？；、,.!?;]/u.test(text[index - 1] ?? "")) return index;
      }
      return candidate;
    }
  };

  // src/domain/locators.ts
  function normalizeReadingLocator(value) {
    if (!isRecord(value) || !isNonEmptyString(value.sectionId)) {
      return void 0;
    }
    const base = {
      sectionId: value.sectionId,
      progression: normalizeProgression(value.progression)
    };
    if (value.kind === "txt") {
      const locator = { kind: "txt", ...base };
      if (isNonNegativeFiniteNumber(value.offset)) {
        locator.offset = Math.trunc(value.offset);
      }
      return locator;
    }
    if (value.kind === "epub") {
      const locator = { kind: "epub", ...base };
      if (isNonEmptyString(value.cfi)) {
        locator.cfi = value.cfi;
      }
      if (isNonEmptyString(value.fragment)) {
        locator.fragment = value.fragment;
      }
      return locator;
    }
    return void 0;
  }
  function normalizeProgression(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    return Math.min(1, Math.max(0, value));
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }
  function isNonNegativeFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  // src/reader/readerMessages.ts
  var READER_PROTOCOL_VERSION = 2;
  function isExtensionToReaderV2Message(value) {
    if (!hasEnvelope(value)) return false;
    if (value.type === "readerError") return isNonEmptyString2(value.code) && isNonEmptyString2(value.message);
    if (value.type === "bookReady") {
      return Array.isArray(value.toc) && value.toc.every(isTocNode) && Array.isArray(value.sections) && value.sections.every(isSectionRef) && isNonEmptyString2(value.initialSectionId) && normalizeReadingLocator(value.initialLocator)?.sectionId === value.initialSectionId && value.sections.some((section) => isRecord2(section) && section.id === value.initialSectionId);
    }
    if (!hasSectionEnvelope(value)) return false;
    if (value.type === "bookStart" || value.type === "bookEnd") return true;
    return value.type === "sectionReady" && isSafeSection(value.section, value.sectionId);
  }
  function hasEnvelope(value) {
    return isRecord2(value) && value.version === READER_PROTOCOL_VERSION && isNonEmptyString2(value.requestId) && isNonEmptyString2(value.bookId);
  }
  function hasSectionEnvelope(value) {
    return isNonEmptyString2(value.sectionId);
  }
  function isSafeSection(value, sectionId) {
    if (!isRecord2(value) || value.sectionId !== sectionId || typeof value.sanitizedHtml !== "string" || !isNonEmptyString2(value.sourceRevision) || !Array.isArray(value.localResources)) return false;
    return value.localResources.every((resource) => isRecord2(resource) && isNonEmptyString2(resource.id) && isNonEmptyString2(resource.path) && isNonEmptyString2(resource.mimeType));
  }
  function isTocNode(value) {
    if (!isRecord2(value) || !isNonEmptyString2(value.title) || !isNonEmptyString2(value.sectionId)) return false;
    if (value.fragment !== void 0 && !isNonEmptyString2(value.fragment)) return false;
    return value.children === void 0 || Array.isArray(value.children) && value.children.every(isTocNode);
  }
  function isSectionRef(value) {
    return isRecord2(value) && isNonEmptyString2(value.id) && (value.title === void 0 || isNonEmptyString2(value.title)) && Number.isInteger(value.order) && value.order >= 0 && typeof value.progressionWeight === "number" && Number.isFinite(value.progressionWeight) && value.progressionWeight >= 0;
  }
  function isRecord2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isNonEmptyString2(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  // src/git/gitLogModels.ts
  function createDefaultGitLogPreferences() {
    return {
      showHash: true,
      showAuthor: true,
      showRelativeTime: true,
      showAbsoluteDate: true,
      layout: "lines",
      maxCommits: 200
    };
  }
  function normalizeGitLogMaxCommits(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(1e3, Math.max(20, value))) : createDefaultGitLogPreferences().maxCommits;
  }
  function normalizeGitLogPreferences(value) {
    const defaults = createDefaultGitLogPreferences();
    if (!isRecord3(value)) return defaults;
    return {
      showHash: booleanOr(value.showHash, defaults.showHash),
      showAuthor: booleanOr(value.showAuthor, defaults.showAuthor),
      showRelativeTime: booleanOr(value.showRelativeTime, defaults.showRelativeTime),
      showAbsoluteDate: booleanOr(value.showAbsoluteDate, defaults.showAbsoluteDate),
      layout: value.layout === "inline" || value.layout === "lines" ? value.layout : defaults.layout,
      maxCommits: normalizeGitLogMaxCommits(value.maxCommits)
    };
  }
  function normalizeGitLogCommit(value) {
    if (!isRecord3(value) || !isNonEmptyString3(value.hash) || !isNonEmptyString3(value.subject) || !isNonEmptyString3(value.author) || typeof value.authoredAt !== "number" || !Number.isFinite(value.authoredAt)) {
      return void 0;
    }
    return { hash: value.hash, subject: value.subject, author: value.author, authoredAt: value.authoredAt };
  }
  function booleanOr(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }
  function isRecord3(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isNonEmptyString3(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  // src/git/gitLogMessages.ts
  function isExtensionToGitLogMessage(value) {
    if (!isRecord4(value) || !isNonEmptyString4(value.type)) return false;
    if (value.type === "modeInvalidated") {
      return hasOnlyKeys(value, ["type", "sessionId", "modeGeneration"]) && (value.sessionId === void 0 || isNonEmptyString4(value.sessionId)) && isModeGeneration(value.modeGeneration);
    }
    if (!isNonEmptyString4(value.sessionId)) return false;
    if (value.type === "gitLogReady") {
      return hasOnlyKeys(value, ["type", "sessionId", "repositoryName", "branchName", "detached", "commits"]) && hasDisplayFields(value);
    }
    if (value.type === "gitLogError" || value.type === "gitLogRefreshFailed") {
      return hasOnlyKeys(value, ["type", "sessionId", "code", "message"]) && isNonEmptyString4(value.code) && isNonEmptyString4(value.message);
    }
    if (value.type === "gitLogInvalidated") {
      return hasOnlyKeys(value, ["type", "sessionId"]);
    }
    return value.type === "modeGitLog" && hasOnlyKeys(value, ["type", "sessionId", "modeGeneration", "preferences", "readerPreferences", "cached"]) && isModeGeneration(value.modeGeneration) && isStrictPreferences(value.preferences) && isRecord4(value.readerPreferences) && (value.cached === void 0 || isStrictDisplayResult(value.cached));
  }
  function isStrictDisplayResult(value) {
    return isRecord4(value) && hasOnlyKeys(value, ["repositoryName", "branchName", "detached", "commits"]) && hasDisplayFields(value);
  }
  function hasDisplayFields(value) {
    return isNonEmptyString4(value.repositoryName) && isNonEmptyString4(value.branchName) && typeof value.detached === "boolean" && Array.isArray(value.commits) && value.commits.every(isStrictCommit);
  }
  function isStrictCommit(value) {
    return isRecord4(value) && hasOnlyKeys(value, ["hash", "subject", "author", "authoredAt"]) && normalizeGitLogCommit(value) !== void 0;
  }
  function isStrictPreferences(value) {
    return isRecord4(value) && hasOnlyKeys(value, ["showHash", "showAuthor", "showRelativeTime", "showAbsoluteDate", "layout", "maxCommits"]) && typeof value.showHash === "boolean" && typeof value.showAuthor === "boolean" && typeof value.showRelativeTime === "boolean" && typeof value.showAbsoluteDate === "boolean" && (value.layout === "lines" || value.layout === "inline") && typeof value.maxCommits === "number" && Number.isInteger(value.maxCommits) && value.maxCommits >= 20 && value.maxCommits <= 1e3;
  }
  function isModeGeneration(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  }
  function hasOnlyKeys(value, allowed) {
    const allowedKeys = new Set(allowed);
    return Object.keys(value).every((key) => allowedKeys.has(key));
  }
  function isRecord4(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isNonEmptyString4(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  // src/webview/gitLogPaginator.ts
  var GitLogPaginator = class {
    constructor(viewport, onChange) {
      this.viewport = viewport;
      this.onChange = onChange;
      this.engine = new LayoutEngine(viewport, (state2) => this.emit(state2));
    }
    viewport;
    onChange;
    engine;
    setContent(content) {
      this.engine.setContent("git-log", content.innerHTML, 0);
      this.emit(this.engine.getState());
    }
    nextPage() {
      const moved = this.engine.nextPage();
      this.emit(this.engine.getState());
      return moved;
    }
    previousPage() {
      const moved = this.engine.previousPage();
      this.emit(this.engine.getState());
      return moved;
    }
    requestReflow() {
      this.engine.requestReflow();
    }
    dispose() {
      this.engine.dispose();
    }
    emit(state2) {
      this.onChange({
        pageIndex: state2.pageIndex,
        pageCount: state2.pageCount,
        canPreviousPage: state2.canPreviousPage,
        canNextPage: state2.canNextPage
      });
    }
  };

  // src/webview/gitLogState.ts
  function createInitialGitLogState() {
    const preferences = createDefaultGitLogPreferences();
    return {
      status: "idle",
      detached: false,
      commits: [],
      pageIndex: 0,
      pageCount: 1,
      settingsOpen: false,
      preferences,
      preferencesDraft: preferences
    };
  }
  function gitLogReducer(state2, action) {
    switch (action.type) {
      case "begin":
        return action.cached ? {
          ...createInitialGitLogState(),
          sessionId: action.sessionId,
          status: action.cached.commits.length ? "ready" : "empty",
          repositoryName: action.cached.repositoryName,
          branchName: action.cached.branchName,
          detached: action.cached.detached,
          commits: action.cached.commits,
          preferences: state2.preferences,
          preferencesDraft: state2.preferences
        } : { ...createInitialGitLogState(), sessionId: action.sessionId, status: "loading", preferences: state2.preferences, preferencesDraft: state2.preferences };
      case "ready":
        if (state2.sessionId !== action.sessionId) return state2;
        return {
          ...state2,
          status: action.commits.length ? "ready" : "empty",
          repositoryName: action.repositoryName,
          branchName: action.branchName,
          detached: action.detached,
          commits: action.commits,
          pageIndex: 0,
          pageCount: 1,
          error: void 0,
          refreshNotice: void 0
        };
      case "error":
        return state2.sessionId === action.sessionId ? { ...state2, status: "error", error: action.message, commits: [] } : state2;
      case "refreshFailed":
        return state2.sessionId === action.sessionId && state2.status === "ready" ? { ...state2, refreshNotice: action.message } : state2;
      case "invalidate":
        return state2.sessionId === action.sessionId ? { ...createInitialGitLogState(), sessionId: void 0, preferences: state2.preferences, preferencesDraft: state2.preferences } : state2;
      case "preferencesLoaded": {
        const preferences = normalizeGitLogPreferences(action.preferences);
        return { ...state2, preferences, preferencesDraft: preferences };
      }
      case "openSettings":
        return { ...state2, settingsOpen: true, preferencesDraft: state2.preferences };
      case "closeSettings":
        return { ...state2, settingsOpen: false, preferencesDraft: state2.preferences };
      case "previewPreferences":
        return { ...state2, preferencesDraft: normalizeGitLogPreferences({ ...state2.preferencesDraft, ...action.patch }) };
      case "preferencesSaved":
        return { ...state2, preferences: state2.preferencesDraft, settingsOpen: false, pageIndex: 0 };
      case "pageChanged":
        return { ...state2, pageIndex: action.pageIndex, pageCount: Math.max(1, action.pageCount) };
    }
  }

  // src/webview/readerPreferenceStyles.ts
  function applyReaderPreferences(target, preferences) {
    target.dataset.theme = preferences.theme;
    Object.assign(target.style, {
      fontFamily: preferences.fontFamily === "serif" ? "Georgia, serif" : preferences.fontFamily === "sans-serif" ? "Segoe UI, sans-serif" : "var(--vscode-font-family)",
      fontSize: `${preferences.fontSize}px`,
      lineHeight: String(preferences.lineHeight),
      letterSpacing: `${preferences.letterSpacing}em`,
      padding: `${preferences.pagePadding}px`,
      textAlign: preferences.textAlign
    });
    target.style.setProperty("--paragraph-spacing", `${preferences.paragraphSpacing}em`);
  }

  // src/webview/gitLogView.ts
  var GitLogView = class {
    constructor(root, post2) {
      this.root = root;
      this.post = post2;
    }
    root;
    post;
    state = createInitialGitLogState();
    readerPreferences;
    paginator;
    begin(sessionId, preferences, readerPreferences, cached) {
      this.readerPreferences = readerPreferences;
      this.reduce({ type: "begin", sessionId, ...cached ? { cached } : {} }, false);
      this.reduce({ type: "preferencesLoaded", preferences }, false);
      this.render();
    }
    receive(message) {
      if (message.type === "gitLogReady") {
        this.reduce({
          type: "ready",
          sessionId: message.sessionId,
          repositoryName: message.repositoryName,
          branchName: message.branchName,
          detached: message.detached,
          commits: message.commits
        });
      } else if (message.type === "gitLogError") {
        this.reduce({ type: "error", sessionId: message.sessionId, message: localError(message.code, message.message) });
      } else if (message.type === "gitLogRefreshFailed") {
        this.reduce({
          type: "refreshFailed",
          sessionId: message.sessionId,
          message: "\u5237\u65B0\u5931\u8D25\uFF0C\u6B63\u5728\u663E\u793A\u4E0A\u6B21\u7ED3\u679C\u3002"
        }, false);
        this.updateRefreshNotice();
      } else if (message.type === "gitLogInvalidated") {
        this.reduce({ type: "invalidate", sessionId: message.sessionId });
      }
    }
    dispose() {
      this.paginator?.dispose();
      this.paginator = void 0;
      this.state = createInitialGitLogState();
      this.readerPreferences = void 0;
    }
    reduce(action, render2 = true) {
      this.state = gitLogReducer(this.state, action);
      if (render2) this.render();
    }
    render() {
      this.paginator?.dispose();
      this.paginator = void 0;
      this.root.className = "git-log-view";
      this.root.replaceChildren();
      const toolbar = node("header", "reader-toolbar git-log-toolbar");
      toolbar.append(node("strong", "reader-title", "Git Log"));
      const tools = node("div", "reader-tools");
      tools.append(iconButton("Aa", "Git Log \u8BBE\u7F6E", () => this.reduce({ type: "openSettings" })));
      toolbar.append(tools);
      const context = node("div", "chapter-bar git-log-context");
      context.append(node("span", "chapter-title", this.contextLabel()));
      const viewport = node("main", "reader-content git-log-content");
      viewport.id = "git-log-content";
      viewport.tabIndex = 0;
      if (this.readerPreferences) applyReaderPreferences(viewport, this.readerPreferences);
      const footer = node("footer", "reader-footer git-log-footer");
      const previous = button("\u4E0A\u4E00\u9875", "page-action", () => this.movePrevious(), true);
      previous.id = "git-log-previous-page";
      const progress = node("span", "page-progress", "\u2014");
      progress.id = "git-log-page-progress";
      const next = button("\u4E0B\u4E00\u9875", "page-action", () => this.moveNext(), true);
      next.id = "git-log-next-page";
      footer.append(previous, progress, next);
      this.root.append(toolbar, context, viewport, footer);
      this.updateRefreshNotice();
      if (this.state.status === "loading") viewport.append(node("p", "notice", "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u5206\u652F\u2026"));
      else if (this.state.status === "error") viewport.append(node("p", "notice notice-error", this.state.error ?? "\u65E0\u6CD5\u8BFB\u53D6 Git \u5386\u53F2\u3002"));
      else if (this.state.status === "empty") viewport.append(node("p", "notice", "\u5F53\u524D\u5206\u652F\u6CA1\u6709\u63D0\u4EA4\u3002"));
      else if (this.state.status === "ready") {
        this.paginator = new GitLogPaginator(viewport, (page) => this.commitPage(page));
        this.paginator.setContent(this.commitContent());
      }
      if (this.state.settingsOpen) this.root.append(this.settingsDrawer());
    }
    updateRefreshNotice() {
      this.root.querySelector(".git-log-refresh-notice")?.remove();
      if (!this.state.refreshNotice) return;
      const context = this.root.querySelector(".git-log-context");
      if (!context) return;
      const notice = node("span", "git-log-refresh-notice", this.state.refreshNotice);
      notice.setAttribute("role", "status");
      context.append(notice);
    }
    contextLabel() {
      if (!this.state.repositoryName && !this.state.branchName) return "\u5F53\u524D\u5DE5\u4F5C\u533A \xB7 \u5F53\u524D\u5206\u652F";
      return `${this.state.repositoryName ?? "\u5DE5\u4F5C\u533A"} \xB7 ${this.state.detached ? "detached " : ""}${this.state.branchName ?? "HEAD"}`;
    }
    commitContent() {
      const content = node("div", `git-log-document git-layout-${this.state.preferencesDraft.layout}`);
      for (const commit of this.state.commits) content.append(this.commitEntry(commit));
      return content;
    }
    commitEntry(commit) {
      const entry = node("article", "git-commit");
      const values = [commit.subject, ...this.optionalValues(commit)];
      if (this.state.preferencesDraft.layout === "inline") {
        entry.append(node("span", "git-commit-line", values.join(" \xB7 ")));
      } else {
        for (const value of values) entry.append(node("span", "git-commit-line", value));
      }
      return entry;
    }
    optionalValues(commit) {
      const preferences = this.state.preferencesDraft;
      const values = [];
      if (preferences.showHash) values.push(commit.hash.slice(0, 8));
      if (preferences.showAuthor) values.push(commit.author);
      if (preferences.showRelativeTime) values.push(relativeTime(commit.authoredAt));
      if (preferences.showAbsoluteDate) values.push(absoluteDate(commit.authoredAt));
      return values;
    }
    commitPage(page) {
      this.state = gitLogReducer(this.state, { type: "pageChanged", pageIndex: page.pageIndex, pageCount: page.pageCount });
      const previous = this.root.querySelector("#git-log-previous-page");
      const next = this.root.querySelector("#git-log-next-page");
      const progress = this.root.querySelector("#git-log-page-progress");
      if (previous) previous.disabled = !page.canPreviousPage;
      if (next) next.disabled = !page.canNextPage;
      if (progress) progress.textContent = `${page.pageIndex + 1} / ${page.pageCount}`;
    }
    movePrevious() {
      this.paginator?.previousPage();
    }
    moveNext() {
      this.paginator?.nextPage();
    }
    settingsDrawer() {
      const view = this;
      const drawer = node("aside", "reader-drawer git-log-settings");
      drawer.setAttribute("aria-label", "Git Log \u8BBE\u7F6E");
      const header = node("header", "drawer-header");
      header.append(node("h2", void 0, "Git Log \u8BBE\u7F6E"), iconButton("\xD7", "\u5173\u95ED Git Log \u8BBE\u7F6E", () => this.reduce({ type: "closeSettings" })));
      const form = node("form", "settings-form");
      form.append(
        checkField("\u663E\u793A Hash", "showHash"),
        checkField("\u663E\u793A\u4F5C\u8005", "showAuthor"),
        checkField("\u663E\u793A\u76F8\u5BF9\u65F6\u95F4", "showRelativeTime"),
        checkField("\u663E\u793A\u65E5\u671F", "showAbsoluteDate"),
        selectField2("\u63D0\u4EA4\u5185\u6392\u5217", "layout", [["lines", "\u9010\u9879\u6362\u884C"], ["inline", "\u6807\u70B9\u5206\u9694"]]),
        rangeField2("\u6700\u591A\u52A0\u8F7D", "maxCommits", 20, 1e3, 20)
      );
      const actions = node("div", "settings-actions");
      actions.append(button("\u6062\u590D\u9ED8\u8BA4", "subtle-button", () => {
        this.state = gitLogReducer(this.state, { type: "previewPreferences", patch: createDefaultGitLogPreferences() });
        this.render();
      }), button("\u4FDD\u5B58", "primary-action", () => {
        const preferences = this.state.preferencesDraft;
        this.state = gitLogReducer(this.state, { type: "preferencesSaved" });
        this.post({ type: "saveGitLogPreferences", preferences });
        this.render();
      }));
      form.append(actions);
      drawer.append(header, form);
      return drawer;
      function checkField(label, key) {
        const field = node("label", "setting-field git-check-field");
        const input = node("input");
        input.type = "checkbox";
        input.checked = Boolean(view.state.preferencesDraft[key]);
        input.addEventListener("change", () => preview2({ [key]: input.checked }));
        field.append(node("span", void 0, label), input);
        return field;
      }
      function selectField2(label, key, options) {
        const field = node("label", "setting-field");
        const select = node("select");
        for (const [value, text] of options) {
          const option = node("option", void 0, text);
          option.value = value;
          option.selected = view.state.preferencesDraft[key] === value;
          select.append(option);
        }
        select.addEventListener("change", () => preview2({ [key]: select.value }));
        field.append(node("span", void 0, label), select);
        return field;
      }
      function rangeField2(label, key, min, max, step) {
        const field = node("label", "setting-field range-field");
        const value = view.state.preferencesDraft[key];
        const input = node("input");
        Object.assign(input, { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) });
        input.addEventListener("input", () => preview2({ [key]: Number(input.value) }));
        field.append(node("span", void 0, `${label} ${value}`), input);
        return field;
      }
      function preview2(patch) {
        view.reduce({ type: "previewPreferences", patch });
      }
    }
  };
  function node(tag, className, text) {
    const target = document.createElement(tag);
    if (className) target.className = className;
    if (text !== void 0) target.textContent = text;
    return target;
  }
  function button(label, className, handler, disabled = false) {
    const target = node("button", className, label);
    target.type = "button";
    target.disabled = disabled;
    target.addEventListener("click", handler);
    return target;
  }
  function iconButton(label, ariaLabel, handler) {
    const target = button(label, "icon-button", handler);
    target.setAttribute("aria-label", ariaLabel);
    target.title = ariaLabel;
    return target;
  }
  function relativeTime(seconds) {
    const delta = Math.max(0, Math.floor(Date.now() / 1e3 - seconds));
    if (delta < 60) return "\u521A\u521A";
    if (delta < 3600) return `${Math.floor(delta / 60)} \u5206\u949F\u524D`;
    if (delta < 86400) return `${Math.floor(delta / 3600)} \u5C0F\u65F6\u524D`;
    if (delta < 86400 * 30) return `${Math.floor(delta / 86400)} \u5929\u524D`;
    if (delta < 86400 * 365) return `${Math.floor(delta / (86400 * 30))} \u4E2A\u6708\u524D`;
    return `${Math.floor(delta / (86400 * 365))} \u5E74\u524D`;
  }
  function absoluteDate(seconds) {
    return new Intl.DateTimeFormat(void 0, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(seconds * 1e3));
  }
  function localError(code, fallback) {
    const messages = {
      noWorkspace: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u5DE5\u4F5C\u533A\u3002",
      notGitRepository: "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662F Git \u4ED3\u5E93\u3002",
      gitUnavailable: "\u65E0\u6CD5\u4F7F\u7528 Git\u3002",
      noCommits: "\u5F53\u524D\u5206\u652F\u6CA1\u6709\u63D0\u4EA4\u3002",
      queryTimedOut: "\u8BFB\u53D6 Git \u5386\u53F2\u8D85\u65F6\u3002",
      queryFailed: "\u65E0\u6CD5\u8BFB\u53D6 Git \u5386\u53F2\u3002"
    };
    return messages[code] ?? fallback;
  }

  // src/domain/readerPreferences.ts
  var READER_PREFERENCE_LIMITS = {
    fontSize: { min: 12, max: 32 },
    lineHeight: { min: 1.2, max: 2.4 },
    letterSpacing: { min: -0.05, max: 0.2 },
    paragraphSpacing: { min: 0, max: 3 },
    pagePadding: { min: 8, max: 64 }
  };
  function createDefaultReaderPreferences() {
    return {
      fontFamily: "system",
      fontSize: 16,
      lineHeight: 1.6,
      letterSpacing: 0,
      paragraphSpacing: 0.75,
      textColor: "#1f2328",
      backgroundColor: "#ffffff",
      pagePadding: 24,
      textAlign: "left",
      theme: "system"
    };
  }
  function normalizeReaderPreferences(value) {
    const defaults = createDefaultReaderPreferences();
    if (!isRecord5(value)) {
      return defaults;
    }
    return {
      fontFamily: isFontFamily(value.fontFamily) ? value.fontFamily : defaults.fontFamily,
      fontSize: normalizeNumber(value.fontSize, READER_PREFERENCE_LIMITS.fontSize, defaults.fontSize),
      lineHeight: normalizeNumber(value.lineHeight, READER_PREFERENCE_LIMITS.lineHeight, defaults.lineHeight),
      letterSpacing: normalizeNumber(
        value.letterSpacing,
        READER_PREFERENCE_LIMITS.letterSpacing,
        defaults.letterSpacing
      ),
      paragraphSpacing: normalizeNumber(
        value.paragraphSpacing,
        READER_PREFERENCE_LIMITS.paragraphSpacing,
        defaults.paragraphSpacing
      ),
      textColor: normalizeColor(value.textColor) ?? defaults.textColor,
      backgroundColor: normalizeColor(value.backgroundColor) ?? defaults.backgroundColor,
      pagePadding: normalizeNumber(value.pagePadding, READER_PREFERENCE_LIMITS.pagePadding, defaults.pagePadding),
      textAlign: isTextAlign(value.textAlign) ? value.textAlign : defaults.textAlign,
      theme: isTheme(value.theme) ? value.theme : defaults.theme
    };
  }
  function normalizeNumber(value, limits, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(limits.max, Math.max(limits.min, value));
  }
  function normalizeColor(value) {
    if (typeof value !== "string") {
      return void 0;
    }
    const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
    if (shortHex) {
      return `#${[...shortHex[1]].map((digit) => digit.repeat(2)).join("")}`.toLowerCase();
    }
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : void 0;
  }
  function isRecord5(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isFontFamily(value) {
    return value === "system" || value === "serif" || value === "sans-serif";
  }
  function isTextAlign(value) {
    return value === "left" || value === "justify";
  }
  function isTheme(value) {
    return value === "system" || value === "light" || value === "sepia" || value === "dark";
  }

  // src/webview/readerState.ts
  var REMOVE_BOOK_CONFIRMATION = "\u4EC5\u4ECE MoyuPlus \u4E66\u67B6\u79FB\u9664\uFF0C\u4E0D\u4F1A\u5220\u9664\u539F\u6587\u4EF6\u3002";
  function createInitialReaderAppState() {
    const preferences = createDefaultReaderPreferences();
    return { view: "library", status: "loading", books: [], preferences, preferencesDraft: preferences };
  }
  function readerAppReducer(state2, action) {
    switch (action.type) {
      case "libraryLoaded": {
        const books = action.books.map((book) => {
          const available = action.availability[book.id] !== false;
          return {
            ...book,
            available,
            status: available ? "available" : "missing",
            progress: normalizeProgress(action.progress[book.id])
          };
        });
        return {
          ...state2,
          view: "library",
          status: "ready",
          books,
          pendingRemoval: state2.pendingRemoval && books.some((book) => book.id === state2.pendingRemoval?.bookId) ? state2.pendingRemoval : void 0
        };
      }
      case "requestRemove":
        return { ...state2, pendingRemoval: { bookId: action.bookId, message: REMOVE_BOOK_CONFIRMATION } };
      case "cancelRemove": {
        const { pendingRemoval: _pendingRemoval, ...next } = state2;
        return next;
      }
      case "bookRemoved":
        return {
          ...state2,
          books: state2.books.filter((book) => book.id !== action.bookId),
          pendingRemoval: void 0
        };
      case "showError":
        return { ...state2, status: "error", error: action.message };
      case "openReader":
        return { ...state2, view: "reader", status: "loading", activeBook: action.book, requestId: action.requestId, notice: void 0 };
      case "closeReader":
        return { ...state2, view: "library", status: "ready", activeBook: void 0, requestId: void 0, toc: void 0, sections: void 0, activeSectionId: void 0, initialProgression: void 0, layout: void 0, navigation: void 0, drawer: void 0, notice: void 0 };
      case "bookReady":
        if (state2.requestId !== action.requestId) return state2;
        return { ...state2, toc: action.toc, sections: action.sections, activeSectionId: action.initialSectionId, initialProgression: action.initialProgression, status: "loading", navigation: navigationFor(action.sections, action.initialSectionId) };
      case "selectSection":
        return { ...state2, activeSectionId: action.sectionId, status: "loading", drawer: void 0, notice: void 0, navigation: navigationFor(state2.sections ?? [], action.sectionId) };
      case "layoutChanged": {
        const chapter = navigationFor(state2.sections ?? [], action.sectionId);
        return { ...state2, status: "ready", activeSectionId: action.sectionId, layout: action, notice: void 0, navigation: {
          ...chapter,
          canPreviousPage: action.canPreviousPage || chapter.canPreviousSection,
          canNextPage: action.canNextPage || chapter.canNextSection
        } };
      }
      case "openDrawer":
        return { ...state2, drawer: action.drawer };
      case "closeDrawer":
        return { ...state2, drawer: void 0 };
      case "bookBoundary":
        return { ...state2, notice: action.edge === "start" ? "\u5DF2\u5230\u672C\u4E66\u5F00\u5934" : "\u5DF2\u8BFB\u5B8C\u672C\u4E66" };
      case "preferencesLoaded": {
        const preferences = normalizeReaderPreferences(action.preferences);
        return { ...state2, preferences, preferencesDraft: preferences };
      }
      case "previewPreferences":
        return { ...state2, preferencesDraft: normalizeReaderPreferences({ ...state2.preferencesDraft, ...action.patch }) };
      case "preferencesSaved":
        return { ...state2, preferences: state2.preferencesDraft };
      case "resetPreferences":
        return { ...state2, preferencesDraft: createDefaultReaderPreferences() };
    }
  }
  function navigationFor(sections, sectionId) {
    const index = sections.findIndex((section) => section.id === sectionId);
    return { canPreviousPage: false, canNextPage: false, canPreviousSection: index > 0, canNextSection: index >= 0 && index < sections.length - 1 };
  }
  function getLibraryBookActions(book) {
    return [
      "open",
      ...book.capabilities.typing ? ["startTypingPractice"] : [],
      "relocate",
      "remove"
    ];
  }
  function normalizeProgress(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }

  // src/webview/readerApp.ts
  var READER_APP_BUILD_TARGET = "webview";
  window.MoyuplusReader = { LayoutEngine };
  var vscode = window.acquireVsCodeApi?.();
  var app = document.querySelector("#app");
  var state = createInitialReaderAppState();
  var layout;
  var requestSequence = 0;
  var currentSectionHtml = "";
  var appMode = "boot";
  var gitLogView;
  var acceptedModeGeneration = 0;
  function dispatch(action) {
    state = readerAppReducer(state, action);
    render();
  }
  function post(message) {
    vscode?.postMessage(message);
  }
  function envelope(type, sectionId) {
    return { version: 2, type, requestId: state.requestId, bookId: state.activeBook?.id, ...sectionId ? { sectionId } : {} };
  }
  function render() {
    if (!app) return;
    if (appMode === "boot") {
      app.className = "boot-view";
      app.replaceChildren();
      return;
    }
    if (appMode === "gitLog") return;
    if (state.view === "reader") {
      renderReader(app);
      return;
    }
    layout?.dispose();
    layout = void 0;
    renderLibrary(app);
    post({ type: "navigationState", canNextPage: false });
  }
  function renderLibrary(root) {
    root.className = "library-view";
    root.replaceChildren();
    const header = element("header", "library-header");
    const heading = element("div", "library-heading");
    heading.append(element("p", "eyebrow", "MOYUPLUS"), element("h1", void 0, "\u4E66\u67B6"));
    header.append(heading, button2("\u5BFC\u5165", "primary-action", () => post({ type: "importBook" })));
    root.append(header);
    if (state.status === "loading") {
      root.append(element("p", "notice", "\u6B63\u5728\u8F7D\u5165\u4E66\u67B6\u2026"));
      return;
    }
    if (state.status === "error") {
      root.append(element("p", "notice notice-error", state.error ?? "\u4E66\u67B6\u8F7D\u5165\u5931\u8D25\u3002"));
      return;
    }
    if (state.books.length === 0) {
      const empty = element("section", "empty-library");
      empty.append(
        element("h2", void 0, "\u4E66\u67B6\u4E2D\u8FD8\u6CA1\u6709\u4E66"),
        element("p", void 0, "\u70B9\u51FB\u53F3\u4E0A\u89D2\u201C\u5BFC\u5165\u201D\uFF0C\u6DFB\u52A0\u672C\u5730 EPUB \u6216 TXT\u3002")
      );
      root.append(empty);
      return;
    }
    const list = element("ol", "book-list");
    list.setAttribute("aria-label", "\u5DF2\u5BFC\u5165\u4E66\u7C4D");
    state.books.forEach((book) => list.append(renderBook(book)));
    root.append(list);
    if (state.pendingRemoval) root.append(renderRemovalConfirmation(state.pendingRemoval.bookId, state.pendingRemoval.message));
  }
  function renderReader(root) {
    root.className = "reader-view";
    root.replaceChildren();
    const toolbar = element("header", "reader-toolbar");
    toolbar.append(iconButton2("\u2190", "\u8FD4\u56DE\u4E66\u67B6", closeBook), element("strong", "reader-title", state.activeBook?.title ?? "\u9605\u8BFB"));
    const tools = element("div", "reader-tools");
    tools.append(iconButton2("\u2630", "\u76EE\u5F55", () => dispatch({ type: "openDrawer", drawer: "toc" })), iconButton2("Aa", "\u9605\u8BFB\u8BBE\u7F6E", () => dispatch({ type: "openDrawer", drawer: "settings" })));
    toolbar.append(tools);
    root.append(toolbar);
    const chapter = element("nav", "chapter-bar");
    chapter.setAttribute("aria-label", "\u7AE0\u8282\u5BFC\u822A");
    chapter.append(
      iconButton2("\u2039", "\u4E0A\u4E00\u7AE0", () => requestAdjacent("requestPreviousSection"), !state.navigation?.canPreviousSection),
      element("span", "chapter-title", currentSectionTitle()),
      iconButton2("\u203A", "\u4E0B\u4E00\u7AE0", () => requestAdjacent("requestNextSection"), !state.navigation?.canNextSection)
    );
    root.append(chapter);
    const viewport = element("main", "reader-content");
    viewport.id = "reader-content";
    viewport.setAttribute("tabindex", "0");
    root.append(viewport);
    applyReaderPreferences(viewport, state.preferencesDraft);
    const priorLayout = state.layout;
    let priorProgression = 0;
    if (priorLayout && priorLayout.sectionId === state.activeSectionId) priorProgression = priorLayout.progression;
    layout?.dispose();
    layout = new LayoutEngine(viewport, (current) => commitLayout(current));
    if (currentSectionHtml && state.activeSectionId) {
      layout.setContent(state.activeSectionId, currentSectionHtml, priorLayout ? priorProgression : state.initialProgression ?? 0);
      state = readerAppReducer(state, { type: "layoutChanged", ...layout.getState() });
    } else if (state.status === "loading") viewport.append(element("p", "notice", "\u6B63\u5728\u8F7D\u5165\u7AE0\u8282\u2026"));
    if (state.status === "error") viewport.append(element("p", "notice notice-error", state.error ?? "\u7AE0\u8282\u8F7D\u5165\u5931\u8D25\u3002"));
    const footer = element("footer", "reader-footer");
    const previous = button2("\u4E0A\u4E00\u9875", "page-action", previousPage, !state.navigation?.canPreviousPage);
    previous.id = "previous-page";
    const progress = element("span", "page-progress", formatReadingProgress());
    progress.id = "page-progress";
    const next = button2("\u4E0B\u4E00\u9875", "page-action", nextPage, !state.navigation?.canNextPage);
    next.id = "next-page";
    footer.append(previous, progress, next);
    root.append(footer);
    if (state.notice) {
      const notice = element("div", "reader-toast", state.notice);
      notice.setAttribute("role", "status");
      root.append(notice);
    }
    if (state.drawer === "toc") root.append(renderTocDrawer());
    if (state.drawer === "settings") root.append(renderSettingsDrawer());
    post({ type: "navigationState", canNextPage: Boolean(state.navigation?.canNextPage) });
  }
  function renderTocDrawer() {
    const drawer = drawerShell("\u76EE\u5F55");
    const list = element("ol", "toc-list");
    list.setAttribute("aria-label", "\u4E66\u7C4D\u76EE\u5F55");
    appendTocNodes(list, state.toc ?? [], 0);
    drawer.append(list);
    return drawer;
  }
  function appendTocNodes(parent, nodes, depth) {
    nodes.forEach((node2) => {
      const item = element("li", "toc-item");
      const target = button2(node2.title, node2.sectionId === state.activeSectionId ? "toc-link is-current" : "toc-link", () => selectSection(node2.sectionId));
      target.style.setProperty("--toc-depth", String(depth));
      item.append(target);
      if (node2.children?.length) {
        const nested = element("ol", "toc-list");
        appendTocNodes(nested, node2.children, depth + 1);
        item.append(nested);
      }
      parent.append(item);
    });
  }
  function renderSettingsDrawer() {
    const drawer = drawerShell("\u9605\u8BFB\u8BBE\u7F6E");
    const form = element("form", "settings-form");
    form.append(
      selectField("\u5B57\u4F53", "fontFamily", [["system", "VS Code"], ["serif", "\u886C\u7EBF"], ["sans-serif", "\u65E0\u886C\u7EBF"]]),
      rangeField("\u5B57\u53F7", "fontSize", 12, 32, 1),
      rangeField("\u884C\u9AD8", "lineHeight", 1.2, 2.4, 0.1),
      rangeField("\u5B57\u8DDD", "letterSpacing", -0.05, 0.2, 0.01),
      rangeField("\u6BB5\u8DDD", "paragraphSpacing", 0, 3, 0.25),
      rangeField("\u9875\u8FB9\u8DDD", "pagePadding", 8, 64, 2),
      selectField("\u5BF9\u9F50", "textAlign", [["left", "\u5DE6\u5BF9\u9F50"], ["justify", "\u4E24\u7AEF\u5BF9\u9F50"]]),
      selectField("\u4E3B\u9898", "theme", [["system", "\u8DDF\u968F VS Code"], ["light", "\u660E\u4EAE"], ["sepia", "\u7EB8\u5F20"], ["dark", "\u6DF1\u8272"]])
    );
    const actions = element("div", "settings-actions");
    actions.append(
      button2("\u6062\u590D\u9ED8\u8BA4", "subtle-button", () => {
        dispatch({ type: "resetPreferences" });
        layout?.requestReflow();
      }),
      button2("\u4FDD\u5B58", "primary-action", () => {
        dispatch({ type: "preferencesSaved" });
        post({ type: "savePreferences", preferences: state.preferencesDraft });
      })
    );
    form.append(actions);
    drawer.append(form);
    return drawer;
  }
  function drawerShell(title) {
    const drawer = element("aside", "reader-drawer");
    drawer.setAttribute("aria-label", title);
    const header = element("header", "drawer-header");
    header.append(element("h2", void 0, title), iconButton2("\xD7", `\u5173\u95ED${title}`, () => {
      dispatch({ type: "closeDrawer" });
      layout?.requestReflow();
    }));
    drawer.append(header);
    return drawer;
  }
  function selectField(label, key, options) {
    const field = element("label", "setting-field");
    field.append(element("span", void 0, label));
    const select = element("select");
    options.forEach(([value, text]) => {
      const option = element("option", void 0, text);
      option.value = value;
      option.selected = state.preferencesDraft[key] === value;
      select.append(option);
    });
    select.addEventListener("change", () => preview(key, select.value));
    field.append(select);
    return field;
  }
  function rangeField(label, key, min, max, step) {
    const field = element("label", "setting-field range-field");
    const value = Number(state.preferencesDraft[key]);
    field.append(element("span", void 0, `${label} ${value}`));
    const input = element("input");
    Object.assign(input, { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) });
    input.addEventListener("input", () => preview(key, Number(input.value)));
    field.append(input);
    return field;
  }
  function preview(key, value) {
    dispatch({ type: "previewPreferences", patch: { [key]: value } });
    layout?.requestReflow();
  }
  function openBook(book) {
    const requestId = `webview-${Date.now()}-${++requestSequence}`;
    dispatch({ type: "openReader", book, requestId });
    post({ version: 2, type: "openBook", requestId, bookId: book.id });
  }
  function selectSection(sectionId) {
    dispatch({ type: "selectSection", sectionId });
    post(envelope("requestSection", sectionId));
  }
  function requestAdjacent(type) {
    const id = state.activeSectionId;
    if (id) post(envelope(type, id));
  }
  function nextPage() {
    if (layout?.nextPage()) updateLayout();
    else if (state.navigation?.canNextSection) requestAdjacent("requestNextSection");
    else dispatch({ type: "bookBoundary", edge: "end" });
  }
  function previousPage() {
    if (layout?.previousPage()) updateLayout();
    else if (state.navigation?.canPreviousSection) requestAdjacent("requestPreviousSection");
    else dispatch({ type: "bookBoundary", edge: "start" });
  }
  function updateLayout() {
    if (layout) commitLayout(layout.getState());
  }
  function commitLayout(current) {
    state = readerAppReducer(state, { type: "layoutChanged", ...current });
    const previous = document.querySelector("#previous-page");
    if (previous) previous.disabled = !state.navigation?.canPreviousPage;
    const next = document.querySelector("#next-page");
    if (next) next.disabled = !state.navigation?.canNextPage;
    const progress = document.querySelector("#page-progress");
    if (progress) progress.textContent = formatReadingProgress();
    post({ type: "navigationState", canNextPage: Boolean(state.navigation?.canNextPage) });
    post({ ...envelope("layoutStable", current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
  }
  function closeBook() {
    if (layout) {
      const current = layout.getState();
      post({ ...envelope("closeBook", current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
    }
    dispatch({ type: "closeReader" });
  }
  function locatorFor(current) {
    return state.activeBook?.format === "txt" ? { kind: "txt", sectionId: current.sectionId, progression: current.progression, offset: current.startOffset } : { kind: "epub", sectionId: current.sectionId, progression: current.progression };
  }
  function wholeBookProgress(current) {
    const sections = state.sections ?? [];
    const total = sections.reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0);
    const index = sections.findIndex((section) => section.id === current.sectionId);
    if (total <= 0 || index < 0) return 0;
    const before = sections.slice(0, index).reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0);
    return (before + current.progression * Math.max(1, sections[index].progressionWeight)) / total;
  }
  function currentSectionTitle() {
    return state.sections?.find((section) => section.id === state.activeSectionId)?.title ?? "\u6B63\u6587";
  }
  function formatReadingProgress() {
    const page = state.layout;
    return page ? `${page.pageIndex + 1} / ${page.pageCount}` : "\u2014";
  }
  function renderBook(book) {
    const row = element("li", `book-row${book.available ? "" : " is-missing"}`);
    const open = button2("", "book-open", () => openBook(book), !book.available);
    open.setAttribute("aria-label", `\u6253\u5F00\u300A${book.title}\u300B`);
    const format = element("span", `format-badge format-${book.format}`, book.format.toUpperCase());
    const copy = element("span", "book-copy");
    copy.append(element("strong", "book-title", book.title), element("span", "book-meta", `${book.authors.length ? book.authors.join("\u3001") : "\u672A\u77E5\u4F5C\u8005"} \xB7 ${formatProgress(book.progress)}`));
    if (!book.available) copy.append(element("span", "missing-status", "\u539F\u6587\u4EF6\u5DF2\u79FB\u52A8\u6216\u5220\u9664"));
    open.append(format, copy);
    row.append(open, renderActions(book));
    return row;
  }
  function renderActions(book) {
    const actions = element("div", "book-actions");
    const labels = { open: "\u9605\u8BFB", startTypingPractice: "\u6253\u5B57\u7EC3\u4E60", relocate: "\u91CD\u65B0\u5B9A\u4F4D", remove: "\u79FB\u9664" };
    getLibraryBookActions(book).filter((action) => action !== "open").forEach((action) => actions.append(button2(labels[action], action === "remove" ? "danger-action" : "subtle-action", () => action === "remove" ? dispatch({ type: "requestRemove", bookId: book.id }) : post({ type: action, bookId: book.id }))));
    return actions;
  }
  function renderRemovalConfirmation(bookId, message) {
    const book = state.books.find((item) => item.id === bookId);
    const section = element("section", "removal-confirmation");
    section.setAttribute("role", "alertdialog");
    section.append(element("strong", void 0, `\u79FB\u9664\u300A${book?.title ?? "\u8FD9\u672C\u4E66"}\u300B\uFF1F`), element("p", void 0, message));
    const actions = element("div", "confirmation-actions");
    actions.append(button2("\u53D6\u6D88", "subtle-action", () => dispatch({ type: "cancelRemove" })), button2("\u4ECE\u4E66\u67B6\u79FB\u9664", "danger-button", () => post({ type: "removeBook", bookId })));
    section.append(actions);
    return section;
  }
  function formatProgress(progress) {
    return progress <= 0 ? "\u672A\u5F00\u59CB" : `\u5DF2\u8BFB ${Math.round(progress * 100)}%`;
  }
  function iconButton2(label, ariaLabel, handler, disabled = false) {
    const target = button2(label, "icon-button", handler, disabled);
    target.setAttribute("aria-label", ariaLabel);
    target.title = ariaLabel;
    return target;
  }
  function button2(label, className, handler, disabled = false) {
    const target = element("button", className, label);
    target.type = "button";
    target.disabled = disabled;
    target.addEventListener("click", handler);
    return target;
  }
  function element(tag, className, text) {
    const target = document.createElement(tag);
    if (className) target.className = className;
    if (text !== void 0) target.textContent = text;
    return target;
  }
  window.addEventListener("message", (event) => {
    if (isModeGitLog(event.data) && app) {
      if (!acceptModeGeneration(event.data.modeGeneration)) return;
      layout?.dispose();
      layout = void 0;
      gitLogView?.dispose();
      appMode = "gitLog";
      gitLogView = new GitLogView(app, post);
      gitLogView.begin(event.data.sessionId, event.data.preferences, event.data.readerPreferences, event.data.cached);
      post({ type: "navigationState", canNextPage: false });
      return;
    }
    if (isModeLibrary(event.data)) {
      if (!acceptModeGeneration(event.data.modeGeneration)) return;
      gitLogView?.dispose();
      gitLogView = void 0;
      appMode = "readerApp";
      if (event.data.message) dispatch({ type: "showError", message: event.data.message });
      else render();
      return;
    }
    if (isModeReaderRestore(event.data)) {
      if (!acceptModeGeneration(event.data.modeGeneration)) return;
      gitLogView?.dispose();
      gitLogView = void 0;
      appMode = "readerApp";
      state = readerAppReducer(state, {
        type: "libraryLoaded",
        books: event.data.books,
        availability: event.data.availability,
        progress: event.data.progress
      });
      if (event.data.preferences) state = readerAppReducer(state, { type: "preferencesLoaded", preferences: event.data.preferences });
      dispatch({ type: "openReader", book: event.data.book, requestId: event.data.requestId });
      return;
    }
    if (isModeInvalidated(event.data)) {
      if (!acceptModeGeneration(event.data.modeGeneration)) return;
      layout?.dispose();
      layout = void 0;
      gitLogView?.dispose();
      gitLogView = void 0;
      appMode = "boot";
      render();
      return;
    }
    if (isExtensionToGitLogMessage(event.data)) {
      if (appMode === "gitLog") gitLogView?.receive(event.data);
      return;
    }
    if (isReaderCommand(event.data)) {
      if (appMode !== "readerApp") return;
      const command = event.data.command;
      if (command === "nextPage") nextPage();
      else if (command === "previousPage") previousPage();
      else if (command === "nextChapter") requestAdjacent("requestNextSection");
      else if (command === "previousChapter") requestAdjacent("requestPreviousSection");
      else if (command === "openLibrary") closeBook();
      else if (command === "openToc") dispatch({ type: "openDrawer", drawer: "toc" });
      else if (command === "openSettings") dispatch({ type: "openDrawer", drawer: "settings" });
      return;
    }
    const incoming = event.data;
    if (incoming.type === "libraryState" && Array.isArray(incoming.books)) {
      appMode = "readerApp";
      dispatch({ type: "libraryLoaded", books: incoming.books, availability: incoming.availability ?? {}, progress: incoming.progress ?? {} });
      if (incoming.preferences) dispatch({ type: "preferencesLoaded", preferences: incoming.preferences });
      return;
    }
    if (isLibraryLoadError(event.data)) {
      dispatch({ type: "showError", message: event.data.message });
      return;
    }
    if (appMode !== "readerApp" || !isExtensionToReaderV2Message(event.data)) return;
    const message = event.data;
    if (!state.requestId || message.requestId !== state.requestId || message.bookId !== state.activeBook?.id) return;
    if (message.type === "bookReady") {
      dispatch({ type: "bookReady", requestId: message.requestId, toc: message.toc, sections: message.sections, initialSectionId: message.initialSectionId, initialProgression: message.initialLocator.progression });
      post(envelope("requestSection", message.initialSectionId));
      return;
    }
    if (message.type === "sectionReady") {
      currentSectionHtml = message.section.sanitizedHtml;
      dispatch({ type: "selectSection", sectionId: message.sectionId });
      updateLayout();
      return;
    }
    if (message.type === "bookStart" || message.type === "bookEnd") {
      dispatch({ type: "bookBoundary", edge: message.type === "bookStart" ? "start" : "end" });
      return;
    }
    if (message.type === "readerError") dispatch({ type: "showError", message: message.message });
  });
  function isReaderCommand(value) {
    if (typeof value !== "object" || value === null || value.type !== "command") return false;
    return ["nextPage", "previousPage", "nextChapter", "previousChapter", "openLibrary", "openToc", "openSettings"].includes(String(value.command));
  }
  function isLibraryLoadError(value) {
    return typeof value === "object" && value !== null && value.type === "libraryLoadError" && typeof value.message === "string";
  }
  function isModeGitLog(value) {
    return isExtensionToGitLogMessage(value) && value.type === "modeGitLog";
  }
  function isModeLibrary(value) {
    return isRecord6(value) && value.type === "modeLibrary" && isModeGeneration2(value.modeGeneration) && (value.message === void 0 || typeof value.message === "string");
  }
  function isModeReaderRestore(value) {
    return isRecord6(value) && value.type === "modeReaderRestore" && isRecord6(value.book) && Array.isArray(value.books) && value.books.every(isRecord6) && isRecord6(value.availability) && isRecord6(value.progress) && isModeGeneration2(value.modeGeneration) && typeof value.book.id === "string" && typeof value.requestId === "string";
  }
  function isModeInvalidated(value) {
    return isRecord6(value) && value.type === "modeInvalidated" && isModeGeneration2(value.modeGeneration);
  }
  function isModeGeneration2(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  }
  function acceptModeGeneration(generation) {
    if (generation <= acceptedModeGeneration) return false;
    acceptedModeGeneration = generation;
    return true;
  }
  function isRecord6(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  render();
  post({ type: "appReady" });
})();
//# sourceMappingURL=readerApp.js.map
