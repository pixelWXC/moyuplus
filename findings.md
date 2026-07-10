# 发现与决策

## Requirements
- 用户要求：根据 [指导文档.md](D:/wxc_work_file/projects/harnessplace/moyuplus/指导文档.md) 启动开发计划。
- 当前阶段目标是先读取指导文档和项目现状，形成计划；在设计确认前不实施业务代码。
- 产品形态：运行在 VS Code 内的本地 TXT 阅读与自由打字练习插件。
- 阅读器：VS Code 侧边栏 Webview View，分页阅读，支持导入文件列表、上一页/下一页、字体大小、编码切换、阅读进度恢复。
- 分页：必须基于 Webview DOM 实际渲染高度测量，不能简单按字符数或固定行数估算。
- 打字练习：基于已导入 TXT，按物理行作为练习单位，在当前编辑器光标行提供 ghost text 行内提示。
- 输入校验：不做严格判题，不标红，不阻止输入，不做 WPM/正确率统计。
- 状态独立：阅读器当前文件/offset 与打字练习文件/行号完全独立，即使使用同一 TXT 也不同步。
- 快捷键：需要支持阅读器操作、打字练习开关、Enter/Tab 路由，且优先保护 VS Code 原生补全、snippet、换行和 Tab 行为。
- 存储：已导入 TXT 文件列表全局共享；阅读状态和练习状态按 workspace 独立。
- 非目标：联网同步、云存储、账号、复杂书架、标签分类、多阅读窗口、严格打字测速等。

## Research Findings
- 已读取 `planning-with-files` 技能说明：复杂任务需要维护 `task_plan.md`、`findings.md`、`progress.md`，并在发现和阶段变化时更新。
- 已读取 `brainstorming` 技能说明：任何功能创建、组件构建、行为修改前，必须先理解项目、澄清需求、提出方案并获得用户确认。
- Phase 0 前，仓库顶层只有 `指导文档.md` 以及计划文件，还没有代码脚手架。
- Phase 0 后，项目已有 TypeScript VS Code extension 骨架、`src/extension.ts`、VS Code launch 配置、compile/test 脚本和 Vitest 单元测试。
- Phase 0/Phase 1 执行时当前目录还不是 Git 仓库，`git status --short` 曾返回 `fatal: not a git repository`。
- 用户已在 2026-07-08 要求“从现在开始，启动git”，当前目录已执行 `git init`。
- 第一次读取 `指导文档.md` 时出现中文乱码，需要改用明确的 UTF-8 方式读取。
- 已用 UTF-8 成功读取 `指导文档.md`，需求内容完整。
- 技术风险最高的部分是 Webview DOM 动态分页、Inline Completion ghost text、Enter/Tab 与 VS Code 原生行为的兼容。
- `moyuplus.smokeTest` 已作为首个命令注册到 `package.json`，并由单元测试验证 activation 会注册该命令。
- `iconv-lite` 已作为运行时依赖安装，为后续 Phase 2 的 UTF-8/GBK TXT 解码预留。
- Phase 1 已完成 domain/storage 边界：`models.ts` 提供核心类型、默认值和归一化保护，`txtLibraryStore` 负责全局 TXT 索引，`workspaceSessionStore` 负责 workspace 阅读/练习 session。
- 已确认通过内存 Memento 可单元测试 VS Code `globalState`/`workspaceState` 风格的读写逻辑，不需要启动 VS Code。
- 损坏或旧形状状态采用“读时恢复默认/过滤非法项”的策略，不抛出异常阻断插件启动。
- Phase 2 入口已确认：新增 TXT 服务层应接入 Phase 1 的 `TxtLibraryStore`，提供 UTF-8/GBK 解码、workspace/external 来源判断、文件失效检查、全文读取和物理行读取；命令层负责 VS Code UI 交互与 store 更新。
- Phase 2 已完成：`TxtFileService` 提供 TXT 导入、读取、物理行切分、失效检查和移除记录；命令层注册 `moyuplus.importTxt`、`moyuplus.removeImportedTxt`、`moyuplus.checkImportedTxtFiles`。
- UTF-8 解码使用 fatal `TextDecoder`，避免非法字节被替换字符静默吞掉；GBK 解码使用已安装的 `iconv-lite`。
- 导入文件 ID 使用 file URI 的 SHA-1 派生值，同一路径重复导入会更新现有记录而不是创建重复项。
- Phase 3 已完成阅读器基础链路：`ReaderViewProvider` 复用 `TxtFileService.readFullText` 和 `WorkspaceSessionStore`，Webview 负责基础展示与交互，扩展主进程负责文件读取和 session 持久化。
- 阅读器基础版已支持从已导入 TXT 列表选择阅读文件、显示全文切片、上一页/下一页、字体大小调整，并保存 `ReaderSession.fileId`、`offset`、`fontSize`、`viewportSnapshot` 和 `pageHistory`。
- Phase 3 的分页仍是基础估算，用于跑通阅读链路；Phase 4 必须替换为基于 Webview DOM 实际高度测量的动态分页。
- 2026-07-08 人工验证确认 Phase 2/3 基础链路可用：Smoke Test、UTF-8/GBK 导入与显示、Reader 翻页、字体调整、Reload 恢复、失效文件检查/移除均通过。
- Phase 4 已完成 DOM 动态分页：Webview 使用隐藏测量容器同步正文宽度、字体、行高和内边距，用 `scrollHeight` 实际高度做指数扩展 + 二分查找，不再按固定字符数或固定行数切页。
- Phase 4 Webview 渲染后会回传 `pageRendered`，扩展主进程继续保存 offset、viewportSnapshot 和 pageHistory；上一页仍通过 pageHistory 返回刚才看过的页。
- Phase 4 已接入 `ResizeObserver` 和 window resize，侧边栏宽度变化后重新测量；字体调整通过 session state 重新渲染并保持当前 offset 附近恢复。
- Phase 4 已新增 Webview HTML 合约测试，防止后续回退到 `estimatePageSize`/`charsPerLine` 一类固定字符估算。
- 2026-07-08 人工验证确认 Phase 4 动态分页无异常：下一页无明显重叠、上一页可回到历史页、长行换行计入分页高度、字体和侧边栏宽度变化后仍恢复到当前位置附近。
- Phase 5 入口已确认：`TypingPracticeSession` 类型和 `WorkspaceSessionStore` 已存在，`TxtFileService.readPracticePhysicalLines` 已提供物理行读取，新增实现应集中在打字练习控制器、命令注册、Inline Completion Provider 和状态栏。
- Phase 5 测试需要扩展 `src/test/shims/vscode.ts`：当前 shim 只覆盖 command、webview、quick pick 和消息，尚无 inline completion provider、status bar item、input box 或文本编辑器位置模型。
- Phase 5 不需要修改 `manual-gbk.txt`、`manual-utf8.txt` 两个当前未跟踪文件；它们应保留给人工验证或用户用途。
- Phase 5 已实现的 ghost text 策略：Inline Completion Provider 读取当前编辑器光标前文本；如果练习行以该前缀开头，则只返回剩余部分，否则返回整条处理后的练习行。
- Phase 5 状态栏策略：仅练习开启且当前练习行可用时显示 `Typing: file.txt 当前物理行/总物理行`；点击状态栏打开菜单，支持下一行、重置、跳转和停止。
- Phase 5 对残留失效 session 的处理：如果 workspace 中保存的练习 `fileId` 已不在导入列表中，状态栏隐藏，Inline Completion Provider 返回空结果，不向 VS Code 抛出异常。
- Phase 5 人工验证反馈：除首尾空白裁剪配置缺失外，其余练习核心场景均无问题。已新增 `trimTrailingSpaces` session 字段和 `moyuplus.toggleTypingPracticeLineEdgeTrim`，状态栏菜单可切换首尾空白裁剪。
- 2026-07-09 用户复测确认首尾空白裁剪开关功能正常，Phase 5 打字练习核心人工验证通过。
- Phase 5 命令范围刻意不包含 Enter/Tab 路由；特殊键处理仍按实施计划留给 Phase 6，避免提前改变 VS Code 原生编辑行为。
- Phase 6 已完成自动验证：新增 `moyuplus.routeEnter` 和 `moyuplus.routeTab`，并通过 `src/commands/shortcutRouter.ts` 与现有练习控制器和 Reader provider 组合。
- Phase 6 Tab 路由读取 `moyuplus.typing.tabMode`：`completeRest` 按当前编辑器行前缀插入剩余练习文本，`replaceLine` 用当前练习行替换当前编辑器整行；无活动练习、无编辑器或当前行已经补全时回退 VS Code 原生 `tab`。
- Phase 6 Enter 路由读取 `moyuplus.enter.*`：默认 `insertNewLine=true`、`nextPracticeLine=false`、`nextReaderPage=false`，因此默认路由行为仍只插入真实换行；开启组合选项后会调用现有下一练习行命令并请求阅读器下一页。
- Phase 6 keybinding 采用默认关闭策略：`moyuplus.shortcuts.enableEnterRouter` 与 `moyuplus.shortcuts.enableTabRouter` 默认均为 `false`；Tab 额外要求 `moyuplus.typingPracticeActive`，并排除 `suggestWidgetVisible` 和 `inSnippetMode`，降低干扰 VS Code 原生补全/snippet 的风险。
- Phase 6 已在练习状态栏更新路径中同步 `moyuplus.typingPracticeActive` context key，使 `package.json` 中的 Tab `when` 条件不依赖 UI 可见性推断。
- Phase 6 阅读器下一页路由不能在扩展主进程直接重新计算 DOM 页范围，因此采用扩展向 Webview 发送 `{ type: 'command', command: 'nextPage' }`，再由 Webview 用当前 `currentRange` 回传 `nextPage` 的方式。
- Phase 6 阅读器 Webview 已增加 `Shortcuts` 按钮，点击打开 `moyuplus shortcuts` Settings 查询；完整插件内快捷键设置页仍留给 Phase 7。
- Phase 7 可复用现有阅读器 Webview，不必新增独立 VS Code 视图；当前 `Shortcuts` 按钮只会打开 Settings 搜索，尚不展示功能、当前绑定、启用状态或风险说明。
- `package.json` 目前仅贡献 Enter/Tab 两个默认 keybinding，且两者默认关闭；其余主要功能只能通过命令面板执行。因此“当前绑定”需要同时展示扩展贡献的默认绑定和用户自定义绑定，不能仅从 `package.json` 静态推断。
- 现有 `ShortcutConfig` 仍为空默认值，未接入配置读取；Phase 7 更适合使用 VS Code 的命令/键绑定查询能力生成只读状态，并通过标准设置/快捷键编辑器完成修改，避免自行维护第二套绑定存储。
- 当前异常反馈不完整：Reader Webview 已有“无导入文件”空状态；TXT 命令会弹出缺失文件与解码错误；首次开启练习尚无“真实写入当前编辑器文件”的一次性安全确认。
- `指导文档.md` 明确要求快捷键页不仅只读展示，还要允许配置：阅读器下一/上一页、关闭、打开/隐藏、切换文件、字号增减、练习开关，以及 Enter/Tab 组合行为；页面至少展示功能名、当前按键、启用状态、潜在冲突和动作说明。
- VS Code 稳定扩展 API 没有公开“解析所有当前生效键绑定”的接口。可靠方案应把自定义动作委托给 VS Code Keybindings 编辑器，并在插件页展示本插件贡献的默认绑定/启用条件；若要精确反映用户覆盖，需要读取并解析用户 `keybindings.json`，会引入跨平台、配置同步和 JSONC 合并复杂度。
- 2026-07-10 核对官方 VS Code Extension API：公开能力包括贡献 keybindings、执行命令和打开 Keyboard Shortcuts 编辑器，但没有读取当前解析后 keybinding 的稳定 API；官方也说明冲突取决于上下文规则和键盘布局，因此插件页应将“潜在冲突”视为风险提示，而不是声称能完整检测。
- Phase 7 适合新增一个独立 `shortcutSettings` 领域模块，向 Reader Webview 提供稳定的行模型（command、功能名、默认绑定、启用状态、风险、说明），Reader provider 只负责配置读写与打开原生快捷键编辑器，避免把清单逻辑继续堆进 `webviewHtml.ts`。
- Reader provider 已集中处理文件读取异常并把 `error` 发给 Webview；Phase 7 可在错误态附带“重新选择/切换编码/移除记录”动作，而无需改动 TXT 解码核心。
- 现有 Reader provider 只有 `requestNextPage` 公共动作，Phase 7 若要让全部阅读器功能可绑定，需要补齐 previous page、打开视图、切换文件、字号增减等命令入口；它们可以复用现有私有方法/Webview 消息，不需要复制分页算法。
- 现有 VS Code 测试 shim 的 `workspace.getConfiguration` 只有 `get`，Phase 7 的 Webview 启用开关与首次安全提示测试需要补 `update` 和配置变更记录；安全提示可用 `globalState` 保存“已确认”标记，符合仅首次提醒的要求。
- 当前练习启动顺序是“选择 TXT 后立即 start”；安全确认应插入在真正启动前，提供“继续/取消”选择，取消时不改 session、不显示状态栏。
- Phase 7 最终采用非阻塞的一次性警告，而不是确认弹窗：用户首次选定练习文件时明确看到真实文件写入风险，提示后继续启动，并通过 global state 防止重复打扰。
- 用户确认界面风格为“原生克制工具感”；已写入 `.impeccable.md`，具体原则是原生优先、信息克制、风险可见、状态清楚、无干扰反馈。
- 快捷键页使用 VS Code Settings 式扁平列表、主题令牌和主次按钮层级，并补齐 `:focus-visible`、`aria-live` 与 320px 窄侧栏布局。
- 2026-07-10 用户确认 Phase 7 人工测试通过；快捷键页、原生改键入口、首次安全提示和异常恢复操作可进入 Phase 8 验收。
- Phase 6 已通过自动验证：`npm test` 为 9 个测试文件、44 个测试通过，`npm run compile` 通过；2026-07-10 用户确认真实 Extension Development Host 中的人工测试全通过。
- Phase 6 人工测试准备中发现 VS Code Settings 的英文说明会阻碍理解；已将 Phase 6 相关设置说明改为中文，并给 `completeRest`/`replaceLine` 增加中文选项解释。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 先进行需求和项目发现 | `指导文档.md` 尚未读取，不能可靠确定实现范围 |
| 暂不修改业务代码 | 需要先完成设计确认门禁 |
| 推荐 MVP 垂直切片 | 当前从零开始，先贯通插件骨架、存储、阅读、练习和关键路由，便于尽早验证高风险交互 |
| 用户确认 MVP 垂直切片 | 可以进入正式设计/实施计划阶段 |
| Phase 0 从 TypeScript VS Code extension 骨架开始 | 当前无代码脚手架，必须先建立可编译、可在 Extension Development Host 启动的最小项目 |
| Phase 0 使用 Vitest 做最小单元测试 | 可在不启动 VS Code 的情况下验证 activation 注册 smoke command |
| Phase 1 优先建立数据模型与存储层 | 插件骨架完成后，先固定状态边界，避免后续 UI/命令直接操作 VS Code state |
| Phase 1 存储层接收 `StateMemento` 接口 | 让生产代码可接入 VS Code `globalState`/`workspaceState`，测试代码可用内存实现 |
| 默认打字练习配置使用 `completeRest` Tab 模式 | 默认更接近自然补全，后续快捷键阶段仍需避免默认劫持高风险 Tab |
| Reader/Typing session 分 key 存储 | 满足阅读状态与练习状态互不影响的核心约束 |
| 下一步进入 Phase 2 TXT 文件服务与导入命令 | 存储和模型已可承载导入文件索引与 session 状态 |
| 从现在开始使用 Git | 用户已要求启动 Git，当前目录已初始化为 Git 仓库 |
| Phase 2 采用服务层 + 命令层拆分 | 文件读取、解码和路径判断可脱离 VS Code UI 单元测试；命令层只承担 `showOpenDialog`、提示和注册职责 |
| Phase 3 可以直接复用 `TxtFileService.readFullText` | 阅读器基础版不需要重新处理编码或文件失效判断 |
| Phase 3 采用 `readerMessages` + `ReaderViewProvider` + `webviewHtml` 三段拆分 | 消息协议、扩展主进程状态处理和 Webview UI 分离，便于 Phase 4 替换分页算法而不改存储/文件读取边界 |
| Phase 4 分页继续放在 Webview 内 | 只有 Webview 能拿到真实 DOM 尺寸和换行高度；扩展主进程只保存 Webview 回传的 page range |
| Phase 4 保留 `ReaderSession` 数据结构 | 现有 `offset`、`viewportSnapshot` 和 `pageHistory` 足够支撑 DOM 分页恢复，不需要新增存储模型 |
| Phase 5 使用独立 `TypingPracticeController` | 控制器只依赖 TXT 服务和 workspace session，便于在不启动 VS Code 的情况下测试物理行进度和过滤逻辑 |
| Phase 5 Inline Completion 返回剩余文本 | 用户已经输入练习行前缀时，ghost text 不重复显示已输入部分 |
| Phase 5 首尾空白裁剪作为显式开关 | 默认保留 TXT 原文空白；需要忽略每行首尾空白时，通过命令或状态栏菜单切换，避免改变现有练习文本语义 |
| Phase 6 路由命令独立放在 `src/commands/shortcutRouter.ts` | 保持 `extension.ts` 只负责组合注册，并让特殊键路由逻辑集中在一个模块内 |
| Phase 6 router keybinding 默认关闭 | 特殊键拦截风险高，默认不改变 VS Code 原生 Enter/Tab；用户显式开启 Settings 后才生效 |
| Phase 6 Tab 默认仍使用 `completeRest` | 与 ghost text 的剩余文本策略一致，用户可通过 Settings 切到整行替换 |
| Phase 6 Enter 组合行为由 VS Code Settings 控制 | 用户可分别控制真实换行、下一练习行、阅读器下一页，不把组合动作硬编码到 session |
| 阅读器下一页路由通过 Webview command handoff 实现 | 当前页范围由 Webview DOM 测量产生，扩展主进程不应凭字符数估算下一页 |
| Phase 6 Settings 说明使用中文 | 当前使用者在人工验证中需要快速理解开关含义和风险；中文说明比英文配置描述更直接 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 初次读取技能文件路径错误 | 改用 `C:\Users\Purvar\.agents\skills\ok-skills\...` 下的实际路径 |
| `指导文档.md` 初次读取乱码 | 已用 `-Encoding UTF8` 重新读取成功 |
| Phase 0/Phase 1 时当前目录不是 Git 仓库 | 当时计划不依赖 Git；2026-07-08 用户要求启动 Git 后已执行 `git init` |
| 设计文档无法按流程提交 commit | 当时当前目录不是 Git 仓库，已跳过 commit 并记录；后续可按用户要求提交 |
| `npm install` 报告清理 node_modules 目录 EBUSY 警告 | 安装实际成功，`npm run compile` 和 `npm test` 后续均通过 |
| Phase 3 测试初次 GREEN 尝试中 Webview 消息异步处理未被测试等待 | `onDidReceiveMessage` 回调返回 `handleMessage` Promise 后，`receiveMessage` 可等待 session 写入完成 |
| 人工验证中 `MOYUPLUS READER` 显示“没有可提供视图数据的已注册数据提供程序” | `package.json` 中 Webview View contribution 必须声明 `type: "webview"`；缺失时 VS Code 会按 Tree View 处理并寻找 TreeDataProvider |
| Phase 6 目标 RED 测试暴露 VS Code shim 缺少配置、active editor 和内建命令记录能力 | 已扩展 `src/test/shims/vscode.ts`，支持 `workspace.getConfiguration`、测试编辑器 insert/replace、`commands.executeCommand`、`setContext` 和内建命令调用记录 |
| Phase 6 人工测试准备中 Settings 英文文案难以理解 | 已通过 package contribution 测试约束中文说明，并更新 `package.json` 的配置描述和 `tabMode` 选项解释 |

## Resources
- [指导文档.md](D:/wxc_work_file/projects/harnessplace/moyuplus/指导文档.md)
- [设计规格](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/specs/2026-07-08-moyuplus-design.md)
- [实施计划](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md)
- [package.json](D:/wxc_work_file/projects/harnessplace/moyuplus/package.json)
- [src/extension.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/extension.ts)
- [src/domain/models.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/domain/models.ts)
- [src/storage/txtLibraryStore.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/storage/txtLibraryStore.ts)
- [src/storage/workspaceSessionStore.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/storage/workspaceSessionStore.ts)
- [src/txt/txtFileService.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/txt/txtFileService.ts)
- [src/commands/txtCommands.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/commands/txtCommands.ts)
- [src/commands/shortcutRouter.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/commands/shortcutRouter.ts)
- [src/reader/readerMessages.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/reader/readerMessages.ts)
- [src/reader/ReaderViewProvider.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/reader/ReaderViewProvider.ts)
- [src/reader/webviewHtml.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/reader/webviewHtml.ts)
- [src/test/unit/storage.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/storage.test.ts)
- [src/test/unit/txtFileService.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/txtFileService.test.ts)
- [src/test/unit/txtCommands.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/txtCommands.test.ts)
- [src/test/unit/readerViewProvider.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/readerViewProvider.test.ts)
- [src/test/unit/packageContributions.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/packageContributions.test.ts)
- [src/test/unit/typingPracticeController.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/typingPracticeController.test.ts)
- [src/test/unit/typingPracticeIntegration.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/typingPracticeIntegration.test.ts)
- `C:\Users\Purvar\.agents\skills\ok-skills\planning-with-files\SKILL.md`
- `C:\Users\Purvar\.agents\skills\ok-skills\brainstorming\SKILL.md`

## Visual/Browser Findings
- 暂无。

---
*本文件会在每次关键发现后更新。*
