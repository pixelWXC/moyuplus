# MoyuPlus 长书分页与导航性能回归修复设计

- 日期：2026-07-15
- 状态：已实施并通过自动与人工验收（2026-07-16）
- 基线：`v0.0.6` 与当前 0.0.7 工作区

## 1. 问题与基线

用户在同一真实多章节长 EPUB 上确认，0.0.7 的章节加载和目录打开速度约为 0.0.6 的 20%，慢 5 倍以上。约 39k HTML 的 Chromium 诊断得到：初载约 509ms、打开目录约 363ms、跨章章尾注解约 894ms。

主要回归来自当前 `fragment()`：每次二分测量都 `cloneNode(true)` 克隆整章，再遍历全部文本和元素并删除页外节点。0.0.6 使用 `Range.cloneContents()`，成本只与候选页片段相关。目录状态变化又会销毁分页器并重算整章；跨章目标还会先完整预检分页，再正式完整分页。

## 2. 目标与非目标

目标：

- 同书、同窗口、同设置下，章节初始化和目录打开不超过 0.0.6 耗时的 1.25 倍，理想为持平或更快。
- 跨章远距离注解不再执行两次完整目标章分页。
- 保留准确总页数、双轴适配、UTF-16 locator、resize/reflow 锚点、内部导航原子性和撤回历史。
- 保留统一排版、图片安全预览、CSP、ZIP 和路径安全边界。

非目标：

- 本轮不引入渐进页码、Web Worker、虚拟目录、持久化分页缓存或新的用户设置。
- 不更改 EPUB/TXT 数据模型、协议版本或出版物样式清洗策略。

## 3. Range 级分页片段

`LayoutEngine.fragment(start, end)` 恢复使用现有 text span 对应的 DOM Range。`range.cloneContents()` 只复制候选范围；随后从 `range.commonAncestorContainer` 向上浅克隆必要祖先，直到 `.moyuplus-book-content`，把片段逐层包回，从而同时满足：

- 不克隆或扫描整章 DOM；
- 同一段落、`pre/code`、表格、列表和引用仍保留语义祖先；
- 最外层 `.moyuplus-book-content` 始终存在，统一 CSS 继续生效；
- 源 DOM、文本顺序和 UTF-16 offset 不变。

若输入没有标准 wrapper，则保留通用 Range 片段行为，不伪造出版物语义。空章节继续使用单页路径。

## 4. 抽屉增量更新

`openDrawer`/`closeDrawer` reducer 状态仍保持不变，但 `dispatch()` 对这两类动作使用 `syncReaderDrawer()`：仅移除旧 `.reader-drawer` 并按当前 state 追加目录或设置 drawer。正文 DOM、Layout Engine、当前页、页数和历史均不变化。

其他影响正文或偏好的 action 仍走完整 render/reflow，避免扩大本轮状态协调范围。目录渲染仍与目录节点数成正比，但不再与当前章节文本长度成正比。

## 5. 单次分页的原子跨章切换

Webview 继续先解析 fragment；目标不存在时保持当前页面并提示。目标存在后，在与可见 page 同尺寸、同 class、dataset、inline preference 和 CSS 变量的隐藏 staging 上创建候选 Layout Engine，并调用一次正式 `setContentAtOffset()` 完成目标章全部分页。空目标章沿用 Layout Engine 的单空页行为，因此也是有效候选。

候选分页失败时立即 dispose，并移除隐藏 staging；旧正文 DOM、旧 Layout Engine、当前 state 和撤回历史完全不变。候选成功后通过新的 `attachTo(visiblePage, onReflow)` 把已经计算好的 source、measure、pages、pageIndex 和当前 fragment 提升到既有可见 page。`attachTo()` 完成后必须移除原隐藏 staging，但不得 dispose 已提升候选的 source/measure；随后才 dispose 旧 Layout Engine、更新 section context/reducer state、章节标题、按钮、页码和 drawer。

成功切换必须绕过现有 `dispatch(selectSection) -> render() -> renderReader()` 完整渲染路径，直接用 reducer 计算新 state，再增量同步章节 UI 和已提升 Layout Engine。该切换契约保证候选实例在提升后仍是当前实例，且提升过程不再次调用 `paginate()`。

当 `range.commonAncestorContainer` 是 Text 时，Range 祖先重建从其 `parentElement` 开始；不得浅克隆 Text 并复制全文。

## 6. 测试与验收

先建立 RED：

- Range 片段测试覆盖同段、跨段、`pre/code`、表格、列表、链接按钮、wrapper 和文本不丢不重；当前整章 clone 实现应因整章 clone 计数/性能契约失败。
- Drawer 测试记录正文节点、隐藏 surface 对象身份、reflow pass/page state，开关目录后必须完全不变；当前实现应因重新创建分页器失败。
- 跨章测试断言候选目标章只发生一次正式完整分页，成功后提升的 Layout Engine 保持同一实例且原 staging 已移除；失败/无效目标保持旧页面原子性；空章节可作为单空页成功切换。

GREEN 后分别加载 `v0.0.6` 已构建 bundle 和当前 bundle：固定 Chromium 版本、280×420 viewport、相同字体/边距、相同 39k/更长章节和相同目录树。每个 bundle 对“章节初始化”和“打开目录”分别预热 2 次、正式运行 5 次并比较中位数；当前两项中位数都必须不超过 v0.0.6 的 1.25 倍。Drawer 同时以正文节点/隐藏 surface 身份、reflow pass 和 page state 完全不变作为确定性门禁，并记录当前 509/363/894ms 诊断值的改善。最终运行 compile、210+ 单测、全部 layout/privacy、package 与 VSIX 内容检查。

## 7. 错误处理与交付

Range 构造或预检异常沿用现有 `false`/目标不可用路径，不提交历史、不替换可见章节。不得通过取消双轴检查、隐藏 overflow、伪造页数或跳过语义 wrapper 换取速度。

不升级版本、不提交、不推送或发布；生成独立 VSIX 供真实长书复验。
