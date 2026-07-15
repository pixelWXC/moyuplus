# MoyuPlus 阅读器资源、内部导航与分页边距设计

日期：2026-07-15
状态：已确认，待实施计划

## 1. 背景

MoyuPlus 0.0.7 的 TXT/EPUB 阅读主体已经可用，但真实 EPUB 暴露出三个相互关联的问题：

1. EPUB 内部相对路径图片经过清洗后没有完成资源读取与显示链路，正文中的图片不可查看。
2. 正文超链接在清洗时丢失跨章节目标，Webview 也没有内部锚点导航和阅读位置历史，因此页码、批注和脚注链接不能可靠跳转。
3. 页边距虽然以一个值写入四边 `padding`，分页测量面与真实渲染面没有共享完整的 DOM/CSS 条件，底部内容可能与页脚边界不一致并被裁切。

当前代码已经具备 EPUB manifest 白名单、严格 Webview CSP、`LocalResourceRef`、`ResourceManager` 和工作区级上一页/下一页命令。本设计补齐运行时链路，不放宽网络与内容安全策略。

## 2. 目标

- 正文不直接展开图片，而是显示“查看图片”链接。
- 点击图片链接后，在 VS Code 主编辑区以可复用的预览标签打开图片；用户固定标签后，后续图片不覆盖它。
- 只允许 EPUB 内部图片；不读取或打开网络、`file:`、`data:` 等正文提供的外部地址。
- 支持同章和跨章的页码、批注、脚注、脚注返回链接及目录 fragment 跳转。
- 增加最多 50 条、仅当前书籍阅读会话有效的连续“撤回阅读位置”历史。
- “上一页”“下一页”“撤回阅读位置”均可由工作区任意焦点触发，默认不绑定按键；非正文状态静默无操作。
- 页边距设置在正文上、右、下、左四边保持一致，正文底部与页脚不重叠、不裁切。
- 保持零网络访问、严格 CSP、ZIP 防护和过期响应丢弃规则。

## 3. 非目标

- 不显示或打开 EPUB 中的外部网页链接。
- 不在正文内展开图片，不增加图片灯箱、缩放工具、旋转或编辑能力。
- 不建立 EPUB 的长期解压目录，不把图片写入工作区或持久化缓存。
- 不持久化阅读后退栈，不实现前进栈。
- 不让 VS Code 的通用 Undo/Redo 接管阅读位置历史。
- 不为三个阅读命令提供默认快捷键。
- 不为不在可读 section 列表中的任意 manifest XHTML 构造临时阅读章节；无法解析到可读 section 的内部目标按不可用处理。

## 4. 已确认的产品行为

### 4.1 图片

- `<img>` 和受支持的 EPUB 图片引用被替换为正文链接，不参与图片原始尺寸的分页。
- 标签优先级为：非空 `alt` → 最近所属 `figure` 的非空 `figcaption` → “查看图片”。
- 有说明时显示“查看图片：说明文字”；无说明时只显示“查看图片”。
- 点击后在主编辑区打开 MoyuPlus 只读图片预览。
- 调用 `vscode.openWith` 时传入 `{ preview: true }`。VS Code 预览功能开启时，连续打开图片复用未固定的预览标签；用户固定后保留。若用户关闭 VS Code 预览编辑器设置，则遵循用户设置。

### 4.2 内部链接

- 支持解析到当前 EPUB 可读 section 的同章锚点和跨章锚点。
- 页码引用、批注、脚注和脚注返回链接不建立特殊协议，统一使用内部目标 `{ sectionId, fragment? }`。
- 目录节点的 `fragment` 使用同一导航入口，不再只选择 section。
- `http:`、`https:`、`file:`、`javascript:`、`data:`、协议相对 URL 和无法安全规范化的链接移除点击能力，只保留可见文字。
- 内部链接目标无法解析或 fragment 不存在时，当前位置不变，历史不变，并显示非阻塞提示“目标位置不可用”。

### 4.3 撤回阅读位置

- 顶部工具组在目录和设置之前增加“↶ 撤回”；窄宽度只显示图标，tooltip 和可访问名称为“撤回阅读位置”。
- 历史为空时按钮禁用。
- 翻页、切章、目录跳转和正文内部链接成功改变位置时，把移动前位置压入历史。
- “撤回”弹出并恢复最近位置；恢复动作本身不反向写入历史，避免两个位置之间来回循环。
- 连续相同位置去重；最多保留 50 条，超出时删除最旧项。
- 打开目录/设置、修改主题/字号/页边距和窗口重排不写历史。
- 跨章请求只有在目标章节成功载入并完成定位后才提交历史；失败或过期响应不提交。
- 返回书架、关闭阅读会话或切换书籍时清空。重新打开书籍只恢复持久化阅读进度，不恢复历史。

### 4.4 快捷键

- 保留 `moyuplus.reader.previousPage` 和 `moyuplus.reader.nextPage`。
- 新增 `moyuplus.reader.undoLocation`。
- 三个命令均注册在 Extension Host，因此不依赖 Webview 或侧栏焦点；用户在工作区任意焦点下绑定后均可触发。
- 三项出现在 MoyuPlus 快捷键设置页和 VS Code Keyboard Shortcuts 中，但 `contributes.keybindings` 不包含它们，因此默认均未设置。
- Provider 在书架、Git Log、未打开 View 或无活动正文时返回 `false`，不聚焦、不打开阅读器、不显示提示。

## 5. 架构与组件边界

### 5.1 EPUB Adapter 与 Sanitizer

Sanitizer 继续承担不可信 XHTML/CSS 的安全清洗，并新增两类结构化输出：

```ts
interface SafeInternalTarget {
  sectionId: string;
  fragment?: string;
}

interface SafeImageDeclaration {
  id: string;
  mimeType: string;
  label: string;
}
```

处理顺序：

1. 基于当前 section 的 archive path 规范化 `href`/图片引用。
2. 内部 XHTML 链接必须映射到 `pkg.sections` 中的可读 section；保留目标 fragment。
3. 图片路径必须存在于 manifest、位于 archive 内、MIME 受支持且通过 EPUB entry 大小限制。
4. Adapter 为路径生成当前书籍内稳定的不透明 ID，并在 Host 内保存 `id → archive path + MIME` 映射。
5. 发送到 Reader Webview 的正文只包含不透明资源 ID、label 和 MIME，不包含本地磁盘路径。

Sanitizer 将图片节点替换为安全的图片链接标记，将可点击内部链接重写为带结构化目标数据的标记。Webview 通过事件委托处理标记；不允许清洗后的正文自行发起导航或资源请求。

OPF manifest 的 `media-type` 是声明 MIME，archive entry 的扩展名只用于一致性检查，不能单独授权资源。声明阶段只为以下 MIME 创建可点击资源：AVIF、GIF、JPEG、PNG、WebP 和 SVG；`application/octet-stream` 不得作为图片 fallback。路径不在 manifest、声明 MIME 不受支持或扩展名与声明 MIME 明显冲突时，Sanitizer 输出不可点击的“图片不可用”，不创建资源声明。

### 5.2 BookHandle 资源读取

`BookHandle` 增加按不透明资源 ID 读取已声明资源的能力。EPUB 实现只允许读取当前打开书籍中由 Adapter 声明过的资源；TXT 实现不声明资源并拒绝读取。

ReaderController 记录最近成功发送的 section generation 和该 section 的资源声明。图片请求必须同时匹配：

- protocol version；
- `requestId`；
- `bookId`；
- `sectionId`；
- 当前 section generation；
- 已声明 `resourceId`。

envelope、book、section、generation 或已声明 ID 任一不匹配，代表过期或伪造请求，必须静默丢弃且不得形成资源存在性 oracle。通过上述请求校验后，读取仍受现有单 ZIP entry 32 MiB、总解压大小和压缩比限制；此后的真实读取、内容校验或预览失败属于用户可见资源错误。

图片在点击时惰性读取并执行权威内容校验：

1. raster 图片按 magic bytes 识别内容 MIME；识别结果必须与 manifest 声明 MIME 相同，JPEG 的 `.jpg`/`.jpeg` 仅是同一 MIME 的扩展名别名。
2. SVG 必须声明为 `image/svg+xml`、按 UTF-8 解码并进入专用 SVG Sanitizer。Sanitizer 删除脚本、事件属性、foreignObject、外部/协议 URL、CSS `url()`、动画和所有未允许元素/属性，再重新序列化。
3. raster 校验通过后使用 archive 原始字节；SVG 只使用重新序列化后的替换字节。原始 SVG 字节永不发送给 Preview Service 或任何 Webview。
4. 内容 MIME 无法识别、与声明不一致或 SVG 清洗失败时返回 `imageOpenFailed`，不得尝试用其他 MIME 解码。

### 5.3 图片预览服务

新增 `MoyuplusImagePreviewService` 与只读自定义编辑器 `moyuplus.imagePreview`：

1. Reader Webview 发送 `openImage` 消息，只包含关联 envelope 和 `resourceId`。
2. ReaderController 校验并读取字节，返回受信任的 `{ bytes, mimeType, label }` 给 Provider。
3. Preview Service 建立 `moyuplus-image:` 临时 URI，并把 URI 映射到内存文档。
4. 执行：

   ```ts
   vscode.commands.executeCommand(
     'vscode.openWith',
     uri,
     'moyuplus.imagePreview',
     { preview: true }
   );
   ```

5. `CustomReadonlyEditorProvider` 在自己的 Webview 中接收字节、创建 Blob URL 并显示 `<img>`。

图片预览 Webview 使用独立随机 nonce 和 CSP：`default-src 'none'`、nonce script/style、`img-src blob: data:`、`connect/frame/media-src 'none'`。切换图片或 dispose 时 revoke Blob URL。内存文档持有自己的字节副本，因此用户固定的图片标签在退出书籍后仍可查看；关闭对应编辑器文档时释放字节。磁盘不产生解压文件。

Preview Service 只接收 Adapter 已经完成内容校验的 `PreviewImagePayload { bytes, mimeType, label }`。受支持的 raster MIME 为 AVIF、GIF、JPEG、PNG、WebP；SVG payload 必须是专用 SVG Sanitizer 重新序列化的替换字节。未通过清洗的 SVG 显示“图片无法安全打开”，不得直接把 archive 原始 SVG 交给 Webview。

### 5.4 Reader Webview 导航组件

新增彼此隔离的组件：

- `ReaderNavigationHistory`：容量、去重、clear、pop，不负责 DOM。
- `InternalTargetResolver`：把当前 source DOM 中的 fragment 映射到文本偏移。
- `ReaderNavigator`：协调 LayoutEngine、本地翻页、跨章加载、TOC/正文目标和历史提交。
- `ReaderLocationCommands`：UI、Extension Host 命令与 Navigator 之间的单一入口。

Webview 会话位置使用：

```ts
interface ReaderHistoryLocation {
  sectionId: string;
  textOffset: number;
  progression: number;
  fragment?: string;
  sourceRevision: string;
}
```

`textOffset` 精确定义为：对清洗后 source DOM 按文档顺序遍历所有 Text 节点，将各节点 JavaScript `Text.data.length`（UTF-16 code units）相加后得到的零基偏移。它包含可见图片链接文字，排除已删除的危险节点；反序列化时 clamp 到 `0..totalLength` 并映射到包含该偏移的 Text 节点边界。

`sourceRevision` 是“原 XHTML bytes + Sanitizer schema version”的 SHA-256 摘要。会话内和重排后优先使用 `textOffset`；只有 revision 一致时才允许用持久化 offset，revision 不同、锚点失效或 offset 越界时使用 `progression` fallback。持久化 Locator schema 不保存整条历史，但 `EpubLocator` 增加可选的 `textOffset` 与 `sourceRevision`，以提高重开书籍和切换模式后的恢复精度。

fragment 定位规则：目标元素存在时取其第一个可索引文本位置；空 pagebreak/anchor 取其后最近文本位置，若无则取其前最近文本位置；仍无法定位时视为 fragment 不可用。

### 5.5 页面布局组件

阅读区拆分为：

```text
reader-view grid
├─ toolbar
├─ chapter bar
├─ reader-viewport       只占正文网格行，overflow hidden
│  └─ reader-page        四边 padding、字体、主题、正文 fragment
└─ reader-footer         独立网格行
```

`pagePadding` 只设置在 `reader-page`，以一个值同时控制四边。`reader-footer` 不共享或侵占该 padding。

LayoutEngine 的隐藏 source/measure surface 与真实 `reader-page` 使用同一 class、dataset、内联偏好、CSS 自定义属性、box sizing、宽度和高度。禁止继续维护容易漏项的手工 computed-style 属性白名单。测量 fragment 与最终渲染 fragment 使用同一容器结构和出版物样式作用域。

分页候选只有在包含上下 padding 的 border box 内完整容纳时才算 fit。真实渲染后若检测到 `scrollHeight > clientHeight + 1`，必须缩短末尾边界并重新渲染，不能依靠 `overflow: hidden` 隐藏最后一行。

字号、字体完成、页边距和窗口大小变化时，以当前页面 `textOffset` 重排；该重排不写入历史。

## 6. 消息协议与数据流

Reader protocol 版本升级，所有新增消息继续使用关联 envelope。

### 6.1 打开内部目标

1. 点击 TOC 或正文链接。
2. Navigator 捕获当前 `ReaderHistoryLocation`，但暂不提交。
3. 同 section：LayoutEngine 在完整 source DOM 中解析 fragment 并定位页面。
4. 跨 section：发送 `requestSectionTarget(sectionId, fragment)`；Host 返回 section 后，Navigator 先在离屏 source/measure surface 中解析 fragment 和分页，保持当前可见 section 不变。
5. 只有目标位置实际提交成功，才把步骤 2 的原位置压入历史并回报新的稳定 Locator。
6. 离屏目标有效时原子替换可见 section；fragment 无效或分页失败时丢弃离屏结果，当前位置和历史从未改变，并显示非阻塞提示。

### 6.2 普通翻页与切章

- section 内翻页由 LayoutEngine 本地完成，成功后提交原位置。
- 到达 section 边界时，跨章请求沿用关联消息；新 section 成功渲染后提交原位置。
- 书首/书尾不改变位置，不写历史。

### 6.3 撤回

1. 历史为空时命令返回 `false`。
2. pop 一个目标，并进入 suppress-history 模式。
3. 按 `sectionId + textOffset` 恢复；失败时按 section progression，最后降级到 section 起点。
4. 恢复成功后退出 suppress-history 并回报 Locator。
5. 恢复失败时显示提示并继续尝试历史中的更早位置；所有条目都失败时禁用撤回。

### 6.4 打开图片

1. 正文图片链接发送 `openImage`。
2. Host 校验关联 envelope、generation 和声明。
3. Adapter 读取并验证资源；过期响应静默丢弃。
4. Preview Service 注册内存文档并调用 `vscode.openWith`。
5. 打开失败时移除未被文档持有的注册项，并向 Reader Webview 发送 `imageOpenFailed`。
6. 图片操作不改变阅读位置，也不写历史。

## 7. 状态、并发与生命周期

- 历史属于 Webview 当前 book request；新 `requestId`、切书、返回书架和 dispose 都清空。
- 新 section request 增加 generation，并取消或淘汰旧 section/图片请求。
- 图片预览文档一旦成功打开便拥有字节副本，不依赖 ReaderController 的活动 BookHandle。
- ReaderViewProvider 维护 `readerPageActive`，并将其作为三个位置命令的最后防线；非正文状态不 post message。
- Webview 同时维护 `canUndoLocation` 并上报导航状态，使顶部按钮和外部命令返回值保持一致。
- Preview Service dispose 时释放未打开或已关闭的注册项；已处置 provider 不接受新图片。

## 8. 错误与安全行为

| 场景 | 行为 |
|---|---|
| 外部链接 | 仅保留文字，不可点击，不产生网络请求 |
| 内部目标无法映射到可读 section | 保持位置和历史，提示“目标位置不可用” |
| fragment 不存在 | 保持位置和历史，提示“目标位置不可用” |
| 图片路径不在 manifest、声明 MIME 不受支持 | 清洗时输出不可点击的“图片不可用”，不创建声明 |
| envelope/generation/resourceId 不匹配 | 视为过期或伪造请求，静默丢弃，不泄露资源状态 |
| 已声明图片在读取时缺失、magic MIME 不匹配 | 向发起点击的当前 Reader 提示“图片无法打开” |
| SVG 清洗失败 | 提示“图片无法安全打开”，不得降级为原样显示 |
| 图片超过 ZIP entry 限制 | 拒绝，不放宽安全策略 |
| 图片读取或预览打开失败 | 清理临时注册项，正文继续可读，允许再次点击重试 |
| 跨章响应过期 | 静默丢弃，不写历史、不改变正文 |
| 撤回目标失效 | progression → section 起点 → 更早历史项 |
| 非正文状态触发阅读快捷键 | 静默返回，不打开或聚焦 Reader |
| 分页真实渲染仍溢出 | 缩短页面边界重新渲染，不裁切文字 |

## 9. 可访问性与窄宽度

- 图片链接是可聚焦的语义按钮或链接，可用 Enter/Space 激活。
- 撤回按钮具有 `aria-label`、title、disabled 状态和可见焦点。
- 图片预览 `<img>` 使用清洗后的 label 作为 alt；无 label 时使用“书籍图片”。
- 220px 极窄宽度下撤回只显示图标，不移除可访问名称。
- 非阻塞错误使用现有 reader toast 的 `role=status`，不抢正文焦点。

## 10. 测试策略

### 10.1 单元测试

- Sanitizer：相对图片、路径规范化、manifest 白名单、alt/figcaption label、外链移除、同章/跨章 target、pagebreak、noteref/backlink。
- SVG：脚本、事件、外部 href、CSS URL 和嵌套资源全部拒绝或移除。
- Adapter/BookHandle：不透明 ID、声明映射、manifest MIME/扩展名规则、raster magic MIME、32 MiB 限制、未知 ID 拒绝。
- SVG：原始字节永不进入 Preview Service；断言预览 payload 只包含清洗后重新序列化的替换字节。
- Reader messages：新增 target/image 消息 envelope、section/generation/resource 校验。
- `ReaderNavigationHistory`：容量 50、去重、pop 不反向 push、clear 生命周期、失败目标跳过。
- `InternalTargetResolver`：UTF-16 textOffset、sourceRevision、文本元素、空 anchor、缺失 fragment 和 fallback。
- Preview Service：`vscode.openWith` 的 viewType 与 `{ preview: true }`、内存注册/释放、失败清理、固定文档独立于 BookHandle。
- Shortcut state：三个位置命令均存在、默认 binding 缺失、非正文状态不 post message。
- Preferences/Layout state：重排保留 textOffset 且不写历史。

### 10.2 Webview 与 Provider 集成测试

- 上一页、下一页、撤回通过 Extension Host 命令在编辑器焦点下仍投递到 Reader。
- 书架、Git Log、View 未创建和无活动正文时三个命令静默无操作。
- 图片点击只发送资源 ID；过期 request/generation 被拒绝。
- TOC fragment 与正文内部链接走同一 Navigator。
- 跨章成功后历史只增加一次；fragment 无效时离屏结果被丢弃，可见 section 和历史均不改变。

### 10.3 Playwright 布局测试

在 220、280、360px 宽度和多种高度下，分别使用 8、24、64px 页边距：

- 测量第一行/最后一行与 page surface 四边的空白，允许至多 1px 布局误差。
- 最后一行的可见 bounding box 不得越过 `reader-page` 内容下边界。
- `reader-footer` bounding box 与正文不重叠。
- 中英文、长段落、列表、标题、图片链接和出版物 margin 样式均覆盖。
- 字号、字体完成、边距和 resize 后锚点稳定且无额外历史条目。
- 页码、同章脚注、跨章脚注、返回链接和连续撤回行为正确。

### 10.4 安全回归

- 拦截全部网络请求，外部请求数必须为 0。
- Reader 与 Image Preview CSP 均禁止 connect、frame、media 和非 nonce script/style。
- bundle 不包含运行时 CDN/http/https 资源。
- Blob URL 在替换、关闭和 dispose 时撤销。
- 恶意路径、MIME 欺骗、危险 SVG、超限 ZIP entry 和过期异步响应均被拒绝。

### 10.5 VSIX 手工验收

使用包含 raster 图片、清洗后 SVG、同章脚注、跨章尾注、page-list 链接和外部链接的本地 EPUB：

1. 正文只出现图片链接，点击在主编辑区打开预览。
2. 连续图片复用预览标签；固定后下一张打开新预览。
3. 外链不可点且无网络请求。
4. 页码/批注跳转后，撤回返回跳转前位置并可继续后退。
5. 编辑器获得焦点时，用户自定义的上一页/下一页/撤回快捷键仍生效。
6. 三个命令无默认按键，非正文状态静默无操作。
7. 最小页边距下正文末行完整可见，四边距离一致。

## 11. 文档与版本

- 升级 Reader 消息协议版本，并同步所有类型守卫和测试 fixture。
- 更新 README、指导文档和快捷键设置页，说明图片预览、内部链接、撤回历史及默认未绑定快捷键。
- CHANGELOG 记录三个用户可见修复，但不承诺外部链接或图片编辑能力。
- 发布前运行 compile、unit、layout、security、package 和 VSIX 手工验收。

## 12. 官方 API 依据

- VS Code `vscode.openWith` 支持传入自定义 editor view id 和 `TextDocumentShowOptions`：<https://code.visualstudio.com/api/references/commands>
- `TextDocumentShowOptions.preview` 使用可替换的预览标签，并遵循用户的预览编辑器设置：<https://code.visualstudio.com/api/references/vscode-api>
- `CustomReadonlyEditorProvider` 适用于图片等只读二进制预览，文档和 Webview 由 VS Code 管理生命周期：<https://code.visualstudio.com/api/extension-guides/custom-editors>
