# 发现与决策

## 2026-07-13 缩放翻页与进度恢复根因

- 旧实现每次翻页都经过完整 reducer render，导致正文 DOM 和 Layout Engine 被销毁重建；它与 resize 的异步 animation-frame 重排存在竞态。
- resize 重排只更新 Layout Engine 内部页码，未同步 Webview 的导航能力和按钮禁用状态，因此视觉按钮可能持有旧状态。
- 返回书架只切换 Webview 视图，没有发送最后一帧 Locator，也没有等待防抖进度写入完成。
- Controller 虽读取持久化 Locator，但原协议只发 `initialSectionId`，章节内 progression 丢失。
- 决策：稳定重排统一回调、翻页采用非破坏性状态提交、退出采用 `closeBook(locator)+flush`、打开传递完整 `initialLocator`。
- 0.0.5 人工验收结论：TXT/EPUB 相关复测全部通过，未发现新的阻断问题；Reader v2 Phase 6 可以关闭。

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
| Reader v2 Phase 6 打包必须先清理 `out/` | esbuild 单文件 bundle 不会自动删除历史 `tsc` 产物；若不清理，VSIX 会夹带已删除的旧 Reader 模块。构建脚本现已在完整构建前递归清理 `out/`。 |
| Reader v2 Phase 6 错误消息不透传适配器异常 | EPUB/TXT 解析异常可能包含正文片段；ReaderController 现在仅向 Webview 发送结构化 code 与通用安全文案。 |
| Reader v2 Phase 6 VSIX 最小内容 | 最终包仅含 package.json、README/CHANGELOG、media 的 JS/CSS 和 out/extension.js，共 8 个文件、约 393 KB。 |
| Reader v2 Webview 需要显式书架握手 | `readerApp.ts` 启动后发送 `libraryReady`；Provider 必须返回包含 books、availability、progress、preferences 的 `libraryState`，否则 reducer 永远停留在 loading。 |
| css-tree ESM 入口不能直接打入 CommonJS Extension bundle | 其 `createRequire(import.meta.url)` 在 esbuild CJS 输出中变成 `createRequire(undefined)`，导致 VS Code activation 崩溃；使用包的 CommonJS export，并以实际 require bundle 测试约束。 |
| Reader v2 请求 ID 必须端到端透传 | Webview 生成的 openBook requestId 是丢弃过期响应的关联依据；Controller 不得另生成 ID，否则所有 bookReady/sectionReady 都会被视为过期。 |
| 真实 EPUB 常含显式 ZIP 目录条目 | `META-INF/`、`OEBPS/` 等目录需要安全校验后跳过索引，不能按普通文件路径的空尾段规则拒绝。 |

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

## 2026-07-14 Reader / Git Log 回归根因

- `GitLogModeCoordinator.bootstrap()` 在持久化模式为 active 时直接打开 Git Log，不调用 `refreshLibrary()`；因此“插件启动即 Git Log”会让 Webview 的书架 state 保持初始空数组。
- `ReaderViewProvider.restoreReader()` 当前只向 `modeReaderRestore` 发送目标 `book` 和 preferences，没有发送 snapshot 中的 `books`、`availability`、`progress`；恢复书籍后关闭阅读器会暴露未初始化的空书架。
- `ReaderController.capturePosition()` 在阅读器关闭后仍保留最后阅读位置，这是持久化职责所需；但 Provider/Coordinator 把它错误地当成“当前阅读页可见”的依据，导致书架进入 Git Log 后恢复旧书。
- 修复边界：Provider 负责当前可见 Reader surface，Controller 继续负责长期阅读位置；恢复消息必须是包含完整书架快照的原子消息。

## 2026-07-14 发布决策

- Git Log 内存缓存、生命周期加固和 Reader 回归修复作为补丁版本 0.0.7 一并发布。
- `package-lock.json` 根版本此前仍为 0.0.5，本次与 `package.json` 统一为 0.0.7。
- VSIX 继续只包含运行时 bundle、media、manifest、README、CHANGELOG 和许可相关文件，不包含源码、测试、计划、source map 或本地书籍。

## 2026-07-10 阅读器重塑需求

### 已确认的产品方向
- MVP 验证结束，后续聚焦文本阅读模块。
- 主界面改为书架，展示已经导入的 EPUB/TXT 文件。
- 导入记录必须支持删除，不能只增不减。
- TXT 能力保留，并作为 `TxtAdapter`；打字练习只能选择 TXT。
- 新增 `EpubAdapter`；阅读器至少支持 EPUB，用户同时表述“目前支持 epub、txt”，需进一步确认 TXT 是否仍可阅读。
- EPUB 阅读能力包括：打开、目录、章节阅读、上一章/下一章、字号调整、章节位置保存、自适应窗口、阅读 CSS 设置。
- 现有分页在内容最后一页仍可继续翻页且无提示，这是必须修复的显式边界缺陷。

### 规划假设（待确认）
- 书架、阅读会话和打字练习会共享统一的书籍索引，但使用不同能力过滤。
- EPUB 章节位置不能只保存字符 offset，至少需要稳定的章节标识与章节内定位信息。
- 自定义 CSS 应以受控设置项生成，必要时再提供高级 CSS 覆盖，避免任意 CSS 破坏阅读器控制层。
- 适配器应隔离格式差异：元数据、目录、章节内容、定位和能力声明由 Adapter 统一暴露。

### 用户已确认的范围决策
- 阅读器同时支持 EPUB 与 TXT。
- 打字练习只允许选择 TXT。
- `TxtAdapter` 与 `EpubAdapter` 共用阅读接口，但书籍能力声明必须让练习模块过滤掉 EPUB。
- 主界面继续使用 VS Code 侧边栏 Webview，不迁移到宽 Webview Panel 或多编辑器标签。
- 隐私性是硬约束：本地离线处理、无上传、无遥测；EPUB 内容不得执行脚本或主动加载外部网络资源。
- 侧边栏布局必须窄宽度优先，采用书架页与阅读页切换；目录和设置按抽屉/覆盖层呈现，不长期挤压正文。
- EPUB/TXT 导入均只保存原文件路径/URI，不复制到插件目录。
- 书架删除的语义固定为“移除导入记录”，不得删除或修改用户磁盘中的原文件。
- 原文件移动或删除后，书架显示失效状态，并提供重新定位或移除记录的恢复操作。
- TXT 采用整本 DOM 动态分页；EPUB 采用章节内 DOM 动态分页。
- EPUB 章节末页执行下一页时自动进入下一章并提示章节名；上一页在章节开头时对称进入上一章末页。
- 全书最后一页不再推进到空白位置：下一页按钮禁用，快捷键/Enter 路由也不得推进，并提示“已读完本书”；书首边界对称处理。
- 首版阅读样式通过受控设置与 CSS 变量实现，不提供任意原始 CSS 输入框。
- 样式范围包括字体、字号、行高、字距、文字/背景色、段间距、页内边距、对齐方式和预设主题；修改后即时预览并持久化。
- 会影响分页的样式调整必须触发 DOM 重新测量，并围绕原定位恢复，不能把读者送回章节开头。
- 阅读进度按书籍保存于本机全局状态，跨 VS Code workspace 共享；同一本书恢复上次章节与章节内位置。
- 打字练习 session 继续保存在 workspaceState，与全局阅读进度保持独立。
- 演进路线选择“阅读模块整体重写”，允许最大改动面，不要求保留现有 Reader 原生测试结构或追求最小 diff。
- 最大改动面仅限本次阅读器/书架/格式导入与相关状态边界；TXT 打字练习的产品能力、旧用户导入数据迁移和隐私约束仍需保留。

### 总体架构评审反馈
- 动态分页不属于纯领域 `Reader Engine`：DOM 尺寸、字体和容器变化驱动的测量应由 Webview 内的 `Layout Engine` 负责。
- `Reader Engine` 保留格式无关的逻辑导航、章节序列、书首/书尾与跨章状态转换；Layout Engine 回报可见范围和页边界。
- `ReadingLocator` 必须是可扩展的判别联合类型；格式专属锚点之外同时持久化 `progression`，在锚点失效、内容轻微变化或迁移失败时降级恢复。
- TXT 不能永久建模为单一虚拟章节；`TxtAdapter` 应通过可替换分章策略产生 1..N 个稳定虚拟章节，单章仅为 fallback。

### 已确认设计：总体架构 v2
- 用户确认 Webview Layout Engine / Reader Engine / Adapter Registry / 三类 global store / workspace typing session 的分层。
- 后续数据模型必须保持这些边界，不把 DOM 分页逻辑重新塞回扩展宿主的 Reader Engine。

### 已确认设计：数据模型与 Adapter 合约
- 用户确认稳定随机 bookId、联合 Locator、多级 progression fallback、BookAdapter/BookHandle、TxtSectionizer、EpubAdapter 清洗边界和 v1→v2 数据迁移，无需调整。

### 已确认设计：侧边栏信息架构
- 用户确认书架页/阅读页切换、目录与设置覆盖抽屉、章节和页导航分层、TXT 菜单启动练习、删除确认及窄宽度适配，无需调整。

### 已确认设计：运行时、错误与隐私
- 用户确认请求 token、跨章协议、内存资源生命周期、CSP、EPUB 主动内容隔离、错误恢复矩阵和进度写入策略，无需调整。

### 已确认设计：测试、阶段与验收
- 用户确认六阶段整体重写路线、真实 Chromium Layout Harness、新 EPUB 安全 fixtures、隐私自动验证和最终验收矩阵。
- 全部设计章节已经通过用户确认，正式规格已写入 `docs/superpowers/specs/2026-07-10-moyuplus-reader-redesign-design.md`。

### 规格评审第 1 轮
- 审查发现 4 个阻断规划的问题：持久化 textQuote 与隐私冲突、首次 open 的 sectionId 必填矛盾、v1 TXT 编码/来源无 v2 模型落点、未定义 FutureLocator。
- 已修订为：textQuote 仅可作为内存提示且持久化前剥离；open 只要求 requestId+bookId，选章后才要求 sectionId；BookRecord 增加 source 和格式判别 formatData；Reader v2 Locator 联合封闭为 TXT/EPUB。
- 采纳建议：用 SectionRef.progressionWeight 统一 bookProgression 计算；用户自定义标题正则移出 v2 首版，仅保留 Sectionizer 扩展点。

### 规格评审第 2 轮
- 结果：Approved，无阻断问题。
- 已把审查建议落实为显式测试断言：持久化前剥离内存文本提示；迁移测试覆盖 source 和 formatData.encoding。

### 实施计划依赖核对
- `yauzl` 官方文档提供基于 central directory 的异步读取、Promise/async iterator、逐条 lazy 处理、entry size 验证和文件名安全校验，适合 Reader v2 的 EPUB ZIP 边界；计划采用它并额外实施条目数、累计大小和压缩比限制。
- `fast-xml-parser` 官方仓库明确支持 XML 语法验证、XML→JS、属性和顺序保留，适合 container.xml、OPF、NCX/nav 的结构解析；Reader v2 仍需在解析结果之上做显式 schema 校验。
- `parse5` 是 WHATWG HTML 兼容的 Node HTML 解析/序列化工具，适合把 EPUB XHTML 转成 AST 后做自定义白名单清洗。
- `css-tree` 提供 CSS AST 解析、遍历、生成和语法匹配，适合删除 @import/url/Raw 节点并执行声明白名单。
- `esbuild` 用于把独立 Webview TypeScript/CSS 打成浏览器 bundle，避免继续维护单个内联 HTML/JS 巨型字符串；扩展宿主仍由 tsc 编译。
- `@playwright/test` 官方支持只配置 Chromium project 和 webServer，用于真实 DOM Layout Harness；浏览器安装作为显式开发步骤，不进入 VSIX 运行时依赖。
- 为吸收最新解析依赖的 ESM/CJS 差异，实施计划决定由 esbuild 同时生成 Extension Host CommonJS bundle 和 Webview browser bundle；`tsc --noEmit` 仅做严格类型检查，`vscode` 保持 external。
- 正式实施计划已写入 `docs/superpowers/plans/2026-07-10-moyuplus-reader-redesign-implementation-plan.md`，包含 6 个 Phase、23 个测试先行任务、停止条件和完成定义。

### 需要从代码验证
- 现有 `TxtLibraryStore` 是否已具备移除记录但 UI 未暴露。
- 现有 `ReaderSession`、`offset`、`pageHistory` 与章节定位模型的耦合程度。
- 现有 Reader Webview 是否位于侧边栏以及是否适合新书架/目录/阅读布局。
- 打字练习是否直接依赖 TXT store/service，迁移到统一书架时需要怎样兼容。

### 第一轮代码盘点
- 当前是 TypeScript VS Code 扩展，Reader 以 Explorer 下的 `WebviewView` 形式存在；新书架与目录若继续塞在侧边栏，会受窄宽度约束。
- `TxtLibraryStore.remove()`、`TxtFileService.removeImportedFile()` 与 `moyuplus.removeImportedTxt` 命令已经存在，因此“不能删除”主要是书架/Reader 缺乏可发现的删除入口，而不是底层完全缺能力。
- 当前导入只保存原文件 URI，不复制文件；所谓删除实际上是“移除导入记录”，不会删除用户磁盘原文件。
- 数据模型完全以 `ImportedTxtFile` 为中心；需要迁移为通用 `BookRecord`/`LibraryStore`，同时保留旧 key `moyuplus.txtLibrary.v1` 的一次性迁移。
- `ReaderSession` 以 `fileId + offset + pageHistory` 表示位置，只适合纯文本；EPUB 需要 `bookId + chapterId/href + 章节内 locator`。
- `WorkspaceSessionStore` 当前每个 workspace 只保存一个 Reader session；“保存章节位置”更适合按书籍保存位置，否则切书会覆盖另一书的位置。
- 打字练习控制器由 `TxtFileService` 注入，天然限制 TXT；重构时可以继续依赖 `TxtAdapter` 或专门的 `TypingSource` 能力，避免 EPUB 进入练习选择器。
- 当前依赖只有 `iconv-lite`，尚未选择 EPUB 解析库；EPUB 是 ZIP 容器，需处理 OPF/container.xml、manifest、spine、nav/NCX、资源 URL 与 HTML 清洗。

### Reader 与练习链路盘点
- `ReaderViewProvider` 直接依赖 `TxtFileService`，状态消息一次发送整个 TXT 文本给 Webview；EPUB 不能沿用“整本书全文一次推送”，应改为按章节请求/加载。
- 末页缺陷原因已经定位：Webview 在末页仍发送 `nextPage`，Provider 将 `offset` 保存为 `text.length` 并继续发状态；Webview 随后渲染空切片。当前没有 `hasNextPage/isAtEnd` 状态、禁用按钮或“已读完”反馈。
- `goToPreviousPage()` 在没有历史记录时也只是静默刷新；新设计应对首页/第一章边界采用一致反馈策略。
- Reader Webview 内其实已有“移除导入记录”按钮和消息，但它主要作为当前文件失效时的恢复动作；书架缺少每本书可见的管理操作与删除确认，因此用户感知仍是“只能添加”。
- 练习控制器使用很窄的结构接口（列表 + 读取物理行），迁移时可保留兼容 facade；打字练习无需理解 EPUB 章节模型。
- 当前 Reader 选择文件、导入、快捷键设置与正文渲染全部集中在同一个 Webview/Provider，重塑时应拆成书架、阅读应用服务、格式适配器和阅读视图状态，避免 EPUB 逻辑继续堆入单文件。
- 现有自动测试覆盖 TXT 翻页、session、缺失文件恢复和 Webview HTML 合约，但没有末页/首页边界测试；这应成为重塑的第一批回归测试。
- Reader v2 Adapter 以安全文档为边界：TXT 输出 HTML 转义文本；EPUB 只输出 parse5/css-tree 清洗后的 XHTML/CSS 与已验证内部资源引用。
- EPUB Archive 不创建解压目录：yauzl 以 central directory、lazy entry 和逐 entry stream 读取，并在索引与实际 stream 两层执行安全限制。
- TXT 虚拟 section ID 由规则版本、边界和边界内容摘要派生；标题缺失的大文件按稳定上限分段，小文件与空文件单章 fallback。

## 2026-07-10 Reader v2 Phase 3 发现

- 旧 Reader 消息类型仍被现有 `ReaderViewProvider` 使用；Phase 3 新增 v2 严格协议并暂留旧类型，Phase 4 重写 Provider 后再删除旧协议，避免阶段提交不可编译。

## 2026-07-10 Reader v2 Phase 4 发现

- ReaderViewProvider v2 可保持为薄边界：Webview 入站先经过 v2 runtime guard，再按意图分派给 Controller；Provider 不读取书籍正文或直接操作 Adapter。
- 严格 CSP 可同时支持构建产物与离线资源：脚本和样式均使用每次 HTML 生成的新 nonce，图片/字体仅允许 `blob:`/`data:`，连接、frame、media 明确为 `none`。
- `localResourceRoots` 只需扩展的 `media` 目录；书籍原始目录和文件 URI 不应成为 Webview local root。

- `LibraryService` 通过扩展名确定首选 Adapter，但以 `inspect` 实际成功为准并回退其他 Adapter，因此可处理扩展名伪装或缺失。
- 移除事务只清 BookRecord、ReadingPosition、Reader/typing 引用；服务不持有也不调用任何源文件删除能力。
- 重定位先重新探测格式，仅允许与原记录同格式，再更新 URI/updatedAt；bookId 和独立 ReadingPosition 保持不变。
- `ReaderController` 用单调 requestId 隔离切书、section generation 隔离切章；底层 Adapter API 暂无 AbortSignal，因此 AbortController 用于生命周期取消，迟到的 BookHandle 仍需显式 dispose。
- 阅读进度只保留最新 pending position，并由 debounce 或 flush/dispose 落盘，避免高频 layoutStable 写 Memento。
- Playwright `file:` Harness 可直接加载 Webview bundle 并使用真实 Chromium DOM，足以验证分页测量而无需 Extension Host DOM shim。
- Webview bundle 静态检查不能用宽泛的 `node:` 或 `//` 正则：对象属性和 esbuild 注释会误报；应检查真实 `require/import` 的 `node:` 形式和 `http(s)://` URL。
- 章节末页空白缺陷通过能力状态根治：最后一个非空页面为 `isSectionEnd`，`nextPage()` 返回 false 且不改变渲染内容。
- 连续重排围绕当前页起始 offset 恢复；animation-frame 合并使多次字体、resize 和 Preferences 事件只触发一次测量。
- 书架状态适合保持为纯 reducer/view model：宿主只需发送书籍、可用性与进度，Webview 统一派生格式、失效状态和允许动作，避免 EPUB/TXT 能力判断散落在 DOM 事件中。
- 移除确认采用 Webview 内联确认区并明确“不删除原文件”；这既避免阻断式浏览器对话框，也让文件所有权约束在危险操作旁持续可见。
- Task 4.5 的既定 UI 边界：侧边栏内书架/阅读双页；目录和设置覆盖正文，关闭后恢复完整正文并重排；UI 只发送意图和消费能力状态，Layout Engine 仍是唯一分页实现。

## 2026-07-13 Git Log Reader 发布

- 项目版本由 0.0.5 提升至 0.0.6。
- `npm run package` 通过：37 个单元测试、11 个布局测试全部通过，并生成 `moyuplus-0.0.6.vsix`。
- VSIX 内容包含最新 README、CHANGELOG、package manifest、Webview bundle 和 Extension Host bundle。
- `vsce ls` 因本机未安装 yarn 无法单独执行；不影响 `vsce package` 成功完成。
- `.impeccable.md` 已提供完整设计上下文：面向 VS Code 内轻量阅读/练习用户，视觉语气为原生、克制、可靠，必须使用 VS Code 主题令牌且不引入外部字体或装饰性视觉。
- 阅读 UI 每次 reducer 渲染都会替换正文 DOM，因此 Layout Engine 必须随新 viewport 重建，并以当前 progression 恢复位置；不能让 Engine 持有已脱离文档的旧 viewport。
- Controller 的相邻章节导航以打开时的 section 顺序为唯一依据；越过首尾只发送 `bookStart`/`bookEnd` 正常状态，不将边界记录为错误。

## 2026-07-14 Git Log 内存缓存实施发现

- 正式设计与实施计划已经分别由提交 `e3cc372`、`7c0e60f` 固化；本轮用户明确要求执行计划，可直接进入测试先行实现。
- 当前工作树在实施开始时干净，基线版本为 0.0.6。
- 计划要求新增 `gitLogQuery.ts` 与 `gitLogRefreshController.ts`，Provider 只保留单条缓存、单个 UI session、单调 mode generation 与幂等 dispose。
- 当前仓库已有 37 个单元测试文件和独立 Git Log Chromium 布局测试，适合按目标测试→全量单测→布局→compile 的顺序回归。
- 旧协调器使用 `showGitLoading()` 后再 `sessions.start()` 的两阶段协议，等待 `postMessage` 时 hide/exit 会让迟到 continuation 仍启动查询；需合并为 Provider 的原子 `openGitSession(sessionId)`。
- 旧 Provider 的 `cancel()` 会直接 abort 查询，Webview dispose 还会调用协调器 dispose；这与“UI detach 后后台刷新可完成并写缓存”的新生命周期冲突。
- 现有 VS Code shim 已区分 visibility 与 Webview dispose，但 `postMessage` 总是立即 resolve；Provider 竞态测试需要加入逐调用 deferred delivery 控制。
- `registerReaderView()` 当前只注册 Webview provider/commands，没有把 Provider 自身作为 extension-level disposable 注册；需新增独立 subscription 并同步更新 activation 订阅数量。
- 最终实现使用一个 `gitCache`、一个 `gitUiSession`、一个 `active` job 和一个 `pending` snapshot；代码结构本身不包含多仓库 Map、session 历史或订阅者数组。
- Webview 顶层模式统一使用 Provider 单调递增 generation；`modeInvalidated` 先进入 boot 并释放 GitLogView，迟到或重复 generation 被拒绝。
- 最终全量自动验证为 39 个 Vitest 文件 180 个测试、13 个 Chromium 布局/隐私测试全部通过，TypeScript、生产构建和 `git diff --check` 通过。
