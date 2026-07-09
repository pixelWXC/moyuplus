# 进度日志

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

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 4: 开发执行中；Phase 0 插件骨架、Phase 1 数据模型/存储层、Phase 2 TXT 文件服务与导入命令、Phase 3 阅读器 Webview 基础版、Phase 4 DOM 动态分页、实施计划 Phase 5 打字练习核心已完成自动验证和人工验证；当前目录已初始化 Git |
| Where am I going? | 下一步执行 Phase 6，处理 Enter/Tab 路由与设置 |
| What's the goal? | 根据 `指导文档.md` 启动可执行的开发计划 |
| What have I learned? | Phase 0 可用 TypeScript + Vitest 验证 extension activation；Phase 1 可用内存 Memento 测试 global/workspace state 读写；Phase 2 可用临时文件和 VS Code shim 测试 TXT 导入、编码读取和命令交互；Phase 3 可用 Webview shim 测试 provider 消息协议和 `ReaderSession` 持久化；Phase 4 可用 Webview HTML 合约测试防止动态分页退化为固定字符估算；Phase 5 可用扩展后的 VS Code shim 测试 inline provider、status bar 和命令菜单 |
| What have I done? | 已创建计划文件、设计规格、实施计划，并完成 Phase 0 插件骨架、Phase 1 数据模型与存储层、Phase 2 TXT 文件服务与导入命令、Phase 3 阅读器 Webview 基础版、Phase 4 DOM 动态分页、Phase 5 打字练习核心自动验证和人工验证；根据人工验证反馈补齐每行首尾空白裁剪开关 |

---
*后续每完成阶段或遇到错误都会更新。*
