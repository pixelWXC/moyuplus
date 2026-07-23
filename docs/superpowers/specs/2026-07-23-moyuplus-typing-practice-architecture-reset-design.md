# MoyuPlus 打字练习整体架构重置设计

日期：2026-07-23  
状态：已获用户确认，待实施规划

## 1. 背景

当前打字练习是一个面向已导入 TXT 物理行的轻量功能：

- `TypingPracticeController` 读取物理行并保存当前行号。
- `InlineCompletionItemProvider` 在任意活动编辑器中显示 ghost text。
- 用户输入会真实写入当前项目文件。
- 状态只包含文件、行号和少量空白/快捷键配置。
- 没有严格判定、中文输入法策略、成绩、错字强化、素材管理或专用练习界面。

这一结构无法在保持边界清晰的前提下承载新的练习模式、判定引擎、实时 Decoration、历史统计和素材库。继续扩展原 Controller 会把文件读取、输入监听、编辑器呈现、计时、统计和存储集中到同一对象中。

本次工作是完整架构重置。实施允许按隔离模块分阶段完成，但任何中间阶段都不构成最终交付；只有本文定义的全部能力和验收门槛通过后才视为完成。

## 2. 目标

### 2.1 练习模式

最终必须支持：

- 中文文章：现代文、新闻、小说片段、常用句子等。
- 英文：单词、句子、文章。
- 中英混合：程序员、办公用户等主题。
- 随机字词：高频汉字、成语、词组。
- 数字与符号：手机号、日期、金额、标点、特殊符号。
- 代码：JavaScript、TypeScript、HTML、CSS，架构允许后续扩展语言。
- 错字强化：基于历史错误权重自动生成专项内容。
- 限时：1、3、5 分钟以及可扩展预设。
- 定长：100、500 字以及一篇/一章。
- 自由练习：粘贴内容后直接开始，可选择保存为素材。

### 2.2 中文判定

支持两种模式：

- `character`：文档变化中的字素逐个立即判定。
- `committedBatch`：不判断输入法的拼音组合过程；文字稳定上屏后，按本次稳定差异批量判定，每个字素仍产生独立统计。

### 2.3 实时编辑器

必须提供：

- 专用 VS Code 原生练习编辑器，不修改项目文件。
- 基于 Decoration API 的当前字符、正确、错误和未输入状态。
- 连续滚动和逐行聚焦。
- 实时速度、准确率和耗时。
- 退格修正、是否允许跳过错误。
- 暂停、重新开始和结束。
- 字号、字体、行高、主题与状态色调整。
- 隐藏实时数据。
- 中文标点等价策略。

### 2.4 成绩

必须统计：

- 总耗时与活动耗时。
- 输入、正确、错误字符数。
- 准确率。
- Raw CPM、有效 CPM、每分钟汉字数。
- 标准英文 WPM 和实际完整单词数/分钟。
- Backspace 次数及其他修正编辑。
- 最长连续正确字符数。
- 错误字符、错误词语排行。
- 每 10 秒速度变化。
- 分类历史最佳。
- 每日、每周练习时长。

### 2.5 内容素材

必须支持：

- 内置素材库。
- 最近练习。
- 自定义素材。
- 粘贴文本创建素材。
- TXT 导入、导出。
- EPUB 按章节导入；不提供 EPUB 导出。
- 自动清理多余空行。
- 自动计算字素、汉字、英文词数和预计练习时间。

### 2.6 产品边界

- 当前版本继续完全离线运行。
- 预留可选在线内容提供器端口，但当前不实现网络访问。
- 素材、成绩、错字熟练度和偏好全局共享。
- 活动练习属于当前 workspace，并使用会话租约避免同一 workspace 多窗口争用。
- Reader 保留书架“打字练习”入口，但不依赖 Typing 内部状态或存储。

## 3. 非目标

- 不实现账户、云同步、排行榜或竞技防作弊。
- 不实现在线素材下载。
- 不导出 EPUB。
- 不像素级还原 EPUB 排版、图片或交互内容；只提取安全纯文本章节。
- 不把旧 `TypingPracticeController` 作为新领域内核的兼容层。
- 不永久保存原始逐键事件流。
- 不承诺可靠区分所有同一行批量粘贴与输入法批量上屏；VS Code 公共 API 不提供通用输入来源标记。

## 4. 已确认的产品决策

| 主题 | 决策 |
|---|---|
| 输入载体 | 专用 VS Code 原生练习编辑器 |
| 长期/会话数据 | 长期数据全局；活动会话 workspace 级 |
| 中文整段判定 | 文字稳定上屏后立即批量判断 |
| 不允许跳错 | 错误保留并标红，阻塞推进，必须退格清除 |
| 离线边界 | 当前完全离线，预留在线 Provider 端口 |
| EPUB | 支持章节导入，不支持导出 |
| 中文标点 | 中文模式可配置等价；代码和符号模式严格 |
| 代码空白 | 严格/宽松可配置，代码默认严格 |
| WPM | 同时保存标准 WPM 与实际完整单词数 |
| 主界面 | 独立 Typing 视图 |
| 书架入口 | 跳转 Typing 设置页，预选书籍和建议章节 |
| 书架来源归档 | 创建不可变会话快照并进入最近练习；用户主动保存后才成为自定义素材 |
| 行推进 | 自动/Enter 可配置；文章默认自动，代码默认 Enter |
| 历史粒度 | 落盘摘要、10 秒桶和错误聚合；不落盘原始按键流 |
| 错字强化 | 错误加权、连续正确降权、历史错误保留 |
| 架构路线 | 模块化纯 TypeScript 内核 + 端口适配器 |

## 5. 总体架构

### 5.1 依赖方向

```text
VS Code 入口与呈现
  Typing View / Practice Editor / Decoration / Reader Bridge
                         |
                         v
Practice Application Coordinator
                         |
                         v
纯 TypeScript 领域内核
  Content / Session / Analytics / Mastery / Generators / Policies
                         ^
                         |
基础设施端口实现
  Stores / TXT / EPUB / Clock / Id / Atomic File IO
```

依赖必须保持：

```text
Adapter -> Application -> Domain
```

`Domain` 和 `Application` 不得导入 `vscode`、Node 文件系统或 Webview 代码。基础设施实现领域/应用声明的端口，但不能反向定义业务规则。

### 5.2 模块

#### Content

负责素材元数据、正文引用、章节/段落索引、清理、计数、估时、范围选择和不可变快照。

#### Session Engine

负责会话状态机、目标推进、输入判定、跳错策略、暂停、重启和完成条件。

#### Analytics

负责实时指标、最长连对、10 秒桶、成绩摘要和比较键。

#### Mastery

负责错误字素/词语的权重、时间衰减、连续正确降权和强化候选。

#### Generators

负责随机汉字、成语/词组、数字/符号、代码模板和错字强化内容。所有随机生成必须使用可保存 seed。

#### Application Coordinator

是唯一允许跨领域编排的层。它处理 Prepare、Start、Pause、Resume、Restart、Finish 等应用命令，并同步分发当前会话的领域事件。

不引入全局通用事件总线或 Worker。所有核心模块仍在同一 Extension Host 中运行，以类型化命令、端口和同步领域事件隔离。

### 5.3 建议目录

```text
src/typing/
  domain/
    content/
    session/
    analytics/
    mastery/
    generators/
    policies/
  application/
    commands/
    events/
    ports/
    PracticeApplicationCoordinator.ts
  adapters/
    editor/
    view/
    storage/
    sources/
    reader/
  migration/
  registration/
```

每个目录通过公开入口文件暴露最小接口。跨目录深层导入由架构守卫测试禁止。

## 6. 内容与练习计划

### 6.1 核心模型

```ts
type MaterialOrigin =
  | 'builtIn'
  | 'custom'
  | 'txtImport'
  | 'epubImport'
  | 'readerBook'
  | 'generated'
  | 'mastery'
  | 'adHoc';

interface PracticeMaterialRecord {
  schemaVersion: number;
  id: string;
  revision: string;
  title: string;
  origin: MaterialOrigin;
  contentProfile: ContentProfile;
  tags: string[];
  source: MaterialSourceRef;
  counts: MaterialCounts;
  estimatedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

interface PracticePlan {
  contentRecipe: ContentRecipe;
  completion: CompletionConstraint;
  evaluation: EvaluationPolicy;
  textPolicy: TextPolicy;
  flowPolicy: FlowPolicy;
  displayPolicy: DisplayPolicy;
}

interface PracticeSnapshot {
  schemaVersion: number;
  id: string;
  materialId?: string;
  sourceRevision: string;
  plan: PracticePlan;
  generatorSeed?: string;
  targetUnits: TargetUnit[];
  displayLines: PracticeDisplayLine[];
  selectedRange: SourceRange;
  createdAt: number;
}
```

`PracticeSnapshot` 在会话开始后不可变，是本次判定唯一事实。原 TXT、EPUB、Reader 书籍或素材后续变化不影响正在进行的成绩。

### 6.2 五个正交配置轴

#### 内容类型

- 中文文章：现代文、新闻、小说片段、常用句子。
- 英文：单词、句子、文章。
- 中英混合：程序员、办公主题。
- 随机中文：高频汉字、成语、词组。
- 数字符号：手机号、日期、金额、标点、特殊符号。
- 代码：JavaScript、TypeScript、HTML、CSS。
- 错字强化。

#### 完成约束

```ts
type CompletionConstraint =
  | { kind: 'timed'; seconds: 60 | 180 | 300 | number }
  | { kind: 'length'; targetUnits: 100 | 500 | number }
  | { kind: 'sourceRange'; range: 'article' | 'chapter' | 'selection' }
  | { kind: 'free' };
```

完成约束与内容类型独立组合。限时、定长不是各自复制的一套 Session Engine。

#### 判定策略

- 逐字或稳定上屏批量。
- 允许跳错或必须修正。

#### 文本策略

- 中文标点等价或严格。
- 空白严格或宽松。
- 代码默认严格匹配空格、Tab、缩进和换行。

#### 推进与显示

- 自动完成行或 Enter 推进。
- 显示或隐藏实时数据。
- 连续滚动或逐行聚焦。

### 6.3 Content Provider

```ts
interface ContentProvider {
  canResolve(recipe: ContentRecipe): boolean;
  inspect(recipe: ContentRecipe): Promise<ContentDescriptor>;
  prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent>;
}
```

实现包括：

- `BuiltInPackProvider`
- `CustomMaterialProvider`
- `ReaderBookSourceProvider`
- `GeneratedContentProvider`
- `MasteryContentProvider`
- `OnlineContentProvider` 端口占位；当前无实现、无网络权限

### 6.4 内置素材

内置素材以版本化 manifest 和正文资源随扩展打包：

- 每条内容包含稳定 ID、类别、语言、标签、来源说明和版本。
- 内置正文只读。
- 素材包更新产生新 revision，历史 Result 保留旧 revision 标识。
- 来源与版权信息必须可追踪；不得将不明授权的大段内容直接打包。

### 6.5 自定义、TXT 与 EPUB

- 粘贴创建的素材保存为全局托管正文。
- Typing 视图导入 TXT 时读取并规范化正文，保存为托管素材；原路径只作为来源信息。
- TXT 导出输出规范化纯文本，不附加统计或隐藏元数据。
- Typing 视图导入 EPUB 时复用现有安全解析能力，按章节提取纯文本，保存为一个带章节索引的托管素材集合。
- EPUB 的样式、图片、脚本和交互内容不进入 Typing 素材。
- Reader 书架入口不同于 Typing 导入：它只提供 `BookSourceRef`，不默认复制整本书。会话开始时读取选定范围并创建临时快照。
- Reader 来源只有用户选择“保存到自定义素材”时才复制为托管正文。

### 6.6 自由练习与最近练习

- 自由粘贴默认创建 `adHoc` 临时快照。
- 用户可以在开始前或结果页保存为自定义素材。
- “最近练习”从 Result 查询派生，不维护第二套素材列表。
- 完成后立即“再练一次”复用仍存在的会话快照。
- 长期历史再次练习时按 `ReplayDescriptor` 重新准备来源；若来源 revision 变化，设置页提示内容已更新。

### 6.7 清理、计数和估时

准备流水线：

1. 解码或安全提取。
2. 统一 CRLF/LF。
3. 按导入设置压缩多余空行。
4. 保留章节、段落和代码行边界。
5. 使用 `Intl.Segmenter` 进行字素和词语分割。
6. 计算总字素、汉字、英文词数和可打印单元。
7. 根据同类历史有效速度估时；没有历史时使用内置保守基准。
8. 应用范围和完成约束并生成快照。

清理规则在素材 revision 中记录，避免同一素材在不同时间被隐式采用不同规范。

## 7. 专用练习编辑器

### 7.1 资源与语言

- 注册 `moyuplus-practice:` FileSystemProvider。
- 注册 `moyuplus-practice` 语言 ID。
- 练习文档存在于扩展内存文件系统，不写入项目目录。
- 每次稳定输入批次后，Adapter 合并后台 save 到内存 Provider；受控关闭前强制 save，避免脏文档提示。
- 可恢复快照和输入检查点保存到 `ExtensionContext.storageUri`，不是全局结果库。
- `workspaceState` 只保存活动 session ID、租约和小型导航信息，不存放大型快照。

练习语言使用语言级 VS Code 配置：

```json
"[moyuplus-practice]": {
  "editor.quickSuggestions": false,
  "editor.inlineSuggest.enabled": false,
  "editor.formatOnType": false
}
```

字体、字号、行高和 letter spacing 通过该语言覆盖配置调整，只影响练习文档。主题色、背景、下划线和当前字符框由 DecorationTypes 控制。不得使用 CSS 注入修改原生编辑器。

### 7.2 零宽锚点

每个逻辑显示行包含一个扩展维护的零宽锚点：

```text
[用户实际输入][零宽锚点]
```

- 正确和错误状态应用于用户实际输入 Range。
- 当前目标字符使用锚点的 `before.contentText`。
- 当前字符之后的未输入内容使用锚点的 `after.contentText`。
- 后续可见行在自己的锚点后显示未输入内容。
- 锚点本身不可见、不可作为目标输入。

使用前后 attachment 而不是在同一位置堆叠多个无序 attachment，确保当前字符和剩余文本顺序稳定。

特殊目标单元使用可理解的视觉标记：

- Tab 可以显示为 `→` 或等价主题符号，但判定值仍是 Tab。
- 换行由行推进命令表示。
- 连续空格可在严格模式中启用可见空白提示。

### 7.3 可见范围

- Decoration Presenter 只渲染 `TextEditor.visibleRanges` 及少量缓冲行。
- 当前行使用 `revealRange` 保持可见。
- 已输入行保留在专用文档中，可连续回看。
- 逐行聚焦模式降低非当前行对比度。
- 不为整本书一次性创建 DecorationOptions。

### 7.4 文档变更 Adapter

职责：

- 只处理当前活动会话 URI。
- 使用 `applyingEditorEdit` 标记过滤扩展自身回滚或结构编辑。
- 校验锚点、行数、活动输入区域和单光标约束。
- 将插入文本按 Unicode 字素切分。
- 将删除、Undo、Redo 和结构编辑分类。
- 把可接受的用户变更转换为应用命令。

结构性修改处理：

- 删除锚点、跨行粘贴、任意位置插入换行、多光标跨区编辑会被回滚。
- 结构性修改不计为输入尝试。
- 同一行批量插入按稳定文本判断。
- 产品不作为竞技考试工具，不实现依赖私有 API 的全面粘贴防作弊。

### 7.5 Backspace、Delete、Enter 和 Tab

- 仅在 `resourceScheme == moyuplus-practice` 且会话活动时路由 Backspace。
- 每次 Backspace 命令调用增加一次准确的 Backspace 计数。
- Delete、Undo、Redo 归类为其他修正编辑，不冒充 Backspace。
- Enter 在文章自动推进模式下通常不需要；手动推进和严格代码模式中作为换行目标判定。
- Tab 在严格代码模式中作为 Tab 目标；宽松模式按策略折叠为空白。
- 练习资源上下文比旧的全局 Enter/Tab Router 更具体，避免冲突。

## 8. 判定引擎

### 8.1 状态机

```text
preparing -> ready -> running -> completed
                         |
                         +-> blockedOnError -> running
                         |
                         +<-> paused
                         |
                         +-> abandoned
```

`restart` 结束当前 attempt，并使用同一 Snapshot 和 seed 创建新 attempt。

### 8.2 输入事件

```ts
interface InputAttempt {
  attemptId: string;
  targetIndex: number;
  expected: string;
  actual: string;
  normalizedExpected: string;
  normalizedActual: string;
  correct: boolean;
  timestamp: number;
  origin: 'character' | 'committedBatch' | 'enter' | 'tab';
}
```

每个字素或结构目标产生一个尝试。删除不产生输入尝试。

### 8.3 逐字模式

- 对一次文档变化中的字素按顺序立即处理。
- 每个字素单独应用当前目标、标点和空白策略。
- 严格不跳错模式遇到第一个错误后进入 `blockedOnError`。
- 同一事务中的后续字素保留为阻塞错误，不推进目标。

### 8.4 稳定上屏模式

VS Code 公共 API 提供 `onDidChangeTextDocument`，但不提供通用 `compositionstart/compositionend`。

实现采用：

1. 记录最后一个已判定文档检查点。
2. 文档变化后启动短稳定窗口。
3. 窗口内的替换继续合并。
4. 稳定后计算检查点与最终文档的受控区域差异。
5. 对最终上屏字素批量、逐字素判断。

稳定等待是该模式的预期行为。窗口长度是内部性能参数，不作为用户需要理解的设置。常用中文输入法必须通过真实 Extension Host 人工验收。

### 8.5 错误推进

#### 不允许跳错

- 错误字符保留并标红。
- 当前目标位置不推进。
- 后续输入继续计为错误并保持阻塞。
- 用户必须退格清除阻塞输入后重新输入。

#### 允许跳错

- 错误尝试仍记录。
- 错误字符消耗当前目标位置。
- 引擎继续推进。

### 8.6 中文标点

`TextPolicy` 包含版本化等价表。例如中文模式可以把 `，` 与 `,`、`。` 与 `.`、中文/英文引号视为等价。

- 等价匹配记为正确。
- 原始期望值和实际值仍可在详情中区分。
- 代码、数字符号模式默认关闭等价映射。
- 映射版本进入 Snapshot，防止历史结果因配置更新改变解释。

### 8.7 空白

- 严格：空格、Tab、缩进和换行作为目标单元。
- 宽松：按策略折叠或忽略空白，但不改变非空白顺序。
- 代码默认严格。
- 普通文章可以选择忽略行首/行尾排版空白。

### 8.8 暂停、结束和限时

- 计时使用 monotonic Clock。
- 暂停冻结活动计时和稳定上屏队列。
- 暂停期间的新文档输入被回滚。
- 继续时从同一检查点恢复。
- 限时到达时先提交已经稳定的上屏批次，再完成会话。
- 重新开始复用 Snapshot，不重新抽取随机内容。

## 9. 统计

### 9.1 基本计数

```text
totalAttempts   = 所有被判定的输入目标单元
correctAttempts = 输入当时被判为正确的尝试
errorAttempts   = totalAttempts - correctAttempts
accuracy        = correctAttempts / totalAttempts * 100%
```

错误后退格再输入正确不会删除旧错误。

示例：

```text
目标：你
输入：妮 -> Backspace -> 你

totalAttempts   = 2
correctAttempts = 1
errorAttempts   = 1
accuracy        = 50%
backspaces      = 1
completedUnits  = 1
```

成绩同时保存 `completedUnits`，把输入行为和有效进度分开。

### 9.2 时间

- `wallElapsedMs`：从开始到结束的墙钟时间。
- `activeElapsedMs`：排除暂停的练习时间，作为主“总耗时”展示和速度分母。
- 每 10 秒桶保存墙钟起点和活动时长，跨午夜会话可正确拆分每日统计。

### 9.3 速度

- `rawCpm = 可打印输入尝试 / 活动分钟`
- `effectiveCpm = 正确完成目标单元 / 活动分钟`
- `hanziPerMinute = 正确完成的 Unicode Han 字素 / 活动分钟`
- `standardWpm = 正确完成的英文字符与词间空格 / 5 / 活动分钟`
- `completeWordsPerMinute = 完整正确英文单词 / 活动分钟`

严格代码模式中的 Tab 和换行参与准确率；Raw CPM 和有效 CPM 另保留“可打印字符”口径。UI 必须标注速度口径，不能把 Raw CPM 和有效 CPM 混称为同一指标。

### 9.4 连续正确和修正

- 最长连续正确按尝试序列计算，任意错误尝试中断。
- Backspace 使用命令路由精确计数。
- Delete、Undo、Redo、选择删除分别累计到 correction breakdown。

### 9.5 错误排行

- 字符排行键为 `expected -> actual`。
- 中文词语使用 `Intl.Segmenter` 从目标上下文提取。
- 英文按词边界提取。
- 代码使用轻量词法切分，至少区分标识符、关键字、字符串、运算符和标点。
- 只保存必要的目标词语与错误配对，不保存完整原始按键流。

### 9.6 时间序列与历史最佳

每 10 秒桶包括：

- Raw CPM。
- 有效 CPM。
- 准确率。
- 正确、错误尝试。
- Backspace 和其他修正。
- 活动时长。

历史最佳使用 `benchmarkKey` 分组，至少包含：

- 内容 profile。
- 完成约束类型与长度/时长。
- 判定模式。
- 空白/标点策略类别。

中文、英文、代码及不可比约束不得混在同一个最佳榜中。

### 9.7 Result outcome

```ts
type PracticeOutcome =
  | 'completed'
  | 'timedOut'
  | 'abandoned'
  | 'restarted';
```

- `completed`、`timedOut` 可进入历史最佳。
- `abandoned`、`restarted` 默认不进入最佳，也不在普通历史首屏展示。
- 所有包含有效尝试的 outcome 都计入日/周练习时长和 Mastery。

## 10. 错字强化

```ts
interface MasteryEntry {
  key: string;
  kind: 'grapheme' | 'word' | 'codeToken';
  contentProfile: ContentProfile;
  wrongCount: number;
  reinforcementCorrectStreak: number;
  lastErrorAt: number;
  lastPracticedAt: number;
  score: number;
}
```

规则：

- 错误增加 score；近期、重复错误权重更高。
- 强化练习中的连续正确降低 score。
- score 降低不删除历史 wrongCount。
- 时间衰减和降权算法是纯函数，并带版本。
- 生成器按 score 加权抽样，组合单字、原目标词和适量上下文。
- 生成结果保存 seed 和算法版本。

Result 是 Mastery 投影的事实来源。Mastery 文件损坏时可以从 Result 重建。

## 11. Typing 视图

### 11.1 独立贡献点

- 新增独立 Activity Bar 容器和 `moyuplus.typingView` Webview View。
- 现有 Reader 仍保留在原位置，不因本次工作整体迁移。
- Typing View 使用独立 `TYPING_VIEW_PROTOCOL_VERSION`，不复用 Reader 消息协议。

### 11.2 页面

- `materials`：内置、自定义、导入、自由练习。
- `recent`：最近结果和来源。
- `setup`：范围、完成约束、判定、文本、推进和显示策略。
- `live`：实时指标、暂停、重启、结束。
- `result`：摘要、曲线、错误排行、历史比较。
- `history`：分页历史和日/周统计。
- `mastery`：错字/错词排行和强化入口。

Webview 只保存临时 UI 状态。所有业务状态由 Application 提供。

### 11.3 书架入口

Reader Bridge 只暴露：

```ts
interface TypingEntryPoint {
  openFromBook(bookId: string, suggestedLocator?: ReadingLocator): Promise<void>;
}
```

流程：

1. Reader 发送 book ID 和可选当前阅读位置。
2. Typing View 获得焦点并打开 setup。
3. 来源已预选。
4. 当前阅读章节只是推荐，不自动绑定阅读进度。
5. 用户选择章节/范围、约束和策略。
6. Application 读取来源并创建 Snapshot。

Reader 不读取 Typing 会话、成绩、素材或 Mastery。

来源失效时，Typing 显示错误，并通过桥接命令请求 Reader 的重新定位流程；Typing 不直接修改书架。

### 11.4 活动会话冲突

已有活动会话时，从书架或素材再次开始必须选择：

- 返回当前练习。
- 结束当前练习并新建。
- 取消。

不得静默覆盖活动 session。

### 11.5 Reader Decoration 冲突

Immersive Decoration Presenter 必须忽略 `moyuplus-practice:`：

- 练习编辑器活动时暂停 Reader Decoration。
- Reader 阅读会话本身不结束。
- 离开练习资源后 Reader 可以恢复。

### 11.6 实时数据与结果

- 实时数据可全部隐藏。
- 隐藏后只显示“练习中”和控制命令，不在状态栏泄露速度。
- 完成后编辑器保留最终 Decoration，但不再接受练习输入。
- Result 页提供“再练一次”“强化本次错字”“保存为素材”“返回素材”。

### 11.7 设置

- 设置页保存全局默认偏好。
- setup 中的覆盖只进入当前 PracticePlan。
- 只有显式“设为默认”才修改全局偏好。
- 字体、字号、行高通过 `moyuplus-practice` 语言覆盖写入。
- Decoration 主题改变时重建 DecorationTypes，并清理旧类型。

### 11.8 可访问性

- 错误同时使用颜色和下划线。
- 当前字符同时使用背景框。
- 状态和指标在 Typing View 中提供文本版本。
- 支持 VS Code 明亮、暗色和高对比主题。
- Webview 控件支持键盘导航、焦点可见、ARIA label 和合理的窄侧栏布局。

## 12. 持久化与并发

### 12.1 存储范围

#### `globalStorageUri`

- 托管素材正文和索引。
- 不可变 Result 文件。
- 可重建历史、日周和 Mastery 投影。
- 全局偏好使用相应 Store 或 VS Code configuration。

#### `storageUri`

- 当前 workspace 的 Snapshot。
- 输入缓冲检查点。
- pending Result。
- session lease 辅助文件。

#### `workspaceState`

- 活动 session ID。
- 小型导航状态。
- lease 元数据。

不得把 200k 字素 Snapshot 直接放进 Memento。

### 12.2 建议布局

```text
globalStorageUri/
  typing/
    materials/
      catalog.v1.json
      bodies/<materialId>/<revision>.txt
    results/
      2026-07/<resultId>.json
    projections/
      history.v1.json
      daily.v1.json
      mastery.v1.json

storageUri/
  typing/
    sessions/<sessionId>/
      snapshot.v1.json
      checkpoint.v1.json
      pending-result.v1.json
    lease.v1.json
```

### 12.3 Result 事实来源

- 每个 Result 使用唯一 ID 和独立文件。
- 写入使用临时文件 + 原子 rename/replace。
- 多窗口不会写同一个 Result 文件。
- Result 保存成功后才更新派生投影。
- 投影包含 source watermark；发现缺失 Result 时增量补算。
- 投影损坏、版本不匹配或并发冲突时可删除派生缓存并重建，不删除 Result。

### 12.4 素材写入

- Catalog 和托管正文写入通过文件锁与原子替换协调。
- 锁包含 owner、时间戳和 schema。
- 超时锁可以在确认 owner 不活动后回收。
- 删除素材采用可恢复标记或移入回收目录；实现阶段不得直接递归删除未验证路径。

### 12.5 Session lease

- 同一 workspace 同时只有一个可写活动会话。
- lease 包含 session ID、owner ID、heartbeat 和更新时间。
- 第二窗口发现有效 lease 时只显示当前会话被另一窗口使用。
- owner 关闭或 lease 超时后允许接管并从检查点恢复。
- `deactivate` 尽力释放，但正确性不能依赖 `deactivate` 一定执行。

### 12.6 写入失败

- Result 写入失败时保留 `pending-result`。
- UI 显示“成绩尚未保存”，提供重试。
- 下次激活自动重试 pending Result。
- 在确认 Result 已写入全局事实目录前，不删除 workspace session 文件。

### 12.7 隐私

永久保存：

- 会话摘要。
- 10 秒桶。
- 错误目标/实际配对。
- 必要目标词语。
- 素材引用、计划和算法版本。

不永久保存：

- 原始逐键时间戳流。
- 非目标编辑器输入。
- 项目文件内容副本，除非用户显式导入或保存为自定义素材。

## 13. 错误处理

### 13.1 领域校验

无效范围、空内容、不兼容策略和不可能完成约束在 setup 阶段以内联错误阻止开始。

### 13.2 来源错误

- 文件不存在：提供重新定位或选择其他来源。
- TXT 解码失败：提供编码选择并保留 setup。
- EPUB 结构/安全错误：显示可操作错误，不创建部分会话。
- 章节为空：允许返回范围选择。
- 内容超过 200,000 字素：要求缩小范围或分章。

### 13.3 编辑器错误

- 编辑器关闭：保存检查点并暂停。
- 锚点损坏：回滚结构并暂停。
- Editor 引用过期：Presenter 清理引用，领域状态不回滚。
- 练习文档重新可见：按 session URI 和检查点重新绑定。

### 13.4 存储错误

- 素材写入失败：不更新 catalog revision。
- Result 写入失败：进入 pending。
- 投影损坏：隔离派生文件并重建。
- 无法恢复的 Result 文件：保留原文件，记录诊断，不静默伪造统计。

### 13.5 日志

使用 MoyuPlus Output Channel，日志包含模块、错误码、session/result ID，但不得记录完整用户输入或正文。

## 14. 旧版迁移

### 14.1 旁路构建

新模块在旧 typing stack 旁路实现。切换前：

- 旧功能继续工作。
- 新命令使用内部开发 ID 或 feature gate。
- 新旧实现不得同时监听同一练习文档。

### 14.2 旧会话

旧 `moyuplus.typingPracticeSession.v1` 没有成绩数据，不能伪造历史。

迁移为一次性 `LegacyResumeHint`：

- TXT fileId。
- 旧 physical lineIndex。
- 空白设置。

首次进入新 Typing View 时可以预选来源和近似范围。用户确认后才创建新 Snapshot。

### 14.3 命令

保留可能被用户绑定的命令 ID 作为薄 Application Adapter，例如：

- start。
- stop。
- toggle。
- reset/restart。

旧物理行 jump、旧 Tab 补全文本和 Inline Completion 专属命令从 UI 移除；若保留一个兼容周期，必须显示弃用说明且不得导入旧 Controller。

### 14.4 退役

切换验收通过后：

- 删除 `TypingPracticeController`。
- 删除旧 Inline Completion Provider。
- 删除旧状态栏行号菜单。
- 删除“练习会写入当前项目文件”的安全提示。
- 删除只覆盖旧行为的测试。
- 更新 package contributions、设置、README 和 CHANGELOG。

## 15. 实施分解

本设计是完整 program spec。实现计划必须拆成七个有边界的工作包，但共享本文定义的契约和最终验收：

### 阶段 1：契约、模型和架构守卫

- 目录和公开接口。
- Content、Plan、Snapshot、Session、Result schema。
- 端口和领域事件。
- 禁止依赖测试。

### 阶段 2：素材系统

- 内置素材 manifest。
- 自定义/自由内容。
- TXT、EPUB 导入。
- TXT 导出。
- 清理、计数、估时和 range。

### 阶段 3：纯领域内核

- 判定状态机。
- 中文标点、空白和完成策略。
- Analytics。
- Mastery。
- 所有内容生成器。

### 阶段 4：原生编辑器适配

- 内存 FileSystemProvider。
- 零宽锚点。
- DocumentChange Adapter。
- Decoration Presenter。
- Enter/Tab/Backspace。
- IME 和滚动验证。

### 阶段 5：Typing View 与跨系统入口

- 独立 View 和协议。
- materials/setup/live/result/history/mastery。
- Reader Bridge。
- 设置和活动冲突。

### 阶段 6：迁移与切换

- LegacyResumeHint。
- 命令别名。
- Session lease。
- Result/projection 恢复。
- 关闭旧 Inline Completion。

### 阶段 7：完整验收

- 全需求追踪。
- 自动化测试。
- 性能预算。
- 人工 IME、主题、多窗口和大素材验证。
- 旧 stack 删除。
- 文档更新。

任何阶段完成都只代表进入下一集成阶段，不代表本次架构重置已完成。

## 16. 测试策略

### 16.1 纯领域单元测试

- Unicode 字素、emoji、组合字符和代理对。
- 中文标点等价版本。
- 代码严格/宽松空白。
- 逐字和稳定上屏差异。
- 跳错、阻塞、退格后修正。
- 自动/Enter 推进。
- 限时、定长、文章范围。
- 暂停、重启和 monotonic time。
- 全部统计公式及边界值。
- 10 秒桶与跨午夜。
- Mastery 加权、衰减和连续正确降权。
- 每个生成器的 seed 决定性。

### 16.2 Adapter Contract

- FileSystemProvider 读写、save 和恢复。
- 锚点结构校验。
- 文档事务到应用命令。
- DecorationOptions 和可见范围。
- TXT/EPUB fixtures。
- Store 原子写入、pending、锁和投影重建。
- Reader Bridge 只发送允许字段。
- Webview 协议验证。

### 16.3 Extension Host

- 命令注册和 context keys。
- 打开专用练习 URI。
- 不写项目文件。
- Backspace/Enter/Tab 路由。
- 编辑器关闭与恢复。
- 活动会话冲突。
- Reader Immersive 排除练习 scheme。
- legacy 命令与 resume hint。

### 16.4 Playwright

- 素材、设置、活动、结果、历史和错字页面。
- 窄侧栏。
- 明亮、暗色和高对比主题。
- 隐藏实时数据。
- 键盘焦点和可访问标签。
- 错误、空状态和 pending Result。

### 16.5 人工验证

- Windows 微软拼音：逐字、稳定上屏、候选切换、长词提交。
- 搜狗输入法或另一种常用第三方中文输入法。
- 英文高速输入。
- 中文/英文混合。
- JavaScript/TypeScript/HTML/CSS 的 Tab、空格和换行。
- 自动/Enter 推进。
- 明暗、高对比主题。
- 字体、字号、行高。
- 隐藏实时指标。
- 两个窗口的租约和接管。
- 大 TXT、EPUB、缺失/移动来源。

真实 IME 验收是完成门槛，不能只用合成键盘事件替代。

## 17. 性能预算

- 逐字模式从文档变化到 Decoration 更新 p95 不高于 16ms。
- 单次输入处理不得阻塞 Extension Host 超过 50ms。
- 稳定上屏模式的短稳定等待不计入 16ms；稳定后只增量处理一次。
- 单次输入的领域统计保持 O(1)。
- 只对本次变更文本做字素分割。
- Decoration 只覆盖可见范围及缓冲行。
- 单 Snapshot 上限 200,000 字素。
- 历史默认每页 50 条。
- 投影增量更新并支持后台重建。
- Typing 模块延迟初始化，扩展 activate 时不扫描全部素材、正文或历史。
- 完成后的 Result/投影写入异步进行，不阻塞输入热路径。

性能测试使用可注入 Clock、固定数据集和 Extension Host 采样。达不到预算时必须先定位热路径，不能通过降低判定正确性规避。

## 18. 需求追踪与最终验收

| 需求 | 设计归属 | 验收证据 |
|---|---|---|
| 中文/英文/混合/随机/数字/代码/错字 | Content + Generators | 单测、素材 UI、代表性人工流程 |
| 1/3/5 分钟、100/500 字、一篇、自由 | CompletionConstraint | 状态机测试、设置 UI |
| 逐字、上屏后判断 | EvaluationPolicy | 单测、Document Adapter、真实 IME |
| 当前/正确/错误/未输入 | Decoration Presenter | Contract + 真实编辑器 |
| 自动滚动/逐行 | FlowPolicy + Presenter | Extension Host + 人工 |
| 实时速度/准确率/耗时 | Analytics | 固定 Clock 单测 + Live UI |
| 退格、跳错 | Session Engine + command routing | 状态机 + Extension Host |
| 暂停/重启 | Coordinator + Session | 状态机 + 集成 |
| 字号/字体/主题 | 语言覆盖 + DecorationTypes | 配置测试 + 主题矩阵 |
| 隐藏实时数据 | DisplayPolicy | Playwright + 人工 |
| 中文标点 | TextPolicy | 表驱动单测 |
| 全部成绩指标 | Analytics + Result | 公式测试 + Result UI |
| 速度曲线 | 10 秒桶 | 固定 Clock + 图表 UI |
| 历史最佳、日/周 | Projections | 重建测试 + History UI |
| 内置/最近/自定义/粘贴 | Content + Typing View | Provider + UI |
| TXT 导入导出 | TXT Provider | fixtures + 真实文件 |
| EPUB 导入 | EPUB Provider | fixtures + 真实文件 |
| 空行清理、计数、估时 | Prepare pipeline | 单测 + UI |
| 书架直接进入 | Reader Bridge | 集成测试 + 人工 |
| 系统隔离 | Boundary tests | build contract |
| 不写项目文件、当前离线 | Editor/Network guards | 自动化 + workspace diff |

最终完成必须同时满足：

1. TypeScript 编译通过。
2. 纯领域、Adapter Contract、Extension Host、Playwright 全部通过。
3. IME、主题、多窗口和大素材人工验收通过。
4. 所有原始需求在追踪表中有实现和证据。
5. 旧 typing stack 已删除或只剩明确、无业务逻辑的命令别名。
6. README、设置说明、迁移说明和 CHANGELOG 已更新。
7. 七个实施阶段全部完成。

## 19. 关键风险

### VS Code 不公开 IME composition 生命周期

采用稳定窗口和最终 diff，必须真实输入法验收。若某输入法持续产生无法稳定归并的中间文档状态，优先调整 Adapter 的检查点/稳定算法，不把私有 VS Code API 引入领域层。

### Decoration attachment 能力有限

使用受保护零宽锚点和 before/after attachment，字体通过语言配置处理。实现阶段必须在真实编辑器验证空行、长行、宽字符、Tab、滚动和高对比主题。

### 全局数据多窗口并发

Result 使用独立不可变文件；素材 catalog 使用锁和原子替换；派生投影可重建。不得用一个无并发保护的大 JSON 文件承担所有事实数据。

### 范围过大

本文已经把工作拆成七个有依赖顺序的模块化工作包。实施计划必须逐包列出文件、测试、迁移和验收，但最终 Definition of Done 仍是完整需求，不得把首个可用切片称为最终成果。
