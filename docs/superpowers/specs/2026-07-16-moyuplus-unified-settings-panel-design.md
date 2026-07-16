# MoyuPlus 统一设置面板设计

**日期：** 2026-07-16
**状态：** 已获用户设计确认，待规格评审
**范围：** 独立 WebviewPanel、统一设置入口、全局偏好、快捷键引导

## 1. 目标

新增一个独立的 `WebviewPanel` 作为 MoyuPlus 唯一的统一设置中心，将当前分散在 Reader 设置抽屉、Git Log 设置抽屉、VS Code configuration 和快捷键动作模型中的设置整合到同一界面。

用户能够从资源管理器中的工作区右键菜单打开 `MoyuPlus Settings`。Reader 与 Git Log 原有设置按钮不再原地打开抽屉，而是打开统一面板并定位到对应分区。快捷键分区提供一个入口，打开 VS Code Keyboard Shortcuts 并自动填入 `moyuplus` 搜索词，引导用户使用原生按键映射机制。

所有打字练习相关设置和快捷键条目必须明确标注“实验性”。面板不提供打字练习的立即执行操作，避免尚未打磨完成的能力被呈现为成熟、完整的配置体验。

## 2. 非目标

- 不在自制 Webview 中直接录制、修改或删除快捷键。
- 不提供打字练习的开启、停止、选择 TXT、重置进度、跳转行号等立即执行操作。
- 不改变打字练习、Reader、Git Log 的核心业务语义。
- 不改变现有 ReaderPreferences 与 GitLogPreferences 的持久化键或进行数据迁移。
- 不新增联网能力、外部资源或第三方 UI 依赖。
- 不将书架导入、移除、重新定位等内容管理动作归入设置面板。

## 3. 入口与生命周期

### 3.1 独立面板

新增单例 `MoyuPlusSettingsPanel`：

- 使用独立 `WebviewPanel`，不依赖 Explorer 侧边栏 Webview 的生命周期。
- 重复打开时复用现有面板并聚焦，不创建重复标签页。
- 打开命令接受 `reader`、`gitLog`、`typing` 或 `shortcuts` 分区参数。
- 面板被重新显示时从扩展宿主读取真实设置快照，Webview 本地状态不是持久化真相来源。
- dispose 时释放消息监听、配置监听和其他订阅。

### 3.2 命令与菜单

新增命令 `moyuplus.openSettings`，标题为 `MoyuPlus Settings`，并加入：

- activationEvents；
- contributes.commands；
- 资源管理器 `explorer/context` 右键菜单。

资源管理器右键入口不依赖选中资源内容，始终只负责打开设置中心。

现有 `moyuplus.reader.openSettings` 保留命令 ID 以兼容既有绑定，但行为改为打开统一面板的 `reader` 分区。

### 3.3 既有设置按钮

- Reader 工具栏的阅读设置按钮向扩展宿主请求打开 `reader` 分区。
- Git Log 工具栏的设置按钮向扩展宿主请求打开 `gitLog` 分区。
- 两个 Webview 内原有设置抽屉及其打开路径被移除，不再保留第二套编辑界面。

## 4. 信息架构与响应式布局

采用已确认的左侧分区导航：

1. 阅读
2. Git Log
3. 打字练习（实验性）
4. 快捷键

桌面宽度下使用固定宽度左侧导航和右侧内容区。窄宽度下，左侧导航转换为顶部原生选择器；任何设置均不得因宽度不足而隐藏。

视觉遵循项目 `.impeccable.md`：

- 使用 VS Code 字体、控件尺度、边框、焦点和 `--vscode-*` 主题令牌；
- 完整适配明暗主题；
- 不使用外部字体、品牌渐变、阴影卡片、玻璃效果或装饰性动画；
- 信息层级依靠标题、分组、间距和原生状态色建立；
- 状态不能只通过颜色表达。

面板头部显示 `MoyuPlus Settings` 和“设置会自动保存”。保存成功时显示短暂的“已保存”；失败时显示可操作的错误文案。

## 5. 设置清单

### 5.1 阅读

复用现有 `ReaderPreferences`、默认值、归一化和范围限制：

- 主题 `theme`；
- 字体 `fontFamily`；
- 字号 `fontSize`；
- 行高 `lineHeight`；
- 字间距 `letterSpacing`；
- 段间距 `paragraphSpacing`；
- 文字颜色 `textColor`；
- 背景颜色 `backgroundColor`；
- 页面边距 `pagePadding`；
- 对齐方式 `textAlign`。

提供“恢复阅读默认值”。恢复操作写入经 `normalizeReaderPreferences` 归一化的完整默认对象。

### 5.2 Git Log

复用现有 `GitLogPreferences`、默认值、归一化和范围限制：

- 显示提交哈希 `showHash`；
- 显示作者 `showAuthor`；
- 显示相对时间 `showRelativeTime`；
- 显示绝对日期 `showAbsoluteDate`；
- 排列方式 `layout`；
- 最大提交数量 `maxCommits`。

提供“恢复 Git Log 默认值”。最大提交数量继续限制在 20–1000。

### 5.3 打字练习（实验性）

只展示当前已有的持久化选项：

- Tab 路由总开关 `moyuplus.shortcuts.enableTabRouter`；
- Tab 补全方式 `moyuplus.typing.tabMode`；
- Enter 路由总开关 `moyuplus.shortcuts.enableEnterRouter`；
- 插入真实换行 `moyuplus.enter.insertNewLine`；
- 推进练习行 `moyuplus.enter.nextPracticeLine`；
- 阅读器下一页 `moyuplus.enter.nextReaderPage`。

分区标题、分区说明以及所有直接关联打字练习的设置和快捷键条目都显示文本“实验性”，不能只用颜色或图标表达。

该分区明确说明：

- 练习输入会真实写入当前编辑器文件；
- 建议仅在临时文件、草稿或专门练习文件中使用；
- Tab 仍优先让 VS Code 补全菜单和 snippet 处理；
- Enter 与 Tab 是高频编辑按键，可能与现有按键映射冲突。

开启 Enter 或 Tab 路由总开关前，由扩展宿主显示原生确认提示。取消确认时 Webview 保持关闭状态；关闭开关不需要确认。

所有六项 configuration 均显式写入 `vscode.ConfigurationTarget.Global`。读取时同时检查 user、workspace 与 workspace-folder 作用域。若较窄作用域覆盖全局值，面板显示“当前工作区存在覆盖”，并说明当前运行行为可能仍使用覆盖值。

### 5.4 快捷键

快捷键分区按阅读、Git Log、实验性打字练习分组，展示动作名称、说明、默认绑定或风险说明。范围包括：

- Reader：下一页、上一页、撤回阅读位置、上一章、下一章、书架、目录、设置、打开、关闭；
- Git Log：打开或退出；
- 打字练习（实验性）：开启或关闭、Enter 组合动作、Tab 练习补全。

提供主按钮“在键盘快捷方式中配置 MoyuPlus”。扩展宿主执行 VS Code 原生命令打开 Keyboard Shortcuts，并传入 `moyuplus` 查询，使搜索框在打开时已经包含插件名。按键实际配置、冲突展示和删除均由 VS Code 原生界面负责。

## 6. 保存与同步数据流

### 6.1 初始化

扩展宿主生成严格的设置快照，包含：

- 归一化后的 ReaderPreferences；
- 归一化后的 GitLogPreferences；
- 六项 configuration 的全局值、默认回退值、当前有效值和覆盖状态；
- 目标分区。

Webview 只渲染经过宿主归一化的数据。

### 6.2 普通修改

1. 用户改变控件。
2. Webview 立即更新显示，并发送类型化保存消息。
3. 扩展宿主严格校验消息类型、字段和数值范围。
4. Reader/Git Log 偏好写入现有 globalState store；configuration 写入 Global target。
5. 宿主返回规范化后的最新值。
6. Webview 显示短暂“已保存”。

若保存失败，宿主返回错误和权威旧值，Webview 回滚控件并显示错误。未知消息、未知设置键、额外字段和越界值不得写入。

### 6.3 高风险开关

Enter/Tab 开启请求在写入前走宿主确认。确认后保存并返回新值；取消或失败均返回权威旧值。高风险开关不能在未确认时对产品行为产生影响。

### 6.4 已打开 Reader 的实时同步

ReaderPreferences 或 GitLogPreferences 保存后，统一设置服务通知现有 ReaderViewProvider：

- 阅读页立即应用新的 ReaderPreferences 并重新排版；
- Git Log 页面立即应用新的字段、布局与最大加载数量；
- `maxCommits` 改变且 Git Log 活跃时，沿用现有刷新协调路径重新加载；
- 书架状态和阅读位置不因设置更新而重置。

configuration 路由项由命令执行时读取，因此保存后自然用于后续 Enter/Tab 操作。

## 7. 消息边界与安全

- 设置面板使用独立随机 nonce。
- CSP 至少包含 `default-src 'none'`、nonce 限定的脚本与样式、`connect-src 'none'`、`frame-src 'none'` 和 `media-src 'none'`。
- 只加载扩展 `media` 目录中的本地脚本和样式，不允许网络资源。
- Webview 到扩展宿主的消息使用可判别联合和运行时守卫。
- 保存消息采用明确的设置域和键白名单，拒绝原型键、任意路径和未知字段。
- 数值、枚举和颜色继续复用现有归一化函数；配置键仅接受设计中列出的六项。
- 错误消息不回显任意对象、堆栈或本地路径。

## 8. 可访问性与交互细节

- 每个输入控件具有可见标签和说明关系。
- 左侧导航和窄屏选择器表达当前分区。
- 键盘用户可以完成分区切换、设置修改、恢复默认和打开快捷键界面。
- 焦点样式使用 VS Code focusBorder，不能仅依赖背景色。
- 保存中、已保存、失败、实验性、存在覆盖和高风险状态均提供文本。
- 动态保存状态使用合适的 live region，但避免每次滑块微调产生冗余朗读。
- `prefers-reduced-motion` 下不依赖动画表达任何状态；页面本身不使用装饰性动画。

## 9. 错误处理

- 初始快照读取失败：显示阻断错误和“重试”按钮，不渲染可能过期的假设置。
- 单项保存失败：只回滚该项，其他已保存设置保持不变。
- 恢复默认失败：回滚到恢复前的完整分区快照。
- Keyboard Shortcuts 命令执行失败：显示宿主错误，不宣称已打开。
- 外部 configuration 变化：面板监听 `onDidChangeConfiguration` 并刷新六项配置和覆盖状态。
- 面板被 dispose 后到达的异步结果被忽略，不重新创建面板。

## 10. 测试策略

遵循 RED → GREEN → REFACTOR。

### 10.1 单元与契约测试

- package contributions：命令、activation event、explorer/context 菜单、兼容命令 ID；
- 面板单例与分区深链；
- 设置快照包含全部 22 项设置，并保持稳定分组；
- Reader/Git Log 默认值恢复与归一化；
- 六项 configuration 显式写入 Global target；
- workspace/workspace-folder 覆盖状态；
- Enter/Tab 开启确认、取消和关闭路径；
- 未知消息、未知键、额外字段、无效枚举、越界数值拒绝；
- Keyboard Shortcuts 原生命令收到 `moyuplus` 查询；
- Reader 与 Git Log 设置按钮不再打开原地抽屉，而是请求深链打开统一面板；
- 保存后的实时偏好同步和 `maxCommits` 刷新语义。

### 10.2 Webview 状态测试

- 初始化、分区切换和深链定位；
- 即时保存、成功状态、失败回滚；
- 恢复默认成功与失败；
- “实验性”文本存在于分区、相关设置和快捷键条目；
- 覆盖提示和高风险说明；
- 重复响应和 dispose 后响应不会污染状态。

### 10.3 Playwright 布局与无障碍验证

- VS Code 明暗主题令牌下的可读性；
- 桌面左侧导航；
- 窄宽度顶部选择器且设置完整可达；
- Tab 顺序、可见焦点、标签关联和按钮操作；
- Reader/Git Log 入口到正确分区；
- 设置抽屉不再出现；
- 页面不发起外部网络请求。

### 10.4 最终门禁

- `npm run compile`
- `npm run test:unit`
- `npm run test:layout`
- `git diff --check`

## 11. 验收标准

1. 工作区资源管理器右键可见 `MoyuPlus Settings`，点击打开独立设置标签页。
2. 同一时刻最多存在一个设置面板；不同入口能够定位到正确分区。
3. Reader 与 Git Log 设置按钮不再打开原地抽屉。
4. 面板完整覆盖阅读 10 项、Git Log 6 项、实验性打字练习 6 项。
5. 所有普通设置即时保存；Enter/Tab 开启前必须确认。
6. 所有打字练习相关设置和快捷键条目都有可读的“实验性”文本。
7. 面板不提供打字练习立即执行操作。
8. 快捷键按钮打开 VS Code Keyboard Shortcuts，搜索框已填入 `moyuplus`。
9. 阅读和 Git Log 偏好保存后，已打开视图无需重开即可更新。
10. 工作区覆盖、保存失败和实验性状态均不会只依赖颜色表达。
11. 明暗主题和窄宽度下设置均可访问、可操作。
12. 编译、单元测试、布局测试和 diff 检查全部通过。
