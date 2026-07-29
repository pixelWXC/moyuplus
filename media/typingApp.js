"use strict";
(() => {
  // src/typing/adapters/view/typingViewProtocol.ts
  var TYPING_VIEW_PROTOCOL_VERSION = 11;
  var TYPING_VIEW_PAGES = [
    "materials",
    "recent",
    "setup",
    "live",
    "result",
    "history",
    "mastery"
  ];
  function isHostToTypingViewMessage(value) {
    if (!isRecord(value) || value.protocolVersion !== TYPING_VIEW_PROTOCOL_VERSION || !isInstanceId(value.instanceId) || value.type !== "shellSnapshot" || !isPositiveSafeInteger(value.snapshotRevision) || !hasOnlyKeys(value, [
      "type",
      "protocolVersion",
      "instanceId",
      "snapshotRevision",
      "snapshot"
    ]) || !isRecord(value.snapshot) || !hasOnlyKeys(
      value.snapshot,
      value.snapshot.legacyResumeHint === void 0 ? [
        "activePage",
        "availablePages",
        "activeSessionStatus",
        "pendingResultCount",
        "recovery",
        "content"
      ] : [
        "activePage",
        "availablePages",
        "activeSessionStatus",
        "pendingResultCount",
        "recovery",
        "legacyResumeHint",
        "content"
      ]
    )) {
      return false;
    }
    return isTypingViewPage(value.snapshot.activePage) && Array.isArray(value.snapshot.availablePages) && value.snapshot.availablePages.every(isTypingViewPage) && isTypingViewSessionStatusOrNull(value.snapshot.activeSessionStatus) && isNonNegativeSafeInteger(value.snapshot.pendingResultCount) && (value.snapshot.recovery === null || isTypingViewRecoverySnapshot(value.snapshot.recovery)) && (value.snapshot.legacyResumeHint === void 0 || isTypingViewLegacyResumeHint(value.snapshot.legacyResumeHint)) && isTypingViewPageContent(value.snapshot.content, value.snapshot.activePage);
  }
  function isTypingViewLegacyResumeHint(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "sourceTitle",
      "sourceAvailable",
      "physicalLineNumber",
      "whitespace"
    ]) && isNonEmptyString(value.sourceTitle) && typeof value.sourceAvailable === "boolean" && isPositiveSafeInteger(value.physicalLineNumber) && isRecord(value.whitespace) && hasOnlyKeys(value.whitespace, [
      "skipEmptyLines",
      "trimLeadingSpaces",
      "trimTrailingSpaces",
      "ignoreAllSpaces"
    ]) && typeof value.whitespace.skipEmptyLines === "boolean" && typeof value.whitespace.trimLeadingSpaces === "boolean" && typeof value.whitespace.trimTrailingSpaces === "boolean" && typeof value.whitespace.ignoreAllSpaces === "boolean";
  }
  function isTypingViewRecoverySnapshot(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "status",
      "savedAt",
      "completedUnits",
      "totalUnits"
    ]) && (value.status === "ready" || value.status === "running" || value.status === "blockedOnError" || value.status === "paused") && isNonNegativeFinite(value.savedAt) && isNonNegativeSafeInteger(value.completedUnits) && isNonNegativeSafeInteger(value.totalUnits) && value.completedUnits <= value.totalUnits;
  }
  function isTypingViewPageContent(value, activePage) {
    if (!isRecord(value)) return false;
    if (value.kind === "recent") {
      return activePage === "recent" && hasOnlyKeys(value, ["kind", "items"]) && Array.isArray(value.items) && value.items.length <= 20 && value.items.every(isTypingViewRecentItem);
    }
    if (value.kind === "live") {
      return activePage === "live" && hasOnlyKeys(value, [
        "kind",
        "status",
        "progress",
        "metrics",
        "controls"
      ]) && (value.status === "ready" || value.status === "running" || value.status === "blockedOnError" || value.status === "paused") && (isRecord(value.progress) && hasOnlyKeys(value.progress, ["completedUnits", "totalUnits"]) && isNonNegativeSafeInteger(value.progress.completedUnits) && isNonNegativeSafeInteger(value.progress.totalUnits) && value.progress.completedUnits <= value.progress.totalUnits && isLiveMetrics(value.metrics) || value.progress === null && value.metrics === null) && isRecord(value.controls) && hasOnlyKeys(value.controls, ["pause", "resume", "restart", "finish"]) && typeof value.controls.pause === "boolean" && typeof value.controls.resume === "boolean" && typeof value.controls.restart === "boolean" && typeof value.controls.finish === "boolean";
    }
    if (value.kind === "sessionConflict") {
      return activePage === "setup" && hasOnlyKeys(value, [
        "kind",
        "page",
        "sessionId",
        "status"
      ]) && value.page === "setup" && isSafeMaterialId(value.sessionId) && (value.status === "ready" || value.status === "running" || value.status === "blockedOnError" || value.status === "paused");
    }
    if (value.kind === "result") {
      return activePage === "result" && hasOnlyKeys(value, ["kind", "result", "benchmarkBest"]) && (value.result === null || isTypingViewResult(value.result)) && (value.benchmarkBest === null || isRecord(value.benchmarkBest) && hasOnlyKeys(value.benchmarkBest, [
        "effectiveCpm",
        "accuracy",
        "isCurrentResult"
      ]) && isNonNegativeFinite(value.benchmarkBest.effectiveCpm) && isFiniteBetween(value.benchmarkBest.accuracy, 0, 100) && typeof value.benchmarkBest.isCurrentResult === "boolean");
    }
    if (value.kind === "history") {
      return activePage === "history" && hasOnlyKeys(value, [
        "kind",
        "page",
        "pageSize",
        "totalItems",
        "items",
        "days"
      ]) && isPositiveSafeInteger(value.page) && value.pageSize === 50 && isNonNegativeSafeInteger(value.totalItems) && Array.isArray(value.items) && value.items.length <= value.pageSize && value.items.every(isTypingViewHistoryItem) && Array.isArray(value.days) && value.days.every(isTypingViewHistoryDay);
    }
    if (value.kind === "mastery") {
      return activePage === "mastery" && hasOnlyKeys(value, ["kind", "totalEntries", "entries"]) && isNonNegativeSafeInteger(value.totalEntries) && Array.isArray(value.entries) && value.entries.length <= value.totalEntries && value.entries.every(isTypingViewMasteryEntry);
    }
    if (value.kind === "unavailable") {
      return activePage !== "materials" && hasOnlyKeys(value, ["kind", "page"]) && value.page === activePage;
    }
    if (activePage === "materials") {
      return value.kind === "materials" && hasOnlyKeys(value, ["kind", "library", "actions"]) && Array.isArray(value.library) && value.library.every(isTypingViewMaterialSummary) && isRecord(value.actions) && hasOnlyKeys(value.actions, ["paste", "importTxt", "importEpub"]) && typeof value.actions.paste === "boolean" && typeof value.actions.importTxt === "boolean" && typeof value.actions.importEpub === "boolean";
    }
    if (activePage !== "setup" || value.kind !== "setup") return false;
    const selectedRange = value.selectedRange;
    if (!hasOnlyKeys(value, ["kind", "source", "ranges", "selectedRange", "plan"]) || !isRecord(value.source) || !hasOnlyKeys(value.source, ["title", "profileKey", "counts"]) || !isNonEmptyString(value.source.title) || !isNonEmptyString(value.source.profileKey) || !isTypingViewMaterialCounts(value.source.counts) || !Array.isArray(value.ranges) || value.ranges.length === 0 || !value.ranges.every(isTypingViewSetupRange) || !isTypingViewSourceRange(selectedRange) || !isTypingViewSetupPlan(value.plan)) {
      return false;
    }
    return value.ranges.some((item) => isRecord(item) && sameRange(item.range, selectedRange));
  }
  function isTypingViewRecentItem(value) {
    if (!isRecord(value)) return false;
    const keys = [
      "resultId",
      "sourceRevision",
      "profileKey",
      "outcome",
      "endedAt",
      "activeElapsedMs",
      "accuracy",
      "effectiveCpm"
    ];
    return hasOnlyKeys(
      value,
      value.materialId === void 0 ? keys : [...keys, "materialId"]
    ) && isSafeOpaqueId(value.resultId) && (value.materialId === void 0 || isSafeOpaqueId(value.materialId)) && isNonEmptyString(value.sourceRevision) && isNonEmptyString(value.profileKey) && (value.outcome === "completed" || value.outcome === "timedOut" || value.outcome === "abandoned" || value.outcome === "restarted") && isNonNegativeFinite(value.endedAt) && isNonNegativeFinite(value.activeElapsedMs) && isFiniteBetween(value.accuracy, 0, 100) && isNonNegativeFinite(value.effectiveCpm);
  }
  function isTypingViewSetupRange(value) {
    return isRecord(value) && hasOnlyKeys(value, ["label", "range"]) && isNonEmptyString(value.label) && isTypingViewSourceRange(value.range);
  }
  function isTypingViewSourceRange(value) {
    if (!isRecord(value)) return false;
    if (value.kind === "whole") return hasOnlyKeys(value, ["kind"]);
    if (value.kind === "article") {
      return hasOnlyKeys(
        value,
        value.articleId === void 0 ? ["kind"] : ["kind", "articleId"]
      ) && (value.articleId === void 0 || isSafeOpaqueId(value.articleId));
    }
    if (value.kind === "chapter") {
      return hasOnlyKeys(value, ["kind", "chapterId"]) && isSafeOpaqueId(value.chapterId);
    }
    return value.kind === "selection" && hasOnlyKeys(value, ["kind", "start", "end"]) && isNonNegativeSafeInteger(value.start) && isPositiveSafeInteger(value.end) && value.end > value.start;
  }
  function isTypingViewSetupPlan(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "completion",
      "evaluation",
      "textPolicy",
      "flowPolicy",
      "displayPolicy"
    ]) && isTypingViewCompletion(value.completion) && isRecord(value.evaluation) && hasOnlyKeys(value.evaluation, ["errorPolicy"]) && (value.evaluation.errorPolicy === "allowSkip" || value.evaluation.errorPolicy === "block") && isTypingViewTextPolicy(value.textPolicy) && isRecord(value.flowPolicy) && hasOnlyKeys(value.flowPolicy, ["lineAdvance", "presentation"]) && (value.flowPolicy.lineAdvance === "automatic" || value.flowPolicy.lineAdvance === "enter") && (value.flowPolicy.presentation === "continuous" || value.flowPolicy.presentation === "lineFocus") && isRecord(value.displayPolicy) && hasOnlyKeys(value.displayPolicy, ["showLiveMetrics", "showWhitespace"]) && typeof value.displayPolicy.showLiveMetrics === "boolean" && typeof value.displayPolicy.showWhitespace === "boolean";
  }
  function isTypingViewCompletion(value) {
    if (!isRecord(value)) return false;
    if (value.kind === "free") return hasOnlyKeys(value, ["kind"]);
    if (value.kind === "timed") {
      return hasOnlyKeys(value, ["kind", "seconds"]) && isPositiveSafeInteger(value.seconds);
    }
    if (value.kind === "length") {
      return hasOnlyKeys(value, ["kind", "targetUnits"]) && isPositiveSafeInteger(value.targetUnits);
    }
    return value.kind === "sourceRange" && hasOnlyKeys(value, ["kind", "range"]) && (value.range === "article" || value.range === "chapter" || value.range === "selection");
  }
  function isTypingViewTextPolicy(value) {
    return isRecord(value) && hasOnlyKeys(value, ["punctuation", "whitespace", "caseSensitive"]) && isRecord(value.punctuation) && hasOnlyKeys(value.punctuation, ["mode", "mappingVersion"]) && (value.punctuation.mode === "strict" || value.punctuation.mode === "equivalent") && isNonEmptyString(value.punctuation.mappingVersion) && isRecord(value.whitespace) && hasOnlyKeys(value.whitespace, ["mode"]) && (value.whitespace.mode === "strict" || value.whitespace.mode === "collapse" || value.whitespace.mode === "trimLineEdges" || value.whitespace.mode === "ignore") && typeof value.caseSensitive === "boolean";
  }
  function sameRange(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function isTypingViewMaterialSummary(value) {
    if (!isRecord(value)) return false;
    const requiredKeys = [
      "id",
      "revision",
      "title",
      "origin",
      "profileKey",
      "tags",
      "counts",
      "estimatedSeconds"
    ];
    const allowedKeys = value.sourceNotice === void 0 ? requiredKeys : [...requiredKeys, "sourceNotice"];
    return hasOnlyKeys(value, allowedKeys) && isNonEmptyString(value.id) && isNonEmptyString(value.revision) && isNonEmptyString(value.title) && isTypingViewMaterialOrigin(value.origin) && isNonEmptyString(value.profileKey) && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string") && isTypingViewMaterialCounts(value.counts) && isPositiveSafeInteger(value.estimatedSeconds) && (value.sourceNotice === void 0 || isRecord(value.sourceNotice) && hasOnlyKeys(value.sourceNotice, ["license", "attribution"]) && isNonEmptyString(value.sourceNotice.license) && isNonEmptyString(value.sourceNotice.attribution));
  }
  function isTypingViewMaterialCounts(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "graphemes",
      "hanGraphemes",
      "englishWords",
      "printableUnits"
    ]) && isNonNegativeSafeInteger(value.graphemes) && isNonNegativeSafeInteger(value.hanGraphemes) && isNonNegativeSafeInteger(value.englishWords) && isNonNegativeSafeInteger(value.printableUnits);
  }
  function isLiveMetrics(value) {
    if (!isRecord(value) || !hasOnlyKeys(value, [
      "activeElapsedMs",
      "totalAttempts",
      "correctAttempts",
      "errorAttempts",
      "accuracy",
      "rawCpm",
      "effectiveCpm"
    ])) return false;
    return isNonNegativeFinite(value.activeElapsedMs) && isNonNegativeSafeInteger(value.totalAttempts) && isNonNegativeSafeInteger(value.correctAttempts) && isNonNegativeSafeInteger(value.errorAttempts) && value.correctAttempts + value.errorAttempts === value.totalAttempts && isFiniteBetween(value.accuracy, 0, 100) && isNonNegativeFinite(value.rawCpm) && isNonNegativeFinite(value.effectiveCpm);
  }
  function isTypingViewResult(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "id",
      "outcome",
      "endedAt",
      "activeElapsedMs",
      "metrics",
      "speedBuckets",
      "errorPairs",
      "errorWords"
    ]) && isSafeMaterialId(value.id) && isPracticeOutcome(value.outcome) && isNonNegativeFinite(value.endedAt) && isNonNegativeFinite(value.activeElapsedMs) && isTypingViewResultMetrics(value.metrics) && Array.isArray(value.speedBuckets) && value.speedBuckets.every(isTypingViewSpeedBucket) && Array.isArray(value.errorPairs) && value.errorPairs.every(isTypingViewErrorPair) && Array.isArray(value.errorWords) && value.errorWords.every(isTypingViewErrorWord);
  }
  function isTypingViewResultMetrics(value) {
    if (!isRecord(value) || !hasOnlyKeys(value, [
      "totalAttempts",
      "correctAttempts",
      "errorAttempts",
      "completedUnits",
      "accuracy",
      "rawCpm",
      "effectiveCpm",
      "longestCorrectStreak",
      "correctionCount"
    ])) return false;
    return isNonNegativeSafeInteger(value.totalAttempts) && isNonNegativeSafeInteger(value.correctAttempts) && isNonNegativeSafeInteger(value.errorAttempts) && value.correctAttempts + value.errorAttempts === value.totalAttempts && isNonNegativeSafeInteger(value.completedUnits) && isFiniteBetween(value.accuracy, 0, 100) && isNonNegativeFinite(value.rawCpm) && isNonNegativeFinite(value.effectiveCpm) && isNonNegativeSafeInteger(value.longestCorrectStreak) && isNonNegativeSafeInteger(value.correctionCount);
  }
  function isTypingViewSpeedBucket(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "activeElapsedMs",
      "rawCpm",
      "effectiveCpm",
      "accuracy"
    ]) && isNonNegativeFinite(value.activeElapsedMs) && isNonNegativeFinite(value.rawCpm) && isNonNegativeFinite(value.effectiveCpm) && isFiniteBetween(value.accuracy, 0, 100);
  }
  function isTypingViewErrorPair(value) {
    return isRecord(value) && hasOnlyKeys(value, ["expected", "actual", "count"]) && typeof value.expected === "string" && typeof value.actual === "string" && isPositiveSafeInteger(value.count);
  }
  function isTypingViewErrorWord(value) {
    return isRecord(value) && hasOnlyKeys(value, ["word", "count"]) && isNonEmptyString(value.word) && isPositiveSafeInteger(value.count);
  }
  function isTypingViewHistoryItem(value) {
    if (!isRecord(value) || !hasOnlyKeys(value, [
      "resultId",
      "outcome",
      "endedAt",
      "benchmarkKey",
      "metrics"
    ]) || !isSafeMaterialId(value.resultId) || value.outcome !== "completed" && value.outcome !== "timedOut" || !isNonNegativeFinite(value.endedAt) || !isNonEmptyString(value.benchmarkKey) || !isRecord(value.metrics) || !hasOnlyKeys(value.metrics, [
      "totalAttempts",
      "correctAttempts",
      "errorAttempts",
      "accuracy",
      "rawCpm",
      "effectiveCpm"
    ])) return false;
    return isNonNegativeSafeInteger(value.metrics.totalAttempts) && isNonNegativeSafeInteger(value.metrics.correctAttempts) && isNonNegativeSafeInteger(value.metrics.errorAttempts) && value.metrics.correctAttempts + value.metrics.errorAttempts === value.metrics.totalAttempts && isFiniteBetween(value.metrics.accuracy, 0, 100) && isNonNegativeFinite(value.metrics.rawCpm) && isNonNegativeFinite(value.metrics.effectiveCpm);
  }
  function isTypingViewHistoryDay(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "date",
      "activeElapsedMs",
      "correctAttempts",
      "errorAttempts",
      "resultCount"
    ]) && typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && isNonNegativeFinite(value.activeElapsedMs) && isNonNegativeSafeInteger(value.correctAttempts) && isNonNegativeSafeInteger(value.errorAttempts) && isNonNegativeSafeInteger(value.resultCount);
  }
  function isTypingViewMasteryEntry(value) {
    return isRecord(value) && hasOnlyKeys(value, [
      "key",
      "kind",
      "wrongCount",
      "reinforcementCorrectStreak",
      "lastErrorAt",
      "score"
    ]) && isNonEmptyString(value.key) && (value.kind === "grapheme" || value.kind === "word" || value.kind === "codeToken") && isNonNegativeSafeInteger(value.wrongCount) && isNonNegativeSafeInteger(value.reinforcementCorrectStreak) && isNonNegativeFinite(value.lastErrorAt) && isNonNegativeFinite(value.score);
  }
  function isPracticeOutcome(value) {
    return value === "completed" || value === "timedOut" || value === "abandoned" || value === "restarted";
  }
  function isTypingViewMaterialOrigin(value) {
    return value === "custom" || value === "txtImport" || value === "epubImport" || value === "readerBook" || value === "generated" || value === "mastery" || value === "adHoc";
  }
  function isTypingViewPage(value) {
    return typeof value === "string" && TYPING_VIEW_PAGES.includes(value);
  }
  function isInstanceId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
  }
  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }
  function isSafeMaterialId(value) {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
  }
  function isSafeOpaqueId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("..") && !/[\/\\\u0000-\u001f\u007f]/.test(value);
  }
  function isPositiveSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  }
  function isNonNegativeSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  }
  function isNonNegativeFinite(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }
  function isFiniteBetween(value, min, max) {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  }
  function isTypingViewSessionStatusOrNull(value) {
    return value === null || value === "ready" || value === "running" || value === "blockedOnError" || value === "paused" || value === "completed" || value === "abandoned";
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function hasOnlyKeys(value, keys) {
    const actual = Object.keys(value);
    return actual.length === keys.length && actual.every((key) => keys.includes(key));
  }

  // src/webview/typingState.ts
  function createTypingViewState(instanceId2) {
    return {
      instanceId: instanceId2,
      activePage: "materials",
      availablePages: [...TYPING_VIEW_PAGES],
      activeSessionStatus: null,
      pendingResultCount: 0,
      recovery: null,
      legacyResumeHint: null,
      content: null,
      snapshotRevision: 0
    };
  }
  function reduceTypingViewMessage(state2, value) {
    if (!isHostToTypingViewMessage(value) || value.instanceId !== state2.instanceId || value.snapshotRevision <= state2.snapshotRevision) {
      return state2;
    }
    return {
      instanceId: state2.instanceId,
      activePage: value.snapshot.activePage,
      availablePages: [...value.snapshot.availablePages],
      activeSessionStatus: value.snapshot.activeSessionStatus,
      pendingResultCount: value.snapshot.pendingResultCount,
      recovery: value.snapshot.recovery ? structuredClone(value.snapshot.recovery) : null,
      legacyResumeHint: value.snapshot.legacyResumeHint ? structuredClone(value.snapshot.legacyResumeHint) : null,
      content: structuredClone(value.snapshot.content),
      snapshotRevision: value.snapshotRevision
    };
  }

  // src/webview/typingViewRender.ts
  var profileLabels = {
    "chinese.modernArticle": "\u4E2D\u6587\u6587\u7AE0",
    "chinese.news": "\u4E2D\u6587\u65B0\u95FB",
    "chinese.fiction": "\u4E2D\u6587\u5C0F\u8BF4",
    "chinese.commonSentence": "\u4E2D\u6587\u53E5\u5B50",
    "chinese.adHoc": "\u4E2D\u6587\u81EA\u7531\u5185\u5BB9",
    "english.word": "\u82F1\u6587\u5355\u8BCD",
    "english.sentence": "\u82F1\u6587\u53E5\u5B50",
    "english.article": "\u82F1\u6587\u6587\u7AE0",
    "english.adHoc": "\u82F1\u6587\u81EA\u7531\u5185\u5BB9",
    "mixed.programmer": "\u4E2D\u82F1\u6DF7\u5408 \xB7 \u7A0B\u5E8F\u5458",
    "mixed.office": "\u4E2D\u82F1\u6DF7\u5408 \xB7 \u529E\u516C",
    "mixed.adHoc": "\u4E2D\u82F1\u6DF7\u5408 \xB7 \u81EA\u7531\u5185\u5BB9",
    "randomChinese.frequentHanzi": "\u9AD8\u9891\u6C49\u5B57",
    "randomChinese.idiom": "\u6210\u8BED",
    "randomChinese.phrase": "\u8BCD\u7EC4",
    "numberSymbol.phone": "\u624B\u673A\u53F7",
    "numberSymbol.date": "\u65E5\u671F",
    "numberSymbol.amount": "\u91D1\u989D",
    "numberSymbol.punctuation": "\u6807\u70B9",
    "numberSymbol.specialSymbol": "\u7279\u6B8A\u7B26\u53F7",
    "mastery.grapheme": "\u9519\u5B57\u5F3A\u5316",
    "mastery.word": "\u9519\u8BCD\u5F3A\u5316",
    "mastery.codeToken": "\u4EE3\u7801\u8BCD\u5143\u5F3A\u5316",
    "mastery.mixed": "\u7EFC\u5408\u5F3A\u5316"
  };
  var originLabels = {
    custom: "\u81EA\u5B9A\u4E49",
    txtImport: "TXT \u5BFC\u5165",
    epubImport: "EPUB \u5BFC\u5165",
    readerBook: "\u4E66\u67B6",
    generated: "\u751F\u6210\u5185\u5BB9",
    mastery: "\u5F3A\u5316\u5185\u5BB9",
    adHoc: "\u81EA\u7531\u7EC3\u4E60"
  };
  function renderTypingRecoveryBanner(recovery) {
    return `
    <aside class="recovery-banner" role="status" aria-labelledby="recovery-title">
      <h2 id="recovery-title">\u53D1\u73B0\u53EF\u6062\u590D\u7684\u7EC3\u4E60</h2>
      <p>\u4E0A\u6B21\u7EC3\u4E60\u505C\u5728 ${recovery.completedUnits} / ${recovery.totalUnits}\uFF0C\u72B6\u6001\u4E3A\u201C${sessionStatusLabel(recovery.status)}\u201D\u3002\u6062\u590D\u540E\u4F1A\u5148\u4FDD\u6301\u6682\u505C\u3002</p>
      <p class="fact-note">\u68C0\u67E5\u70B9\u4FDD\u5B58\u4E8E ${formatDateTime(recovery.savedAt)}</p>
      <div class="material-actions" role="group" aria-label="\u65E7\u7EC3\u4E60\u6062\u590D\u9009\u62E9">
        <button class="material-action is-primary" type="button" data-recovery-action="recover">\u6062\u590D\u7EC3\u4E60</button>
        <button class="material-action" type="button" data-recovery-action="dismiss">\u6682\u4E0D\u6062\u590D</button>
      </div>
    </aside>`;
  }
  function renderTypingLegacyResumeHintBanner(hint) {
    const whitespace = [
      hint.whitespace.skipEmptyLines ? "\u8DF3\u8FC7\u7A7A\u884C" : "\u4FDD\u7559\u7A7A\u884C",
      hint.whitespace.ignoreAllSpaces ? "\u5FFD\u7565\u5168\u90E8\u7A7A\u683C" : hint.whitespace.trimLeadingSpaces && hint.whitespace.trimTrailingSpaces ? "\u5FFD\u7565\u884C\u9996\u5C3E\u7A7A\u683C" : hint.whitespace.trimLeadingSpaces ? "\u5FFD\u7565\u884C\u9996\u7A7A\u683C" : hint.whitespace.trimTrailingSpaces ? "\u5FFD\u7565\u884C\u5C3E\u7A7A\u683C" : "\u4E25\u683C\u5339\u914D\u7A7A\u683C"
    ].join(" \xB7 ");
    const availability = hint.sourceAvailable ? "\u6765\u6E90\u5DF2\u5728\u65B0\u7248\u4E66\u67B6\u4E2D\u627E\u5230\u3002" : "\u6765\u6E90\u5F53\u524D\u4E0D\u53EF\u7528\uFF1B\u53EF\u5FFD\u7565\u6B64\u63D0\u793A\uFF0C\u6216\u5148\u5728\u4E66\u67B6\u91CD\u65B0\u5BFC\u5165\u3002";
    return `
    <aside class="recovery-banner legacy-resume-banner" role="status" aria-labelledby="legacy-resume-title">
      <h2 id="legacy-resume-title">\u53D1\u73B0\u65E7\u7248\u7EC3\u4E60\u8BBE\u7F6E</h2>
      <p>\u201C${escapeHtml(hint.sourceTitle)}\u201D\u66FE\u7EC3\u4E60\u5230\u7B2C ${hint.physicalLineNumber} \u884C\u9644\u8FD1\u3002${availability}</p>
      <p class="fact-note">${escapeHtml(whitespace)}\u3002\u8FC1\u79FB\u540E\u8BF7\u5728\u8BBE\u7F6E\u9875\u786E\u8BA4\u8303\u56F4\u548C\u89C4\u5219\uFF0C\u518D\u5F00\u59CB\u65B0\u7EC3\u4E60\uFF1B\u4E0D\u4F1A\u751F\u6210\u65E7\u6210\u7EE9\u3002</p>
      <div class="material-actions" role="group" aria-label="\u65E7\u7248\u7EC3\u4E60\u8BBE\u7F6E\u5904\u7406\u65B9\u5F0F">
        ${hint.sourceAvailable ? '<button class="material-action is-primary" type="button" data-legacy-resume-action="resume">\u8FC1\u79FB\u5230\u65B0\u7248\u8BBE\u7F6E</button>' : ""}
        <button class="material-action" type="button" data-legacy-resume-action="dismiss">\u5FFD\u7565\u65E7\u7EC3\u4E60</button>
      </div>
    </aside>`;
  }
  function renderTypingPageContent(content) {
    if (content.kind === "unavailable") {
      return '<p class="empty-guidance">\u8BE5\u9875\u9762\u7684\u6570\u636E\u67E5\u8BE2\u5C1A\u672A\u52A0\u8F7D\u3002</p>';
    }
    if (content.kind === "sessionConflict") {
      return `
      <section class="session-conflict" aria-labelledby="session-conflict-title">
        <h3 id="session-conflict-title">\u5DF2\u6709\u6D3B\u52A8\u7EC3\u4E60</h3>
        <p>\u5F53\u524D\u7EC3\u4E60\u5904\u4E8E\u201C${sessionStatusLabel(content.status)}\u201D\u72B6\u6001\u3002\u9009\u62E9\u5982\u4F55\u7EE7\u7EED\uFF1BMoyuPlus \u4E0D\u4F1A\u81EA\u52A8\u8986\u76D6\u5B83\u3002</p>
        <div class="material-actions" role="group" aria-label="\u6D3B\u52A8\u7EC3\u4E60\u5904\u7406\u65B9\u5F0F">
          <button class="material-action is-primary" type="button" data-conflict-resolution="returnCurrent">\u8FD4\u56DE\u5F53\u524D\u7EC3\u4E60</button>
          <button class="material-action" type="button" data-conflict-resolution="finishAndStart">\u7ED3\u675F\u5F53\u524D\u7EC3\u4E60\u5E76\u65B0\u5EFA</button>
          <button class="material-action" type="button" data-conflict-resolution="cancel">\u53D6\u6D88</button>
        </div>
      </section>`;
    }
    if (content.kind === "live") {
      return renderLive(content);
    }
    if (content.kind === "result") {
      return renderResult(content);
    }
    if (content.kind === "recent") {
      return renderRecent(content);
    }
    if (content.kind === "history") {
      return renderHistory(content);
    }
    if (content.kind === "mastery") {
      return renderMastery(content);
    }
    if (content.kind === "setup") {
      return renderSetup(content);
    }
    return `
    <section class="materials-page" aria-label="\u7EC3\u4E60\u7D20\u6750">
      ${renderMaterialActions(content.actions)}
      ${renderMaterialSection(
      "\u6211\u7684\u7D20\u6750",
      content.library,
      "\u7C98\u8D34\u4E00\u6BB5\u6587\u5B57\uFF0C\u6216\u5BFC\u5165 TXT / EPUB\uFF0C\u521B\u5EFA\u7B2C\u4E00\u4EFD\u81EA\u5DF1\u7684\u7EC3\u4E60\u7D20\u6750\u3002"
    )}
    </section>`;
  }
  function renderRecent(content) {
    if (content.items.length === 0) {
      return '<p class="empty-guidance">\u8FD8\u6CA1\u6709\u6700\u8FD1\u7EC3\u4E60\u3002\u5B8C\u6210\u4E00\u6B21\u7EC3\u4E60\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u6700\u8FD1 20 \u6761\u53EA\u8BFB\u6458\u8981\u3002</p>';
    }
    return `
    <section class="facts-page" aria-label="\u6700\u8FD1\u7EC3\u4E60">
      <h3>\u6700\u8FD1\u7EC3\u4E60</h3>
      <ol class="fact-list">
        ${content.items.map(
      (item) => `
          <li>
            <div>
              <strong>${escapeHtml(item.materialId ?? item.profileKey)}</strong>
              <span>${formatDateTime(item.endedAt)}</span>
            </div>
            <span>${formatMetric(item.effectiveCpm)} \u6709\u6548 CPM \xB7 ${formatMetric(item.accuracy)}% \xB7 ${formatDuration(item.activeElapsedMs)}</span>
          </li>`
    ).join("")}
      </ol>
    </section>`;
  }
  function renderResult(content) {
    const result = content.result;
    if (!result) {
      return '<p class="empty-guidance">\u8FD8\u6CA1\u6709\u7EC3\u4E60\u7ED3\u679C\u3002\u5B8C\u6210\u4E00\u6B21\u7EC3\u4E60\u540E\uFF0C\u6458\u8981\u548C\u9519\u8BEF\u6392\u884C\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002</p>';
    }
    const benchmark = content.benchmarkBest ? `<p class="fact-note">${content.benchmarkBest.isCurrentResult ? "\u8FD9\u662F\u5F53\u524D\u57FA\u51C6\u4E0B\u7684\u6700\u4F73\u6210\u7EE9\u3002" : `\u5386\u53F2\u6700\u4F73\uFF1A${formatMetric(content.benchmarkBest.effectiveCpm)} \u6709\u6548 CPM\uFF0C\u51C6\u786E\u7387 ${formatMetric(content.benchmarkBest.accuracy)}%\u3002`}</p>` : "";
    const errorPairs = result.errorPairs.length > 0 ? `<ol class="fact-list">${result.errorPairs.map(
      (item) => `
        <li><span>${escapeHtml(item.expected)} \u2192 ${escapeHtml(item.actual || "\u2205")}</span><strong>${item.count} \u6B21</strong></li>`
    ).join("")}</ol>` : '<p class="material-empty">\u6CA1\u6709\u5B57\u7B26\u9519\u8BEF\u3002</p>';
    const errorWords = result.errorWords.length > 0 ? `<ol class="fact-list">${result.errorWords.map(
      (item) => `
        <li><span>${escapeHtml(item.word)}</span><strong>${item.count} \u6B21</strong></li>`
    ).join("")}</ol>` : '<p class="material-empty">\u6CA1\u6709\u9519\u8BCD\u8BB0\u5F55\u3002</p>';
    return `
    <section class="result-page" aria-label="\u672C\u6B21\u7EC3\u4E60\u7ED3\u679C">
      <p class="fact-note">${escapeHtml(outcomeLabel(result.outcome))} \xB7 ${formatDateTime(result.endedAt)}</p>
      <dl class="live-metrics result-metrics">
        <div><dt>\u51C6\u786E\u7387</dt><dd>${formatMetric(result.metrics.accuracy)}%</dd></div>
        <div><dt>\u6709\u6548 CPM</dt><dd>${formatMetric(result.metrics.effectiveCpm)}</dd></div>
        <div><dt>\u539F\u59CB CPM</dt><dd>${formatMetric(result.metrics.rawCpm)}</dd></div>
        <div><dt>\u6D3B\u52A8\u65F6\u95F4</dt><dd>${formatDuration(result.activeElapsedMs)}</dd></div>
        <div><dt>\u5B8C\u6210\u5355\u5143</dt><dd>${result.metrics.completedUnits}</dd></div>
        <div><dt>\u6700\u957F\u8FDE\u7EED\u6B63\u786E</dt><dd>${result.metrics.longestCorrectStreak}</dd></div>
      </dl>
      ${benchmark}
      <section class="fact-section">
        <h3>\u5B57\u7B26\u9519\u8BEF\u6392\u884C</h3>
        ${errorPairs}
      </section>
      <section class="fact-section">
        <h3>\u9519\u8BCD\u6392\u884C</h3>
        ${errorWords}
      </section>
      <p class="fact-note">\u901F\u5EA6\u66F2\u7EBF\u5305\u542B ${result.speedBuckets.length} \u4E2A 10 \u79D2\u6876\u3002</p>
    </section>`;
  }
  function renderHistory(content) {
    const totalPages = Math.max(1, Math.ceil(content.totalItems / content.pageSize));
    const days = content.days.length > 0 ? `<ul class="history-days">${content.days.map(
      (day) => `
        <li>
          <strong>${escapeHtml(day.date)}</strong>
          <span>${day.resultCount} \u6B21 \xB7 ${formatDuration(day.activeElapsedMs)} \xB7 ${day.correctAttempts} \u6B63\u786E / ${day.errorAttempts} \u9519\u8BEF</span>
        </li>`
    ).join("")}</ul>` : '<p class="material-empty">\u6682\u65E0\u65E5\u7EDF\u8BA1\u3002</p>';
    return `
    <section class="history-page" aria-label="\u7EC3\u4E60\u5386\u53F2">
      <div class="history-toolbar">
        <div>
          <h3>\u8BB0\u5F55\u7BA1\u7406</h3>
          <p class="fact-note">\u6E05\u7406\u540E\u4F1A\u540C\u65F6\u79FB\u9664\u5386\u53F2\u3001\u6BCF\u65E5\u7EDF\u8BA1\u548C\u9519\u9898\u5F3A\u5316\u6570\u636E\u3002</p>
        </div>
        <button
          class="material-action danger-action"
          type="button"
          data-clear-practice-history
          ${content.totalItems === 0 ? "disabled" : ""}
        >\u6E05\u7406\u5168\u90E8\u8BB0\u5F55</button>
      </div>
      ${content.totalItems === 0 ? '<p class="empty-guidance">\u8FD8\u6CA1\u6709\u53EF\u663E\u793A\u7684\u7EC3\u4E60\u5386\u53F2\u3002</p>' : ""}
      <section class="fact-section">
        <h3>\u6700\u8FD1\u65E5\u7EDF\u8BA1</h3>
        ${days}
      </section>
      <section class="fact-section">
        <h3>\u6210\u7EE9\u8BB0\u5F55</h3>
        <p class="fact-note">\u7B2C ${content.page} \u9875 / \u5171 ${totalPages} \u9875 \xB7 \u6BCF\u9875 ${content.pageSize} \u6761</p>
        ${content.items.length > 0 ? `<ol class="history-list">${content.items.map(
      (item) => `
          <li>
            <div>
              <strong>${formatDateTime(item.endedAt)}</strong>
              <span>${escapeHtml(outcomeLabel(item.outcome))}</span>
            </div>
            <span>${formatMetric(item.metrics.effectiveCpm)} \u6709\u6548 CPM \xB7 ${formatMetric(item.metrics.accuracy)}%</span>
          </li>`
    ).join("")}</ol>` : '<p class="material-empty">\u6682\u65E0\u6210\u7EE9\u8BB0\u5F55\u3002</p>'}
      </section>
    </section>`;
  }
  function renderMastery(content) {
    if (content.totalEntries === 0) {
      return '<p class="empty-guidance">\u8FD8\u6CA1\u6709\u9700\u8981\u5F3A\u5316\u7684\u9519\u5B57\u6216\u9519\u8BCD\u3002</p>';
    }
    return `
    <section class="mastery-page" aria-label="\u9519\u5B57\u4E0E\u9519\u8BCD\u5F3A\u5316">
      <p class="fact-note">\u6309\u5F53\u524D\u638C\u63E1\u5EA6\u5206\u6570\u6392\u5217\uFF0C\u5171 ${content.totalEntries} \u9879\u3002</p>
      <ol class="mastery-list">${content.entries.map(
      (entry) => `
        <li>
          <div>
            <strong>${escapeHtml(entry.key)}</strong>
            <span>${escapeHtml(masteryKindLabel(entry.kind))}</span>
          </div>
          <span>\u9519\u8BEF ${entry.wrongCount} \u6B21 \xB7 \u5F3A\u5316\u8FDE\u7EED\u6B63\u786E ${entry.reinforcementCorrectStreak} \u6B21</span>
        </li>`
    ).join("")}</ol>
    </section>`;
  }
  function renderSetup(content) {
    const completion = content.plan.completion;
    return `
    <section class="setup-page" aria-label="\u672C\u6B21\u7EC3\u4E60\u8BBE\u7F6E">
      <div class="setup-source">
        <p class="setup-source-label">\u5F53\u524D\u7D20\u6750</p>
        <h3>${escapeHtml(content.source.title)}</h3>
        <p>${escapeHtml(profileLabels[content.source.profileKey] ?? content.source.profileKey)} \xB7 ${content.source.counts.printableUnits} \u4E2A\u53EF\u6253\u5370\u5355\u5143</p>
      </div>
      <form class="setup-form" data-setup-form>
        <fieldset>
          <legend>\u5185\u5BB9\u8303\u56F4</legend>
          <label>
            \u8303\u56F4
            <select name="range">
              ${content.ranges.map(
      (item, index) => `
                <option value="${index}"${sameRange2(item.range, content.selectedRange) ? " selected" : ""}>${escapeHtml(item.label)}</option>`
    ).join("")}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>\u5B8C\u6210\u6761\u4EF6</legend>
          <label>
            \u7C7B\u578B
            <select name="completionKind">
              ${option("sourceRange", "\u5B8C\u6210\u6240\u9009\u8303\u56F4", completion.kind)}
              ${option("timed", "\u9650\u65F6", completion.kind)}
              ${option("length", "\u5B9A\u957F", completion.kind)}
              ${option("free", "\u81EA\u7531\u7EC3\u4E60", completion.kind)}
            </select>
          </label>
          <label>
            \u9650\u65F6\u79D2\u6570
            <input name="completionSeconds" type="number" min="1" step="1" value="${completion.kind === "timed" ? completion.seconds : 180}">
          </label>
          <label>
            \u76EE\u6807\u5355\u5143\u6570
            <input name="completionUnits" type="number" min="1" step="1" value="${completion.kind === "length" ? completion.targetUnits : 100}">
          </label>
        </fieldset>
        <fieldset>
          <legend>\u5224\u5B9A</legend>
          <label>
            \u9519\u8BEF\u5904\u7406
            <select name="errorPolicy">
              ${option("block", "\u5FC5\u987B\u4FEE\u6B63", content.plan.evaluation.errorPolicy)}
              ${option("allowSkip", "\u5141\u8BB8\u8DF3\u9519", content.plan.evaluation.errorPolicy)}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>\u6587\u672C</legend>
          <label>
            \u6807\u70B9
            <select name="punctuationMode">
              ${option("strict", "\u4E25\u683C\u5339\u914D", content.plan.textPolicy.punctuation.mode)}
              ${option("equivalent", "\u4E2D\u6587\u6807\u70B9\u7B49\u4EF7", content.plan.textPolicy.punctuation.mode)}
            </select>
          </label>
          <label>
            \u7A7A\u767D
            <select name="whitespaceMode">
              ${option("strict", "\u4E25\u683C\u5339\u914D", content.plan.textPolicy.whitespace.mode)}
              ${option("trimLineEdges", "\u5FFD\u7565\u884C\u9996\u5C3E", content.plan.textPolicy.whitespace.mode)}
              ${option("collapse", "\u5408\u5E76\u8FDE\u7EED\u7A7A\u767D", content.plan.textPolicy.whitespace.mode)}
              ${option("ignore", "\u5FFD\u7565\u7A7A\u767D", content.plan.textPolicy.whitespace.mode)}
            </select>
          </label>
          ${checkbox("caseSensitive", "\u533A\u5206\u5927\u5C0F\u5199", content.plan.textPolicy.caseSensitive)}
        </fieldset>
        <fieldset>
          <legend>\u63A8\u8FDB\u4E0E\u663E\u793A</legend>
          <label>
            \u6362\u884C\u63A8\u8FDB
            <select name="lineAdvance">
              ${option("automatic", "\u81EA\u52A8\u63A8\u8FDB", content.plan.flowPolicy.lineAdvance)}
              ${option("enter", "\u6309 Enter \u63A8\u8FDB", content.plan.flowPolicy.lineAdvance)}
            </select>
          </label>
          <label>
            \u5448\u73B0\u65B9\u5F0F
            <select name="presentation">
              ${option("continuous", "\u8FDE\u7EED\u6EDA\u52A8", content.plan.flowPolicy.presentation)}
              ${option("lineFocus", "\u9010\u884C\u805A\u7126", content.plan.flowPolicy.presentation)}
            </select>
          </label>
          ${checkbox("showLiveMetrics", "\u663E\u793A\u5B9E\u65F6\u6307\u6807", content.plan.displayPolicy.showLiveMetrics)}
          ${checkbox("showWhitespace", "\u663E\u793A\u7A7A\u767D\u7B26", content.plan.displayPolicy.showWhitespace)}
        </fieldset>
        <div class="setup-actions" role="group" aria-label="\u7EC3\u4E60\u8BBE\u7F6E\u64CD\u4F5C">
          <button class="material-action is-primary" type="submit" data-start-practice>\u4FDD\u5B58\u5E76\u5F00\u59CB\u7EC3\u4E60</button>
          <button class="material-action" type="button" data-save-setup-defaults>\u8BBE\u4E3A\u9ED8\u8BA4</button>
          <button class="material-action" type="button" data-open-practice-editor-settings>\u7F16\u8F91\u7EC3\u4E60\u5B57\u4F53\u4E0E\u5916\u89C2</button>
        </div>
        <p class="setup-defaults-note">\u201C\u8BBE\u4E3A\u9ED8\u8BA4\u201D\u53EA\u4FDD\u5B58\u5224\u5B9A\u3001\u6587\u672C\u3001\u63A8\u8FDB\u4E0E\u663E\u793A\u7B56\u7565\uFF1B\u672C\u6B21\u7D20\u6750\u8303\u56F4\u548C\u5B8C\u6210\u6761\u4EF6\u4E0D\u4F1A\u5199\u5165\u5168\u5C40\u9ED8\u8BA4\u3002</p>
      </form>
    </section>`;
  }
  function renderMaterialActions(actions) {
    const buttons = [
      actions.paste ? '<button class="material-action is-primary" type="button" data-action="paste">\u81EA\u7531\u7C98\u8D34</button>' : "",
      actions.importTxt ? '<button class="material-action" type="button" data-action="importTxt">\u5BFC\u5165 TXT</button>' : "",
      actions.importEpub ? '<button class="material-action" type="button" data-action="importEpub">\u5BFC\u5165 EPUB</button>' : ""
    ].filter(Boolean);
    if (buttons.length === 0) return "";
    return `
    <div class="material-actions" role="group" aria-label="\u6DFB\u52A0\u7EC3\u4E60\u7D20\u6750">
      ${buttons.join("")}
    </div>
    ${actions.paste ? `
      <form class="paste-composer" data-paste-form hidden>
        <label for="typing-paste-content">\u7C98\u8D34\u7EC3\u4E60\u5185\u5BB9</label>
        <textarea
          id="typing-paste-content"
          name="text"
          rows="7"
          maxlength="400000"
          placeholder="\u5728\u8FD9\u91CC\u7C98\u8D34\u8981\u7EC3\u4E60\u7684\u6587\u5B57"
          required
        ></textarea>
        <div class="paste-actions">
          <button class="material-action is-primary" type="submit">\u5F00\u59CB\u8BBE\u7F6E</button>
          <button class="material-action" type="button" data-action="cancelPaste">\u53D6\u6D88</button>
        </div>
      </form>` : ""}`;
  }
  function renderLive(content) {
    const controls = [
      content.controls.pause ? '<button class="material-action is-primary" type="button" data-live-action="pause">\u6682\u505C</button>' : "",
      content.controls.resume ? '<button class="material-action is-primary" type="button" data-live-action="resume">\u7EE7\u7EED</button>' : "",
      content.controls.restart ? '<button class="material-action" type="button" data-live-action="restart">\u91CD\u65B0\u5F00\u59CB</button>' : "",
      content.controls.finish ? '<button class="material-action" type="button" data-live-action="finish">\u7ED3\u675F\u7EC3\u4E60</button>' : ""
    ].filter(Boolean);
    const facts = content.progress && content.metrics ? `
      <div class="live-progress">
        <strong>${content.progress.completedUnits} / ${content.progress.totalUnits}</strong>
        <span>\u5DF2\u5B8C\u6210\u76EE\u6807</span>
      </div>
      <dl class="live-metrics">
        <div><dt>\u51C6\u786E\u7387</dt><dd>${formatMetric(content.metrics.accuracy)}%</dd></div>
        <div><dt>\u6709\u6548 CPM</dt><dd>${formatMetric(content.metrics.effectiveCpm)}</dd></div>
        <div><dt>\u539F\u59CB CPM</dt><dd>${formatMetric(content.metrics.rawCpm)}</dd></div>
        <div><dt>\u6D3B\u52A8\u65F6\u95F4</dt><dd>${formatDuration(content.metrics.activeElapsedMs)}</dd></div>
      </dl>` : '<p class="live-state" role="status">\u7EC3\u4E60\u4E2D</p>';
    return `
    <section class="live-page" aria-label="\u5B9E\u65F6\u7EC3\u4E60\u72B6\u6001">
      ${facts}
      <div class="material-actions" role="group" aria-label="\u7EC3\u4E60\u63A7\u5236">
        ${controls.join("")}
      </div>
    </section>`;
  }
  function renderMaterialSection(title, materials, emptyGuidance) {
    return `
    <section class="material-section">
      <h3>${title} <span class="section-count">${materials.length}</span></h3>
      ${materials.length > 0 ? `<ul class="material-list">${materials.map(renderMaterial).join("")}</ul>` : `<p class="material-empty">${escapeHtml(emptyGuidance || "\u6682\u65E0\u53EF\u7528\u7D20\u6750\u3002")}</p>`}
    </section>`;
  }
  function renderMaterial(material) {
    const profile = profileLabels[material.profileKey] ?? (material.profileKey.startsWith("code.") ? `\u4EE3\u7801 \xB7 ${material.profileKey.slice("code.".length)}` : material.profileKey);
    const tags = material.tags.length > 0 ? `<p class="material-tags">${material.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</p>` : "";
    const sourceNotice = material.sourceNotice ? `<p class="source-notice">${escapeHtml(material.sourceNotice.license)} \xB7 ${escapeHtml(material.sourceNotice.attribution)}</p>` : "";
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
        <span class="material-meta">${material.counts.printableUnits} \u4E2A\u53EF\u6253\u5370\u5355\u5143 \xB7 ${formatEstimate(material.estimatedSeconds)}</span>
        <span class="material-origin">${originLabels[material.origin]}</span>
      </button>
      ${tags}
      ${sourceNotice}
    </li>`;
  }
  function formatEstimate(seconds) {
    if (seconds < 60) return `\u7EA6 ${seconds} \u79D2`;
    return `\u7EA6 ${Math.ceil(seconds / 60)} \u5206\u949F`;
  }
  function option(value, label, selectedValue) {
    return `<option value="${value}"${value === selectedValue ? " selected" : ""}>${label}</option>`;
  }
  function checkbox(name, label, checked) {
    return `<label class="setup-checkbox"><input type="checkbox" name="${name}"${checked ? " checked" : ""}> ${label}</label>`;
  }
  function sameRange2(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function sessionStatusLabel(status) {
    if (status === "ready") return "\u51C6\u5907\u5F00\u59CB";
    if (status === "running") return "\u7EC3\u4E60\u4E2D";
    if (status === "blockedOnError") return "\u7B49\u5F85\u4FEE\u6B63";
    return "\u5DF2\u6682\u505C";
  }
  function formatMetric(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1e3);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function outcomeLabel(outcome) {
    if (outcome === "completed") return "\u5DF2\u5B8C\u6210";
    if (outcome === "timedOut") return "\u9650\u65F6\u7ED3\u675F";
    if (outcome === "restarted") return "\u5DF2\u91CD\u65B0\u5F00\u59CB";
    return "\u5DF2\u7ED3\u675F";
  }
  function masteryKindLabel(kind) {
    if (kind === "grapheme") return "\u5B57\u7B26";
    if (kind === "word") return "\u8BCD\u8BED";
    return "\u4EE3\u7801\u8BCD\u5143";
  }

  // src/webview/typingSetupForm.ts
  function createTypingSetupConfiguration(content, values) {
    const rangeIndex = Number(values.range);
    if (!Number.isSafeInteger(rangeIndex) || rangeIndex < 0) return void 0;
    const selectedRange = content.ranges[rangeIndex]?.range;
    if (!selectedRange) return void 0;
    const completionKind = values.completionKind ?? content.plan.completion.kind;
    const punctuationMode = values.punctuationMode === "equivalent" ? "equivalent" : values.punctuationMode === "strict" ? "strict" : content.plan.textPolicy.punctuation.mode;
    return {
      selectedRange: structuredClone(selectedRange),
      plan: {
        completion: completionFor(
          completionKind,
          selectedRange,
          values,
          content.plan.completion
        ),
        evaluation: {
          errorPolicy: values.errorPolicy === "allowSkip" ? "allowSkip" : values.errorPolicy === "block" ? "block" : content.plan.evaluation.errorPolicy
        },
        textPolicy: {
          punctuation: {
            mode: punctuationMode,
            mappingVersion: punctuationMode === "equivalent" ? "zh-punctuation-v1" : "strict-v1"
          },
          whitespace: {
            mode: whitespaceMode(
              values.whitespaceMode,
              content.plan.textPolicy.whitespace.mode
            )
          },
          caseSensitive: values.caseSensitive ?? content.plan.textPolicy.caseSensitive
        },
        flowPolicy: {
          lineAdvance: values.lineAdvance === "enter" ? "enter" : values.lineAdvance === "automatic" ? "automatic" : content.plan.flowPolicy.lineAdvance,
          presentation: values.presentation === "lineFocus" ? "lineFocus" : values.presentation === "continuous" ? "continuous" : content.plan.flowPolicy.presentation
        },
        displayPolicy: {
          showLiveMetrics: values.showLiveMetrics ?? content.plan.displayPolicy.showLiveMetrics,
          showWhitespace: values.showWhitespace ?? content.plan.displayPolicy.showWhitespace
        }
      }
    };
  }
  function completionFor(kind, range, values, fallback) {
    if (kind === "timed") {
      return {
        kind,
        seconds: positiveInteger(
          values.completionSeconds,
          fallback.kind === "timed" ? fallback.seconds : 180
        )
      };
    }
    if (kind === "length") {
      return {
        kind,
        targetUnits: positiveInteger(
          values.completionUnits,
          fallback.kind === "length" ? fallback.targetUnits : 100
        )
      };
    }
    if (kind === "sourceRange") {
      if (range.kind === "article") {
        return { kind, range: "article" };
      }
      if (range.kind === "chapter") {
        return { kind, range: "chapter" };
      }
      if (range.kind === "selection") {
        return { kind, range: "selection" };
      }
    }
    return { kind: "free" };
  }
  function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
  function whitespaceMode(value, fallback) {
    return value === "strict" || value === "collapse" || value === "ignore" || value === "trimLineEdges" ? value : fallback;
  }

  // src/webview/typingApp.ts
  var vscode = window.acquireVsCodeApi?.();
  var app = document.querySelector("#app");
  var instanceId = `typing-${crypto.randomUUID().replace(/-/g, "")}`;
  var state = createTypingViewState(instanceId);
  var clientRevision = 0;
  var pasteComposerOpen = false;
  var pasteDraft = "";
  var pageCopy = {
    materials: {
      label: "\u7D20\u6750",
      title: "\u9009\u62E9\u7EC3\u4E60\u5185\u5BB9",
      description: "\u4ECE\u81EA\u5B9A\u4E49\u7D20\u6750\u3001\u5BFC\u5165\u5185\u5BB9\u6216\u81EA\u7531\u7EC3\u4E60\u5F00\u59CB\u3002"
    },
    recent: {
      label: "\u6700\u8FD1",
      title: "\u7EE7\u7EED\u6700\u8FD1\u7EC3\u4E60",
      description: "\u6700\u8FD1\u7ED3\u679C\u548C\u4F7F\u7528\u8FC7\u7684\u6765\u6E90\u4F1A\u6309\u65F6\u95F4\u6392\u5217\u3002"
    },
    setup: {
      label: "\u8BBE\u7F6E",
      title: "\u8BBE\u7F6E\u672C\u6B21\u7EC3\u4E60",
      description: "\u9009\u62E9\u8303\u56F4\u3001\u5B8C\u6210\u6761\u4EF6\u3001\u5224\u5B9A\u65B9\u5F0F\u548C\u63A8\u8FDB\u7B56\u7565\u3002"
    },
    live: {
      label: "\u8FDB\u884C\u4E2D",
      title: "\u7EC3\u4E60\u8FDB\u884C\u4E2D",
      description: "\u5728\u7F16\u8F91\u5668\u4E2D\u8F93\u5165\uFF1B\u8FD9\u91CC\u63D0\u4F9B\u4F1A\u8BDD\u72B6\u6001\u548C\u63A7\u5236\u547D\u4EE4\u3002"
    },
    result: {
      label: "\u7ED3\u679C",
      title: "\u672C\u6B21\u7ED3\u679C",
      description: "\u67E5\u770B\u6458\u8981\u3001\u901F\u5EA6\u53D8\u5316\u3001\u9519\u8BEF\u6392\u884C\u548C\u5386\u53F2\u6BD4\u8F83\u3002"
    },
    history: {
      label: "\u5386\u53F2",
      title: "\u7EC3\u4E60\u5386\u53F2",
      description: "\u6309\u65F6\u95F4\u67E5\u770B\u7EC3\u4E60\u8BB0\u5F55\u548C\u65E5\u3001\u5468\u7EDF\u8BA1\u3002"
    },
    mastery: {
      label: "\u5F3A\u5316",
      title: "\u9519\u5B57\u4E0E\u9519\u8BCD",
      description: "\u4ECE\u53CD\u590D\u51FA\u9519\u7684\u5185\u5BB9\u751F\u6210\u53EF\u590D\u73B0\u7684\u5F3A\u5316\u7EC3\u4E60\u3002"
    }
  };
  var sessionLabels = {
    ready: "\u51C6\u5907\u5F00\u59CB",
    running: "\u7EC3\u4E60\u4E2D",
    blockedOnError: "\u7B49\u5F85\u4FEE\u6B63",
    paused: "\u5DF2\u6682\u505C",
    completed: "\u5DF2\u5B8C\u6210",
    abandoned: "\u5DF2\u7ED3\u675F"
  };
  vscode?.postMessage({
    protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
    instanceId,
    type: "typingReady"
  });
  render();
  window.addEventListener("message", (event) => {
    const next = reduceTypingViewMessage(state, event.data);
    if (next === state) return;
    state = next;
    if (state.activePage !== "materials") {
      pasteComposerOpen = false;
      pasteDraft = "";
    }
    render();
  });
  function render() {
    if (!app) return;
    const focusedPage = app.querySelector(
      ".page-tab:focus"
    )?.dataset.page;
    const copy = pageCopy[state.activePage];
    const session = state.activeSessionStatus ? `<span class="session-state" role="status" aria-live="polite">${sessionLabels[state.activeSessionStatus]}</span>` : '<span class="session-state is-idle" role="status" aria-live="polite">\u65E0\u6D3B\u52A8\u7EC3\u4E60</span>';
    const pending = state.pendingResultCount > 0 ? `<p class="pending-notice" role="status">\u5F85\u4FDD\u5B58\u6210\u7EE9\uFF1A${state.pendingResultCount}</p>` : "";
    const loading = state.snapshotRevision === 0 ? '<p class="loading-state" role="status">\u6B63\u5728\u8BFB\u53D6\u7EC3\u4E60\u72B6\u6001\u2026</p>' : "";
    const content = state.content ? renderTypingPageContent(state.content) : '<p class="empty-guidance">\u6B63\u5728\u51C6\u5907\u9875\u9762\u5185\u5BB9\u2026</p>';
    const recovery = state.recovery ? renderTypingRecoveryBanner(state.recovery) : "";
    const legacyResume = state.legacyResumeHint ? renderTypingLegacyResumeHintBanner(state.legacyResumeHint) : "";
    app.innerHTML = `
    <section class="typing-shell" aria-label="MoyuPlus \u6253\u5B57\u7EC3\u4E60">
      <header class="typing-header">
        <div>
          <p class="eyebrow">MOYUPLUS</p>
          <h1>\u6253\u5B57\u7EC3\u4E60</h1>
        </div>
        ${session}
      </header>
      <nav class="page-navigation" aria-label="\u6253\u5B57\u7EC3\u4E60\u9875\u9762">
        ${TYPING_VIEW_PAGES.map((page) => {
      const available = state.availablePages.includes(page);
      const current = page === state.activePage;
      return `<button
            class="page-tab${current ? " is-current" : ""}"
            type="button"
            data-page="${page}"
            ${current ? 'aria-current="page"' : ""}
            ${available ? "" : "disabled"}
          >${pageCopy[page].label}</button>`;
    }).join("")}
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
    app.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.dataset.page;
        if (!page || page === state.activePage || !state.availablePages.includes(page)) return;
        vscode?.postMessage({
          protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
          instanceId,
          type: "navigate",
          requestId: `navigate-${Date.now()}-${++clientRevision}`,
          clientRevision,
          page
        });
      });
    });
    app.querySelectorAll("[data-material-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const encodedId = button.dataset.materialId;
        const materialOrigin = button.dataset.materialOrigin;
        if (!encodedId || !materialOrigin) return;
        let materialId;
        try {
          materialId = decodeURIComponent(encodedId);
        } catch {
          return;
        }
        postRequest({
          type: "selectMaterial",
          materialId,
          materialOrigin
        });
      });
    });
    app.querySelector('[data-action="paste"]')?.addEventListener("click", () => {
      pasteComposerOpen = !pasteComposerOpen;
      render();
      if (pasteComposerOpen) {
        app.querySelector("#typing-paste-content")?.focus();
      }
    });
    app.querySelector('[data-action="cancelPaste"]')?.addEventListener("click", () => {
      pasteComposerOpen = false;
      pasteDraft = "";
      render();
    });
    app.querySelector('[data-action="importTxt"]')?.addEventListener("click", () => postRequest({
      type: "importMaterial",
      format: "txt"
    }));
    app.querySelector('[data-action="importEpub"]')?.addEventListener("click", () => postRequest({
      type: "importMaterial",
      format: "epub"
    }));
    const pasteForm = app.querySelector("[data-paste-form]");
    const pasteInput = pasteForm?.elements.namedItem("text");
    if (pasteForm && pasteInput) {
      pasteForm.hidden = !pasteComposerOpen;
      pasteInput.value = pasteDraft;
      pasteInput.addEventListener("input", () => {
        pasteDraft = pasteInput.value;
      });
      pasteForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!pasteInput.reportValidity()) return;
        pasteDraft = pasteInput.value;
        postRequest({
          type: "usePastedText",
          text: pasteDraft
        });
      });
    }
    const setupForm = app.querySelector("[data-setup-form]");
    if (setupForm && state.content?.kind === "setup") {
      const setupContent = state.content;
      const currentConfiguration = () => {
        if (!setupForm.reportValidity()) return;
        const data = new FormData(setupForm);
        return createTypingSetupConfiguration(setupContent, {
          range: String(data.get("range")),
          completionKind: String(data.get("completionKind")),
          completionSeconds: String(data.get("completionSeconds")),
          completionUnits: String(data.get("completionUnits")),
          errorPolicy: String(data.get("errorPolicy")),
          punctuationMode: String(data.get("punctuationMode")),
          whitespaceMode: String(data.get("whitespaceMode")),
          caseSensitive: data.has("caseSensitive"),
          lineAdvance: String(data.get("lineAdvance")),
          presentation: String(data.get("presentation")),
          showLiveMetrics: data.has("showLiveMetrics"),
          showWhitespace: data.has("showWhitespace")
        });
      };
      setupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const configuration = currentConfiguration();
        if (!configuration) return;
        postRequest({
          type: "startPractice",
          ...configuration
        });
      });
      setupForm.querySelector("[data-save-setup-defaults]")?.addEventListener("click", () => {
        const configuration = currentConfiguration();
        if (!configuration) return;
        postRequest({
          type: "saveSetupAsDefault",
          ...configuration
        });
      });
      setupForm.querySelector("[data-open-practice-editor-settings]")?.addEventListener("click", () => {
        postRequest({ type: "openPracticeEditorSettings" });
      });
    }
    app.querySelectorAll("[data-conflict-resolution]").forEach((button) => {
      button.addEventListener("click", () => {
        const resolution = button.dataset.conflictResolution;
        if (resolution !== "returnCurrent" && resolution !== "finishAndStart" && resolution !== "cancel") return;
        postRequest({
          type: "resolveSessionConflict",
          resolution
        });
      });
    });
    app.querySelectorAll("[data-live-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.liveAction;
        if (action !== "pause" && action !== "resume" && action !== "restart" && action !== "finish") return;
        postRequest({
          type: "controlPractice",
          action
        });
      });
    });
    app.querySelectorAll("[data-recovery-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.recoveryAction;
        if (action === "recover") {
          postRequest({ type: "recoverPractice" });
        } else if (action === "dismiss") {
          postRequest({ type: "dismissRecovery" });
        }
      });
    });
    app.querySelectorAll("[data-legacy-resume-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.legacyResumeAction;
        if (action === "resume") {
          postRequest({ type: "resumeLegacyPractice" });
        } else if (action === "dismiss") {
          postRequest({ type: "dismissLegacyResumeHint" });
        }
      });
    });
    app.querySelector("[data-clear-practice-history]")?.addEventListener("click", () => {
      postRequest({ type: "clearPracticeHistory" });
    });
    if (focusedPage) {
      app.querySelector(
        `.page-tab[data-page="${focusedPage}"]`
      )?.focus();
    }
  }
  function postRequest(request) {
    vscode?.postMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId,
      requestId: `${request.type}-${Date.now()}-${clientRevision + 1}`,
      clientRevision: ++clientRevision,
      ...request
    });
  }
})();
//# sourceMappingURL=typingApp.js.map
