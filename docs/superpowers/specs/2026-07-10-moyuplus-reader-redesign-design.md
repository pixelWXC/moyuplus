# MoyuPlus 阅读器整体重塑设计规格

- 日期：2026-07-10
- 状态：设计已由用户分节确认并通过独立规格评审，待用户审阅正式规格
- 目标版本：Reader v2
- 产品形态：本地优先、完全离线的 VS Code 侧边栏阅读器

## 1. 背景

当前 MVP 已验证 TXT 导入、侧边栏 Webview、DOM 动态分页、阅读进度、打字练习和快捷键路由。MVP 验证已经结束，后续聚焦文本阅读模块，并允许整体替换旧 Reader/TXT 专用阅读架构，不以保留旧测试结构或最小 diff 为目标。

现状的主要问题：

- 阅读到最后一页后仍能继续翻页，随后显示空白内容，且没有任何边界反馈。
- 文件管理以 TXT 为中心，缺少真正的书架信息架构；移除能力虽存在底层命令，但用户难以发现。
- 阅读状态仅用 `fileId + offset + pageHistory` 表示，无法承载 EPUB 章节与稳定定位。
- Reader Provider、Webview、TXT 服务和快捷键设置耦合在同一条链路中。
- 只支持 TXT，不能打开 EPUB、读取目录、按章节导航或安全处理 EPUB 资源。

本设计采用“阅读模块整体重写”路线。旧阅读栈在 Reader v2 完成验收后删除，不长期维护双栈。TXT 打字练习的产品行为、旧用户数据迁移和隐私约束必须保留。

## 2. 目标

Reader v2 必须实现：

1. 主界面继续位于 VS Code 侧边栏，并以书架为入口。
2. 书架支持导入、展示、重新定位和移除 EPUB/TXT。
3. EPUB/TXT 均可阅读；打字练习只能选择 TXT。
4. EPUB 支持目录、章节阅读、上一章、下一章和章节间自动衔接。
5. TXT 支持可扩展的虚拟分章，而非永久固定为单一章节。
6. 使用真实 DOM 测量进行动态分页，并自适应侧边栏宽高。
7. 书首、章节边界和书尾具有明确、统一的状态和反馈，禁止产生末尾空白页。
8. 每本书保存可恢复的位置，跨 VS Code workspace 共享。
9. 提供受控阅读样式设置，并在样式或窗口变化后围绕原位置重排。
10. 全程本地、无上传、无遥测、无外部资源请求、无 EPUB 主动内容执行。

## 3. 非目标

本轮不包含：

- 云同步、账号、遥测。
- DRM EPUB。
- PDF、MOBI 或其他新格式。
- 全文搜索、批注、高亮、词典、朗读和媒体播放。
- 任意原始 CSS 编辑器。
- 多书编辑器标签页或多阅读会话。
- 持久化 EPUB 解压目录或正文缓存。
- 标签、分类和复杂书架管理。

## 4. 已确认的产品决策

### 4.1 界面形态

继续使用 Explorer 中的侧边栏 Webview。侧边栏内部使用“书架页 ↔ 阅读页”切换；目录和设置采用覆盖抽屉，不长期挤压正文。

### 4.2 格式能力

- EPUB：可阅读、可显示目录，不可用于打字练习。
- TXT：可阅读、可虚拟分章、可用于打字练习。
- 点击任意书籍始终进入阅读；TXT 打字练习从书籍菜单或命令单独启动。

### 4.3 文件所有权

导入仅保存原文件 URI，不复制原文件。从书架移除只删除插件索引和插件状态，绝不删除或修改磁盘原文件。

原文件移动或删除后，书架将记录标记为失效，并提供“重新定位”和“从书架移除”。重新定位只更新 URI，保留 `bookId` 和阅读进度。

### 4.4 状态作用域

- 书架索引：本机全局。
- 每本书阅读进度：本机全局，跨 workspace 共享。
- 阅读样式：本机全局。
- 打字练习 session：workspace 独立。

## 5. 总体架构

### 5.1 Sidebar Reader App

Webview UI 只负责呈现与用户意图：

- 书架页、阅读页、目录抽屉和设置抽屉。
- 导入、移除、重定位和错误恢复交互。
- 书首、书尾和章节切换反馈。

UI 不直接读取文件、不解析 EPUB、不决定逻辑章节序列。

### 5.2 Webview Layout Engine

Layout Engine 位于 Webview，负责所有依赖真实 DOM 的工作：

- 按当前容器宽高、字体和样式测量页面。
- 计算当前页可见范围和同章节页边界。
- 在 Resize 或排版设置变化后重排。
- 将 `ReadingLocator` 映射到当前可见页。
- 回报当前页 Locator、section progression、页边界和 viewport 信息。

动态分页不得重新放回扩展宿主中的 Reader Engine。

### 5.3 Reader Engine

Reader Engine 位于扩展宿主，负责格式无关的逻辑阅读状态：

- 当前书籍与 section 序列。
- 目录跳转、上一章和下一章。
- 章节末页到下一章、章节首页到上一章末页的状态转换。
- 书首、书尾和不可继续导航的语义。
- 保存位置的规范化与恢复协调。

Reader Engine 不接触 DOM 高度或分页测量。

### 5.4 Adapter Registry

Registry 根据 `BookRecord.format` 选择 `TxtAdapter` 或 `EpubAdapter`。Adapter 隔离格式差异，统一提供元数据、目录、sections、安全章节文档和 Locator 规范化。

### 5.5 持久化

- `BookLibraryStore`：全局书架索引。
- `ReadingProgressStore`：按 `bookId` 保存位置。
- `ReaderPreferencesStore`：全局阅读样式。
- `TypingPracticeSessionStore`：保留 workspace 作用域。

## 6. 数据模型

以下为设计级接口，实施时可以拆分文件，但不得改变语义边界。

```ts
type BookFormat = 'txt' | 'epub';
type BookSource = 'workspace' | 'external';
type TxtEncoding = 'utf8' | 'gbk';

interface BookCapabilities {
  readable: true;
  typing: boolean;
  toc: boolean;
}

interface BookRecordBase {
  schemaVersion: 2;
  id: string;
  uri: string;
  source: BookSource;
  title: string;
  authors: string[];
  capabilities: BookCapabilities;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
}

type BookRecord = BookRecordBase & (
  | {
      format: 'txt';
      formatData: { encoding: TxtEncoding };
    }
  | {
      format: 'epub';
      formatData: { packageIdentifier?: string };
    }
);
```

`id` 使用与 URI 解耦的稳定随机 ID。重定位时 ID 不变；同一路径重复导入应先检测现有记录，避免重复书籍。

### 6.1 Locator

```ts
interface LocatorBase {
  sectionId: string;
  progression: number;
}

type TxtLocator = LocatorBase & {
  kind: 'txt';
  offset?: number;
};

type EpubLocator = LocatorBase & {
  kind: 'epub';
  cfi?: string;
  fragment?: string;
};

type ReadingLocator = TxtLocator | EpubLocator;

interface ReadingPosition {
  bookId: string;
  locator: ReadingLocator;
  bookProgression: number;
  updatedAt: number;
}
```

Locator 必须采用可扩展的判别联合。Reader v2 的联合成员封闭为 TXT 和 EPUB；未来新增格式时，增加新的联合成员并提升持久化 schema 版本。`progression` 表示 section 内 0..1 的降级位置，`bookProgression` 用于全书级进度显示和最终 fallback。

持久化 Locator 不得包含 `textQuote` 或其他原文片段。Adapter 可以在单次打开过程中使用仅存在于内存的文本匹配提示，但在写入 `ReadingProgressStore` 前必须剥离这些提示。

恢复顺序：

1. 格式专属锚点，例如 offset、CFI 或 fragment。
2. 当前 section 的 `progression`。
3. 全书 `bookProgression` 映射出的 section 与位置。
4. 书首。

成功降级恢复后，保存新的规范 Locator。

### 6.2 阅读样式

`ReaderPreferences` 保存受控设置：字体、字号、行高、字距、段间距、文字色、背景色、页内边距、文字对齐和预设主题。

所有值先归一化并限制范围，再写入 CSS 变量。首版不提供任意 CSS 输入框。

## 7. Adapter 合约

```ts
interface BookAdapter<L extends ReadingLocator> {
  readonly format: BookFormat;
  inspect(uri: string): Promise<BookMetadata>;
  open(book: BookRecord): Promise<BookHandle<L>>;
}

interface BookHandle<L extends ReadingLocator> {
  getToc(): Promise<TocNode[]>;
  getSections(): Promise<SectionRef[]>;
  getSection(sectionId: string): Promise<SafeSectionDocument>;
  normalizeLocator(locator: ReadingLocator): Promise<L>;
  dispose(): void;
}

interface SectionRef {
  id: string;
  title?: string;
  order: number;
  progressionWeight: number;
}

interface SafeSectionDocument {
  sectionId: string;
  title?: string;
  sanitizedHtml: string;
  localResources: LocalResourceRef[];
  sourceRevision: string;
}
```

同一时间只保持一个 active `BookHandle`。切书或释放 Reader 时必须 dispose，并撤销 Webview 内所有 Blob URL。

`SectionRef.progressionWeight` 是 Adapter 根据规范化纯文本长度计算的正数权重，不持久化正文。全书进度按以下公式统一计算：

```text
(当前 section 之前的权重总和 + 当前 section progression × 当前权重) / 全书权重总和
```

从 `bookProgression` 降级恢复时按相同权重反向定位 section 和 section progression。空 section 使用最小权重 1，避免除零和不可定位。

### 7.1 TxtAdapter

`TxtAdapter` 同时提供阅读 section 与打字练习物理行能力。打字练习只通过 capability 或 TXT 专属接口访问物理行，不依赖 Reader Engine。

TXT 虚拟分章由可替换的 `TxtSectionizer` 完成。Reader v2 首版优先级为：

1. 内建中文/英文章节标题规则。
2. 大文件稳定分段策略。
3. 无法识别时使用单章 fallback。

虚拟 `sectionId` 由规则版本和内容边界摘要生成，尽可能在文件轻微修改后保持稳定。TXT 编码继续支持 UTF-8 和 GBK。自定义标题正则只保留为未来 `TxtSectionizer` 扩展点，不属于 Reader v2 首版设置或验收范围。

### 7.2 EpubAdapter

`EpubAdapter` 负责：

1. 读取 ZIP 容器。
2. 解析 `META-INF/container.xml`。
3. 解析 OPF metadata、manifest 和 spine。
4. 读取 EPUB 3 `nav.xhtml` 或 EPUB 2 NCX，生成嵌套目录。
5. 将 spine 项映射为稳定 `SectionRef`。
6. 清洗 XHTML 和出版物 CSS。
7. 校验并读取 ZIP 内图片和字体资源。
8. 生成或规范化 EPUB Locator。

导入阶段必须完成结构验证。缺少 container、OPF 或可读 spine 时，不创建半成品 `BookRecord`。

## 8. EPUB 安全与隐私

### 8.1 内容清洗

进入 Webview 前移除或拒绝：

- `script` 和所有事件属性。
- `iframe`、`object`、`embed`、`form`。
- meta refresh。
- `javascript:`、`file:`、`http:`、`https:` 等危险或外部 URL。
- 外部样式表、`@import` 和 CSS `url()` 网络引用。

出版物 CSS 不直接执行。解析后仅保留有限的结构和排版属性，并限定在正文根节点下；用户阅读样式拥有最高优先级。

### 8.2 ZIP 防护

必须设置并测试：ZIP 条目数、单条解压大小、总解压大小、压缩比上限，以及路径穿越、资源 MIME 与扩展名检查。

超限或危险 EPUB 应安全拒绝，不得通过放宽限制继续打开。

### 8.3 Webview CSP

目标 CSP：

```text
default-src 'none';
script-src 'nonce-<random>';
style-src 'nonce-<random>';
img-src blob: data:;
font-src blob: data:;
connect-src 'none';
frame-src 'none';
media-src 'none';
```

图片和字体从 EPUB 中按需读取，经受限消息载荷送入 Webview 后创建临时 Blob URL。切章、切书或 dispose 时撤销 URL。不得创建持久化解压目录或正文缓存。

插件不进行网络访问，不使用遥测，不加载远程封面、字体、图片或脚本。日志、错误和状态不得写入书籍正文。

## 9. 侧边栏信息架构

### 9.1 书架页

包含导入 EPUB/TXT、书籍列表、格式、作者、阅读进度、失效状态和书籍菜单。

点击书籍进入阅读。书籍菜单提供 TXT 打字练习、重新定位和从书架移除。空书架显示导入引导。

从书架移除前必须显示：“仅从 MoyuPlus 书架移除，不会删除原文件。”

### 9.2 阅读页

页面结构：

1. 顶部：返回书架、书名、目录、设置。
2. 章节栏：上一章、当前章节、下一章。
3. 正文：占用剩余全部空间。
4. 页脚：上一页、进度、下一页。

章节导航与页导航分离。目录/设置以抽屉覆盖正文；关闭后正文恢复全部空间并触发重排。极窄宽度下隐藏次要文字，保留图标、tooltip 和可访问标签。

## 10. 分页与边界行为

TXT 在当前虚拟 section 内动态分页。EPUB 在当前 spine/section 内动态分页。到达 section 末页后继续下一页，自动进入下一 section，并提示章节名；反向行为对称。

- 全书最后一页：保持当前页，禁用下一页、下一章和相关快捷动作，提示“已读完本书”。
- 全书第一页：保持当前页，禁用上一页、上一章和相关快捷动作，提示“已到本书开头”。
- 边界是正常状态，不记录为错误。
- 按钮、Reader 命令、快捷键和 Enter 路由必须消费同一份导航能力状态。

## 11. 运行时数据流

### 11.1 打开书籍

1. Webview 发送 `bookId + requestId`；首次 open 尚未选择 section，因此不携带 `sectionId`。
2. Library Service 校验 URI并选择 Adapter。
3. Adapter 返回 metadata、TOC、sections，并规范化保存的 Locator。
4. Reader Engine 选择初始 section。
5. Adapter 返回 `SafeSectionDocument`。
6. Webview 构建临时资源、渲染内容并由 Layout Engine 分页。
7. Layout Engine 回报稳定 Locator 和 progression。
8. Extension Host 防抖保存进度。

### 11.2 页与章节导航

当前 section 仍有下一页时，Layout Engine 本地推进并回报位置。当前 section 已结束时，发送 `requestNextSection`；Reader Engine 返回下一 section 或 `bookEnd`。上一页流程对称。

### 11.3 并发控制

所有请求都必须携带 `requestId + bookId`。只有在 Reader Engine 已选定 section 后，章节加载、Layout 回报和章节切换消息才额外要求 `sectionId`。切书或新请求使用 AbortController 取消旧任务；Webview 先按 `requestId + bookId` 丢弃过期响应，进入章节阶段后再同时校验 `sectionId`。

### 11.4 进度写入

Layout Engine 仅在页面稳定后回报。Extension Host 使用 300–500ms 防抖合并写入；切书、视图隐藏和 dispose 前强制 flush。

## 12. 移除、重定位与迁移

### 12.1 移除事务

移除书籍时删除 `BookRecord`、该书 `ReadingPosition` 和当前 Reader 引用。若同一 TXT 正用于打字练习，则停止练习并清理 session。磁盘原文件始终不动。

### 12.2 重新定位

重新定位校验新文件格式与结构后，仅更新 `BookRecord.uri` 和时间戳。`bookId` 和阅读进度保持不变；内容变化导致 Locator 失效时按 progression 规则降级。

### 12.3 v1 到 v2 迁移

首次 Reader v2 启动时：

1. 读取 `moyuplus.txtLibrary.v1`。
2. 为每条有效记录生成 v2 `BookRecord`：URI、名称、来源和时间写入 `BookRecordBase`，TXT 编码写入 `formatData.encoding`。
3. 读取旧 ReaderSession；若当前 TXT 可用，将 offset 映射为 `TxtLocator` 并计算 progression。
4. 写入 v2 stores 后读取验证。
5. 验证成功才写 migration marker。

迁移必须幂等。失败时保留旧 keys 并允许下次重试；不得提前删除旧状态。

## 13. 错误处理

| 场景 | 状态与恢复 |
|---|---|
| 原文件移动或删除 | 书架标记失效；提供重新定位或移除 |
| TXT 解码失败 | 提供 UTF-8/GBK 切换，不覆盖上次有效进度 |
| EPUB 缺少 container/OPF/spine | 阻止导入或打开，不创建半成品记录 |
| ZIP/CSS/XHTML 触发安全限制 | 显示安全拒绝原因，不放宽 CSP |
| Locator 专属锚点失效 | section progression → book progression → 书首 |
| 章节或图片资源缺失 | 显示正文占位；允许重试、目录或下一章 |
| 异步响应过期 | 静默丢弃，不改变当前 Reader 状态 |
| 书首/书尾 | 禁用操作并提示；不视为错误 |

## 14. 测试策略

整体重写后替换旧 Reader 测试，不要求维持旧测试文件结构。

### 14.1 Vitest：领域、存储和迁移

- BookRecord、Locator、Progress、Preferences 归一化。
- Reader Engine 章节序列、跨章和书首/书尾状态机。
- Store 读写、损坏数据恢复和按书进度。
- 移除/重定位事务。
- 迁移幂等、失败重试、旧 key 保留和成功标记。
- TXT typing capability 过滤。
- 持久化 ReadingPosition 前必须剥离仅存在于内存的文本匹配提示，并断言状态中不含正文片段。
- v1→v2 迁移断言必须覆盖 `BookRecord.source` 和 TXT `formatData.encoding`。

### 14.2 Vitest：Adapter 与安全

- TXT UTF-8/GBK、标题分章、稳定 sectionId 和大文件 fallback。
- EPUB 2/3、nav/NCX、嵌套目录、资源路径和缺失资源。
- 损坏 OPF、路径穿越、压缩炸弹和超限 ZIP。
- script、iframe、事件属性、外链 CSS 和危险 URL。
- 清洗结果不得包含主动内容或危险协议。

### 14.3 真实浏览器 Layout Harness

动态分页必须使用真实 Chromium DOM 测量，不使用 jsdom 假高度。覆盖中英文、超长行、图片、嵌入字体、多种侧边栏宽高、极窄宽度、阅读样式变化、Resize、Locator 保持、章节前后页对称和末页不生成空页。

### 14.4 VS Code 集成与人工验收

- Webview 消息 token、过期响应、dispose 和 flush。
- Memento 持久化。
- 命令、快捷键、Enter 路由和按钮共享导航状态。
- Extension Development Host 中导入真实 EPUB/TXT、重启恢复和跨 workspace 恢复。
- VSIX 打包后在离线环境复验。

### 14.5 隐私自动验证

- 浏览器测试拦截全部请求；阅读期间网络请求数必须为 0。
- CSP 必须包含 `connect-src 'none'`、`frame-src 'none'` 和 `media-src 'none'`。
- 运行后不得出现正文副本或 EPUB 解压目录。
- 日志与状态不得包含书籍正文。

## 15. 实施阶段

### Phase 1：新核心

建立 Book/Locator/Progress/Preferences 模型、stores、Reader Engine、消息协议和迁移框架。

### Phase 2：Adapter

实现 TxtAdapter、TxtSectionizer、EpubAdapter、ZIP/OPF/nav 解析、sanitizer 和恶意 fixtures。

### Phase 3：Layout Engine

实现真实 DOM 分页、重排、Locator 映射、页边界和跨章页协议。

### Phase 4：侧边栏应用

实现书架、导入/移除/重定位、阅读页、目录/设置抽屉和全部空/错/边界状态。

### Phase 5：集成与迁移

打字练习接入 TXT capability；替换 activation、命令、快捷键和 Enter 路由；完成 v1 数据迁移。

### Phase 6：删除旧栈与交付

删除旧 Reader/TxtLibrary 专用代码和旧测试，完成隐私、性能、打包和人工验收。

## 16. 验收标准

- 可以导入 EPUB/TXT，并在书架显示格式、状态和进度。
- 可以重新定位和移除记录；磁盘原文件永远不被删除。
- EPUB/TXT 均可打开阅读；只有 TXT 可用于打字练习。
- EPUB 目录、章节阅读、上一章和下一章可用。
- TXT 可以按稳定策略生成多个虚拟章节。
- 分页依据真实 DOM；窗口和样式变化后自适应填充并保持位置。
- 章节间自动衔接；书首/书尾有提示和禁用状态；不产生末尾空白页。
- 每书进度跨重启、跨 workspace 恢复；锚点失效按既定顺序降级。
- 受控样式设置即时生效并持久化。
- 阅读 EPUB 时网络请求为 0，主动内容不执行，不产生持久化正文副本。
- 旧 TXT 索引和可用阅读位置可迁移，失败可重试。
- TypeScript 编译、自动测试、VSIX 打包和人工验收清单全部通过。

## 17. 实施计划阶段需落定的细节

以下属于实施计划选择，不改变本设计：

- EPUB ZIP/XML 依赖的具体包及版本。
- ZIP 各类安全上限的具体数值和基准 fixture。
- 浏览器 Layout Harness 的具体运行器和 CI 接入方式。
- 文件/目录命名和每个 Phase 的精确测试文件列表。
