# 开发计划：moyuplus

## 2026-07-15 长书初始化、目录与跨章注解性能修复（设计阶段）

### Goal

定位并修复统一排版版本在多章节长 EPUB 上的初始化、目录打开和远距离跨章注解跳转卡顿；图片入口改为普通超链接文字外观，同时保持安全预览、内部导航和分页正确性。

### Phases

- [x] P0：只读诊断长书加载、目录渲染、跨章预检与图片入口路径
- [x] P1：确认性能目标与交互边界
- [x] P2：比较方案、形成设计并取得用户批准
- [x] P3：落盘设计与实施计划
- [x] P4：按 TDD 实施并运行完整回归
- **Status:** complete（2026-07-16 人工验收通过）

### Performance package verification

- `npm run package -- --out moyuplus-0.0.7-performance-fix.vsix` 通过：210/210 unit、28/28 Chromium layout/privacy。
- VSIX 包内版本 0.0.7，共 8 个运行时/说明文件，不含源码、测试、计划、source map、lockfile 或书籍文件。
- SHA-256：`40F9E90F7A4CDBDEAC6725ACA1FEC0AA7529073C83A171B4A0B05000C4272EDB`。

### Approved implementation direction

- 用 `Range.cloneContents()` 截取页内内容，并重建从共同祖先到 `.moyuplus-book-content` 的浅层结构，避免每次 fits 克隆整章。
- 打开/关闭目录和设置抽屉只增删 overlay DOM，不销毁或重新创建 Layout Engine。
- 跨章目标在隐藏 staging 上完整分页一次；成功后直接提升该 Layout Engine 到可见 page，失败时旧页面不动，不再预检后重复分页。
- 同书、同窗口、同设置下初始化和目录打开目标不超过 0.0.6 的 1.25 倍；不牺牲精确页码、双轴边界、原子跳转、撤回和安全协议。

## 2026-07-15 图片入口文本链接样式与测试包（当前）

### Goal

不改图片安全预览协议与按钮语义，仅将 `.moyuplus-image-link` 视觉重置为普通 VS Code 文本超链接，并生成独立 VSIX 供真实环境测试。

### Phases

- [x] I0：确认范围——性能问题延期，只处理图片入口视觉
- [x] I1：RED——真实 Reader harness 断言图片入口不是白色按钮外观
- [x] I2：GREEN——最小 CSS 重置为文本链接
- [x] I3：完整回归、文档、独立 VSIX 与内容核对
- **Status:** complete

### Constraints

- 保留 `<button type="button">`、键盘可访问性、opaque resource id 与安全预览消息。
- 不修改长书分页、目录渲染或跨章导航性能路径。
- 不升级版本、不提交、不发布；新 VSIX 不覆盖已有测试包。

### Constraints

- 设计获批前不修改生产代码。
- 优先消除与整章全文分页/预检相关的同步 DOM 工作，不牺牲定位、原子跳转和撤回语义。
- 图片仍使用不暴露路径的安全预览协议，只改变正文入口的视觉呈现。

### Error log

- 2026-07-15：首次合并读取三个技能文件在 10 秒超时；改用 30 秒超时后完整读取，不重复原调用参数。
- 2026-07-15：首次将源码检索与 Git 状态合并在 10 秒内执行再次超时；后续拆分为仅源码检索并使用 30 秒上限，不重复该组合。
- 2026-07-15：首个浏览器性能基线脚本用全局内部链接选择器，命中 visible/source 两份克隆导致 Playwright strict violation；重试时限定 `#reader-content` 可见页面，不重复全局选择。
- 2026-07-15：首轮性能规格复核指出“最小切片预检成功”不能保证随后全章分页成功，原子性定义不足，且缺少空章与 v0.0.6 同条件基准；已改为候选 Layout Engine 单次完整分页后原子提升，并补齐空章和中位数对比方法，进入第二轮复核。
- 2026-07-15：跨章实现首个大补丁因 sectionReady 上下文与预期不完全匹配而整体未应用；随后拆成字段/UI、候选准备、消息提交三个小补丁逐项验证，没有重复失败的大补丁。
- 2026-07-15：前两次完整 app 性能脚本分别在 240 秒和 600 秒外层上限超时，并遗留仅属于该基准的 Node/Chromium 子进程；核对启动时间、路径和 PID 后只清理这两组进程，改用同页交替 Layout Engine 初始化基线与单 app 重复目录基线。
- 2026-07-15：首次目录对照给旧 v2 sectionReady 遗漏 `sourceRevision/localResources`，消息被协议守卫拒绝，得到无效空页耗时；补齐真实 v2 payload 并增加 page-progress 已加载断言后重跑，未采用无效数据。

## 2026-07-15 阅读器统一排版与分页回归修复（当前）

### Goal

实施已批准的 `docs/superpowers/specs/2026-07-15-moyuplus-reader-canonical-layout-regression-design.md`：移除 EPUB 出版物表现层，建立 MoyuPlus 唯一正文排版，并让 measure/render/preflight 使用一致的横纵双轴适配规则。

### Phases

- [x] R0：确认获批设计、工作区状态与不可覆盖的既有修改
- [x] R1：RED——sanitizer、sourceRevision 与语义保留测试
- [x] R2：GREEN——实现 EPUB 统一清洗边界
- [x] R3：RED——横向溢出矩阵、页数完整性与真实 reader-app harness
- [x] R4：GREEN——统一正文 CSS 与双轴分页判断
- [x] R5：回归——compile、unit、layout、package、diff check 与 VSIX 内容核对
- [x] R6：记录需用户在 Extension Development Host 中执行的真实 EPUB 人工复验
- **Status:** complete（2026-07-16 人工验收通过）

### Execution constraints

- 严格 RED → GREEN → REFACTOR；生产行为修改前必须观察对应测试因缺少目标行为而失败。
- 保留当前所有未提交的资源、导航、预览与布局修改；不重置、不清理、不自动提交或发布。
- 不扩大网络、CSP、ZIP、路径或资源安全边界；不改变 locator 文本模型。

### Error log

- 2026-07-15：首次更新计划误用了终端乱码后的文本作为补丁上下文，补丁校验失败；改为显式 UTF-8 读取并在稳定标题后插入，不重复该方式。
- 2026-07-15：首次真实 app GREEN 复验中，夹具仍声明第二章，导致末页“下一页”保持跨章可用，测试循环重复采集末页；已把该用例明确建模为单章完整 EPUB，从而验证真正的书末状态，不改变产品既有跨章导航语义。
- 2026-07-15：单章复验继续得到 `scrollHeight=340/clientHeight=318`，确认首次分页发生在 footer 挂载之前；已调整 Reader DOM 构建顺序，先稳定完整 grid 再测量。
- 2026-07-15：首次全量 layout 21/22，通过项覆盖所有新回归；唯一失败的旧 resize 用例绕过了 TXT/EPUB 均有的 `.moyuplus-book-content` 契约。已让独立 harness 对未包裹输入补齐真实适配器 wrapper，不放宽锚点断言。
- 2026-07-15：补齐 wrapper 后旧 progression 阈值仍受新页密度影响；改为直接断言重排前 UTF-16 页首位于重排后 `[startOffset,endOffset)`，与 Layout Engine 的明确契约一致且更严格。

## Reader v2 Phase 6 人工复测状态（2026-07-13）

- [x] 修复缩放后“下一页”偶发无响应
- [x] 修复返回书架后偶发不能恢复最后位置
- [x] 增加重排回调、退出原子保存、打开恢复 Locator 的自动测试
- [x] 完整构建与打包 `moyuplus-0.0.5.vsix`
- [x] 用户针对 TXT/EPUB 执行人工复测（2026-07-13 全部通过）
- **Status:** complete

## Goal
根据 `指导文档.md` 梳理并启动项目开发计划，形成可持续更新的阶段计划、发现记录和进度日志；在用户确认设计前不进行业务代码实现。

## Current Phase
Phase 4: 开发执行（实施计划 Phase 7 快捷键设置页与体验补齐已完成自动验证和人工验证，下一步进入 Phase 8）

## Phases

### Phase 1: 需求与项目发现
- [x] 建立计划文件
- [x] 阅读 `指导文档.md`
- [x] 盘点项目结构、技术栈和现有代码状态
- [x] 提取需求、约束、交付目标
- **Status:** complete

### Phase 2: 方案澄清与设计
- [x] 确认需求范围是否可作为单个开发阶段推进
- [x] 提出 2-3 个开发路径及取舍
- [x] 形成推荐方案
- [x] 等待用户确认设计
- [x] 编写正式设计规格
- **Status:** complete

### Phase 3: 实施计划
- [x] 将已确认方案拆解为可执行任务
- [x] 明确文件级改动范围、测试策略和验收标准
- [x] 输出实施顺序
- **Status:** complete

### Phase 4: 开发执行
- [x] Phase 0：初始化 TypeScript VS Code extension 项目骨架
- [x] 为 smoke-test command 增加最小单元测试
- [x] 增量验证：`npm run compile` 和 `npm test` 通过
- [x] Phase 1：数据模型与存储层
- [x] Phase 2：TXT 文件服务与导入命令
- [x] Phase 3：阅读器 Webview 基础版
- [x] Phase 4：DOM 动态分页
- [x] Phase 5：打字练习核心
- [x] Phase 6：Enter/Tab 路由与设置（自动验证和人工验证已完成）
- [x] Phase 7：快捷键设置页与体验补齐（自动验证和人工验证已完成）
- **Status:** in_progress

### Phase 5: 验证与交付
- [ ] 运行项目约定的测试、构建或检查命令
- [ ] 汇总变更、风险和后续建议
- [ ] 向用户交付结果
- **Status:** pending

## Key Questions
1. `指导文档.md` 中定义的核心目标、优先级和验收标准是什么？
   - 核心目标：本地 VS Code 插件，提供侧边栏 TXT 分页阅读器、TXT 行级打字练习、快捷键映射、本地持久化。
   - 核心约束：不联网、不上传文件；阅读与练习状态独立；不破坏 VS Code 原生编辑体验。
2. 当前仓库是否已有可运行的技术栈、脚本和测试体系？
   - Phase 0 前没有。当前已建立 TypeScript VS Code extension 骨架、`npm run compile`、`npm test` 和 Vitest 单元测试；当前目录已初始化 Git。
3. 是否需要先产出设计文档并由用户确认，再进入代码实现？
   - 是。根据 `brainstorming` 技能要求，业务代码实现前需要用户确认开发路线。

## Development Roadmap

### Recommended Path: MVP 垂直切片
1. [x] 初始化 TypeScript VS Code extension 项目骨架。
2. [x] 建立核心数据模型和本地存储层：导入 TXT 文件索引、全局文件列表、workspace 级阅读/练习状态。
3. [x] 实现文件导入与文件列表：支持工作区内外 TXT、UTF-8/GBK 编码、失效文件处理。
4. [x] 实现侧边栏阅读器 Webview：先完成基本渲染、字体设置、上一页/下一页，再接入 DOM 测量动态分页。
5. [x] 实现打字练习核心：练习文件选择、物理行进度、行内 ghost text、状态栏显示。
6. [x] 实现 Enter/Tab 路由与快捷键设置：优先保护 VS Code 原生行为，再启用组合动作（自动验证已完成）。
7. [x] 补齐快捷键设置页、异常处理和用户提示（自动验证已完成）。

### Alternative Path A: 快速原型优先
先实现一个最小可见 demo：单文件导入、阅读器分页、当前练习行提示。优点是最快看到效果；缺点是后期需要补状态边界和架构整理。

### Alternative Path B: 基础设施优先
先完整搭建 domain/storage/command/webview 通信边界和测试框架，再做 UI。优点是长期更稳；缺点是短期看不到完整体验。

### Recommendation
采用 MVP 垂直切片。它能尽早验证 VS Code Webview 分页和 Inline Completion 这两个技术风险，同时不会把全部功能一次性压进首版。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用文件化计划跟踪开发 | 当前任务是多阶段开发启动，需要在 `task_plan.md`、`findings.md`、`progress.md` 中保留上下文 |
| 在用户确认设计前不改业务代码 | `brainstorming` 技能要求先完成设计确认，避免基于未确认假设实现 |
| 推荐 MVP 垂直切片路线 | 文档需求较完整但当前无代码，垂直切片能同时验证插件骨架、Webview 分页、行内提示和状态存储 |
| 设计规格和实施计划已落盘 | 用户确认 MVP 路线后，已生成设计规格和分阶段实施计划 |
| Phase 0 采用 TypeScript + Vitest | 用最小测试先约束扩展 activation 和 smoke command，再实现可编译骨架 |
| Phase 1 使用独立 domain/storage 模块 | 让后续 UI、命令和 TXT 服务通过稳定接口读写状态，避免直接操作 VS Code state |
| Phase 2 TXT 文件服务与导入命令已完成 | 已接入文件读取、编码、导入/移除命令和失效检查 |
| Phase 3 阅读器 Webview 基础版已完成 | 已注册侧边栏 Webview View，接入导入文件列表、全文读取、翻页、字体大小和 ReaderSession 持久化 |
| Phase 4 DOM 动态分页已完成 | 阅读器 Webview 已使用隐藏 DOM 测量容器和二分测量替换固定字符估算，并接入 resize/font 变化后的重分页 |
| Phase 5 打字练习核心已完成自动验证和人工验证 | 已实现练习文件选择、物理行进度、Inline Completion ghost text、下一行/重置/跳转和状态栏菜单；人工验证发现首尾空白裁剪配置缺失，已补齐开关命令和菜单入口并复测通过 |
| Phase 6 Enter/Tab 路由与设置已完成自动验证和人工验证 | 已实现 `moyuplus.routeEnter`、`moyuplus.routeTab`、Tab 两种模式、Enter 组合行为、默认关闭且受限的 keybinding、VS Code Settings 高级配置和阅读器快捷设置入口；2026-07-10 用户确认人工测试全通过 |
| Phase 7 快捷键设置页与体验补齐已完成自动验证和人工验证 | Reader Webview 已提供插件内快捷键总览、Enter/Tab 开关、原生 Keyboard Shortcuts 编辑入口、风险说明、首次练习安全提示和文件异常恢复操作；界面遵循“原生、克制、可靠”的 VS Code 工具风格；2026-07-10 用户确认人工测试通过 |
| 从现在开始使用 Git | 用户已要求启动 Git，当前目录已执行 `git init`，后续可按阶段提交 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 读取技能文件时使用了错误路径 `C:\Users\Purvar\.agents\skills\planning-with-files\SKILL.md` 和 `...\brainstorming\SKILL.md` | 1 | 改用实际路径 `C:\Users\Purvar\.agents\skills\ok-skills\...` 成功读取 |
| `指导文档.md` 默认读取出现中文乱码 | 1 | 改用显式 UTF-8 读取 |
| `git status --short` 返回当前目录不是 Git 仓库 | 1 | 记录现状，后续计划不依赖 Git |
| 设计流程中的 commit 步骤不可执行 | 1 | 当前目录不是 Git 仓库，已记录原因，未强行初始化 Git |
| `npm install` 报告 node_modules 清理目录 EBUSY 警告 | 1 | 依赖安装成功，后续 `npm run compile` 和 `npm test` 均通过；该警告不影响当前 Phase 0 |
| Phase 3 reader 测试初次 GREEN 尝试中，Webview message callback 丢弃 Promise，导致测试无法等待异步状态写入 | 1 | 让 `onDidReceiveMessage` 回调返回 `handleMessage` Promise，测试和状态写入均可可靠等待 |
| 人工验证中 reader 视图被 VS Code 当作 Tree View，显示无数据提供程序 | 1 | 补充 package contribution 测试并在 `package.json` 添加 `type: "webview"` |
| 可视化伴侣首次启动误用了 Windows 系统的 WSL `bash.exe` | 1 | WSL 环境没有 `/bin/bash`；下一次显式使用 Git for Windows 的 `C:\Program Files\Git\bin\bash.exe` |
| 可视化伴侣脚本的服务随 owner process 退出，用户访问时出现 `ERR_CONNECTION_REFUSED` | 2 | 不再重复依赖该生命周期；改为隐藏启动独立 Python 静态服务，并通过 `127.0.0.1` 提供完整 HTML 预览 |

## Notes
- 每完成一个阶段后更新本文件。
- 发现新需求、约束或技术事实后同步更新 `findings.md`。
- 测试、错误和阶段动作记录在 `progress.md`。
- 设计规格：[docs/superpowers/specs/2026-07-08-moyuplus-design.md](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/specs/2026-07-08-moyuplus-design.md)
- 实施计划：[docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md)
- 下一步：进入 Phase 8 测试、打包与人工验收。

### Reader v2 Phase 6（2026-07-13）

- [x] 删除旧阅读栈并隔离只读迁移 shape
- [x] 完成隐私、错误脱敏和性能契约
- [x] 完成 compile、unit、layout、package 与 VSIX 内容审计
- [x] Extension Development Host / VSIX 人工验收
- **Status:** complete

- [x] 修复人工验收发现的 Reader 书架永久加载问题（`libraryReady` → `libraryState`）
- [x] 安装修复版 VSIX 后复验书架加载与阅读流程
- [x] 消除 Webview 启动握手竞态并增加主动 snapshot 与错误态
- [x] 安装 0.0.2 VSIX 后再次复验
- [x] 根据 Extension Host 日志修复 `createRequire(undefined)` activation 崩溃
- [x] 安装 0.0.3 VSIX 并确认书架加载
- [x] 修复移除确认框、阅读 requestId 与真实 EPUB 目录条目兼容
- [x] 增加 MoyuPlus 可诊断 Output 通道
- [x] 安装 0.0.4 VSIX，复验移除、TXT 阅读和真实 EPUB 导入
- [x] 安装 0.0.5 VSIX，复验缩放后翻页和 TXT/EPUB 阅读位置恢复

## 2026-07-10 阅读器重塑规划（当前）

### Goal
在保留 TXT 打字练习能力的前提下，把现有 MVP 重塑为以书架为入口、支持 EPUB/TXT 管理与 EPUB 章节阅读的本地 VS Code 阅读器，并形成经用户确认后才能进入实现的设计与实施路线。

### Current Phase
Reader v2 规划已完成；等待用户指示后从实施计划 Phase 1 开始开发。

### Phases

#### 新 Phase A：现状盘点与需求澄清
- [x] 记录用户提出的书架、EPUB、删除、章节导航、阅读位置和样式设置需求
- [ ] 盘点现有导入、存储、Reader Webview、打字练习及测试边界
- [x] 明确 EPUB 导入后的文件所有权与删除语义
- [x] 明确阅读器承载形态与分页/滚动交互
- [x] 明确隐私、样式设置与阅读进度作用域
- **Status:** complete

#### 新 Phase B：方案比较与总体设计
- [x] 提出 2–3 种演进方案及取舍
- [x] 定义统一 Book/Adapter/Library/ReaderSession 总体边界
- [x] 定义书架、目录、阅读区和设置区的信息架构
- [x] 定义失败提示、末页/末章反馈和恢复策略
- [x] 分节提交用户确认
- [x] 总体架构 v2 已获用户确认
- [x] 数据模型与 Adapter 合约已获用户确认
- [x] 侧边栏信息架构与交互状态已获用户确认
- [x] 运行时数据流、错误处理与隐私机制已获用户确认
- [x] 测试策略、重写阶段与验收标准已获用户确认
- **Status:** complete

#### 新 Phase C：设计规格与评审
- [x] 写入新的阅读器重塑设计规格
- [x] 完成规格评审并修订
- [x] 请求用户审阅规格
- **Status:** complete

#### 新 Phase D：实施计划
- [x] 在设计获批后拆分文件级任务、测试策略和验收标准
- [x] 明确分阶段迁移顺序，避免破坏现有 TXT 打字练习
- **Status:** complete

### 当前关键问题
1. EPUB 是复制到插件管理目录，还是仅保存原文件 URI？这会直接决定删除、失效恢复与可移植性。
   - 已确认：仅保存 URI；删除仅移除书架记录，不操作磁盘原文件。
2. 新主界面继续放在侧边栏窄 Webview，还是使用可获得更大空间的 Webview Panel/自定义编辑器？
   - 已确认：保持侧边栏，并把隐私性作为不可妥协的产品约束。
3. EPUB 阅读采用章节内滚动，还是章节内动态分页？
   - 已确认：采用章节内动态分页；跨章节自动衔接，并对书首/书尾给出明确反馈。
4. TXT 是否继续允许阅读，还是仅保留为打字练习来源？
   - 已确认：TXT 与 EPUB 均可阅读；打字练习仅支持 TXT。

### 约束
- 本轮只做规划；在用户确认设计前不修改业务代码。
- 保留现有 TXT 导入与打字练习能力，并通过适配器抽象迁移，而不是一次性推翻。
- 新设计必须显式处理最后一页、最后一章、无上一章/下一章等边界反馈。
- 用户选择整体重写路线，允许替换现有 Reader/TXT 专用阅读架构和测试；不以最小改动为目标。

### 本轮规划错误
- 可视化伴侣启动先后遇到错误 bash 与 owner process 退出；已改用独立本地静态预览服务。
- 两次大型规划补丁因上下文匹配失败而整体未应用；已拆分为小补丁并成功更新，未修改业务代码。
- 正式规格首次大型补丁因规划文件上下文匹配失败而整体未应用；确认规格文件未创建后，改为分离“状态更新”和“规格新增”补丁。
- 规格第 1 轮审查发现 4 个阻断问题；已完成定向修订，等待第 2 轮复审。
- 规格第 2 轮审查已通过；等待用户审阅正式规格。
- `writing-plans` 技能在当前会话不可用；采用等价的文件级、测试先行实施计划作为回退。
- 一次 Web `find` 调用因工具输入解析错误失败；改用官方页面 `open` 定位，未重复失败调用。
- Reader v2 实施计划首次大文件新增补丁因代码块内一行缺少补丁前缀而被拒绝，文件未创建；改为分块新增并逐段校验。

### Reader v2 Phase 2：Adapter
- [x] Adapter 合约与 Registry
- [x] TXT 编码、虚拟分章、Adapter 与练习源筛选
- [x] EPUB Archive 安全边界、package/nav/NCX 解析和 sanitizer
- [x] EpubAdapter、目标测试、全量测试、compile、diff check
- **Status:** complete；下一步进入 Reader v2 Phase 3

### Reader v2 Phase 3：Webview 与 Layout Engine
- [x] Webview-only 构建入口与 bundle 契约
- [x] Reader v2 消息协议和运行时守卫
- [x] ResourceManager 资源声明、Blob URL 与回收
- [x] 真实 DOM Layout Engine、分页边界、定位恢复与合并重排
- [x] Chromium Layout/隐私 Harness
- **Status:** complete；下一步进入 Reader v2 Phase 4

### Reader v2 Phase 4：书架、Reader Controller 与侧边栏应用

- [x] Task 4.1：LibraryService 导入、移除、重定位与失效扫描
- [x] Task 4.2：ReaderController 并发、状态与进度保存
- [x] Task 4.3：ReaderViewProvider v2 与严格 CSP
- [x] Task 4.4：书架页与 reducer
- [x] Task 4.5：阅读页、目录与设置抽屉
- **Status:** complete；Reader v2 Phase 4 全部任务已完成

#### Task 4.5 执行拆分（2026-07-10）
- [x] RED：阅读页状态、目录嵌套、Preferences 预览/保存/reset、边界能力测试
- [x] GREEN：阅读页工具栏、章节栏、正文分页与页脚
- [x] GREEN：目录/设置覆盖抽屉、窄宽度可访问模式
- [x] 回归：目标单测、全量单测、Chromium Layout/隐私、compile、diff check
- [x] 更新 Phase 4 完成记录与实施计划状态

## 2026-07-13 Git Log Reader 模式发布

- [x] 完成 Git Log Reader 模式实现与测试
- [x] 完成人工验收：切换、分页、设置、恢复、重载、异常、多根 workspace 和回归场景
- [x] 更新实施计划、README、CHANGELOG 和版本号
- [x] 生成并验证 0.0.6 VSIX
- [x] 提交代码、创建版本标签并推送
- **Status:** complete；0.0.6 已发布

## 2026-07-14 Git Log 内存缓存实施（当前）

### Goal
执行 `docs/superpowers/plans/2026-07-14-moyuplus-git-log-memory-cache-implementation-plan.md`，完成单条内存缓存、严格单飞刷新、缓存首帧、mode generation、生命周期释放与完整回归验证。

### Phases

- [x] Phase 0：确认基线并补齐可控异步夹具
- [x] Phase 1：查询模型、结果指纹与 Webview 白名单协议
- [x] Phase 2：严格串行刷新控制器
- [x] Phase 3：原子 Git session、Provider 缓存与生命周期
- [x] Phase 4：Webview 缓存首帧、刷新提示与代际防护
- [x] Phase 5：集成、资源上限与完整自动验证
- [x] Phase 6：人工验收（Extension Development Host）
- **Status:** complete；自动验证与人工验收均通过

## 2026-07-14 Reader / Git Log 回归修复（当前）

### Goal
修复三项人工验收回归：从书架进入 Git Log 不得错误恢复上次阅读位置；插件启动即 Git Log 后恢复阅读并返回书架时必须保留完整书架；空书架移除重复导入入口和异常“文”字标记。

### Phases

- [x] Phase R1：RED——补充宿主模式来源、启动恢复快照和空状态文案测试
- [x] Phase R2：GREEN——以最小改动引入可见阅读态并让恢复消息携带完整书架
- [x] Phase R3：GREEN——简化空书架 UI
- [x] Phase R4：回归——目标测试、全量单测、布局测试、编译和 diff 检查
- **Status:** complete；自动验证与人工验收均通过

## 2026-07-14 发布 0.0.7（当前）

- [x] 确认 Git Log 内存缓存与 Reader 回归修复人工验收通过
- [x] 版本号统一更新为 0.0.7
- [x] 更新 README、CHANGELOG 与实施记录
- [x] 执行完整 package 门禁并核对 VSIX 内容
- [x] 提交 0.0.7 代码与文档
- **Status:** complete

### Package verification

- `npm run package` 通过：39 个单测文件 182/182，Chromium 布局/隐私测试 15/15。
- 生成 `moyuplus-0.0.7.vsix`，包内版本为 0.0.7，共 8 个运行时条目，无源码、测试、计划、source map、lockfile 或书籍文件。
- VSIX SHA-256：`E13BD2B38790F13C834DD092159DC2B5F2DC8AC6A64ECCCF1DEC1D79F7E9F09A`。
- `vsce` 提示 manifest 缺少 repository 字段和 LICENSE 文件；与既有本地发布方式一致，不阻断 VSIX 生成，本轮不推断仓库 URL 或许可类型。

### RED evidence

- 宿主目标测试 15 项中新增 2 项按预期失败：书架进入 Git Log 后错误得到 `resumeTarget`；`modeReaderRestore` 缺少 `books`、`availability`、`progress`。
- 首次并行执行单测与布局测试时，单测非零退出使编排调用只返回单测输出；布局 RED 改为单独执行，不重复相同失败命令。
- 空书架 DOM 测试按预期看到旧标题、两个导入入口和 `.empty-mark`；启动恢复 DOM 测试按预期在返回书架后得到 0 个 `.book-row`。
- reducer 残留的 `emptyAction: importBook` 测试先按预期失败，移除后目标状态测试 9/9 通过。

### Confirmed behavior

- 阅读页进入 Git Log：退出后恢复原书与原位置。
- 书架进入 Git Log：退出后返回书架，不得使用 ReaderController 中的历史位置。
- 插件启动即 Git Log：若持久化了有效恢复目标，退出后恢复该书；随后返回书架时完整书籍必须存在。

### Execution constraints

- 严格 RED → GREEN → REFACTOR；每个新增行为先观察目标测试按预期失败。
- 保留用户改动；不重置、不清理、不自动提交。
- 缓存最多一条、active job 最多一个、pending snapshot 最多一个。
- 不手工编辑 Webview bundle；仅通过构建脚本生成。

### Error log

- 2026-07-14：首次读取技能文件遗漏 `ok-skills` 目录层级；已改用技能目录清单中的完整路径，未重复失败调用。

## 2026-07-15 阅读器资源、内部导航与分页边距实施（当前）

### Goal

执行 `docs/superpowers/plans/2026-07-15-moyuplus-reader-resources-navigation-layout-implementation-plan.md`，完成安全图片预览、内部 fragment 导航、会话撤回历史、工作区位置命令和四边一致且不裁切的分页布局。

### Phases

- [x] Phase 0：基线与测试夹具（基线通过；夹具按目标 RED 增量补充）
- [x] Phase 1：协议、Locator 与纯导航模型
- [x] Phase 2：EPUB 内部目标与安全图片声明
- [x] Phase 3：只读图片预览服务
- [x] Phase 4：Extension Host 资源校验与位置命令
- [x] Phase 5：Webview Navigator 与撤回 UI
- [x] Phase 6：分页边距与测量一致性
- [x] Phase 7：完整回归、文档、VSIX 与真实 Extension Development Host / EPUB 人工验收
- **Status:** complete（2026-07-16 人工验收通过）

### Execution constraints

- 严格 RED → GREEN → REFACTOR；每个新增行为先观察目标测试按预期失败。
- 保留未跟踪 `.superpowers/` 可视化文件；不重置、不清理、不自动提交实现代码。
- 不放宽零网络、CSP、ZIP、路径和过期响应安全规则。

### Error log

- 2026-07-15：首次结构读取错误假设 EPUB 文件位于 `src/adapters/epubAdapter.ts` 和 `src/epub/*`，命令因此失败；后续先用 `rg --files` 获取真实路径，再按返回路径读取，不重复该失败命令。
- 2026-07-15：Phase 5 复核时误把 Playwright 文件假设在 `src/test/layout`，并用不存在的顶层 `test` 目录过滤；已通过仓库级 `rg --files` 确认真正路径为 `tests/layout` 与 `tests/fixtures/layout`。
- 2026-07-15：Phase 5/6 首次全量单测暴露两个旧 integration fixture：命令清单缺少 undo，Enter 路由仍发送无关联旧 navigationState；已把 fixture 迁移到真实 v3 openBook/sectionReady/navigationState 流程。

## 2026-07-15 阅读器横向裁切与页码失效回归修复（当前）

### Goal

修复真实 EPUB 人工验收发现的横向内容被裁切、右边距视觉失效及页数误算；确保分页器对不可断行、预格式文本、宽表格和出版物布局样式保持完整、可读且页码可信。

### Phases

- [x] Phase R0：停止交付并确认人工验收失败
- [x] Phase R1：只读诊断并稳定复现横向溢出导致的页码误算
- [x] Phase R2：确定修复策略并完成设计门禁
- [x] Phase R3：RED——新增真实 Reader 横向溢出与页数回归测试
- [x] Phase R4：GREEN——内容约束、双轴测量与分页修复
- [x] Phase R5：全量自动回归与重新打包
- [x] Phase R6：真实 Extension Development Host 人工复验
- **Status:** complete（2026-07-16 人工验收通过）

### Confirmed failure

- 正常换行：`pageCount=9`，`scrollWidth/clientWidth=280/280`。
- `white-space: nowrap`：错误得到 `pageCount=1`，`scrollWidth/clientWidth=34228/280`。
- `<pre>`：错误得到 `pageCount=1`，`scrollWidth/clientWidth=24016/280`。
- 当前 `fits()`、渲染后修正和跨章预检只验证纵向溢出；Reader 布局测试未断言横向边界。

### Error log

- 2026-07-15：首次用 `node -e` 直接传递带引号脚本时被 PowerShell 原生命令参数转义破坏；改为 here-string 通过 stdin 传给 `node -` 后完成复现，不重复失败方式。

## 2026-07-16 MoyuPlus 统一设置面板实施

### Goal

实施已确认并通过评审的 `docs/superpowers/specs/2026-07-16-moyuplus-unified-settings-panel-design.md`：新增单例设置 WebviewPanel，整合阅读、Git Log、实验性打字练习与快捷键设置，移除 Reader/Git Log 原地设置抽屉，并保证严格协议、串行状态同步与实时视图更新。

### Phases

- [x] Phase S0：读取设计、项目约束与现有实现，确认以工作区最新规格为权威输入
- [x] Phase S1：RED/GREEN——消息协议、严格校验、快照与配置覆盖模型
- [x] Phase S2：RED/GREEN——单例面板生命周期、串行队列、命令/菜单与实时同步
- [x] Phase S3：RED/GREEN——设置 Webview 状态、四分区 UI、CSP 与响应式布局
- [x] Phase S4：RED/GREEN——Reader/Git Log 入口深链并删除原地设置抽屉
- [x] Phase S5：全量单测、布局/隐私测试、编译、构建与 diff 检查
- [x] Phase S6：人工验收回归——编辑器右键入口、快捷键无错误回显、滑块稳定和主题颜色
- **Status:** complete（2026-07-17）；自动验收与真实 Extension Development Host 人工验收均通过

### Execution constraints

- 严格 RED → GREEN → REFACTOR；每个生产行为先观察目标测试因缺失功能按预期失败。
- 规格文件存在用户/评审后的未提交修改；保留并以其最新内容为准，不回退、不覆盖。
- 不手工编辑 `media/*.js`/`media/*.css` bundle；只通过 `scripts/build.mjs` 生成。
- 不自动提交、推送或发布；保留未跟踪 `.superpowers/` 视觉伴侣产物。
- Webview 只允许 `mediaRoot` 本地资源，无网络、frame 或 media 能力；宿主消息必须严格白名单校验。

### Error log

- 2026-07-16：首次组合读取输出超过工具显示上限并被截断；后续改为按目标文件和行区间读取，不重复一次性输出整组大型源文件。
- 2026-07-16：首次同时追加三份规划文件时，`progress.md` 锚点因目标行并非文件尾而校验失败；已改为使用三份文件各自的真实末行分别追加。
- 2026-07-16：首次构建 settings bundle 时，`settingsApp` 通过 `shortcutSettings` 间接打包了 Extension Host 的 `vscode` 依赖，esbuild 拒绝浏览器 bundle；已将快捷键展示模型中的四个命令 ID 改为纯常量，保持值不变并切断 Host 依赖。
- 2026-07-16：切断 Host 依赖后的首次重构构建暴露调用方误用了不存在的 `getShortcutSettings` 名称；实际导出为 `createShortcutSettingsState`，已按真实 API 更正。
- 2026-07-16：扩展接入后首次 TypeScript 检查发现联合类型把 `settingsReady|retrySnapshot` 合在同一成员中而无法完整缩窄，且 VS Code `Thenable` 不能直接声明为原生 Promise；已拆分联合成员并用 `Promise.resolve` 适配。
- 2026-07-16：设置布局测试首次运行时 harness 只加载了 JS、遗漏独立生成的 `settingsApp.css`，导致响应式与 forced-colors 断言失败；已在测试夹具中显式加载发布样式文件。
- 2026-07-16：首次全量单测发现激活命令清单 fixture 尚未包含新增的 `moyuplus.openSettings`；实际注册行为正确，更新契约预期后全量 231/231 通过。
- 2026-07-17：人工验收发现入口位置、快捷键静态回显、滑块整页重绘和背景色应用四项问题；按修订设计完成 TDD 修复，最终 236/236 单测、36/36 布局测试及人工复验通过。

## 2026-07-17 沉浸阅读书架状态同步实施

### Goal

实施已确认并已提交的 `docs/superpowers/specs/2026-07-17-moyuplus-immersive-shelf-sync-design.md`：以会话协调器和持久化进度为权威，让书架可靠显示活动沉浸书籍的“停止阅读”动作，并在统一停止流程后刷新最新已保存进度。

### Phases

- [x] Phase I0：读取设计、技能约束、仓库状态与现有沉浸实现
- [x] Phase I1：RED/GREEN——严格停止协议、权威书架状态与 revision reducer
- [x] Phase I2：RED/GREEN——协调器停止结果、保存失败清理与统一 Provider 停止入口
- [x] Phase I3：RED/GREEN——串行 dirty/revision 快照调度与生命周期竞态
- [x] Phase I4：RED/GREEN——书架“停止阅读”交互与危险动作样式
- [x] Phase I5：全量 Vitest、Playwright、TypeScript、构建与 diff 检查
- **Status:** complete（2026-07-17 自动验收与真实 Extension Development Host 人工验收均通过）

### Execution constraints

- 严格 RED → GREEN → REFACTOR；每项生产行为先观察目标测试因功能缺失而失败。
- 当前工作树包含尚未提交的沉浸阅读及设置面板实现；全部视为用户改动并在其上增量实施，不回退、不清理。
- 不手工编辑 `media/*.js`、`media/*.css` 或 source map；仅由构建脚本生成。
- 不新增轮询、定时刷新或逐页书架重绘；隐藏、Reader 与 Git Log 模式只标记 dirty。
- 不自动提交、推送、发布或生成 VSIX。

### Error log

- 2026-07-17：首次并行读取技能、规格和仓库清单超过 10 秒默认编排时限；后续改为分组读取并显式提高单命令时限，不重复原调用。
- 2026-07-17：首次同时追加三份实施记录时，`findings.md` 的锚点文本与真实文件尾不一致，补丁整体未应用；已分别读取三份文件真实尾部并改用准确锚点。
- 2026-07-17：首次读取 Reader 样式时错误假设源文件为 `src/webview/readerStyles.css`，导致并行编排非零退出；后续先用文件清单定位真实样式路径，不重复错误路径。
- 2026-07-17：首次向测试 fixture 与声明文件合并追加 `loadActiveShelf` 时，把 TypeScript 全局声明锚点错误放在 HTML 补丁中，补丁整体未应用；已按真实文件边界拆分并成功追加。
- 2026-07-17：首次全量 Playwright 为 32/39；7 项真实 Reader App 用例均因旧 `reader-app-harness.html` 的启动 `libraryState` 缺少新增必需 revision 而停在 boot，并非生产逻辑回归。已迁移该 fixture 后按目标文件复测。
- 2026-07-17：用于确认无轮询的组合 `rg` 检查因第二个查询按预期零匹配返回退出码 1；结果已确认生产代码无 `immersiveState`、无新增 interval/timeout，后续独立执行非空/空匹配检查。
- 2026-07-17：首次并行运行全量 Vitest 与 `npm run compile` 时，两者的 build contract/构建脚本同时清理并生成 `out/`，导致 1 项 bundle 加载测试短暂找不到 `out/extension.js`；其余 263 项通过。该并行方式对共享构建目录不安全，改为先 compile、后全量单测串行复验。

## 2026-07-23 打字练习整体架构重置

### Goal

按已确认设计完成七个工作包，使新 typing 系统成为唯一实现，并满足领域、Adapter、Extension Host、Playwright、性能和人工验收门槛。

### Phases

- [x] WP1：契约、Coordinator 骨架与架构守卫
- [x] WP2：素材系统与 ContentCatalogStore
- [x] WP3：纯领域内核、长期结果与全局投影
- [x] WP4：workspace 会话与原生编辑器适配
- [x] WP5：独立 Typing View、Reader Bridge 与配置入口
- [x] WP6：旧版迁移与正式切换
- [ ] WP7：完整验收与旧 stack 删除
- **Status:** implementation_in_progress

### Detailed plan

- `docs/superpowers/plans/2026-07-23-moyuplus-typing-practice-architecture-reset-implementation.md`

### Execution constraints

- 严格 RED → GREEN → REFACTOR；每项生产行为先观察目标测试因功能缺失而失败。
- Domain/Application 不导入 `vscode`、Node 文件系统或 Webview；跨模块只走公开入口。
- 当前工作树已有用户改动与未跟踪文件，全部保留；不重置、不清理、不自动提交或发布。
- 七个工作包全部完成前，不把中间阶段描述为最终交付。

### WP4 exit evidence（2026-07-24）

- workspace stores、pending Result、lease/heartbeat、内存 FSP、锚点、DocumentChange/IME、Decoration、workspace editor/restore 与 Reader scheme 排除均已完成自动验证。
- 真实 VS Code host 已覆盖 document change/save、内存 URI 打开、editor 关闭及 Backspace/Delete/Undo/Redo/Enter/Tab 六命令；新注册仍保持旁路，未与旧 stack 双监听。
- Vitest 83 文件 367/367、严格 TypeScript、extension/Reader/Settings build、隔离 Extension Host 和 `git diff --check` 通过。
- 用户已运行 `npm run test:typing-ime-manual`，使用 Windows 微软拼音完成固定长句稳定上屏并确认“微软拼音冒烟通过”；WP4 全部退出条件满足，下一步进入 WP5。

### WP5 current slice（2026-07-24）

- 已建立独立、版本化且严格校验的 Typing View 协议、只读 shell 查询边界、View Provider、Activity Bar 贡献和七页 Webview 骨架；UI 不直接依赖工作包 3/4 的 Store 实现。
- 已批准设计与 `.impeccable.md` 提供完整目标用户、使用场景和“原生、克制、可靠”的视觉上下文，无需重新发散设计。
- 当前扩展中的 `shellSnapshot` 仍只返回固定导航数据、`activeSessionStatus: null` 与 `pendingResultCount: 0`；它是旁路 UI 壳，不代表页面业务已经接通。
- 当前门禁：聚焦 6 文件 23/23；全量 Vitest 87 文件 377/377；严格 TypeScript；extension、Reader、Settings、Typing bundles；`git diff --check` 全部通过。
- **停止检查点：** 2026-07-24 按用户要求停止工作。恢复时从 WP5 Application 查询适配器与 materials 页面数据开始，再按 setup/live/result/history/mastery、Reader Bridge、活动会话冲突、配置入口和端到端验收的顺序推进；WP5 不得标记 complete。
- **恢复进展：** 已新增只读 `TypingViewApplicationQuery`，把内置 manifest 与全局 `ContentCatalogStore` 投影为严格 materials 快照，并由真实 extension activation 注入；旧固定 shell query 已移除。
- materials 页面已具备安全渲染、原生主题紧凑列表、内置/用户分区、动作入口、来源/计数/估时与空状态；当前动作尚未接入命令，其他页面显式标记 `unavailable`。
- 当前门禁更新为：全量 Vitest 89 文件 382/382；严格 TypeScript；完整 extension、Reader、Settings、Typing bundles；`git diff --check` 全部通过。
- **下一断点：** materials 选择/自由粘贴/TXT/EPUB 命令与刷新 → setup 查询/表单 → live/result/history/mastery；WP5 继续保持 `in_progress`。

### Error log

- 首次并行读取因 Git dubious ownership 使整体编排失败；后续仅给单次 Git 命令传 `-c safe.directory=...`。
- 首次 TDD 技能路径缺少 `ok-skills`；已按技能清单修正。
- 设计整文件读取被输出上限截断；已按行分段读取完整内容。
- 首次三文件追加的 `progress.md` 尾部锚点不精确，补丁整体未应用；已改为分文件精确追加。
- 继续 WP3 时首次向 `findings.md`/`progress.md` 追加恢复记录复用了错误的跨文件尾部锚点，补丁未应用；已读取各文件真实尾部后分别使用精确锚点。
- 读取 Vitest 配置时把 `vite.config.*`/`vitest.config.*` 通配模式直接传给 Windows `rg`，命令在完成所需源文件读取后以无效路径退出；后续先用 `rg --files` 定位配置文件，不重复该调用。
- 首次合并 Coordinator/Runtime 契约补丁时假设 `application/index.ts` 的导出顺序与真实文件相反，导致整批补丁未应用；已读取真实入口与相邻文件后拆成小补丁，避免再次使用错误锚点。
- WP3 首次严格类型检查发现 `resume()` 在 structured clone 后未保留已缩窄的 `pausedAtMonotonic` 类型；已在 guard 后捕获局部常量，保持运行时行为不变并通过 `tsc --noEmit`。
- 将 wordKey 接入 Mastery 后，原 scorer 测试从 grapheme 变成 word 而失败；根因是单一观察维度丢失字符事实。已改为错误同时投影 grapheme 与有意义的 word 上下文，并用“你好/好”场景分别验证两个维度。
- WP3 最终全量 Vitest 首轮 333/334；唯一失败是 Windows 返回 `settingsApp.js.map` 存在 user-mapped section，build contract 的 esbuild 无法覆写。其余测试通过；后续改为先独立 build、再单独复测 build contract，不重复同一全量调用。
- 2026-07-24：恢复 WP4 时首次读取 `planning-with-files`/`test-driven-development` 技能遗漏 `ok-skills` 路径段；已按技能目录清单改用完整路径，不重复错误路径。
- 2026-07-24：首次组合执行递归文件查询、`git status` 和分支读取超过 30 秒；已改用窄文件过滤与 `git status --untracked-files=no`，不重复该宽查询。
- 2026-07-24：读取 Catalog 测试时误判文件名为 `typingContentCatalogStore.test.ts`；已用 `rg --files` 定位真实文件 `contentCatalogStore.test.ts`，不重复错误路径。
- 2026-07-24：停止前文档核对命令把 Markdown 反引号放进 PowerShell 双引号模式，触发“字符串缺少终止符”；已改为不含反引号的单引号检索模式，不重复该组合。
- 2026-07-24：WP4 首个 Vitest RED 启动超过 30 秒工具时限，仅输出 runner banner、未到达收集结果；后续保持同一测试输入但提高单文件执行时限，不把超时误记为契约 RED。
- 2026-07-24：Practice FileSystemProvider 首次严格编译发现 listener 集合声明为 `readonly FileChangeEvent[]`，与 VS Code `Event<FileChangeEvent[]>` 的可变数组签名不兼容；已按官方公开签名收紧集合类型，不改变运行时行为。
- 2026-07-24：Typing Decoration 首轮 GREEN 在注入测试 host 时仍直接构造 `vscode.ThemeColor`，shim 无该运行时构造器；已把主题色解析纳入 host 边界，生产 host 仍使用真实 ThemeColor，测试无需伪造 VS Code 全局。
- 2026-07-24：读取旧快捷键测试时误判存在 `shortcutRouter.test.ts`；已用 `rg --files` 确认仓库只有 `shortcutSettings.test.ts`，旧 Router 行为由其他集成测试覆盖，不重复错误路径。
- 2026-07-24：Workspace Editor 首轮 GREEN 的测试用 `toMatchObject({blockedText: undefined})` 要求 JSON 中显式保留 undefined 键；实际序列化按规范省略该可选字段。已改为读取后单独断言属性值为 undefined，不修改生产持久化格式。
- 2026-07-24：Extension Host runner 首次在 Windows 通过 `shell:true` 启动含空格的 `code.cmd`，路径被截断；已改为无 shell 直接 spawn `Code.exe`。
- 2026-07-24：Extension Host 中 editor 已关闭不等于 TextDocument 已立即释放；测试改为断言 editor 不再可见，close event 委托与 detach 由确定性 contract 测试覆盖。
- 2026-07-24：独立 Extension Host runner 最初使用 `.test.ts`，被全量 Vitest 当作 0-test suite 收集；已改为普通 `.ts` runner 并复验 82/82 文件。
- 2026-07-24：恢复 WP5 时沙箱 PATH 不含 `npx`，首次目标测试未启动；改用工作区自带 Node 直接执行项目 Vitest 入口，未修改依赖或全局环境。

### WP5 materials command slice（2026-07-24 继续）

- [x] 恢复既有设计、实施计划、工作区状态与 WP5 断点
- [x] RED：严格素材动作协议、Provider 命令路由与刷新
- [x] GREEN：素材选择、自由粘贴、TXT/EPUB 命令端口与真实 activation 注入
- [x] REFACTOR/VERIFY：Webview 交互、聚焦回归、全量检查与证据更新
- **Current design decision:** Webview 只发送严格动作消息；Provider 通过注入命令端口调用 Application/Adapter 能力。选择与自由粘贴成功后进入 `setup`，TXT/EPUB 导入后留在 `materials` 并重新查询 catalog。
- **Result:** complete。下一切片进入 setup 查询/表单；WP5 总状态仍为 `in_progress`。

### WP5 setup query/form slice（2026-07-24 继续）

- [x] RED：setup 查询、严格协议、表单渲染、草稿配置与 Provider 路由
- [x] GREEN：Content Provider inspect、全局偏好默认值、五轴表单与 Application 草稿更新
- [x] TDD 补强：真实 activation 注入和纯表单转换均先撤回未覆盖接线、观察 RED 后重接
- [x] VERIFY：聚焦 7 文件 32/32、严格 TypeScript、完整 extension/Reader/Settings/Typing build
- **Current boundary:** 应用本次设置只更新 `PracticeSetupDraft` 中的 `PracticePlan + SourceRange`；尚未 prepare/start，不会静默覆盖活动会话，也不会修改全局默认偏好。
- **Result:** complete。下一切片先接入 prepare/start 与活动会话冲突选择，再实现 live 查询和暂停/重启/结束命令；WP5 总状态仍为 `in_progress`。

### 本轮新增错误日志

- 首次读取 `brainstorming`/`test-driven-development` 技能时遗漏 `ok-skills` 路径段；已按技能清单改用完整路径，不重复错误路径。
- 首次 Git 状态读取未带单次 `safe.directory`，触发 dubious ownership；后续仅为单次 Git 命令传入安全目录，不修改全局配置。
- 首次组合读取素材领域文件时误判存在 `src/typing/domain/content/material.ts`，并把 Windows 不支持的 `**` 路径模式直接传给 `rg`；已用 `rg --files` 定位真实入口为 `src/typing/domain/content/index.ts`，后续不重复错误路径或通配写法。
- 首次向三份工作记忆文件追加本轮记录时复用了早先日志中的非尾部锚点，补丁未应用；已读取真实文件尾部并分别使用精确锚点。
- 首次直接调用 `node` 运行 RED 时沙箱 PATH 仍无 Node；已通过桌面工作区依赖清单取得固定 Node 路径，后续验证均使用该路径。
- 首轮严格 TypeScript 发现 bootstrap 联合类型把 `typingReady|retrySnapshot` 合在同一成员中，控制流无法排除该成员；已拆成两个等价判别成员，不改变协议线格式。
- 真实 activation TXT GREEN 首轮使用 shim `Uri.fsPath` 作为临时存储根，Windows 测试 shim 会保留额外前导斜杠，导致测试写入目录失真；已让测试上下文直接提供真实临时 `fsPath`，生产仍使用 VS Code `globalStorageUri.fsPath`。

### WP5 prepare/start slice（2026-07-24 恢复）

- [x] 恢复既有实施计划、工作日志和工作树状态
- [x] RED：prepare/start、活动会话冲突选择和 live 查询/命令契约
- [x] GREEN：真实 Application/View/editor 接线与 live 控制
- [x] REFACTOR/VERIFY：聚焦回归、全量门禁与证据更新
- **Current boundary:** 单 Extension Host 内的 start/pause/resume/restart/finish、冲突三选一和 live 事实已完成；多窗口 lease 尚未进入 start 前的原子争抢，不能把 WP5 活动会话冲突整体标记 complete。
- **Result:** 当前子切片 complete；WP5 总状态仍为 `in_progress`。下一切片先解决预分配 session ID + start 前 lease acquire/heartbeat/release，再进入 result/history/mastery 页面。

### 本次恢复错误日志

- 首次按技能清单根目录读取三个技能时遗漏实际存在的 `ok-skills` 路径段；已改用完整路径，不重复错误调用。
- 首次组合执行 Git 状态/历史时未带单次 `safe.directory`，触发 dubious ownership；后续继续只为单次 Git 命令传入安全目录，不修改用户全局配置。
- 首次向三份工作记忆文件追加恢复记录时，误用了 `findings.md` 中不存在的标题作为跨文件补丁锚点，补丁整体未应用；已读取三文件真实尾部，改用独立精确追加。
- 搜索 WP4 组装入口时误判存在 `src/typing/adapters/index.ts`，组合读取因此以文件不存在退出；已确认公开入口分别是 `src/typing/index.ts`、`src/typing/adapters/*/index.ts` 与 `src/typing/registration/index.ts`，后续不再读取不存在的聚合文件。
- 首轮全量验证前用 `rg` 从 `package.json` 提取脚本时，PowerShell 参数转义把正则破坏为未闭合字符类；所需全量 Vitest 仍已执行。后续改用 `Select-String` 的多个简单模式读取脚本，不重复该正则。

### WP5 多窗口 Session Lease 原子装配（2026-07-24 继续）

- [x] RED：Coordinator 必须在 runtime 前 acquire；竞争失败不得创建/打开 Session；启动失败释放；完成释放；重启原子换绑
- [x] GREEN：新增 Application Lease Port、`practiceStartBlocked` 事件、workspace lease/检查点适配器与真实 activation 装配
- [x] HEARTBEAT：acquire 后启动续约，transition 时无释放窗口地换绑，完成与扩展 dispose 时尽力释放
- [x] VERIFY：聚焦 5 文件 30/30；全量 93 文件中 92 文件 425 项通过，既有 Windows `catalog.lock` 瞬时 `EPERM` 文件独立复验 6/6；严格 TypeScript 与完整 build 通过
- **Current boundary:** 同一 workspace 的第二个 Extension Host 无法越过原子 lease 创建可写 Session；超时 lease 可由 Store 接管，但“接管后恢复旧检查点”的专用 UI 流程仍留待后续端到端验收切片。
- **Result:** lease 原子装配子切片 complete；WP5 总状态仍为 `in_progress`。下一切片进入 result/history/mastery 只读事实页面。

### 本次 lease 切片错误日志

- 首次严格类型检查误用了不存在的 `pnpm type-check` 脚本，`pnpm` 将参数解释为依赖操作并把 13 个已有依赖移入 `node_modules/.ignored`；进程超时后已逐项验证目标并原位恢复，随后改用固定 Node 直接运行 `node_modules/typescript/bin/tsc -p . --noEmit`。
- 全量 Vitest 的唯一失败仍是既有 `ContentCatalogStore` 并发锁在 Windows 临时目录收到瞬时 `EPERM`；目标文件立即独立复验 6/6，通过且未修改无关锁实现。

### WP5 Result / History / Mastery 只读事实页（2026-07-24 继续）

- [x] 恢复详细实施计划、设计约束、三份工作记忆与工作树状态
- [x] RED：Application 查询、严格协议、Provider 刷新与三页渲染
- [x] GREEN：只读复用 WP3 Result/History/Daily/Mastery Store，不在 View 层复制事实
- [x] REFACTOR/VERIFY：聚焦回归、全量门禁与证据更新
- **Current boundary:** 本切片只完成结果、历史和掌握度的只读事实投影与页面；不提前实现 Reader Bridge、全局配置写入或旧检查点接管 UI。
- **Result:** complete。WP5 总状态仍为 `in_progress`；下一切片处理超时 lease 接管后的旧检查点恢复 UI。

### 本次继续推进错误日志

- 首次读取技能时再次遗漏 `ok-skills` 路径段；已按技能清单修正，后续不重复错误路径。
- 首次组合 Git 状态未带单次 `safe.directory`，触发已知 dubious ownership；后续仅用单次命令参数，不修改全局 Git 配置。
- 首次筛选 WP5 文件时把 Windows 不支持的 `src/webview/typing*` 直接作为 `rg` 路径；后续只使用 `rg --files` 输出后再过滤。
- **Current implementation:** 协议 v4 已加入 result/history/mastery 严格事实 DTO；Query 使用窄只读 Port；真实 activation 复用 Coordinator 的 ResultStore 并装配三个 Projection Store。
- **Verification:** 关联 7 文件 44/44；全量 93 文件中 92 文件 430 项通过，唯一既有 Windows `catalog.lock` 瞬时 `EPERM` 独立复验 6/6；严格 TypeScript、完整 build 和 `git diff --check` 通过。

### WP5 超时 Lease 旧检查点恢复 UI（2026-07-24 继续）

- [x] 恢复详细实施计划、设计约束、三份工作记忆与工作树状态
- [x] RED：可恢复检查点查询、严格协议、显式恢复/暂不恢复动作与竞态
- [x] GREEN：Application/Workspace 恢复端口、Provider 路由和真实 activation 装配
- [x] REFACTOR/VERIFY：聚焦回归、全量门禁与证据更新
- **Current design decision:** 宿主投影可接管的旧检查点；Webview 只展示显式“恢复 / 暂不恢复”选择；恢复动作必须先原子取得同一过期 session 的 lease，再打开旧会话，失败时刷新权威状态且不产生可写副作用。
- **Result:** complete。恢复后把旧 monotonic 时间轴平移到当前进程并先保持暂停；WP5 总状态仍为 `in_progress`，下一切片进入 Reader Bridge。
- **Verification:** 聚焦 10 文件 62/62；最终全量 Vitest 94 文件 442/442；严格 TypeScript；完整 extension/Reader/Settings/Typing build；`git diff --check` 通过。Playwright 沙箱外全量 38/39，唯一既有设置页初始焦点时序用例独立复验 1/1。

### 本次恢复错误日志

- 首次向 `task_plan.md` 追加本切片时使用了被前一条工具输出截断的尾部文本作为锚点，补丁未应用；已重新读取真实文件尾部并改用精确锚点。
- 首次组合检索把 Windows 不支持的 `typingView*.test.ts` 直接传给 `rg`，命令在输出目标内容后以无效路径退出；后续用 `rg --files` 过滤真实文件。
- 首次读取活动状态实现时误判文件位于 storage adapter；实际为 `src/typing/adapters/view/ActivePracticeStateStore.ts`，已用文件清单定位。
- 协议 v5 首次严格类型检查把 `recoverPractice|dismissRecovery` 合并为一个联合成员，导致 Provider 无法完全缩窄到 import 分支；已拆成两个判别成员。
- 首次架构/diff 组合检查的 PowerShell 正则引号未闭合；已改为简单单引号模式，未重复失败命令。
- Playwright 首轮在沙箱内 39 项全部因 Chromium `spawn EPERM` 未启动；获准在沙箱外运行后 38/39，唯一设置页焦点时序用例独立复验通过。

### WP5 Reader Bridge（2026-07-27 继续）

- [x] 恢复详细实施计划、设计约束、工作树与 Reader/Typing 公开边界
- [x] RED：Reader Book Content Provider、locator 字段收窄、真实书架入口
- [x] GREEN：安全 Book Adapter 投影、setup 草稿/聚焦和真实 activation 装配
- [x] HARDEN：失效来源转交 Reader 重新定位；冷启动 setup 竞态
- [x] VERIFY：全量 Vitest、严格 TypeScript、四目标 build 与 diff 检查
- **Current boundary:** Reader 只发送 book ID 和可选 locator；Typing 只保存 recipe 与推荐章节。正文由宿主 Provider 读取，阅读进度不被绑定或回写，失效来源由 Reader 的既有命令重新定位。
- **Result:** Reader Bridge 子切片 complete；WP5 仍为 `in_progress`。下一切片进入语言/默认偏好配置入口，再完成三条 feature-gate 端到端与可访问性验收。

### 本次 Reader Bridge 错误日志

- 首次读取 `brainstorming`/TDD 技能仍遗漏实际 `ok-skills` 路径段；已立即按技能目录修正。
- 首次 Git 状态/历史组合命令未带单次 `safe.directory`，触发已知 dubious ownership；后续只使用单次 Git 参数。
- 首次读取 Node 路径与脚本的组合命令超时；已通过桌面工作区依赖清单取得固定 Node 路径，未安装或改动依赖。
- 首轮 Reader Book 计数断言人工计算错误；领域计数器实际返回 38 字素、6 汉字、4 英文词、32 可打印单元，已修正测试数据而未修改正确的领域算法。
- 首轮全量 Vitest 的唯一失败仍是既有 Windows `catalog.lock` 瞬时 `EPERM`；目标文件随后独立复验 6/6。

### WP5 语言与默认偏好配置入口（2026-07-27 继续）

- [x] 恢复详细实施计划、设计约束、三份工作记忆与工作树断点
- [x] RED：练习语言配置桥、显式“设为默认”命令与真实 activation 契约
- [x] GREEN：只写 `moyuplus-practice` 语言覆盖；全局默认只经 `PracticePreferencesStore`
- [x] VERIFY：聚焦回归、全量门禁、构建与 diff 检查
- **Current design boundary:** setup 表单覆盖继续只进入当前 `PracticePlan`；只有显式“设为默认”才保存全局练习偏好。字体、字号、行高和字距通过练习语言配置桥写入，不向原生编辑器注入 CSS。
- **Result:** complete。WP5 总状态仍为 `in_progress`；下一切片先补齐 recent 只读事实页，再完成三条 feature-gate 端到端与可访问性矩阵。

### 本次配置入口错误日志

- 首次组合 Git 状态/历史未带单次 `safe.directory`，触发已知 dubious ownership；后续仍只对单次 Git 命令传入该参数。
- 首次跨目录搜索把 PowerShell 不接受的 `src/test/unit/typing*` 作为路径传给 `rg`，在已有输出后以无效路径退出；后续只用 `rg --files` 获取真实测试路径。
- 首次向三份工作记忆同时追加本切片时，`findings.md` 的锚点文本与真实尾部有细微差异，导致补丁整体未应用；已分别读取真实尾部后改用精确锚点。
- 读取 View 命令实现时误判文件位于 `src/typing/adapters/view/TypingViewPracticeCommands.ts`；真实文件位于 `src/typing/application/TypingViewPracticeCommands.ts`，后续按公开目录定位。
- 首次使用普通 `npm` 执行 RED 时沙箱 PATH 中无 npm；已通过桌面工作区依赖取得固定 Node 路径，后续直接调用本地 Vitest/TypeScript。
- 首次全量 Vitest 使用 30 秒命令时限，测试仍在正常通过过程中被编排超时终止；后续改用足够覆盖完整套件的 120 秒时限，不重复 30 秒全量调用。
- 首次真实 Extension Host 在沙箱内启动时因注册表、GPU 与窗口进程权限失败；获准在沙箱外运行后 Extension Host 正常退出码 0。

### WP5 Recent 只读事实页（2026-07-27 继续）

- [x] RED：Recent 查询、严格协议和渲染先暴露 `unavailable`、v6 与错误内容分支
- [x] GREEN：从不可变 Result 事实投影最近 20 条摘要，补齐真实空状态和安全渲染
- [x] VERIFY：聚焦回归、真实 activation、严格 TypeScript、全量测试与四目标构建
- **Current boundary:** Recent 只读取 Result Store，按结束时间倒序投影 material ID、source revision、profile、结果、耗时和核心指标；不向 Webview 暴露正文、路径或 Store 写能力。当前 Result schema 不包含完整 ReplayDescriptor、来源标题与范围，因此本切片不伪造“再次练习”动作。
- **Result:** complete。七个 Typing View 页面均已具备真实事实或明确空状态；WP5 仍为 `in_progress`。下一断点为素材、书架、自由练习三条 feature-gate 端到端与窄侧栏/主题/高对比/键盘/ARIA 可访问性矩阵。

### 本次 Recent 错误日志

- 首次检索假设存在 `tests/layout/typing-layout.spec.ts` 与 Typing Playwright harness；文件清单确认当前仓库没有对应路径，后续端到端切片需从现有测试基础设施建立真实 harness。
- Recent 渲染首版补丁引用了仓库中不存在的 `emptyState`、`formatDate` 和 `formatNumber` helper；在执行验证前已对照现有渲染器改为 `renderEmptyGuidance`、`formatDateTime` 和 `formatMetric`。

### WP5 Feature Gate 与可访问性验收（2026-07-27 继续）

- [x] 恢复详细实施计划、设计基线、技能约束和工作树断点
- [x] AUDIT：只读检查三条真实链路、窄侧栏、主题/高对比、键盘和 ARIA
- [x] RED：把审计确认的缺口固化为预期失败测试
- [x] GREEN：完成最小修复和聚焦回归
- [x] VERIFY：全量测试、四目标构建、真实 Extension Host、Playwright 与 diff 门禁
- [x] DOCS：更新详细实施计划及三份工作记忆
- **Current boundary:** 不新增产品行为；只完成已批准 WP5 的 feature gate 与可访问性退出矩阵。任何生产修复都必须先观察目标测试失败。
- **Status:** complete。WP5 状态已更新为 `complete`，下一阶段进入 WP6。

### 本次 Feature Gate / A11y 错误日志

- 首次组合只读命令中，目标计划的快速过滤未命中导致命令整体退出 1，同时 Git 因 dubious ownership 拒绝状态查询；后续改用实际路径枚举与单次 `git -c safe.directory=...`。
- 首次尝试同时追加三份工作记忆时使用了不属于 `task_plan.md` 的进度日志锚点，补丁验证失败且未修改文件；后续分别读取真实尾部并使用精确锚点。
- 首次 A11y 扫描把 `src/webview/typing*` 作为 Windows 路径传给 `rg`，触发无效路径错误；后续使用 `rg --files` 返回的真实文件名或显式文件列表。
- 首次 RED 大补丁因协议测试用例标题与推断锚点不一致而整体未应用；随后拆分为新增文件与逐文件精确补丁。
- 首次本地测试启动使用 `.cmd` 且 PATH 中无 Node，测试未执行；后续使用桌面工作区提供的固定 Node 可执行文件。
- Typing Playwright 首次在沙箱内启动 Chromium 收到 `spawn EPERM`；按既有验证方式在获准的沙箱外运行。
- 窄栏 RED 首版 material ID 超过协议安全长度，消息被正确拒绝而未进入布局断言；夹具已缩到合法但仍足以触发长词溢出的长度。
- 粗指针 GREEN 首次仍报两个 0px 控件，定位后确认它们位于 `hidden` 的粘贴表单；测试已排除不可见元素，只检查实际可交互目标。
- 书架 feature-gate 首次使用 shim `Uri.file(C:\...)` 生成错误的 `D:\C:\...` 存储路径；已改用仓库既有的 `{ fsPath } as Uri` 临时存储夹具。
- 扩展 Playwright 七页面矩阵时，`getByLabel('范围')` 同时命中“完成所选范围”，随后 exact locator 又因 select 的 accessible name 包含 option 文本而未命中；改为按 name 定位并断言 accessible name 前缀。

### WP6 旧版迁移与正式切换（2026-07-27 继续）

- [x] DISCOVERY：盘点旧 session key、旧公共命令、旧 Controller/Inline Completion/状态栏和注册入口
- [x] RED/GREEN：LegacyResumeHint、旧 session 失败安全迁移与幂等 marker（5/5）
- [x] RED/GREEN：旧公共命令薄别名与弃用适配器（3/3）
- [x] RED/GREEN：activation 迁移、旧装配切断与唯一注册守卫（2/2；聚焦合计 10/10）
- [x] RED/GREEN：安全恢复提示协议、确认/忽略 UI 与 Host 路由（5/5）
- [x] RED/GREEN：package 旧命令面板、全局 Tab 键位与旧设置收口（2/2）
- [x] GREEN：真实 activation 恢复提示确认、来源可用性复核与新版 setup 预选
- [x] GREEN：完成迁移适配、正式切换与回退检查点（迁移 7/7；切换聚焦 10 文件 70/70）
- [x] VERIFY：聚焦/全量自动化、真实 Extension Host、构建与 diff 门禁
- [x] VERIFY（阶段）：首轮全量仅 2 个陈旧期望，已聚焦修正 13/13
- [x] VERIFY：全量 Vitest 101/101、470/470；严格 TypeScript；四目标 build
- **Status:** complete。下一阶段进入 WP7 的完整验收与旧 stack 物理删除。
- **Boundary:** WP6 只迁移一次性恢复提示和公共命令兼容，不把旧 session 伪造成新 Result；旧业务 stack 的物理删除留给 WP7。

### WP7 完整验收与旧 stack 删除（2026-07-27 继续）

- [x] RED：旧执行栈文件、旧专属测试、全局 Tab 路由和旧设置键必须消失
- [x] GREEN：物理删除孤立旧栈并清理设置/快捷键残留
- [x] VERIFY（自动）：聚焦/全量自动化、性能预算、真实 Extension Host、Playwright 与 diff 门禁
- [x] DOCS：需求追踪、README、迁移说明与 CHANGELOG 收口
- [x] DOCS（人工手册）：M1–M4 清晰步骤、逐步预期、通过条件、测试素材命令与记录表
- [ ] MANUAL：第三方中文输入法、真实主题切换、双窗口和接近上限的大 TXT/EPUB
- **Status:** in_progress。
- **RED evidence:** `typingLegacyStackRemoval.test.ts` 共 10 项，1 项已通过、9 项按预期失败；失败精确对应 8 个仍存在的旧文件，以及全局 Shortcut/Settings 源码中的旧 Tab 配置残留。
- **Automated evidence:** 100 文件 469/469；严格 TypeScript；四目标 build；Chromium 47/47；真实 Extension Host 退出码 0，Decoration p95 3.179ms、最大 6.090ms（51 样本）；`git diff --check`。
- **Boundary:** 旧可执行 stack、自动门禁和文档已完成；设计明确要求的四项真实人工矩阵尚未执行，因此 WP7 不标记 complete。
