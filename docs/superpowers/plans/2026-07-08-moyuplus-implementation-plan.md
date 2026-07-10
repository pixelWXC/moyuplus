# moyuplus 实施计划

日期：2026-07-08

## 总原则

按 MVP 垂直切片推进。每一阶段都应产生可运行、可验证的增量，不把阅读器、练习和快捷键一次性堆到最后。

当前目录已于 2026-07-08 按用户要求初始化 Git。后续改动可以按阶段提交；提交前仍应先确认变更范围和验证结果。

## Phase 0: 初始化插件项目

目标：建立可运行的 TypeScript VS Code extension 骨架。

任务：

- 创建 `package.json`、`tsconfig.json`、`.vscode/launch.json`。
- 添加 `src/extension.ts`。
- 配置 `npm run compile`、`npm run watch`、`npm test`。
- 注册基础 activation event 和一个 smoke-test command。
- 安装依赖：`vscode` 类型、TypeScript、测试框架、`iconv-lite`。

验收：

- `npm run compile` 通过。
- VS Code Extension Development Host 可启动。
- smoke-test command 可在 Command Palette 中执行。

执行状态：

- 2026-07-08 已完成 TypeScript VS Code extension 骨架、compile/test 脚本、VS Code launch 配置和 smoke-test command。
- 已通过自动验证：`npm run compile`、`npm test`。
- 尚未进行人工 Extension Development Host 启动和 Command Palette 验证。

## Phase 1: 数据模型与存储层

目标：先把状态边界固定下来，避免后续 UI 直接操作 VS Code state。

任务：

- 定义 `ImportedTxtFile`、`ReaderSession`、`TypingPracticeSession`、`ShortcutConfig`。
- 实现 `txtLibraryStore`：读写全局 TXT 文件索引。
- 实现 `workspaceSessionStore`：读写 workspace 阅读/练习状态。
- 增加默认值和迁移保护。
- 写单元测试覆盖增删改查和默认状态。

验收：

- 全局文件列表和 workspace session 可独立读写。
- 阅读状态与练习状态互不影响。
- 测试覆盖空状态、已有状态和损坏状态恢复。

执行状态：

- 2026-07-08 已完成 `ImportedTxtFile`、`ReaderSession`、`TypingPracticeSession`、`ShortcutConfig` 类型定义。
- 已实现 `txtLibraryStore`，支持全局 TXT 文件索引读取、查找、增加/更新、删除和整体替换。
- 已实现 `workspaceSessionStore`，支持 workspace 阅读 session 与练习 session 独立读取、保存和重置。
- 已增加默认值和损坏/旧形状状态恢复保护。
- 已通过自动验证：`npm run compile`、`npm test`。

## Phase 2: TXT 文件服务与导入命令

目标：实现 TXT 文件索引和读取能力。

任务：

- 实现 UTF-8/GBK 解码。
- 实现文件来源判断：workspace/external。
- 实现导入命令 `moyuplus.importTxt`。
- 实现移除导入记录。
- 实现文件失效检查和提示入口。
- 提供读取全文和读取练习物理行的 API。

验收：

- 可导入工作区内外 TXT。
- 可读取 UTF-8/GBK。
- 删除或移动原文件后有明确错误，不静默失败。

执行状态：

- 2026-07-08 已完成 `TxtFileService`，支持 TXT 导入索引、UTF-8/GBK 解码、workspace/external 来源判断、全文读取、物理行读取、失效文件检查和移除导入记录。
- 已注册 `moyuplus.importTxt`、`moyuplus.removeImportedTxt`、`moyuplus.checkImportedTxtFiles` 命令，并接入扩展 activation。
- 已通过自动验证：`npm test`、`npm run compile`。
- 2026-07-08 已通过人工 Extension Development Host 验证：Smoke Test、UTF-8/GBK 导入和显示、失效文件检查与移除。

## Phase 3: 阅读器 Webview 基础版

目标：先让侧边栏阅读器跑起来。

任务：

- 注册 Webview View Provider。
- 创建阅读器 HTML/CSS/JS。
- Webview 与扩展主进程建立消息协议。
- 显示当前 TXT 文件、阅读内容、上一页/下一页、字体按钮。
- 将阅读 offset 保存到 `ReaderSession`。

验收：

- 侧边栏能打开。
- 能选择已导入 TXT 作为阅读文件。
- 能显示文本内容。
- 关闭/重开后能恢复阅读文件和 offset。

执行状态：

- 2026-07-08 已完成 `ReaderViewProvider`，注册 `moyuplus.readerView` Webview View Provider，并接入 VS Code Explorer 侧边栏视图贡献。
- 已创建阅读器 Webview HTML/CSS/JS，支持导入文件下拉选择、文本显示、上一页/下一页、字体增大/减小和刷新。
- 已建立 Webview 与扩展主进程消息协议：`ready`、`selectFile`、`nextPage`、`previousPage`、`pageRendered`、`setFontSize`。
- 已将阅读文件、offset、字体大小、viewport 快照和 pageHistory 保存到 workspace `ReaderSession`。
- 已通过自动验证：`npm test`、`npm run compile`。
- 2026-07-08 已通过人工 Extension Development Host 验证：侧边栏 Webview 打开、选择文件、文本显示、上一页/下一页、字体调整、Reload 后恢复文件/offset/font。

## Phase 4: DOM 动态分页

目标：解决阅读器最核心的技术风险。

任务：

- 在 Webview 中创建隐藏测量容器。
- 使用与正文一致的字体、行高、宽度、内边距。
- 实现 offset 到 page range 的二分测量。
- 维护 `pageHistory`，支持上一页尽量回到刚才页面。
- 监听容器 resize 和字体变化，重新分页。

验收：

- 分页不按固定字符数或固定行数。
- 长中文/英文行自动换行且计入高度。
- 下一页无重叠文本。
- 上一页能回到历史页面。
- 改变字体或侧边栏宽度后仍恢复到 offset 附近。

执行状态：

- 2026-07-08 已将阅读器 Webview 的临时字符数估算分页替换为 DOM 实际高度测量分页。
- 已在 Webview 中创建隐藏测量容器，并同步正文宽度、字体、字号、字重、行高、字距、tab size 和内边距。
- 已实现从当前 offset 开始的指数扩展 + 二分测量，使用 `scrollHeight` 与正文可见高度比较，长中文/英文自动换行会计入高度。
- 已在页面渲染后回传 `pageRendered`，主进程继续保存 `ReaderSession.offset`、`viewportSnapshot` 和 `pageHistory`；上一页仍优先使用历史页范围。
- 已接入 `ResizeObserver` 和 window resize，侧边栏尺寸变化后重新测量分页；字体变化通过 session state 重新渲染并恢复到当前 offset 附近。
- 已新增 `src/test/unit/readerWebviewHtml.test.ts`，约束 Webview 必须使用 DOM 测量分页并禁止回退到旧的固定字符估算。
- 已通过自动验证：`npm test`、`npm run compile`。
- 2026-07-08 已通过人工 Extension Development Host 验证：动态分页、上一页/下一页、长行换行、字体变化、侧边栏宽度变化和 Reload 恢复均无异常。

## Phase 5: 打字练习核心

目标：打通练习文件、行号、ghost text 和状态栏。

任务：

- 实现 `TypingPracticeController`。
- 实现练习文件选择命令。
- 实现物理行切分和行过滤配置。
- 注册 Inline Completion Provider。
- 当前练习行作为 ghost text 显示。
- 实现下一行、重置、跳转指定行。
- 实现状态栏显示和点击菜单。

验收：

- 开启练习后可在任意编辑器看到当前行提示。
- 切换编辑器不重置练习状态。
- 状态栏显示文件名、当前行号、总行数。
- 关闭练习后不再显示 ghost text。

执行状态：

- 2026-07-08 继续 Phase 5：已确认本阶段范围为练习文件选择、物理行进度、Inline Completion ghost text、下一行/重置/跳转和状态栏显示；当前工作区已有未跟踪 `manual-gbk.txt`、`manual-utf8.txt`，本阶段实现不主动修改这两个文件。
- 2026-07-08 已完成 `TypingPracticeController`，支持练习文件列表、开始/停止、当前行读取、下一行、重置、跳转指定物理行、默认跳过空行、首尾空白裁剪和全空白移除配置。
- 已注册 `moyuplus.startTypingPractice`、`moyuplus.stopTypingPractice`、`moyuplus.nextTypingPracticeLine`、`moyuplus.resetTypingPracticeProgress`、`moyuplus.jumpToTypingPracticeLine` 和状态栏菜单命令，并接入扩展 activation。
- 已注册 Inline Completion Provider；练习开启时根据当前编辑器行前缀返回当前练习行的剩余 ghost text，练习关闭后不再返回提示。
- 已实现打字练习状态栏，显示 `Typing: file.txt 当前物理行/总物理行`，点击后可执行下一行、重置、跳转、切换首尾空白裁剪和停止。
- 已处理残留失效练习 session：当保存的练习 `fileId` 已不在导入列表中时，状态栏隐藏且 Inline Completion Provider 返回空结果。
- 已通过自动验证：`npm test`、`npm run compile`。
- 2026-07-08 用户人工验证反馈：Import TXT、Start Typing Practice、ghost text 前缀补全、Next Line 跳过空行、Jump/Reset、切换编辑器不重置、Stop 后隐藏 ghost text 和状态栏均无问题；发现首尾空白裁剪配置缺失，已补充 `moyuplus.toggleTypingPracticeLineEdgeTrim` 和状态栏菜单入口。
- 2026-07-09 用户复测确认：首尾空白裁剪开关功能正常，Phase 5 人工验证通过。

## Phase 6: Enter/Tab 路由与设置

目标：在不破坏 VS Code 原生体验的前提下增加快捷操作。

任务：

- 实现 `moyuplus.routeEnter` 和 `moyuplus.routeTab`。
- 实现 Tab 两种模式：整行替换、补全剩余部分。
- 实现 Enter 组合行为：真实换行、下一练习行、阅读器下一页。
- 配置默认 `when` 条件，默认避免高风险拦截。
- 在 VS Code Settings 中暴露高级配置。
- 在阅读器内提供常用设置入口。

验收：

- Enter 默认仍插入真实换行。
- 未开启练习时不拦截 Tab。
- Tab 补全可按配置替换整行或补全剩余。
- 快捷键行为有明确上下文限制。

执行状态：

- 2026-07-09 已按 TDD 新增 Phase 6 测试，覆盖 Tab 补全计算、路由命令注册、Enter/Tab 集成行为、package keybinding/configuration 贡献，以及阅读器快捷设置入口。
- 已新增 `src/commands/shortcutRouter.ts`，注册 `moyuplus.routeEnter` 和 `moyuplus.routeTab`；`extension.ts` 继续只做组合注册。
- 已实现 Tab 两种模式：`completeRest` 按当前编辑器行前缀插入剩余练习文本，`replaceLine` 用当前练习行替换整行；无活动练习、无编辑器或无可插入文本时回退 VS Code 原生 `tab`。
- 已实现 Enter 组合行为：根据 VS Code Settings 先执行真实换行，再可选推进下一练习行，并可选请求阅读器下一页；默认只插入真实换行，不推进练习或阅读器。
- 已在 `package.json` 暴露 `moyuplus.shortcuts.enableEnterRouter`、`moyuplus.shortcuts.enableTabRouter`、`moyuplus.typing.tabMode`、`moyuplus.enter.*` 高级配置；Enter/Tab keybinding 默认由配置关闭，Tab 额外受 `moyuplus.typingPracticeActive`、`!suggestWidgetVisible`、`!inSnippetMode` 等上下文限制。
- 已在打字练习状态更新时同步 `moyuplus.typingPracticeActive` context key，供 Tab 默认 `when` 条件使用。
- 已在阅读器 Webview 中增加 `Shortcuts` 入口，点击后打开 MoyuPlus 快捷键相关 Settings；阅读器下一页由扩展向 Webview 发送命令，再由 Webview 使用当前 DOM 分页范围发回 `nextPage`。
- 2026-07-09 人工测试准备中发现 Settings 英文说明不易理解，已将 Phase 6 相关设置说明改为中文，并为 `completeRest`/`replaceLine` 增加中文选项解释。
- 已通过自动验证：`npm test`（9 个测试文件、44 个测试通过）、`npm run compile`。
- 2026-07-10 用户确认 Phase 6 人工 Extension Development Host 测试全通过。

## Phase 7: 快捷键设置页与体验补齐

目标：补齐指导文档中的插件内设置体验。

任务：

- 在 Webview 中增加快捷键设置页面。
- 显示功能名称、当前绑定、启用状态、动作说明。
- 对高风险按键展示冲突提示文案。
- 增加安全提示：练习输入会真实写入当前编辑器文件。
- 完善空状态、错误状态和文件失效操作。

验收：

- 用户可以看到主要功能的快捷键配置状态。
- 首次开启练习有安全提示。
- 无文件、文件失效、编码失败都有明确反馈。

## Phase 8: 测试、打包与人工验证

目标：达到首个可用版本。

任务：

- 补齐单元测试和集成测试。
- 运行 compile/test。
- 在 Extension Development Host 中人工验证核心场景。
- 记录已知限制。
- 如需要，增加打包脚本。

验收：

- `npm run compile` 通过。
- `npm test` 通过。
- 人工验证清单通过。
- 文档中列出剩余风险和后续迭代项。

## 建议的首轮开发顺序

1. [x] Phase 0 初始化插件骨架。
2. [x] Phase 1 数据模型与存储层。
3. [x] Phase 2 TXT 文件服务与导入命令。
4. [x] Phase 3 阅读器基础版。
5. [x] Phase 4 动态分页。

原因：先完成阅读链路可以尽早验证 Webview DOM 分页，这是整个项目最大的不确定性。打字练习依赖同一套 TXT 文件和状态层，放在阅读链路之后实现更稳。

## 风险清单

| 风险 | 影响 | 应对 |
|------|------|------|
| Webview DOM 分页精度不足 | 阅读体验不稳定 | 先做可测量原型，再优化边界 |
| VS Code 无法可靠判断补全/snippet 状态 | Tab 可能干扰编辑 | 默认不绑定高风险 Tab，提供显式命令和受限配置 |
| GBK 文件读取异常 | 部分 TXT 无法使用 | 使用 `iconv-lite`，编码失败时允许用户切换 |
| 大 TXT 文件性能问题 | Webview 卡顿 | MVP 先全文读取，后续可做分段缓存 |
| 输入写入真实文件 | 用户误改源码 | 首次开启练习展示安全提示 |

## 下一步执行入口

下一步进入 Phase 7：快捷键设置页与体验补齐。
