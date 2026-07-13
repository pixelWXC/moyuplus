# MoyuPlus Reader v2 整体重写实施计划

- 日期：2026-07-10
- 依据：[Reader v2 设计规格](../specs/2026-07-10-moyuplus-reader-redesign-design.md)
- 策略：最大改动面、测试先行、完成后删除旧阅读栈，不长期维护双栈
- 当前状态：Phase 4 已完成（2026-07-10），下一步进入 Phase 5

## 1. 执行原则

每项任务采用相同节奏：

1. 先写目标测试或 fixture。
2. 运行目标测试，确认因缺少新能力而失败。
3. 实现满足测试的最小完整行为。
4. 运行目标测试、全量单元测试和 TypeScript 编译。
5. 检查 `git diff --check`，按 Phase 提交。

旧 Reader 测试不作为兼容契约，但在新链路覆盖相同产品能力之前不得提前删除。Phase 6 一次性移除旧代码、旧命令和旧测试。

## 2. 工具链与依赖决策

### 2.1 运行时依赖

- 保留 `iconv-lite`：TXT GBK 解码。
- 新增 `yauzl`：按 central directory 异步、逐条读取 EPUB ZIP；启用 entry size 和文件名校验，并在应用层增加累计限制。
- 新增 `fast-xml-parser`：解析并验证 container.xml、OPF、NCX 和 nav XML 结构。
- 新增 `parse5`：把 EPUB XHTML 解析为 AST，执行自定义标签/属性清洗后序列化。
- 新增 `css-tree`：解析、遍历和生成出版物 CSS，删除危险规则并执行声明白名单。

具体版本在 Phase 1 安装时使用当时稳定版本并写入 `package-lock.json`。安装后立即运行 `npm audit --omit=dev`；出现高危运行时漏洞时先更换依赖或版本，不以忽略审计作为默认方案。

### 2.2 开发依赖

- 新增 `esbuild`：把扩展宿主打成 Node/CommonJS bundle，并把 Webview 打成独立 browser bundle；`vscode` 标记为 external。
- 新增 `@playwright/test`：运行真实 Chromium Layout Harness。
- 新增 `@vscode/vsce`：生成 VSIX。
- 新增 `@types/yauzl`（若所选 yauzl 版本未内置类型）。
- 新增 `yazl` 及其类型，用代码生成安全/恶意 EPUB，避免维护不可审查的二进制 fixture。

### 2.3 目标脚本

修改 `package.json`：

```json
{
  "scripts": {
    "build": "node scripts/build.mjs",
    "compile": "tsc -p ./ --noEmit && npm run build",
    "test:unit": "vitest run",
    "test:layout": "playwright test --config playwright.config.ts",
    "test": "npm run test:unit && npm run test:layout",
    "package": "npm run compile && npm test && vsce package"
  }
}
```

新增 `scripts/build.mjs`，包含两个 esbuild target：

- Extension Host：入口 `src/extension.ts`，`platform=node`、`format=cjs`、`external=['vscode']`，输出 `out/extension.js`。
- Webview：入口 `src/webview/readerApp.ts`，`platform=browser`，输出 `media/readerApp.js` 和 `media/readerApp.css`。

Webview 不使用 CDN 或外部资源。Extension Host bundling 用于吸收 ESM/CJS 依赖差异，`tsc --noEmit` 保持严格类型检查。

新增 `playwright.config.ts`，只启用 Chromium project。首次开发环境准备运行：

```powershell
npx playwright install chromium
```

## 3. 目标目录结构

```text
src/
  adapters/
    bookAdapter.ts
    adapterRegistry.ts
    txt/
      txtAdapter.ts
      txtSectionizer.ts
      txtEncoding.ts
    epub/
      epubAdapter.ts
      epubArchive.ts
      epubPackageParser.ts
      epubSanitizer.ts
      epubSecurityPolicy.ts
      epubErrors.ts
  domain/
    books.ts
    locators.ts
    readerEngine.ts
    readerPreferences.ts
  library/
    libraryService.ts
    importService.ts
  reader/
    ReaderViewProvider.ts
    readerController.ts
    readerMessages.ts
    webviewHtml.ts
  storage/
    bookLibraryStore.ts
    readingProgressStore.ts
    readerPreferencesStore.ts
    migrations/
      migrateV1ToV2.ts
  typing/
    typingSourceCatalog.ts
  webview/
    readerApp.ts
    readerState.ts
    layoutEngine.ts
    resourceManager.ts
    styles.css
scripts/
  build.mjs
tests/
  layout/
    reader-layout.spec.ts
    privacy-network.spec.ts
  fixtures/
    layout/
playwright.config.ts
media/
  readerApp.js
  readerApp.css
```

`media/` 是构建产物，可由仓库策略决定是否提交；VSIX 必须包含它。源代码不再把完整 Webview JS/CSS 内联到单个 TypeScript 字符串中。

## 4. Phase 1：新领域核心、Store 与迁移骨架

### Task 1.0：依赖与双目标构建兼容门

修改/创建：

- `package.json`
- `package-lock.json`
- `scripts/build.mjs`
- `tsconfig.json`
- `src/test/unit/buildContract.test.ts`

步骤：

1. 安装 2.1/2.2 列出的依赖。
2. 用最小入口分别 import yauzl、fast-xml-parser、parse5、css-tree，并执行 `npm run compile`。
3. 断言 Extension bundle 仍以 CommonJS 导出 `activate/deactivate`，且没有把 `vscode` 打入 bundle。
4. 断言 Webview bundle 不包含 Node built-in、`require()`、远程 URL 或这些运行时解析依赖。
5. 执行 `npm audit --omit=dev` 并记录结果。

任一依赖无法被 Extension Host bundle 或许可证/安全要求接受时，在本 Task 内替换依赖；不得把兼容风险推迟到 EPUB Adapter 实现。

### Task 1.1：Book、Locator 与 Preferences 模型

创建：

- `src/domain/books.ts`
- `src/domain/locators.ts`
- `src/domain/readerPreferences.ts`
- `src/test/unit/bookModels.test.ts`
- `src/test/unit/locatorModels.test.ts`
- `src/test/unit/readerPreferences.test.ts`

测试先覆盖：

- TXT/EPUB `BookRecord` 判别联合与 capability。
- `source`、TXT `formatData.encoding`、时间戳和稳定 ID 校验。
- Locator kind、sectionId、0..1 progression 和 bookProgression 归一化。
- 持久化前剥离内存文本匹配提示，状态中不含正文片段。
- Preferences 默认值、上下限和颜色/枚举校验。
- 损坏或旧形状状态恢复到安全默认值。

实现要求：

- `ReadingLocator` 首版仅含 `TxtLocator | EpubLocator`。
- `createBookId()` 生成随机稳定 ID；URI 不参与持久身份。
- `normalizeReadingPosition()` 只输出可持久化字段。
- Preferences 值域集中定义，Webview 不自行解释非法值。

验证：

```powershell
npm run test:unit -- src/test/unit/bookModels.test.ts src/test/unit/locatorModels.test.ts src/test/unit/readerPreferences.test.ts
npm run compile
```

### Task 1.2：Reader Engine 与统一导航能力

创建：

- `src/domain/readerEngine.ts`
- `src/test/unit/readerEngine.test.ts`

测试先覆盖：

- 打开书籍、选择初始 section、目录跳转。
- 上一章/下一章。
- section 末页请求下一 section，书尾返回 `bookEnd`。
- section 首页反向进入上一 section 末端，书首返回 `bookStart`。
- `canPreviousPage/canNextPage/canPreviousSection/canNextSection` 为按钮、命令和快捷键提供同一状态。
- Reader Engine 不接收 viewport、DOM 高度或 page range。
- section weights 到 bookProgression 的正反向映射，包括空 section 最小权重。

实现要求：

- 输入只接受 sections、逻辑 Locator 和 Layout Engine 回报的 section 边界。
- 输出为不可变 Reader state 和明确 effect，例如 `loadSection`、`showBoundary`。
- 书首/书尾是状态，不抛异常。

### Task 1.3：v2 Stores

创建：

- `src/storage/bookLibraryStore.ts`
- `src/storage/readingProgressStore.ts`
- `src/storage/readerPreferencesStore.ts`
- `src/test/unit/readerV2Storage.test.ts`

修改 `src/storage/storageKeys.ts`，新增：

- `moyuplus.bookLibrary.v2`
- `moyuplus.readingProgress.v2`
- `moyuplus.readerPreferences.v1`
- `moyuplus.readerV2Migration.v1`

测试先覆盖：

- 书籍 upsert/list/get/remove 与同 URI 去重。
- 重新定位只改 URI，ID 和进度不变。
- ReadingProgress 按 bookId 独立读写和删除。
- Preferences 全局读写。
- 损坏条目过滤，不阻断 activation。
- 状态序列化后不含 `textQuote` 或正文。

### Task 1.4：迁移骨架

创建：

- `src/storage/migrations/migrateV1ToV2.ts`
- `src/test/unit/migrateV1ToV2.test.ts`

测试先覆盖：

- `txtLibrary.v1` 转换为 BookRecord，断言 `source` 和 `formatData.encoding`。
- 旧 Reader offset 转为初始 TxtLocator 和 progression。
- 无效 URI/损坏记录可跳过并报告，不导致全部迁移失败。
- 写入 v2 后读取验证成功才写 migration marker。
- 失败保留旧 keys，下次可重试。
- 重复执行幂等，不产生重复书籍。

Phase 1 完成门槛：

- 新领域层和 Store 不依赖旧 Reader Provider。
- 目标测试、全量 Vitest 和 compile 通过。
- 提交：`Implement Reader v2 domain and storage`。

执行状态（2026-07-10）：

- 已完成依赖兼容探针、Extension/Webview 双目标 esbuild、Chromium toolchain smoke 和运行时依赖审计（0 vulnerabilities）。
- 已完成 Book/Locator/Preferences、Reader Engine、v2 Stores 与可重试、幂等的 v1→v2 迁移。
- `npm test` 通过：17 个 Vitest 文件、95 个单元测试，以及 1 个 Chromium 测试。
- `npm run compile`、`git diff --check` 通过；新领域层和 Store 未依赖旧 Reader Provider。

## 5. Phase 2：统一 Adapter、TXT 虚拟分章与 EPUB 安全解析

### Task 2.1：Adapter 合约与 Registry

创建：

- `src/adapters/bookAdapter.ts`
- `src/adapters/adapterRegistry.ts`
- `src/test/unit/adapterRegistry.test.ts`

实现 `BookAdapter`、`BookHandle`、`SectionRef`、`SafeSectionDocument` 和 format Registry。测试覆盖未知 format、重复注册、打开/释放和泛型 Locator 规范化。

### Task 2.2：TxtSectionizer

创建：

- `src/adapters/txt/txtSectionizer.ts`
- `src/test/unit/txtSectionizer.test.ts`
- `src/test/fixtures/txt/chapters-zh.txt`
- `src/test/fixtures/txt/chapters-en.txt`
- `src/test/fixtures/txt/no-headings.txt`

实现内建中英文章节识别、超大无标题 TXT 稳定分段和小文件单章 fallback。测试不丢字符、不重叠、section 顺序/ID 稳定，并覆盖空文件、超长行和混合换行。用户自定义正则不进入首版 API。

### Task 2.3：TxtAdapter 与练习源接口

创建：

- `src/adapters/txt/txtEncoding.ts`
- `src/adapters/txt/txtAdapter.ts`
- `src/typing/typingSourceCatalog.ts`
- `src/test/unit/txtAdapter.test.ts`
- `src/test/unit/typingSourceCatalog.test.ts`

从旧 `TxtFileService` 提取 UTF-8/GBK 解码与物理行读取，但不复用旧 TXT-only library 依赖。测试 inspect/open/TOC/sections/getSection、offset/progression、sourceRevision 和 TXT-only 练习过滤。

### Task 2.4：EPUB Archive 安全边界

创建：

- `src/adapters/epub/epubArchive.ts`
- `src/adapters/epub/epubSecurityPolicy.ts`
- `src/adapters/epub/epubErrors.ts`
- `src/test/helpers/epubFixtureBuilder.ts`
- `src/test/unit/epubArchive.test.ts`

首版安全常量：

```ts
MAX_ENTRIES = 5_000
MAX_TOTAL_UNCOMPRESSED_BYTES = 256 MiB
MAX_ENTRY_UNCOMPRESSED_BYTES = 32 MiB
MAX_MARKUP_BYTES = 8 MiB
MAX_COMPRESSION_RATIO = 100
```

使用 yauzl Promise/async iterator 一次处理一个 entry；启用 size/filename 校验；应用层同时检查累计大小、实际 stream bytes、路径穿越、加密和压缩算法。不创建磁盘解压目录。

### Task 2.5：EPUB Package 解析

创建：

- `src/adapters/epub/epubPackageParser.ts`
- `src/test/unit/epubPackageParser.test.ts`

在 XML 解析前拒绝 `DOCTYPE`/`ENTITY`，解析 container、OPF、metadata、manifest、spine、EPUB 3 nav 和 EPUB 2 NCX。规范化 ZIP 内 URI，输出嵌套 TocNode、SectionRef 和 progressionWeight。

### Task 2.6：XHTML/CSS Sanitizer

创建：

- `src/adapters/epub/epubSanitizer.ts`
- `src/test/unit/epubSanitizer.test.ts`

使用 parse5 AST 与 css-tree AST：

- 删除 script、iframe、object、embed、form、meta refresh 和事件属性。
- href 只允许 EPUB 内部导航；img/font 只允许已校验内部资源。
- 删除 `@import`、危险 `url()`、`Raw` 节点和越界选择器。
- CSS 声明采用 allowlist，拒绝 fixed/position、z-index、animation、transition、behavior 和可遮挡控制层的属性。
- 输出限定在 `.moyuplus-book-content` 下，用户 CSS 变量优先。

测试断言结果不含主动内容、危险协议、外链或非白名单样式。

### Task 2.7：EpubAdapter

创建：

- `src/adapters/epub/epubAdapter.ts`
- `src/test/unit/epubAdapter.test.ts`

组合 Archive、Package Parser 与 Sanitizer，实现 inspect/open/getToc/getSections/getSection/normalizeLocator/dispose。覆盖有效 EPUB、无封面、CFI/fragment fallback、安全资源和 dispose。

Phase 2 完成门槛：

- 所有 EPUB 解析都在扩展宿主完成。
- 恶意 fixtures 通过安全拒绝测试。
- 提交：`Implement TXT and EPUB adapters`。

执行状态（2026-07-10）：

- 已完成统一 `BookAdapter`/`BookHandle` 合约和 format Registry。
- 已完成 TXT UTF-8/GBK 解码、物理行接口、中英文章节识别、无标题大文件稳定分段和 TXT typing capability 过滤。
- 已完成 EPUB ZIP 安全边界、container/OPF、EPUB 3 nav/EPUB 2 NCX 解析、XHTML/CSS 清洗和 `EpubAdapter` 组合。
- ZIP 读取不落盘，启用条目数、单条/累计大小、markup 大小、压缩比、路径、加密和压缩算法限制。
- `npm test` 通过：25 个 Vitest 文件、106 个单元测试，以及 1 个 Chromium 测试；`npm run compile` 与 `git diff --check` 通过。

## 6. Phase 3：Webview Bundle、Layout Engine 与真实 DOM 测试

### Task 3.1：Webview 构建入口

创建：

- `scripts/build.mjs`
- `src/webview/readerApp.ts`
- `src/webview/readerState.ts`
- `src/webview/styles.css`
- `playwright.config.ts`

扩展 Task 1.0 的构建脚本并接入 Webview 正式入口。添加构建断言：输出文件存在、无远程 URL、Webview bundle 不引用 Node 内置模块。

### Task 3.2：Reader v2 消息协议

重写：

- `src/reader/readerMessages.ts`
- `src/test/unit/readerMessages.test.ts`

所有消息包含协议版本和 `requestId + bookId`；open 阶段不要求 sectionId，选章后的内容、Layout 与切章消息要求 sectionId。所有消息有运行时类型守卫，只传当前安全 section。

### Task 3.3：ResourceManager

创建：

- `src/webview/resourceManager.ts`
- `src/test/unit/resourceManagerContract.test.ts`

从受限资源载荷创建 Blob URL；切章/切书/dispose 时 revoke；只接受 sanitizer 声明的 MIME/资源 ID；不接受外部 URL 回退。

### Task 3.4：Layout Engine

创建：

- `src/webview/layoutEngine.ts`
- `tests/layout/reader-layout.spec.ts`
- `tests/fixtures/layout/reader-harness.html`

实现真实 DOM 测量、指数扩展+二分查找、段落/词边界收敛、Locator/progression、Resize/字体/Preferences 合并重排和明确页能力。末页不得生成空页。

Playwright 覆盖中英文、超长行、字体、图片、220/280/360px 宽度、多种高度、样式变化、章节首尾、末页重复 next 和正文填满剩余区域。

### Task 3.5：隐私网络 Harness

创建 `tests/layout/privacy-network.spec.ts`，拦截全部 request，断言外部请求数 0、CSP 禁止 connect/frame/media，bundle 不含 CDN/http/https 运行时依赖。

Phase 3 完成门槛：

- [x] `npm run build:webview` 和 `npm run test:layout` 通过。
- [x] Layout Engine 不依赖 Extension Host DOM 模拟。
- 提交：`Implement Webview layout engine`。

完成记录（2026-07-10）：

- Reader v2 消息协议已提供版本、关联 ID、章节阶段约束和双向运行时守卫，同时保留旧 Provider 在 Phase 4 重写前的兼容类型。
- ResourceManager 仅接收 sanitizer 声明且 MIME 匹配的图片/字体资源，切章、切书与 dispose 均回收 Blob URL。
- Layout Engine 使用真实 Chromium DOM、指数扩展后二分测量、词/段落边界收敛、首尾能力状态和基于 offset/progression 的重排恢复；重复 next 不产生空白尾页。
- resize、字体完成和 Preferences 重排请求按 animation frame 合并；真实 DOM Harness 覆盖 220/280/360px、中英文、长内容、图片、字号变化、定位恢复和章节首尾。
- 隐私 Harness 验证零 HTTP(S) 请求、deny-by-default CSP，以及 Webview bundle 不含远程 URL、网络 API 或 Node 运行时依赖。

## 7. Phase 4：书架、Reader Controller 与侧边栏应用

### Task 4.1：LibraryService 与导入/移除/重定位

创建：

- `src/library/libraryService.ts`
- `src/library/importService.ts`
- `src/test/unit/libraryService.test.ts`

替换旧 TXT-only 命令层。测试先覆盖：

- 根据扩展名与内容探测选择 Adapter。
- 只有 inspect 成功后才写 BookRecord。
- 同 URI 去重。
- 移除事务同时清理进度、当前 Reader 和同书 TXT 练习 session，但不调用文件删除 API。
- 重定位校验 format 后更新 URI 并保留 ID/进度。
- 失效文件扫描。

### Task 4.2：ReaderController

创建：

- `src/reader/readerController.ts`
- `src/test/unit/readerController.test.ts`

职责：

- 组合 LibraryService、AdapterRegistry、ReaderEngine、ProgressStore。
- 管理唯一 active BookHandle 和 AbortController。
- 生成 requestId，丢弃过期 book/section 响应。
- 加载 TOC/section、安全资源和初始 Locator。
- 防抖保存进度，并提供 flush/dispose。
- 将所有错误映射为明确 ReaderErrorState。

测试用 deferred promise 验证快速切书、快速切章和旧响应丢弃。

### Task 4.3：ReaderViewProvider 与 CSP

重写：

- `src/reader/ReaderViewProvider.ts`
- `src/reader/webviewHtml.ts`
- `src/test/unit/readerViewProviderV2.test.ts`
- `src/test/unit/readerWebviewSecurity.test.ts`

实现：

- 加载 `media/readerApp.js/css`。
- 每次 HTML 生成随机 nonce。
- `localResourceRoots` 仅包含扩展 media；书籍内容不作为 local root。
- 使用设计规格中的 CSP。
- view hide/dispose 时调用 controller.flush/dispose。

### Task 4.4：书架页

修改：

- `src/webview/readerApp.ts`
- `src/webview/readerState.ts`
- `src/webview/styles.css`
- `src/test/unit/readerWebviewState.test.ts`

实现书架列表、导入、格式/进度/失效状态、打开、TXT 练习菜单、重新定位和移除确认。

UI state reducer 测试覆盖：

- 空书架。
- EPUB/TXT 混合。
- 失效记录。
- 删除文案明确“不删除原文件”。
- EPUB 不显示练习操作。

### Task 4.5：阅读页、目录与设置抽屉

实现：

- 顶部返回/目录/设置。
- 章节栏上一章/当前章/下一章。
- 正文与页脚。
- 目录嵌套和跳转。
- Preferences 即时预览、保存和 reset。
- 书首/书尾禁用状态与非阻断提示。
- 极窄宽度图标模式和可访问标签。

Layout Engine 仍是唯一分页实现；UI 只发送意图并渲染能力状态。

Phase 4 完成门槛：

- 侧边栏从书架到 EPUB/TXT 阅读完整可用。
- 删除、失效恢复、目录和设置自动测试通过。
- 提交：`Build Reader v2 sidebar experience`。

完成记录（2026-07-10）：

- LibraryService、ReaderController、ReaderViewProvider v2、严格 CSP、书架 reducer 与混合 EPUB/TXT 书架均已实现。
- 阅读页已接通顶部工具栏、章节导航、Layout Engine 正文分页、页脚翻页、嵌套目录与 Preferences 覆盖抽屉。
- 章节与页面能力统一派生；书首/书尾保持当前页并显示非阻断提示；极窄宽度保留 tooltip 与可访问标签。
- Phase 4 回归通过：30 个 Vitest 文件 121 个测试、7 个 Chromium Layout/隐私测试、`npm run compile` 与 `git diff --check`。

## 8. Phase 5：打字练习、命令、快捷键与迁移集成

### Task 5.1：打字练习接入 BookLibrary

修改：

- `src/typing/TypingPracticeController.ts`
- `src/typing/typingPracticeCommands.ts`
- `src/test/unit/typingPracticeController.test.ts`
- `src/test/unit/typingPracticeIntegration.test.ts`

移除对 `ImportedTxtFile`/`TxtFileService` 的依赖，改为 `TypingSourceCatalog`。

回归覆盖：

- 选择器只显示 TXT。
- 物理行、ghost text、下一行、重置、跳转和空白裁剪行为保持。
- 从书架移除当前练习 TXT 时安全停止。
- EPUB 永远不能启动练习。

### Task 5.2：命令与 package contributions

修改：

- `src/extension.ts`
- `package.json`
- `src/commands/shortcutRouter.ts`
- `src/shortcuts/shortcutSettings.ts`
- `src/test/unit/packageContributions.test.ts`
- `src/test/unit/extension.test.ts`

替换/新增命令：

- `moyuplus.importBook`
- `moyuplus.removeBook`
- `moyuplus.relocateBook`
- `moyuplus.reader.openLibrary`
- `moyuplus.reader.previousPage/nextPage`
- `moyuplus.reader.previousChapter/nextChapter`
- `moyuplus.reader.openToc`
- `moyuplus.reader.openSettings`

旧 `moyuplus.importTxt` 可在一个发布周期内作为隐藏 alias 转发 `importBook`，但不继续出现在 UI。其他旧 Reader 命令若语义相同可保留 ID 并改实现，避免用户自定义 keybinding 全部失效。

所有导航命令先读取统一 capability 状态；书尾 Enter route 不再推进。

### Task 5.3：执行 v1→v2 迁移

在 `activate()` 中：

1. 创建 v2 stores 和 Adapter Registry。
2. 运行幂等迁移。
3. 迁移失败时记录最小错误并继续启动，不记录正文。
4. 注册 Reader v2 与 typing。

增加 activation 测试：首次迁移、重复 activation、迁移失败重试和跨 workspace 阅读进度共享。

Phase 5 完成门槛：

- 所有产品入口切到 v2。
- TXT 练习行为回归通过。
- v1 迁移和跨 workspace 恢复通过。
- 提交：`Integrate Reader v2 and migrate legacy state`。

执行记录（2026-07-13）：

- [x] Task 5.1：打字练习已切换到 `TypingSourceCatalog`；只列出 TXT，EPUB 双层拒绝，移除当前练习书籍会安全停止。
- [x] Task 5.2：v2 书架导入/移除/重定位、Reader 章节/目录/设置命令与隐藏 `importTxt` alias 已完成；Enter route 会读取 Webview 上报的真实导航能力，书尾不推进。
- [x] Task 5.3：activation 已先运行幂等 v1→v2 迁移，失败时仅记录最小错误并继续；Reader v2、typing 与全局阅读进度已接入同一 v2 stores。
- **Phase 5 Status：complete。** 当前回归：30 个 Vitest 文件 125 个测试、7 个 Chromium Layout/隐私测试、`npm run compile` 与 `git diff --check` 全部通过。

## 9. Phase 6：删除旧栈、隐私硬化、打包与人工验收

### Task 6.1：删除旧阅读栈

在新覆盖通过后删除或替换：

- `src/txt/txtFileService.ts`
- `src/storage/txtLibraryStore.ts`
- 旧 `ReaderSession`、`PageRange`、`pageHistory` 类型和 v1 Reader Store 路径。
- 只约束 v1 实现的旧 Reader Provider/Webview 测试。
- 旧内联 Webview DOM 分页代码。

保留：

- `iconv-lite` 解码能力的新位置。
- 迁移读取所需的最小 v1 类型/keys，放入 migration 模块并标注只读。
- 打字练习产品能力。

运行 `rg` 确认业务路径不再引用 `TxtLibraryStore`、v1 `ReaderSession`、`pageHistory` 或整本 `text` state payload。

### Task 6.2：隐私与日志审计

新增/扩展测试：

- Webview CSP 和网络请求数 0。
- sanitizer 恶意 fixtures。
- 状态快照不含正文、textQuote、XHTML 或资源 bytes。
- 错误和日志只含书名/结构化错误码，不含章节正文。
- 项目目录、globalStorage 和 workspaceStorage 中无 EPUB 解压目录或正文副本。

### Task 6.3：性能基线

新增基准 fixture：

- 20 MiB TXT。
- 1000 sections EPUB。
- 图片密集 EPUB。
- 连续 resize 和样式变更。

门槛：

- 章节按需加载，Webview state 不含整本内容。
- resize/样式变化最多每 animation frame 合并一次。
- 进度写入 300–500ms 防抖。
- 内存不随连续切章无限增长；资源 URL 在切章后释放。

不在首版写死跨机器毫秒 SLA；保存开发机基准结果，并对后续回归设置相对阈值。

### Task 6.4：全量自动验证

```powershell
npm run compile
npm run test:unit
npm run test:layout
npm run package
git diff --check
```

检查 VSIX：

- 包含 `out/`、`media/readerApp.js` 和 `media/readerApp.css`。
- 不包含 `src/test`、`tests`、Playwright browsers、fixture 源文件或 `.superpowers`。
- 不包含 EPUB/TXT 用户文件。

创建 `.vscodeignore` 明确排除源测试、Playwright 产物、可视化草图、开发文档和临时 fixture；保留 package.json、out、media 和运行时需要的资源。

### Task 6.5：Extension Development Host 人工清单

书架：

- 导入 UTF-8/GBK TXT、EPUB 2、EPUB 3。
- 重复导入不重复。
- 移动原文件后显示失效。
- 重新定位保留进度。
- 移除后原文件仍存在。

阅读：

- EPUB 目录和嵌套章节。
- 上一章/下一章。
- TXT 虚拟章节。
- 字号、行高、字距、主题和窗口 resize。
- 重启、跨 workspace 恢复。
- 章节末页跨章。
- 全书末页再次 next 不出现空白页。
- 书首反向边界对称。

练习：

- 只有 TXT 可选。
- ghost text、下一行、跳转、重置和快捷键正常。

隐私：

- 断网环境完整可用。
- 含外链/脚本的恶意 EPUB 被安全拒绝或清洗。
- 无外部请求、无落盘正文副本。

Phase 6 完成门槛：

- 自动验证和人工清单全部通过。
- 已知限制写入 README/CHANGELOG。
- 提交：`Ship Reader v2`。

## 10. 实施期间的停止条件

出现以下情况时停止当前 Phase，先修订设计或计划：

- EPUB 资源必须落盘才能实现，无法满足“不产生持久化副本”。
- 所选 ZIP/XML/HTML/CSS 依赖无法在 VS Code Extension Host 或目标 Node 版本中运行。
- Webview Blob 资源消息无法可靠承载目标图片/字体大小。
- Layout Engine 无法在侧边栏 resize 后保持 Locator，或必须回退整章滚动。
- 迁移无法同时保持 TXT encoding/source 与旧 offset。
- CSP 必须放宽到允许网络或 EPUB 脚本才能显示内容。

这些情况不是“先实现再说”的技术债，而是会改变已确认设计的决策点。

## 11. 完成定义

Reader v2 只有在以下全部成立时才算完成：

- 设计规格第 16 节验收标准全部通过。
- 旧阅读栈和 v1 实现测试已删除，新测试覆盖产品行为。
- `npm run compile`、unit、layout、package 全部通过。
- VSIX 离线人工验证通过。
- 无外部请求、无主动内容执行、无持久化正文副本。
- Git 工作区只保留明确说明的本地可视化草图或用户文件。

## 12. 依赖参考

- yauzl 官方仓库：https://github.com/thejoshwolfe/yauzl
- fast-xml-parser 官方仓库：https://github.com/NaturalIntelligence/fast-xml-parser
- parse5 官方仓库：https://github.com/inikulin/parse5
- CSSTree 官方仓库：https://github.com/csstree/csstree
- esbuild 官方仓库：https://github.com/evanw/esbuild
- Playwright：https://playwright.dev/docs/browsers 、https://playwright.dev/docs/test-configuration
