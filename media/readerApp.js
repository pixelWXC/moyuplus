"use strict";
(() => {
  // src/webview/internalTargetResolver.ts
  var InternalTargetResolver = class {
    nodes = [];
    ranges = /* @__PURE__ */ new Map();
    segments = [];
    constructor(root) {
      this.index(root);
    }
    get totalLength() {
      return this.segments.at(-1)?.end ?? 0;
    }
    resolveFragment(fragment) {
      const target = this.nodes.find((node2) => node2.id === fragment);
      if (!target) return void 0;
      const range = this.ranges.get(target);
      if (!range) return void 0;
      const contained = this.segments[range.startSegment];
      if (contained && range.startSegment < range.endSegment) return contained.start;
      const following = this.segments.find((segment) => segment.order > range.order);
      if (following) return following.start;
      for (let index = this.segments.length - 1; index >= 0; index -= 1) {
        if (this.segments[index].order < range.order) return this.segments[index].end;
      }
      return void 0;
    }
    pointForOffset(offset) {
      if (this.segments.length === 0) return void 0;
      const clamped = Math.max(0, Math.min(this.totalLength, Number.isFinite(offset) ? Math.trunc(offset) : 0));
      const segment = this.segments.find((candidate) => clamped === candidate.start || clamped < candidate.end);
      if (segment) return { node: segment.node, offset: clamped - segment.start };
      const final = this.segments.at(-1);
      return { node: final.node, offset: final.end - final.start };
    }
    index(node2) {
      const order = this.nodes.length;
      this.nodes.push(node2);
      const startSegment = this.segments.length;
      if (node2.nodeType === 3 && typeof node2.data === "string" && node2.data.length > 0) {
        const start = this.totalLength;
        this.segments.push({ node: node2, start, end: start + node2.data.length, order });
      }
      for (const child of Array.from(node2.childNodes)) this.index(child);
      this.ranges.set(node2, { startSegment, endSegment: this.segments.length, order });
    }
  };

  // src/webview/layoutEngine.ts
  function fitsWithinSurface(surface) {
    return surface.scrollHeight <= surface.clientHeight + 1 && surface.scrollWidth <= surface.clientWidth + 1;
  }
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
    sourceText = "";
    pageIndex = 0;
    scheduledFrame;
    reflowPasses = 0;
    scheduleFromEnvironment = () => this.requestReflow();
    setContent(sectionId, sanitizedHtml, progression = 0) {
      this.loadSource(sectionId, sanitizedHtml);
      this.paginate(Math.max(0, Math.min(1, progression)) * this.totalLength);
    }
    setContentAtOffset(sectionId, sanitizedHtml, textOffset) {
      this.loadSource(sectionId, sanitizedHtml);
      this.paginate(Math.max(0, Math.min(this.totalLength, Number.isFinite(textOffset) ? Math.trunc(textOffset) : 0)));
    }
    getTextLength() {
      return this.totalLength;
    }
    attachTo(viewport, onReflow) {
      const staging = this.viewport;
      if (staging === viewport) {
        this.onReflow = onReflow;
        return;
      }
      viewport.replaceChildren(...Array.from(staging.childNodes));
      this.viewport = viewport;
      this.onReflow = onReflow;
      this.syncMeasureStyle();
      staging.remove();
    }
    loadSource(sectionId, sanitizedHtml) {
      this.sectionId = sectionId;
      this.source.innerHTML = sanitizedHtml;
      this.indexText();
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
    goToOffset(offset) {
      const clamped = Math.max(0, Math.min(this.totalLength, Number.isFinite(offset) ? Math.trunc(offset) : 0));
      let target = this.pages.findIndex((page) => clamped >= page.start && clamped < page.end);
      if (target < 0) target = this.pages.length - 1;
      if (target === this.pageIndex) return false;
      this.pageIndex = target;
      this.render();
      return true;
    }
    resolveFragmentOffset(fragment) {
      return new InternalTargetResolver(this.source).resolveFragment(fragment);
    }
    goToFragment(fragment) {
      const offset = this.resolveFragmentOffset(fragment);
      return offset === void 0 ? false : this.goToOffset(offset);
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
      this.sourceText = this.source.textContent ?? "";
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
      this.syncSurfaceIdentity(this.source);
      this.syncSurfaceIdentity(this.measure);
    }
    fits(start, end) {
      this.measure.replaceChildren(this.fragment(start, end));
      return fitsWithinSurface(this.measure);
    }
    render() {
      const page = this.pages[this.pageIndex];
      this.viewport.replaceChildren(this.fragment(page.start, page.end));
      if (!fitsWithinSurface(this.viewport) && page.end > page.start + 1) {
        const originalEnd = page.end;
        let low = page.start + 1;
        let high = page.end - 1;
        let best = page.start + 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          this.viewport.replaceChildren(this.fragment(page.start, middle));
          if (fitsWithinSurface(this.viewport)) {
            best = middle;
            low = middle + 1;
          } else high = middle - 1;
        }
        page.end = Math.max(page.start + 1, this.snapBoundary(page.start, best));
        const next = this.pages[this.pageIndex + 1];
        if (next) next.start = page.end;
        else if (page.end < originalEnd) this.pages.push({ start: page.end, end: originalEnd });
        this.viewport.replaceChildren(this.fragment(page.start, page.end));
      }
    }
    fragment(start, end) {
      const startPoint = this.point(start, false);
      const endPoint = this.point(end, true);
      const range = document.createRange();
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      let content = range.cloneContents();
      let ancestor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      while (ancestor && ancestor !== this.source) {
        const wrapper = ancestor.cloneNode(false);
        wrapper.append(content);
        content = wrapper;
        if (ancestor.classList.contains("moyuplus-book-content")) break;
        ancestor = ancestor.parentElement;
      }
      return content;
    }
    point(offset, atEnd) {
      let low = 0;
      let high = this.spans.length - 1;
      let match = high;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const span2 = this.spans[middle];
        if (offset < span2.end || atEnd && offset === span2.end) {
          match = middle;
          high = middle - 1;
        } else low = middle + 1;
      }
      const span = this.spans[match];
      return { node: span.node, offset: Math.max(0, Math.min(span.node.length, offset - span.start)) };
    }
    snapBoundary(start, candidate) {
      if (candidate >= this.totalLength) return this.totalLength;
      const floor = Math.max(start + 1, candidate - 80);
      for (let index = candidate; index >= floor; index -= 1) {
        if (/\s|[，。！？；、,.!?;]/u.test(this.sourceText[index - 1] ?? "")) return index;
      }
      return candidate;
    }
    syncSurfaceIdentity(surface) {
      surface.className = this.viewport.className;
      for (const key of Object.keys(surface.dataset)) delete surface.dataset[key];
      for (const [key, value] of Object.entries(this.viewport.dataset)) surface.dataset[key] = value;
      surface.style.cssText = this.viewport.style.cssText;
      const computed = getComputedStyle(this.viewport);
      for (const name of Array.from(computed)) {
        if (name.startsWith("--")) surface.style.setProperty(name, computed.getPropertyValue(name));
      }
      Object.assign(surface.style, {
        position: "fixed",
        left: "-100000px",
        top: "0",
        visibility: "hidden",
        overflow: "hidden",
        width: `${this.viewport.clientWidth}px`,
        height: `${this.viewport.clientHeight}px`
      });
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
      if (isNonNegativeFiniteNumber(value.textOffset)) {
        locator.textOffset = Math.trunc(value.textOffset);
      }
      if (isNonEmptyString(value.sourceRevision)) {
        locator.sourceRevision = value.sourceRevision;
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
  var READER_PROTOCOL_VERSION = 3;
  function isExtensionToReaderV2Message(value) {
    if (!hasEnvelope(value)) return false;
    if (value.type === "readerError") return isNonEmptyString2(value.code) && isNonEmptyString2(value.message);
    if (value.type === "bookReady") {
      return Array.isArray(value.toc) && value.toc.every(isTocNode) && Array.isArray(value.sections) && value.sections.every(isSectionRef) && isNonEmptyString2(value.initialSectionId) && normalizeReadingLocator(value.initialLocator)?.sectionId === value.initialSectionId && value.sections.some((section) => isRecord2(section) && section.id === value.initialSectionId);
    }
    if (!hasSectionEnvelope(value)) return false;
    if (value.type === "bookStart" || value.type === "bookEnd") return true;
    if (value.type === "targetUnavailable" || value.type === "imageOpenFailed") {
      return isSectionGeneration(value.sectionGeneration) && isNonEmptyString2(value.message);
    }
    return value.type === "sectionReady" && isSectionGeneration(value.sectionGeneration) && isSafeSection(value.section, value.sectionId);
  }
  function hasEnvelope(value) {
    return isRecord2(value) && value.version === READER_PROTOCOL_VERSION && isNonEmptyString2(value.requestId) && isNonEmptyString2(value.bookId);
  }
  function hasSectionEnvelope(value) {
    return isNonEmptyString2(value.sectionId);
  }
  function isSafeSection(value, sectionId) {
    if (!isRecord2(value) || value.sectionId !== sectionId || typeof value.sanitizedHtml !== "string" || !isNonEmptyString2(value.sourceRevision) || !Array.isArray(value.localResources)) return false;
    return value.localResources.every((resource) => isRecord2(resource) && hasOnlyKeys(resource, ["id", "mimeType", "label"]) && isOpaqueResourceId(resource.id) && isNonEmptyString2(resource.mimeType) && isNonEmptyString2(resource.label));
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
  function isSectionGeneration(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  }
  function isOpaqueResourceId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  }
  function hasOnlyKeys(value, keys) {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
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
      return hasOnlyKeys2(value, ["type", "sessionId", "modeGeneration"]) && (value.sessionId === void 0 || isNonEmptyString4(value.sessionId)) && isModeGeneration(value.modeGeneration);
    }
    if (!isNonEmptyString4(value.sessionId)) return false;
    if (value.type === "gitLogReady") {
      return hasOnlyKeys2(value, ["type", "sessionId", "repositoryName", "branchName", "detached", "commits"]) && hasDisplayFields(value);
    }
    if (value.type === "gitLogError" || value.type === "gitLogRefreshFailed") {
      return hasOnlyKeys2(value, ["type", "sessionId", "code", "message"]) && isNonEmptyString4(value.code) && isNonEmptyString4(value.message);
    }
    if (value.type === "gitLogInvalidated") {
      return hasOnlyKeys2(value, ["type", "sessionId"]);
    }
    return value.type === "modeGitLog" && hasOnlyKeys2(value, ["type", "sessionId", "modeGeneration", "preferences", "readerPreferences", "cached"]) && isModeGeneration(value.modeGeneration) && isStrictPreferences(value.preferences) && isRecord4(value.readerPreferences) && (value.cached === void 0 || isStrictDisplayResult(value.cached));
  }
  function isStrictDisplayResult(value) {
    return isRecord4(value) && hasOnlyKeys2(value, ["repositoryName", "branchName", "detached", "commits"]) && hasDisplayFields(value);
  }
  function hasDisplayFields(value) {
    return isNonEmptyString4(value.repositoryName) && isNonEmptyString4(value.branchName) && typeof value.detached === "boolean" && Array.isArray(value.commits) && value.commits.every(isStrictCommit);
  }
  function isStrictCommit(value) {
    return isRecord4(value) && hasOnlyKeys2(value, ["hash", "subject", "author", "authoredAt"]) && normalizeGitLogCommit(value) !== void 0;
  }
  function isStrictPreferences(value) {
    return isRecord4(value) && hasOnlyKeys2(value, ["showHash", "showAuthor", "showRelativeTime", "showAbsoluteDate", "layout", "maxCommits"]) && typeof value.showHash === "boolean" && typeof value.showAuthor === "boolean" && typeof value.showRelativeTime === "boolean" && typeof value.showAbsoluteDate === "boolean" && (value.layout === "lines" || value.layout === "inline") && typeof value.maxCommits === "number" && Number.isInteger(value.maxCommits) && value.maxCommits >= 20 && value.maxCommits <= 1e3;
  }
  function isModeGeneration(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  }
  function hasOnlyKeys2(value, allowed) {
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
      preferences
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
          preferences: state2.preferences
        } : { ...createInitialGitLogState(), sessionId: action.sessionId, status: "loading", preferences: state2.preferences };
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
        return state2.sessionId === action.sessionId ? { ...createInitialGitLogState(), sessionId: void 0, preferences: state2.preferences } : state2;
      case "preferencesLoaded": {
        const preferences = normalizeGitLogPreferences(action.preferences);
        return { ...state2, preferences, pageIndex: 0 };
      }
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
    if (preferences.textColor === "theme") target.style.removeProperty("color");
    else target.style.color = preferences.textColor;
    if (preferences.backgroundColor === "theme") target.style.removeProperty("background-color");
    else target.style.backgroundColor = preferences.backgroundColor;
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
    updatePreferences(preferences) {
      this.reduce({ type: "preferencesLoaded", preferences });
    }
    updateReaderPreferences(preferences) {
      this.readerPreferences = preferences;
      this.render();
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
      tools.append(iconButton("Aa", "Git Log \u8BBE\u7F6E", () => this.post({ type: "openUnifiedSettings", section: "gitLog" })));
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
      const content = node("div", `git-log-document git-layout-${this.state.preferences.layout}`);
      for (const commit of this.state.commits) content.append(this.commitEntry(commit));
      return content;
    }
    commitEntry(commit) {
      const entry = node("article", "git-commit");
      const values = [commit.subject, ...this.optionalValues(commit)];
      if (this.state.preferences.layout === "inline") {
        entry.append(node("span", "git-commit-line", values.join(" \xB7 ")));
      } else {
        for (const value of values) entry.append(node("span", "git-commit-line", value));
      }
      return entry;
    }
    optionalValues(commit) {
      const preferences = this.state.preferences;
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

  // src/webview/readerNavigationHistory.ts
  var ReaderNavigationHistory = class {
    constructor(capacity = 50) {
      this.capacity = capacity;
    }
    capacity;
    entries = [];
    get size() {
      return this.entries.length;
    }
    get canUndo() {
      return this.entries.length > 0;
    }
    push(location) {
      const copy = { ...location };
      const latest = this.entries.at(-1);
      if (latest && sameLocation(latest, copy)) return;
      this.entries.push(copy);
      if (this.entries.length > this.capacity) {
        this.entries.splice(0, this.entries.length - this.capacity);
      }
    }
    pop() {
      const location = this.entries.pop();
      return location ? { ...location } : void 0;
    }
    clear() {
      this.entries.length = 0;
    }
  };
  function sameLocation(left, right) {
    return left.sectionId === right.sectionId && left.textOffset === right.textOffset && left.progression === right.progression && left.fragment === right.fragment && left.sourceRevision === right.sourceRevision;
  }

  // src/webview/readerNavigator.ts
  var ReaderNavigator = class {
    history;
    constructor(capacity = 50) {
      this.history = new ReaderNavigationHistory(capacity);
    }
    get canUndo() {
      return this.history.canUndo;
    }
    get historySize() {
      return this.history.size;
    }
    commit(before, after) {
      if (sameVisibleLocation(before, after)) return false;
      this.history.push(before);
      return true;
    }
    async undo(restore) {
      let target = this.history.pop();
      while (target) {
        if (await restore(target)) return true;
        target = this.history.pop();
      }
      return false;
    }
    clear() {
      this.history.clear();
    }
  };
  function sameVisibleLocation(left, right) {
    return left.sectionId === right.sectionId && left.textOffset === right.textOffset && left.sourceRevision === right.sourceRevision;
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
      textColor: "theme",
      backgroundColor: "theme",
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
      textColor: normalizeReaderColor(value.textColor) ?? defaults.textColor,
      backgroundColor: normalizeReaderColor(value.backgroundColor) ?? defaults.backgroundColor,
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
  function normalizeReaderColor(value) {
    if (value === "theme") {
      return value;
    }
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
    return { view: "library", status: "loading", books: [], preferences };
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
      case "showNotice":
        return { ...state2, notice: action.message };
      case "clearNotice":
        return { ...state2, notice: void 0 };
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
        return { ...state2, status: "ready", activeSectionId: action.sectionId, layout: action, navigation: {
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
        return { ...state2, preferences };
      }
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
  var navigator = new ReaderNavigator();
  var currentSectionGeneration = 0;
  var currentSourceRevision = "";
  var currentResourceIds = /* @__PURE__ */ new Set();
  var pendingNavigation;
  var initialEpubRestore;
  function dispatch(action) {
    state = readerAppReducer(state, action);
    if (action.type === "openDrawer" || action.type === "closeDrawer") {
      syncReaderDrawer();
      return;
    }
    render();
  }
  function post(message) {
    vscode?.postMessage(message);
  }
  function envelope(type, sectionId) {
    return { version: READER_PROTOCOL_VERSION, type, requestId: state.requestId, bookId: state.activeBook?.id, ...sectionId ? { sectionId } : {} };
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
    const undo = iconButton2("\u21B6", "\u64A4\u56DE\u9605\u8BFB\u4F4D\u7F6E", () => {
      void undoLocation();
    }, !navigator.canUndo);
    undo.id = "undo-location";
    tools.append(undo, iconButton2("\u2630", "\u76EE\u5F55", () => dispatch({ type: "openDrawer", drawer: "toc" })), iconButton2("Aa", "\u9605\u8BFB\u8BBE\u7F6E", () => post({ type: "openUnifiedSettings", section: "reader" })));
    toolbar.append(tools);
    root.append(toolbar);
    const chapter = element("nav", "chapter-bar");
    chapter.setAttribute("aria-label", "\u7AE0\u8282\u5BFC\u822A");
    const previousChapter = iconButton2("\u2039", "\u4E0A\u4E00\u7AE0", () => requestAdjacent("requestPreviousSection"), !state.navigation?.canPreviousSection);
    previousChapter.id = "previous-chapter";
    const chapterTitle = element("span", "chapter-title", currentSectionTitle());
    chapterTitle.id = "chapter-title";
    const nextChapter = iconButton2("\u203A", "\u4E0B\u4E00\u7AE0", () => requestAdjacent("requestNextSection"), !state.navigation?.canNextSection);
    nextChapter.id = "next-chapter";
    chapter.append(previousChapter, chapterTitle, nextChapter);
    root.append(chapter);
    const viewport = element("main", "reader-viewport");
    viewport.setAttribute("tabindex", "0");
    const page = element("div", "reader-content reader-page");
    page.id = "reader-content";
    viewport.append(page);
    root.append(viewport);
    const footer = element("footer", "reader-footer");
    const previous = button2("\u4E0A\u4E00\u9875", "page-action", previousPage, !state.navigation?.canPreviousPage);
    previous.id = "previous-page";
    const progress = element("span", "page-progress", formatReadingProgress());
    progress.id = "page-progress";
    const next = button2("\u4E0B\u4E00\u9875", "page-action", nextPage, !state.navigation?.canNextPage);
    next.id = "next-page";
    footer.append(previous, progress, next);
    root.append(footer);
    applyReaderPreferences(page, state.preferences);
    page.addEventListener("click", handleReaderContentClick);
    const priorLayout = state.layout;
    let priorProgression = 0;
    if (priorLayout && priorLayout.sectionId === state.activeSectionId) priorProgression = priorLayout.progression;
    layout?.dispose();
    layout = new LayoutEngine(page, (current) => commitLayout(current));
    if (currentSectionHtml && state.activeSectionId) {
      layout.setContent(state.activeSectionId, currentSectionHtml, priorLayout ? priorProgression : state.initialProgression ?? 0);
      state = readerAppReducer(state, { type: "layoutChanged", ...layout.getState() });
    } else if (state.status === "loading") page.append(element("p", "notice", "\u6B63\u5728\u8F7D\u5165\u7AE0\u8282\u2026"));
    if (state.status === "error") page.append(element("p", "notice notice-error", state.error ?? "\u7AE0\u8282\u8F7D\u5165\u5931\u8D25\u3002"));
    syncReaderNotice();
    syncReaderDrawer();
    postNavigationState();
  }
  function syncReaderDrawer() {
    if (!app || appMode !== "readerApp" || state.view !== "reader") return;
    app.querySelector(":scope > .reader-drawer")?.remove();
    if (state.drawer === "toc") app.append(renderTocDrawer());
  }
  function syncReaderSectionUi() {
    const title = document.querySelector("#chapter-title");
    if (title) title.textContent = currentSectionTitle();
    const previousChapter = document.querySelector("#previous-chapter");
    if (previousChapter) previousChapter.disabled = !state.navigation?.canPreviousSection;
    const nextChapter = document.querySelector("#next-chapter");
    if (nextChapter) nextChapter.disabled = !state.navigation?.canNextSection;
    syncReaderNotice();
    syncReaderDrawer();
  }
  function syncReaderNotice() {
    if (!app || appMode !== "readerApp" || state.view !== "reader") return;
    app.querySelector(":scope > .reader-toast")?.remove();
    if (!state.notice) return;
    const notice = element("div", "reader-toast", state.notice);
    notice.setAttribute("role", "status");
    app.append(notice);
  }
  function showReaderNotice(message) {
    state = readerAppReducer(state, { type: "showNotice", message });
    syncReaderNotice();
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
      const target = button2(node2.title, node2.sectionId === state.activeSectionId ? "toc-link is-current" : "toc-link", () => navigateToTarget(node2.sectionId, node2.fragment));
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
  function drawerShell(title) {
    const drawer = element("aside", "reader-drawer");
    drawer.setAttribute("aria-label", title);
    const header = element("header", "drawer-header");
    header.append(element("h2", void 0, title), iconButton2("\xD7", `\u5173\u95ED${title}`, () => dispatch({ type: "closeDrawer" })));
    drawer.append(header);
    return drawer;
  }
  function openBook(book) {
    navigator.clear();
    resetSectionContext();
    const requestId = `webview-${Date.now()}-${++requestSequence}`;
    dispatch({ type: "openReader", book, requestId });
    post({ version: READER_PROTOCOL_VERSION, type: "openBook", requestId, bookId: book.id });
  }
  function requestAdjacent(type) {
    const id = state.activeSectionId;
    const before = currentLocation();
    if (!id || !before || pendingNavigation) return;
    pendingNavigation = { kind: "move", before, edge: type === "requestPreviousSection" ? "end" : "start" };
    post(envelope(type, id));
  }
  function nextPage() {
    const before = currentLocation();
    if (before && layout?.nextPage()) {
      updateLayout();
      commitMovement(before);
    } else if (state.navigation?.canNextSection) requestAdjacent("requestNextSection");
    else dispatch({ type: "bookBoundary", edge: "end" });
  }
  function previousPage() {
    const before = currentLocation();
    if (before && layout?.previousPage()) {
      updateLayout();
      commitMovement(before);
    } else if (state.navigation?.canPreviousSection) requestAdjacent("requestPreviousSection");
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
    syncUndoButton();
    postNavigationState();
    post({ ...envelope("layoutStable", current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
  }
  function closeBook() {
    if (layout) {
      const current = layout.getState();
      post({ ...envelope("closeBook", current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
    }
    navigator.clear();
    resetSectionContext();
    dispatch({ type: "closeReader" });
  }
  function locatorFor(current) {
    return state.activeBook?.format === "txt" ? { kind: "txt", sectionId: current.sectionId, progression: current.progression, offset: current.startOffset } : { kind: "epub", sectionId: current.sectionId, progression: current.progression, textOffset: current.startOffset, sourceRevision: currentSourceRevision };
  }
  function wholeBookProgress(current) {
    const sections = state.sections ?? [];
    const total = sections.reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0);
    const index = sections.findIndex((section) => section.id === current.sectionId);
    if (total <= 0 || index < 0) return 0;
    const before = sections.slice(0, index).reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0);
    return (before + current.progression * Math.max(1, sections[index].progressionWeight)) / total;
  }
  function currentLocation() {
    const current = layout?.getState();
    if (!current || !currentSourceRevision) return void 0;
    return { sectionId: current.sectionId, textOffset: current.startOffset, progression: current.progression, sourceRevision: currentSourceRevision };
  }
  function commitMovement(before) {
    const after = currentLocation();
    if (after) navigator.commit(before, after);
    state = readerAppReducer(state, { type: "clearNotice" });
    document.querySelector(".reader-toast")?.remove();
    syncUndoButton();
    postNavigationState();
  }
  function navigateToTarget(sectionId, fragment) {
    const before = currentLocation();
    if (!before || pendingNavigation) return;
    if (sectionId === before.sectionId) {
      const offset = fragment ? layout?.resolveFragmentOffset(fragment) : 0;
      if (offset === void 0) {
        dispatch({ type: "showNotice", message: "\u76EE\u6807\u4F4D\u7F6E\u4E0D\u53EF\u7528" });
        return;
      }
      if (layout?.goToOffset(offset)) {
        updateLayout();
        commitMovement(before);
      }
      return;
    }
    pendingNavigation = { kind: "move", before, expectedSectionId: sectionId, fragment, edge: "start" };
    post({ ...envelope("requestSectionTarget", sectionId), ...fragment ? { fragment } : {} });
  }
  async function undoLocation() {
    if (pendingNavigation) return false;
    const restored = await navigator.undo((target) => restoreHistoryLocation(target));
    if (!restored) dispatch({ type: "showNotice", message: "\u76EE\u6807\u4F4D\u7F6E\u4E0D\u53EF\u7528" });
    syncUndoButton();
    postNavigationState();
    return restored;
  }
  function restoreHistoryLocation(target) {
    if (!layout) return false;
    if (target.sectionId === state.activeSectionId) {
      const offset = target.sourceRevision === currentSourceRevision ? target.textOffset : target.progression * layout.getTextLength();
      if (!layout.goToOffset(offset)) return true;
      state = readerAppReducer(state, { type: "clearNotice" });
      document.querySelector(".reader-toast")?.remove();
      updateLayout();
      return true;
    }
    return new Promise((resolve) => {
      pendingNavigation = { kind: "undo", target, expectedSectionId: target.sectionId, resolve };
      post(envelope("requestSectionTarget", target.sectionId));
    });
  }
  function handleReaderContentClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-moyuplus-resource-id],[data-moyuplus-section-id]") : null;
    if (!target) return;
    event.preventDefault();
    const resourceId = target.dataset.moyuplusResourceId;
    if (resourceId) {
      if (!currentResourceIds.has(resourceId) || currentSectionGeneration <= 0 || !state.activeSectionId) return;
      post({ ...envelope("openImage", state.activeSectionId), sectionGeneration: currentSectionGeneration, resourceId });
      return;
    }
    const sectionId = target.dataset.moyuplusSectionId;
    if (sectionId) navigateToTarget(sectionId, target.dataset.moyuplusFragment);
  }
  function resolveTargetOffset(html, fragment) {
    const source = document.createElement("div");
    source.innerHTML = html;
    const resolver = new InternalTargetResolver(source);
    return { totalLength: resolver.totalLength, offset: fragment ? resolver.resolveFragment(fragment) : 0 };
  }
  function prepareSectionLayout(sectionId, html, textOffset) {
    const visible = document.querySelector("#reader-content");
    if (!visible || !app || visible.clientWidth <= 0 || visible.clientHeight <= 0) return void 0;
    const staging = document.createElement("div");
    staging.className = visible.className;
    for (const [key, value] of Object.entries(visible.dataset)) staging.dataset[key] = value;
    staging.style.cssText = visible.style.cssText;
    Object.assign(staging.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      visibility: "hidden",
      width: `${visible.clientWidth}px`,
      height: `${visible.clientHeight}px`
    });
    app.append(staging);
    const candidate = new LayoutEngine(staging);
    try {
      candidate.setContentAtOffset(sectionId, html, textOffset);
      if (!fitsWithinSurface(staging)) throw new Error("Candidate layout overflowed its staging surface.");
      return candidate;
    } catch {
      candidate.dispose();
      staging.remove();
      return void 0;
    }
  }
  function postNavigationState() {
    if (!state.requestId || !state.activeBook || !state.activeSectionId || currentSectionGeneration <= 0) return;
    post({
      ...envelope("navigationState", state.activeSectionId),
      sectionGeneration: currentSectionGeneration,
      canPreviousPage: Boolean(state.navigation?.canPreviousPage),
      canNextPage: Boolean(state.navigation?.canNextPage),
      canUndoLocation: navigator.canUndo
    });
  }
  function syncUndoButton() {
    const undo = document.querySelector("#undo-location");
    if (undo) undo.disabled = !navigator.canUndo;
  }
  function resetSectionContext() {
    pendingNavigation?.resolve?.(false);
    pendingNavigation = void 0;
    initialEpubRestore = void 0;
    currentSectionHtml = "";
    currentSectionGeneration = 0;
    currentSourceRevision = "";
    currentResourceIds = /* @__PURE__ */ new Set();
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
      navigator.clear();
      resetSectionContext();
      layout?.dispose();
      layout = void 0;
      gitLogView?.dispose();
      appMode = "gitLog";
      gitLogView = new GitLogView(app, post);
      gitLogView.begin(event.data.sessionId, event.data.preferences, event.data.readerPreferences, event.data.cached);
      return;
    }
    if (isModeLibrary(event.data)) {
      if (!acceptModeGeneration(event.data.modeGeneration)) return;
      gitLogView?.dispose();
      gitLogView = void 0;
      navigator.clear();
      resetSectionContext();
      appMode = "readerApp";
      if (event.data.message) dispatch({ type: "showError", message: event.data.message });
      else render();
      return;
    }
    if (isModeReaderRestore(event.data)) {
      if (!acceptModeGeneration(event.data.modeGeneration)) return;
      gitLogView?.dispose();
      gitLogView = void 0;
      navigator.clear();
      resetSectionContext();
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
      navigator.clear();
      resetSectionContext();
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
      else if (command === "undoLocation") void undoLocation();
      else if (command === "nextChapter") requestAdjacent("requestNextSection");
      else if (command === "previousChapter") requestAdjacent("requestPreviousSection");
      else if (command === "openLibrary") closeBook();
      else if (command === "openToc") dispatch({ type: "openDrawer", drawer: "toc" });
      else if (command === "openSettings") post({ type: "openUnifiedSettings", section: "reader" });
      return;
    }
    if (isRecord6(event.data) && event.data.type === "readerPreferencesUpdated" && isRecord6(event.data.preferences)) {
      if (appMode === "gitLog") gitLogView?.updateReaderPreferences(event.data.preferences);
      else dispatch({ type: "preferencesLoaded", preferences: event.data.preferences });
      return;
    }
    if (isRecord6(event.data) && event.data.type === "gitLogPreferencesUpdated" && isRecord6(event.data.preferences)) {
      if (appMode === "gitLog") gitLogView?.updatePreferences(event.data.preferences);
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
      initialEpubRestore = message.initialLocator.kind === "epub" && message.initialLocator.textOffset !== void 0 && message.initialLocator.sourceRevision ? { textOffset: message.initialLocator.textOffset, sourceRevision: message.initialLocator.sourceRevision } : void 0;
      dispatch({ type: "bookReady", requestId: message.requestId, toc: message.toc, sections: message.sections, initialSectionId: message.initialSectionId, initialProgression: message.initialLocator.progression });
      post(envelope("requestSection", message.initialSectionId));
      return;
    }
    if (message.type === "sectionReady") {
      if (message.sectionGeneration <= currentSectionGeneration) return;
      const pending = pendingNavigation;
      if (pending?.expectedSectionId && pending.expectedSectionId !== message.sectionId) return;
      const target = resolveTargetOffset(message.section.sanitizedHtml, pending?.fragment);
      if (pending?.fragment && target.offset === void 0) {
        pendingNavigation = void 0;
        pending?.resolve?.(false);
        showReaderNotice("\u76EE\u6807\u4F4D\u7F6E\u4E0D\u53EF\u7528");
        return;
      }
      let targetOffset;
      if (pending?.kind === "undo" && pending.target) {
        targetOffset = pending.target.sourceRevision === message.section.sourceRevision ? pending.target.textOffset : pending.target.progression * target.totalLength;
      } else if (pending?.edge === "end") targetOffset = target.totalLength;
      else if (pending) targetOffset = target.offset ?? 0;
      else if (initialEpubRestore?.sourceRevision === message.section.sourceRevision) targetOffset = initialEpubRestore.textOffset;
      else targetOffset = (state.initialProgression ?? 0) * target.totalLength;
      const candidate = prepareSectionLayout(message.sectionId, message.section.sanitizedHtml, targetOffset ?? 0);
      if (!candidate) {
        pendingNavigation = void 0;
        pending?.resolve?.(false);
        if (pending) showReaderNotice("\u76EE\u6807\u4F4D\u7F6E\u4E0D\u53EF\u7528");
        else dispatch({ type: "showError", message: "\u7AE0\u8282\u8F7D\u5165\u5931\u8D25\u3002" });
        return;
      }
      const visible = document.querySelector("#reader-content");
      if (!visible) {
        candidate.dispose();
        pendingNavigation = void 0;
        pending?.resolve?.(false);
        if (pending) showReaderNotice("\u76EE\u6807\u4F4D\u7F6E\u4E0D\u53EF\u7528");
        else dispatch({ type: "showError", message: "\u7AE0\u8282\u8F7D\u5165\u5931\u8D25\u3002" });
        return;
      }
      const previousLayout = layout;
      initialEpubRestore = void 0;
      currentSectionHtml = message.section.sanitizedHtml;
      currentSectionGeneration = message.sectionGeneration;
      currentSourceRevision = message.section.sourceRevision;
      currentResourceIds = new Set(message.section.localResources.map((resource) => resource.id));
      pendingNavigation = void 0;
      state = readerAppReducer(state, { type: "selectSection", sectionId: message.sectionId });
      candidate.attachTo(visible, (current) => commitLayout(current));
      layout = candidate;
      previousLayout?.dispose();
      syncReaderSectionUi();
      commitLayout(candidate.getState());
      if (pending?.kind === "move" && pending.before) commitMovement(pending.before);
      pending?.resolve?.(true);
      return;
    }
    if (message.type === "bookStart" || message.type === "bookEnd") {
      const pending = pendingNavigation;
      pendingNavigation = void 0;
      pending?.resolve?.(false);
      dispatch({ type: "bookBoundary", edge: message.type === "bookStart" ? "start" : "end" });
      return;
    }
    if (message.type === "targetUnavailable") {
      const pending = pendingNavigation;
      pendingNavigation = void 0;
      pending?.resolve?.(false);
      showReaderNotice("\u76EE\u6807\u4F4D\u7F6E\u4E0D\u53EF\u7528");
      return;
    }
    if (message.type === "imageOpenFailed") {
      if (message.sectionGeneration === currentSectionGeneration) dispatch({ type: "showNotice", message: message.message });
      return;
    }
    if (message.type === "readerError") {
      const pending = pendingNavigation;
      pendingNavigation = void 0;
      pending?.resolve?.(false);
      dispatch({ type: "showError", message: message.message });
    }
  });
  function isReaderCommand(value) {
    if (typeof value !== "object" || value === null || value.type !== "command") return false;
    return ["nextPage", "previousPage", "undoLocation", "nextChapter", "previousChapter", "openLibrary", "openToc", "openSettings"].includes(String(value.command));
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
