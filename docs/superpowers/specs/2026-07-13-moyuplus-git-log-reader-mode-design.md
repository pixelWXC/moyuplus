# MoyuPlus Git Log Reader 模式设计规格

- 日期：2026-07-13
- 状态：设计已由用户分段确认并通过独立规格评审，待用户书面复核
- 目标产品：MoyuPlus VS Code 扩展
- 目标体验：通过唯一快捷键在 Reader 与只读、分页式 Git Log 页面之间即时切换

## 1. 背景

MoyuPlus Reader 当前位于 VS Code Explorer 侧边栏的 `WebviewView` 中。快捷键清单已有 `Close Reader`，其现有行为是执行 VS Code 的关闭侧边栏命令。

本次不修改或移除原有 `Close Reader` 命令。新增一个完全独立的 Git Log 功能：用户通过全局快捷键进入 Git Log 页面，再按同一个快捷键返回切换前的书架或阅读状态。Git Log 的视觉体验应像 Reader 打开了一份由用户配置字段的 Git 日志文本，而不是传统 Git 客户端、表格或可滚动列表。

## 2. 目标

1. 在现有 Reader Webview 内新增隔离的 `gitLog` 模式。
2. Git Log 只能通过专用快捷键进入和退出，页面中不存在进入、返回或关闭入口。
3. 仅展示当前工作区所选 Git 仓库中当前分支可达的提交。
4. 页面不可滚动，通过“上一页”和“下一页”浏览动态分页结果。
5. Git Log 直接复用 Reader 的字体、字号、行高、字距、段距、页边距、对齐和主题设置。
6. Git Log 拥有独立的全局设置，用于控制字段、词条排列方式和最多加载提交数。
7. 进入页面必须立即获得视觉反馈，不能等待 Git 查询完成后才切换。
8. Reader 与 Git Log 的状态、消息、数据服务和分页生命周期必须隔离。

## 3. 非目标

本轮不包含：

- 修改、替换或删除 `moyuplus.reader.close` 及其关闭侧边栏行为。
- 展示其他本地分支、远端分支或 `--all` 历史。
- 提交搜索、筛选、图谱、diff、文件列表、提交详情展开或提交操作。
- Git Log 正文滚动、鼠标滚轮翻页或页面内退出按钮。
- 缓存提交记录、仓库、分支、当前页或上一次 Git Log 会话。
- 让 Git Log 设置修改 Reader 偏好。
- 在 Git Log 和 Reader 之间共享业务状态或相互路由功能命令。

## 4. 已确认的产品行为

### 4.1 专用命令与快捷键

- 新命令 ID：`moyuplus.gitLog.toggle`。
- 默认快捷键：`Alt+Q`。
- 生效范围：整个 VS Code 工作区。
- 命令可以在 VS Code Keyboard Shortcuts 中查看和重新绑定。
- 命令在 Command Palette 中隐藏，不提供菜单、按钮、视图标题动作或 Webview 内入口。
- 在书架或 Reader 中触发时进入 Git Log；在 Git Log 中触发时退出并恢复先前状态。
- 原有 `moyuplus.reader.close` 保持原行为并继续独立存在。

`Alt+Q` 只绑定新命令。若用户或其他扩展已有同键规则，VS Code 仍按其标准 keybinding 优先级处理；MoyuPlus 不尝试声称能够完整检测所有键盘布局和扩展冲突。

### 4.2 进入与退出

进入时：

1. 捕获当前顶层视图是书架还是 Reader，以及现有 Reader Webview 状态。
2. 同步创建全新的 Git Log 会话 ID。
3. 立即渲染 Git Log 外壳和加载状态。
4. 在扩展宿主中异步选择仓库并读取 Git 日志。
5. 仅当结果仍属于当前 Git Log 会话时接收并渲染结果。

退出时：

1. 立即恢复切换前的书架或 Reader 视图。
2. 尽量保留原书籍、章节、页码、目录/设置抽屉和未保存的 Reader 设置草稿。
3. 销毁 Git Log 会话并清空提交、分页和加载/错误状态。
4. 对退出后到达的 Git 查询结果静默丢弃。

再次进入时必须重新初始化并重新查询，不得恢复上次 Git Log 的提交或页码。

### 4.3 功能隔离

Reader 与 Git Log 仅共享以下展示基础：

- 顶部工具栏、次级信息栏、正文区域和分页页脚的视觉外壳。
- `ReaderPreferences` 的只读快照及其 CSS 表达。
- 无业务含义的通用 DOM 测量工具可以在明确边界下复用。

两者不得共享：

- reducer 或业务状态对象。
- 消息联合类型和请求 ID 空间。
- 当前页、导航能力、加载状态或错误状态。
- Reader Controller、Reader Engine 或书籍/章节命令路由。
- 设置持久化键和设置草稿。

Git Log 模式下 Reader 翻页、章节、书架、目录和 Reader 设置命令不得改变后台 Reader 状态。返回 Reader 后，Git Log 的翻页和设置动作不得继续生效。

## 5. 页面与视觉设计

### 5.1 页面骨架

Git Log 使用与 Reader 状态一致的纵向四段结构：

1. 工具栏：标题 `Git Log`，右上角只有 Git Log 设置按钮；没有返回按钮。
2. 次级栏：显示仓库名和当前分支名。
3. 正文：无滚动容器，展示当前动态页的提交文本。
4. 页脚：`上一页`、`当前页 / 总页数`、`下一页`。

加载、空仓库和错误状态都在正文区域中展示，不弹出阻断式模态窗口，也不自动退出 Git Log。

### 5.2 排版规则

- 不绘制提交分割线。
- 不为 Git Log 增加独立的正文页边距、条目内边距或字体层级。
- 所有已显示字段使用 Reader 当前的同一字体、字号、行高、字距、段距、对齐和主题。
- Git Log 不使用字段专属的大字、小字或强调字号。
- 提交之间的距离由 Reader 的段距设置表达。
- 正文页边距只来自 Reader 的 `pagePadding`。
- 提交标题始终显示，且不提供隐藏选项。

### 5.3 词条排列

Git Log 设置提供两种排列方式：

- `lines`：每个已启用字段单独成行。
- `inline`：同一提交的已启用字段组成一个连续文本流，字段间固定使用 ` · ` 分隔。

`inline` 是逻辑上的连续文本，不设置 `white-space: nowrap`。文本达到正文宽度后自然换行，不截断、不显示省略号，也不产生横向滚动。

为保持用户已确认的基础版排版，默认使用 `lines`。

## 6. Git Log 设置

### 6.1 设置项

独立设置抽屉包含：

- 显示 Hash：默认开启。
- 显示作者：默认开启。
- 显示相对提交时间：默认开启。
- 显示绝对日期：默认开启，使用本地时区。
- 词条排列：`lines | inline`，默认 `lines`。
- 最多加载提交数：默认 `200`，规范化范围 `20..1000`。
- 恢复默认。
- 保存。

提交标题始终显示。设置不包含 Reader 的字体或间距控件。

### 6.2 作用域与生命周期

- 设置使用独立的全局持久化存储，例如 `moyuplus.gitLogPreferences.v1`。
- 设置跨工作区、跨窗口重载和扩展重启保留。
- 每次进入 Git Log 时读取已保存设置，不把设置重置为默认值。
- 提交记录、当前页、仓库和分支绝不写入该存储。
- 保存字段开关或最大提交数后重新查询并回到第一页。
- 保存纯排列方式后使用当前会话数据本地重排并回到第一页。
- 关闭设置抽屉时遵循 Reader 设置抽屉现有的草稿/保存语义，但草稿属于 Git Log 独立状态。

## 7. 仓库与 Git 数据

### 7.1 仓库选择

单根工作区直接使用该工作区根。

多根工作区按以下顺序选择：

1. 当前活动编辑器所属的 Git 工作区根。
2. 无法判断时，按 workspace folder 顺序选择第一个有效 Git 根。

次级栏始终显示最终选中的仓库名和分支名，避免多根工作区歧义。

若当前为 detached HEAD，仍读取 `HEAD` 可达历史，并将分支位置明确显示为 detached 状态和短 Hash。

### 7.2 查询边界

新增独立 `GitLogService`：

- 通过 `execFile`/等价无 Shell API 调用 Git，不拼接 Shell 命令字符串。
- 固定使用仓库根、`HEAD`、`--max-count`、无颜色和无 pager 参数。
- 不使用 `--all`，结果仅为当前分支/HEAD 可达提交。
- 使用 NUL 或同等级稳定分隔协议解析字段，提交文本中的换行、分隔符或特殊字符不得破坏记录边界。
- 只请求 UI 当前支持的字段。
- 设置合理的输出上限、超时和进程清理；错误输出不得原样透传到 Webview。

建议的领域记录：

```ts
interface GitLogCommit {
  hash: string;
  subject: string;
  author: string;
  authoredAt: number;
}
```

相对时间和绝对日期由可信时间戳在 UI/领域格式化层生成，避免依赖 Git 本地化文本进行解析。

## 8. 状态、消息与异步性能

### 8.1 独立状态

Git Log Webview 状态至少包含：

```ts
interface GitLogViewState {
  sessionId: string;
  status: 'loading' | 'ready' | 'empty' | 'error';
  repositoryName?: string;
  branchName?: string;
  commits: GitLogCommit[];
  pageIndex: number;
  preferences: GitLogPreferences;
  preferencesDraft: GitLogPreferences;
  settingsOpen: boolean;
  errorCode?: GitLogErrorCode;
}
```

该状态不嵌入 Reader state，也不复用 Reader request ID。

### 8.2 即时响应

快捷键处理顺序必须是“先切 UI，后等待 I/O”。命令处理器不得在发送进入消息前 `await` Git 查询。

Webview 收到进入消息后立即：

1. 保存要恢复的顶层 Reader 视图引用/快照。
2. 创建 Git Log 初始 loading state。
3. 渲染页面外壳。
4. 发出带 session ID 的初始化请求。

扩展宿主返回的成功或错误消息必须带同一个 session ID。Webview 只接受当前活动会话的消息。

## 9. 动态分页

Git Log 使用独立分页状态和生命周期，但读取 Reader 偏好的只读快照。分页输入包括：

- 正文区域实际宽高。
- Reader 字体、字号、行高、字距、段距、页边距、对齐和主题。
- Git Log 字段可见性与排列方式。
- 当前提交文本。

正文容器设置为不可滚动。分页器基于真实 DOM 测量生成页边界：

- 普通提交尽量作为完整块放入当前页；剩余空间不足则移到下一页。
- 若单条提交自身高于一整页，允许在该提交内部按文本行跨页，保证完整内容可达。
- 不允许裁剪、重复或遗漏内容。
- 视口、Reader 偏好或 Git Log 排列变化后重新分页并回到第一页。
- 翻页只改变 Git Log 页码，不触发 Reader 导航消息。

## 10. 异常与空状态

定义稳定错误码并在正文显示简短中文状态：

- `noWorkspace`：未打开工作区。
- `notGitRepository`：工作区中没有可用 Git 仓库。
- `gitUnavailable`：Git 命令不可用。
- `noCommits`：当前分支尚无提交。
- `detachedHead` 不是错误，按第 7.1 节正常展示。
- `queryTimedOut`：读取超时。
- `queryFailed`：其他安全归一化失败。

详细诊断写入 MoyuPlus Output Channel，并清理换行、控制字符和长度。Webview 不显示原始命令行、绝对路径、stderr 或异常堆栈。

## 11. 测试策略与验收标准

实施采用测试先行。

### 11.1 命令与贡献点

- `moyuplus.reader.close` 仍注册并执行 `workbench.action.closeSidebar`。
- `moyuplus.gitLog.toggle` 是独立命令，默认绑定 `Alt+Q`。
- 新命令可出现在 Keyboard Shortcuts，但从 Command Palette 隐藏。
- 不存在页面按钮、菜单或 View title action 进入/退出 Git Log。

### 11.2 状态隔离

- 从书架进入/退出后恢复书架。
- 从阅读状态进入/退出后恢复书籍、章节、页码和抽屉。
- Git Log 命令不调用 Reader 页面/章节命令。
- Reader 命令在 Git Log 模式下不改变 Reader 后台状态。
- 退出清空 Git Log 提交和页码；再次进入产生新 session ID 和新查询。
- 迟到成功/错误结果均被丢弃。

### 11.3 性能与数据

- 测试事件顺序，证明 loading UI 切换发生在 Git 查询 resolve 之前。
- 模拟慢查询时，快捷键命令不等待查询完成。
- 当前分支限定、最大数量、无 Shell 参数传递、超时和输出限制有单元测试。
- NUL/稳定协议覆盖特殊字符、Unicode 和提交正文边界。
- 多根工作区、detached HEAD、无 Git、无提交和查询失败均有测试。

### 11.4 设置与布局

- Git Log 设置跨新会话和重启持久化。
- 提交、页码、仓库和分支不持久化。
- 全部字段开关组合至少由表驱动测试覆盖。
- `lines` 与 `inline` 均保持完整文本；`inline` 自然折行且无省略号。
- 正文无滚动，动态分页无丢失、重复和末尾空白页。
- 超高单条提交可跨页。
- Reader 偏好变化会驱动 Git Log 重排，但不修改 Git Log 字段设置；反向亦然。

### 11.5 最终验证

- 完整单元测试通过。
- Playwright 布局测试通过。
- TypeScript 类型检查和生产构建通过。
- 在真实单根与多根 Git 工作区人工验证 `Alt+Q` 即时进入/退出、设置持久化、当前分支内容和 Reader 状态恢复。

## 12. 完成定义

只有同时满足以下条件，本功能才算完成：

1. `Alt+Q` 是 Git Log 唯一产品入口和出口，且命令面板/页面/菜单无替代入口。
2. 原 `Close Reader` 功能完全保持。
3. 快捷键触发后立即显示 Git Log loading UI，不等待 Git 查询。
4. 每次进入重新读取当前分支，退出不保留任何 Git Log 会话数据。
5. 全局 Git Log 设置正确保留并与 Reader 偏好隔离。
6. 页面无滚动，Reader 样式驱动排版，所有内容可通过分页完整访问。
7. Reader 状态在往返切换后尽量原样恢复，且两套功能没有交叉副作用。
8. 自动测试、构建和真实仓库人工验收全部通过。
