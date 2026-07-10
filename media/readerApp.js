"use strict";
(() => {
  // src/webview/layoutEngine.ts
  var LayoutEngine = class {
    constructor(viewport) {
      this.viewport = viewport;
      this.source = document.createElement("div");
      this.measure = document.createElement("div");
      Object.assign(this.source.style, { position: "fixed", left: "-100000px", top: "0", visibility: "hidden" });
      Object.assign(this.measure.style, { position: "fixed", left: "-100000px", top: "0", visibility: "hidden", overflow: "hidden" });
      document.body.append(this.source, this.measure);
      window.addEventListener("resize", this.scheduleFromEnvironment);
      document.fonts?.addEventListener("loadingdone", this.scheduleFromEnvironment);
    }
    viewport;
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
      let node = walker.nextNode();
      while (node) {
        const text = node;
        const start = this.totalLength;
        this.totalLength += text.data.length;
        this.spans.push({ node: text, start, end: this.totalLength });
        node = walker.nextNode();
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

  // src/reader/readerMessages.ts
  var READER_PROTOCOL_VERSION = 2;
  function isExtensionToReaderV2Message(value) {
    if (!hasEnvelope(value)) return false;
    if (value.type === "readerError") return isNonEmptyString(value.code) && isNonEmptyString(value.message);
    if (value.type === "bookReady") {
      return Array.isArray(value.toc) && value.toc.every(isTocNode) && Array.isArray(value.sections) && value.sections.every(isSectionRef) && isNonEmptyString(value.initialSectionId) && value.sections.some((section) => isRecord(section) && section.id === value.initialSectionId);
    }
    if (!hasSectionEnvelope(value)) return false;
    if (value.type === "bookStart" || value.type === "bookEnd") return true;
    return value.type === "sectionReady" && isSafeSection(value.section, value.sectionId);
  }
  function hasEnvelope(value) {
    return isRecord(value) && value.version === READER_PROTOCOL_VERSION && isNonEmptyString(value.requestId) && isNonEmptyString(value.bookId);
  }
  function hasSectionEnvelope(value) {
    return isNonEmptyString(value.sectionId);
  }
  function isSafeSection(value, sectionId) {
    if (!isRecord(value) || value.sectionId !== sectionId || typeof value.sanitizedHtml !== "string" || !isNonEmptyString(value.sourceRevision) || !Array.isArray(value.localResources)) return false;
    return value.localResources.every((resource) => isRecord(resource) && isNonEmptyString(resource.id) && isNonEmptyString(resource.path) && isNonEmptyString(resource.mimeType));
  }
  function isTocNode(value) {
    if (!isRecord(value) || !isNonEmptyString(value.title) || !isNonEmptyString(value.sectionId)) return false;
    if (value.fragment !== void 0 && !isNonEmptyString(value.fragment)) return false;
    return value.children === void 0 || Array.isArray(value.children) && value.children.every(isTocNode);
  }
  function isSectionRef(value) {
    return isRecord(value) && isNonEmptyString(value.id) && (value.title === void 0 || isNonEmptyString(value.title)) && Number.isInteger(value.order) && value.order >= 0 && typeof value.progressionWeight === "number" && Number.isFinite(value.progressionWeight) && value.progressionWeight >= 0;
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
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
    if (!isRecord2(value)) {
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
  function isRecord2(value) {
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
          ...books.length === 0 ? { emptyAction: "importBook" } : {}
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
          pendingRemoval: void 0,
          ...state2.books.length === 1 ? { emptyAction: "importBook" } : {}
        };
      case "showError":
        return { ...state2, status: "error", error: action.message };
      case "openReader":
        return { ...state2, view: "reader", status: "loading", activeBook: action.book, requestId: action.requestId, notice: void 0 };
      case "closeReader":
        return { ...state2, view: "library", status: "ready", activeBook: void 0, requestId: void 0, toc: void 0, sections: void 0, activeSectionId: void 0, layout: void 0, navigation: void 0, drawer: void 0, notice: void 0 };
      case "bookReady":
        if (state2.requestId !== action.requestId) return state2;
        return { ...state2, toc: action.toc, sections: action.sections, activeSectionId: action.initialSectionId, status: "loading", navigation: navigationFor(action.sections, action.initialSectionId) };
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
    header.append(heading, button("\u5BFC\u5165", "primary-action", () => post({ type: "importBook" })));
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
        element("span", "empty-mark", "\u6587"),
        element("h2", void 0, "\u628A\u4E0B\u4E00\u672C\u4E66\u653E\u5728\u624B\u8FB9"),
        element("p", void 0, "\u5BFC\u5165\u672C\u5730 EPUB \u6216 TXT\u3002\u6587\u4EF6\u7559\u5728\u539F\u5904\uFF0CMoyuPlus \u53EA\u4FDD\u5B58\u7D22\u5F15\u3002"),
        button("\u5BFC\u5165 EPUB / TXT", "primary-action", () => post({ type: "importBook" }))
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
    toolbar.append(iconButton("\u2190", "\u8FD4\u56DE\u4E66\u67B6", () => dispatch({ type: "closeReader" })), element("strong", "reader-title", state.activeBook?.title ?? "\u9605\u8BFB"));
    const tools = element("div", "reader-tools");
    tools.append(iconButton("\u2630", "\u76EE\u5F55", () => dispatch({ type: "openDrawer", drawer: "toc" })), iconButton("Aa", "\u9605\u8BFB\u8BBE\u7F6E", () => dispatch({ type: "openDrawer", drawer: "settings" })));
    toolbar.append(tools);
    root.append(toolbar);
    const chapter = element("nav", "chapter-bar");
    chapter.setAttribute("aria-label", "\u7AE0\u8282\u5BFC\u822A");
    chapter.append(
      iconButton("\u2039", "\u4E0A\u4E00\u7AE0", () => requestAdjacent("requestPreviousSection"), !state.navigation?.canPreviousSection),
      element("span", "chapter-title", currentSectionTitle()),
      iconButton("\u203A", "\u4E0B\u4E00\u7AE0", () => requestAdjacent("requestNextSection"), !state.navigation?.canNextSection)
    );
    root.append(chapter);
    const viewport = element("main", "reader-content");
    viewport.id = "reader-content";
    viewport.setAttribute("tabindex", "0");
    root.append(viewport);
    applyPreferences(viewport, state.preferencesDraft);
    const priorLayout = state.layout;
    let priorProgression = 0;
    if (priorLayout && priorLayout.sectionId === state.activeSectionId) priorProgression = priorLayout.progression;
    layout?.dispose();
    layout = new LayoutEngine(viewport);
    if (currentSectionHtml && state.activeSectionId) {
      layout.setContent(state.activeSectionId, currentSectionHtml, priorProgression);
      state = readerAppReducer(state, { type: "layoutChanged", ...layout.getState() });
    } else if (state.status === "loading") viewport.append(element("p", "notice", "\u6B63\u5728\u8F7D\u5165\u7AE0\u8282\u2026"));
    if (state.status === "error") viewport.append(element("p", "notice notice-error", state.error ?? "\u7AE0\u8282\u8F7D\u5165\u5931\u8D25\u3002"));
    const footer = element("footer", "reader-footer");
    footer.append(
      button("\u4E0A\u4E00\u9875", "page-action", previousPage, !state.navigation?.canPreviousPage),
      element("span", "page-progress", formatReadingProgress()),
      button("\u4E0B\u4E00\u9875", "page-action", nextPage, !state.navigation?.canNextPage)
    );
    root.append(footer);
    if (state.notice) {
      const notice = element("div", "reader-toast", state.notice);
      notice.setAttribute("role", "status");
      root.append(notice);
    }
    if (state.drawer === "toc") root.append(renderTocDrawer());
    if (state.drawer === "settings") root.append(renderSettingsDrawer());
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
    nodes.forEach((node) => {
      const item = element("li", "toc-item");
      const target = button(node.title, node.sectionId === state.activeSectionId ? "toc-link is-current" : "toc-link", () => selectSection(node.sectionId));
      target.style.setProperty("--toc-depth", String(depth));
      item.append(target);
      if (node.children?.length) {
        const nested = element("ol", "toc-list");
        appendTocNodes(nested, node.children, depth + 1);
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
      button("\u6062\u590D\u9ED8\u8BA4", "subtle-button", () => {
        dispatch({ type: "resetPreferences" });
        layout?.requestReflow();
      }),
      button("\u4FDD\u5B58", "primary-action", () => {
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
    header.append(element("h2", void 0, title), iconButton("\xD7", `\u5173\u95ED${title}`, () => {
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
    if (!layout) return;
    const current = layout.getState();
    dispatch({ type: "layoutChanged", ...current });
    post({ ...envelope("layoutStable", current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
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
  function applyPreferences(target, preferences) {
    target.dataset.theme = preferences.theme;
    Object.assign(target.style, { fontFamily: preferences.fontFamily === "serif" ? "Georgia, serif" : preferences.fontFamily === "sans-serif" ? "Segoe UI, sans-serif" : "var(--vscode-font-family)", fontSize: `${preferences.fontSize}px`, lineHeight: String(preferences.lineHeight), letterSpacing: `${preferences.letterSpacing}em`, padding: `${preferences.pagePadding}px`, textAlign: preferences.textAlign });
    target.style.setProperty("--paragraph-spacing", `${preferences.paragraphSpacing}em`);
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
    const open = button("", "book-open", () => openBook(book), !book.available);
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
    getLibraryBookActions(book).filter((action) => action !== "open").forEach((action) => actions.append(button(labels[action], action === "remove" ? "danger-action" : "subtle-action", () => action === "remove" ? dispatch({ type: "requestRemove", bookId: book.id }) : post({ type: action, bookId: book.id }))));
    return actions;
  }
  function renderRemovalConfirmation(bookId, message) {
    const book = state.books.find((item) => item.id === bookId);
    const section = element("section", "removal-confirmation");
    section.setAttribute("role", "alertdialog");
    section.append(element("strong", void 0, `\u79FB\u9664\u300A${book?.title ?? "\u8FD9\u672C\u4E66"}\u300B\uFF1F`), element("p", void 0, message));
    const actions = element("div", "confirmation-actions");
    actions.append(button("\u53D6\u6D88", "subtle-action", () => dispatch({ type: "cancelRemove" })), button("\u4ECE\u4E66\u67B6\u79FB\u9664", "danger-button", () => post({ type: "removeBook", bookId })));
    section.append(actions);
    return section;
  }
  function formatProgress(progress) {
    return progress <= 0 ? "\u672A\u5F00\u59CB" : `\u5DF2\u8BFB ${Math.round(progress * 100)}%`;
  }
  function iconButton(label, ariaLabel, handler, disabled = false) {
    const target = button(label, "icon-button", handler, disabled);
    target.setAttribute("aria-label", ariaLabel);
    target.title = ariaLabel;
    return target;
  }
  function button(label, className, handler, disabled = false) {
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
    const incoming = event.data;
    if (incoming.type === "libraryState" && Array.isArray(incoming.books)) {
      dispatch({ type: "libraryLoaded", books: incoming.books, availability: incoming.availability ?? {}, progress: incoming.progress ?? {} });
      if (incoming.preferences) dispatch({ type: "preferencesLoaded", preferences: incoming.preferences });
      return;
    }
    if (!isExtensionToReaderV2Message(event.data)) return;
    const message = event.data;
    if (!state.requestId || message.requestId !== state.requestId || message.bookId !== state.activeBook?.id) return;
    if (message.type === "bookReady") {
      dispatch({ type: "bookReady", requestId: message.requestId, toc: message.toc, sections: message.sections, initialSectionId: message.initialSectionId });
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
  render();
  post({ type: "libraryReady" });
})();
//# sourceMappingURL=readerApp.js.map
