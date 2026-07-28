# 发现与决策

## 2026-07-15 长书性能回归与图片入口

- 性能回归主因不是 eager pagination 本身，而是当前 `fragment()` 在每个 fits 二分候选中 `cloneNode(true)` 整章后遍历/裁剪；同一约 37k 夹具一次分页触发 1039 次整树深克隆。
- 恢复 `Range.cloneContents()` 后必须重建到 `.moyuplus-book-content` 的必要浅祖先，才能同时保留段落、`pre/code`、表格、列表语义和统一正文 CSS；直接退回 0.0.6 的裸 Range 结果会丢失 canonical wrapper。
- Range 修复后剩余开销来自 text span 线性查找和每页重新读取整章 `textContent`；二分定位与一次缓存使交替中位数从 0.0.6 的 1.53 倍降至 0.446 倍。
- `openDrawer`/`closeDrawer` 是纯 overlay 状态，走全量 `renderReader()` 会无谓 dispose/recreate Layout Engine；增量同步后目录成本仅与目录节点数有关，不再与正文长度有关。
- 跨章原子性不能靠“轻量预检成功”保证：候选必须在 staging 完整分页一次，成功后直接提升同一实例，失败时连 toast 也必须增量更新，否则提示本身会替换旧正文节点。
- `attachTo()` 通过移动 staging 的当前 fragment、重新绑定 viewport/onReflow 并移除 staging 完成提升；不得 dispose 已提升候选的 source/measure，也不得再调用 `dispatch(selectSection) -> renderReader()`。
- 用户实测统一排版版本在多章节长书初始化、打开目录以及第一章链接跳转到末尾附录注解时出现明显卡顿；旧版本没有该问题。
- 图片安全预览行为保留，但正文入口应改为普通超链接文字外观，不使用白色按钮视觉。
- 当前阶段只读诊断，设计批准前不修改生产实现。
- `render()` 在任何 Reader 状态变化时都会调用 `renderReader()`；打开目录只是一次 drawer state 变化，却会销毁现有 `LayoutEngine`、重建整页 DOM，并重新对当前整章分页。这解释了“打开目录很慢”，目录本身不是唯一成本。
- `LayoutEngine.paginate()` 从 offset 0 循环到章节全文结尾，初次打开只显示第一页也会预先计算所有页；章节越长，首屏等待越久。
- 跨章注解收到 `sectionReady` 后，会先用 `resolveTargetOffset()` 解析整章 DOM，再用 staging `LayoutEngine.setContentAtOffset()` 对目标整章完整分页作 preflight，随后 `dispatch(selectSection)` 再创建正式 Layout Engine 并完整分页一次。远距离附录因此至少执行两次全章分页和多次完整 DOM 克隆/二分测量。
- Controller 初次打开只读取 package/TOC/section 元数据，然后按需读取初始 section；多章节本身不会主动读取所有正文，主要瓶颈位于 Webview 的同步全章分页与无差别重渲染。
- 图片入口仍由 sanitizer 生成语义正确的 `<button type="button">`，但 CSS 只设置了换行，没有重置浏览器按钮外观，所以在浅色主题中显示为白色按钮。可保留键盘/辅助技术语义，仅用 CSS 呈现为 VS Code 文本链接。
- Layout Engine 的 source/measure 克隆都在 document 中，性能诊断和正式点击处理必须限定可见 `#reader-content`；这是测试选择器问题，不是重复正文渲染到用户页面。
- 当前 Chromium 基线（280×420、约 39k HTML、约 152–160 页）：首次 sectionReady 同步阻塞约 509ms；打开目录因重建并重分页同章约 363ms；跨章跳到章尾注解约 894ms。该规模已接近 1 秒，真实数十万字符章节会线性/更差放大为明显冻结。
- 跨章耗时约为首次分页的 1.75 倍，与“staging preflight 全章分页 + 正式全章分页”重复工作吻合；目录耗时与同章重新分页吻合。
- 用户决定本轮暂缓性能修复，只交付图片入口文本链接样式与真实 VSIX 测试包。
- 图片链接样式规格复核通过；采纳建议明确普通/hover 主题变量及独立产物名 `moyuplus-0.0.7-image-link.vsix`。
- 最终测试包内容核对通过，未包含源码、测试、计划、source map、lockfile 或书籍文件；性能热路径保持原样，按用户决定延期。

## 2026-07-15 统一排版与分页回归修复实施发现

- 用户已明确批准 `docs/superpowers/specs/2026-07-15-moyuplus-reader-canonical-layout-regression-design.md`，brainstorming 设计门禁已满足。
- 当前工作区包含上一轮资源、内部导航、图片预览与布局边距实现的大量未提交修改；本轮必须在其上增量工作，不清理、不重置、不覆盖。
- 实施边界：EPUB sanitizer 移除出版物 CSS/表现属性；Reader CSS 提供唯一正文排版；Layout Engine 的 measure/render/preflight 统一验证 `scrollHeight` 与 `scrollWidth`。
- 设计要求严格 TDD：先新增 sanitizer、sourceRevision、横向溢出矩阵和真实 reader-app harness 回归测试并观察预期失败，再修改生产代码。
- 当前 sanitizer 仍保留并重写 `<style>`，保留 inline `style` 与任意 `class`，且依赖 `css-tree` 白名单；这与获批的“保留语义、移除表现”边界直接冲突。
- 当前 EPUB `sourceRevision` 仍使用 `sanitizer-v2`。
- `LayoutEngine.fits()`、真实渲染修正和二分修正均只检查纵向 `scrollHeight/clientHeight`；三处都需通过一个共享双轴谓词收敛。
- 当前布局测试只断言纵向几何；既有 harness 已暴露 page/hidden surfaces，适合小幅扩展 `scrollWidth/clientWidth`、完整页文本和真实 app 几何观测。
- `reader-harness.html` 目前使用自包含布局 CSS，并故意让 `.publication` 产生大字号；可将它调整为加载真实 `media/readerApp.css`、使用 `.reader-content > .moyuplus-book-content` 结构，同时保留专用 shell/footer 几何。
- `reader-app-harness.html` 已走真实 Reader v3 消息与完整应用渲染，适合加入一个带 `style/class/width/nowrap/pre/table` 的完整 EPUB section 场景，以防只在独立 Layout Engine fixture 通过。
- `preflightSection()` 也仅检查纵向边界；因此双轴共享判断需要从 `layoutEngine.ts` 导出或放入可复用函数，让 app preflight 复用而不是复制逻辑。
- Reader 页面偏好由 `applyReaderPreferences()` 写入 page 本身；分页隐藏 surface 会复制 page 的 class、dataset、inline style 与 CSS 变量，现有结构可继续保留。
- Sanitizer GREEN 采用源属性明确允许列表；源 `class/style/data-*` 与表现属性全部丢弃，内部链接在过滤后再由 MoyuPlus 生成安全 `data-moyuplus-*`，图片按钮仍由 sanitizer 自己生成专用 class/data。
- `sourceRevision` 已提升到 `sanitizer-v3`；目标 sanitizer/adapter 测试 6/6 通过。
- 双轴谓词与统一 CSS 实施后，3×3×3 独立布局矩阵已通过；真实 app 首次复验暴露的是夹具仍有下一章而非排版失败，诊断显示正文总长 5957，前 25 页边界连续且最后一页起点 5949。
- 将真实 app 场景修正为单章后，测试进一步发现首屏 `scrollHeight=340`、`clientHeight=318`：`renderReader()` 在 footer 挂载前创建 Layout Engine，初次分页使用了多 34px 的过时高度。修复策略是先挂载完整 grid（含 footer），再测量分页。
- `css-tree` 已不再有运行时代码引用；以 build contract RED/GREEN 删除其 runtime/type 依赖，避免继续携带已废弃的出版物 CSS 解析路径。
- TXT Adapter 与 EPUB sanitizer 都保证顶层 `.moyuplus-book-content`；全量布局中唯一失败的旧 resize fixture 直接传 `<p>`，因此没有命中新的统一样式。修正 harness 自动补齐 wrapper 后即可用原严格阈值验证真实契约。
- Resize 复验确认旧“progression 不后退超过 8%”断言受页密度影响：统一样式下重排页更短，页起点比例可后退约 10%，但原 UTF-16 页首锚点仍完整落在新页 `[startOffset,endOffset)` 内。测试已改为直接验证该精确不变量。
- 最终 VSIX 内容核对通过：只有 8 个运行时/说明文件，未带入任何开发或用户内容；新产物使用独立文件名 `moyuplus-0.0.7-canonical-layout.vsix`，不会覆盖失败的 `moyuplus-0.0.7-reader-navigation.vsix`。

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
- `package.json` 贡献的默认 keybinding 不能代表考虑用户覆盖、冲突与 `when` 条件后的最终绑定，因此自制设置页不应将静态值展示成“当前绑定”。
- 现有 `ShortcutConfig` 仍为空默认值，未接入配置读取；Phase 7 更适合使用 VS Code 的命令/键绑定查询能力生成只读状态，并通过标准设置/快捷键编辑器完成修改，避免自行维护第二套绑定存储。
- 当前异常反馈不完整：Reader Webview 已有“无导入文件”空状态；TXT 命令会弹出缺失文件与解码错误；首次开启练习尚无“真实写入当前编辑器文件”的一次性安全确认。
- `指导文档.md` 明确要求快捷键页不仅只读展示，还要允许配置：阅读器下一/上一页、关闭、打开/隐藏、切换文件、字号增减、练习开关，以及 Enter/Tab 组合行为；页面至少展示功能名、当前按键、启用状态、潜在冲突和动作说明。
- VS Code 稳定扩展 API 没有公开“解析所有当前生效键绑定”的接口。最终方案把实际绑定、冲突和删除全部委托给 VS Code Keybindings 编辑器，插件页只展示动作说明与风险，不解析用户 `keybindings.json`。
- 2026-07-10 核对官方 VS Code Extension API：公开能力包括贡献 keybindings、执行命令和打开 Keyboard Shortcuts 编辑器，但没有读取当前解析后 keybinding 的稳定 API；官方也说明冲突取决于上下文规则和键盘布局，因此插件页应将“潜在冲突”视为风险提示，而不是声称能完整检测。
- 独立 `shortcutSettings` 领域模块向设置 Webview 提供稳定的行模型（command、功能名、启用状态、风险、说明），宿主只负责打开原生快捷键编辑器；模型不携带推断性的绑定值。
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

## 2026-07-15 阅读器资源、内部导航与分页边距

- 最新已确认规格是 `docs/superpowers/specs/2026-07-15-moyuplus-reader-resources-navigation-layout-design.md`，提交为 `4652ba1`；7 月 14 日 Git Log 缓存计划已经发布完成，不是本轮实施目标。
- 用户已确认最新方案并要求开始实施，因此已生成对应文件级、测试先行实施计划，无需重复设计审批。
- 工作树开始时只有未跟踪 `.superpowers/` 可视化伴侣产物；这些属于既有用户文件，必须保留。
- 当前分支 `master` 比 `origin/master` 超前 1 个设计提交；本轮不自动提交、推送或发布。
- 首次结构读取证明 EPUB 实现路径不能凭模块名推断；后续以 `rg --files` 的实际结果为准。
- Reader 协议当前是 v2；Host 已有私有 `sectionGeneration` 但 `sectionReady` 和 Webview envelope 尚未携带 generation。`navigationState` 目前只上报 `canNextPage`。
- `SafeSectionDocument.localResources` 当前仍包含 archive `path`，与新规格“不向 Webview 暴露路径”冲突；EpubBookHandle 也会给图片回退 `application/octet-stream`，本轮必须移除。
- Webview 当前直接由几个函数管理翻页/切章，`LayoutEngine` 已暴露 UTF-16 start/end offset，可在其上建立位置历史，不必重写分页算法入口。
- previous/next Host 命令和快捷键设置项已经存在且无默认 keybinding；新增 undo 可沿同一 Provider 命令路由接入。
- package 当前没有 customEditors contribution，VS Code shim 也没有 CustomReadonlyEditorProvider/Uri.parse/openWith 生命周期能力，图片预览 Phase 必须先补可控 shim 测试。
- EPUB sanitizer 当前把合法图片改写为 `moyuplus-resource:<archive path>` 并输出 path/kind；内部链接一律降为当前页 `#fragment`，因此跨章目标信息丢失。
- `parseEpubPackage` 已保留 manifest `mediaType`、可读 spine section 和 TOC fragment；Phase 2 可在 Adapter 层构造 path→section 与 path→图片声明索引，不需要重写 OPF/NCX 解析主流程。
- `EpubArchive.read()` 已执行单 entry、总大小和压缩比限制并返回 Buffer；资源读取应复用它，不能新开绕过策略的 ZIP 读取路径。
- fixture builder 已支持 Buffer 条目，足以生成最小 raster/SVG EPUB 样本，无需新增二进制 fixture 文件。
- 项目锁定的 `@types/vscode` 1.92 已包含 `CustomReadonlyEditorProvider`, `CustomDocumentOpenContext`, `WebviewPanel` 和 `window.registerCustomEditorProvider`，无需新增运行时依赖。
- 现有 Reader HTML 已采用随机 nonce 与离线 CSP；Image Preview 应独立生成更窄 CSP，只保留 `img-src blob: data:`，不需要扩展 media localResourceRoots。
- Vitest 通过 alias 将 `vscode` 指向本地 shim；预览服务测试需要扩充 shim 的 custom editor 注册、panel 和 `Uri.parse`，不应 mock 生产类内部实现。
- ReaderController 已有单调 `sectionGeneration`，但成功 section 只向 Webview 发 sectionId；把 generation 加入 `sectionReady` 后可直接作为图片请求和位置命令的关联令牌。
- ReaderViewProvider 当前用未关联的 `{type:'navigationState', canNextPage}` 维护单一布尔值，并允许 previousPage 在任意 View 状态发送；Phase 4 需要改为关联的三能力状态并以 `readerPageActive` 作为最后防线。
- 三个位置命令都应由 `registerReaderView` 注册；现有 previous/next 已在该边界，undo 可复用同一命令通道且不进入 shortcut router。
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
- 2026-07-15 Phase 5 结构复核确认 `readerApp.ts` 仍在每次 reducer render 时销毁并重建 `LayoutEngine`，TOC 只按 `sectionId` 选章，正文没有事件委托；导航接入必须显式保存 generation、sourceRevision、资源声明和待提交位置，避免把加载中间态误写入历史。
- `LayoutEngine` 当前只同步少量 computed-style 白名单，隐藏 measure surface 没有复制真实 page 的 class、dataset、完整内联偏好或 CSS 变量；这正是 Phase 6 测量面与渲染面不一致的实现根因。
- `LayoutEngine` 已能按 UTF-16 `startOffset` 分页并以 offset 作为 reflow anchor，但缺少显式 `goToOffset`/指定 offset 初始布局入口；Phase 5 可在不改变分页数据模型的前提下补齐精确定位 API。
- 2026-07-15 最终门禁为 Vitest 44 文件 208/208、Playwright 20/20、compile/build 与 `git diff --check` 全通过；跨章无效 fragment 保持可见章节不变、成功跳转后可跨章撤回已有真实 Webview harness 覆盖。
- VSIX `moyuplus-0.0.7-reader-navigation.vsix` 共 8 个发布文件、约 467 KB，仅包含 manifest、README/CHANGELOG、两项 media bundle 和 `out/extension.js`；vsce 仅报告仓库字段与 LICENSE 缺失的既有非阻断警告。

## 2026-07-15 阅读器横向裁切与页码失效回归

- 人工验收推翻了“padding 矩阵已证明真实书籍完整”的结论：现有 Reader 测试没有检查 `scrollWidth/clientWidth`，自然换行段落无法代表真实 EPUB。
- 分页器对 `nowrap` 和 `<pre>` 可稳定复现错误：横向内容超过 24K–34K px 时仍被判为单页，因为适配条件只检查纵向高度。
- `.reader-content { overflow: hidden }` 将算法遗漏转化为无提示数据不可见；视觉上的“右边距消失”实质是内容框外横向裁切。
- sanitizer 当前允许 `white-space`、margin、padding、display 等出版物 CSS，且保留 style/class/表现属性；这些输入使分页宽度无法由 Reader 单独控制。
- 用户确认完整可读与正确分页优先于原版排版，并批准方案 2：保留语义 HTML，删除出版物 CSS，由 MoyuPlus 提供统一阅读排版。
- 统一排版仍保留标题、段落、列表、引用、表格、代码、粗斜体、锚点和内部导航；损失为出版物字体、颜色、缩进、复杂表格和装饰布局的原版视觉。
- 修复不能只在 `fits()` 增加 `scrollWidth` 判断；若不先规范 `nowrap/pre/table`，二分文本无法把不可换行的横向内容变为可读页面。必须同时做 sanitizer 边界、统一 CSS 与双轴不变量。

## 2026-07-16 MoyuPlus 统一设置面板

- 最新规格位于 `docs/superpowers/specs/2026-07-16-moyuplus-unified-settings-panel-design.md`，状态已改为“已通过规格评审”；用户明确要求实施，可直接进入测试先行阶段。
- 工作树起始状态包含规格文件的评审补强改动与未跟踪 `.superpowers/` 视觉伴侣产物；两者均须保留。
- `.impeccable.md` 已提供完整设计上下文：MoyuPlus 面向 VS Code 内轻量阅读/练习用户，语气原生、克制、可靠；设置面板必须使用 VS Code 主题令牌，不引入外部字体、渐变、阴影卡片或装饰动画。
- 规格要求四个分区共 22 项设置；Reader/Git Log 继续复用现有 store 与 normalize 边界，六项打字配置只编辑 Global 值并独立展示 workspace/workspace-folder 覆盖与实际有效值。
- 安全与一致性关键点是 Webview 实例握手、协议版本拒绝、宿主单调 `stateVersion`、面板级串行队列、请求关联和旧实例写入屏障；这些必须先作为纯协议/模型测试固化，再接入面板 UI。
- 现有项目已经有独立 build pipeline、Vitest 单元测试、Playwright 布局/隐私测试和 VS Code shim，适合沿现有测试结构增量扩展。
- Reader 偏好现由 `ReaderPreferencesStore` 保存在 `globalState`，Git Log 偏好由 `GitLogPreferencesStore` 保存；两者 API 已返回规范化权威值，可直接作为设置服务的持久化适配器。
- Reader 设置保存当前经 `ReaderLibraryBridge.savePreferences` 后全量 `refreshLibrary()`，Git Log 设置由 Reader Provider 直接接收 `saveGitLogPreferences`；统一面板需要把这两条写入路径集中，并向 Provider 提供显式的实时应用方法。
- Reader Webview 的阅读设置和 Git Log 设置都仍是本地抽屉；入口分别触发 `openDrawer: settings` 与 GitLogView reducer 的 `openSettings`，Phase S4 必须改为宿主消息并删除抽屉渲染与保存协议。
- 当前 VS Code shim 只有 `WebviewView`，没有 `createWebviewPanel`、panel view-state、configuration inspect/change event、workspace folder name/lookup 等能力；Phase S1/S2 测试需先扩展 shim 的公共 VS Code 行为，而不是向生产类加入测试钩子。
- `registerReaderView` 当前把兼容命令 `moyuplus.reader.openSettings` 路由成 Webview 内部命令；统一面板注册后应由扩展层接管该命令，Reader/Git Log Webview 都只上报目标分区请求。
- 构建脚本目前只有 `readerApp.ts` 一个 Webview entry；统一面板应新增独立 `settingsApp.ts` → `media/settingsApp.js`，样式由其 import 输出为 `settingsApp.css`，保持 Reader bundle 与设置生命周期隔离。
- Reader toolbar 可以直接把设置按钮改为 `{type:'openUnifiedSettings', section:'reader'}`；Host 在 Reader v3 消息守卫之前处理该窄消息。GitLogView 同样通过其既有 `post` 回调发送 `section:'gitLog'`，无需扩展 Reader 导航协议。
- Reader Webview 当前在 `libraryState` 中接收阅读偏好，Git Log 模式启动时同时接收两类偏好；为实时同步可新增宿主消息 `readerPreferencesUpdated`/`gitLogPreferencesUpdated`，在不重置书架、位置或 Git Log 数据的前提下只更新状态与重排版。
- `scripts/build.mjs` 使用 esbuild `entryPoints`/单个 outfile；加入第二入口时应使用两个独立 build 调用，避免改变既有 bundle 文件名和测试契约。
- 现有测试上下文普遍使用结构化假对象并通过 Vitest alias 注入 VS Code shim；设置 Panel 可沿用同一方式，扩展 shim 的公开 panel/configuration 行为后直接测试真实生产类。
- Reader HTML 的随机 nonce/offline CSP 已有独立生成函数与安全测试；设置 HTML 应复用相同结构但进一步移除 `img-src`/`font-src` 能力，只保留 nonce script/style 和显式 `connect/frame/media-src 'none'`。
- 整节恢复默认值的宿主响应已经携带 `section` 和请求关联信息；Webview 仍需在发起到成功/失败响应之间保存 `resettingSection`，以一次性禁用该分区全部控件并避免事务中途继续写入。
- 真实人工验收确认设置入口应位于 `editor/context`，而不是低频的资源管理器右键菜单；最终 manifest 只贡献编辑器上下文入口。
- VS Code 公共扩展 API 无法可靠查询考虑用户覆盖、冲突与 `when` 条件后的最终快捷键，因此设置面板不回显任何绑定值，只链接到原生 Keyboard Shortcuts 页面。
- 滑块跳动根因是保存和响应调用全量 `replaceChildren()`；最终实现把用户交互状态与最新保存等待状态分离，活动会话期间原地同步并延后结构渲染。
- Reader 背景色不生效的根因是 `applyReaderPreferences` 未应用 `textColor`/`backgroundColor`；最终以 `theme` 作为显式继承值，自定义六位十六进制颜色才写入内联样式。
- 2026-07-17 最终验证为 Vitest 49 文件 236/236、Playwright 36/36、compile/build 与 `git diff --check` 全通过，用户人工验收通过。

## 2026-07-17 沉浸阅读书架状态同步

- 规格已由提交 `f1cc5bd` 与 `5167bfb` 固化，状态为“已确认，待实施”；本轮可直接进入 TDD 实施，无需重新设计。
- 当前未提交工作树已具备沉浸投影、分页、Decoration、会话协调器、统一设置和启动入口，但书架同步仍使用一次性 `immersiveState`，与规格的权威快照模型冲突。
- `ReaderSessionCoordinator.snapshot()` 已能提供活动 `bookId/mode`，Provider 目前的 `refreshLibrary()` 只是直接 `snapshot → postMessage`，没有 dirty、串行 drain、实例屏障或 revision。
- Webview 的 `libraryState` 尚无 `immersiveBookId/libraryRevision`，动作联合类型也没有 `stopImmersive`；这将是首轮最小 RED 的切入点。
- Provider 的 ready 握手不应在同一视图已成功收到权威快照后重复扫描；若 ready 发生在首个构造进行中，则等待现有 drain。真正的书架更新请求会提升 request version，使旧构造作废并紧接着只提交新结果。
- Git Log coordinator 的可见性恢复会自行调用 `showLibrary()` 或 `restoreReader()`；Provider 不应在 coordinator 完成后再额外刷新，否则会产生重复可用性扫描。
- 进度保存失败时 `ReadingProgressStore` 仍保留上一次成功位置；协调器只返回 `progressPersisted: false` 并继续清理，Provider 提示错误后从 store 构造书架，因此不会显示未落盘的新百分比。
- 2026-07-17 用户确认真实 Extension Development Host 人工核验通过；沉浸阅读启动/翻页/停止、统一设置和停止后书架状态同步均达到验收要求。

## 2026-07-23 打字练习整体架构重置

- 用户已明确确认 `docs/superpowers/specs/2026-07-23-moyuplus-typing-practice-architecture-reset-design.md` 无误，可直接实施，无需重新进行需求发散。
- 设计是完整 program spec，明确要求七个工作包顺序推进；任何中间切片都不能视为最终完成。
- 当前 typing stack 只有 `TypingPracticeController`、全局 Inline Completion、快捷键路由和 workspace 小型行号状态；新架构尚未建立。
- 现有 Vitest 位于 `src/test/unit`，通过 VS Code shim 运行；适合先加入纯 TypeScript contract、Coordinator 和架构守卫测试。
- 当前仓库已有旧 typing 单元/集成测试，工作包 1–5 旁路期间必须保留；工作包 6/7 切换后再删除只覆盖旧行为的测试。
- Git 工作树相对 `master` ahead 2，且 `CHANGELOG.md`、`package*.json` 已修改，还有若干未跟踪文档/脚本；这些均视为用户资产。
- `tsconfig.json` 的生产 include 是 `src/**/*.ts` 且严格模式开启；纯领域契约可在不改构建配置的前提下独立编译。
- 新实施计划已落盘到 `docs/superpowers/plans/2026-07-23-moyuplus-typing-practice-architecture-reset-implementation.md`。
- 既有协调器测试偏好结构化内存替身和直接行为断言；WP1 可以沿用这一风格，不需要引入新的测试框架或依赖。
- `buildContract.test.ts` 会实际触发共享 `out/` 构建；WP1 聚焦测试应只运行新增 Vitest 文件，完整门禁时再串行执行 compile 与全量测试，避免并发清理构建目录。
- 旧 `src/typing` 文件会与新目录共存，因此新公开入口必须只导出新架构符号，不能重新导出或依赖 `TypingPracticeController`。
- 沙箱未把项目 Node 工具链放入 PATH，但本地 `node_modules` 完整；使用 Codex bundled Node 直接调用 `node_modules/vitest/vitest.mjs` 和 `node_modules/typescript/bin/tsc` 可稳定运行。
- WP1 Coordinator 当前每条命令都从 Snapshot/Session Store 重新加载事实，不保存活动 session 字段；这为后续多窗口 lease 和恢复保留了正确边界。
- WP1 新代码未修改 `extension.ts`、`package.json` 或旧 typing 注册，符合旁路构建要求；全量旧 Reader/Typing 回归保持绿色。
- 现有 TXT Adapter 已具备 fatal UTF-8/GBK 解码、BOM 清理、物理行切分和稳定章节划分；Typing 导入可复用解码/章节规则，但必须复制规范化正文到全局托管目录，不能长期依赖原路径。
- 现有 EPUB Adapter 通过安全 sanitizer 暴露 `immersiveProjection.text` 和版本化 `sourceRevision`，适合作为 Typing 章节纯文本提取入口；导入器只应保存这些安全文本，不保存 HTML、样式、图片或脚本。
- 既有 Book Store 依赖 Memento，不满足 WP2 的多窗口锁、临时文件 + 原子 replace 和正文独立文件要求；ContentCatalogStore 需要新的文件系统适配器，不能复用该存储实现。
- ContentCatalogStore 采用正文先写、Catalog 后写：Catalog 失败最多留下不可达的不可变 orphan body，不会产生 Catalog 指向缺失正文；相同 material/revision 若正文不同会拒绝覆盖。
- Catalog 锁带 owner/token/time；过期锁通过原子 rename 移入 `recovered-locks` 保留诊断，而不是直接删除。并发测试确认两个 Store 同时 upsert 不丢记录。
- TXT 导入以清理后的正文计算 SHA-256 revision，导出只返回托管纯文本；原 URI 仅作为来源信息。
- EPUB 导入通过现有安全 Adapter 的 `immersiveProjection.text` 建立章节索引，只有全部章节成功后才写 Catalog；HTML、图片、样式和脚本不进入 Typing 存储。
- 内置素材采用随 TypeScript bundle 打包的只读版本化 manifest；每条记录含稳定 ID、revision、标签和授权/来源说明，Provider 只返回 defensive copy。
- 覆盖矩阵用 manifest 正文边界反查数量，不能只信任 `itemCount` 元数据；该校验发现并修正了中文/ASCII 标点的计数偏差。
- 自由粘贴通过内容哈希生成临时 source revision，默认不写 Catalog；显式保存才生成 `custom` 记录与不可变托管正文。
- 非 Mastery 生成器使用纯确定性 PRNG 与内置池；手机号、日期、金额等格式生成也保留 seed 和算法版本，避免只在 UI 层随机。
- Mastery Provider 只依赖窄 `MasteryEntrySource`，已覆盖 0/1/5/20+ 条目和加权 seed 复现；WP3 再实现计分、衰减与持久化事实来源。
- 2026-07-23 继续实施时复核：WP3 是当前依赖链上的下一工作包，范围包括 Session Engine、文本策略、Analytics、Mastery、Coordinator 完整编排，以及 Preferences/Result/History/Daily/Mastery stores。
- 既定设计与实施计划已经用户批准；本轮无需重新设计，直接在保留 WP1/WP2 未提交成果的前提下按 TDD 推进。
- 工作区未发现仓库级 `AGENTS.md`；适用约束来自已批准设计、实施计划和当前技能。
- WP3 设计要求状态机支持 ready/running/blockedOnError/paused/completed/abandoned；restart 复用同一 Snapshot 与 seed。输入尝试逐目标单元记录，删除只进入修正计数，不产生 InputAttempt。
- 现有 WP1 只定义了 Session/Analytics/Mastery schema 与 `PracticeSessionRuntimePort`；尚无生产 Session Engine、文本规范化、统计聚合或投影实现，适合从公开 `domain/*` 入口按窄行为测试增量建立。
- Result 持久化的强约束是“独立不可变文件先提交，投影后更新”；History/Daily/Mastery 都带 source watermark，可增量补算，也必须能从全部 Result 全量重建。
- Coordinator 当前只编排 prepare/start/pause/resume/restart/finish，输入与修正尚未成为 Application 命令。WP3 要跑通内存 Editor Port 完整会话，需要补充窄的 input/correction 命令与事件，而不是让 Editor 直接调用 Domain。
- `contentPreparation.ts` 已用 `Intl.Segmenter` 构建 Unicode 字素目标，并把换行/Tab/空格编码为独立 TargetUnit；Session Engine 应消费 Snapshot 的 TargetUnit，避免重新解释源文本。
- `buildPracticeSnapshot` 已递归冻结并保存 contentProfile/Plan/seed；这足以让 Result 构建和 restart 保持历史解释稳定。测试中的旧手写 Snapshot fixture 需要补齐 contentProfile，而不是放宽生产契约。
- 本地可用的固定 Node 路径为 `C:\Users\Purvar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`，后续直接运行仓库内 Vitest/TypeScript，避免依赖 sandbox PATH。
- WP3 最终以 `PracticeSessionEngine` + `PracticeSessionRuntime` 分层：Engine 只判定不可变 Snapshot/Session，Runtime 负责 lifecycle 与 Result 构建，Coordinator 只通过 Store/Editor/Event Port 编排。
- ResultStore 使用全局 ID hard-link claim 与按月事实文件，ProjectedResultCommitter 严格先提交事实再刷新派生投影；History/Daily/Mastery watermark 连续时增量合并，损坏或不连续时从 Result 全量重建。
- Result 同时保存错误对、中文/英文/代码词上下文和 grapheme/word/codeToken Mastery observations，使所有长期投影都不需要原始按键流或可变 Snapshot。
- WP3 退出条件已满足；旧 typing 注册仍按计划旁路保留，下一依赖工作包是 WP4 workspace 会话、pending Result、lease 与原生编辑器适配。
- 2026-07-24 恢复实施确认：WP4 是当前唯一未完成的下一依赖工作包，设计矩阵要求在切换旧栈之前完成真实练习文档、workspace 恢复、pending Result 重试和双实例 lease。
- 设计定位显示 WP4 关键边界集中在第 7 节原生编辑器模型、第 12 节存储/lease、第 13 节生命周期和第 14 节配置；Reader Decoration 必须显式排除 `moyuplus-practice:`。
- 当前 `src/typing` 仅有旧 `TypingPracticeController` 与 WP1–WP3 的 domain/application/storage/source 实现，尚无 `adapters/editor`、workspace store 或 editor registration，适合从公开 adapter contract 测试开始。
- `PracticeCheckpoint` 契约已经存在，包含完整 session、逐行 accepted text、blocked text、稳定文档版本和 savedAt；workspace Store 可直接持久化该公开 schema，不需要引入第二份检查点模型。
- `PracticeResultCommitPort` 只暴露 `commit(result)`，足以让 WP4 pending 重试保持对 WP3 的单向依赖：先保留 workspace pending 文件，成功提交全局事实后再清理。
- 首个实现切片选择 `WorkspaceSessionStore` + `PendingResultStore`：它们是 WP4 恢复链基础、可用纯文件系统 contract 完整 RED/GREEN，也避免在 FileSystemProvider shim 尚未具备前把多个适配器耦合到一次改动。
- 现有 `AtomicFileWriter` 已提供临时文件、flush 与同目录 rename，可复用于 workspace Snapshot/Checkpoint/PendingResult；ResultStore 的输入校验与不可变 JSON 风格可作为恢复 Store 的一致性参考。
- 测试中已有 `buildPracticeSnapshot` 和真实 Runtime 可生成完整 Snapshot/Session，workspace contract 测试应优先复用公开构建器，避免手写易漂移 schema。
- pending Result 删除前需要再次读取并比较当前文件；否则全局 commit 等待期间同 session 的新 pending 事实可能被旧重试误删。当前实现仅删除与本次提交序列化内容一致的文件。
- workspace session ID 同时参与目录名，Store 边界使用窄白名单拒绝路径穿越；Snapshot/Checkpoint/Result 都在读取和写入时验证 schemaVersion。
- Session lease 的事实文件是 `storageUri/typing/lease.v1.json`；所有 acquire/heartbeat/release 通过短时独占更新锁串行化，因此两个扩展实例并发 acquire 最多一个得到写权。
- lease 活性边界采用 `now - updatedAt <= timeoutMs`；同 owner 同 session 重入保持现有 lease，超时后的另一 owner acquire 明确返回 `takenOver: true`，供后续恢复 UI 使用。
- 练习文档锚点采用不可见 Word Joiner `U+2060`；每个逻辑行必须恰好以一个保留锚点结尾，解析结果只返回用户实际输入，锚点永不进入 TargetUnit 或输入尝试。
- `PracticeFileSystemProvider` 只接受 `moyuplus-practice:` URI，文件内容仅保存在内存 Map；workspace Checkpoint 恢复通过 `acceptedTextByLine → anchored document` 完成，不读取或写入项目路径。
- DocumentChange Adapter 不能依赖浏览器 composition 事件：逐字模式立即把本次变化的 Unicode 字素转成 input 命令；committedBatch 模式必须保存最后已判定检查点、合并短窗口内替换，稳定后只对受控区域最终差异逐字素判定。
- 删除本身不产生 InputAttempt；Backspace 由命令路由精确计数，Delete/Undo/Redo/selectionDelete 分别进入 correction command。结构性修改、锚点破坏和暂停期输入需要回滚且不计尝试。
- 受控文档差异只允许当前活动行尾部增长或缩短；同事务中其他行变化、锚点无效、多光标或中间位置替换都返回明确 rollback 原因，不进入 Application。
- 稳定上屏 Buffer 的 Checkpoint 只在稳定结果已分类为 input 后前移；短窗口内每次替换取消旧 timer 并保留最终文本，pause 会清空未提交队列而不前移 Checkpoint。
- 现有 Reader `ImmersiveDecorationPresenter` 已证明 host 注入模式可在不扩张 VS Code shim 的情况下测试真实 presenter 生命周期；Typing Decoration 可复用该结构，同时必须在 host/editor 入口检查 scheme。
- 复核 Checkpoint 后发现 `blockedText` 与 `acceptedTextByLine` 分离；当前 FileSystemProvider 恢复仅使用 accepted 行，会丢失未修正错误显示。恢复 API 后续必须同时接收 Snapshot，以 `session.targetIndex` 定位 active line 并把 blockedText 放回锚点前。
- blockedText 恢复已补齐：Provider 拒绝 Snapshot ID 或 display line 数不匹配的 Checkpoint；有效恢复把 blockedText 追加到当前 TargetUnit 所属逻辑行，保留用户可 Backspace 修正的错误文本。
- Typing Decoration 只接收 `moyuplus-practice` editor；实际输入 Range 与锚点 attachment 分用四种 DecorationType，current 固定使用 `before`、remaining 固定使用 `after`，避免同一锚点 attachment 顺序不确定。
- Presenter 从 `visibleRanges` 扩展有限缓冲行，不为整份 Snapshot 构造 options；自动换行模式隐藏 lineBreak 标记，Enter 推进模式才把 `↵` 作为剩余/当前结构目标显示。
- Session Engine 的 correction 只在 Backspace 时减少 `blockedInputCount`；Delete/Undo/Redo 只计数。原生编辑器命令路由因此必须由 Editor Adapter 同步维护文档 Checkpoint，不能假设 Coordinator 会直接修改锚点文档内容。
- 旧 `ShortcutRouter` 是全局 Enter/Tab 行为且依赖旧 Controller；WP4 新路由必须限定 `moyuplus-practice` scheme，并保留非练习编辑器走原生命令的窄回退，正式替换留到 WP6。
- `ResilientPracticeResultCommitter` 作为 WP3 Result Port 外围适配器：全局事实/投影提交异常时，只有 workspace pending 原子保存成功后才吞掉异常；pending 自身写失败仍向上抛出，避免静默丢成绩。
- 激活重试按 session ID 稳定排序扫描 `typing/sessions/*/pending-result.v1.json`，逐项隔离失败；返回 committed/failed session ID，便于 WP5 展示“成绩尚未保存”状态。
- 新 Command Router 不复用旧全局 Router：活动状态只接受 running/blockedOnError；paused/completed 等状态在 practice scheme 内返回 blocked，绝不能回退到原生命令而破坏锚点。
- Backspace 精确产生一次 `correct(kind=backspace,count=1)`；Enter/Tab 直接产生结构目标 input command。非 practice scheme 分别回退 `deleteLeft`、`type({text:'\\n'})`、`tab`。
- `registerPracticeEditor` 已封装 `moyuplus-practice` FileSystemProvider 与三个命令 disposable，但刻意不由 `extension.ts` 激活；WP4 可以完成 Adapter/Extension Host contract，而不会让新旧 typing listener 同时监听现有资源。
- `WorkspacePracticeEditorAdapter` 已成为 workspace 恢复路径唯一协调点：open 先落 Snapshot/Checkpoint 再打开内存 URI；render 先落新 Checkpoint 再重建文档/Decoration；close/complete 强制宿主 save，避免脏文档提示。
- 文档事件只需 stage 当前完整 anchored text 和稳定 document version；render 根据最新 Session 的 `blockedInputCount` 从当前行末按 Unicode 字素切出 blockedText，Checkpoint 不依赖私有输入法 API。
- manifest 已建立独立语言级编辑器边界；禁用补全/内联建议/format-on-type 不再依赖用户全局开关，也不会影响普通项目文件。字体、字号和 Decoration 主题桥仍留在 WP5 配置入口。
- Reader `ImmersiveDecorationPresenter` 现在在 active editor 入口显式拒绝 `moyuplus-practice` scheme，并保持 armed 而非 visible；因此 Reader 翻页不会消费位置，也不会与 Typing Decoration 争用同一文档。
- `SessionLeaseHeartbeat` 使用可注入 scheduler，默认 5 秒；stop 只释放当前 owner/session，心跳失败立即停止继续调度，避免已失去 lease 的窗口继续表现为可写。
- 当前 WP4 新模块仍为旁路公开实现：package 只贡献语言隔离，`extension.ts` 尚未注册新 FSP/listener；因此可以安全运行全量旧栈回归，而不会产生双监听同一练习资源。
- 2026-07-24 本轮验证基线为 80 个 Vitest 文件 354/354，extension/webview build 与严格 TypeScript 通过；WP4 尚不能标 complete，因为真实 VS Code `onDidChangeTextDocument`/save/close 宿主、命令 keybinding 接线、Extension Host 自动化和微软拼音人工冒烟尚未完成。
- VS Code `onDidSaveTextDocument` 表示一次 save 已完成；listener 只应 flush 尚未稳定的输入，不能再次调用 `document.save()`，否则可能形成重复 save 链。稳定输入后的后台 save 由 `WorkspacePracticeEditorAdapter.render()` 负责。
- `onDidCloseTextDocument` 发生在编辑器关闭之后，不能承担“关闭前强制保存”。受控完成/关闭仍先走 adapter save；真实 close 事件只丢弃未确认的 IME pending 批次、持久化最后稳定 Checkpoint 并 detach。
- `WorkspacePracticeEditorAdapter.describeDocument()` 以 Checkpoint 重建最后稳定 anchored text，而不是读取已被用户修改的 Provider 当前值；因此文档 diff 始终以最后已判定事实为基线。
- 新 lifecycle 通过窄工厂绑定 Workspace Editor 与 `PracticeApplicationCoordinator.input/correct`，registration 只负责把 VS Code 文档事件归一化，不把领域判定塞回宿主层。
- Extension Host 测试必须作为独立 `run()` bundle，不能使用 Vitest 的 `.test.ts` 命名；runner 直接 spawn `Code.exe`，以临时 user-data/extensions 目录隔离用户环境。
- 真实 VS Code editor 关闭与 `onDidCloseTextDocument` 的文档释放时机不同；Extension Host 自动化断言 editor 不再可见，事件委托与 Checkpoint detach 由 adapter/registration contract 单独确定性验证。
- WP4 新 FSP、listener、lifecycle 与命令仍保持旁路，不在 `extension.ts` 激活；这既允许真实 Extension Host 单独验证，也避免在工作包 6 正式切换前与旧 typing stack 双监听。
- Delete/Undo/Redo 不能只依赖普通 document diff，否则一次受控原生命令会同时被 command router 和 document listener 计数；最终边界由 router 产生具名 correction，并在原生 edit 期间用 lifecycle `runExtensionEdit` 忽略对应文档事件。
- 微软拼音人工冒烟不能依赖尚未到 WP6 的正式 activation；独立 Extension Host manual runner 可在不双监听旧 stack 的前提下复用真实 FSP、文档事件和 committedBatch lifecycle，作为 WP4 的可执行人工验收入口。
- 人工 IME harness 不能沿用 30ms 自动化默认窗口：真人候选选择会明显更慢，过早 flush 后临时拼音会污染累积状态。手工入口使用 1.5 秒窗口，并以当前完整 anchored document 而不是 command 文本累加作为验收事实。
- 手工 runner 必须显式提供 `reportError`；稳定 timer 中的异步错误默认不会进入主 `run()` Promise，必须桥接为可见状态栏/非模态错误通知和 rejection，否则用户只会看到“没有反应”。
- `--extensionTestsPath` 模式下 VS Code 会让 `DialogService` 拒绝测试扩展发起的模态对话框；人工 harness 的说明、成功和失败反馈不能使用 `{ modal: true }`，应把主反馈放在编辑器 Decoration 与状态栏，通知仅作补充。
- 2026-07-24 用户在 Windows 微软拼音下完成固定长句输入并看到“微软拼音冒烟通过”；这补齐了 WP4 唯一剩余人工证据，确认 1.5 秒稳定窗口、anchored document 判定和真实 Extension Host 输入链可共同工作。
- WP5 Webview 不应从 `typing/adapters/view/index.ts` barrel 导入协议；该入口同时导出依赖 `vscode`/Node 的 Provider 与 HTML 生成器，会污染 browser bundle。浏览器只允许导入纯 `typingViewProtocol.ts`。
- Typing View 使用独立 Activity Bar 容器并可与旧 typing stack 旁路共存；当前 shell query 只返回导航/会话摘要，后续页面数据必须继续通过 Application 查询适配器提供，不能让 Webview 直接构造或写入工作包 2–4 Store。
- 当前 `extension.ts` 的 Typing shell query 尚未读取真实 Session/PendingResult：它固定返回全部页面可用、`activeSessionStatus: null`、`pendingResultCount: 0`。恢复实施时必须用 Application 查询适配器替换这组占位数据，不能在 Webview 内补业务读取。
- `TypingViewApplicationQuery` 只依赖结构化的只读 `catalog.list()` 端口；Webview snapshot 不暴露 `upsert`/delete/Result Store 等写能力。内置条目的计数与估时复用领域内容准备流水线，并在查询适配器构造时缓存。
- 页面内容使用 `materials | unavailable` 判别联合，validator 同时校验 `activePage` 与 content page 一致；未完成页面不能复用一个看似成功的空数组快照。
- extension activation 以 `globalStorageUri.fsPath` 作为新 Typing 全局事实目录；测试上下文缺失该字段时只使用非生产 fallback，不改变真实 VS Code 存储位置。
- materials HTML 由纯渲染函数生成并对所有宿主文本转义；素材 ID 在写入 data attribute 前先 URI 编码，避免引号或空白形成属性注入。Webview 仍只消费宿主快照，不直接导入 Node、VS Code 或 Store。
- 当前查询适配器仅完成 materials 事实接线；`activeSessionStatus`/`pendingResultCount` 的可注入端口在 extension 中仍使用默认值，其他页面明确返回 `unavailable`。下一切片必须通过命令端口完成选择/导入/粘贴并刷新，而不是让前端直接写 Catalog。

## 2026-07-24 WP5 materials 命令断点恢复

- 当前 `TypingViewApplicationQuery` 已是只读 catalog 投影；`TypingViewProvider` 仅处理 handshake、retry 与 navigate，协议尚无素材动作消息。
- materials HTML 已包含 `data-action="paste|importTxt|importEpub"` 和编码后的 `data-material-id`，但 `typingApp.ts` 只绑定页面导航，所以按钮目前没有业务效果。
- 素材写入能力已存在于 `CustomMaterialWriter`、`TxtMaterialImporter`、`EpubMaterialImporter`；自由粘贴默认应保留为 `adHoc` recipe，只有显式保存才进入 catalog。
- 既有设计要求 Webview 只保存临时 UI 状态，业务状态来自 Application；因此动作不会把 Store 暴露给 Webview，而是通过 Provider 注入的命令端口执行。
- 本轮采用的刷新语义：选择素材/提交自由粘贴后预选来源并打开 `setup`；TXT/EPUB 导入完成或取消后保持 `materials`，成功写入后重新读取 catalog。
- `PracticeSetupDraft` 是 setup 预选来源的 Application 权威；内置素材映射为 `builtIn` recipe，catalog 中的自定义/TXT/EPUB 等条目统一映射为 `custom` recipe。
- 自由粘贴先走领域清理、profile 推断、空内容与 200,000 字素校验；成功后只保存规范化 `adHoc` recipe，不创建素材记录。校验失败会报告错误并保留当前草稿/页面。
- TXT 与 EPUB importer 现在允许省略 `contentProfile`，在规范化正文后按 Han/Latin 自动推断 chinese/english/mixed ad-hoc profile；显式 profile 仍保持原行为。
- TXT View 导入默认尝试 UTF-8，只有 `TxtDecodeError` 才请求 GBK/GB18030 重试；选择取消、文件选择失败和终端导入错误均不会产生未处理的 Webview Promise rejection。
- Provider 以命令返回的 applied 结果决定是否跳转；失败/取消不会把用户带到空 setup，导入完成后权威 catalog 快照会重新进入 Webview。

## 2026-07-24 WP5 setup 查询与表单发现

- setup 快照不需要也不应包含 `ContentRecipe`：宿主只投影标题、profile、计数、可选范围和当前策略，避免 `adHoc.text` 通过 Webview 协议复制。
- `PracticeSetupDraft` 需要把来源、`SourceRange` 和完整 `PracticePlan` 作为一个 Application 事实保存；重新选择来源会自然清空上一次配置，避免计划引用旧 recipe。
- setup 默认值来自两层：Content Provider inspect 决定来源 profile/范围和合理的完成约束，全局 `PracticePreferencesStore` 只覆盖判定、文本、推进和显示策略。表单覆盖只写当前草稿。
- `sourceRange` 完成约束只适用于 article/chapter/selection；`whole` 内容在 Webview 表单选择“完成所选范围”时规范化为 `free`，避免生成领域联合中不存在的 whole completion。
- Content Provider 的 inspect 仍留在宿主/Application 查询边界；Webview 只按范围数组索引提交选项，不能构造任意素材 ID、章节路径或读取 Catalog。
- setup 协议增加新的双向线格式后升级到 `TYPING_VIEW_PROTOCOL_VERSION = 2`，使旧 Webview 实例不会把不完整的 v1 snapshot 当成有效配置。

## 2026-07-24 WP5 prepare/start 恢复检查点

- 当前明确断点是：把 setup 草稿中的 `PracticePlan + SourceRange` 接入 prepare/start，先处理活动会话冲突，再提供 live 页面事实与暂停/重启/结束命令。
- 当前工作树包含此前 WP1–WP5 的大量未提交与未跟踪改动，均按既有实施内容保留；本轮不重置、不清理、不覆盖。
- 已批准设计和详细实施计划覆盖本切片，无需重新发散视觉或架构；继续严格 RED → GREEN → REFACTOR。
- 设计第 11.4 节明确规定已有活动会话时只能选择“返回当前练习 / 结束当前练习并新建 / 取消”，不得静默覆盖；因此 `configureSetup` 之后不能直接无条件调用 Coordinator。
- Coordinator 已具备 `prepare/start/pause/resume/restart/finish` 编排；新工作应在 View/Application adapter 组合这些公开命令，不把冲突规则塞入领域 Runtime 或 Webview。
- 当前 `TypingViewProvider` 的命令端口仅覆盖素材与 setup 配置；协议与 Provider 都还没有 start/conflict/live 控制消息，适合作为下一组预期 RED。
- `PracticeSessionStorePort` 当前只有按 ID 的 `get/save`，没有“列出活动会话”能力；活动冲突应由一个窄的 workspace active-session/lease 查询端口提供，不能让 View 扫描存储目录。
- `WorkspacePracticeEditorAdapter` 已完整实现 `PracticeEditorPort.open/render/complete`，但真实 `extension.ts` 目前只装配了素材 Catalog、偏好、setup 草稿和 View，尚未装配新 Coordinator/Runtime/Workspace Editor；真实 start 接线需要复用 WP3/WP4 公开构造器并保持旧栈旁路。
- setup 配置消息当前只保存草稿并留在 setup；下一协议行为需要独立的“开始练习”请求，而不是把 configure 隐式升级为 start，避免表单调整时触发会话。
- `SessionLeaseStore` 已提供 `read/acquire/heartbeat/release`，并能报告另一窗口的活动 `sessionId`；`WorkspaceSessionStore.getCheckpoint(sessionId)` 可恢复对应状态。冲突查询可以组合这两个公开 adapter，而无需扩张领域 Session Store 的列表接口。
- Coordinator 的 `start` 当前内部生成 session ID 并先打开编辑器，暂不能在打开前用该 ID 原子获取 lease；本切片先把冲突决策和 View/Application 命令边界做成可注入端口，真实多窗口原子接线需在装配时解决“预分配 session ID / 启动前 acquire”顺序，不能假装已完成。
- 当前真实扩展已装配同一 Extension Host 内的 Coordinator、Runtime、原生 editor adapter 和 View 命令，因此单窗口 start/pause/conflict-return 已端到端通过；多窗口 lease 仍未进入 start 的原子路径，WP5 的“活动会话冲突”不能据此标记全部完成。
- live 指标只从 `PracticeSessionState + PracticeSnapshot + monotonicNow` 投影：进度、尝试、正确/错误、准确率、原始/有效 CPM 与活动时间均不由 Webview 自行累计；控制消息不含 sessionId，由宿主读取当前活动会话。

## 2026-07-24 WP5 多窗口 lease 原子装配发现

- 最小正确顺序必须由 Coordinator 保证：读取 Snapshot → 预分配 session ID → 原子 acquire lease → Domain runtime start → 保存 Session → 打开 editor；仅在 acquire 成功后才允许任何可写 Session 副作用。
- 租约竞争不是异常，而是 Application 事实：`practiceStartBlocked` 携带 workspace 检查点投影出的活动 session ID/status，View 命令据此保持 setup 并显示冲突，不把跨窗口竞争伪装为启动成功。
- `WorkspacePracticeSessionLease` 组合 `SessionLeaseStore` 与 `WorkspaceSessionStore`，使 Application Port 不依赖文件系统细节；租约文件刚写入但检查点尚未出现时安全降级为 `ready`。
- heartbeat 生命周期属于 adapter：acquire 后启动，完成/自动完成后释放；restart 通过 owner-only `transition(current,next)` 在同一把更新锁内换绑，避免 release + reacquire 暴露竞争窗口。
- 启动链路在 runtime/save/editor 失败时释放新租约；Application 事件发布位于成功边界之外，避免仅因观察者失败而释放已经打开的可写会话。
- 真实 extension owner ID 使用 `process.pid + randomUUID`，同一进程内的测试/多实例也不会被误判为同一 owner；dispose 仅做尽力释放，正确性仍依赖 heartbeat 超时与接管。
- 当前接管语义仅完成 Store 层超时 takeover；超时后在另一个窗口恢复原 Session 检查点的专用交互尚未实现，不能把多窗口恢复矩阵标记完成。

## 2026-07-24 WP5 Result / History / Mastery 恢复发现

- 当前详细计划的明确下一断点是 `result/history/mastery` 三个只读事实页；Reader Bridge、配置入口和超时 lease 旧检查点恢复 UI 仍在其后。
- 设计要求 View 层只能调用工作包 3 的 Application/Query 接口，不得临时创建或直接写 Result、History、Daily、Mastery Store。
- Result 是唯一长期事实来源；History/Daily/Mastery 都是可从 Result 重建的派生投影。页面必须显式呈现空态/不可用态，不能用壳层占位伪装完成。
- History 默认每页 50 条；Result 页需要摘要、10 秒桶曲线、错误排行和历史比较；Mastery 页需要错字/错词排行与强化入口，但本切片先守住只读事实边界。
- 现有生产能力位于 `ResultStore.ts` 与 `ProjectionStores.ts`，现有 View 查询/协议/Provider/渲染分别位于 `TypingViewApplicationQuery.ts`、`typingViewProtocol.ts`、`TypingViewProvider.ts`、`typingViewHtml.ts` 和浏览器 typing 模块。
- 当前工作树包含 WP1–WP5 大量既有未提交与未跟踪内容，均视为用户资产保留；本轮只做断点所需增量。
- `ResultStore` 已公开只读 `list/get`；`HistoryProjectionStore`、`DailyProjectionStore`、`MasteryProjectionStore` 已公开 `read()`，并会在投影缺失、损坏或版本不匹配时从不可变 Result 重建。
- 因此 View 查询适配器只需依赖窄只读 Port：最新 Result、History/Daily 投影和 Mastery 投影。它不需要文件路径、写入器、`refresh/rebuild` 或任何 Store 变更能力。
- Result 页可用最新 Result 的 metrics、speedBuckets、mistakes 和同 benchmark 历史最佳生成只读 DTO；History 页按 `endedAt` 倒序分页，并携带 Daily 汇总；Mastery 页按现有投影顺序/权重投影错误条目。
- 线格式已升级到 v4：Result DTO 只包含摘要、速度桶、错误排行和 benchmark 最佳；History 固定首屏 50 条并附最近 14 天 Daily 汇总；Mastery 最多投影前 100 个高分条目。文件路径、正文、Store 写接口和完整输入均不会进入 Webview。
- 扩展装配改为一个共享 `ResultStore`：Coordinator 通过 `ProjectedResultCommitter` 先提交事实再刷新 History/Daily/Mastery；Query 读取同一事实 Store 与三个投影 Store，避免双实例语义漂移。
- Result/History/Mastery 本轮只完成只读事实与真实空态；“再练一次/强化本次错字/保存为素材”、历史翻页命令和 Mastery 强化入口仍属于后续交互切片，不应从当前只读页面反推为已完成。
- 下一断点按详细计划选择超时 lease 接管后的旧检查点恢复 UI；完成后再进入 Reader Bridge、配置入口以及三条 feature-gate 端到端和可访问性验收。

## 2026-07-24 WP5 超时 Lease 旧检查点恢复发现

- 恢复候选必须来自仍存在但已经过期的 lease，并同时具备匹配的 Snapshot 与 Checkpoint；扫描 session 目录或让 Webview 传 session ID 都会破坏权威边界。
- 查询与执行之间存在竞态。恢复按钮只能条件认领同一个过期 session；若 lease 已换成另一个 session，即使新 lease 也过期，也不得覆盖它。
- 崩溃前的 `performance.now()` 不能跨 Extension Host 复用。恢复服务会把 `startedAtMonotonic`、pause intervals 与 `pausedAtMonotonic` 整体平移到当前时间轴，并先落为 paused，从而保留已练习时长且排除离线时间。
- “暂不恢复”只是当前 Host 的提示抑制，不删除 Snapshot、Checkpoint 或 lease；数据仍可在下次激活中恢复。
- 协议 v5 的恢复摘要只包含状态、保存时间和完成进度；session ID、正文、文件路径和 Store 写能力均不进入 Webview。
- 真实 activation 已验证：过期 lease → materials 顶部恢复提示 → 原子 claim → 原生练习文档打开 → live paused 权威快照。
- 下一断点为 Reader Bridge；配置入口和三条 feature-gate 端到端/可访问性验收仍在其后。

## 2026-07-27 WP5 Reader Bridge 发现

- Reader Book 不需要复制进 Content Catalog。`ReaderBookSourceProvider` 可以直接组合 `BookLibraryStore + AdapterRegistry`，只读取 Book Adapter 已消毒的 `immersiveProjection.text`，并按整本/章节生成 `PreparedContent`。
- Provider 的确定性 revision 必须包含 book ID、章节 ID、章节 source revision 与规范化正文；这样来源内容变化会生成新事实标识，历史 Result 不会误认成同一版本。
- `ReadingLocator` 不能原样进入 Typing 草稿或 Webview。桥接入口只保留 `sectionId`，转换为 `suggestedSectionId + chapter SourceRange`；CFI、offset、progression 和阅读进度均留在 Reader 边界。
- setup 查询已具备范围权威校验：推荐章节仍存在时作为默认范围；章节失效时安全回退到 Provider 返回的第一个有效范围，不会把旧 locator 当作强绑定。
- `TypingViewProvider.openPage` 必须把外部请求页保留到首次 resolve/handshake。若 resolve 或 `typingReady` 强制重置 materials，从未打开过 Typing View 的书架入口会出现只在冷启动时失败的竞态。
- 来源可用性门禁应位于桥接入口、写草稿之前。失效时只向 Reader 既有重新定位命令回传 book ID；Typing 显示错误但不获得书架 Store 写能力。
- 真实 activation 的书架 `startTypingPractice` 动作现调用新 Entry Point，并使用当前可见位置或持久化位置作为可选章节建议；旧 `START_TYPING_PRACTICE_COMMAND_ID` 仍保留给后续 WP6 薄别名迁移，但书架不再走旧 Controller。
- 最终证据：Reader Bridge 新增测试 7 项全部通过；真实 extension activation 书架路径通过。全量 Vitest 为 96 文件中 95 文件、449 项通过，唯一既有 `catalog.lock` 瞬时 `EPERM` 独立复验 6/6；TypeScript、四目标 build 和 `git diff --check` 通过。

## 2026-07-27 WP5 语言与默认偏好配置入口恢复发现

- 设计第 11.7 节明确区分两条写路径：setup 覆盖只属于当前 `PracticePlan`；只有显式“设为默认”才修改全局 `PracticePreferencesStore`。
- 练习编辑器字体、字号、行高和 letter spacing 必须通过 `[moyuplus-practice]` 语言级 VS Code 配置调整；主题色、背景、下划线和当前字符框继续由 DecorationTypes 管理，不能用 CSS 注入原生编辑器。
- 当前 setup 查询已经会读取 `PracticePreferencesStore` 作为新草稿默认值，但还没有显式保存默认偏好的 View 命令，也尚未发现真实语言覆盖写桥的完成证据。
- 本切片先完成窄 Application/View 命令与语言配置桥，不把 setup 表单的普通“应用”行为改成全局写入。
- `package.json` 已提供 `[moyuplus-practice]` 的补全/格式化关闭默认值，但 `VSCodeWorkspacePracticeEditorHost.open()` 当前只打开并显示文档，没有显式调用 `setTextDocumentLanguage`；因此语言级覆盖是否生效缺少宿主保证。
- 现有统一设置页的 typing 分区仍是旧版“向当前编辑器文件写入”的实验性文案和全局 Enter/Tab 路由项，不应把这套旧入口扩展成新架构事实。当前切片采用新版 Typing setup 的两个显式入口：保存当前策略为全局默认、打开 VS Code 的 `@lang:moyuplus-practice` 原生语言设置。
- 原生设置入口只负责导航到 VS Code 权威配置 UI；具体字体、字号、行高和字距继续由 VS Code 写入语言覆盖，MoyuPlus 不复制第二份外观 Store。
- `TypingViewPracticeCommands.saveSetupAsDefault` 先把严格 setup 配置写回当前 Application 草稿，再从权威草稿提取四类策略保存；这样按钮使用的范围仍经过草稿校验，同时 completion/content recipe 不进入全局偏好文件。
- v6 的 `openPracticeEditorSettings` 不接受 languageId、配置键或任意查询字符串；Webview 只能请求宿主拥有的固定目标，避免把通用命令执行能力暴露给浏览器层。
- 真实 extension activation 的默认保存路径与 Query 读取的是同一个 `PracticePreferencesStore` 实例；保存后新 setup 会自然读取新默认，而当前已经配置的草稿保持本次覆盖。
- 原生 VS Code Extension Host 已验证新的 `setTextDocumentLanguage` 路径可以正常激活、打开并关闭隔离练习编辑器；沙箱内失败来自 GUI/注册表权限，不是扩展逻辑。
- 复核七页面协议后确认 `recent` 仍明确投影为 `unavailable`，因此配置入口完成后不能把 WP5 标记 complete；下一切片必须先补齐 recent 只读事实，再进入三条端到端和可访问性矩阵。

## 2026-07-27 WP5 Recent 只读事实页发现

- Recent 的可靠事实源是不可变 `ResultStore`，不是 History/Daily 投影；直接按 `endedAt` 降序、result ID 稳定破同序并限制 20 条即可获得确定性的最近记录。
- Webview 所需摘要可以收窄为 result/material/source revision/profile/outcome/timing/accuracy/effective CPM，不需要正文、文件路径或任何 Store 写接口。
- 当前 `PracticeResult` 没有 ReplayDescriptor、来源标题和 SourceRange；在 schema 补齐前，Recent 应保持只读摘要，不能通过 material ID 猜测重放范围或伪造“再次练习”能力。
- 协议升级至 v7，并对 Recent 条目数量、ID、时间与数值进行严格校验；真实空 Result Store 返回明确空状态，不再使用 `unavailable`。
- 聚焦 Query/协议/渲染回归为 3 文件 28/28；真实 activation 的 Recent 空事实路径通过。
- 最终门禁为 Vitest 97 文件 455/455、严格 TypeScript、extension/Reader/Settings/Typing 四目标构建和真实 Extension Host 退出码 0。
- 七页面事实壳现已闭合；WP5 下一断点转为三条 feature-gate 端到端与窄侧栏、主题、高对比、键盘及 ARIA 可访问性矩阵。

## 2026-07-27 WP5 Feature Gate 与可访问性验收发现

- 详细计划当前唯一进行中的工作包是 WP5；WP1–WP4 已完成，WP6/7 仍依赖本轮 feature gate 与可访问性退出证据。
- 七页面已经连接真实事实或明确空状态；本轮不得用占位状态替代真实 Application/Store/Editor 链路。
- 审计范围限定为既有设计、`.impeccable.md`、VS Code 主题令牌、窄容器、键盘导航与 ARIA/语义要求，不新增视觉方向。
- 若只读审计发现缺口，必须先用自动化测试稳定复现，再做最小生产修复。
- 仓库当前没有 Typing View 专用 Playwright harness/spec；现有 layout 基础设施只覆盖 Reader、Settings、Git Log 与网络隐私。WP5 的窄侧栏、主题/高对比、键盘与 ARIA 退出证据尚未闭合。
- 真实 Extension Host 当前有原生练习 editor 生命周期与 IME harness；三条素材入口的主要事实集中在 `extension.test.ts`，需进一步区分“宿主集成”与“真实 Extension Host 端到端”覆盖。
- 隐藏实时指标当前没有传输/渲染边界：`TypingViewLiveContent.metrics` 必填，Query 无条件投影，Renderer 无条件展示。最小正确线格式是协议 v8 允许 `metrics: null`，并由权威 Snapshot 的 `plan.displayPolicy.showLiveMetrics` 决定。
- 真实 Chromium 证明 Webview 当前有两个 `main` landmark，且 nav 点击后的 host snapshot 全量重绘会把焦点退回 document/body。
- forced-colors 下当前页只有 VS Code 颜色背景，没有 outline/border 等非颜色当前态指示。
- 合法上限内的长 Recent material ID 在 220px 侧栏没有产生水平溢出；该项审计风险经真实 Chromium 验证为假阳性，无需生产修复。
- 审计最终分级：Critical 0；High 2（隐藏 live 事实、导航刷新丢焦点，均已修复）；Medium 2（双 main/整页 live region、高对比当前态，均已修复）；Low 1（粗指针动作触达区域，已修复）。
- Anti-pattern verdict：通过。界面使用 VS Code 原生令牌、紧凑列表与渐进披露，无品牌渐变、阴影卡片、玻璃拟态、装饰性动画或 AI 模板化 hero 指标。
- 正面保留项：严格 CSP、无网络资源、宿主文本转义、原生 label/fieldset/button、状态文本不只依赖颜色、空状态具备下一步引导。
- 三条 feature gate 的权威边界一致：Webview 只发送严格命令；Application 草稿验证来源/范围；Coordinator 创建 Snapshot/Session；Editor Port 打开内存 `moyuplus-practice:` 文档，不写项目文件。
- WP5 全部退出证据已闭合并正式标记 complete；WP6 的关键安全边界是“旧状态只形成恢复提示，不形成 Result”，以及“旧公共命令仅为新 Application 的薄别名，不得导入旧 Controller”。
- 旧 `moyuplus.typingPracticeSession.v1` 当前仍由 `WorkspaceSessionStore` 读取并驱动旧 Controller；activation 同时注册新 `moyuplus-practice:` editor/View 和旧任意文件 Inline Completion/状态栏，因此 WP6 必须先切断旧注册，再由兼容适配器接管保留命令 ID。
- 旧 session 的 `fileId` 指向旧 TXT library ID；Reader v2 Book ID 可能由迁移重新生成。可靠映射路径是旧 `TXT_LIBRARY_KEY` 记录的 URI → `BookLibraryStore.getByUri()`，不能假设 ID 相同。
- `LegacyResumeHint` 只应携带映射后的来源引用、physical lineIndex 与空白偏好；它不是 PracticeResult、Snapshot 或可自动恢复的 Session。用户在 setup 确认后才会创建新 Snapshot。
- 一次性消费必须是失败安全的：先写/校验新 hint，再清除旧 session；任一步失败都不得丢失旧状态。无活动 session 或无法映射来源时也应写完成 marker，避免每次 activation 重试无意义迁移，但应记录明确状态。
- `LegacyTypingMigration` 现先写并严格回读 `LegacyResumeHint`，再写并回读完成 marker，最后清除旧 session；若旧 session 清除本身失败，下一次 activation 会在已验证 marker 分支重试清理，不重复覆盖首次 hint。
- 无法通过 URI 映射 Reader v2 TXT Book 时，hint 明确记录 `available:false` 且不携带猜测的 `bookId`；旧标题只用于可识别提示，不授予来源读取能力。
- 保留的 start/stop/toggle/reset 命令可完全投影到 `TypingViewProvider.openPage + TypingViewPracticeCommands.controlPractice`；旧 next/jump/trim/menu 没有新领域等价物，只保留一轮明确弃用提示，不再推进 physical line 或修改旧偏好。
- 正式 activation 已不再构造旧 Controller，也不注册全局 `pattern: '**'` Inline Completion、状态栏和旧活动 context；新系统的文件系统 provider、原生编辑器与 Typing View 成为唯一生产装配。
- 旧全局 Tab Router 不能继续读取旧 session 或生成 ghost text；保留命令 ID 时最窄兼容行为是回退 VS Code 原生 Tab，新练习的 Tab/Enter 继续由 `resourceScheme == moyuplus-practice` 专用命令处理。
- 恢复提示跨 Webview 的最小事实集不需要任何 ID：Host 可按当前 workspaceState 重新读取权威 hint，页面只展示标题、可用性、物理行附近位置和旧空白规则；确认消息因此无需携带 book/source 标识。
- 旧空白规则只有 `ignoreAllSpaces` 与“双侧 trim”可无损映射到新版 `ignore` / `trimLineEdges`；单侧 trim 和 skip-empty 没有一一对应的新策略，必须在提示中展示并让用户在 setup 复核，不能静默扩大忽略范围。
- 恢复确认前必须重新扫描 Book URI 可用性；marker 中的 `available:true` 只代表迁移时成功映射 Reader v2 Book，不代表源文件此刻仍存在。扫描失败时保留 hint 并走书架重新定位，不可先消费。
- 旧行为集成测试继续断言“写真实编辑器文件、全局 ghost text、状态栏、physical line 菜单”会把删除目标固化成契约；WP6 应以迁移/别名/唯一装配/新 setup 确认测试替换它，而旧 Controller 的纯单元测试可留到 WP7 随生产文件一起删除。
- 迁移 marker 是清理重试的权威检查点：若 hint/marker 已验证而旧 key 删除失败，下次 activation 应只删除旧 key，不能重新生成或覆盖 hint；若 marker 未提交成功，则旧 session 必须继续存在以允许完整重试。
- WP6 最终静态核对中，旧标识只存在于 `src/typing/TypingPracticeController.ts`、`typingPracticeCommands.ts`、`typingSourceCatalog.ts` 及对应纯单元测试；`extension.ts`、ShortcutRouter、package UI 和新 registration 均无旧业务依赖。物理删除严格留给 WP7。
- WP6 完整证据为 Vitest 101 文件 470/470、TypeScript、四目标 build、Chromium 47/47、真实 Extension Host 退出码 0 与 `git diff --check`；新 typing 已是唯一生产注册。

## 2026-07-27 WP7 删除基线发现

- WP6 的生产装配切断已经成立，但旧实现文件仍会继续被 TypeScript 编译并构成可执行代码面；WP7 必须物理删除，而不能只依赖“未导入”。
- 删除守卫证实旧集成测试已经消失，其余旧 Controller/SourceCatalog/WorkspaceSessionStore/领域模型和三个专属测试仍存在。
- 全局 `moyuplus.routeTab`、`enableTabRouter`、`moyuplus.typing.tabMode` 与 `nextPracticeLine` 仍分散在 ShortcutRouter、统一设置协议/权威列表和设置 Webview 中；它们属于旧任意文件路由，不是新版 `moyuplus-practice:` 专用编辑器命令。
- 新版编辑器注册中的 `routeTab` 方法和资源 scheme 专用 Tab 命令是当前架构的一部分，删除守卫应只约束旧全局快捷键/设置边界，不能误删新编辑器的精确路由。
- 旧栈物理删除后，生产源码不再包含旧 Controller/SourceCatalog/session store；兼容命令只剩不导入旧业务的薄别名或弃用提示。
- 性能基线揭示 `PracticeSessionEngine.input()` 深拷贝累积 attempt 历史，使 50k 历史下 p95 达约 405.569ms；活动 Session 属于运行时可变状态，Snapshot 才是不可变事实，因此输入/修正改为权威 Session 原位追加，恢复 O(1) 热路径。
- 精确 200,000 字素、1,000 行快照的 Decoration 只访问可见范围及缓冲行，自动预算通过；真实 Extension Host 51 次文档变化采样得到 p95 3.179ms、最大 6.090ms。
- Chromium 首轮 46/47 的唯一失败来自设置 harness 仍发送已删除的 3 个旧配置；更新夹具后聚焦 1/1、最终全量 47/47。
- 设计第 18 节把 IME、主题、多窗口和大素材列为真实人工门槛。当前只有微软拼音已有人工作证；自动化不能冒充第三方输入法或双窗口真实操作，因此 WP7 必须保持进行中。
