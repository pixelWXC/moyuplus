# MoyuPlus 统一设置面板设计

**日期：** 2026-07-16
**状态：** 已实施并通过自动验收及真实 Extension Development Host 人工验收（2026-07-17）
**范围：** 独立 WebviewPanel、统一设置入口、全局偏好、快捷键引导

## 1. 目标

新增一个独立的 `WebviewPanel` 作为 MoyuPlus 唯一的统一设置中心，将当前分散在 Reader 设置抽屉、Git Log 设置抽屉、VS Code configuration 和快捷键动作模型中的设置整合到同一界面。

用户能够从代码编辑器右键菜单打开 `MoyuPlus Settings`。Reader 与 Git Log 原有设置按钮不再原地打开抽屉，而是打开统一面板并定位到对应分区。快捷键分区提供一个入口，打开 VS Code Keyboard Shortcuts 并自动填入 `moyuplus` 搜索词，引导用户使用原生按键映射机制。

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
- Webview 脚本每次加载后生成新的随机实例标识，并发送包含 `protocolVersion` 和实例标识的 `settingsReady`；扩展宿主完成实例切换屏障后返回新的权威设置快照。
- 面板由隐藏变为可见时通过 `onDidChangeViewState` 重新读取权威快照，不依赖隐藏前的 DOM 或 Webview 本地状态。
- 初始化快照、可见性刷新和保存响应均携带宿主单调递增的 `stateVersion`；Webview 不得应用低于已接收版本的陈旧状态。
- dispose 时释放消息监听、配置监听和其他订阅。

### 3.2 命令与菜单

新增命令 `moyuplus.openSettings`，标题为 `MoyuPlus Settings`，并加入：

- activationEvents；
- contributes.commands；
- 代码编辑器 `editor/context` 右键菜单。

入口显示在代码编辑器区域的右键菜单中，不额外限制只读、差异编辑器或语言类型。命令可以收到编辑器上下文参数，但必须忽略其内容，始终只负责打开设置中心。资源管理器不再贡献该入口。

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

桌面宽度下使用固定宽度左侧导航和右侧内容区。可用宽度小于等于 680 CSS px 时，左侧导航转换为顶部原生选择器；任何设置均不得因宽度不足而隐藏。

视觉遵循项目 `.impeccable.md`：

- 使用 VS Code 字体、控件尺度、边框、焦点和 `--vscode-*` 主题令牌；
- 完整适配明暗和高对比度主题；
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

文字颜色和背景颜色默认使用主题继承值 `theme`，而不是固定十六进制颜色。跟随 VS Code 时使用编辑器前景色与背景色，固定阅读主题下使用对应主题色；用户主动选择合法六位十六进制颜色后才以内联颜色覆盖主题，并可将单项恢复为“跟随主题”。

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

所有六项 configuration 均显式写入 `vscode.ConfigurationTarget.Global`。控件始终展示并编辑全局值；尚未显式设置全局值时展示默认回退值并标注“使用默认值”，首次修改后写入显式全局值。控件不能把 workspace 或 workspace-folder 的有效值伪装成可由当前控件直接修改的值。

读取时使用 `WorkspaceConfiguration.inspect` 检查默认值、全局值和 workspace 值，并为每个 `workspaceFolder` 使用对应资源 URI 单独读取 workspace-folder 值与实际有效值：

- 单文件夹工作区显示该工作区的覆盖来源、覆盖值和当前实际有效值；
- 多根工作区列出存在覆盖的文件夹显示名称、覆盖来源和各自实际有效值，不回显本地绝对路径；
- 当前活动编辑器属于某个工作区文件夹时，额外标明该编辑器实际使用的值；没有可归属的活动资源时，不宣称存在唯一的 workspace-folder 有效值；
- 任何较窄作用域覆盖全局值时，显示“当前工作区存在覆盖”，并明确说明当前控件保存的只是全局值，现有覆盖会继续决定对应资源的运行行为。

### 5.4 快捷键

快捷键分区按阅读、Git Log、实验性打字练习分组，展示动作名称、说明和风险说明，不推断或回显按键值。实际绑定、冲突和删除统一由 VS Code 原生 Keyboard Shortcuts 页面展示。范围包括：

- Reader：下一页、上一页、撤回阅读位置、上一章、下一章、书架、目录、设置、打开、关闭；
- Git Log：打开或退出；
- 打字练习（实验性）：开启或关闭、Enter 组合动作、Tab 练习补全。

提供主按钮“在键盘快捷方式中配置 MoyuPlus”。扩展宿主执行 `vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'moyuplus')`，使搜索框在打开时已经包含插件名。按键实际配置、冲突展示和删除均由 VS Code 原生界面负责。

## 6. 保存与同步数据流

### 6.1 初始化

扩展宿主生成严格的设置快照，包含：

- 归一化后的 ReaderPreferences；
- 归一化后的 GitLogPreferences；
- 六项 configuration 的默认值、全局值、workspace 值、各 workspace-folder 覆盖值、各文件夹实际有效值和活动资源实际有效值；
- 目标分区。

每个快照包含 `protocolVersion`、当前 Webview 实例标识和单调递增的 `stateVersion`。Webview 只渲染经过宿主校验与归一化的数据；实例标识不匹配或 `stateVersion` 陈旧的快照必须忽略。在首个有效快照到达前，页面保持加载状态且不允许提交设置变更。

`settingsReady.protocolVersion` 必须与宿主支持的版本完全一致。版本不匹配时宿主不得发送设置快照或接受变更，只返回最小化的 `settingsProtocolError`；Webview 显示阻断错误和“请重新加载窗口或更新扩展”，所有设置控件保持不可用。

### 6.2 顺序、一致性与响应关联

所有权威状态操作共用面板级串行队列，包括设置变更、恢复默认、实例切换、初始化或可见性快照以及外部 configuration 刷新。状态读取、持久化、规范化回读和 `stateVersion` 分配必须在同一个队列步骤中完成，不能在队列外预先读取状态后延迟发布。

收到有效的新 `settingsReady` 时，宿主立即将新实例标记为当前实例并使旧实例失效，然后向队列加入实例切换屏障：

- 已经开始持久化的旧实例步骤允许完成，切换屏障等待其结束；
- 尚未开始持久化的旧实例步骤在执行前被取消，不得写入；
- 屏障越过后才为新实例读取和发送首个快照，因此快照必然包含屏障前已经完成的写入；
- 新实例的变更只能在首个快照后提交，并排在切换屏障之后。

每个变更请求包含：

- 当前 Webview 实例标识；
- 唯一 `requestId`；
- Webview 单调递增的 `clientRevision`；
- 明确的设置域、键和值。

扩展宿主在请求入队前完成消息结构、协议版本、实例标识与值域校验，并在真正持久化前再次确认请求实例仍是当前实例。任一实例检查失败时取消请求且不得调用持久化层。执行完成后，响应回显 `requestId` 与 `clientRevision`，并携带递增的 `stateVersion` 和受影响设置的权威值。Webview 只允许最新请求改变对应控件的成功、失败和回滚状态；迟到的旧响应可以结束其内部等待，但不得覆盖更新的显示值或状态文案。

恢复默认作为单个分区事务进入同一队列。恢复请求未完成时暂时禁用该分区输入和恢复按钮，避免失败时使用完整分区快照回滚用户随后作出的修改。Enter/Tab 开启确认期间只禁用对应开关，其他设置仍可排队保存。

范围控件的 `input` 事件只更新本地预览；在 `change` 事件或停止输入 250 ms 后提交最终值，避免为每个微小步进产生持久化写入和 live region 播报。指针或键盘交互及其最新保存尚未结束时，页面不得替换活动滑块节点；保存响应和全量快照原地同步或延后合并渲染，保持滚动位置与焦点稳定，同一最终值不得由防抖和 `change` 重复提交。

### 6.3 普通修改

1. 用户改变控件。
2. Webview 立即更新显示，并发送带响应关联信息的类型化保存消息。
3. 扩展宿主先严格校验消息类型、字段、枚举和数值范围；无效值直接拒绝，不进入归一化或持久化步骤。
4. 校验通过后再调用现有归一化函数生成规范值；Reader/Git Log 偏好写入现有 globalState store，configuration 写入 Global target。
5. 宿主重新读取真实状态并返回规范化后的最新值、`requestId`、`clientRevision` 和 `stateVersion`。
6. Webview 显示短暂“已保存”。

若保存失败，宿主返回安全错误、权威旧值和响应关联信息，Webview 仅在该响应仍是对应控件最新请求时回滚并显示错误。未知消息、未知设置键、原型键、额外字段、无效枚举、非有限数值和越界值不得调用持久化层；不能依靠会钳制值的归一化函数代替拒绝。

### 6.4 高风险开关

Enter/Tab 开启请求在写入前走宿主确认。确认后保存并返回新值；取消或失败均返回权威旧值。高风险开关不能在未确认时对产品行为产生影响。

### 6.5 已打开 Reader 的实时同步

ReaderPreferences 或 GitLogPreferences 保存后，统一设置服务通知现有 ReaderViewProvider：

- 阅读页立即应用新的 ReaderPreferences 并重新排版；
- Git Log 页面立即应用新的字段、布局与最大加载数量；
- `maxCommits` 改变且 Git Log 活跃时，沿用现有刷新协调路径重新加载；
- 书架状态和阅读位置不因设置更新而重置。

configuration 路由项由命令执行时读取，因此保存后自然用于后续 Enter/Tab 操作。

## 7. 消息边界与安全

- 设置面板使用独立随机 nonce。
- CSP 至少包含 `default-src 'none'`、nonce 限定的脚本与样式、`connect-src 'none'`、`frame-src 'none'` 和 `media-src 'none'`。
- Webview options 显式设置 `localResourceRoots: [mediaRoot]`，所有本地脚本和样式均通过 `asWebviewUri` 生成 URI；不得使用 VS Code 的默认本地资源范围。
- 只加载扩展 `media` 目录中的本地脚本和样式，不允许网络资源。
- Webview 到扩展宿主的消息使用可判别联合和运行时守卫。
- 保存消息采用明确的设置域和键白名单，拒绝原型键、任意路径和未知字段。
- 数值、枚举和颜色先经过严格类型与范围校验，合法后再复用现有归一化函数进行规范化；配置键仅接受设计中列出的六项。
- 错误消息不回显任意对象、堆栈或本地路径。

## 8. 可访问性与交互细节

- 每个输入控件具有可见标签和说明关系。
- 左侧导航和窄屏选择器表达当前分区。
- 从命令或既有设置按钮深链打开分区后，将键盘焦点移动到该分区标题；仅在用户主动切换分区时保留导航控件焦点。
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
- 外部 configuration 变化：面板监听 `onDidChangeConfiguration`，将刷新作为独立步骤加入同一面板级串行队列；该步骤轮到执行时才重新检查六项配置与所有文件夹覆盖状态，并在同一步骤中分配新的 `stateVersion`。连续事件可以合并为一个尚未执行的刷新步骤，但不得在队列外提前读取后延迟发布。
- Webview 隐藏后脚本重新加载：新的 `settingsReady` 触发全量快照，旧 Webview 实例的响应全部忽略。
- 面板被 dispose 后到达的异步结果被忽略，不重新创建面板。

## 10. 测试策略

遵循 RED → GREEN → REFACTOR。

### 10.1 单元与契约测试

- package contributions：命令、activation event、editor/context 菜单、兼容命令 ID，并确认不再贡献 explorer/context 入口；
- 面板单例、分区深链、`settingsReady` 握手、协议版本拒绝、可见性刷新和实例隔离；
- 设置快照包含全部 22 项设置，并保持稳定分组；
- Reader/Git Log 默认值恢复与归一化；
- 六项 configuration 显式写入 Global target；
- 控件始终编辑全局值，workspace 覆盖不会被误显示为全局值；
- 单文件夹和至少两个文件夹具有不同覆盖值时的 workspace/workspace-folder 覆盖状态；
- Enter/Tab 开启确认、取消和关闭路径；
- 未知消息、未知键、原型键、额外字段、无效枚举、非有限数值和越界数值拒绝，且持久化层未被调用；
- 串行队列、响应乱序、陈旧 `stateVersion`、恢复默认事务和外部 configuration 变化竞态；
- 新实例到达时，已开始的旧实例写入先完成再生成快照，未开始的旧实例写入被取消且持久化层未被调用；
- 外部 configuration 刷新在两个保存请求之间到达时，从队列执行点重新读取状态，不发布预先读取的陈旧值；
- Keyboard Shortcuts 原生命令 `workbench.action.openGlobalKeybindings` 收到字符串参数 `moyuplus`；
- Webview options 将 `localResourceRoots` 严格限制为 `mediaRoot`；
- Reader 与 Git Log 设置按钮不再打开原地抽屉，而是请求深链打开统一面板；
- 保存后的实时偏好同步和 `maxCommits` 刷新语义。

### 10.2 Webview 状态测试

- 初始化、分区切换和深链定位；
- 即时保存、成功状态、失败回滚以及旧响应不覆盖新值；
- 恢复默认成功与失败；
- “实验性”文本存在于分区、相关设置和快捷键条目；
- 覆盖提示和高风险说明；
- 重复响应、旧 Webview 实例响应、陈旧快照和 dispose 后响应不会污染状态；
- 首个有效快照前控件不可编辑，协议版本不匹配时显示阻断错误；
- configuration 控件展示全局值，并单独展示 workspace 与各文件夹实际有效值；
- 范围控件预览、防抖提交和 live region 不重复播报每个步进。
- 活动范围控件在防抖保存、响应和全量快照到达期间不被替换，滚动位置与焦点保持稳定。
- 默认阅读颜色显示“跟随主题”，自定义颜色和恢复主题继承均实时应用。
- 快捷键分区不显示无法可靠确定的按键值。

### 10.3 Playwright 布局与无障碍验证

- VS Code 明暗和高对比度主题令牌下的可读性；
- 桌面左侧导航；
- 681 CSS px 下的左侧导航，以及 680 CSS px 下的顶部选择器且设置完整可达；
- Tab 顺序、可见焦点、标签关联和按钮操作；
- Reader/Git Log 入口到正确分区并聚焦分区标题；
- 设置抽屉不再出现；
- 页面不发起外部网络请求。

### 10.4 最终门禁

- `npm run compile`
- `npm run test:unit`
- `npm run test:layout`
- `git diff --check`

## 11. 验收标准

1. 代码编辑器正文区域右键可见 `MoyuPlus Settings`，点击打开独立设置标签页；资源管理器不再显示该入口。
2. 同一时刻最多存在一个设置面板；不同入口能够定位到正确分区。
3. Reader 与 Git Log 设置按钮不再打开原地抽屉。
4. 面板完整覆盖阅读 10 项、Git Log 6 项、实验性打字练习 6 项。
5. 所有普通设置即时保存；Enter/Tab 开启前必须确认。
6. 所有打字练习相关设置和快捷键条目都有可读的“实验性”文本。
7. 面板不提供打字练习立即执行操作。
8. 快捷键分区不推断或回显按键值；按钮打开 VS Code Keyboard Shortcuts，搜索框已填入 `moyuplus`。
9. 阅读和 Git Log 偏好保存后，已打开视图无需重开即可更新。
10. 工作区覆盖、保存失败和实验性状态均不会只依赖颜色表达。
11. configuration 控件明确编辑全局值；单文件夹和多根工作区的覆盖来源与实际有效值均不会被误表示为全局值。
12. 连续快速修改、恢复默认、外部 configuration 变化和 Webview 重新加载时，陈旧响应或快照不会覆盖较新的权威状态；拖动范围控件时页面不跳动且活动控件不中断。
13. Webview 本地资源根目录仅允许扩展 `media` 目录，脚本和样式不发起外部网络请求。
14. 明暗、高对比度主题以及 680 CSS px 窄宽度下设置均可访问、可操作。
15. 编译、单元测试、布局测试和 diff 检查全部通过。
