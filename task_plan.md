# 开发计划：moyuplus

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
