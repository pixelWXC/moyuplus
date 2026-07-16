# MoyuPlus 长书性能回归修复实施计划

- 日期：2026-07-15
- 设计：`docs/superpowers/specs/2026-07-15-moyuplus-reader-performance-regression-design.md`
- 范围：章节初始化、目录/设置抽屉、跨章节目标跳转
- 状态：完成；自动与人工验收均通过（2026-07-16）

## 1. RED：建立确定性回归契约

修改 `tests/fixtures/layout/reader-harness.html` 与 `tests/layout/reader-layout.spec.ts`：

- 记录隐藏 source surface 的整树深克隆次数；长章节完整分页后必须为 0。
- 逐页断言 `.moyuplus-book-content` 及段落、`pre/code`、表格和列表等语义祖先仍存在，文本不丢不重。
- 打开和关闭目录/设置时，断言正文节点与两个隐藏 Layout surface 的对象身份不变，页码和正文 HTML 不变。
- 记录 `LayoutEngine.setContent*` 调用次数；跨章节目标成功时，目标章节只能完整分页一次。
- 保留并扩展无效 fragment、候选分页异常和空章节的原子切换测试。

先仅运行新增 Playwright 用例，确认现实现分别因为整章深克隆、抽屉全量 render 和跨章双分页而按预期失败。

## 2. GREEN：Range 局部分片

修改 `src/webview/layoutEngine.ts`：

- 用现有 UTF-16 text span 构造 `Range` 并调用 `cloneContents()`。
- 从 `commonAncestorContainer`（Text 时从 `parentElement`）向上浅克隆祖先，直到 `.moyuplus-book-content`。
- 非标准、没有 canonical wrapper 的输入保持通用 Range 片段，不伪造出版物结构。
- 保留双轴 fits/render 校正、边界吸附、总页数和 reflow 锚点逻辑。

运行 Range、语义结构、文本完整性和横纵向溢出目标测试。

## 3. GREEN：抽屉增量更新

修改 `src/webview/readerApp.ts`：

- `openDrawer`/`closeDrawer` 仍经过 reducer，但只调用 `syncReaderDrawer()` 增删 overlay。
- 不重建 reader shell、正文 page 或 Layout Engine。
- 正文/偏好等其他 action 继续采用现有完整 render/reflow 路径。

运行目录、设置、正文节点身份、隐藏 surface 身份和页码稳定性目标测试。

## 4. GREEN：跨章候选布局一次分页并提升

修改 `src/webview/layoutEngine.ts` 与 `src/webview/readerApp.ts`：

- 在与可见 page 同尺寸、同 identity 和同 CSS 变量的隐藏 staging 上建立候选 Layout Engine。
- fragment 解析成功后只调用一次 `setContentAtOffset()` 完成目标章节全部分页。
- 新增 `attachTo(visiblePage, onReflow)`，把候选现有 pages/source/measure/pageIndex 提升到可见 page，不再次 paginate；提升后移除原 staging，但不 dispose 已提升候选的 source/measure。
- 候选失败时 dispose 候选，保持旧 Layout Engine、DOM、state 和撤回历史不变。
- 候选成功后绕过 `dispatch(selectSection) -> renderReader()`，直接用 reducer 计算 state 并增量更新 section context、标题、章节按钮、抽屉、页码和导航历史；随后 dispose 旧 Layout Engine。
- 空章节按单空页候选成功处理。

运行跨章单次分页、成功/失败原子性、空章节与撤回测试。

## 5. REFACTOR 与验证

- 运行 `npm run compile`。
- 运行目标 Playwright 用例，再运行全部 unit/layout/privacy 回归。
- 使用固定 Chromium、280×420 viewport、同字体/边距、同一长章节和相同目录树，对 `v0.0.6` bundle 与当前 bundle 的章节初始化、目录打开分别各预热 2 次、测量 5 次并比较中位数；当前两项都不超过 0.0.6 的 1.25 倍。
- 记录目录打开前后 reflow pass/page state 完全不变，并复测远距离跨章注解仅一次完整分页。
- 运行 `npm run package`，不升级版本、不提交、不推送、不发布；将生成的独立 VSIX、SHA-256 和人工复验步骤交付用户。
