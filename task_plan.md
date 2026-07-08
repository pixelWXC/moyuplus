# 开发计划：moyuplus

## Goal
根据 `指导文档.md` 梳理并启动项目开发计划，形成可持续更新的阶段计划、发现记录和进度日志；在用户确认设计前不进行业务代码实现。

## Current Phase
Phase 4: 开发执行

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
5. 实现打字练习核心：练习文件选择、物理行进度、行内 ghost text、状态栏显示。
6. 实现 Enter/Tab 路由与快捷键设置：优先保护 VS Code 原生行为，再启用组合动作。
7. 补齐测试、异常处理和用户提示。

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
| 下一步进入 Phase 5 打字练习核心 | 阅读链路已完成首轮关键风险验证，下一阶段实现练习文件、ghost text 和状态栏 |
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

## Notes
- 每完成一个阶段后更新本文件。
- 发现新需求、约束或技术事实后同步更新 `findings.md`。
- 测试、错误和阶段动作记录在 `progress.md`。
- 设计规格：[docs/superpowers/specs/2026-07-08-moyuplus-design.md](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/specs/2026-07-08-moyuplus-design.md)
- 实施计划：[docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md)
- 下一步：Phase 5 打字练习核心。
