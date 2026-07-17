# 进度日志

## 2026-07-15 长书性能回归与图片入口

- 2026-07-16 用户使用真实 `moyuplus-0.0.7-performance-fix.vsix` 完成人工验收，确认长章节加载、目录开关、跨章注解、统一排版、图片链接与安全预览均通过；本轮状态改为 complete。
- 用户批准性能修复设计；三轮规格复核最终 Approved，并补齐目录量化基线、staging 清理和绕过完整 render 的候选提升契约。
- RED 证据：约 37k 长章产生 1039 次隐藏 source 整树深克隆；目录开关替换正文与两个隐藏 surface 并额外 reflow 1 次；有效跨章目标完整分页 2 次。
- GREEN：Range 局部分片保留 `.moyuplus-book-content` 和语义祖先，整树深克隆降为 0；text span 改为二分定位，边界吸附复用一次缓存的正文文本。
- GREEN：目录/设置抽屉增量增删 overlay，正文节点、隐藏 surface、页码和正文 HTML 保持同一，reflow 为 0。
- GREEN：跨章候选在同尺寸 staging 完整分页一次并通过 `attachTo()` 提升；异常候选保持旧布局对象不变，空章节作为单空页成功切换。
- 同 bundle 交替基线（固定 Chromium、280×318 阅读面、约 37k HTML、2 次预热 + 5 次测量）：0.0.6 初始化中位数 1217.0ms，当前 542.7ms，倍率 0.446（当前约快 2.24 倍）。
- 真实 app 目录基线（280×420、约 34.5k HTML、120 项目录、2+5）：0.0.6 中位数 396.6ms，当前 1.1ms；确定性门禁同时确认 0 reflow 与布局对象身份稳定。
- 全量回归通过：44 个单测文件 210/210，Chromium layout/privacy 28/28，`npm run compile` 通过。
- 正式 package 门禁再次通过 compile、210/210 unit 和 28/28 Chromium；生成 `moyuplus-0.0.7-performance-fix.vsix`（373,677 bytes，8 个运行时/说明文件，包内版本 0.0.7）。SHA-256：`40F9E90F7A4CDBDEAC6725ACA1FEC0AA7529073C83A171B4A0B05000C4272EDB`。
- 已启动设计阶段，记录用户实测的初始化、目录和远距离跨章跳转性能回归；下一步检查调用链与同步 DOM/分页工作量。
- 已定位三条主要同步热路径：初次打开全章 eager pagination、打开 drawer 导致 Layout Engine 销毁重建、跨章目标 preflight 与正式渲染重复全章 pagination。
- 已建立可重复浏览器性能基线：39k HTML 初载约 509ms、开目录约 363ms、跨章章尾注解约 894ms，确认用户反馈是结构性同步工作放大而非偶发 I/O。
- 用户要求暂缓性能问题；当前转入图片入口样式的最小 TDD 修改和独立 VSIX 打包。
- 图片链接样式设计规格复核 Approved；开始真实 Reader computed-style RED。
- RED 已观察：入口仍为 BUTTON，但旧 computed style 是浅灰背景、2px 边框、1×6px padding、默认光标且无下划线；失败原因准确。
- GREEN 已通过：真实 Reader harness 确认入口仍为 BUTTON，且为透明背景、零边框、零 padding、VS Code 链接色、下划线和 pointer cursor；安全 openImage 消息断言继续通过。
- 完整 package 门禁通过：44 个单测文件 210/210，Chromium layout/privacy 22/22，生成 `moyuplus-0.0.7-image-link.vsix`。
- VSIX 共 8 个文件，仅包含 manifest、README、CHANGELOG、Extension/Webview 运行时 JS/CSS；`git diff --check` 通过。SHA-256：`A8FAA23AA33397F6B59D16A1037896D52FDFE5F1383B37057511E888EA6CD753`。

## 2026-07-15 统一排版与分页回归修复

- 已读取并确认获批设计规格、当前 Git 状态和现有测试脚本。
- 已将主计划切换为 `implementation_in_progress`，下一步进入 RED：检查 sanitizer/layout 当前实现和测试夹具，新增最小失败测试。
- 已完成实现盘点：sanitizer 表现层、`sanitizer-v2` 和三处单轴分页判断均与设计中的目标行为存在明确差距。
- 已确定测试落点：`epubSanitizer.test.ts`、`epubAdapter.test.ts`、`reader-layout.spec.ts`，以及两个既有 Chromium harness；先做 sanitizer/sourceRevision RED。
- Sanitizer/sourceRevision RED 观察到 3 个预期失败；实现 allowlist 与 `sanitizer-v3` 后目标测试 6/6 通过。开始分页/真实 Reader RED。
- 分页 RED 先复现 `pageCount=1` 与完整 app 文本/边界失败；实现共享双轴谓词、统一正文 CSS，并修正 footer 挂载顺序后，canonical Chromium 测试 2/2 通过（含 27 组独立矩阵）。
- Build contract 先因仍声明 `css-tree` 按预期失败；移除 `css-tree` 与 `@types/css-tree` 后目标测试 5/5 通过。README、CHANGELOG 与指导文档已更新统一排版取舍和双轴分页契约。
- 最终门禁：`npm run compile` 通过；44 个单测文件 210/210；Chromium layout/privacy 22/22；`npm run package -- --out moyuplus-0.0.7-canonical-layout.vsix` 通过；`git diff --check` 通过。
- VSIX 共 8 个文件，仅含 manifest、README、CHANGELOG、`out/extension.js`、`media/readerApp.js` 和 `media/readerApp.css`；不含源码、测试、计划、source map、lockfile 或书籍文件。SHA-256：`B610041FC1F71F6CE3BF7DDE6979DBF464D37C37EA44D5F05663CD34969BA8EA`。
- 2026-07-16 用户使用真实 VSIX 与原故障 EPUB 完成人工复验，右边距、`pre`/长文本/表格、末页状态、resize/reflow、内部链接与图片预览全部通过。

## 2026-07-13 Reader v2 Phase 6 人工复测修复（0.0.5）

- 修复窗口缩放后分页状态与按钮状态不同步，Layout Engine 在合并重排完成后主动回报最新页面状态。
- 翻页只更新分页状态与页脚，不再重建正文 DOM 和 Layout Engine，消除缩放/翻页竞态。
- “返回书架”先上报最终 Locator 并强制 flush；重新打开前也会 flush 待保存进度。
- `bookReady` 传递完整初始 Locator，恢复章节的同时恢复章节内位置。
- 自动验证：128 项 Vitest、7 项 Chromium Layout/隐私测试、TypeScript 编译和 VSIX 打包全部通过。
- 交付物：`moyuplus-0.0.5.vsix`。
- 2026-07-13 用户确认 TXT/EPUB 缩放翻页、返回书架和阅读位置恢复均测试通过。
- **Reader v2 Phase 6 Status：complete；自动验证与人工验收全部通过，工作结束。**

## Session: 2026-07-08

### Phase 1: 需求与项目发现
- **Status:** complete
- **Started:** 2026-07-08
- Actions taken:
  - 读取 `planning-with-files` 和 `brainstorming` 技能说明。
  - 读取 `planning-with-files` 模板文件。
  - 创建 `task_plan.md`、`findings.md`、`progress.md`。
  - 盘点顶层目录，确认尚无项目代码脚手架。
  - 尝试读取 `指导文档.md`，发现默认编码读取乱码。
  - 执行 `git status --short`，确认当前目录不是 Git 仓库。
  - 使用 UTF-8 成功读取 `指导文档.md`。
  - 提炼阅读器、打字练习、快捷键、存储和非目标需求。
  - 更新开发路线，推荐 MVP 垂直切片。
- Files created/modified:
  - `task_plan.md` created
  - `findings.md` created
  - `progress.md` created

### Phase 2: 方案澄清与设计
- **Status:** complete
- Actions taken:
  - 提出三种路径：MVP 垂直切片、快速原型优先、基础设施优先。
  - 推荐采用 MVP 垂直切片路线。
  - 等待用户确认后再进入实施计划和代码开发。
  - 用户已确认 MVP 垂直切片路线，进入下一步计划。
  - 重读 `task_plan.md`、`findings.md`、`progress.md`，确认当前状态和约束。
  - 创建设计规格文档 `docs/superpowers/specs/2026-07-08-moyuplus-design.md`。
  - 记录当前目录不是 Git 仓库，设计文档 commit 步骤不可执行。
- Files created/modified:
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated
  - `docs/superpowers/specs/2026-07-08-moyuplus-design.md` created

### Phase 3: 实施计划
- **Status:** complete
- Actions taken:
  - 创建实施计划文档 `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md`。
  - 将开发拆成 Phase 0 到 Phase 8。
  - 明确下一步执行入口为 Phase 0：初始化 TypeScript VS Code extension 项目骨架。
  - 核对 `docs` 下新建文件存在，设计规格和实施计划均可按 UTF-8 正常读取。
- Files created/modified:
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` created
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated

### Phase 4: 开发执行 / Phase 0 初始化插件项目
- **Status:** complete
- Actions taken:
  - 重读实施计划，确认下一步入口为 Phase 0：初始化 TypeScript VS Code extension 项目骨架。
  - 按 TDD 流程先创建测试与配置，再实现扩展入口。
  - 创建 `package.json`、`tsconfig.json`、`vitest.config.mts`、`.vscode/launch.json`、`.vscode/tasks.json`。
  - 创建 `src/test/unit/extension.test.ts` 和 `src/test/shims/vscode.ts`，约束 activation 必须注册 `moyuplus.smokeTest`。
  - 执行 `npm install` 安装 TypeScript、VS Code 类型、Vitest 和 `iconv-lite`。
  - 执行 `npm test`，确认 RED 失败原因是 `src/extension.ts` 尚不存在。
  - 创建 `src/extension.ts`，实现最小 `activate`、`deactivate` 和 smoke-test command。
  - 执行 `npm run compile` 和 `npm test`，均通过。
  - 将 Vitest 配置从 `.ts` 调整为 `.mts`，消除 Vite CJS Node API 警告。
  - 增加 `.gitignore`，忽略 `node_modules/`、`out/`、`.vscode-test/` 和 `*.vsix`。
- Files created/modified:
  - `package.json` created
  - `package-lock.json` created
  - `tsconfig.json` created
  - `vitest.config.mts` created
  - `.vscode/launch.json` created
  - `.vscode/tasks.json` created
  - `.gitignore` created
  - `src/extension.ts` created
  - `src/test/unit/extension.test.ts` created
  - `src/test/shims/vscode.ts` created
  - `task_plan.md` updated
  - `progress.md` updated
  - `findings.md` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated

### Phase 4: 开发执行 / Phase 1 数据模型与存储层
- **Status:** complete
- Actions taken:
  - 重读实施计划和设计规格，确认 Phase 1 只覆盖 domain/storage，不接入 UI。
  - 按 TDD 流程先创建 `src/test/unit/storage.test.ts`，覆盖模型默认值、全局 TXT 索引 CRUD、workspace session 独立读写、旧形状/损坏状态恢复。
  - 执行 `npm test`，确认 RED 失败原因是 `src/domain/models` 等 Phase 1 模块尚不存在。
  - 创建 `src/domain/models.ts`，定义 `ImportedTxtFile`、`ReaderSession`、`TypingPracticeSession`、`ShortcutConfig`，并实现默认值和归一化保护。
  - 创建 `src/storage/storageKeys.ts`、`src/storage/memento.ts`、`src/storage/txtLibraryStore.ts`、`src/storage/workspaceSessionStore.ts`。
  - 执行 `npm test`，确认 9 个单元测试通过。
  - 执行 `npm run compile`，确认 TypeScript 编译通过。
  - 更新实施计划、任务计划、发现记录和进度日志。
- Files created/modified:
  - `src/domain/models.ts` created
  - `src/storage/storageKeys.ts` created
  - `src/storage/memento.ts` created
  - `src/storage/txtLibraryStore.ts` created
  - `src/storage/workspaceSessionStore.ts` created
  - `src/test/unit/storage.test.ts` created
  - `task_plan.md` updated
  - `progress.md` updated
  - `findings.md` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated

### Repository: Git 初始化
- **Status:** complete
- Actions taken:
  - 用户要求“从现在开始，启动git”。
  - 在当前项目目录执行 `git init`。
  - 执行 `git status --short`，确认仓库已初始化，现有项目文件处于未跟踪状态。
  - 更新计划和发现文档中面向后续执行的 Git 状态。
- Files created/modified:
  - `.git/` created by `git init`
  - `task_plan.md` updated
  - `progress.md` updated
  - `findings.md` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated

### Phase 4: 开发执行 / Phase 2 TXT 文件服务与导入命令
- **Status:** complete
- Actions taken:
  - 重读实施计划、设计规格、任务计划、发现记录和进度日志，确认 Phase 2 范围为 TXT 解码、来源识别、导入/移除命令、失效检查、全文读取和物理行读取 API。
  - 读取现有 `models.ts`、`txtLibraryStore.ts`、`workspaceSessionStore.ts`、`extension.ts` 和单元测试，确认 Phase 2 应新增 TXT 服务层与命令注册层，继续保持 `extension.ts` 只做组合注册。
  - 按 TDD 流程先创建 `src/test/unit/txtFileService.test.ts` 和 `src/test/unit/txtCommands.test.ts`，覆盖 UTF-8/GBK 解码、来源识别、全文读取、物理行读取、文件失效检查、移除记录和命令注册/导入/移除流程。
  - 执行 `npm test`，确认 RED 失败于缺少 `src/txt/txtFileService`、未注册 Phase 2 命令和 shim 尚无 URI/open dialog 能力。
  - 创建 `src/txt/txtFileService.ts`，实现 TXT 导入、UTF-8/GBK 解码、workspace/external 来源判断、全文读取、物理行切分、失效文件检查和移除导入记录。
  - 创建 `src/commands/txtCommands.ts`，注册 `moyuplus.importTxt`、`moyuplus.removeImportedTxt`、`moyuplus.checkImportedTxtFiles`，并接入 VS Code open dialog、quick pick 和提示入口。
  - 更新 `src/extension.ts` 和 `package.json`，将 Phase 2 命令接入 activation events 与 contributes commands。
  - 扩展 VS Code 测试 shim，支持 `Uri.file`、workspace folders、open dialog、quick pick、warning/error messages。
  - 执行 `npm test`，确认 4 个测试文件、20 个测试全部通过。
  - 执行 `npm run compile`，确认 TypeScript 编译通过。
- Files created/modified:
  - `src/txt/txtFileService.ts` created
  - `src/commands/txtCommands.ts` created
  - `src/test/unit/txtFileService.test.ts` created
  - `src/test/unit/txtCommands.test.ts` created
  - `src/extension.ts` updated
  - `src/test/unit/extension.test.ts` updated
  - `src/test/shims/vscode.ts` updated
  - `package.json` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated

### Phase 4: 开发执行 / Phase 3 阅读器 Webview 基础版
- **Status:** complete
- Actions taken:
  - 重读实施计划、设计规格、任务计划、发现记录和进度日志，确认 Phase 3 范围为 Webview View Provider、阅读器基础 HTML/CSS/JS、消息协议、已导入 TXT 选择、文本显示、上一页/下一页、字体按钮和 `ReaderSession` offset 持久化。
  - 按 TDD 流程先创建 `src/test/unit/readerViewProvider.test.ts` 和 `src/test/unit/packageContributions.test.ts`，并更新 activation 测试，覆盖 Webview provider 注册、package 视图贡献、Webview bootstrap、文件选择、翻页历史、offset 保存和字体大小保存。
  - 执行 `npm test`，确认 RED 失败于缺少 `../../reader/readerMessages` 和 `../../reader/ReaderViewProvider`。
  - 创建 `src/reader/readerMessages.ts`，定义 `moyuplus.readerView` 和 Webview/扩展主进程消息协议。
  - 创建 `src/reader/ReaderViewProvider.ts`，实现 Webview View Provider、状态 bootstrap、选择文件、读取全文、下一页/上一页、字体大小更新、错误消息和 workspace `ReaderSession` 持久化。
  - 创建 `src/reader/webviewHtml.ts`，提供阅读器基础 HTML/CSS/JS，支持导入文件下拉选择、文本显示、上一页/下一页、字体增大/减小和刷新。
  - 更新 `src/extension.ts` 和 `package.json`，将 reader view 接入 activation 与 `contributes.views.explorer`。
  - 扩展 VS Code 测试 shim，支持 `registerWebviewViewProvider`、Webview HTML/options、`postMessage`、`onDidReceiveMessage` 和测试侧消息模拟。
  - 执行 `npm test`，初次 GREEN 尝试发现 Webview message callback 丢弃 Promise，测试无法等待异步 session 写入；改为返回 `handleMessage` Promise 后通过。
  - 执行 `npm test`，确认 6 个测试文件、25 个测试全部通过。
  - 执行 `npm run compile`，确认 TypeScript 编译通过。
- Files created/modified:
  - `src/reader/readerMessages.ts` created
  - `src/reader/ReaderViewProvider.ts` created
  - `src/reader/webviewHtml.ts` created
  - `src/test/unit/readerViewProvider.test.ts` created
  - `src/test/unit/packageContributions.test.ts` created
  - `src/extension.ts` updated
  - `src/test/unit/extension.test.ts` updated
  - `src/test/shims/vscode.ts` updated
  - `package.json` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated

### Phase 4: 开发执行 / Phase 4 DOM 动态分页
- **Status:** complete
- Actions taken:
  - 重读实施计划、设计规格、任务计划、发现记录和进度日志，确认 Phase 4 范围为替换阅读器临时分页估算、接入 DOM 实际高度测量、维护 pageHistory、响应 resize/font 变化。
  - 读取 `src/reader/webviewHtml.ts`、`src/reader/ReaderViewProvider.ts` 和现有 reader 单测，确认 Phase 4 可以主要收敛在 Webview 脚本，主进程消息协议和 session 存储可复用。
  - 按 TDD 流程先创建 `src/test/unit/readerWebviewHtml.test.ts`，约束 Webview 必须包含隐藏测量容器、`findMeasuredPageEnd`、`ResizeObserver`、`pageRendered` 回传，并禁止旧的 `estimatePageSize`/`charsPerLine` 固定字符估算。
  - 执行 `npm test`，确认 RED 失败于旧 Webview HTML 缺少 `id="measure"`。
  - 更新 `src/reader/webviewHtml.ts`，新增隐藏测量容器，复制正文宽度、字体、字号、字重、行高、字距、tab size 和内边距作为测量样式。
  - 将旧的字符数估算分页替换为指数扩展 + 二分 DOM 测量，使用隐藏容器 `scrollHeight` 与阅读器可见高度比较，支持长中文/英文自动换行计入高度。
  - 渲染当前页后回传 `pageRendered` 与 viewport 快照，使用签名去重避免重复 state/render 循环；下一页/上一页继续复用既有 `ReaderSession.pageHistory` 行为。
  - 接入 `ResizeObserver` 与 window resize，尺寸变化后通过 requestAnimationFrame 重新测量分页；字体变化继续通过 session state 触发重渲染。
  - 执行 `npm test`，确认 7 个测试文件、26 个测试全部通过。
  - 执行 `npm run compile`，确认 TypeScript 编译通过。
  - 用户完成 Phase 4 人工 Extension Development Host 验证，确认动态分页、上一页/下一页、长行换行、字体变化、侧边栏宽度变化和 Reload 恢复均无异常。
  - 更新实施计划、任务计划、发现记录和进度日志。
- Files created/modified:
  - `src/reader/webviewHtml.ts` updated
  - `src/test/unit/readerWebviewHtml.test.ts` created
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated

### Phase 5: 开发执行 / Phase 5 打字练习核心
- **Status:** complete
- Actions taken:
  - 重读实施计划、任务计划、发现记录和设计规格中的打字练习段落，确认本阶段只实现练习文件选择、物理行进度、Inline Completion ghost text、下一行/重置/跳转和状态栏；Enter/Tab 路由留到 Phase 6。
  - 读取现有 `TypingPracticeSession`、`WorkspaceSessionStore`、`TxtFileService`、命令注册和 VS Code shim，确认可复用已有存储和 TXT 物理行读取能力。
  - 按 TDD 流程先新增 `src/test/unit/typingPracticeController.test.ts`，约束控制器必须按物理行保存进度、默认跳过空行、应用空格处理配置、支持下一行/重置/跳转/关闭。
  - 执行 `npm test -- src/test/unit/typingPracticeController.test.ts`，确认 RED 失败于缺少 `../../typing/TypingPracticeController`。
  - 新增 `src/typing/TypingPracticeController.ts`，实现练习文件列表、开始/停止、当前行、下一行、重置、跳转、空行过滤和 ghost text 文本处理。
  - 执行 `npm test -- src/test/unit/typingPracticeController.test.ts`，确认 1 个测试文件、5 个测试通过。
  - 扩展 `src/test/shims/vscode.ts`，增加 inline completion provider、status bar item、input box、`Position` 和测试用 text document 支撑。
  - 新增 `src/test/unit/typingPracticeIntegration.test.ts`，约束 activation 注册练习命令、inline provider 和隐藏状态栏；启动练习后状态栏显示、ghost text 返回剩余文本，状态栏菜单可推进下一行，停止后不再提供 ghost text。
  - 更新 `src/test/unit/packageContributions.test.ts`，约束 `package.json` 必须贡献打字练习命令和 activation events。
  - 执行 `npm test -- src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts`，确认 RED 失败于 package/activation 尚未注册 Phase 5 命令。
  - 新增 `src/typing/typingPracticeCommands.ts`，注册启动/停止/下一行/重置/跳转/状态栏菜单命令、Inline Completion Provider 和状态栏。
  - 更新 `src/extension.ts` 和 `package.json`，将 Phase 5 命令、provider、状态栏接入扩展 activation 和命令面板。
  - 执行目标集成测试，确认 2 个测试文件、4 个测试通过。
  - 执行 `npm test`，第一次全量测试失败于旧测试仍硬编码旧命令列表，且部分 TXT 命令测试 fake context 缺少 `workspaceState`。
  - 更新 `src/test/unit/extension.test.ts` 和 `src/test/unit/txtCommands.test.ts`，让旧测试契约匹配新的 activation 范围并补齐 fake context。
  - 增加失效持久化练习 session 边界测试，确认保存的练习 `fileId` 已不在导入列表时，状态栏隐藏且 Inline Completion Provider 返回空结果。
  - 执行 `npm test`，确认 9 个测试文件、35 个测试全部通过。
  - 用户人工验证反馈：Import TXT、Start Typing Practice、ghost text 前缀补全、Next Line 跳过空行、Jump/Reset、切换编辑器不重置、Stop 后隐藏 ghost text 和状态栏均无问题；发现缺少“每行首尾空白裁剪”配置入口。
  - 按 TDD 流程先更新 `src/test/unit/storage.test.ts` 和 `src/test/unit/typingPracticeController.test.ts`，约束 `trimTrailingSpaces` 默认值/归一化，以及开启首尾空白裁剪后 ghost text 不保留行尾空白。
  - 执行 `npm test -- src/test/unit/storage.test.ts src/test/unit/typingPracticeController.test.ts`，确认 RED 失败于缺少 `trimTrailingSpaces` 和行尾空白未裁剪。
  - 更新 `src/domain/models.ts` 和 `src/typing/TypingPracticeController.ts`，新增 `trimTrailingSpaces` 并让空行判断基于原始 trim 与配置处理后的文本共同判断。
  - 目标测试初次 GREEN 尝试发现默认 `skipEmptyLines` 对纯空白行回归；修正后目标测试通过。
  - 按 TDD 流程更新 `src/test/unit/typingPracticeIntegration.test.ts`、`src/test/unit/packageContributions.test.ts` 和 `src/test/unit/extension.test.ts`，约束新增 `moyuplus.toggleTypingPracticeLineEdgeTrim` 命令、package 声明和状态栏菜单开关。
  - 执行 `npm test -- src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts`，确认 RED 失败于新命令未注册、菜单选择不生效。
  - 更新 `src/typing/TypingPracticeController.ts`、`src/typing/typingPracticeCommands.ts`、`src/extension.ts` 和 `package.json`，实现首尾空白裁剪开关命令及状态栏菜单入口。
  - 执行目标集成测试，确认 3 个测试文件、7 个测试通过。
  - 执行 `npm test`，确认 9 个测试文件、37 个测试全部通过。
  - 执行 `npm run compile`，确认 TypeScript 编译通过。
  - 2026-07-09 用户复测确认：首尾空白裁剪开关功能正常，Phase 5 人工验证通过。
- Files created/modified:
  - `src/test/unit/typingPracticeController.test.ts` created
  - `src/test/unit/typingPracticeIntegration.test.ts` created
  - `src/typing/TypingPracticeController.ts` created
  - `src/typing/typingPracticeCommands.ts` created
  - `src/domain/models.ts` updated
  - `src/extension.ts` updated
  - `package.json` updated
  - `src/test/shims/vscode.ts` updated
  - `src/test/unit/extension.test.ts` updated
  - `src/test/unit/packageContributions.test.ts` updated
  - `src/test/unit/storage.test.ts` updated
  - `src/test/unit/txtCommands.test.ts` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated

### Phase 6: 开发执行 / Phase 6 Enter/Tab 路由与设置
- **Status:** complete
- Actions taken:
  - 重读实施计划、设计规格、任务计划、发现记录和进度日志，确认 Phase 6 范围为 `moyuplus.routeEnter`、`moyuplus.routeTab`、Tab 两种补全模式、Enter 组合行为、安全 `when` 条件、VS Code Settings 高级配置和阅读器常用设置入口。
  - 按 TDD 流程先更新 `src/test/unit/typingPracticeController.test.ts`，约束 `TypingPracticeController.getTabCompletion` 必须按 `completeRest` 返回剩余文本、按 `replaceLine` 返回整行替换文本。
  - 更新 `src/test/unit/typingPracticeIntegration.test.ts`，约束 activation 注册路由命令、同步 `moyuplus.typingPracticeActive` context key、Tab 路由编辑当前行、未开启练习时回退原生 `tab`、Enter 路由执行真实换行并可选推进练习和阅读器。
  - 更新 `src/test/unit/packageContributions.test.ts`，约束 `package.json` 贡献路由命令、默认关闭的 Enter/Tab keybinding、Tab 的练习 active/补全/snippet 上下文限制，以及 `moyuplus.*` 高级配置。
  - 更新 `src/test/unit/readerWebviewHtml.test.ts` 和 `src/test/unit/readerViewProvider.test.ts`，约束阅读器 Webview 提供 `Shortcuts` 入口并打开 MoyuPlus 快捷键相关 Settings。
  - 执行目标测试集，确认 RED 失败于缺少 `getTabCompletion`、路由命令导出/注册、package keybinding/configuration、Webview 设置入口，以及 VS Code shim 尚无配置/编辑器/内建命令模拟能力。
  - 更新 `src/typing/TypingPracticeController.ts`，新增 `TypingTabCompletion` 和 `getTabCompletion`，复用当前练习行与已有 ghost text 前缀补全策略。
  - 新增 `src/commands/shortcutRouter.ts`，实现 `moyuplus.routeEnter` 和 `moyuplus.routeTab`；Tab 会按配置插入剩余文本或替换当前行，无活动练习/无编辑器/无可插入文本时回退原生 `tab`；Enter 默认执行真实换行，并按设置可选触发下一练习行和阅读器下一页。
  - 更新 `src/extension.ts`，接入快捷键路由注册；更新 `src/typing/typingPracticeCommands.ts`，在练习状态变化时同步 `moyuplus.typingPracticeActive` context key。
  - 更新 `src/reader/readerMessages.ts`、`src/reader/ReaderViewProvider.ts` 和 `src/reader/webviewHtml.ts`，支持从 Enter 路由请求阅读器下一页，并在 Webview 内提供 `Shortcuts` 设置入口。
  - 更新 `package.json`，新增路由命令、activation events、默认关闭的受限 Enter/Tab keybindings，以及 `moyuplus.shortcuts.*`、`moyuplus.typing.tabMode`、`moyuplus.enter.*` Settings 配置。
  - 扩展 `src/test/shims/vscode.ts`，支持 `workspace.getConfiguration`、测试编辑器、单行 insert/replace、`commands.executeCommand`、内建命令记录和 `setContext` 记录。
  - 执行目标测试集，确认 6 个测试文件、25 个测试通过。
  - 执行 `npm test`，确认 9 个测试文件、44 个测试全部通过。
  - 执行 `npm run compile`，确认 TypeScript 编译通过。
  - 2026-07-09 人工测试准备中发现 VS Code Settings 说明文案为英文，不便理解；按 TDD 先更新 `src/test/unit/packageContributions.test.ts` 约束中文说明和 `tabMode` 中文选项解释，确认 RED 后将 `package.json` 中 Phase 6 相关 Settings 描述改为中文。
  - 再次执行 `npm test -- src/test/unit/packageContributions.test.ts`、`npm run compile` 和 `npm test`，均通过。
  - 2026-07-10 用户确认 Phase 6 人工 Extension Development Host 测试全通过。
- Files created/modified:
  - `src/commands/shortcutRouter.ts` created
  - `src/typing/TypingPracticeController.ts` updated
  - `src/typing/typingPracticeCommands.ts` updated
  - `src/reader/ReaderViewProvider.ts` updated
  - `src/reader/readerMessages.ts` updated
  - `src/reader/webviewHtml.ts` updated
  - `src/extension.ts` updated
  - `package.json` updated
  - `src/test/shims/vscode.ts` updated
  - `src/test/unit/typingPracticeController.test.ts` updated
  - `src/test/unit/typingPracticeIntegration.test.ts` updated
  - `src/test/unit/packageContributions.test.ts` updated
  - `src/test/unit/readerWebviewHtml.test.ts` updated
  - `src/test/unit/readerViewProvider.test.ts` updated
  - `src/test/unit/extension.test.ts` updated
  - `docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md` updated
  - `task_plan.md` updated
  - `findings.md` updated
  - `progress.md` updated

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| 文档存在性检查 | `Get-ChildItem -Recurse docs` | 显示设计规格和实施计划 | 两个文件均存在 | pass |
| 设计规格读取 | `Get-Content -TotalCount 30 ...design.md` | UTF-8 正常显示 | 正常显示中文内容 | pass |
| 实施计划读取 | `Get-Content -TotalCount 30 ...implementation-plan.md` | UTF-8 正常显示 | 正常显示中文内容 | pass |
| Phase 0 RED 测试 | `npm test` | 因缺少 `src/extension.ts` 失败 | Vitest 失败于 `Failed to load url ../../extension` | pass |
| TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 0 单元测试 | `npm test` | smoke command 测试通过且无警告 | 1 个测试通过，退出码 0 | pass |
| Phase 1 RED 测试 | `npm test` | 因缺少 Phase 1 模块失败 | Vitest 失败于 `Failed to load url ../../domain/models` | pass |
| Phase 1 单元测试 | `npm test` | 存储和模型测试通过 | 2 个测试文件、9 个测试通过，退出码 0 | pass |
| Phase 1 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Git 初始化 | `git init` | 当前目录成为 Git 仓库 | 成功初始化 `.git/` | pass |
| Git 状态检查 | `git status --short` | 能列出未跟踪文件 | 项目文件均显示为未跟踪 | pass |
| Phase 2 RED 测试 | `npm test` | 因缺少 TXT 服务和命令注册失败 | Vitest 失败于缺少 `../../txt/txtFileService`、只注册 smoke command、shim 无 `Uri.file` | pass |
| Phase 2 单元测试 | `npm test` | TXT 服务和命令测试通过 | 4 个测试文件、20 个测试通过，退出码 0 | pass |
| Phase 2 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 3 RED 测试 | `npm test` | 因缺少 reader message/provider 模块失败 | Vitest 失败于缺少 `../../reader/readerMessages` 和 `../../reader/ReaderViewProvider` | pass |
| Phase 3 单元测试 | `npm test` | Reader Webview provider、package contribution 和既有测试通过 | 6 个测试文件、25 个测试通过，退出码 0 | pass |
| Phase 3 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 2/3 人工验证 | Extension Development Host | Smoke Test、UTF-8/GBK 导入与显示、Reader 翻页、字体调整、Reload 恢复、失效文件检查/移除均通过 | 用户反馈所有人工验证项均通过 | pass |
| Phase 4 RED 测试 | `npm test` | 因旧 Webview 未使用 DOM 测量分页失败 | Vitest 失败于 `expected ... to contain 'id="measure"'` | pass |
| Phase 4 单元测试 | `npm test` | Webview DOM 分页合约和既有测试通过 | 7 个测试文件、26 个测试通过，退出码 0 | pass |
| Phase 4 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 4 人工验证 | Extension Development Host | 动态分页、上一页/下一页、长行换行、字体变化、侧边栏宽度变化、Reload 恢复均无异常 | 用户反馈无异常 | pass |
| Phase 5 控制器 RED 测试 | `npm test -- src/test/unit/typingPracticeController.test.ts` | 因缺少打字练习控制器失败 | Vitest 失败于 `Failed to load url ../../typing/TypingPracticeController` | pass |
| Phase 5 控制器单元测试 | `npm test -- src/test/unit/typingPracticeController.test.ts` | 控制器核心行为测试通过 | 1 个测试文件、5 个测试通过，退出码 0 | pass |
| Phase 5 集成/package RED 测试 | `npm test -- src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts` | 因未注册 Phase 5 命令/provider/package 声明失败 | Vitest 失败于 command/activation 缺少打字练习项 | pass |
| Phase 5 集成/package 测试 | `npm test -- src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts` | 打字练习 activation、status bar、ghost text 和 package contribution 测试通过 | 2 个测试文件、4 个测试通过，退出码 0 | pass |
| Phase 5 第一次全量测试 | `npm test` | 暴露旧测试契约问题 | 2 个旧测试失败，另有 fake context 缺少 `workspaceState` 的未处理异步错误 | pass |
| Phase 5 失效 session 边界测试 | `npm test -- src/test/unit/typingPracticeIntegration.test.ts` | 失效持久化练习 session 不抛错，ghost text 返回空 | 1 个测试文件、3 个测试通过，退出码 0 | pass |
| Phase 5 首尾空白裁剪 RED 测试 | `npm test -- src/test/unit/storage.test.ts src/test/unit/typingPracticeController.test.ts` | 因缺少 `trimTrailingSpaces` 和行尾空白裁剪失败 | 3 个断言失败，符合预期 | pass |
| Phase 5 首尾空白裁剪目标测试 | `npm test -- src/test/unit/storage.test.ts src/test/unit/typingPracticeController.test.ts` | 存储和控制器首尾空白处理通过 | 2 个测试文件、14 个测试通过，退出码 0 | pass |
| Phase 5 首尾空白开关 RED 测试 | `npm test -- src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts` | 因缺少命令和菜单开关失败 | 3 个断言失败，符合预期 | pass |
| Phase 5 首尾空白开关集成测试 | `npm test -- src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts src/test/unit/extension.test.ts` | 命令注册、package 声明和菜单切换通过 | 3 个测试文件、7 个测试通过，退出码 0 | pass |
| Phase 5 全量测试 | `npm test` | 所有单元/集成测试通过 | 9 个测试文件、37 个测试通过，退出码 0 | pass |
| Phase 5 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 5 人工验证 | Extension Development Host | 打字练习核心场景和首尾空白裁剪开关均正常 | 用户反馈功能正常 | pass |
| Phase 6 RED 测试 | `npm test -- src/test/unit/typingPracticeController.test.ts src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts src/test/unit/readerWebviewHtml.test.ts src/test/unit/readerViewProvider.test.ts` | 因缺少路由 API、package 配置、Webview 入口和 shim 能力失败 | 10 个目标断言/调用失败，失败原因与 Phase 6 缺失能力一致 | pass |
| Phase 6 目标测试 | `npm test -- src/test/unit/typingPracticeController.test.ts src/test/unit/typingPracticeIntegration.test.ts src/test/unit/packageContributions.test.ts src/test/unit/readerWebviewHtml.test.ts src/test/unit/readerViewProvider.test.ts src/test/unit/extension.test.ts` | 控制器、路由集成、package 贡献、Reader 设置入口和 activation 测试通过 | 6 个测试文件、25 个测试通过，退出码 0 | pass |
| Phase 6 全量测试 | `npm test` | 所有单元/集成测试通过 | 9 个测试文件、44 个测试通过，退出码 0 | pass |
| Phase 6 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 6 Settings 中文文案 RED 测试 | `npm test -- src/test/unit/packageContributions.test.ts` | 因 Settings 描述仍为英文而失败 | package contribution 测试失败，显示 6 个 Settings 描述仍为英文且 `tabMode` 缺少中文 `enumDescriptions` | pass |
| Phase 6 Settings 中文文案目标测试 | `npm test -- src/test/unit/packageContributions.test.ts` | Settings 描述和 Tab 模式选项解释为中文 | 1 个测试文件、3 个测试通过，退出码 0 | pass |
| Phase 6 人工验证 | Extension Development Host | 默认不拦截 Enter/Tab；启用设置后验证 Tab 两种模式、Enter 组合行为和阅读器设置入口 | 用户确认测试全通过 | pass |
| Phase 7 第一组 RED | 快捷键目录、Webview、package 目标测试 | 因缺少快捷键设置页与命令贡献失败 | 缺少模块、面板、恢复动作和命令，符合预期 | pass |
| Phase 7 快捷键状态与命令 | `shortcutSettings`、Reader provider、package/activation 测试 | 状态目录、配置更新、原生改键入口和阅读器命令通过 | 目标测试通过 | pass |
| Phase 7 安全提示 | 打字练习集成测试 | 首次提示真实文件写入风险，后续不重复，统一开关正常 | 目标测试通过 | pass |
| Phase 7 异常恢复 | TXT service、Reader provider 测试 | 空状态导入、失效记录移除、编码切换通过 | 2 个测试文件、20 个测试通过 | pass |
| Phase 7 Webview 可访问性 | `npm test -- src/test/unit/readerWebviewHtml.test.ts` | 焦点环、状态播报和窄侧栏契约通过 | 1 个测试文件、4 个测试通过 | pass |
| Phase 7 全量测试 | `npm test` | 所有单元/集成测试通过 | 10 个测试文件、57 个测试通过 | pass |
| Phase 7 TypeScript 编译 | `npm run compile` | 编译通过 | `tsc -p ./` 退出码 0 | pass |
| Phase 7 diff 检查 | `git diff --check` | 无空白错误 | 退出码 0，仅报告既有行尾转换提示 | pass |
| Phase 7 人工验证 | Extension Development Host | 快捷键页、Enter/Tab 开关、原生改键入口、首次安全提示、空/失效/编码错误恢复均正常 | 用户确认人工测试通过 | pass |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-08 | 技能文件初次读取路径不存在 | 1 | 改用 `ok-skills` 下的实际路径并成功读取 |
| 2026-07-08 | `指导文档.md` 默认读取乱码 | 1 | 改用显式 UTF-8 读取 |
| 2026-07-08 | `git status --short` 返回当前目录不是 Git 仓库 | 1 | 记录项目当前状态，开发计划暂不依赖 Git |
| 2026-07-08 | 设计文档 commit 步骤不可执行 | 1 | 当前目录不是 Git 仓库，未强行初始化 |
| 2026-07-08 | `npm install` 报告 node_modules 清理目录 EBUSY 警告 | 1 | 依赖安装成功，后续编译和测试通过，未影响 Phase 0 |
| 2026-07-08 | Phase 3 测试初次 GREEN 尝试中 Webview message callback 丢弃 Promise，导致测试无法等待异步状态写入 | 1 | 让 `onDidReceiveMessage` 回调返回 `handleMessage` Promise 后，测试通过 |
| 2026-07-08 | 人工验证中 `MOYUPLUS READER` 显示“没有可提供视图数据的已注册数据提供程序” | 1 | `package.json` 的 reader view contribution 缺少 `type: "webview"`，VS Code 将其当作 Tree View；已补测试并添加 `type: "webview"` |
| 2026-07-08 | Phase 5 第一次全量测试中旧 activation 测试仍期望旧命令列表 | 1 | 更新 `extension.test.ts` 和 `txtCommands.test.ts`，将新增打字练习命令纳入 activation 预期 |
| 2026-07-08 | Phase 5 第一次全量测试中 TXT 命令测试 fake context 缺少 `workspaceState` | 1 | 为相关测试 context 补齐 `workspaceState`，匹配真实 VS Code `ExtensionContext` |
| 2026-07-08 | 用户人工验证发现 Phase 5 缺少每行首尾空白裁剪配置入口 | 1 | 新增 `trimTrailingSpaces` session 字段、`moyuplus.toggleTypingPracticeLineEdgeTrim` 命令和状态栏菜单入口 |
| 2026-07-08 | 首尾空白裁剪初次实现导致默认 `skipEmptyLines` 不再跳过纯空白行 | 1 | 空行判断改为原始 `trim()` 非空且配置处理后非空，目标测试通过 |
| 2026-07-10 | Phase 7 恢复测试初次 GREEN 中两个断言要求对象显式包含值为 `undefined` 的可选属性 | 1 | 改为断言属性不存在，匹配真实消息与 session 序列化结构 |
| 2026-07-10 | 使用 PowerShell `;` 顺序执行目标测试和编译时，后续编译成功掩盖了前一个测试命令的非零退出码 | 1 | 分开运行验证命令；后续不使用该形式判断整体验证是否成功 |
| 2026-07-10 | 一次大型文档补丁因 `progress.md` 上下文行匹配失败而整体未应用 | 1 | 将补丁拆分为按文件和稳定标题定位的小补丁后成功更新 |

## 2026-07-10 Phase 7 恢复

- 已从 `task_plan.md`、`findings.md`、`progress.md` 和实施计划恢复上下文。
- Phase 6 的自动测试与人工验证均已通过；当前目标是 Phase 7“快捷键设置页与体验补齐”。
- 当前工作树只有 `manual-gbk.txt`、`manual-utf8.txt`、`test.txt` 三个既有未跟踪手工测试文件，本阶段保持不动。
- Phase 7 既定验收范围：主要功能快捷键状态可见、首次开启练习有安全提示、无文件/文件失效/编码失败有明确反馈。
- Phase 7 第一组 RED 已验证：快捷键目录模块不存在，Webview 尚无快捷键面板与恢复动作，package 尚未贡献对应阅读器/练习切换命令；目标测试按预期失败。
- 新增 `src/shortcuts/shortcutSettings.ts`，集中描述主要阅读/练习动作的功能名、启用状态、风险和说明；最终设置面板不回显无法可靠确定的实际按键值。
- Reader Webview 新增插件内快捷键设置面板，支持 Enter/Tab 启停、打开原生 Keyboard Shortcuts 和高级 Settings。
- 新增 7 个阅读器可绑定命令和统一的 `moyuplus.toggleTypingPractice` 命令。
- 首次开始练习会显示“练习输入会真实写入当前编辑器文件”的一次性中文警告。
- Reader 空状态支持直接导入；缺失文件状态支持重新导入或移除记录；解码失败支持 UTF-8/GBK 切换。
- `TxtFileService` 新增导入记录编码更新能力，保持文件 identity 与创建时间不变。
- 根据用户选择建立 `.impeccable.md`，并把快捷键页收敛为 VS Code 原生克制工具风：扁平列表、主题令牌、主次按钮、焦点环、状态播报和窄侧栏适配。
- 全量自动验证：`npm test` 通过 10 个测试文件、57 个测试；`npm run compile` 与 `git diff --check` 通过。
- 2026-07-10 用户确认 Phase 7 Extension Development Host 人工测试通过。
- Files created/modified:
  - `.impeccable.md` created
  - `src/shortcuts/shortcutSettings.ts` created
  - `src/test/unit/shortcutSettings.test.ts` created
  - `src/reader/ReaderViewProvider.ts` updated
  - `src/reader/readerMessages.ts` updated
  - `src/reader/webviewHtml.ts` updated
  - `src/typing/typingPracticeCommands.ts` updated
  - `src/txt/txtFileService.ts` updated
  - `src/extension.ts` and `package.json` updated
  - Phase 7 unit/integration tests and VS Code shim updated

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 4: 开发执行中；Phase 0–7 均已完成自动与人工验证；当前目录已初始化 Git |
| Where am I going? | 下一步进入 Phase 8：测试、打包与人工验收 |
| What's the goal? | 根据 `指导文档.md` 启动可执行的开发计划 |
| What have I learned? | Phase 0 可用 TypeScript + Vitest 验证 extension activation；Phase 1 可用内存 Memento 测试 global/workspace state 读写；Phase 2 可用临时文件和 VS Code shim 测试 TXT 导入、编码读取和命令交互；Phase 3 可用 Webview shim 测试 provider 消息协议和 `ReaderSession` 持久化；Phase 4 可用 Webview HTML 合约测试防止动态分页退化为固定字符估算；Phase 5 可用扩展后的 VS Code shim 测试 inline provider、status bar 和命令菜单；Phase 6 的配置/编辑器 shim 自动测试与真实 VS Code 人工测试均已通过 |
| What have I done? | 已完成 Phase 0–7 的代码实现；Phase 7 增加插件内快捷键页、主要动作命令、首次练习安全提示、空/失效/编码错误恢复和 VS Code 原生克制工具风设计基线 |

---
*后续每完成阶段或遇到错误都会更新。*

### Reader v2 Phase 5：打字练习、命令与迁移集成（2026-07-13）

- Task 5.1 完成：TypingPracticeController 不再依赖 ImportedTxtFile/TxtFileService，改用 TypingSourceCatalog 与 TxtAdapter 物理行能力。
- EPUB 不会出现在练习选择器中，控制器也会拒绝 EPUB；书架移除当前练习 TXT 时会清理 active 状态。
- Task 5.2 部分完成：新增 importBook/removeBook/relocateBook，importTxt 仅作为隐藏 alias；旧 remove/check TXT 产品入口不再注册。
- Task 5.3 完成：activate 先执行幂等迁移，再组装 BookLibraryStore、ReadingProgressStore、AdapterRegistry、LibraryService、ReaderController 与 typing。
- 验证：30 个 Vitest 文件 124 个测试、7 个 Playwright Chromium 测试、compile 与 diff check 全部通过。
- Reader previous/next chapter、open library/TOC/settings 命令已接通；Webview 上报 canNextPage，Enter route 在书尾不发送推进命令。
- Phase 5 完成回归：30 个 Vitest 文件 125 个测试、7 个 Playwright Chromium 测试、compile 与 diff check 全部通过。
- **Reader v2 Phase 5 Status：complete。下一步进入 Phase 6 清理旧栈、隐私硬化、性能与打包验收。**

### Reader v2 Phase 6：旧栈清理、隐私/性能硬化与打包

- 按 TDD 新增旧栈删除结构契约，确认 5 个断言因遗留文件/引用 RED 后，删除旧 TXT service/store/commands 和 v1 Reader 运行时消息/session。
- 将迁移所需的 v1 TXT 与 Reader shape 收拢到 `migrateV1ToV2.ts`，业务路径 `rg` 无旧栈引用。
- 新增错误正文脱敏与 300–500ms 防抖契约；ReaderController 默认防抖设为 400ms，错误只发送安全通用文案。
- 新增 `.vscodeignore`、README 与 CHANGELOG；完整构建前清理 `out/`，避免历史编译产物进入 VSIX。
- `npm run package` 通过：30 个 Vitest 文件、119 个测试，7 个 Chromium Layout/隐私测试通过。
- `vsce ls --tree` 审计通过：VSIX 仅 8 个运行时/说明文件，约 393 KB；无源码、测试、fixture、map、EPUB/TXT 用户文件或旧模块。
- `git diff --check` 通过（仅报告 Windows CRLF 转换提示，无 whitespace error）。
- **Status：自动验收完成，等待人工验收。**

#### Phase 6 人工验收缺陷修复：书架永久加载

- 人工验收发现导入后打开 MoyuPlus Reader 永久停在“正在载入书架”。
- 根因：Webview 已发送 `libraryReady`，但 ReaderViewProvider 未处理握手，也未返回 `libraryState`。
- 按 TDD 新增握手失败测试，确认 RED 后接通书架 snapshot；同时补齐 Webview 导入、移除、重新定位、练习启动和偏好保存桥接。
- 修复后 `npm run package` 通过：30 个测试文件、120 个单测和 7 个 Chromium 测试通过；VSIX 仍为 8 个文件、约 395 KB。
- **Status：已生成修复版 VSIX，等待从人工验收步骤 1 重新验证。**

- 首次修复版复验仍永久 loading；进一步确认真实 Webview 生命周期存在启动消息先于监听注册的竞态。
- Provider 已改为先注册消息监听再设置 HTML，并在 resolve/重新显示时主动推送书架 snapshot；snapshot 失败会显示错误态。
- 包版本提升到 0.0.2，排除 VS Code 同版本覆盖缓存影响。
- 0.0.2 完整验证通过：121 个单测、7 个 Chromium 测试，VSIX 8 个文件、约 395 KB。

- 用户提供的 Extension Host 日志确认 0.0.2 activation 在 bundle 加载阶段崩溃：`css-tree` ESM 入口的 `import.meta.url` 被 CommonJS bundle 转为空对象，触发 `createRequire(undefined)`。
- 新增实际 Node `require('./out/extension.js')` 的打包运行时测试，先复现同一错误，再将 css-tree 导入切换到 CommonJS 入口。
- 发布 0.0.3；完整验证通过：122 个单测、7 个 Chromium 测试，且打包 bundle 真实加载成功。

#### Phase 6 人工验收缺陷修复：书架操作、阅读关联与真实 EPUB

- 修复书架刷新后残留移除确认框：被移除书籍不再存在时 reducer 清空 `pendingRemoval`。
- 修复阅读响应被丢弃：Webview `openBook.requestId` 现在透传 ReaderController，TXT/EPUB 响应保持同一关联 ID。
- 修复真实 EPUB 显式 ZIP 目录条目被误判为不安全路径；目录经过同等安全校验但不进入文件索引。
- 新增 `MoyuPlus` Output 通道，记录 adapter 格式、错误类型和安全截断后的错误原因，不记录正文或资源 bytes。
- 发布 0.0.4；完整验证通过：125 个单测、7 个 Chromium 测试、实际 bundle require 和 VSIX 打包。

#### Phase 6 最终人工验收

- 发布 0.0.5，修复 resize 重排后的导航状态同步、非破坏性翻页、退出前最终 Locator 原子保存，以及章节内 progression 恢复。
- 完整验证通过：128 个单测、7 个 Chromium Layout/隐私测试、TypeScript 编译、bundle require 与 VSIX 打包。
- 2026-07-13 用户确认 TXT 与 EPUB 的缩放翻页和阅读位置恢复测试均通过。
- **Status：complete；Reader v2 Phase 6 已完成交付。**

## 2026-07-10 阅读器重塑规划
- **Status:** in_progress
- Actions taken:
  - 读取并遵循 `brainstorming` 与 `planning-with-files` 技能要求。
  - 保留上一轮 MVP 规划记录，新增阅读器重塑的独立规划阶段。
  - 将用户的新需求拆分为书架、格式适配、阅读导航、持久化、响应式排版、样式设置和删除语义。
- Files modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- Next:
  - 盘点仓库结构、最近提交和现有 Reader/TXT/Storage/Typing 实现。
  - 基于代码事实提出澄清问题与候选方案。

### 第一轮盘点结果
- Git 最近提交表明 MVP 已依次完成 TXT 导入、Reader Webview、DOM 分页、打字练习和快捷键体验。
- 已读取 `package.json`、领域模型、两个 store、TXT service 与 extension 组装代码。
- 确认删除底层已存在，但缺少书架 UI 入口；确认现有 Reader 位置模型无法直接承载 EPUB 章节定位。

### 第二轮盘点结果
- 已读取 Reader 消息协议、Provider、TXT 命令、打字练习控制器与命令层，并检索 Webview 分页实现和相关测试。
- 定位末页空翻的具体状态流：末页 `endOffset === text.length` 后仍允许推进到 `offset === text.length`。
- 确认 Reader 目前按整本 TXT 推送；EPUB 应改为目录/章节级数据流。

### 范围确认
- 用户确认采用“EPUB/TXT 均可阅读，TXT 才可打字练习”的能力划分。
- 用户在可视化布局方案中选择 B：保持侧边栏，并明确要求保证隐私性。

### 布局影响
- 后续不采用宽面板或多书编辑器标签。
- 侧边栏内部将按书架页/阅读页分屏切换，目录和设置使用临时抽屉。

### 文件所有权确认
- 用户确认导入只引用原文件，不复制；从书架删除时只移除索引记录。

### 阅读交互确认
- 用户确认 TXT 整本分页、EPUB 章节内分页、章节间自动衔接，以及书首/书尾禁用推进并明确提示。

### 样式范围确认
- 用户确认首版采用受控样式设置和 CSS 变量，不开放任意 CSS 编辑。

### 进度范围确认
- 用户确认阅读进度按书全局共享，打字练习进度继续按 workspace 隔离。
- 需求澄清已具备进入方案比较的条件。

### 技术路线确认
- 用户否决渐进迁移方案，选择整体重写阅读模块，并要求按最大改动面规划。
- 下一步进入总体架构分节确认。

### 总体架构评审 v1
- 用户要求拆出 Webview Layout Engine、使用带 progression 的可扩展 Locator 联合类型，并让 TXT 支持虚拟分章。
- 正在生成修订架构 v2。

### 总体架构 v2
- 用户已确认修订架构。
- 开始设计数据模型、Adapter 合约与数据迁移。

### 数据模型与 Adapter 合约
- 用户确认该设计，无需调整。
- 开始侧边栏信息架构与交互状态设计。

### 侧边栏信息架构
- 用户确认布局与交互，不需要调整。
- 开始运行时数据流、错误处理和隐私机制设计。

### 运行时、错误与隐私
- 用户确认该设计，无需调整。
- 开始最终测试策略、阶段拆分与验收标准设计。

### 测试、阶段与验收
- 用户确认最后一节。
- 已将所有已批准设计整理为正式 Reader v2 规格，下一步提交并进行独立规格评审。

### 规格评审第 1 轮
- 结果：Issues Found。
- 已修复全部 4 个阻断问题并采纳 2 项建议；`git diff --check` 通过。
- 下一步提交修订并进行第 2 轮独立审查。

### 规格评审第 2 轮
- 结果：Approved。
- 已补充两项建议性回归测试要求并更新正式规格状态。
- 下一步请求用户审阅正式规格；用户确认后才能进入实施计划。

### 实施计划准备
- 用户已确认正式规格无误。
- 当前会话缺少 brainstorming 所指定的 `writing-plans` 技能，已声明后采用等价的文件化实施计划回退。
- 已核对 ZIP、XML、HTML、CSS、Webview bundling 和真实浏览器测试工具的官方能力。
- 一次 Web `find` 调用因工具输入解析错误失败；未重复相同调用，改用按官方页面行号 `open` 成功取得所需资料。
- 实施计划首次大补丁未应用：代码块内存在缺少 `+` 的补丁行；已确认目标文件未创建，下一次改用分块补丁。

### 实施计划完成
- 已用分块补丁生成 Reader v2 文件级实施计划。
- 已补充依赖兼容门、Extension/Webview 双目标 esbuild、真实 Chromium Layout Harness、六阶段清理与交付门槛。
- `git diff --check` 通过；尚未开始业务实现。

### Error Log 补充
- 2026-07-10：两次大型规划补丁因 `task_plan.md` 上下文匹配失败而整体未应用；随后拆分为按文件的小补丁成功更新。

### Error Log 补充
- 2026-07-10：可视化伴侣首次启动由 `Get-Command bash.exe` 解析到 WSL 启动器，但本机 WSL 缺少 `/bin/bash`；已改用已验证存在的 Git Bash 路径，避免重复同一失败。
- 2026-07-10：官方可视化服务在 owner process 退出后停止，导致用户看到 `ERR_CONNECTION_REFUSED`；已生成完整静态 HTML，启动独立本地服务，并在内置浏览器验证页面内容正常加载。

### Reader v2 Phase 2：统一 Adapter、TXT 虚拟分章与 EPUB 安全解析
- **Status:** complete
- 按 TDD 先增加 8 个目标测试套件，RED 确认均因 Phase 2 模块不存在而失败。
- 实现 Adapter 合约/Registry、TXT encoding/sectionizer/adapter、typing source catalog。
- 实现 EPUB security policy/errors、streaming archive、package/nav/NCX parser、XHTML/CSS sanitizer 和 EpubAdapter。
- 增加中英文及无标题 TXT fixtures，以及代码生成的安全/恶意 EPUB fixtures。
- 目标测试 8 文件 11 测试通过；全量测试 25 个 Vitest 文件 106 测试和 1 个 Chromium 测试通过；`npm run compile` 通过。

### Reader v2 Phase 3：Webview Bundle、消息协议、资源与真实 DOM 分页
- **Status:** complete
- RED：Reader v2 消息测试 5 个用例因守卫不存在而失败；实现协议版本、open/section envelope 与安全 section 守卫后 GREEN。

### Reader v2 Phase 4：书架、Reader Controller 与侧边栏应用

- Task 4.1 RED：`libraryService.test.ts` 最初因模块不存在加载失败；补最小接口骨架后，5 个测试均因 not implemented 正确失败。
- Task 4.1 GREEN：实现 Adapter 首选/回退探测、inspect 后落库、URI 去重、插件状态删除、同格式重定位与失效扫描。
- 验证：`npm run test:unit -- src/test/unit/libraryService.test.ts`，5/5 通过。
- Task 4.2 RED：ReaderController 骨架缺少 openBook/requestSection/reportLayout/flush，4 个行为测试正确失败。
- Task 4.2 GREEN：实现唯一 BookHandle、requestId/section generation 旧响应丢弃、显式错误消息、进度防抖与 flush/dispose。
- 验证：`readerController.test.ts` 4/4 通过；`npm run compile` 通过。
- Phase 4 中间回归：`npm run test:unit` 全量 29 个文件、124 个测试通过。
- Task 4.3 RED：新增 Provider v2 与 Webview Security 测试，确认旧 TXT-only Provider 未转发 v2 协议、未在 hide/dispose 时 flush/dispose，旧 HTML 也未满足目标 CSP。
- Task 4.3 GREEN：Provider 仅接收通过运行时守卫的 v2 消息并转发 Controller；Webview 仅加载 `media/readerApp.js/css`，每次生成随机 nonce，`localResourceRoots` 仅包含扩展 media，hide/dispose 正确清理 Controller。
- Task 4.3 回归：29 个 Vitest 文件 112 个测试、7 个 Chromium Layout/隐私测试、`npm run compile` 与 `git diff --check` 全部通过；下一步进入 Task 4.4。
- Task 4.4 RED：新增 `readerWebviewState.test.ts`，因 `readerState` 尚不存在而按预期失败。
- Task 4.4 GREEN：实现纯 `readerAppReducer`、书架 view model 与能力动作过滤；书架 UI 覆盖导入、空状态、EPUB/TXT 元数据与进度、失效状态、打开、TXT 打字练习、重新定位和移除确认。
- Task 4.4 删除文案固定为“仅从 MoyuPlus 书架移除，不会删除原文件。”；EPUB view model 不产生打字练习动作。
- Task 4.4 回归：30 个 Vitest 文件 117 个测试、7 个 Chromium Layout/隐私测试、`npm run compile` 与 `git diff --check` 全部通过；下一步进入 Task 4.5。
- Task 4.5 启动：确认已批准规格要求阅读页顶部工具栏、章节栏、正文与页脚、嵌套目录、Preferences 即时预览/保存/reset、首尾能力反馈及极窄宽度可访问模式。
- 检索消息协议时误读不存在的 `src/reader/protocol.ts`；实际协议位于 `src/reader/readerMessages.ts`，后续改读真实路径，不重复该失败调用。
- Task 4.5 首次 compile 暴露两类类型问题：消息联合被误写为交叉类型而收窄为 `never`，且 `libraryLoaded` 未保留新增 Preferences 字段；已分别改为联合消息载荷和 reducer 保留共享状态。
- Task 4.5 RED：阅读状态 3 个用例与 Controller 相邻章节用例按预期失败；实现纯状态迁移、Preferences 草稿/保存/reset、章节/页面能力与相邻章节边界消息后目标测试 13/13 通过。
- Task 4.5 GREEN：完成阅读页工具栏、章节栏、Layout Engine 正文、页脚、嵌套目录、设置即时预览/保存意图、首尾提示和极窄宽度模式。
- Task 4.5 回归：`npm test` 通过，包含 30 个 Vitest 文件 121 个测试及 7 个 Chromium Layout/隐私测试；`npm run compile` 与 `git diff --check` 通过。
- **Reader v2 Phase 4 Status：complete。**
- 最终回归首次 compile 在 Layout 重建逻辑中发现可选属性未稳定收窄；改用局部 `priorLayout` 保存快照后消除类型不确定性。
- RED：ResourceManager 测试先因模块不存在报错，补最小空实现后确认行为断言失败；实现声明校验、MIME 白名单、缓存与统一 revoke 后 3 个用例通过。
- RED：真实 DOM Harness 因 `LayoutEngine` 不存在失败；实现后分页、定位恢复与首尾边界用例通过。
- RED：合并重排用例因调度 API 不存在失败；补 animation-frame 调度后通过。
- RED：构建契约确认缺少 `build:webview`；增加 `--webview-only` 路径后通过。
- 隐私 Harness 初次因 `//` 匹配 sourcemap 注释误报；收紧为 HTTP(S) URL 后通过，页面实际外部请求数为 0。
- 当前目标验证：`npm run compile` 通过；`npm run test:layout` 7/7 通过。
- 全量交付验证：27 个 Vitest 文件、115 个单元测试全部通过；7 个 Chromium Layout/隐私测试全部通过；`npm run compile` 与 `git diff --check` 通过。

### 2026-07-13 Git Log Reader 模式验收与发布准备
- 用户确认 Git Log Reader 人工验收场景全部通过。
- Git Log 目标测试 7 个文件、24 个测试通过；全量单元测试 37 个文件、155 个测试通过。
- 全量布局测试 11 个测试通过；`npm run compile` 和 `git diff --check` 通过。
- 版本从 0.0.5 提升至 0.0.6，已更新 README、CHANGELOG 和 Git Log 实施计划。
- `npm run package` 通过，生成并验证 `moyuplus-0.0.6.vsix`。
- 代码已提交为 `cd18974`，已创建 `v0.0.6` 标签并推送到 origin/master。

### 2026-07-14 Git Log 内存缓存实施

- **Status:** in_progress
- 已读取并确认正式设计、实施计划、TDD 与文件化计划约束。
- 实施开始时 `git status --short` 无输出；最近提交为 `7c0e60f Plan Git log memory cache implementation`。
- 下一步：运行 Phase 0 基线测试与编译，然后从测试夹具和纯查询模型开始 RED。
- Phase 0 基线：目标单测 5 个文件 17/17 通过；Git Log Chromium 布局 4/4 通过；`npm run compile` 通过。
- Phase 1.1 首次 RED 因测试字符串中的 `\050` 触发 ESM 旧式八进制转义错误；已改为数组 `join('\\0')` 构造原始输出，重新验证 RED。
- Phase 1.1 RED：共享 maxCommits helper、fingerprint 导出与结果字段均按预期缺失；GREEN 后 2 个目标文件 9/9 通过。
- Phase 1.2 初次 RED 因新模块缺失而无法收集测试；补最小可加载骨架后确认 3 个行为断言全部失败，GREEN 后 3/3 通过。
- Phase 1.3 RED：generation、投影 helper、刷新失败与 tombstone 均按预期失败；首次 GREEN 发现 ready 顶层 envelope 被内部 display 严格键检查误拒，拆分 envelope/display 校验后 3 个目标文件 12/12 通过。
- Phase 2 RED：控制器模块缺失；补可加载骨架后 5 个行为测试全部失败。GREEN 后 5/5 通过，同 key 100 次请求只触发一次 load/outcome，不同 key 最大并发为 1。
- Phase 3.1 RED：原子 session 接口缺失导致 5/6 失败；切换为 `openGitSession`/`detachGitSession(sessionId)` 并增加迟到复核后 6/6 通过。
- Phase 0.2 异步夹具 RED：`deferNextPostMessage` 缺失；GREEN 后可逐调用控制 Webview 投递 resolve 与真实投递顺序，不使用 timer。
- Phase 3 Provider RED：旧 Provider 无 `openGitSession`，7 个集成场景失败并产生预期接口错误；接入缓存/session/generation/单飞后协调器+Provider 14/14 通过。
- Phase 3 生命周期回归首次仅因新增 Provider disposable 使 activation subscriptions 从 27 增至 28 而失败；已更新既有契约。
- Phase 3 完整目标回归：协调器、Provider、extension、Reader Provider 共 25/25 通过；`npm run compile` 通过。
- Phase 4 reducer RED：cached begin 与 refreshFailed 2 个场景按预期失败；GREEN 后 5/5 通过。
- Phase 4 Chromium RED：缓存首帧仍显示 loading、tombstone 无法阻止迟到模式；实现 GitLogView cached begin/非阻断提示与 readerApp generation guard 后 Git Log 布局 6/6 通过。
- Phase 5 补充单条缓存替换与 Webview dispose/rebuild active-job 复用回归；Provider 目标测试 13/13 通过。
- Phase 5 最终门禁：全量单测 39 文件 180/180、全部 Chromium 布局/隐私 13/13、`npm run compile`、生产 bundle 生成和 `git diff --check` 全部通过。
- **Implementation status:** complete；Phase 6 真实 Extension Development Host 人工验收尚未执行。

### 2026-07-14 Reader / Git Log 人工验收回归修复

- **Status:** in_progress
- 用户补充并确认确定性触发路径：插件首次显示 Reader View 时已经处于 Git Log。
- 已确认产品行为：该启动路径若保存了恢复目标，退出 Git Log 后应恢复原书。
- 已完成根因定位与设计批准；开始按 RED → GREEN → REFACTOR 实施。
- RED（宿主）：`gitLogViewProvider.test.ts` 新增 2 项均因目标缺陷失败，原有 13 项通过。
- 工具记录：并行测试调用因单测预期非零退出而未返回布局分支输出；后续单独执行布局目标用例。
- GREEN（宿主）：Provider 以 `readerPageActive` 区分当前书架/阅读页；目标 Provider 测试 21/21 通过。
- GREEN（Webview）：`modeReaderRestore` 原子灌入完整书架后再打开目标书；空状态与启动恢复两条 Chromium 测试 2/2 通过。
- 空状态现在只保留页头“导入”，正文显示“书架中还没有书”和右上角导入提示，已删除“文”字节点及样式。
- RED/GREEN（状态清理）：移除 reducer 中未使用的 `emptyAction: importBook`，确保模型也不再表达重复导入动作。
- 最终验证：`npm run compile` 通过；全量单测 39 文件 182/182；Chromium 布局/隐私测试 15/15；`git diff --check` 通过。
- **Implementation status:** complete；尚待真实 Extension Development Host 人工验收。

### 2026-07-14 发布 0.0.7

- 用户确认 Git Log 缓存和 Reader 回归修复人工测试通过。
- 已将 `package.json`、`package-lock.json` 统一更新为 0.0.7。
- 已更新 README、CHANGELOG、实施计划和文件化工作记录。
- **Status:** in_progress；下一步执行完整 package 门禁并核对 VSIX 后提交。
- `npm run package` 通过：编译、39 文件 182 项单测、15 项 Chromium 测试全部成功。
- 生成 `moyuplus-0.0.7.vsix`（469391 bytes，8 个条目），包内 manifest/package 版本为 0.0.7，禁止内容检查为空。
- SHA-256：`E13BD2B38790F13C834DD092159DC2B5F2DC8AC6A64ECCCF1DEC1D79F7E9F09A`。
- `vsce` 非阻断警告：缺少 repository 字段与 LICENSE；未在没有用户许可选择和远端 URL 依据时擅自补充。
- 0.0.7 源码、测试、生成 bundle、版本和发布文档已提交；VSIX 按 `.gitignore` 保留为本地交付产物。
- **Status:** complete。

### 2026-07-15 阅读器资源、内部导航与分页边距实施

- **Status:** in_progress
- 已确认最新目标来自提交 `4652ba1` 的已批准规格，而非已完成的 7 月 14 日 Git Log 缓存计划。
- 已读取 brainstorming、TDD、planning-with-files 与 frontend-design 技能；`.impeccable.md` 将作为 Webview 视觉上下文。
- 已创建 `docs/superpowers/plans/2026-07-15-moyuplus-reader-resources-navigation-layout-implementation-plan.md`，分为 Phase 0–7。
- 当前工作树仅有既有未跟踪 `.superpowers/`；不清理、不覆盖。
- 错误：首次结构读取假设不存在的 `src/adapters/epubAdapter.ts`、`src/epub/xhtmlSanitizer.ts`、`src/epub/packageParser.ts`，命令失败。后续改为先读取 `rg --files` 清单，不重复同一命令。
- 下一步：按真实路径检查实现边界并运行 Phase 0 基线。
- Phase 0 基线通过：Vitest 39 个文件 182/182；Chromium 布局/隐私 15/15；`npm run compile` 通过并重新生成双目标 bundle。
- `.impeccable.md` 已确认用户、用途和视觉方向完整：VS Code 原生、克制、可靠；无需运行 teach-impeccable。
- Phase 0 fixture 将随各 RED 测试按需增量补充，避免先造未被行为测试使用的大型样本。
- 下一步：Phase 1 先检查消息、Locator、LayoutEngine 和现有测试接口，再增加最小 RED。
- Phase 1 结构检查完成：协议 v2、Host sectionGeneration 未出现在消息中、navigationState 仅 canNextPage、Webview 翻页函数直接调用 LayoutEngine。
- 发现现有 `localResources` 暴露 archive path 且图片 MIME 有 octet-stream 回退；已记录为 Phase 2 安全边界，不在 Phase 1 提前修改。
- 下一步：为协议 v3、EpubLocator textOffset/sourceRevision 和 ReaderNavigationHistory 写最小 RED。
- Phase 1 RED：协议测试按预期看到版本仍为 2、新消息被拒；Locator 测试缺少 textOffset/sourceRevision；历史测试首次因模块不存在无法收集。
- 按 TDD 修复历史测试收集错误时只增加空骨架，随后 2 个行为断言按预期失败（size 为 0、pop 为 undefined）。
- Phase 1 首轮 GREEN：协议/Locator/历史 3 文件 15/15 通过；`npx tsc -p ./ --noEmit` 通过。
- 历史实现容量 50、连续位置去重、defensive copy、LIFO 和 clear；尚未接入 Webview 生命周期。
- 下一步：InternalTargetResolver 的 UTF-16 offset/fragment RED。
- InternalTargetResolver RED：首次因模块不存在无法收集；补空骨架后 2 个断言按预期失败（totalLength 为 0、point 为 undefined）。
- InternalTargetResolver GREEN：UTF-16 文本索引、普通/空 anchor 前后回退、缺失 fragment、offset clamp 与边界映射完成。
- Phase 1 目标回归：4 文件 17/17 通过；下一步运行全量单测确认协议 v3 对既有 fixture 的影响。
- 全量单测首次回归 3 项失败，均由硬编码 `version: 2` fixture/Webview envelope 被 v3 守卫拒绝导致；已统一改用 `READER_PROTOCOL_VERSION`。
- v3 迁移目标回归：Reader Provider、Git Log Provider、消息 3 文件 29/29 通过。
- Phase 2 结构检查完成：现有 sanitizer 暴露 archive path、丢失跨章链接；Archive 安全读取能力可直接复用。
- Phase 2 sanitizer/声明 RED：图片仍为 archive-path src、跨章目标只剩 fragment、octet-stream 资源被错误声明；3 个行为断言按预期失败。
- GREEN：图片改为不透明资源按钮，alt→figcaption→默认 label；内部链接输出 section/fragment；外链与未知目标惰化；SafeSectionDocument 不再暴露 path。
- 图片安全 RED：新模块首次缺失；补直通骨架后 MIME 混淆和危险 SVG 两项行为断言失败。BookHandle 读取也按预期以 not implemented 失败。
- 图片安全 GREEN：PNG/JPEG/GIF/WebP/AVIF magic 校验、严格声明 MIME 匹配和 SVG 元素/属性/URL 清洗完成；原始 SVG 字节被重新序列化替换。
- Adapter 只为 manifest 支持 MIME 且扩展名一致的图片生成 16 位不透明 ID；按 section 声明读取并复用 EpubArchive 安全上限。
- Phase 2 目标回归：security/sanitizer/adapter 3 文件 11/11 通过；TypeScript 检查通过。
- TypeScript 首次检查发现 ES2022 不支持 `Array.findLast`；改为显式逆序循环后通过，未提升目标 lib。
- Phase 2 全量单元回归：42 文件 198/198 通过。
- Phase 3 API 核对：VS Code 1.92 类型已原生支持只读 Custom Editor；预览服务可直接实现，无需第三方依赖或联网查询。
- Phase 3 RED：服务模块首次不存在；补 shim/custom-editor 空骨架后 open、document 与 HTML 行为断言失败。
- Phase 3 GREEN：内存 URI、字节 defensive copy、独立 nonce/CSP、Blob URL revoke、openWith preview、失败/关闭/dispose 清理完成。
- Custom Editor contribution 与 extension 注册 RED/GREEN 完成；目标 3 文件 11/11 和 TypeScript 检查通过。
- Phase 4 结构检查完成：Host 已有 generation 基础，但 Provider 仍使用未关联 navigationState；位置命令需要统一正文状态防线。
- Phase 4 Controller RED：`openImage` 不存在；合法、伪造、过期和预览失败场景均按预期失败。
- Controller GREEN：成功 section 记录 request/book/section/generation/资源 ID；图片读取前后双重校验，过期响应静默，当前真实失败发送关联 `imageOpenFailed`。
- Provider/命令 RED：previous 非正文返回 undefined、undo 缺失、openImage 未路由、package/shortcut/activation 缺 undo。
- Provider/命令 GREEN：三项位置命令均要求活动正文和对应 capability；navigationState 改为 v3 关联消息；undo 无默认绑定；opaque image envelope 被收窄后交给 Controller。
- Extension 已把经过 Adapter 校验的 payload 接到内存 Preview Service；目标 5 文件 31/31 与 TypeScript 检查通过。
- 下一步：Phase 5 Webview history/navigator、DOM 事件委托和撤回工具栏。
- 2026-07-15 Phase 5 开始前已复核 `readerApp.ts`、`readerState.ts`、`layoutEngine.ts`、样式与现有 Playwright harness；确认导航仍由直接函数调用管理，且 render 会重建 LayoutEngine。
- Phase 6 根因已定位：measure surface 仅手工复制有限 computed style，未与真实 page 共享完整容器身份和偏好属性；后续先以布局测试锁定再替换该同步方式。
- 错误：Phase 5 复核首次按不存在的 `src/test/layout` 和顶层 `test` 路径读取布局测试；已改为仓库级文件清单定位 `tests/layout`、`tests/fixtures/layout`，不重复失败路径。
- Phase 5 ReaderNavigator RED/GREEN：新增成功后提交、失败不入栈、LIFO 撤回跳过失效条目与会话 clear；3/3 单测通过。
- Webview 已接入同章/跨章 target、TOC fragment、正文事件委托、图片 opaque ID、关联 navigationState、generation/sourceRevision 与最多 50 条撤回历史；Playwright 端到端验证翻页→撤回和图片消息不含路径。
- Phase 6 布局 RED 证明旧 Range clone 会丢失出版物祖先结构且隐藏 surface 没有真实 page identity；GREEN 后 source/measure 复制 class、dataset、内联偏好与 CSS 变量，fragment 保留结构，并加入真实渲染溢出缩短防线。
- 220/280/360px × 8/24/64px 页边距矩阵、正文/页脚不重叠、末行不裁切与 surface identity Playwright 测试通过；Reader layout 10/10 通过。
- 首次 Phase 5/6 全量单测：44 文件中 43 通过、1 文件 2 项失败；失败均为旧 `typingPracticeIntegration` fixture 未纳入 undo 且仍使用无关联 navigationState，并非生产行为回归。
- 旧 fixture 已迁移到 v3 openBook → requestSection → correlated navigationState，目标文件 8/8 通过。
- Phase 7 文档已更新：README、指导文档、CHANGELOG 与实施计划说明安全图片预览、内部导航、撤回和无默认绑定位置命令。
- 最终门禁通过：`npm run compile`；Vitest 44 文件 208/208；Playwright 20/20（含零网络、安全、Git Log 回归、跨章原子失败/成功/撤回和 padding 矩阵）；`git diff --check` 退出码 0。
- 生成 `moyuplus-0.0.7-reader-navigation.vsix`，8 个发布文件、467.46 KB；内容审计无源码、测试、计划、source map、lockfile 或书籍文件。
- **Status:** complete。2026-07-16 用户使用真实 VSIX 与综合长书完成人工验收；未改版本、未推送、未发布。

### 2026-07-15 阅读器横向裁切与页码失效回归

- 用户在真实人工验收中发现阻断故障：Reader 右侧内容被裁切，右边距视觉失效，无法显示完整书籍，页数计算错误。
- 人工验收判定失败；`moyuplus-0.0.7-reader-navigation.vsix` 停止交付。
- 只读根因确认：分页 `fits()`、真实渲染修正和跨章 preflight 只检查 `scrollHeight/clientHeight`，未检查 `scrollWidth/clientWidth`；`.reader-content` 的 `overflow: hidden` 将横向溢出直接裁掉。
- 稳定复现：正常段落 9 页且无横向溢出；`nowrap` 与 `<pre>` 均被错误算作 1 页，实际内容宽度分别达到 34228px 与 24016px，而可视宽度仅 280px。
- 自动测试盲区：Reader padding 矩阵只使用自然换行段落，未覆盖 `nowrap`、`pre`、宽表格、连续长字符和横向 `scrollWidth` 断言。
- 当前进入设计门禁；生产代码尚未修改。
- 用户确认“完整可读优先于原版排版”，并批准方案 2：保留 EPUB 语义结构、删除出版物 CSS、由 MoyuPlus 统一排版。
- 已写入修复规格 `docs/superpowers/specs/2026-07-15-moyuplus-reader-canonical-layout-regression-design.md`；下一步按 brainstorming 门禁执行规格审查和用户复核，生产代码仍未修改。
- 独立规格审查结果为 Approved，无阻断问题；已采纳两项建议，明确源属性使用允许列表、包内 stylesheet 不进入 Webview，并明确 3 个宽度 × 3 个 padding 为完整 9 组矩阵。

## 2026-07-16 统一设置面板实施

- **Status：** 已实施并通过自动验收及真实 Extension Development Host 人工验收（2026-07-17）。

- 已确认设计规格已获用户批准并通过评审；本轮以工作区未提交的最新规格版本为权威输入。
- 已读取 brainstorming、frontend-design、planning-with-files 与 test-driven-development 约束；由于设计阶段已完成，本轮直接进入测试先行实施。
- 已建立 Phase S0–S5 实施记录。下一步先读取偏好模型、现有 Webview 消息/状态、VS Code shim 与测试夹具，为 Phase S1 写最小失败测试。
- 结构检查确认：两类偏好已有可复用 store/normalize；两套原地设置抽屉仍在 Reader bundle 中；VS Code shim 尚缺 WebviewPanel 与 configuration inspect/事件能力。
- 下一步按 Phase S1 先定义严格设置协议与快照模型测试，再实现最小纯模块；面板生命周期在协议 GREEN 后接入。
- 已核对 build/test 与 Reader 消息路径，确定新增独立 settings bundle，并用窄 `openUnifiedSettings` 请求连接既有 Reader/Git Log 入口。
- Phase S1 首个 RED：两个新测试模块最初因生产模块不存在无法收集；按 TDD 只补导出骨架后，协议 2 项与 Webview 状态 4 项均因功能缺失按预期失败。
- Phase S1 首轮 GREEN：严格消息白名单覆盖四类域、数值/枚举/颜色范围、额外字段与原型键；Webview reducer 已实现实例/stateVersion 过滤和旧响应不回滚新值。目标 2 文件 7/7 通过。
- SettingsAuthority RED/GREEN 完成：测试先锁定 22 项快照、全局/工作区/多根覆盖分离、两类偏好通知、Global 配置写入和整区恢复事务；目标 3 文件 11/11 通过。
- Phase S2 Panel RED/GREEN：单例、`mediaRoot` 限制、协议拒绝、旧实例屏障、风险确认、可见性刷新和原生快捷键 5/5 通过；扩展激活与 Reader Host 深链 15/15 通过。
- Phase S3 已新增独立 `settingsApp.js/css`：四分区、22 项控件、全局/覆盖分离、实验性文本、250ms 范围提交、状态 live region、681/680px 响应式与 forced-colors 样式。
- Phase S4 已删除 Reader/Git Log 原地设置抽屉与 draft 状态，两个按钮改发 `openUnifiedSettings`；状态/遗留栈/构建目标 26/26 通过。
- 设置布局首轮因 harness 未加载 CSS 失败；修正测试夹具后 5/5 通过。新增深链标题焦点与导航焦点测试先按预期失败，修复后通过。
- Phase S5 完成：整节恢复默认值加入事务级控件锁定；`npm run compile` 通过，完整单测 48 文件 231/231、Playwright 布局/隐私测试 34/34 通过，`git diff --check` 无空白错误（仅 Git 的 CRLF 转换提示）。
- 2026-07-17 人工验收反馈修复完成：设置入口从 `explorer/context` 移至 `editor/context`；快捷键分区移除不可靠的按键值回显；范围控件在拖动、防抖保存、响应和快照期间保持节点、焦点与滚动稳定；Reader 文字色和背景色默认跟随主题，自定义颜色可实时应用并恢复继承。
- 修订后最终门禁：`npm run compile` 通过；Vitest 49 文件 236/236；Playwright 布局/隐私测试 36/36；`git diff --check` 通过。
- 用户于 2026-07-17 确认真实 Extension Development Host 人工验收通过；统一设置面板状态改为 complete。
