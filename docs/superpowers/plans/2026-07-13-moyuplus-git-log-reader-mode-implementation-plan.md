# MoyuPlus Git Log Reader 模式实施计划

- 日期：2026-07-13
- 依据：[Git Log Reader 模式设计规格](../specs/2026-07-13-moyuplus-git-log-reader-mode-design.md)
- 策略：功能隔离、测试先行、持久化模式协调、即时 UI、真实 DOM 分页
- 当前状态：已实现并完成自动与人工验收，已准备发布 0.0.6

## 1. 执行原则

每项实现任务都遵循 RED → GREEN → REFACTOR：

1. 先写一个只描述目标行为的最小测试。
2. 单独运行目标测试，确认它因为能力尚不存在而正确失败。
3. 只实现使该测试通过的最小生产代码。
4. 再运行目标测试和受影响的既有测试。
5. 仅在全部绿色后整理命名、拆分和重复代码。

禁止先写生产代码再补测试。新增领域函数、Store、消息 guard、模式转换和分页行为都必须先有失败测试。

## 2. 工作树保护

当前工作树在本计划开始前已经包含大量未提交改动，其中包括 `package.json`、`src/extension.ts`、Reader/Webview 源码和测试。本功能必须在这些现状之上增量开发：

- 不执行 `git reset --hard`、`git checkout --`、`git stash` 或清理未跟踪文件。
- 开始每个 Phase 前记录目标文件当前 diff，避免覆盖既有修改。
- 修改已有脏文件时使用小范围 patch，不整文件重写。
- 不自动进行 Phase 提交；只有用户明确要求且能区分既有改动时才提交实现代码。
- 规格提交 `c479a8f`、`eb67d35` 已独立存在，不作为清理工作树的理由。
- `.superpowers/` 是设计伴侣产生的未跟踪草图目录，不纳入产品构建或实现提交。

## 3. 目标结构

计划新增以下边界清晰的模块：

```text
src/
  git/
    gitLogModels.ts
    gitLogMessages.ts
    gitLogService.ts
    gitLogModeCoordinator.ts
  storage/
    gitLogPreferencesStore.ts
    gitLogModeStore.ts
  webview/
    gitLogState.ts
    gitLogPaginator.ts
    gitLogView.ts
    readerPreferenceStyles.ts
  test/unit/
    gitLogModels.test.ts
    gitLogMessages.test.ts
    gitLogService.test.ts
    gitLogPreferencesStore.test.ts
    gitLogModeStore.test.ts
    gitLogModeCoordinator.test.ts
    gitLogWebviewState.test.ts
    gitLogViewProvider.test.ts
tests/
  fixtures/layout/
    git-log-harness.html
  layout/
    git-log-layout.spec.ts
```

最终文件名可按现有命名风格微调，但不得把 Git 查询、持久化协调器、Webview reducer 和 DOM 分页重新集中到 `ReaderViewProvider.ts` 或 `readerApp.ts` 单文件中。

## 4. Phase 0：基线与测试夹具

### Task 0.1：确认当前基线

只读检查：

- `git status --short`
- `npm run test:unit`
- `npm run test:layout`
- `npm run compile`

若基线失败，记录与本功能无关的失败，不擅自修改；只有会阻断本功能测试的既有失败才单独报告。

### Task 0.2：扩展 VS Code 测试 Shim

修改：

- `src/test/shims/vscode.ts`
- 对应 shim 使用测试

先写失败测试覆盖：

- `Uri.fsPath`、活动编辑器文档 URI 和 `workspace.getWorkspaceFolder()`。
- Webview View focus 命令能够记录并模拟 reveal/resolve。
- Memento 可注入延迟和 update 失败。
- Webview 的 hide-without-dispose、reveal、dispose 分别可观察。
- 重新创建 ExtensionContext 但复用同一 Memento，模拟 disable→enable、窗口重载和 VS Code restart。

实现只增加 Git Log 测试所需能力，不改变既有测试默认行为。

验证：

```powershell
npm run test:unit -- src/test/unit/readerViewProviderV2.test.ts src/test/unit/typingPracticeIntegration.test.ts
```

## 5. Phase 1：领域模型与持久化 Store

### Task 1.1：Git Log Preferences 模型

创建：

- `src/git/gitLogModels.ts`
- `src/test/unit/gitLogModels.test.ts`

测试先覆盖：

- 默认显示 Hash、作者、相对时间和绝对日期。
- 提交标题始终存在且不可关闭。
- `layout` 只接受 `lines | inline`，默认 `lines`。
- `maxCommits` 默认 200，并限制在 20..1000。
- 损坏、缺字段、错误类型和旧形状回退到安全默认值。
- `GitLogCommit` 只接受非空 hash/subject/author 和有限时间戳。
- 相对时间与本地绝对日期从可信时间戳生成，不解析 Git 本地化文案。

### Task 1.2：全局 Preferences Store

创建/修改：

- `src/storage/gitLogPreferencesStore.ts`
- `src/storage/storageKeys.ts`
- `src/test/unit/gitLogPreferencesStore.test.ts`

测试先覆盖：

- Key 固定为 `moyuplus.gitLogPreferences.v1`。
- 使用 `globalState` 保存，跨新实例和 workspace 保留。
- save 前规范化；损坏读值返回默认设置。
- Store 不包含提交、仓库、分支或页码。

### Task 1.3：Workspace 模式记录 Store

创建/修改：

- `src/storage/gitLogModeStore.ts`
- `src/storage/storageKeys.ts`
- `src/test/unit/gitLogModeStore.test.ts`

测试先覆盖：

- Key 固定为 `moyuplus.gitLogMode.v1`，只使用 `workspaceState`。
- 规范形状为 `{ active, resumeTarget? }`。
- `resumeTarget` 只含 bookId、规范 Locator 和 bookProgression。
- active 与 pending resumeTarget 可以独立存在。
- claim 操作先持久化清空目标，再返回一次性目标。
- claim 写入失败时不返回目标，防止重复打开。
- 新 workspace State 不继承其他 workspace 的 active。
- Store 不存 Git 提交、仓库、分支、页码、Reader DOM 或抽屉状态。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogModels.test.ts src/test/unit/gitLogPreferencesStore.test.ts src/test/unit/gitLogModeStore.test.ts
```

## 6. Phase 2：安全 Git 查询服务

### Task 2.1：可取消、有限输出的进程边界

创建：

- `src/git/gitLogService.ts`
- `src/test/unit/gitLogService.test.ts`

使用可注入 runner 包装 `child_process.spawn` 或等价无 Shell API。测试先覆盖：

- 参数以数组传递，禁止 `shell: true` 和字符串拼接。
- 固定关闭 pager/color，并以 `HEAD` 为历史入口，不使用 `--all`。
- `maxCommits` 只能来自规范化 Preferences。
- stdout/stderr 分别有限制；超限、超时或 AbortSignal 会终止子进程。
- 终止后只 resolve/reject 一次，不泄漏 listener。
- 错误对象只暴露稳定错误码，原 stderr 留给安全日志层。

### Task 2.2：仓库和当前分支选择

在同一服务测试先覆盖：

- 单根 workspace。
- 多根 workspace 优先活动编辑器所属根。
- 无活动编辑器时选择第一个有效 Git 根。
- workspace 内嵌套仓库能通过 `rev-parse --show-toplevel` 定位。
- detached HEAD 使用短 Hash 标识但仍查询 `HEAD`。
- 无 workspace、无 Git 仓库、Git 不可用和无提交分别返回稳定状态。

不得把绝对路径或原始 Git 错误发给 Webview。

### Task 2.3：稳定字段协议与解析

测试先覆盖：

- NUL 或同等级稳定字段分隔协议。
- Unicode、标点、换行和类似分隔符的 subject/author 不破坏记录边界。
- hash、subject、author、时间戳数量不完整时整批失败为安全解析错误。
- 仅当前分支/HEAD 可达提交进入结果。
- 结果按 Git 默认新到旧顺序保留。

实现 `GitLogCommit` 输出，不把格式化后的相对时间持久化。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogService.test.ts
```

## 7. Phase 3：顶层模式协调器与 Provider 生命周期

### Task 3.1：Reader 最小恢复目标

修改：

- `src/reader/readerController.ts`
- `src/test/unit/readerController.test.ts`

先写失败测试定义一个只读捕获 API：

- 优先返回尚未 debounce 保存的最新 pending position。
- 否则返回当前书籍已保存 ReadingPosition。
- 尚未稳定布局时返回当前 Reader Engine 的规范初始位置。
- 书架/未打开书时返回 undefined。
- 捕获不修改 Reader state；flush 仍由既有 Store 完成。

### Task 3.2：GitLogModeCoordinator 核心状态机

创建：

- `src/git/gitLogModeCoordinator.ts`
- `src/test/unit/gitLogModeCoordinator.test.ts`

按一条行为一个测试的顺序实现：

1. inactive→active 先写 workspace mode，再请求 focus/reveal 和 Git loading。
2. active 写失败保持 Reader，不启动 Git session。
3. active→inactive 先写 inactive；失败保持 Git Log 且不恢复 Reader。
4. 进入时启动 ReadingPosition flush 但不等待它后才显示 loading。
5. 立即退出时有界等待同一个 flush；超时使用持久化 resumeTarget。
6. inactive + pending 先 claim 清目标，再打开 Reader。
7. claim 失败不打开；open 失败只降级书架且不重复消费。
8. Webview 不存在时进入会主动 focus/resolve；退出不强制显示侧边栏。
9. pending 消费前再次进入 active 会保留目标。
10. 快速连按按奇偶净效果合并，模式写入严格串行。
11. 协调器重建后只从 workspace record 决定模式，不恢复 runtime Promise/session。

为测试注入 mode store、Reader resume bridge、View bridge、Git session factory、时钟和 timeout；不要 mock 协调器内部私有方法。

### Task 3.3：Git 会话生命周期

继续测试先覆盖：

- 每次可见初始化生成新 session ID 和 AbortController。
- hide-without-dispose、dispose、deactivate、toggle exit 和新 session 都先取消旧 session。
- hide/dispose 清空 host 侧 commits/pages 引用但不清 active。
- reveal/resolve active 时首消息为 loading，随后重新查询。
- 旧 session 成功/错误结果均因 ID 不匹配被丢弃。
- Git 查询错误只生成当前 session 的安全状态消息。

### Task 3.4：Provider 与激活装配

修改：

- `src/reader/ReaderViewProvider.ts`
- `src/extension.ts`
- `src/test/unit/readerViewProviderV2.test.ts`
- 新增 `src/test/unit/gitLogViewProvider.test.ts`

实现要求：

- `ReaderViewProvider` 只负责 View 生命周期和消息路由，不直接运行 Git。
- 首次 render 前执行模式 bootstrap；active 时不得调用 `refreshLibrary()` 或后台打开 Reader。
- inactive + pending 时首屏为 Reader 恢复 loading；无 pending 才载入书架。
- 原 `moyuplus.reader.close` 仍执行 `workbench.action.closeSidebar`。
- `moyuplus.gitLog.toggle` 注册到 Coordinator。
- focus 失败不清 active，并显示非阻断错误。

验证：

```powershell
npm run test:unit -- src/test/unit/readerController.test.ts src/test/unit/gitLogModeCoordinator.test.ts src/test/unit/readerViewProviderV2.test.ts src/test/unit/gitLogViewProvider.test.ts
```

## 8. Phase 4：协议、独立 Webview 状态与设置 UI

### Task 4.1：Git Log 消息协议

创建：

- `src/git/gitLogMessages.ts`
- `src/test/unit/gitLogMessages.test.ts`

测试先覆盖：

- bootstrap、loading、ready、empty、error、session invalidated。
- save settings、翻页和设置抽屉意图。
- 所有 session 数据消息必须带非空 session ID。
- 非当前协议版本、非法 Preferences、非法 Commit 和未知消息被拒绝。
- Reader v2 消息与 Git Log 消息保持不同联合类型，不能交叉通过 guard。

### Task 4.2：Git Log reducer

创建：

- `src/webview/gitLogState.ts`
- `src/test/unit/gitLogWebviewState.test.ts`

测试先覆盖：

- 每次 enter 创建 loading 初态且不保留旧 commits/pageIndex。
- ready/empty/error 只接受当前 session。
- stale success/error/invalidated 消息不改变新 session。
- 打开/关闭设置抽屉和独立 preferences draft。
- 保存字段/max count 回到第一页并请求重新查询。
- 保存纯 `layout` 只本地重排并回到第一页。
- invalidate 清空 commits/pages/settings draft 引用。

Git reducer 不接收 Reader state、resumeTarget 或 Reader 导航 action。

### Task 4.3：顶层 Webview 路由

修改/创建：

- `src/webview/readerApp.ts`
- `src/webview/gitLogView.ts`
- `src/webview/readerPreferenceStyles.ts`
- 相关 unit/build contract tests

实现：

- 顶层模式仅为 `boot | readerApp | gitLog`。
- boot 阶段不绘制书架；等待 Provider bootstrap。
- Reader reducer/state 保持原边界，Git reducer/state 单独持有。
- 切到 Git 时 dispose Reader LayoutEngine；切回 Reader 前 dispose Git paginator。
- 只提取无业务含义的 `applyReaderPreferences()` 为共享展示函数。
- Reader 快捷命令在 Git 模式不路由；Git 翻页/设置意图在 Reader 模式不路由。

### Task 4.4：Git Log 页面和设置抽屉

修改：

- `src/webview/gitLogView.ts`
- `src/webview/styles.css`
- `src/test/unit/buildContract.test.ts` 或轻量 DOM contract tests

严格实现已批准 UI：

- 工具栏只含 `Git Log` 与右上角 Git 设置。
- 次级栏显示仓库和当前分支/detached Hash。
- 无返回/关闭按钮，无提交分割线。
- 标题始终显示；Hash、作者、相对时间、绝对日期可切换。
- 全字段同一 Reader 字体、字号、行高、字距、段距、页边距、对齐和主题。
- `lines` 每项独立一行；`inline` 使用 ` · ` 且自然折行，无省略号。
- 设置抽屉只含 Git 字段、排列、最多加载、恢复默认和保存。
- 正文 `overflow: hidden`，不得横向或纵向滚动。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogMessages.test.ts src/test/unit/gitLogWebviewState.test.ts src/test/unit/buildContract.test.ts
npm run build:webview
```

## 9. Phase 5：独立动态分页器与布局验收

### Task 5.1：GitLogPaginator

创建：

- `src/webview/gitLogPaginator.ts`
- 可选纯算法 unit test

实现前先建立真实 DOM 失败测试。分页器要求：

- 输入为 commits、当前字段设置、Reader preference CSS 和实际 viewport。
- 普通提交尽量作为完整块放页；剩余高度不足移至下一页。
- 单条提交超过一页时允许按文本行拆页，内容不裁剪、不重复、不遗漏。
- next/previous 只改变 Git pageIndex。
- reflow 后回到第一页。
- dispose 移除测量 DOM、resize/font listener 和 animation frame。
- 与 Reader LayoutEngine 不共享 pageIndex、sectionId、progression 或事件回调。

### Task 5.2：Layout Harness

创建：

- `tests/fixtures/layout/git-log-harness.html`
- `tests/layout/git-log-layout.spec.ts`

Playwright 测试覆盖：

- 220/280/360px 宽度和多种高度。
- 全字段、逐行模式和标点模式。
- 标点模式自然折行、无 ellipsis、无横向滚动。
- Reader 字号、行高、字距、段距和 pagePadding 改变页数。
- Git 页面没有额外条目 padding/margin 或不同字段字号。
- 无分割线。
- 正文 `scrollHeight <= clientHeight`，滚轮不改变 scrollTop。
- 翻到尾页非空，再 next 保持原页。
- 超长 subject/单条提交跨页后拼接文本与原文一致。
- resize/font loading/reflow 不产生空尾页。
- settings save 后回第一页。

验证：

```powershell
npm run test:layout -- tests/layout/git-log-layout.spec.ts
```

## 10. Phase 6：Contribution、完整集成与验收

### Task 6.1：package.json 命令可见性

修改：

- `package.json`
- `src/shortcuts/shortcutSettings.ts`
- `src/test/unit/packageContributions.test.ts`
- `src/test/unit/shortcutSettings.test.ts`

测试先覆盖：

- 新 ID 固定为 `moyuplus.gitLog.toggle`。
- activation event 存在。
- 默认 keybinding 为 `alt+q`，无 Reader-focus when 限制。
- 命令在 `contributes.commands` 中有可配置标题。
- `menus.commandPalette` 对该命令设置 `when: false`。
- 不贡献 View title、菜单或 Webview 按钮入口。
- 原 `moyuplus.reader.close` contribution、ID 和执行行为不变。

### Task 6.2：Extension 生命周期集成

修改：

- `src/extension.ts`
- `src/test/unit/extension.test.ts`
- `src/test/unit/typingPracticeIntegration.test.ts`
- 新增/扩展 Git Log 集成测试

测试先覆盖完整场景：

1. 书架 Alt+Q → active/loading → fresh query → Alt+Q → 书架。
2. Reader Alt+Q → capture/flush → Git → Alt+Q → 原书和最后位置。
3. Close Reader 隐藏 → reveal 仍 Git 且 fresh query。
4. hide-without-dispose 与 dispose 后 stale 结果无效。
5. active 状态 disable→enable、窗口 reload、ExtensionContext 重建和同 workspace reopen。
6. workspace A active 不影响 B。
7. Webview 不存在时 Alt+Q 会 focus/resolve；focus 失败仍 active。
8. 快速连按、active/inactive update 失败、flush 延迟/失败/超时、claim 清理失败。
9. pending restore 消费前重新 active 保留目标；消费成功至多打开一次。
10. Git 不可用、非仓库、无提交、detached HEAD、查询超时/超限。

### Task 6.3：安全日志与错误文案

修改：

- `src/extension.ts` 或专用安全日志 helper
- Git Log service/provider tests

验证：

- Webview 只收到稳定中文状态和 error code。
- Output Channel 清理换行、控制字符并限制长度。
- 不输出完整绝对路径、提交正文、命令行或堆栈到 Webview。
- mode persistence 失败的进入/退出文案不会谎称已切换。

### Task 6.4：完整自动验证

按顺序运行：

```powershell
npm run test:unit
npm run test:layout
npm run compile
git diff --check
```

如构建产物由仓库跟踪，再执行 `npm run build` 并确认 `media/readerApp.js`、CSS 和 source map 与源文件一致。不得手工编辑 bundle。

## 11. 人工验收清单

在真实 VS Code Extension Development Host 中验证：

1. 单根 Git workspace 中按 `Alt+Q`，页面立即显示 loading，随后只展示当前分支。
2. 页面不可滚动，只能使用上一页/下一页。
3. 设置字段、排列和最大数量后跨 workspace/重启保留。
4. Reader 字体、字号、间距、页边距和主题变化同步影响 Git Log。
5. Git 字段没有额外字号层级、分割线或额外横向边距。
6. 标点模式自然折行，信息完整。
7. 原 Close Reader 隐藏侧边栏；重新打开仍处于 Git Log 并重新查询。
8. Reload Window、关闭并重开 VS Code、禁用再启用扩展后仍锁定 Git Log。
9. 只有 `Alt+Q` 正常退出；退出后恢复原书及最后阅读位置，失败时回书架。
10. 多根 workspace 选择活动编辑器仓库；detached HEAD 显示明确。
11. 命令面板搜不到 Toggle Git Log，但 Keyboard Shortcuts 中可重新绑定。
12. 原 `moyuplus.reader.close`、Reader 翻页/章节/设置和打字练习无回归。

## 12. 停止条件

出现以下任一情况时暂停实现并报告，不扩大范围：

- 当前未提交改动与目标 patch 发生无法安全合并的同区域冲突。
- VS Code 无法同时满足“Keyboard Shortcuts 可配置”和“Command Palette 隐藏”。
- `Alt+Q` 在目标平台被系统级稳定拦截，扩展无法接收。
- workspaceState 写入行为无法支持已批准的持久化锁定语义。
- DOM 测量无法在无滚动前提下完整显示超高单条提交。
- 既有 Reader 无法提供最新稳定 Locator，且任何补充 API 都会改变正常阅读行为。

## 13. 完成定义

全部 Phase 的测试先行证据、自动验证和人工清单通过；Git Log 模式在状态、消息、设置、查询和分页上与 Reader 业务隔离；关闭、重载和重启无法绕过快捷键退出；原 Close Reader 与 Reader 功能无回归；工作树中的既有用户改动被完整保留。
