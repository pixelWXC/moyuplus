# MoyuPlus 阅读器统一排版与分页回归修复设计

- 日期：2026-07-15
- 状态：已实施并通过自动与人工验收（2026-07-16）
- 基线：0.0.7 工作区中的阅读器资源、内部导航与分页实现
- 决策：保留 EPUB 语义结构，移除出版物 CSS，由 MoyuPlus 提供唯一的统一阅读排版

## 1. 背景与故障

真实 Extension Development Host 人工验收发现：部分 EPUB 在侧边栏中右侧内容被裁切，页边距视觉失效，正文无法完整显示，页数计算错误。当前自动门禁虽然通过，但 Reader 布局测试只覆盖可自然换行的段落，没有覆盖横向溢出。

稳定复现结果：

- 普通换行内容：`pageCount=9`，`scrollWidth/clientWidth=280/280`；
- `white-space: nowrap`：错误得到 `pageCount=1`，`scrollWidth/clientWidth=34228/280`；
- `<pre>`：错误得到 `pageCount=1`，`scrollWidth/clientWidth=24016/280`。

根因由三部分组成：

1. 分页 `fits()`、渲染后修正和跨章预检只检查纵向 `scrollHeight/clientHeight`；
2. Reader 使用 `overflow: hidden`，横向溢出被直接裁切；
3. EPUB sanitizer 保留出版物 CSS 与表现属性，真实书籍可通过 `white-space`、margin、padding、display、表格和预格式文本改变内容宽度。

本故障阻断交付；现有 `moyuplus-0.0.7-reader-navigation.vsix` 不可发布。

## 2. 目标

- 任何受支持 EPUB 正文都必须完整保留在 Reader 页面内容框内，不产生横向滚动或隐藏裁切。
- 页面四边距只由 MoyuPlus `pagePadding` 控制，书籍样式不得改变页面内容框。
- 分页测量面、真实渲染面和跨章预检使用相同排版规则，并同时验证横向与纵向边界。
- 页数、上一页/下一页能力、末页状态和 resize/reflow 后位置必须可信。
- 保留标题、段落、列表、引用、表格、代码、粗体、斜体、上下标、注音、锚点、脚注、尾注、page-list 与文本顺序。
- 不改变 EPUB 图片安全预览、内部导航、撤回历史、零网络、CSP、ZIP 和路径安全边界。

## 3. 非目标

- 不追求 EPUB 原版像素级还原。
- 不保留出版物字体、颜色、字号、行高、缩进、边距、多栏、浮动、绝对定位或装饰布局。
- 不增加横向滚动模式、原版排版模式或按书籍切换的兼容开关。
- 不支持 DRM、脚本交互、音视频、MathML 专用排版或复杂固定版式 EPUB。
- 不重写分页数据模型、Locator、章节导航或图片预览架构。

## 4. EPUB 清洗边界

### 4.1 保留语义，不保留表现

Sanitizer 保留安全语义元素及其文本层级，但删除出版物视觉输入：

- 删除所有 `<style>` 节点；
- 删除所有 `<link rel="stylesheet">` 节点；EPUB 包内 CSS 不读取、不拼接、不发送到 Webview；
- 删除所有 `style` 与 `class` 属性；
- 书籍源属性采用明确允许列表，而不是持续扩充表现属性黑名单：允许内部目标所需的 `id/name`，语言与方向 `lang/xml:lang/dir`，辅助语义 `title/role/aria-*`，表格语义 `colspan/rowspan/scope/headers`，列表序号语义 `start/value/reversed`，以及经内部目标重写后的安全 `href`；其他源属性全部删除；
- 因此 `width`、`height`、`align`、`valign`、`bgcolor`、`border`、`cellspacing`、`cellpadding`、`nowrap` 和未知表现属性均不会进入输出；
- 继续删除事件、外部 URL、脚本、iframe、object、embed、form 与危险资源属性；
- 保留用于内部目标解析的 `id`、`name`、语言和方向信息；
- 只允许 MoyuPlus 自己生成 `.moyuplus-book-content`、`.moyuplus-image-link` 和 `data-moyuplus-*` 属性。

`<b>/<strong>`、`<i>/<em>`、`<sup>/<sub>`、标题、列表、引用、表格、`pre/code` 等通过元素语义继续表达，不依赖书籍 CSS。

### 4.2 内容与 Locator 稳定性

清洗不得重新排序或改写正文文本。样式和表现属性移除不计入文本 offset，因此现有 UTF-16 Locator、fragment 和撤回历史的数据模型保持不变。

Sanitizer 输出语义发生变化后，将 EPUB `sourceRevision` 规则从 `sanitizer-v2` 提升为 `sanitizer-v3`，防止旧会话内位置错误复用到新 DOM。

## 5. MoyuPlus 统一阅读样式

统一样式只作用于 `.reader-content > .moyuplus-book-content`，并满足：

- 根内容与所有结构元素使用 `box-sizing: border-box`、`min-width: 0`、`max-width: 100%`；
- 普通文本使用 Reader 偏好中的字体、字号、行高、字距、段距、对齐和主题；
- 连续长字符、长链接文字和不可断行单词使用强制换行策略；
- `pre` 使用 `white-space: pre-wrap`，保留换行但允许长行折行；`code` 不建立横向滚动区域；
- 表格使用 `width: 100%`、`table-layout: fixed`，单元格允许断行；复杂表格可以视觉降级，但不得丢失文本或越出页面；
- 标题、段落、列表、引用、代码块和表格使用一套克制、可预测的默认间距；
- `nobr` 等浏览器固有不换行元素被覆盖为可换行；
- 页面 padding 只设置在 `.reader-page`，正文子树不得再次模拟页面边距。

UI 继续遵循 VS Code 主题令牌，不引入外部字体或新视觉语言。

## 6. 双轴分页不变量

Layout Engine 引入共享的页面适配判断：

```text
scrollHeight <= clientHeight + 1
AND
scrollWidth <= clientWidth + 1
```

该判断必须用于：

1. 二分分页的隐藏 measure surface；
2. 页面真实渲染后的溢出修正；
3. 跨章原子导航的 staging/preflight。

隐藏 source、measure 和真实 page 继续复制相同 class、dataset、内联 Reader 偏好、CSS 变量、宽高与 box sizing。若支持的语义内容仍出现横向溢出，测试必须失败；不能通过隐藏 overflow、伪造页数或增加横向滚动掩盖问题。

分页仍以 UTF-16 文本 offset 为边界。resize、字体和 Reader 偏好变化以当前页起始 offset 重排，不新增撤回历史。

## 7. 测试设计

### 7.1 Sanitizer 单元测试

先增加 RED，覆盖：

- `<style>`、inline style、class 和表现属性被删除；
- `id/name`、内部链接、脚注和语义元素仍保留；
- sanitizer 生成的 wrapper、图片入口和内部 target 属性仍存在；
- 文本顺序和 UTF-16 文本长度不因样式删除变化；
- `sourceRevision` 使用新规则。

### 7.2 Chromium Layout RED

在 220/280/360px 宽度与 8/24/64px padding 的完整笛卡尔矩阵（共 9 组尺寸组合）下覆盖：

- `white-space: nowrap` 来源样式；
- `<pre>` 长行；
- 无空格的中英文/URL 风格连续字符；
- 宽表格、长单元格与嵌套列表；
- 旧出版物 margin/padding/class/style 属性；
- 普通标题、段落、引用和代码混排。

每个场景断言：

- `scrollWidth <= clientWidth + 1`；
- 第一个和最后一个可见文本矩形位于四边 padding 内；
- 内容足够长时 `pageCount > 1`，末页非空且无法继续下一页；
- 所有页面串联后的文本与清洗后正文文本一致，不重复、不丢失；
- footer 不与正文重叠；
- resize/reflow 后锚点稳定且页码能力同步。

真实 `reader-app-harness` 至少增加一个完整 EPUB section 场景，避免只在独立 Layout Engine fixture 中证明。

### 7.3 回归门禁

最终运行：

```powershell
npm run compile
npm run test:unit
npm run test:layout
npm run package
git diff --check
```

继续核对 VSIX 不包含源码、测试、计划、source map、lockfile 或书籍文件。

## 8. 错误处理与兼容性

- 统一排版不因书籍 CSS 解析失败而中断章节加载，因为出版物 CSS 不再进入渲染输出。
- 无文本或只有空语义节点的章节继续使用单页空章节行为。
- 极端表格和预格式文本优先完整显示；允许视觉压缩和换行，不允许裁切。
- 如果真实 EPUB 依赖 CSS 才能表达视觉层级，结果可以退化为普通语义内容；README 明确这是产品取舍，不作为加载错误。

## 9. 文档与交付

- README 和指导文档明确：MoyuPlus 使用统一阅读排版，不保留 EPUB 原版 CSS。
- CHANGELOG 记录右侧裁切、页数误算和统一排版修复。
- 不提升版本、不提交实现、不推送、不发布，除非用户后续明确要求。
- 新 VSIX 必须使用不同于失败产物的文件名；旧 `moyuplus-0.0.7-reader-navigation.vsix` 保持不可交付状态。

## 10. 人工验收

使用触发原故障的 EPUB，在真实 Extension Development Host 中确认：

1. 原失败章节完整显示，右边距与左边距一致；
2. `pre`、长连续文本和表格无横向裁切；
3. 页数与逐页阅读内容一致，末页后不能继续翻页；
4. 调整侧边栏宽度、字号、行高和页边距后重新分页正确，位置保持在原段落附近；
5. 标题、列表、引用、粗体、斜体、脚注、尾注和内部链接仍可读可用；
6. 图片预览、撤回、快捷键、Git Log 和 TXT 阅读无回归；
7. Webview 无外部网络请求。

只有自动门禁与上述真实 EPUB 人工场景全部通过，才可恢复交付状态。

## 11. 完成定义

- 出版物 CSS 与表现属性不再进入 Reader 正文；
- MoyuPlus 统一样式覆盖全部受支持语义结构；
- measure、render、preflight 均验证双轴适配；
- 横向溢出矩阵、页数完整性、导航和现有回归全部通过；
- 原故障 EPUB 人工复验通过；
- 文档和交付状态准确。
