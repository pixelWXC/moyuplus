# MoyuPlus 沉浸阅读设计

日期：2026-07-17
状态：设计已确认，待实施

## 1. 背景

MoyuPlus 当前通过侧栏 Webview 提供 TXT/EPUB 阅读，并已具备统一书架、格式适配器、章节模型、格式化 locator、`globalState` 进度存储、阅读命令和统一设置面板。用户希望新增一种不占用侧栏正文区域的沉浸阅读模式：从书架进入，聚焦代码编辑器后，以 VS Code Decoration 将书籍纯文本附加到代码行末尾。

参考方案 `workchill-reader-vscode-extensions-main/docs/plugin-architecture.md` 证明了 `after.contentText` 展示、按代码行承载视觉行以及会话内翻页的可行性，但其 EPUB 转 TXT、路径进度、同步 I/O、编辑器绑定和 DecorationType 重建等做法不适合直接复制。本设计复用 MoyuPlus 现有 Reader v2 的书籍、章节和进度模型，并把“任何时刻最多一个阅读器运行”提升为扩展级架构不变量。

## 2. 目标

- 在 TXT、EPUB 的书架条目上提供“沉浸阅读”入口。
- 点击入口后等待文本编辑器聚焦，并在活动光标行开始用 Decoration 展示当前页。
- Decoration 跟随活动文本编辑器和光标移动，不修改用户文档。
- 常规阅读与沉浸阅读共用一份 `ReadingPosition`，切换模式或重新打开时继续阅读。
- TXT 使用字符偏移精确恢复；EPUB 性能优先，能低成本精确映射时精确恢复，否则回退到不超前的安全位置。
- 常规阅读、沉浸阅读和不同书籍之间严格互斥，任何时刻最多存在一个活动书籍会话和一个 `BookHandle`。
- 复用现有上一页、下一页、上一章和下一章命令，并提供默认 `Alt+Shift+Q` 结束沉浸阅读。
- 在统一设置面板中增加“沉浸阅读”独立页签，使用独立设置模型。
- 保持 EPUB 的 ZIP 防护、无网络访问、安全清洗和过期响应丢弃规则。

## 3. 非目标

- 不修改、插入或保存任何代码编辑器文档内容。
- 不在 Decoration 中显示 EPUB 图片、可点击链接、复杂表格排版或 HTML 样式。
- 不接管 PageUp、PageDown、Esc 或光标移动按键。
- 不让光标移动、编辑器切换、设置变化或窗口重排推进书籍进度。
- 不同时保留常规阅读和沉浸阅读两个热会话，也不为快速切换预开第二个 `BookHandle`。
- 不把整本 EPUB 转换成 TXT，不创建长期解压目录，也不缓存整本书的纯文本。
- 不复用常规阅读样式设置，不使用未受 VS Code Decoration API 保证的 CSS 注入技巧。
- 不在设置页向用户解释 Decoration API 的底层样式限制；不可配置项直接不出现。

## 4. 已确认的产品行为

### 4.1 书架入口与模式互斥

- TXT、EPUB 的可用书籍条目均显示“沉浸阅读”动作；缺失或不可读书籍不允许启动。
- 点击后先进行不创建 handle 的存在性与可读性预检。
- 若已有活动阅读会话，必须冻结当前页首、强制保存、清理展示器并释放旧 handle，之后才允许打开新会话。
- 启动新会话失败时回到无活动阅读器状态，不恢复一个隐藏的旧热会话。
- 用户从沉浸模式打开常规阅读、另一书籍或其他需要书籍会话的模式时，执行同一切换流程。
- 侧栏可继续显示书架和沉浸模式状态，但不保留第二个分页器。

### 4.2 编辑器焦点与跟随

- 从 Webview 点击入口后进入 `armed` 状态，不强制抢回编辑器焦点。
- 聚焦任意可装饰的文本编辑器后，在该编辑器活动光标行开始渲染。
- 切换文本编辑器时，先清除旧编辑器 Decoration，再从同一书籍页首在新编辑器光标处重绘。
- 同一编辑器内光标移动时，短防抖后重新锚定；书籍 locator 不变。
- 活动编辑器身份变化、VS Code 窗口失焦，以及 MoyuPlus 自有 Webview/设置面板报告获得焦点时，清除当前 Decoration 并进入 `suspended`；会话、handle 和阅读位置保留。
- VS Code 1.92 没有覆盖终端、内置设置页和任意第三方 Webview 焦点的统一扩展事件，因此这些焦点变化只做可观测范围内的 best-effort 挂起；未收到事件时，Decoration 可以继续附着在最近的活动编辑器上。
- 再次观测到文本编辑器激活时从同一页首恢复。
- 文档被编辑后重新夹取有效光标行并重绘，不把文档变更解释为阅读操作。

### 4.3 分页与显示

- 从光标所在行开始，每个沉浸视觉行对应一个代码行行末的 `after.contentText`。
- 文本按 Unicode 字形簇切分，不能拆开 Emoji、组合字符或代理对。
- 每页最多显示设置指定的视觉行数，每行最多显示设置指定的字形簇数。
- 光标下方真实代码行不足时，本页只提交实际构造并交给 `setDecorations` 的行；下一页只推进这些行对应的文本。
- “已显示”在 API 层定义为：目标文档和行仍有效，批量 `setDecorations` 无异常完成。VS Code 不返回 Decoration 的可见性结果，因此折叠区、屏幕外代码行和被 UI 遮挡的视觉状态不参与进度判断。
- 空章节自动跳到下一个可读章节；整本书无可读正文时启动失败并提示。
- 翻到章节末尾后，下一页命令进入下一章节；上一页/上一章遵循相同的 section 顺序。
- 会话内保留页面起点历史用于稳定上一页。历史不足时，分页器按当前参数从目标偏移向前计算前一页起点。
- 编辑器切换、光标移动或设置变化会从同一页首重新分页，允许当前页显示量发生变化，但不能自动推进。

### 4.4 命令与退出

- 现有 `moyuplus.reader.nextPage`、`moyuplus.reader.previousPage`、上一章和下一章命令由统一命令路由器发送给当前唯一活动展示器。
- 沉浸模式处于 `armed` 或 `suspended`、没有成功显示当前页时，翻页命令不推进 locator，并以非阻塞方式提示先聚焦文本编辑器。
- 新增 `moyuplus.immersive.stop`（用户可见标题为 `MoyuPlus: Stop Immersive Reading`）。
- 默认快捷键为 `Alt+Shift+Q`，生效条件只依赖 `moyuplus.immersiveReadingActive`，因此沉浸模式运行时可从任意焦点结束。
- 退出顺序固定为：冻结当前页首 → 强制 flush → 清空 Decoration → 释放 DecorationType 和事件监听器 → dispose handle → 清除 context key → 进入 `idle`。
- 切书、切模式、扩展/会话销毁和不可恢复错误使用同一停止流程。

### 4.5 沉浸阅读设置页签

- 在现有统一 MoyuPlus 设置面板中新增“沉浸阅读”独立页签，不创建第二个设置 Webview。
- 沉浸设置使用独立持久化模型，不读取或写入 `ReaderPreferences`。
- 页签包含：
  - 每页视觉行数，默认 `3`；
  - 每行最大字形簇数，默认 `40`；
  - 文字颜色，支持主题前景色或安全的自定义颜色；
  - 背景颜色，支持透明或安全的自定义颜色；
  - 字重；
  - 斜体开关；
  - 与代码文本的左侧间距；
  - 实时效果示意、保存和恢复默认。
- 设置变化经统一设置 authority 校验与持久化，并通知活动沉浸展示器从同一页首重绘。
- 页签不展示字体族、字号、字距或行高设置，也不向用户显示底层 API 限制说明。

## 5. 方案比较与结论

评估过三种方案：

1. 并行新增 `ImmersiveController`，靠启动/停止约定与现有 `ReaderController` 互斥。初始改动较小，但会产生双 handle、双进度权威和遗漏异常路径的长期风险。
2. 抽取共享会话内核，Webview 与 Decoration 作为两个展示器。改造范围适中，但能从结构上保证单会话、统一命令和统一进度。
3. 把 TXT/EPUB 全部转成统一纯文本缓存，再让两端使用同一字符分页器。偏移最直观，但削弱现有 EPUB HTML 阅读体验，增加转换、内存和启动成本。

采用方案 2：共享会话内核、双展示器。

## 6. 架构与组件边界

### 6.1 `ReaderSessionCoordinator`

协调器是唯一书籍会话权威，拥有：

- 当前 `bookId`、格式和模式；
- 唯一 `BookHandle`；
- section 列表与当前 section；
- 当前统一 `ReadingPosition`；
- session/section generation；
- 活动 presenter；
- 进度防抖与强制 flush 协调。

状态机为：

```text
idle
  → opening
  → active(webview | immersive)
  → switching | stopping
  → idle
```

沉浸 presenter 内部还有 `armed`、`visible`、`suspended` 显示状态，但它们不创建第二个书籍会话。

协调器之外的组件不能直接打开或长期持有 `BookHandle`。所有异步 open/section 请求携带 generation；旧响应不能覆盖新会话。

generation 只负责阻止旧结果提交，不能单独保证 handle 数量。协调器还必须维护一个串行切换队列：

- 任意时刻最多执行一个 `adapter.open()`；
- 新切换请求可以标记当前 opening 结果为过期，但必须等待该 open 完成并立即 dispose 其局部 handle，之后才能调用下一次 `adapter.open()`；
- 已挂入协调器的旧 handle 必须在新 open 调用前释放；
- handle 计数包括尚未赋给协调器字段、仍位于异步 open 局部变量中的 handle；
- 连续点击只保留最后一个待启动意图，但不能用并发 open 换取响应速度。

### 6.2 展示器协议

Webview 和 Decoration 展示器实现窄接口，概念上包含：

```ts
interface ReaderPresenter {
  readonly mode: 'webview' | 'immersive';
  activate(snapshot: ReaderSessionSnapshot): Promise<void>;
  showSection(section: PresentedSection, locator: ReadingLocator): Promise<void>;
  nextPage(): Promise<boolean>;
  previousPage(): Promise<boolean>;
  capturePosition(): ReadingLocator | undefined;
  suspend(): void;
  dispose(): Promise<void>;
}
```

展示器负责自己的布局与临时翻页历史，不负责打开书籍、持久化进度或决定另一展示器的生命周期。Webview 现有消息适配、HTML 布局、目录、图片与内部链接继续留在 Webview presenter 一侧。

### 6.3 `ReaderCommandRouter`

命令路由器只查询协调器的当前 presenter。无会话时返回 `false`；沉浸页面不可见时翻页返回 `false` 并触发一次非阻塞提示；退出命令只对沉浸模式有效。

### 6.4 `ImmersiveDecorationPresenter`

该组件只负责：

- 监听活动文本编辑器、选择和文档变化；
- 管理一个会话级 DecorationType；
- 使用纯分页器生成当前页视觉行；
- 清除旧编辑器并批量 `setDecorations`；
- 上报成功显示页的页首/页尾偏移；
- 管理短防抖和会话内页面起点历史。

同一会话不在每次重绘时创建/销毁 DecorationType。每次 Decoration option 使用行末 Range 和 `after.contentText`；公共样式尽可能放在 DecorationType 上，实例只携带文本，减少 VS Code 渲染开销。

### 6.5 独立设置模型

新增 `ImmersiveReaderPreferences`、normalizer 和 store，并接入现有 `SettingsAuthority`。默认值和范围由领域层定义；Webview 只发送候选值，Extension Host 仍是设置权威。颜色只接受主题哨兵值或规范化颜色，字重、斜体、边距和分页数字均白名单/范围校验。

### 6.6 ReaderViewProvider 与 Git Log 集成

`ReaderViewProvider` 不再拥有或直接 dispose 书籍 handle。它只管理 Webview presenter、书架消息和 Git Log UI；全局会话协调器由 extension activation 创建，并在扩展停用时统一 dispose。现有阅读命令从 provider 注册迁移到 `ReaderCommandRouter`。

顶层模式转换如下：

| 事件 | 当前书籍会话 | 结果 |
|---|---|---|
| Webview “返回书架”/关闭常规阅读 | Webview | capture、flush、释放 presenter/handle，进入 library |
| 侧栏隐藏 | Webview | presenter 挂起并 flush；唯一 handle 可保留，不创建第二会话 |
| Webview 被 dispose | Webview | 停止 Webview 书籍会话 |
| 侧栏隐藏或 Webview 被 dispose | Immersive | 只断开书架桥接；Decoration 会话继续，不 dispose 全局协调器 |
| 打开设置面板 | 任一书籍模式 | 会话保留；自有设置面板 focus 事件可让 Decoration best-effort 挂起 |
| 进入 Git Log | Webview/Immersive | capture 当前 position 与 presenter mode，flush 并完整停止书籍会话，再启动 Git Log |
| 退出 Git Log | 有 resume target | 通过全局协调器冷启动原 book，并恢复原 presenter mode；不复用旧 handle |
| Git Log 返回书架/恢复失败 | 无书籍会话 | 保持 library/idle |

`GitLogResumeTarget` 增加兼容性可选字段 `presentationMode: 'webview' | 'immersive'`；旧 target 缺失时默认恢复 Webview。进入 Git Log 时必须等待书籍会话停止，而不是只保存进度并隐藏 HTML。`readerPageActive` 等 provider 私有布尔值改为协调器快照的派生状态，不能成为第二状态权威。

## 7. 内容适配与 EPUB 过滤

### 7.1 章节输出

`SafeSectionDocument` 扩展为同时包含 Webview 和沉浸阅读所需的当前章节产物：

```ts
interface ImmersiveTextProjection {
  text: string;
  segments: ProjectionSegment[];
  projectionRevision: string;
}

interface ProjectionSegment {
  kind: 'identity' | 'collapsed' | 'synthetic' | 'hole' | 'anchor';
  sourceStart: number;
  sourceEnd: number;
  immersiveStart: number;
  immersiveEnd: number;
  safeSourceFloor: number;
  safeImmersiveFloor: number;
}
```

`source*` 与现有 Webview `textOffset` 使用相同的 JavaScript UTF-16 code unit 轴；`immersive*` 使用纯文本投影的 UTF-16 code unit 轴。`identity` 仅用于两轴文本完全相同且等长的区间；空白折叠、合成列表符号/换行、过滤空洞和块锚点必须使用独立 kind，并显式携带两轴的前驱安全位置。

分页器只在字形簇边界产生/保存 offset。来自现有 Webview 的任意 UTF-16 offset 在映射前向前夹取到最近合法字形簇边界；映射结果也向前夹取，不能落在代理对或组合字形内部。夹取可以在 `identity` 段对应的相同投影文本切片上完成，不要求额外保留整条 source 文本副本。

仅保留当前加载 section 的 HTML、投影文本和映射段。切章后允许释放旧 section 大对象；不会预生成或缓存整本 EPUB 投影。

### 7.2 TXT

TXT 继续使用原始解码文本和 `TxtSectionizer`。沉浸投影是当前 section 的原字符切片，不产生第二套 TXT 身份或缓存文件。

现有实现存在必须随本功能修复的坐标问题：Webview `LayoutEngine.startOffset` 是 section 内偏移，而 `TxtLocator.offset` 被 `TxtBookHandle.normalizeLocator()` 当作整书绝对偏移。章节产物因此增加明确的 locator space：

```ts
type SectionLocatorSpace =
  | { kind: 'txt'; sectionStart: number; sectionEnd: number }
  | { kind: 'epub'; sourceRevision: string; projectionRevision: string };
```

Webview/沉浸 presenter 只上报 section-local offset；协调器通过 `sectionStart + localOffset` 构造持久化 TXT 绝对 offset。恢复时由 adapter/协调器先锁定 locator 声明的 section，再把绝对 offset 减去 section start 交给 presenter，不能让错误 offset 静默选择另一个 section。

新保存的 TXT locator 写入 `offsetSpace: 'book'`，明确 `offset` 是整书绝对 UTF-16 offset。旧 v2 TXT 记录在打开书籍时懒修复：

1. 存在 `offsetSpace: 'book'` 时，按声明 section 边界夹取绝对 `offset`；
2. 缺少该标记的旧记录不猜测 `offset` 属于局部还是绝对空间，因为两个数值区间可能重叠；
3. 旧记录统一使用可靠的 section `progression` 重建 `sectionStart + floor(progression * sectionLength)`，再向前夹取到合法字形边界，确保浮点误差不会造成超前；
4. 修复结果在下一次成功上报位置时写回 `offsetSpace: 'book'`，不批量迁移全部书籍。

### 7.3 EPUB 单次遍历

`sanitizeEpubSection` 在已有 parse/sanitize AST 遍历中同时生成：

- `sanitizedHtml`；
- `immersiveText`；
- `projectionSegments`；
- 现有安全资源声明。

不为沉浸模式重新 parse XHTML。生成 source 轴时必须与 `LayoutEngine` 的文本节点串联顺序一致，包括清洗器生成但会被沉浸投影过滤的可见占位文本，以便现有 `textOffset` 可映射。

### 7.4 EPUB 正文投影规则

保留：

- 标题、段落、列表项、引用；
- `pre`/`code` 可读文字；
- 表格单元格文字；
- 普通超链接的可见文字；
- 脚注正文。

过滤：

- 图片节点、图片按钮和“查看图片”占位文案；
- 样式、脚本、表单、嵌入对象和导航控件；
- 纯脚注返回箭头、跳转符号及无正文价值的链接标记；
- 重复空白与纯排版噪声。

普通块之间插入稳定换行；列表项添加 `• `；表格单元格使用稳定分隔；非 `pre` 文本折叠连续空白，`pre` 保留有意义换行。过滤器必须是确定性的。source 文本轴版本和投影/映射算法版本分别记录，避免只修改沉浸过滤规则时无谓废弃仍准确的 Webview offset。

## 8. 统一进度模型

### 8.1 持久化结构

TXT locator 不变：

```ts
type TxtLocator = {
  kind: 'txt';
  sectionId: string;
  progression: number;
  offset?: number;
  offsetSpace?: 'book';
};
```

EPUB locator 增加沉浸轴偏移：

```ts
type EpubLocator = {
  kind: 'epub';
  sectionId: string;
  progression: number;
  textOffset?: number;
  immersiveOffset?: number;
  sourceRevision?: string;
  projectionRevision?: string;
  cfi?: string;
  fragment?: string;
};
```

每本书仍只有一条 `ReadingPosition`。`bookProgression` 用于书架百分比和兼容展示，不替代页首 offset，也不得作为 EPUB 跨模式“安全恢复”的前进依据。

### 8.2 映射算法

`projectionSegments` 按 source/immersive 轴有序。映射采用二分查找：

1. 输入先向前夹取到合法字形簇边界。
2. 只有目标落在 `identity` segment，且两轴区间等长、文本相同时，才用 segment 内字符差精确换算。
3. `collapsed`、`synthetic`、`hole` 和 `anchor` 不做字符差换算，直接使用该记录的 `safeSourceFloor`/`safeImmersiveFloor`。
4. 输出再次向前夹取到合法字形簇边界。
5. 映射结果必须满足安全下界性质：跨模式恢复可以重复，但不能越过当前模式已到达位置所对应的可证明正文边界。

常规阅读上报时，`textOffset` 是精确页首，`immersiveOffset` 是精确映射或安全下界。沉浸阅读上报时反向处理。两种模式始终保存当前页页首，而不是页尾。

### 8.3 旧进度与内容变化

- TXT 旧进度按 7.2 的 `offsetSpace` 规则懒修复；无标记 offset 不参与坐标猜测。
- `sourceRevision` 只标识原 EPUB section 内容与 Webview source 文本轴算法；`projectionRevision` 只标识沉浸过滤和映射算法。
- 恢复 Webview 时，`sourceRevision` 相同且存在 `textOffset` 即可使用；projection 版本变化不能废弃仍有效的 Webview offset。
- 恢复沉浸模式时，两个 revision 均相同且存在 `immersiveOffset` 才直接使用。若 source 相同但 projection 不同，可从有效 `textOffset` 通过当前映射重新求安全位置。
- 从沉浸切回 Webview 时，优先使用同一位置记录中已生成的安全 `textOffset`；不得用章节比例产生可能超前的位置。
- 当前 section 存在但 source revision 不同时，两种展示器都退回该 section 开头。section ID 已不存在时，为保证不超前，回到全书第一个可读 section 开头；不使用 `bookProgression` 选择可能更晚的 section。
- 不批量重写所有旧进度；书籍下次成功上报位置时自然写入新字段。

### 8.4 写入时机

- 成功翻页/切章只更新内存位置，并沿用约 400ms 防抖写入。
- `Alt+Shift+Q` 退出、切书、切模式、扩展/会话销毁和不可恢复错误强制 flush。
- 进度写入失败不能阻止 Decoration 与 handle 清理；提示用户本次进度可能未保存，并保留上一次成功写入记录。
- “不超前”只约束跨文本轴换算；用户主动上一页或跳转允许进度后退。

## 9. Decoration 生命周期

```text
idle
  → switching/opening
  → armed
  → visible ⇄ suspended
  → stopping
  → idle
```

- `armed`：书籍已打开，等待可装饰文本编辑器。
- `visible`：当前页已对有效 editor/行完成无异常 `setDecorations`，允许翻页；不声称能够观测屏幕可见性。
- `suspended`：可观测到活动 editor 不可用、窗口失焦或自有 Webview 获得焦点；页面隐藏且翻页不推进。无法观测的第三方/内置焦点变化允许保留最近 Decoration。
- 所有事件回调都校验 session generation、presenter 身份和目标 editor。
- 光标事件使用短防抖；活动编辑器切换立即清除旧 editor，随后调度新 editor 渲染。
- 停止方法幂等；重复退出、切换与 dispose 不得二次保存错误位置或泄漏 listener/type。

## 10. 错误处理

- 书籍缺失/不可读预检失败：保持当前会话，显示明确错误。
- 旧会话释放后新 EPUB 解析失败：回到 `idle`，不违反单 handle 约束，不静默恢复旧热会话。
- 无活动文本编辑器或可观测到自有非文本界面聚焦：正常 `armed/suspended`，侧栏提示一次“请聚焦代码编辑器”。
- section 无法加载：若有安全的相邻 section 则按明确导航动作处理；否则保存当前安全位置并结束。
- 过期 book/section/editor 回调：静默丢弃。
- 单次 Decoration 应用失败：清除当前 editor 并等待下一次焦点重试；连续或不可恢复失败执行统一停止流程。
- 进度保存失败：继续资源清理并提示；不能产生未处理 Promise rejection。
- 设置候选值无效：authority 拒绝并回发权威快照，活动会话保持旧设置。

## 11. 性能与安全

- EPUB 只做一次解析/清洗遍历，并在同一遍历构造投影和映射。
- 只持有当前 section 的投影；不预分页整章，不缓存整本纯文本。
- 映射段有序，offset 换算使用二分查找。
- DecorationType 会话级复用；一次页面使用一次 `setDecorations` 批量更新。
- 光标重绘防抖，进度写入防抖；编辑器切换不触发书籍 I/O。
- 保留现有 EPUB archive 大小、条目数、压缩比、markup 上限和安全清洗策略。
- 沉浸投影只消费已清洗/已分类 AST，不执行 HTML、CSS、脚本、URL 或外部资源。
- Decoration `contentText` 仅使用纯文本；颜色和样式值来自白名单规范化设置。

## 12. 测试策略

### 12.1 领域与适配器单元测试

- EPUB 标题、段落、列表、引用、代码和表格文本投影。
- 图片占位、脚注返回符号、脚本、样式、表单与导航噪声过滤。
- 普通链接只保留可见文字，脚注正文保留。
- `identity/collapsed/synthetic/hole/anchor` 映射、精确换算与显式安全下界。
- 对任意 UTF-16 offset（包括代理对和组合字符内部位置）验证输入/输出前向字形簇夹取和结果不超前性质。
- `sourceRevision` 与 `projectionRevision` 分离失效，单独修改投影规则不废弃 Webview offset。
- TXT 绝对 offset 与 section 内 offset 换算、`offsetSpace: 'book'` 持久化，以及无标记旧记录按 progression 安全懒修复；覆盖局部/绝对数值区间重叠和“短前章 + 超长后章”。
- 新旧 `EpubLocator` normalizer、旧进度懒迁移和 revision 不匹配回退。

### 12.2 分页器单元测试

- 中文、英文、CRLF、空白、Emoji、组合字符和巨大无断点文本。
- 每页/每行参数边界与无效设置规范化。
- 编辑器末尾缩页只消费成功显示文本。
- 连续下一页无遗漏、上一页可恢复，设置/锚点变化不推进。
- 空 section、跨 section、书首和书尾边界。

### 12.3 会话协调器测试

- 使用延迟 adapter 和连续切换请求，统计包括异步 open 局部变量在内的实时 handle 数始终不超过 1。
- 新请求等待过期 open 完成并 dispose 后才开始下一 open；generation 只阻止旧结果提交。
- 切书、切模式的顺序为 capture → flush → presenter dispose → handle dispose → open。
- 预检失败保留旧会话；open 失败回到 `idle`。
- 旧 session/section generation 响应被丢弃。
- 常规阅读与沉浸阅读命令只到达当前 presenter。
- 进入 Git Log 完整停止书籍会话，退出后按 resume target 的 `presentationMode` 冷恢复；旧 target 默认 Webview。
- Webview dispose 在 Webview 模式停止书籍，在 Immersive 模式只断开桥接而不销毁全局会话。
- 停止/销毁幂等，保存和资源释放各执行一次。

### 12.4 Decoration presenter 测试

- 等待编辑器、跟随活动 editor、清除旧 editor，以及窗口失焦/自有 Webview 焦点的 best-effort 挂起和恢复。
- 光标防抖、文档编辑后的行号夹取和 stale editor 事件丢弃。
- 同一会话只创建一个 DecorationType，停止时清空并 dispose。
- presenter 没有有效装饰目标时命令不推进；有效行上的 `setDecorations` 无异常完成后才提交新 locator。
- 独立设置变化从同一页首重绘。

### 12.5 UI、命令与回归

- TXT/EPUB 书架入口、缺失书籍禁用、沉浸状态提示。
- “沉浸阅读”设置页签的 authority 快照、保存失败、恢复默认和实时预览。
- `moyuplus.immersive.stop` 注册、`Alt+Shift+Q` 与 context key 生命周期。
- Webview/书架/侧栏 dispose/Git Log 进入退出状态表中的每条集成路径。
- 现有常规阅读、Git Log、图片预览、内部导航、设置和打字练习测试保持通过。
- 运行 TypeScript 编译、Vitest、Playwright 全套回归。
- 在真实 VS Code 中人工验证 Decoration 外观、编辑器切换、光标跟随、快捷键退出以及 TXT/EPUB 跨模式恢复。

## 13. 验收标准

1. 从 TXT 或 EPUB 书架条目进入沉浸模式后，聚焦代码编辑器即可看到内容，代码文件、Undo 栈和 Git diff 不变化。
2. 切换编辑器或移动光标只移动显示位置，不推进阅读位置；对活动 editor 变化、窗口失焦和 MoyuPlus 自有非文本界面焦点执行 best-effort 隐藏，无法由 VS Code 1.92 观测的焦点变化不承诺立即隐藏。
3. 所有模式和书籍切换过程中，包括异步 open 尚未提交的局部资源，任何时刻最多一个活动书籍会话与一个 handle。
4. 新 TXT 进度在常规/沉浸模式间按带坐标标记的同一绝对字符位置恢复；无标记旧记录按 section progression 向前取整安全懒修复。
5. EPUB 能精确映射时恢复到同一正文位置，不能精确映射时落到之前的安全语义边界，绝不使用已知会超前的位置。
6. 退出、切换、销毁和错误路径均保存当前页首并完整释放 Decoration、监听器与 handle。
7. 现有阅读命令控制当前唯一 presenter；`Alt+Shift+Q` 在沉浸模式任意焦点下结束阅读。
8. 沉浸阅读设置独立于常规阅读，保存后只重绘沉浸展示。
9. 大章节不会二次解析或整本缓存，光标连续移动不会持续创建 DecorationType 或同步写进度。
10. 自动测试、编译和现有回归通过，真实 VS Code 手工验收无内容污染、明显卡顿或进度超前。

## 14. 预期代码影响范围

- 领域：阅读会话状态、EPUB locator、沉浸设置与纯文本分页器。
- 适配器：`SafeSectionDocument`、TXT section 投影、EPUB sanitizer 投影与映射。
- Extension Host：共享会话协调器、命令路由器、Decoration presenter、context key 与注册流程。
- Webview：书架动作、沉浸状态、统一设置面板新页签及消息验证。
- 存储：沉浸设置 store；现有阅读进度使用兼容性扩展，不建立第二份进度。
- 测试：领域、适配器、协调器、Decoration shim、Webview、命令和布局回归。

实现阶段应先用测试固定会话不变量、投影映射和 paginator 行为，再改造现有 `ReaderController` 边界；不得先并行引入一个可独立打开 handle 的临时沉浸控制器。
