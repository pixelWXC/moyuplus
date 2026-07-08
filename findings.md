# 发现与决策

## Requirements
- 用户要求：根据 [指导文档.md](D:/wxc_work_file/projects/harnessplace/moyuplus/指导文档.md) 启动开发计划。
- 当前阶段目标是先读取指导文档和项目现状，形成计划；在设计确认前不实施业务代码。
- 产品形态：运行在 VS Code 内的本地 TXT 阅读与自由打字练习插件。
- 阅读器：VS Code 侧边栏 Webview View，分页阅读，支持导入文件列表、上一页/下一页、字体大小、编码切换、阅读进度恢复。
- 分页：必须基于 Webview DOM 实际渲染高度测量，不能简单按字符数或固定行数估算。
- 打字练习：基于已导入 TXT，按物理行作为练习单位，在当前编辑器光标行提供 ghost text 行内提示。
- 输入校验：不做严格判题，不标红，不阻止输入，不做 WPM/正确率统计。
- 状态独立：阅读器当前文件/offset 与打字练习文件/行号完全独立，即使使用同一 TXT 也不同步。
- 快捷键：需要支持阅读器操作、打字练习开关、Enter/Tab 路由，且优先保护 VS Code 原生补全、snippet、换行和 Tab 行为。
- 存储：已导入 TXT 文件列表全局共享；阅读状态和练习状态按 workspace 独立。
- 非目标：联网同步、云存储、账号、复杂书架、标签分类、多阅读窗口、严格打字测速等。

## Research Findings
- 已读取 `planning-with-files` 技能说明：复杂任务需要维护 `task_plan.md`、`findings.md`、`progress.md`，并在发现和阶段变化时更新。
- 已读取 `brainstorming` 技能说明：任何功能创建、组件构建、行为修改前，必须先理解项目、澄清需求、提出方案并获得用户确认。
- Phase 0 前，仓库顶层只有 `指导文档.md` 以及计划文件，还没有代码脚手架。
- Phase 0 后，项目已有 TypeScript VS Code extension 骨架、`src/extension.ts`、VS Code launch 配置、compile/test 脚本和 Vitest 单元测试。
- Phase 0/Phase 1 执行时当前目录还不是 Git 仓库，`git status --short` 曾返回 `fatal: not a git repository`。
- 用户已在 2026-07-08 要求“从现在开始，启动git”，当前目录已执行 `git init`。
- 第一次读取 `指导文档.md` 时出现中文乱码，需要改用明确的 UTF-8 方式读取。
- 已用 UTF-8 成功读取 `指导文档.md`，需求内容完整。
- 技术风险最高的部分是 Webview DOM 动态分页、Inline Completion ghost text、Enter/Tab 与 VS Code 原生行为的兼容。
- `moyuplus.smokeTest` 已作为首个命令注册到 `package.json`，并由单元测试验证 activation 会注册该命令。
- `iconv-lite` 已作为运行时依赖安装，为后续 Phase 2 的 UTF-8/GBK TXT 解码预留。
- Phase 1 已完成 domain/storage 边界：`models.ts` 提供核心类型、默认值和归一化保护，`txtLibraryStore` 负责全局 TXT 索引，`workspaceSessionStore` 负责 workspace 阅读/练习 session。
- 已确认通过内存 Memento 可单元测试 VS Code `globalState`/`workspaceState` 风格的读写逻辑，不需要启动 VS Code。
- 损坏或旧形状状态采用“读时恢复默认/过滤非法项”的策略，不抛出异常阻断插件启动。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 先进行需求和项目发现 | `指导文档.md` 尚未读取，不能可靠确定实现范围 |
| 暂不修改业务代码 | 需要先完成设计确认门禁 |
| 推荐 MVP 垂直切片 | 当前从零开始，先贯通插件骨架、存储、阅读、练习和关键路由，便于尽早验证高风险交互 |
| 用户确认 MVP 垂直切片 | 可以进入正式设计/实施计划阶段 |
| Phase 0 从 TypeScript VS Code extension 骨架开始 | 当前无代码脚手架，必须先建立可编译、可在 Extension Development Host 启动的最小项目 |
| Phase 0 使用 Vitest 做最小单元测试 | 可在不启动 VS Code 的情况下验证 activation 注册 smoke command |
| Phase 1 优先建立数据模型与存储层 | 插件骨架完成后，先固定状态边界，避免后续 UI/命令直接操作 VS Code state |
| Phase 1 存储层接收 `StateMemento` 接口 | 让生产代码可接入 VS Code `globalState`/`workspaceState`，测试代码可用内存实现 |
| 默认打字练习配置使用 `completeRest` Tab 模式 | 默认更接近自然补全，后续快捷键阶段仍需避免默认劫持高风险 Tab |
| Reader/Typing session 分 key 存储 | 满足阅读状态与练习状态互不影响的核心约束 |
| 下一步进入 Phase 2 TXT 文件服务与导入命令 | 存储和模型已可承载导入文件索引与 session 状态 |
| 从现在开始使用 Git | 用户已要求启动 Git，当前目录已初始化为 Git 仓库 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 初次读取技能文件路径错误 | 改用 `C:\Users\Purvar\.agents\skills\ok-skills\...` 下的实际路径 |
| `指导文档.md` 初次读取乱码 | 已用 `-Encoding UTF8` 重新读取成功 |
| Phase 0/Phase 1 时当前目录不是 Git 仓库 | 当时计划不依赖 Git；2026-07-08 用户要求启动 Git 后已执行 `git init` |
| 设计文档无法按流程提交 commit | 当时当前目录不是 Git 仓库，已跳过 commit 并记录；后续可按用户要求提交 |
| `npm install` 报告清理 node_modules 目录 EBUSY 警告 | 安装实际成功，`npm run compile` 和 `npm test` 后续均通过 |

## Resources
- [指导文档.md](D:/wxc_work_file/projects/harnessplace/moyuplus/指导文档.md)
- [设计规格](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/specs/2026-07-08-moyuplus-design.md)
- [实施计划](D:/wxc_work_file/projects/harnessplace/moyuplus/docs/superpowers/plans/2026-07-08-moyuplus-implementation-plan.md)
- [package.json](D:/wxc_work_file/projects/harnessplace/moyuplus/package.json)
- [src/extension.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/extension.ts)
- [src/domain/models.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/domain/models.ts)
- [src/storage/txtLibraryStore.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/storage/txtLibraryStore.ts)
- [src/storage/workspaceSessionStore.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/storage/workspaceSessionStore.ts)
- [src/test/unit/storage.test.ts](D:/wxc_work_file/projects/harnessplace/moyuplus/src/test/unit/storage.test.ts)
- `C:\Users\Purvar\.agents\skills\ok-skills\planning-with-files\SKILL.md`
- `C:\Users\Purvar\.agents\skills\ok-skills\brainstorming\SKILL.md`

## Visual/Browser Findings
- 暂无。

---
*本文件会在每次关键发现后更新。*
