# moyuplus VS Code 插件设计规格

日期：2026-07-08

## 目标

构建一个本地优先的 VS Code 插件，提供侧边栏 TXT 分页阅读器和基于 TXT 物理行的自由打字练习。插件不联网、不上传文件，只保存 TXT 文件路径和本地状态。

首版采用 MVP 垂直切片：先贯通插件骨架、TXT 导入、阅读器、打字练习、状态栏和快捷键路由，再逐步补齐设置面板、异常处理和测试。

## 范围

首版必须覆盖：

- TypeScript VS Code extension 项目骨架。
- TXT 文件导入和已导入文件列表。
- UTF-8 与 GBK 编码读取。
- 全局 TXT 文件索引。
- workspace 级阅读状态和练习状态。
- VS Code 侧边栏 Webview View 阅读器。
- 基于 Webview DOM 实际高度测量的动态分页。
- 阅读上一页、下一页、字体大小调整和进度恢复。
- 打字练习文件选择、物理行进度、跳过空行/空格处理配置。
- Inline Completion 形式的 ghost text 行内提示。
- Tab 练习补全和 Enter 组合行为的命令路由。
- 打字练习状态栏和快捷菜单。

明确不做：

- 联网同步、云存储、账号系统。
- 严格打字判题、实时错误标红、WPM、正确率。
- 复杂书架、标签分类、练习历史。
- 多阅读窗口或多阅读会话。
- 阅读进度与练习进度自动同步。

## 技术栈

- VS Code Extension API。
- TypeScript。
- Webview View 用于侧边栏阅读器。
- VS Code Inline Completion API 用于打字练习 ghost text。
- VS Code `globalState` 保存全局 TXT 文件索引。
- VS Code `workspaceState` 保存当前工作区阅读和练习状态。
- Node 文件系统 API 读取 TXT 文件。
- `iconv-lite` 处理 GBK 编码。

## 推荐项目结构

```txt
src/
  extension.ts
  commands/
    registerCommands.ts
    readerCommands.ts
    typingCommands.ts
    shortcutRouter.ts
  domain/
    models.ts
    readerSession.ts
    typingSession.ts
    txtTransform.ts
  storage/
    storageKeys.ts
    txtLibraryStore.ts
    workspaceSessionStore.ts
  txt/
    txtFileService.ts
    encoding.ts
  reader/
    ReaderViewProvider.ts
    readerMessages.ts
    webviewHtml.ts
  typing/
    TypingPracticeController.ts
    InlineCompletionProvider.ts
    statusBar.ts
  test/
    unit/
    integration/
media/
  reader.css
  reader.js
```

`extension.ts` 只负责组合注册，不承载业务逻辑。阅读器、练习、存储、文件读取分别保持独立模块边界。

## 数据模型

沿用指导文档中的核心模型：

- `ImportedTxtFile`：全局 TXT 文件索引，保存 `id`、`name`、`uri`、`encoding`、`source`、时间戳。
- `ReaderSession`：workspace 级阅读状态，保存 `active`、`fileId`、`offset`、字体参数、viewport 快照和 `pageHistory`。
- `TypingPracticeSession`：workspace 级练习状态，保存 `active`、`fileId`、`lineIndex`、总行数、空行/空格配置、Tab 模式、Enter 组合行为。
- `ShortcutConfig`：快捷键映射配置，后续可映射到 VS Code configuration 与插件内设置页。

## 状态与数据流

TXT 文件导入：

1. 用户执行导入命令。
2. 插件打开文件选择器，允许选择工作区内外 TXT。
3. 用户选择编码或使用默认 UTF-8。
4. 插件保存文件索引到 `globalState`。
5. 阅读器 Webview 和练习选择入口刷新文件列表。

阅读器：

1. Webview 请求当前阅读文件和 offset。
2. 扩展主进程读取 TXT 内容并发送给 Webview。
3. Webview 根据容器尺寸、字体和行高测量当前页可显示范围。
4. Webview 回传当前页 `startOffset` 和 `endOffset`。
5. 主进程更新 `ReaderSession.offset` 和 `pageHistory`。

打字练习：

1. 用户选择已导入 TXT 作为练习文件。
2. 主进程读取并按物理行切分内容。
3. `TypingPracticeController` 保存当前行号和配置。
4. Inline Completion Provider 在练习开启时返回当前练习行。
5. 状态栏显示 `Typing: file.txt 12/300`。

## 动态分页设计

分页在 Webview 内完成，因为只有 Webview 能拿到真实渲染后的文本高度。

实现策略：

1. 从当前 offset 起取一段候选文本。
2. 放入隐藏测量容器，使用与阅读正文一致的 CSS。
3. 用二分查找寻找不超过可见区域高度的最大 end offset。
4. 尽量在换行、段落边界或字符边界收敛。
5. 将计算结果作为当前页范围发回扩展主进程。

上一页依赖 `pageHistory` 优先返回用户刚看过的上一屏。窗口尺寸或字体变化后，允许页码不完全一致，但必须保持 offset 附近内容可恢复。

## 打字练习设计

练习只提供参考文本，不做判题。当前练习行的处理顺序：

1. 读取原始物理行。
2. 根据配置跳过空行。
3. 根据配置处理前导空格或所有空格。
4. 将处理后的文本作为 ghost text 返回。

Tab 补全：

- `replaceLine`：用练习行替换当前编辑器行。
- `completeRest`：保留用户已输入内容，只插入剩余部分。

Enter 行为：

- 默认必须保留真实换行。
- 可选触发下一练习行。
- 可选触发阅读器下一页。

## 快捷键路由

特殊键不直接绑定业务动作，而是绑定路由命令：

- `moyuplus.routeEnter`
- `moyuplus.routeTab`

Tab 路由优先级：

1. VS Code 原生补全菜单。
2. snippet 占位符跳转。
3. 打字练习补全。
4. VS Code 原生 Tab。

Enter 路由优先级：

1. 插入真实换行。
2. 如果配置开启，练习行前进。
3. 如果配置开启，阅读器下一页。

如果 VS Code API 无法可靠判断补全菜单或 snippet 状态，首版应避免默认劫持 Tab，仅提供显式命令和受限 `when` 条件，防止破坏编辑器体验。

## 用户界面

侧边栏阅读器包含：

- 导入/切换 TXT。
- 文件名和来源标识。
- 阅读正文。
- 上一页/下一页。
- 字体增大/减小。
- 编码切换。
- 打字练习设置入口。

命令面板包含：

- Import TXT。
- Toggle Reader。
- Next Page / Previous Page。
- Start Typing Practice。
- Stop Typing Practice。
- Select Practice File。
- Reset Practice Progress。
- Jump to Practice Line。

状态栏仅在打字练习开启时显示。点击状态栏展示快捷菜单。

## 错误处理

- TXT 路径不存在：提示重新定位或移除导入记录。
- 编码读取失败：提示切换 UTF-8/GBK。
- 未导入 TXT 时开启练习：引导先导入文件。
- Webview 分页失败：显示错误状态并保留原 offset。
- 练习文件总行数为 0：提示该文件没有可练习内容。
- 用户在源码文件中练习：首次开启时提示“输入会真实写入当前编辑器文件”。

## 测试策略

单元测试：

- 数据模型默认值。
- 文件索引增删改。
- UTF-8/GBK 解码。
- workspace/global 状态读写。
- 练习行过滤和空格处理。
- Tab 补全文本计算。

集成测试：

- 命令注册。
- 文件导入流程。
- 阅读 session 恢复。
- Inline Completion Provider 在练习开启/关闭时的行为。
- 状态栏显示内容。

人工验证：

- VS Code Extension Development Host 中导入 TXT。
- 侧边栏阅读器翻页、关闭、重开恢复。
- 长中文/英文行自动换行并参与分页。
- 在普通编辑器中显示 ghost text。
- Tab/Enter 不破坏常见编辑行为。

## 验收标准

首个可用版本完成时应满足：

- 可以在 VS Code 中启动插件开发宿主。
- 可以导入 UTF-8 和 GBK TXT 文件。
- 文件列表能显示当前阅读文件和当前练习文件。
- 阅读器能在侧边栏分页显示 TXT，并恢复 offset。
- 动态分页依据 DOM 测量，不按固定字符数硬切。
- 打字练习能在任意编辑器显示当前练习行 ghost text。
- Enter 默认保留真实换行。
- Tab 默认不破坏补全/snippet，高风险行为受配置控制。
- 状态栏能显示当前练习文件和行号。
- 核心逻辑有自动化测试覆盖。
