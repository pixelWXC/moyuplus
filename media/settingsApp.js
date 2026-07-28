"use strict";
(() => {
  // src/settings/settingsMessages.ts
  var SETTINGS_PROTOCOL_VERSION = 2;
  var readerValidators = {
    fontFamily: oneOf("system", "serif", "sans-serif"),
    fontSize: numberBetween(12, 32),
    lineHeight: numberBetween(1.2, 2.4),
    letterSpacing: numberBetween(-0.05, 0.2),
    paragraphSpacing: numberBetween(0, 3),
    textColor: color,
    backgroundColor: color,
    pagePadding: numberBetween(8, 64),
    textAlign: oneOf("left", "justify"),
    theme: oneOf("system", "light", "sepia", "dark")
  };
  var gitLogValidators = {
    showHash: boolean,
    showAuthor: boolean,
    showRelativeTime: boolean,
    showAbsoluteDate: boolean,
    layout: oneOf("lines", "inline"),
    maxCommits: numberBetween(20, 1e3)
  };
  var immersiveValidators = {
    visualLines: numberBetween(1, 12),
    graphemesPerLine: numberBetween(8, 160),
    textColor: color,
    backgroundColor: (value) => value === "transparent" || canonicalColor(value),
    fontWeight: oneOf("normal", "500", "600", "bold"),
    italic: boolean,
    leftMargin: numberBetween(0, 64)
  };
  function boolean(value) {
    return typeof value === "boolean";
  }
  function numberBetween(min, max) {
    return (value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  }
  function color(value) {
    return value === "theme" || canonicalColor(value);
  }
  function canonicalColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
  }
  function oneOf(...allowed) {
    return (value) => allowed.includes(value);
  }

  // src/shortcuts/shortcutSettings.ts
  var ROUTE_ENTER_COMMAND_ID = "moyuplus.routeEnter";
  var TOGGLE_TYPING_PRACTICE_COMMAND_ID = "moyuplus.toggleTypingPractice";
  var TOGGLE_GIT_LOG_COMMAND_ID = "moyuplus.gitLog.toggle";
  var NEXT_READER_PAGE_COMMAND_ID = "moyuplus.reader.nextPage";
  var PREVIOUS_READER_PAGE_COMMAND_ID = "moyuplus.reader.previousPage";
  var UNDO_READER_LOCATION_COMMAND_ID = "moyuplus.reader.undoLocation";
  var FOCUS_READER_COMMAND_ID = "moyuplus.reader.focus";
  var CLOSE_READER_COMMAND_ID = "moyuplus.reader.close";
  var OPEN_READER_LIBRARY_COMMAND_ID = "moyuplus.reader.openLibrary";
  var PREVIOUS_READER_CHAPTER_COMMAND_ID = "moyuplus.reader.previousChapter";
  var NEXT_READER_CHAPTER_COMMAND_ID = "moyuplus.reader.nextChapter";
  var OPEN_READER_TOC_COMMAND_ID = "moyuplus.reader.openToc";
  var OPEN_READER_SETTINGS_COMMAND_ID = "moyuplus.reader.openSettings";
  var STOP_IMMERSIVE_READING_COMMAND_ID = "moyuplus.immersive.stop";
  function createShortcutSettingsState(input) {
    return [
      action(NEXT_READER_PAGE_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u4E0B\u4E00\u9875", "\u5C06\u9605\u8BFB\u5668\u7FFB\u5230\u4E0B\u4E00\u9875\u3002"),
      action(PREVIOUS_READER_PAGE_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u4E0A\u4E00\u9875", "\u8FD4\u56DE\u9605\u8BFB\u5668\u5386\u53F2\u4E2D\u7684\u4E0A\u4E00\u9875\u3002"),
      action(UNDO_READER_LOCATION_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u64A4\u56DE\u9605\u8BFB\u4F4D\u7F6E", "\u8FD4\u56DE\u6700\u8FD1\u4E00\u6B21\u6210\u529F\u5BFC\u822A\u524D\u7684\u4F4D\u7F6E\u3002"),
      action(PREVIOUS_READER_CHAPTER_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u4E0A\u4E00\u7AE0", "\u8DF3\u8F6C\u5230\u4E0A\u4E00\u7AE0\u8282\u3002"),
      action(NEXT_READER_CHAPTER_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u4E0B\u4E00\u7AE0", "\u8DF3\u8F6C\u5230\u4E0B\u4E00\u7AE0\u8282\u3002"),
      action(OPEN_READER_LIBRARY_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u4E66\u67B6", "\u8FD4\u56DE MoyuPlus \u4E66\u67B6\u3002"),
      action(OPEN_READER_TOC_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u76EE\u5F55", "\u6253\u5F00\u5F53\u524D\u4E66\u7C4D\u76EE\u5F55\u3002"),
      action(OPEN_READER_SETTINGS_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u8BBE\u7F6E", "\u6253\u5F00\u9605\u8BFB\u8BBE\u7F6E\u3002"),
      action(FOCUS_READER_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u6253\u5F00", "\u6253\u5F00\u5E76\u805A\u7126 MoyuPlus Reader\u3002"),
      action(CLOSE_READER_COMMAND_ID, "\u9605\u8BFB\u5668\uFF1A\u5173\u95ED", "\u5173\u95ED\u5F53\u524D\u4FA7\u8FB9\u680F\u3002"),
      action(STOP_IMMERSIVE_READING_COMMAND_ID, "\u6C89\u6D78\u9605\u8BFB\uFF1A\u7ED3\u675F", "\u4FDD\u5B58\u5F53\u524D\u9875\u9996\u5E76\u7ED3\u675F\u6C89\u6D78\u9605\u8BFB\u3002"),
      action(TOGGLE_GIT_LOG_COMMAND_ID, "Git Log\uFF1A\u6253\u5F00\u6216\u9000\u51FA", "\u901A\u8FC7\u4E13\u7528\u5FEB\u6377\u952E\u5207\u6362\u5206\u9875\u5F0F\u5F53\u524D\u5206\u652F Git Log\u3002"),
      action(TOGGLE_TYPING_PRACTICE_COMMAND_ID, "\u6253\u5B57\u7EC3\u4E60\uFF1A\u5F00\u542F\u6216\u5173\u95ED", "\u6839\u636E\u5F53\u524D\u7EC3\u4E60\u72B6\u6001\u5F00\u542F\u6216\u5173\u95ED\u6253\u5B57\u7EC3\u4E60\u3002"),
      {
        commandId: ROUTE_ENTER_COMMAND_ID,
        label: "\u7F16\u8F91\u5668\uFF1AEnter \u7EC4\u5408\u52A8\u4F5C",
        description: "\u63D2\u5165\u771F\u5B9E\u6362\u884C\uFF0C\u5E76\u53EF\u6309\u8BBE\u7F6E\u63A8\u8FDB\u9605\u8BFB\u5668\u9875\u9762\u3002",
        enabled: input.enableEnterRouter,
        configurableEnablement: "enter",
        risk: "high",
        conflictWarning: "Enter \u662F\u9AD8\u9891\u7F16\u8F91\u6309\u952E\uFF1B\u4EC5\u5728\u660E\u786E\u9700\u8981\u7EC4\u5408\u52A8\u4F5C\u65F6\u542F\u7528\u3002"
      }
    ];
  }
  function action(commandId, label, description) {
    return {
      commandId,
      label,
      description,
      enabled: true,
      risk: "low"
    };
  }

  // src/domain/readerPreferences.ts
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

  // src/domain/immersiveReaderPreferences.ts
  function createDefaultImmersiveReaderPreferences() {
    return {
      visualLines: 3,
      graphemesPerLine: 40,
      textColor: "theme",
      backgroundColor: "transparent",
      fontWeight: "normal",
      italic: false,
      leftMargin: 12
    };
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

  // src/webview/settingsState.ts
  function createInitialSettingsState(instanceId2) {
    return {
      phase: "loading",
      instanceId: instanceId2,
      stateVersion: 0,
      section: "reader",
      reader: createDefaultReaderPreferences(),
      immersive: createDefaultImmersiveReaderPreferences(),
      gitLog: createDefaultGitLogPreferences(),
      configuration: [],
      pending: {}
    };
  }
  function settingsReducer(state2, action2) {
    if (action2.type === "protocolError") {
      return { ...state2, phase: "protocolError", error: action2.message };
    }
    if (action2.type === "selectSection") return { ...state2, section: action2.section };
    if (action2.type === "resetStarted") {
      return { ...state2, resettingSection: action2.section, saveStatus: "saving", error: void 0 };
    }
    if (action2.type === "resetFailed") {
      if (state2.resettingSection !== action2.section) return state2;
      return {
        ...state2,
        resettingSection: void 0,
        saveStatus: "error",
        error: action2.message ?? "\u6062\u590D\u9ED8\u8BA4\u503C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"
      };
    }
    if (action2.type === "sectionReset") {
      return {
        ...state2,
        stateVersion: Math.max(state2.stateVersion, action2.stateVersion),
        ...action2.section === "reader" ? { reader: action2.value } : action2.section === "immersive" ? { immersive: action2.value } : { gitLog: action2.value },
        resettingSection: void 0,
        saveStatus: "saved",
        error: void 0
      };
    }
    if (action2.type === "snapshotReceived") {
      const snapshot = action2.snapshot;
      if (snapshot.instanceId !== state2.instanceId || snapshot.stateVersion <= state2.stateVersion) return state2;
      return {
        ...state2,
        phase: "ready",
        stateVersion: snapshot.stateVersion,
        section: snapshot.section,
        reader: snapshot.reader,
        immersive: snapshot.immersive,
        gitLog: snapshot.gitLog,
        configuration: snapshot.configuration,
        error: void 0
      };
    }
    const id = `${action2.domain}.${action2.key}`;
    if (action2.type === "localChange") {
      return {
        ...setDomainValue(state2, action2.domain, action2.key, action2.value),
        saveStatus: "saving",
        pending: { ...state2.pending, [id]: { requestId: action2.requestId, clientRevision: action2.clientRevision } }
      };
    }
    if (action2.instanceId !== state2.instanceId || action2.stateVersion < state2.stateVersion) return state2;
    const pending = state2.pending[id];
    const nextStateVersion = Math.max(state2.stateVersion, action2.stateVersion);
    if (!pending || pending.requestId !== action2.requestId || pending.clientRevision !== action2.clientRevision) {
      return nextStateVersion === state2.stateVersion ? state2 : { ...state2, stateVersion: nextStateVersion };
    }
    const nextPending = { ...state2.pending };
    delete nextPending[id];
    const withValue = setDomainValue(state2, action2.domain, action2.key, action2.value);
    return {
      ...withValue,
      stateVersion: nextStateVersion,
      pending: nextPending,
      saveStatus: action2.type === "changeSaved" ? "saved" : "error",
      error: action2.type === "changeFailed" ? action2.message ?? "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002" : void 0
    };
  }
  function setDomainValue(state2, domain, key, value) {
    if (domain === "reader") return { ...state2, reader: { ...state2.reader, [key]: value } };
    if (domain === "immersive") return { ...state2, immersive: { ...state2.immersive, [key]: value } };
    if (domain === "gitLog") return { ...state2, gitLog: { ...state2.gitLog, [key]: value } };
    return {
      ...state2,
      configuration: state2.configuration.map((item) => item.key === key ? { ...item, globalValue: value, globalIsDefault: false } : item)
    };
  }

  // src/webview/settingsApp.ts
  var vscode = window.acquireVsCodeApi?.();
  var app = document.querySelector("#app");
  var instanceId = `settings-${crypto.randomUUID().replace(/-/g, "")}`;
  var state = createInitialSettingsState(instanceId);
  var requestSequence = 0;
  var clientRevision = 0;
  var userSelectedSection = false;
  var rangeTimers = /* @__PURE__ */ new Map();
  var rangeAdjustmentKeys = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);
  var activeRangeSession;
  var sections = [
    { id: "reader", label: "\u9605\u8BFB" },
    { id: "immersive", label: "\u6C89\u6D78\u9605\u8BFB" },
    { id: "gitLog", label: "Git Log" },
    { id: "typing", label: "\u6253\u5B57\u7EC3\u4E60\uFF08\u5B9E\u9A8C\u6027\uFF09" },
    { id: "shortcuts", label: "\u5FEB\u6377\u952E" }
  ];
  vscode?.postMessage({ type: "settingsReady", protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId });
  render();
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!isRecord(message)) return;
    if (message.type === "settingsProtocolError" && typeof message.message === "string") {
      state = settingsReducer(state, { type: "protocolError", message: message.message });
      renderOrDefer();
      return;
    }
    if (message.type === "settingsSnapshotError" && message.instanceId === instanceId) {
      state = { ...state, phase: "loading", error: typeof message.message === "string" ? message.message : "\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002" };
      renderOrDefer();
      return;
    }
    if (message.type === "settingsSnapshot" && isSnapshot(message)) {
      const wasReady = state.phase === "ready";
      const previousSection = state.section;
      state = settingsReducer(state, { type: "snapshotReceived", snapshot: message });
      const focusHeading = state.phase === "ready" && (!wasReady || state.section !== previousSection) && !userSelectedSection;
      renderOrDefer(focusHeading, userSelectedSection);
      userSelectedSection = false;
      return;
    }
    if ((message.type === "changeSaved" || message.type === "changeFailed") && isChangeResponse(message)) {
      const id = `${message.domain}.${message.key}`;
      const pending = state.pending[id];
      const latest = pending?.requestId === message.requestId && pending.clientRevision === message.clientRevision;
      state = settingsReducer(state, { ...message, type: message.type });
      if (activeRangeSession) {
        const session = activeRangeSession;
        if (session.domain === message.domain && session.key === message.key) {
          session.pending = state.pending[id] !== void 0;
          if (latest && message.type === "changeFailed" && !rangeInteractionActive(session)) {
            syncRangeValue(session, message.value);
          }
          syncSaveStatus();
          scheduleRangeSessionFinish();
        } else {
          session.deferredRender = true;
        }
      } else {
        render();
      }
      return;
    }
    if (message.type === "sectionReset" && message.instanceId === instanceId && (message.section === "reader" || message.section === "immersive" || message.section === "gitLog") && typeof message.stateVersion === "number") {
      state = settingsReducer(state, {
        type: "sectionReset",
        section: message.section,
        value: message.value,
        stateVersion: message.stateVersion
      });
      renderOrDefer();
      return;
    }
    if ((message.type === "sectionResetFailed" || message.type === "keyboardShortcutsFailed") && message.instanceId === instanceId) {
      if (message.type === "sectionResetFailed" && (message.section === "reader" || message.section === "immersive" || message.section === "gitLog")) {
        state = settingsReducer(state, {
          type: "resetFailed",
          section: message.section,
          message: typeof message.message === "string" ? message.message : "\u6062\u590D\u9ED8\u8BA4\u503C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"
        });
      } else {
        state = { ...state, saveStatus: "error", error: typeof message.message === "string" ? message.message : "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002" };
      }
      renderOrDefer();
    }
  });
  function renderOrDefer(focusHeading = false, focusNavigation = false) {
    if (activeRangeSession) {
      activeRangeSession.deferredRender = true;
      syncSaveStatus();
      return;
    }
    render(focusHeading, focusNavigation);
  }
  function render(focusHeading = false, focusNavigation = false) {
    if (!app) return;
    app.replaceChildren();
    if (state.phase === "loading") {
      const loading = node("section", "blocking-state");
      loading.append(node("h1", void 0, "MoyuPlus Settings"), node("p", void 0, state.error ?? "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026"));
      if (state.error) loading.append(actionButton("\u91CD\u8BD5", () => postSimple("retrySnapshot")));
      app.append(loading);
      return;
    }
    if (state.phase === "protocolError") {
      const error = node("section", "blocking-state");
      error.setAttribute("role", "alert");
      error.append(node("h1", void 0, "\u8BBE\u7F6E\u65E0\u6CD5\u8F7D\u5165"), node("p", void 0, state.error ?? "\u8BF7\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u6216\u66F4\u65B0\u6269\u5C55\u3002"));
      app.append(error);
      return;
    }
    const header = node("header", "settings-header");
    const title = node("div", "settings-title");
    title.append(node("h1", void 0, "MoyuPlus Settings"), node("p", void 0, "\u8BBE\u7F6E\u4F1A\u81EA\u52A8\u4FDD\u5B58"));
    const status = node("div", `save-status ${state.saveStatus ? `is-${state.saveStatus}` : ""}`, statusText());
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    header.append(title, status);
    const mobile = node("label", "mobile-section-picker");
    mobile.append(node("span", void 0, "\u8BBE\u7F6E\u5206\u533A"));
    const select = node("select");
    for (const section of sections) {
      const option = node("option", void 0, section.label);
      option.value = section.id;
      option.selected = section.id === state.section;
      select.append(option);
    }
    select.addEventListener("change", () => selectSection(select.value));
    mobile.append(select);
    const shell = node("div", "settings-shell");
    const navigation = node("nav", "section-navigation");
    navigation.setAttribute("aria-label", "\u8BBE\u7F6E\u5206\u533A");
    for (const section of sections) {
      const button = actionButton(section.label, () => selectSection(section.id), "section-link");
      button.setAttribute("aria-current", section.id === state.section ? "page" : "false");
      navigation.append(button);
    }
    const content = node("main", "settings-content");
    content.append(renderSection());
    shell.append(navigation, content);
    app.append(header, mobile, shell);
    if (focusHeading) requestAnimationFrame(() => document.querySelector("#settings-section-title")?.focus());
    else if (focusNavigation) requestAnimationFrame(() => {
      const mobileSelect = document.querySelector(".mobile-section-picker select");
      const navigationButton = document.querySelector('.section-link[aria-current="page"]');
      const target = mobileSelect && getComputedStyle(mobileSelect.closest(".mobile-section-picker")).display !== "none" ? mobileSelect : navigationButton;
      target?.focus();
    });
  }
  function syncSaveStatus() {
    const status = document.querySelector(".save-status");
    if (!status) return;
    status.className = `save-status ${state.saveStatus ? `is-${state.saveStatus}` : ""}`;
    status.textContent = statusText();
  }
  function rangeInteractionActive(session) {
    return session.pointerActive || session.keyboardActive || session.fallbackActive;
  }
  function scheduleRangeSessionFinish() {
    window.setTimeout(finishRangeSession, 0);
  }
  function finishRangeSession() {
    const session = activeRangeSession;
    if (!session || rangeInteractionActive(session) || session.pending || rangeTimers.has(rangeId(session.domain, session.key))) return;
    const shouldRender = session.deferredRender;
    const scrollY = window.scrollY;
    const restoreFocus = document.activeElement === session.input;
    const control = session.input.id;
    activeRangeSession = void 0;
    if (!shouldRender) return;
    render();
    window.scrollTo(0, scrollY);
    if (restoreFocus) document.getElementById(control)?.focus({ preventScroll: true });
  }
  function beginRangeSession(domain, key, input, output, unit) {
    if (activeRangeSession?.input === input) return activeRangeSession;
    activeRangeSession = {
      domain,
      key,
      input,
      output,
      unit,
      pointerActive: false,
      keyboardActive: false,
      fallbackActive: false,
      pending: false,
      deferredRender: false
    };
    return activeRangeSession;
  }
  function syncRangeValue(session, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    session.input.value = String(value);
    session.output.value = `${value}${session.unit}`;
  }
  function rangeId(domain, key) {
    return `${domain}.${key}`;
  }
  function clearRangeTimer(id) {
    const timer = rangeTimers.get(id);
    if (timer !== void 0) window.clearTimeout(timer);
    rangeTimers.delete(id);
  }
  function cancelRangeWork() {
    for (const timer of rangeTimers.values()) window.clearTimeout(timer);
    rangeTimers.clear();
    activeRangeSession = void 0;
  }
  function renderSection() {
    if (state.section === "reader") return renderReader();
    if (state.section === "immersive") return renderImmersive();
    if (state.section === "gitLog") return renderGitLog();
    if (state.section === "typing") return renderTyping();
    return renderShortcuts();
  }
  function renderImmersive() {
    const root = sectionRoot("\u6C89\u6D78\u9605\u8BFB", "\u63A7\u5236\u9644\u52A0\u5728\u4EE3\u7801\u884C\u672B\u5C3E\u7684\u7EAF\u6587\u672C\u5206\u9875\u4E0E\u5916\u89C2\u3002");
    const preview = node("div", "immersive-preview");
    preview.setAttribute("aria-label", "\u6C89\u6D78\u9605\u8BFB\u6548\u679C\u793A\u610F");
    const previewText = node("span", "preview-code", "const focus = true;");
    const previewAfter = node("span", "preview-after", "\u5728\u4EE3\u7801\u65C1\u5B89\u9759\u5730\u7EE7\u7EED\u9605\u8BFB");
    previewAfter.style.color = state.immersive.textColor === "theme" ? "var(--vscode-editorCodeLens-foreground, var(--vscode-descriptionForeground))" : state.immersive.textColor;
    previewAfter.style.backgroundColor = state.immersive.backgroundColor === "transparent" ? "transparent" : state.immersive.backgroundColor;
    previewAfter.style.fontWeight = state.immersive.fontWeight;
    previewAfter.style.fontStyle = state.immersive.italic ? "italic" : "normal";
    previewAfter.style.marginLeft = `${state.immersive.leftMargin}px`;
    preview.append(previewText, previewAfter);
    const fields = node("div", "settings-fields");
    fields.append(
      rangeField("\u6BCF\u9875\u89C6\u89C9\u884C\u6570", "immersive", "visualLines", state.immersive.visualLines, 1, 12, 1, " \u884C"),
      rangeField("\u6BCF\u884C\u6700\u5927\u5B57\u5F62\u7C07\u6570", "immersive", "graphemesPerLine", state.immersive.graphemesPerLine, 8, 160, 1),
      immersiveColorField("\u6587\u5B57\u989C\u8272", "textColor", state.immersive.textColor, "theme"),
      immersiveColorField("\u80CC\u666F\u989C\u8272", "backgroundColor", state.immersive.backgroundColor, "transparent"),
      selectField("\u5B57\u91CD", "immersive", "fontWeight", state.immersive.fontWeight, [["normal", "\u5E38\u89C4"], ["500", "\u4E2D\u7B49"], ["600", "\u534A\u7C97"], ["bold", "\u7C97\u4F53"]]),
      toggleField("\u4F7F\u7528\u659C\u4F53", "immersive", "italic", state.immersive.italic),
      rangeField("\u4E0E\u4EE3\u7801\u6587\u672C\u7684\u5DE6\u4FA7\u95F4\u8DDD", "immersive", "leftMargin", state.immersive.leftMargin, 0, 64, 1, "px")
    );
    root.append(preview, fields, resetButton("immersive", "\u6062\u590D\u6C89\u6D78\u9605\u8BFB\u9ED8\u8BA4\u503C"));
    return root;
  }
  function sectionRoot(title, description) {
    const section = node("section", "settings-section");
    const heading = node("h2", void 0, title);
    heading.id = "settings-section-title";
    heading.tabIndex = -1;
    section.append(heading, node("p", "section-description", description));
    return section;
  }
  function renderReader() {
    const root = sectionRoot("\u9605\u8BFB", "\u5168\u5C40\u5E94\u7528\u5230 MoyuPlus Reader \u4E0E Git Log \u6B63\u6587\u3002");
    const fields = node("div", "settings-fields");
    fields.append(
      selectField("\u4E3B\u9898", "reader", "theme", state.reader.theme, [["system", "\u8DDF\u968F VS Code"], ["light", "\u660E\u4EAE"], ["sepia", "\u7EB8\u5F20"], ["dark", "\u6DF1\u8272"]]),
      selectField("\u5B57\u4F53", "reader", "fontFamily", state.reader.fontFamily, [["system", "VS Code"], ["serif", "\u886C\u7EBF"], ["sans-serif", "\u65E0\u886C\u7EBF"]]),
      rangeField("\u5B57\u53F7", "reader", "fontSize", state.reader.fontSize, 12, 32, 1, "px"),
      rangeField("\u884C\u9AD8", "reader", "lineHeight", state.reader.lineHeight, 1.2, 2.4, 0.1),
      rangeField("\u5B57\u95F4\u8DDD", "reader", "letterSpacing", state.reader.letterSpacing, -0.05, 0.2, 0.01, "em"),
      rangeField("\u6BB5\u95F4\u8DDD", "reader", "paragraphSpacing", state.reader.paragraphSpacing, 0, 3, 0.25, "em"),
      colorField("\u6587\u5B57\u989C\u8272", "textColor", state.reader.textColor),
      colorField("\u80CC\u666F\u989C\u8272", "backgroundColor", state.reader.backgroundColor),
      rangeField("\u9875\u9762\u8FB9\u8DDD", "reader", "pagePadding", state.reader.pagePadding, 8, 64, 2, "px"),
      selectField("\u5BF9\u9F50\u65B9\u5F0F", "reader", "textAlign", state.reader.textAlign, [["left", "\u5DE6\u5BF9\u9F50"], ["justify", "\u4E24\u7AEF\u5BF9\u9F50"]])
    );
    root.append(fields, resetButton("reader", "\u6062\u590D\u9605\u8BFB\u9ED8\u8BA4\u503C"));
    return root;
  }
  function renderGitLog() {
    const root = sectionRoot("Git Log", "\u63A7\u5236\u63D0\u4EA4\u5B57\u6BB5\u3001\u6392\u5217\u65B9\u5F0F\u4E0E\u6BCF\u6B21\u52A0\u8F7D\u6570\u91CF\u3002");
    const fields = node("div", "settings-fields");
    fields.append(
      toggleField("\u663E\u793A\u63D0\u4EA4\u54C8\u5E0C", "gitLog", "showHash", state.gitLog.showHash),
      toggleField("\u663E\u793A\u4F5C\u8005", "gitLog", "showAuthor", state.gitLog.showAuthor),
      toggleField("\u663E\u793A\u76F8\u5BF9\u65F6\u95F4", "gitLog", "showRelativeTime", state.gitLog.showRelativeTime),
      toggleField("\u663E\u793A\u7EDD\u5BF9\u65E5\u671F", "gitLog", "showAbsoluteDate", state.gitLog.showAbsoluteDate),
      selectField("\u6392\u5217\u65B9\u5F0F", "gitLog", "layout", state.gitLog.layout, [["lines", "\u5206\u884C"], ["inline", "\u884C\u5185"]]),
      rangeField("\u6700\u5927\u63D0\u4EA4\u6570\u91CF", "gitLog", "maxCommits", state.gitLog.maxCommits, 20, 1e3, 10)
    );
    root.append(fields, resetButton("gitLog", "\u6062\u590D Git Log \u9ED8\u8BA4\u503C"));
    return root;
  }
  function renderTyping() {
    const root = sectionRoot("\u6253\u5B57\u7EC3\u4E60\uFF08\u5B9E\u9A8C\u6027\uFF09", "\u8FD9\u4E9B\u529F\u80FD\u4ECD\u5904\u4E8E\u5B9E\u9A8C\u9636\u6BB5\uFF0C\u7EC3\u4E60\u8F93\u5165\u4F1A\u771F\u5B9E\u5199\u5165\u5F53\u524D\u7F16\u8F91\u5668\u6587\u4EF6\u3002");
    const warning = node("div", "risk-notice");
    warning.setAttribute("role", "note");
    warning.append(
      node("strong", void 0, "\u5B9E\u9A8C\u6027 \xB7 \u8BF7\u4F7F\u7528\u4E13\u95E8\u7684\u7EC3\u4E60\u6587\u4EF6"),
      node("p", void 0, "\u5EFA\u8BAE\u4EC5\u5728\u4E34\u65F6\u6587\u4EF6\u3001\u8349\u7A3F\u6216\u4E13\u95E8\u7EC3\u4E60\u6587\u4EF6\u4E2D\u4F7F\u7528\u3002Tab \u4ECD\u4F18\u5148\u4EA4\u7ED9\u8865\u5168\u83DC\u5355\u4E0E snippet\uFF1BEnter \u548C Tab \u53EF\u80FD\u4E0E\u73B0\u6709\u6309\u952E\u6620\u5C04\u51B2\u7A81\u3002")
    );
    const fields = node("div", "settings-fields");
    for (const item of state.configuration) fields.append(configurationField(item));
    root.append(warning, fields);
    return root;
  }
  function renderShortcuts() {
    const root = sectionRoot("\u5FEB\u6377\u952E", "\u6309\u952E\u914D\u7F6E\u3001\u51B2\u7A81\u68C0\u67E5\u548C\u5220\u9664\u7531 VS Code \u7684\u952E\u76D8\u5FEB\u6377\u65B9\u5F0F\u754C\u9762\u8D1F\u8D23\u3002");
    const config = Object.fromEntries(state.configuration.map((item) => [item.key, item.globalValue]));
    const shortcuts = createShortcutSettingsState({
      enableEnterRouter: config["moyuplus.shortcuts.enableEnterRouter"] === true
    });
    const groups = [
      { title: "\u9605\u8BFB", test: (command) => command.startsWith("moyuplus.reader.") },
      { title: "Git Log", test: (command) => command.includes("gitLog") },
      { title: "\u6253\u5B57\u7EC3\u4E60\uFF08\u5B9E\u9A8C\u6027\uFF09", test: (command) => !command.startsWith("moyuplus.reader.") && !command.includes("gitLog"), experimental: true }
    ];
    for (const group of groups) {
      const list = node("div", "shortcut-list");
      for (const shortcut of shortcuts.filter((item) => group.test(item.commandId))) {
        const row = node("div", "shortcut-row");
        const copy = node("div");
        copy.append(node("strong", void 0, `${shortcut.label}${group.experimental ? "\uFF08\u5B9E\u9A8C\u6027\uFF09" : ""}`), node("p", void 0, shortcut.description));
        row.append(copy);
        if (shortcut.conflictWarning) row.append(node("p", "shortcut-warning", `${group.experimental ? "\u5B9E\u9A8C\u6027 \xB7 " : ""}${shortcut.conflictWarning}`));
        list.append(row);
      }
      if (list.childElementCount) root.append(node("h3", void 0, group.title), list);
    }
    root.append(actionButton("\u5728\u952E\u76D8\u5FEB\u6377\u65B9\u5F0F\u4E2D\u914D\u7F6E MoyuPlus", openKeyboardShortcuts, "primary-button"));
    return root;
  }
  function configurationField(item) {
    const labels = {
      "moyuplus.shortcuts.enableEnterRouter": "Enter \u8DEF\u7531\u603B\u5F00\u5173\uFF08\u5B9E\u9A8C\u6027\uFF09",
      "moyuplus.enter.insertNewLine": "\u63D2\u5165\u771F\u5B9E\u6362\u884C\uFF08\u5B9E\u9A8C\u6027\uFF09",
      "moyuplus.enter.nextReaderPage": "\u9605\u8BFB\u5668\u4E0B\u4E00\u9875\uFF08\u5B9E\u9A8C\u6027\uFF09"
    };
    const wrapper = node("div", "configuration-setting");
    const key = item.key;
    wrapper.append(toggleField(labels[key], "configuration", key, item.globalValue === true));
    wrapper.append(node("p", "scope-note", item.globalIsDefault ? "\u5168\u5C40\u503C\uFF1A\u4F7F\u7528\u9ED8\u8BA4\u503C" : "\u5168\u5C40\u503C\uFF1A\u5DF2\u663E\u5F0F\u8BBE\u7F6E"));
    if (item.overridden) {
      const override = node("div", "override-note");
      override.append(node("strong", void 0, "\u5F53\u524D\u5DE5\u4F5C\u533A\u5B58\u5728\u8986\u76D6"), node("p", void 0, "\u6B64\u5904\u4FDD\u5B58\u7684\u53EA\u662F\u5168\u5C40\u503C\uFF1B\u73B0\u6709\u8986\u76D6\u4F1A\u7EE7\u7EED\u51B3\u5B9A\u5BF9\u5E94\u8D44\u6E90\u7684\u8FD0\u884C\u884C\u4E3A\u3002"));
      if (item.workspaceValue !== void 0) override.append(node("p", void 0, `\u5DE5\u4F5C\u533A\u503C\uFF1A${formatValue(item.workspaceValue)}`));
      for (const folder of item.folders) override.append(node("p", void 0, `${folder.name}\uFF1A\u8986\u76D6 ${formatValue(folder.workspaceFolderValue)}\uFF0C\u5B9E\u9645 ${formatValue(folder.effectiveValue)}`));
      if (item.activeResource) override.append(node("p", void 0, `\u6D3B\u52A8\u7F16\u8F91\u5668${item.activeResource.folderName ? `\uFF08${item.activeResource.folderName}\uFF09` : ""}\uFF1A${formatValue(item.activeResource.effectiveValue)}`));
      wrapper.append(override);
    }
    return wrapper;
  }
  function selectField(labelText, domain, key, value, options) {
    const field = fieldShell(labelText, domain, key);
    const select = node("select");
    select.id = controlId(domain, key);
    select.disabled = isControlPending(domain, key);
    for (const [optionValue, text] of options) {
      const option = node("option", void 0, text);
      option.value = optionValue;
      option.selected = optionValue === value;
      select.append(option);
    }
    select.addEventListener("change", () => change(domain, key, select.value));
    field.append(select);
    return field;
  }
  function toggleField(labelText, domain, key, value) {
    const field = node("label", "setting-field toggle-field");
    const input = node("input");
    input.type = "checkbox";
    input.checked = value;
    input.id = controlId(domain, key);
    input.disabled = isControlPending(domain, key);
    input.addEventListener("change", () => change(domain, key, input.checked));
    field.append(input, node("span", void 0, labelText));
    return field;
  }
  function rangeField(labelText, domain, key, value, min, max, step, unit = "") {
    const field = fieldShell(labelText, domain, key);
    const row = node("div", "range-control");
    const input = node("input");
    Object.assign(input, { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) });
    input.id = controlId(domain, key);
    input.disabled = isControlPending(domain, key);
    const output = node("output", void 0, `${value}${unit}`);
    output.htmlFor.add(input.id);
    const id = rangeId(domain, key);
    const session = () => beginRangeSession(domain, key, input, output, unit);
    const commit = () => {
      clearRangeTimer(id);
      const current = session();
      const next = Number(input.value);
      if (current.lastSubmittedValue === next) {
        scheduleRangeSessionFinish();
        return;
      }
      current.lastSubmittedValue = next;
      current.pending = true;
      change(domain, key, next, false);
    };
    input.addEventListener("pointerdown", () => {
      session().pointerActive = true;
    });
    input.addEventListener("pointerup", () => {
      const current = session();
      current.pointerActive = false;
      current.fallbackActive = false;
      scheduleRangeSessionFinish();
    });
    input.addEventListener("pointercancel", () => {
      const current = session();
      current.pointerActive = false;
      current.fallbackActive = false;
      scheduleRangeSessionFinish();
    });
    input.addEventListener("keydown", (event) => {
      if (rangeAdjustmentKeys.has(event.key)) session().keyboardActive = true;
    });
    input.addEventListener("keyup", (event) => {
      if (!rangeAdjustmentKeys.has(event.key)) return;
      const current = session();
      current.keyboardActive = false;
      current.fallbackActive = false;
      scheduleRangeSessionFinish();
    });
    input.addEventListener("blur", () => {
      const current = session();
      current.keyboardActive = false;
      current.fallbackActive = false;
      scheduleRangeSessionFinish();
    });
    input.addEventListener("input", () => {
      output.value = `${input.value}${unit}`;
      const current = session();
      if (!current.pointerActive && !current.keyboardActive) current.fallbackActive = true;
      clearRangeTimer(id);
      rangeTimers.set(id, window.setTimeout(commit, 250));
    });
    input.addEventListener("change", () => {
      const current = session();
      current.fallbackActive = false;
      commit();
      scheduleRangeSessionFinish();
    });
    row.append(input, output);
    field.append(row);
    return field;
  }
  function colorField(labelText, key, value) {
    const field = fieldShell(labelText, "reader", key);
    const row = node("div", "color-control");
    const inherited = value === "theme";
    const color2 = node("input");
    color2.type = "color";
    color2.value = inherited ? inheritedReaderColor(key) : value;
    color2.id = controlId("reader", key);
    const text = node("input");
    text.type = "text";
    text.value = inherited ? "" : value;
    text.placeholder = "\u8DDF\u968F\u4E3B\u9898";
    text.pattern = "#[0-9a-fA-F]{6}";
    text.setAttribute("aria-label", `${labelText}\u5341\u516D\u8FDB\u5236\u503C`);
    const reset = actionButton("\u8DDF\u968F\u4E3B\u9898", () => change("reader", key, "theme"), "inline-button");
    reset.setAttribute("aria-label", `${labelText}\u6062\u590D\u8DDF\u968F\u4E3B\u9898`);
    const pending = isControlPending("reader", key);
    color2.disabled = text.disabled = pending;
    reset.disabled = pending || inherited;
    color2.addEventListener("change", () => change("reader", key, color2.value.toLowerCase()));
    text.addEventListener("change", () => {
      if (text.validity.valid) change("reader", key, text.value.toLowerCase());
    });
    row.append(color2, text, reset, node("span", "color-source", inherited ? "\u5F53\u524D\uFF1A\u8DDF\u968F\u4E3B\u9898" : `\u5F53\u524D\uFF1A${value}`));
    field.append(row);
    return field;
  }
  function immersiveColorField(labelText, key, value, inheritedValue) {
    const domain = "immersive";
    const field = fieldShell(labelText, domain, key);
    const row = node("div", "color-control");
    const inherited = value === inheritedValue;
    const fallbackVariable = key === "textColor" ? "--vscode-editorCodeLens-foreground" : "--vscode-editor-background";
    const fallback = canonicalCssColor(getComputedStyle(document.documentElement).getPropertyValue(fallbackVariable)) ?? "#808080";
    const color2 = node("input");
    color2.type = "color";
    color2.value = inherited ? fallback : value;
    color2.id = controlId(domain, key);
    const text = node("input");
    text.type = "text";
    text.value = inherited ? "" : value;
    text.placeholder = inheritedValue === "theme" ? "\u8DDF\u968F\u4E3B\u9898" : "\u900F\u660E";
    text.pattern = "#[0-9a-fA-F]{6}";
    text.setAttribute("aria-label", `${labelText}\u5341\u516D\u8FDB\u5236\u503C`);
    const resetLabel = inheritedValue === "theme" ? "\u8DDF\u968F\u4E3B\u9898" : "\u900F\u660E";
    const reset = actionButton(resetLabel, () => change(domain, key, inheritedValue), "inline-button");
    reset.setAttribute("aria-label", `${labelText}\u6062\u590D${resetLabel}`);
    const pending = isControlPending(domain, key);
    color2.disabled = text.disabled = pending;
    reset.disabled = pending || inherited;
    color2.addEventListener("change", () => change(domain, key, color2.value.toLowerCase()));
    text.addEventListener("change", () => {
      if (text.validity.valid) change(domain, key, text.value.toLowerCase());
    });
    row.append(color2, text, reset, node("span", "color-source", inherited ? `\u5F53\u524D\uFF1A${resetLabel}` : `\u5F53\u524D\uFF1A${value}`));
    field.append(row);
    return field;
  }
  function inheritedReaderColor(key) {
    const presets = {
      light: { textColor: "#1f2328", backgroundColor: "#ffffff" },
      sepia: { textColor: "#4a3b2a", backgroundColor: "#f3ead7" },
      dark: { textColor: "#d6d4d1", backgroundColor: "#1e1e1e" }
    };
    const preset = presets[state.reader.theme];
    if (preset) return preset[key];
    const variable = key === "textColor" ? "--vscode-editor-foreground" : "--vscode-editor-background";
    return canonicalCssColor(getComputedStyle(document.documentElement).getPropertyValue(variable)) ?? "#000000";
  }
  function canonicalCssColor(value) {
    const hex = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
    const short = /^#([0-9a-f]{3})$/i.exec(hex);
    if (short) return `#${[...short[1]].map((digit) => digit.repeat(2)).join("")}`.toLowerCase();
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(hex);
    if (!rgb) return void 0;
    return `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("")}`;
  }
  function fieldShell(labelText, domain, key) {
    const field = node("label", "setting-field");
    field.htmlFor = controlId(domain, key);
    field.append(node("span", "setting-label", labelText));
    return field;
  }
  function resetButton(section, label) {
    const button = actionButton(label, () => {
      cancelRangeWork();
      const request = requestEnvelope();
      state = settingsReducer(state, { type: "resetStarted", section });
      render();
      vscode?.postMessage({ ...request, type: "resetSection", section });
    }, "secondary-button");
    button.disabled = state.resettingSection === section;
    return button;
  }
  function change(domain, key, value, shouldRender = true) {
    const request = requestEnvelope();
    state = settingsReducer(state, { type: "localChange", domain, key, value, requestId: request.requestId, clientRevision: request.clientRevision });
    if (shouldRender) renderOrDefer();
    else syncSaveStatus();
    vscode?.postMessage({ ...request, type: "changeSetting", domain, key, value });
  }
  function selectSection(section) {
    cancelRangeWork();
    userSelectedSection = true;
    state = settingsReducer(state, { type: "selectSection", section });
    render(false, true);
    vscode?.postMessage({ type: "selectSection", protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId, section });
  }
  window.addEventListener("beforeunload", cancelRangeWork);
  function openKeyboardShortcuts() {
    vscode?.postMessage({ ...requestEnvelope(), type: "openKeyboardShortcuts" });
  }
  function postSimple(type) {
    vscode?.postMessage({ type, protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId });
  }
  function requestEnvelope() {
    clientRevision += 1;
    return { protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId, requestId: `settings-${Date.now()}-${++requestSequence}`, clientRevision };
  }
  function statusText() {
    if (state.saveStatus === "saving") return "\u6B63\u5728\u4FDD\u5B58\u2026";
    if (state.saveStatus === "saved") return "\u2713 \u5DF2\u4FDD\u5B58";
    if (state.saveStatus === "error") return state.error ?? "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002";
    return "";
  }
  function actionButton(text, action2, className = "") {
    const button = node("button", className, text);
    button.type = "button";
    button.addEventListener("click", action2);
    return button;
  }
  function node(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== void 0) value.textContent = text;
    return value;
  }
  function controlId(domain, key) {
    return `${domain}-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  }
  function isControlPending(domain, key) {
    if (domain === "reader" && state.resettingSection === "reader") return true;
    if (domain === "immersive" && state.resettingSection === "immersive") return true;
    if (domain === "gitLog" && state.resettingSection === "gitLog") return true;
    return state.pending[`${domain}.${key}`] !== void 0;
  }
  function formatValue(value) {
    return typeof value === "boolean" ? value ? "\u5F00\u542F" : "\u5173\u95ED" : String(value);
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isSnapshot(value) {
    return value.protocolVersion === SETTINGS_PROTOCOL_VERSION && value.instanceId === instanceId && Number.isSafeInteger(value.stateVersion) && value.stateVersion > 0 && sections.some((section) => section.id === value.section) && isRecord(value.reader) && isRecord(value.immersive) && isRecord(value.gitLog) && Array.isArray(value.configuration);
  }
  function isChangeResponse(value) {
    return value.instanceId === instanceId && Number.isSafeInteger(value.stateVersion) && typeof value.requestId === "string" && Number.isSafeInteger(value.clientRevision) && (value.domain === "reader" || value.domain === "immersive" || value.domain === "gitLog" || value.domain === "configuration") && typeof value.key === "string";
  }
})();
//# sourceMappingURL=settingsApp.js.map
