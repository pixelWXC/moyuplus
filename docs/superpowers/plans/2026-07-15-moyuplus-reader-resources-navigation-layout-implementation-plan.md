# MoyuPlus 阅读器资源、内部导航与分页边距实施计划

- 日期：2026-07-15
- 依据：[阅读器资源、内部导航与分页边距设计](../specs/2026-07-15-moyuplus-reader-resources-navigation-layout-design.md)
- 当前基线：`0.0.7`
- 状态：完成；自动与人工验收均通过（2026-07-16）
- 策略：严格 RED → GREEN → REFACTOR；先纯模型与协议，再 EPUB 资源安全链路，再 Host 预览与命令，最后接入 Webview 导航和布局。

## 1. 执行保护

- 每个新增行为先增加一个最小失败测试，并单独运行以确认失败原因。
- 不手工修改 `media/readerApp.js`、CSS bundle 或 source map；只通过构建命令生成。
- 保留用户已有改动；不 reset、checkout、stash 或清理未跟踪文件。
- 不放宽 ZIP 上限、CSP、网络隔离、路径规范化或过期响应丢弃规则。
- 不增加外部链接、正文图片展开、持久化后退栈、前进栈或默认快捷键。
- 实现代码不自动提交；设计提交保持独立。
- 每次 RED/GREEN 和错误都追加到 `progress.md`，阶段完成后同步 `task_plan.md` 与本文件状态。

## 2. Phase 0：基线与测试夹具

### Task 0.1：确认可重复基线

运行：

```powershell
npm run test:unit
npm run test:layout
npm run compile
git diff --check
```

如有既有失败，只处理会阻断本计划的失败；不得顺手修复无关问题。

### Task 0.2：补充 EPUB 资源与 DOM 导航夹具

通过现有 fixture 生成方式增加：

- raster：PNG/JPEG/GIF/WebP/AVIF 的最小有效字节与 MIME 欺骗样本；
- SVG：安全样本和 script/event/foreignObject/external href/CSS url/animation 恶意样本；
- XHTML：相对图片、alt/figcaption、同章/跨章 fragment、pagebreak、noteref/backlink、外链；
- 布局：中英文、列表、标题、图片链接与出版物 margin 样式。

夹具不得依赖网络，不得把超限 ZIP 样本以大二进制提交；超限场景使用可控 archive fixture。

## 3. Phase 1：协议、Locator 与纯导航模型

### Task 1.1：升级 Reader 消息协议

先在 `readerMessages` 测试中增加 RED：

- 新协议版本和所有既有 fixture 同步升级；
- `requestSectionTarget` 携带关联 envelope、目标 section 与可选 fragment；
- `openImage` 只携带 envelope、section generation 和不透明 `resourceId`；
- `navigationState` 增加 `canUndoLocation`；
- Host 到 Webview 的目标失败、图片失败消息必须匹配当前 request/section generation；
- 未知字段、错误类型、外部 URL 或路径字段被守卫拒绝。

GREEN 只扩充严格联合类型和守卫，不在消息层执行资源读取或导航。

### Task 1.2：扩展 EpubLocator 与 source revision

先在 locator/domain 测试中增加 RED：

- `EpubLocator` 支持可选 `textOffset` 与 `sourceRevision`；
- normalize 时 offset clamp，revision 缺失保持向后兼容；
- revision 相同优先 offset，不同则只使用 progression；
- JSON round trip 不保存会话历史。

### Task 1.3：ReaderNavigationHistory

新建纯模块和测试，RED 覆盖：容量 50、连续去重、LIFO、pop 不回写、clear、失败条目继续向前、切书/关闭生命周期由调用方显式清空。

### Task 1.4：InternalTargetResolver

新建 DOM 纯模块和测试，RED 覆盖：

- UTF-16 Text.data.length 累计；
- 普通元素取第一个文本位置；
- 空 anchor/pagebreak 向后、再向前寻找；
- 缺失 fragment 返回不可用；
- offset clamp 和 DOM point 映射；
- 图片链接文字计入 offset，危险节点不在清洗后 DOM 中出现。

## 4. Phase 2：EPUB 内部目标与安全图片声明

### Task 2.1：manifest 与可读 section 索引

在 package/parser 测试中先增加 RED：

- archive path 到可读 sectionId 的稳定索引；
- manifest 图片项保留声明 MIME；
- 仅 AVIF/GIF/JPEG/PNG/WebP/SVG 可声明；
- `application/octet-stream`、非 manifest、路径逃逸和 MIME/扩展名明显冲突不可声明。

### Task 2.2：XHTML sanitizer 结构化重写

先增加 sanitizer RED：

- `<img>` 替换为可聚焦图片链接，label 优先 alt → figcaption → 默认；
- 合法图片只暴露不透明 ID、label、MIME，不暴露 archive path；
- 不合法图片输出不可点击“图片不可用”；
- 同章/跨章内部链接重写为结构化 target；
- TOC fragment 复用同一 target 语义；
- http/https/file/javascript/data/协议相对链接只保留文字。

GREEN 后由清洗结果同时返回 `SafeImageDeclaration[]`、安全 HTML 和 `sourceRevision`。

### Task 2.3：BookHandle 声明资源读取

扩展 `BookHandle`，先增加 RED：

- EPUB 只读取当前打开书籍、当前 section 已声明的不透明 ID；
- TXT 拒绝资源读取且不声明资源；
- 未知、过期或跨 section ID 不触发 archive entry 探测；
- 读取继续经过单 entry 32 MiB、总大小和压缩比限制。

### Task 2.4：内容 MIME 与 SVG 权威校验

新建小型安全模块，先增加 RED：

- raster magic bytes 识别 PNG/JPEG/GIF/WebP/AVIF；声明与内容 MIME 必须一致；
- SVG 必须声明为 `image/svg+xml` 且 UTF-8 可解码；
- SVG 移除 script、事件属性、foreignObject、外部/协议 URL、CSS url、动画和未允许元素/属性；
- 预览 payload 对 raster 使用验证后的原始字节，对 SVG 只使用重新序列化字节；
- 原始 SVG 字节绝不传给预览服务。

## 5. Phase 3：只读图片预览服务

### Task 3.1：内存文档注册与释放

新增 `MoyuplusImagePreviewService` 的纯注册层测试，RED 覆盖：

- `moyuplus-image:` 临时 URI 唯一且不含磁盘路径；
- 文档持有独立字节副本；
- 打开失败清理未持有项；
- 文档关闭、provider dispose 释放内存；
- dispose 后拒绝新图片。

### Task 3.2：CustomReadonlyEditorProvider 与 CSP

先增加 provider/HTML RED：

- 注册 `moyuplus.imagePreview` 只读 custom editor；
- 独立 nonce；CSP 为 default none、nonce script/style、img blob/data、connect/frame/media none；
- Webview 只接收已验证 payload，创建/替换/dispose 时 revoke Blob URL；
- `<img>` alt 使用清洗 label 或“书籍图片”。

### Task 3.3：openWith 集成

先增加 RED：

- 调用 `vscode.openWith(uri, 'moyuplus.imagePreview', { preview: true })`；
- 成功后文档生命周期不依赖活动 BookHandle；
- 命令失败时清理注册并向当前 Reader 返回图片失败；
- package contribution、activation 与 extension dispose 配对。

## 6. Phase 4：Extension Host 资源校验与位置命令

### Task 4.1：ReaderController 图片请求防线

先增加 RED：

- Controller 记录最近成功 section 的 requestId/bookId/sectionId/generation/声明资源；
- 任一 envelope、generation、resourceId 不匹配时静默丢弃且不读取；
- 合法请求才读取和验证图片；
- 真实读取/MIME/SVG/预览失败向仍为当前的 Reader 返回非阻塞错误；
- 新 section/切书/dispose 淘汰旧图片响应。

### Task 4.2：上一页、下一页、撤回命令统一入口

先增加 RED：

- 保留 previous/next，新增 `moyuplus.reader.undoLocation`；
- 三项均由 Extension Host 注册并发送 Webview 命令；
- 书架、Git Log、View 未建立、无活动正文和 canUndo=false 时静默返回 false；
- 不聚焦、不 reveal、不显示提示；
- package 中列出命令但 `contributes.keybindings` 无默认绑定；
- 快捷键设置页列出三项。

### Task 4.3：Provider/Controller 集成

接入 openImage、目标加载、navigationState 和 Preview Service，保持 Reader/Git Log mode generation、缓存和恢复测试绿色。

## 7. Phase 5：Webview Navigator 与撤回 UI

### Task 5.1：ReaderNavigator 原子导航

先增加纯/DOM RED：

- 本章翻页和 fragment 成功后只压入一次原位置；
- 同位置、不移动、书首书尾不写历史；
- 跨章在离屏解析和分页成功前不替换可见 section、不写历史；
- 失败/过期响应保持位置和历史并提示“目标位置不可用”；
- TOC fragment 与正文 target 走同一入口；
- 重排和设置变化保持 textOffset 且不写历史。

### Task 5.2：撤回恢复

先增加 RED：

- 撤回按 sectionId + textOffset 恢复，失败依次 progression、section 起点、更早历史；
- 恢复自身不反向 push；
- requestId/切书/书架/dispose 清空；
- canUndoLocation 与 Host 上报同步。

### Task 5.3：DOM 事件委托与工具栏

接入图片链接、内部 target、TOC fragment 和“↶ 撤回”按钮：

- 按钮位于目录/设置之前；disabled、title、aria-label、焦点样式完整；
- 220px 只隐藏文字，不隐藏功能和可访问名称；
- 图片链接只发不透明 ID，Enter/Space 可用；
- 错误沿用 `role=status`，不抢焦点。

现有 `.impeccable.md` 的“实用、低打扰、VS Code 原生适配”方向优先；本轮不引入新视觉语言。

## 8. Phase 6：分页边距与测量一致性

### Task 6.1：reader-viewport / reader-page 结构

先增加 DOM/layout RED：

- reader-view 四行 grid；viewport 只占正文行并 overflow hidden；
- pagePadding 仅在 reader-page 以同一值控制四边；
- footer 独立且不与正文 box 重叠。

### Task 6.2：真实渲染与测量面同构

先增加 LayoutEngine RED：

- source/measure/visible page 使用同一 class、dataset、内联偏好、CSS 变量、box sizing 和尺寸；
- 不依赖 computed-style 属性白名单；
- 分页 fit 包含上下 padding；
- 渲染后 `scrollHeight > clientHeight + 1` 时缩短末尾并重渲染；
- 字体完成、字号、边距和 resize 按 textOffset 重排且不写历史。

### Task 6.3：Playwright 矩阵

在 220/280/360px 和 8/24/64px padding 下覆盖中英文、长段落、列表、标题、图片链接及出版物 margin；断言四边误差 ≤1px、末行不越界、footer 不重叠、重排锚点稳定。

## 9. Phase 7：完整回归、文档与交付

### Task 7.1：安全与集成回归

- 全部网络请求仍为 0；
- Reader/Image Preview CSP、Blob revoke、恶意路径、MIME 欺骗、SVG、ZIP 上限和过期响应测试通过；
- Git Log 缓存、Reader 恢复、书架、打字练习与设置无回归。

### Task 7.2：文档和版本准备

更新 README、指导文档、CHANGELOG、快捷键设置页和本计划状态。除非用户明确要求发布，不提升版本、不打 tag、不推送。

### Task 7.3：自动门禁

```powershell
npm run compile
npm run test:unit
npm run test:layout
npm run package
git diff --check
```

核对 VSIX 不包含源码、测试、计划、source map、lockfile 或书籍文件。

### Task 7.4：人工验收

按设计规格第 10.5 节在真实 Extension Development Host 与本地 EPUB 中验收。自动门禁通过但人工场景未执行时，状态必须明确为“自动完成，待人工验收”。

## 10. 停止条件

遇到以下情况暂停并报告，不扩大范围：

- 目标文件出现无法安全合并的用户改动；
- 只读 Custom Editor 无法在不落盘的前提下维持固定标签文档；
- 安全图片预览需要放宽 Reader/Preview CSP 或 ZIP 限制；
- 跨章原子导航必须破坏既有 generation/过期响应规则；
- LayoutEngine 无法在现有构建/Playwright 环境证明测量面与真实面同构；
- 基线存在与本功能无关且会阻断验证的失败。

## 11. 完成定义

只有设计规格的图片预览、内部目标、50 条会话撤回、三项无默认绑定的 Host 命令、四边一致 padding、末行不裁切、安全边界、自动门禁和人工验收全部满足，才标记完整完成。

## 12. 2026-07-15 执行结果

- Phase 0–6 已完成；协议 v3、安全图片预览、内部 fragment、50 条会话历史、Host 位置命令和分页同构测量均已落地。
- 最终自动门禁：TypeScript/生产构建通过，Vitest 44 文件 208/208，Playwright 20/20，`git diff --check` 通过。
- 已生成 `moyuplus-0.0.7-reader-navigation.vsix`；内容仅 8 个发布文件，不含源码、测试、计划、source map、lockfile 或书籍。
- 未提升版本、未推送、未发布。
- 2026-07-16 用户使用真实 VSIX 与本地长书完成人工验收，资源预览、内部导航、撤回、分页边距及相关回归全部通过。
