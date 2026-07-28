# MoyuPlus 打字练习整体架构重置实施计划

日期：2026-07-23
状态：implementation_in_progress
设计基线：`docs/superpowers/specs/2026-07-23-moyuplus-typing-practice-architecture-reset-design.md`

## 实施原则

- 七个工作包按依赖顺序完成；中间工作包完成只代表允许进入下一阶段，不代表整体交付完成。
- 所有生产行为严格执行 RED → GREEN → REFACTOR，并在进度日志中记录预期失败和通过证据。
- 保持 `Adapter -> Application -> Domain` 单向依赖；Domain/Application 不导入 `vscode`、Node 文件系统或 Webview。
- 新系统在工作包 6 正式切换前与旧 typing stack 旁路共存，不让两套实现监听同一练习资源。
- 既有未提交改动均视为用户资产；不清理、不回退、不覆盖与本设计无关的内容。

## 工作包 1：契约、Coordinator 骨架与架构守卫

状态：complete

### 公开接口

- `domain/content`：素材来源、内容 profile、范围、计数、Recipe、Plan、Snapshot、PreparedContent。
- `domain/session`：会话/attempt 状态、输入尝试、修正分类和检查点 schema。
- `domain/analytics`：实时统计、10 秒桶、Result、Outcome、benchmark key schema。
- `domain/mastery`：MasteryEntry 与算法版本 schema。
- `domain/policies`：判定、文本、推进和显示策略。
- `application/commands`：Prepare、Start、Pause、Resume、Restart、Finish 命令。
- `application/events`：Prepared、Started、Paused、Resumed、Restarted、Finished 领域事件。
- `application/ports`：Clock、IdGenerator、ContentProviderRegistry、SessionRuntime、Snapshot/Checkpoint/Result/Preferences stores、Editor、EventSink。
- `PracticeApplicationCoordinator`：只负责应用编排，不实现工作包 3 的判定与统计规则。

### 预计文件

- `src/typing/domain/{content,session,analytics,mastery,policies}/index.ts`
- `src/typing/application/{commands,events,ports}/index.ts`
- `src/typing/application/PracticeApplicationCoordinator.ts`
- `src/typing/index.ts`
- `src/test/typing/helpers/inMemoryTypingPorts.ts`
- `src/test/unit/typingArchitecture.test.ts`
- `src/test/unit/practiceApplicationCoordinator.test.ts`
- `src/test/unit/typingContracts.test.ts`

### 测试

- schema/类型夹具独立编译与运行时不变量测试。
- 使用内存 Port 跑通 prepare/start/pause/resume/restart/finish 编排。
- 架构守卫禁止 Domain/Application 导入 `vscode`、Node 文件系统、Webview 和跨目录深层入口。
- 公开入口守卫禁止消费者依赖模块内部文件。

### 退出证据

- 目标 RED 均因契约或实现缺失而失败，并已记录。
- 工作包 1 目标测试、完整 Vitest 和 TypeScript 编译通过。
- `rg`/架构测试证明 Domain/Application 无被禁止依赖。

## 工作包 2：素材系统与 ContentCatalogStore

状态：complete

### 公开接口

- `ContentCatalogStore`、素材锁与原子文件 IO 适配器。
- `BuiltInPackProvider`、`CustomMaterialProvider`、TXT/EPUB 导入器、TXT 导出器。
- 清理、字素/汉字/英文词计数、估时、范围选择和 Snapshot 构建流水线。
- 自定义、自由内容与可恢复删除接口。

### 预计文件

- `src/typing/domain/content/*`
- `src/typing/adapters/storage/{ContentCatalogStore,AtomicFileWriter,MaterialLock}.ts`
- `src/typing/adapters/sources/{BuiltInPackProvider,CustomMaterialProvider,TxtMaterialImporter,EpubMaterialImporter,TxtMaterialExporter}.ts`
- `src/typing/assets/*`
- `src/test/typing/fixtures/*`
- 对应 domain/contract/unit tests。

### 测试

- Unicode 清理、计数、估时、范围和 200,000 字素边界。
- TXT 编码/导入/导出和 EPUB 安全章节提取 fixtures。
- Catalog 原子写、锁竞争、过期锁接管、崩溃恢复和可恢复删除。
- 最低内置覆盖矩阵逐项断言，所有随机组合保存 seed。

### 退出证据

- 全部素材来源产出 `PreparedContent`。
- 并发/崩溃 contract 通过。
- 设计第 6.8 节所有类别达到数量与非空门槛。

## 工作包 3：纯领域内核、长期结果与全局投影

状态：complete

### 公开接口

- Session Engine、文本策略、Analytics、Mastery scorer 与全部确定性生成器。
- 完整 `PracticeApplicationCoordinator`。
- `PracticePreferencesStore`、不可变 `ResultStore`、History/Daily/Mastery Projection Stores。
- Result watermark 增量投影与全量重建接口。

### 预计文件

- `src/typing/domain/{session,analytics,mastery,generators,policies}/*`
- `src/typing/application/PracticeApplicationCoordinator.ts`
- `src/typing/adapters/storage/{PracticePreferencesStore,ResultStore,HistoryProjectionStore,DailyProjectionStore,MasteryProjectionStore}.ts`
- 对应 unit/contract/integration tests。

### 测试

- 字素/emoji/组合字符、中文标点、严格/宽松空白。
- character/committedBatch、跳错/阻塞/修正、暂停/重启/限时/定长。
- 全部统计公式、10 秒桶、跨午夜、benchmark key。
- Mastery 衰减/降权与所有生成器 seed 决定性。
- Result 不可变、原子写和投影增量/损坏重建。

### 退出证据

- 内存 Editor Port 完整会话通过。
- Result 是唯一事实来源；三类投影均可从 Result 重建。
- 领域、存储和生成器测试全部通过。
- 2026-07-23：WP3 聚焦测试 28/28；完整套件中的 333 项通过，唯一 build contract 文件占用项随后独立重建并定向 5/5 通过；TypeScript、extension/webview build 与 `git diff --check` 通过。

## 工作包 4：workspace 会话与原生编辑器适配

状态：complete

### 公开接口

- `moyuplus-practice:` 内存 FileSystemProvider 与语言注册。
- Snapshot/Checkpoint/PendingResult/SessionLease workspace stores。
- 零宽锚点、文档变化分类、稳定上屏 diff、Decoration Presenter。
- Backspace/Delete/Undo/Redo/Enter/Tab 路由与恢复绑定。

### 预计文件

- `src/typing/adapters/editor/*`
- `src/typing/adapters/storage/{WorkspaceSessionStore,PendingResultStore,SessionLeaseStore}.ts`
- `src/typing/registration/editorRegistration.ts`
- 对应 adapter contract 与 Extension Host tests。

### 测试

- 内存文件读写/save/恢复和项目文件零写入。
- 锚点、结构回滚、单光标、批量稳定 diff、可见范围 Decoration。
- 修正分类、关闭/重开、pending 重试、heartbeat/超时/双实例 lease。

### 退出证据

- 真实练习文档可完成、暂停、重启、恢复。
- 合约测试与 Extension Host 自动化通过。
- Windows 微软拼音基础人工冒烟证据已记录。

### 当前证据（2026-07-24）

- `registerPracticeEditor` 已旁路接入真实 `onDidChangeTextDocument`、save、close 事件；`PracticeDocumentLifecycleAdapter` 支持逐字判定、稳定上屏合并、结构回滚和 save 前 flush。
- `VSCodeWorkspacePracticeEditorHost` 已通过真实 `openTextDocument`、`showTextDocument` 和 `TextDocument.save()` 操作 `moyuplus-practice:` 文档；workspace adapter 支持活动上下文、后台 save、回滚和关闭后恢复。
- manifest 已为练习 scheme 增加独立 Backspace/Delete/Undo/Redo/Enter/Tab 命令与严格 `resourceScheme` keybinding，不启用旧 typing listener；受控原生修正事件不会被 document listener 重复计数。
- Extension Host 自动化已在隔离的 VS Code 实例中通过：打开内存练习 URI、捕获真实变更/save、执行六个专用命令并关闭 editor。
- 全量 Vitest 83 文件 367/367、严格 TypeScript、extension/Reader/Settings build 与 `git diff --check` 通过。
- `npm run test:typing-ime-manual` 可启动隔离手工宿主，显示固定中文长句并以真实稳定上屏生命周期验证最终输入；不接入或切换正式旧栈。
- 手工入口已把候选稳定窗口提高到 1.5 秒，按最终 anchored document 计算进度；目标文本直接以内联灰字显示，左下角持续显示实时进度，成功和错误均有非模态通知与状态栏反馈。
- 用户已运行上述入口，使用 Windows 微软拼音完成固定长句稳定上屏并确认“微软拼音冒烟通过”；WP4 的合约、Extension Host 与人工退出证据全部满足，状态更新为 `complete`。

## 工作包 5：Typing View、Reader Bridge 与配置入口

状态：complete

### 公开接口

- `moyuplus.typingView` 版本化协议与 Application 查询/命令适配器。
- materials/recent/setup/live/result/history/mastery 页面。
- `ReaderBookSourceProvider` 和仅含 bookId/locator 的 `TypingEntryPoint`。
- 活动会话冲突选择、语言配置桥和显式“设为默认”入口。

### 预计文件

- `src/typing/adapters/view/*`
- `src/typing/adapters/reader/*`
- `src/typing/registration/viewRegistration.ts`
- `src/webview/typing/*`、`media/typingApp.*`
- 对应 protocol/unit/Playwright/Extension Host tests。

### 测试

- 协议校验与 Webview 不直写 Store 的架构测试。
- 素材、自由粘贴、书架三条端到端路径。
- 七页面、窄侧栏、主题/高对比、键盘/ARIA、隐藏指标、错误/空状态/pending。
- Reader Decoration 排除 `moyuplus-practice:`。

### 退出证据

- feature gate 下三条端到端路径通过。
- Result/History/Mastery 页面只读工作包 3 查询接口。
- UI 自动化与可访问性矩阵通过。

### 当前证据（2026-07-24）

- 已建立独立 `TYPING_VIEW_PROTOCOL_VERSION`、七页导航枚举、实例隔离、请求修订和严格双向消息校验。
- `TypingViewProvider` 已使用安全 CSP、单实例绑定和异步代际保护接入独立 Activity Bar Webview；浏览器 bundle 只导入协议文件，不包含 `vscode` 或 Node 运行时依赖。
- 七页侧栏骨架使用 VS Code 主题令牌、键盘焦点、高对比与窄容器适配；业务状态只从宿主快照进入 Webview。
- 聚焦回归 6 文件 23/23；全量 Vitest 87 文件 377/377；严格 TypeScript 和 extension/Reader/Settings/Typing 四目标构建通过。
- 状态保持 `in_progress`：页面业务查询、素材/setup/live/result/history/mastery 内容、Reader Bridge、会话冲突与配置入口仍待实现。
- 当前 `extension.ts` 注入的 shell query 仅返回固定页面集合、空活动会话和零 pending 成绩，用于验证旁路 View 生命周期；它尚未连接 Application/Store 事实，不能作为 materials/live/history 等页面完成证据。
- 2026-07-24 按用户要求在此停止。恢复顺序：Application 查询适配器与 materials → setup/live/result/history/mastery → Reader Bridge → 活动会话冲突与配置入口 → 三条 feature-gate 端到端和可访问性验收。
- 2026-07-24 恢复实施后，`TypingViewApplicationQuery` 已通过只读 Catalog Port 合并内置 manifest 与 `ContentCatalogStore` 用户素材，并在真实 extension activation 中使用 `globalStorageUri` 注入；materials 不再依赖固定空壳。
- shell snapshot 已扩展为严格判别的页面内容；materials 之外的页面仍返回显式 `unavailable`，避免把尚未接通的查询伪装为完成。活动会话与 pending 成绩仍为默认值，待对应 Application 查询端口接入。
- materials Webview 已渲染自由粘贴、TXT/EPUB 导入入口、内置/用户素材分区、计数/估时/来源说明和空状态；宿主文本经过 HTML 转义，素材 ID 经过属性编码。选择、粘贴与导入命令尚未接线。
- 本轮 RED/GREEN 证据：查询适配器先以 `TypingViewApplicationQuery is not a constructor` 失败；旧 shell 快照在严格内容协议下失败；真实 activation 先缺少 materials 内容；渲染器先因模块缺失失败。最终全量 Vitest 89 文件 382/382、严格 TypeScript、完整 extension/Reader/Settings/Typing build 与 `git diff --check` 通过。
- materials 动作协议现已严格覆盖素材选择、自由粘贴和 TXT/EPUB 导入；Provider 只调用注入的命令端口。选择/粘贴成功后进入 setup，取消或失败保留当前页，导入后重新查询 catalog。
- `PracticeSetupDraft` 保存 Application 侧预选 recipe；自由粘贴只生成规范化 `adHoc` 草稿，不写 catalog。TXT/EPUB 导入自动推断 ad-hoc profile，TXT UTF-8 失败时可显式选择 GBK 重试。
- Webview 已接通素材按钮、可访问的多行粘贴表单和严格 revisioned 消息；真实 activation 已通过文件选择、读取、原子 catalog 写入与刷新把 TXT 导入结果返回 materials。
- 本轮 RED/GREEN 证据：协议动作、Provider 路由、粘贴表单、命令适配器、profile 推断、registration 与真实 TXT activation 均先按缺失行为失败；最终聚焦 8 文件 28/28，边界补强 2 文件 10/10，全量 Vitest 90 文件 394/394、严格 TypeScript、完整四目标 build 与 `git diff --check` 通过。
- setup 页面现已通过 `PracticeSetupDraft`、Content Provider inspect 和 `PracticePreferencesStore` 读取来源描述、可选范围与默认策略；自由粘贴正文不会进入 Webview 快照。
- Typing View 协议升级为 v2，严格校验 setup snapshot 与 `configureSetup`；Webview 表单覆盖完成约束、判定、文本、推进和显示五个正交轴，提交后只写当前 Application 草稿，不修改全局默认。
- 本轮 RED/GREEN 证据：setup 查询、协议、渲染、草稿配置、Provider 路由、真实 activation 与纯表单转换均先因缺失行为失败；聚焦 7 文件 32/32，严格 TypeScript 与完整四目标 build 通过。全量 Vitest 90 文件 402/402 通过，另一个既有 workspace lease 文件在并行全量中瞬时 `EPERM`，定向复验 5/5 通过。
- 下一断点：把已配置的 `PracticePlan + SourceRange` 接入 prepare/start，并先实现活动会话冲突选择；随后提供 live 页面事实与暂停/重启/结束命令。WP5 继续保持 `in_progress`。
- setup 草稿现已通过真实 `PracticeApplicationCoordinator` 完成 prepare/start，并装配 Content Provider、Runtime、Result Store、workspace editor/FSP、Decoration、document lifecycle 与六个练习资源命令；真实 activation 会打开 `moyuplus-practice:` 文档。
- Typing View 协议升级为 v3：开始、冲突决策和 live 控制均为严格 revisioned 消息，且不接受 Webview 提供 sessionId。活动会话时明确展示“返回当前练习 / 结束当前练习并新建 / 取消”，不会静默覆盖。
- live 页面现从 `PracticeSessionState + PracticeSnapshot + monotonicNow` 投影进度、活动时间、准确率、原始/有效 CPM，并提供状态匹配的暂停/继续、重启和结束命令。
- 本轮 TDD 证据覆盖协议、Application 命令、Query、Provider、渲染、宿主状态和真实 activation；最终 Vitest 93 文件 420/420、严格 TypeScript、四目标 build 与 `git diff --check` 通过。
- 当前限制：冲突决策已覆盖同一 Extension Host，但 `SessionLeaseStore` 尚未在 start 前用预分配 session ID 原子 acquire；多窗口活动会话冲突仍待下一切片完成。因此 WP5 继续保持 `in_progress`，下一断点为 lease 原子装配，然后进入 result/history/mastery。
- 2026-07-24 lease 原子装配已完成：Coordinator 在 runtime 前预分配 session ID 并通过 Application Lease Port acquire；竞争失败发布 `practiceStartBlocked`，不会保存 Session 或打开 editor；启动失败、完成和自动完成释放，restart 使用 owner-only 原子 transition。
- `WorkspacePracticeSessionLease` 已把 workspace 检查点状态投影为跨窗口冲突事实，并在 acquire 后启动 heartbeat；真实 activation 使用 `storageUri` 与独立 owner ID 装配，扩展 dispose 尽力释放。
- 本轮 RED/GREEN 证据覆盖 Coordinator、完整会话、workspace lease adapter、View race 和真实 activation；聚焦 5 文件 30/30，严格 TypeScript 与完整 build 通过。全量 93 文件中 92 文件 425 项通过，唯一既有 Windows `catalog.lock` 瞬时 `EPERM` 文件独立复验 6/6。
- WP5 继续保持 `in_progress`：下一断点为 result/history/mastery 只读事实页面；超时 lease 接管后的旧检查点恢复 UI、Reader Bridge、配置入口与三条 feature-gate 端到端仍待完成。
- 2026-07-24 result/history/mastery 只读事实页已接通：Typing View 协议升级为 v4，严格承载最新 Result 摘要/速度桶/错误排行/benchmark 比较、每页 50 条 History 与最近 Daily 汇总、按分数排序的 Mastery 条目；真实空数据返回明确空态，不再伪装为 `unavailable`。
- `TypingViewApplicationQuery` 只依赖 Result/History/Daily/Mastery 窄只读 Port；真实 activation 复用 Coordinator 的同一个 `ResultStore`，并通过 `ProjectedResultCommitter` 在不可变 Result 成功后刷新三个可重建投影。Webview 不接收路径、正文、Store 写接口或完整输入。
- 本轮 RED/GREEN 证据覆盖 Query、严格协议、渲染和真实 activation：目标断言先因 `unavailable`、协议拒绝与错误 materials 分支失败；聚焦 7 文件 44/44，严格 TypeScript、完整四目标 build 与 `git diff --check` 通过。全量 93 文件中 92 文件 430 项通过，唯一既有 Windows `catalog.lock` 瞬时 `EPERM` 文件独立复验 6/6。
- WP5 继续保持 `in_progress`：下一断点为超时 lease 接管后的旧检查点恢复 UI，然后进入 Reader Bridge、配置入口与三条 feature-gate 端到端/可访问性验收。
- 2026-07-24 超时 lease 旧检查点恢复 UI 已完成：Typing View 协议升级为 v5，在所有页面投影不含 session ID 的恢复摘要，并提供“恢复练习 / 暂不恢复”显式选择；Webview 不能指定恢复目标。
- `PracticeSessionRecovery` 只通过窄 Source/State/Editor Port 编排。恢复会重新读取权威候选、仅原子认领同一过期 session、重建内存 Snapshot/Session、打开 `moyuplus-practice:` 文档，并把旧进程 monotonic 时间轴整体平移到当前进程后先保持暂停，不把离线时间计入练习。
- `WorkspacePracticeSessionLease` 仅在 lease 已过期、session ID 未被替换且 Snapshot/Checkpoint 完整匹配时暴露/认领候选；延迟按钮不会覆盖另一个后来出现的过期 session。
- 本轮 RED/GREEN 证据覆盖 Application 恢复服务、workspace candidate/claim 竞态、Query、协议、Webview 状态/渲染、Provider 路由和真实 activation。最终聚焦 10 文件 62/62；全量 Vitest 94 文件 442/442；严格 TypeScript、完整四目标 build 与 `git diff --check` 通过。Playwright 沙箱外全量 38/39，唯一既有设置页初始焦点时序用例独立复验 1/1。
- WP5 继续保持 `in_progress`：下一断点进入 Reader Bridge，然后实现配置入口与三条 feature-gate 端到端/可访问性验收。
- 2026-07-27 Reader Bridge 已完成：新增 `ReaderBookSourceProvider`，只通过现有 Book Catalog/Adapter 的安全文本投影读取书架来源，支持整本与章节范围、确定性 revision、profile/计数推断，并始终释放 Book Handle；正文、路径和书架写接口均不进入 Webview。
- `ReaderTypingEntryPoint` 公开接口仅接收 `bookId + 可选 ReadingLocator`，进入 Application 草稿前把 locator 收窄为推荐章节；Typing View 在已打开和冷启动两种状态下都直接聚焦 setup。书架动作已改接新入口，不再调用旧 `TypingPracticeController` 启动命令。
- 失效来源在写入 Typing 草稿前被可用性门禁阻断：Typing 显式报错，并只把 book ID 交给 Reader 既有重新定位命令；Typing 不直接修改书架。保存的 Reader 阅读位置只作为章节建议，不绑定或回写阅读进度。
- 本轮 RED/GREEN 证据覆盖 Reader Book Provider、字段收窄、失效来源、冷启动竞态和真实 activation。全量 Vitest 96 文件中 95 文件 449 项通过，唯一既有 Windows `catalog.lock` 瞬时 `EPERM` 文件独立复验 6/6；严格 TypeScript、完整四目标 build 与 `git diff --check` 通过。
- WP5 继续保持 `in_progress`：下一断点为语言/默认偏好配置入口，然后完成素材、书架、自由练习三条 feature-gate 端到端与可访问性验收。
- 2026-07-27 语言/默认偏好配置入口已完成：原生练习文档在显示前显式设置为 `moyuplus-practice` 语言，保证 `[moyuplus-practice]` 覆盖生效；Typing View 协议升级为 v6，setup 增加独立“设为默认”和“编辑练习字体与外观”入口。
- 普通 setup/start 仍只修改当前 `PracticePlan`；只有 `saveSetupAsDefault` 才把 evaluation/text/flow/display 四类策略写入共享 `PracticePreferencesStore`，不会持久化素材、范围或完成条件。外观入口只打开 VS Code 的固定 `@lang:moyuplus-practice` 原生设置过滤，不复制字体配置 Store，也不接受 Webview 指定 languageId 或配置键。
- 本轮 RED/GREEN 证据覆盖原生文档语言、Application 默认保存、严格协议、Provider 路由、setup 渲染、语言配置桥和真实 activation。聚焦 7 文件 50/50；全量 Vitest 97 文件 455/455；严格 TypeScript、完整四目标 build、真实 Extension Host 与 `git diff --check` 通过。
- WP5 继续保持 `in_progress`：下一断点先补齐仍为 `unavailable` 的 recent 页面事实，再完成素材、书架、自由练习三条 feature-gate 端到端与窄侧栏/主题/高对比/键盘/ARIA 验收。
- 2026-07-27 Recent 只读事实页已完成：Typing View 协议升级为 v7，从真实不可变 Result Store 按结束时间倒序投影最近 20 条摘要，并提供真实空状态；正文、路径和 Store 写接口不进入 Webview。
- 当前 Result schema 不包含 ReplayDescriptor、来源标题和 SourceRange，因此 Recent 暂不伪造“再次练习”动作；后续若需要重放，必须先通过正式 schema/命令设计补齐权威描述。
- Recent RED/GREEN 证据覆盖 Query、严格协议和渲染：聚焦 3 文件 28/28，真实 activation 的 Recent/Result/History/Mastery 空事实路径通过。
- 当前最终门禁：Vitest 97 文件 455/455、严格 TypeScript、extension/Reader/Settings/Typing 四目标 build、真实 Extension Host 退出码 0。
- WP5 仍为 `in_progress`；下一断点为素材、书架、自由练习三条 feature-gate 端到端与窄侧栏/主题/高对比/键盘/ARIA 可访问性矩阵。
- 2026-07-27 feature gate 与可访问性矩阵完成：内置素材、Reader Book、自由粘贴三条真实 activation 路径均经 setup/Application Coordinator 打开 `moyuplus-practice:` 原生编辑器；Typing View 协议升级至 v8，隐藏策略不再向 Webview 投影 progress/metrics。
- Webview 现保持单一 main landmark、导航刷新焦点、forced-colors 当前页非颜色轮廓与粗指针 44px 触达区域；七页面、setup accessible name、窄至 220px、明暗/高对比、隐藏 live、pending、长标识与离线资源均有真实 Chromium 证据。
- 最终门禁：Query/Protocol/Render 31/31、feature-gate activation 11/11；全量 Vitest 97 文件中 96 文件 458 项通过，唯一既有 Windows lease `catalog.lock` 瞬时 `EPERM` 文件独立复验 10/10；严格 TypeScript、extension/Reader/Settings/Typing 四目标 build、全量 Playwright 47/47、真实 Extension Host 退出码 0、`git diff --check` 通过。
- WP5 状态更新为 `complete`；下一断点进入工作包 6 的旧状态迁移、命令薄别名和唯一注册入口切换。

## 工作包 6：旧版迁移与正式切换

状态：complete

### 公开接口

- `LegacyResumeHint` 一次性迁移。
- 旧公共命令 ID 到新 Application 的薄别名。
- 新 typing 唯一注册入口与回退检查点。

### 预计文件

- `src/typing/migration/*`
- `src/typing/registration/*`
- `src/extension.ts`
- `package.json`
- 旧 typing 文件及其旧行为测试删除/替换。

### 测试

- 旧 session key 迁移、不伪造成绩、一次性消费失败安全。
- 命令别名不导入旧 Controller。
- package contributions、context keys、切换/回退演练。

### 退出证据

- 新系统成为唯一 typing 注册。
- 旧状态可显示恢复提示。
- 旧命令无旧业务依赖，切换/回退演练通过。

### 2026-07-27 实施进度

- [x] `LegacyResumeHint` 纯迁移服务：URI 映射、不可用来源、幂等 marker、写入/回读失败安全（7/7）。
- [x] activation 迁移接入及旧 Controller/Inline Completion/状态栏装配切断（2/2）。
- [x] 恢复提示安全协议、确认/忽略 UI 与 Host 路由（5/5）。
- [x] 旧公共命令薄别名及无等价行为的弃用适配器（3/3）。
- [x] 唯一生产注册入口与静态/运行时守卫（聚焦合计 10/10）。
- [x] package 旧 UI 面收口：逐行/跳转/trim/routeTab 面板项、全局 Tab 键位与旧设置已移除（2/2）。
- [x] 真实 activation 恢复确认：可用性复核、Reader Book/合法范围预选、无损空白策略映射、进入 setup 后消费 hint。
- [x] 旧全局 ghost text/状态栏/真实文件练习集成测试替换为新切换契约。
- [x] 切换/回退检查点：marker 提交失败保留旧状态；旧 key 清理失败可幂等重试且不覆盖 hint（迁移 7/7）。
- [x] 工作包门禁：Vitest 101/101 文件、470/470；TypeScript；四目标 build；Chromium 47/47；真实 Extension Host 退出码 0；`git diff --check`。

## 工作包 7：完整验收与旧 stack 删除

状态：in_progress

### 交付项

- 删除旧 Controller、Inline Completion、旧状态栏与仅覆盖旧行为的测试。
- 完成需求追踪证据、性能基准、Extension Host/Playwright/人工矩阵。
- 更新 README、设置说明、迁移说明和 CHANGELOG。

### 测试与退出证据

- TypeScript、Vitest、Adapter Contract、Extension Host、Playwright 全部通过。
- 逐字 p95、单次阻塞、200k 字素、分页与延迟初始化达到预算。
- 微软拼音、第三方输入法、主题、多窗口、大 TXT/EPUB 人工验收完成。
- 设计第 18 节每条需求均有实现文件和测试/人工证据。
- 仓库不再包含可执行旧 typing stack；文档与最终行为一致。

### 当前证据（2026-07-27）

- [x] 旧 Controller、SourceCatalog、旧 WorkspaceSessionStore、旧领域模型和旧专属测试已物理删除；全局 Tab 路由与旧设置已收口。
- [x] 删除守卫 10/10；最终 Vitest 100 文件 469/469；严格 TypeScript；四目标 build；`git diff --check`。
- [x] 性能 RED 复现 50k 历史下 p95 约 405.569ms；O(1) 修复后长历史与精确 200k 字素可见窗口预算测试通过。
- [x] 真实 Extension Host 51 样本 Decoration p95 3.179ms、最大 6.090ms；最终 Chromium 47/47。
- [x] README、设置说明、迁移说明、CHANGELOG 和第 18 节追踪文档已更新。
- [x] Windows 微软拼音人工冒烟已有记录。
- [ ] 第三方中文输入法、真实主题切换、双窗口 lease 和接近上限的大 TXT/EPUB 人工矩阵。
- [x] 上述待人工项目已在 `docs/typing-practice-verification.md` 中拆成 M1–M4 编号步骤，包含前置条件、逐步预期、通过条件、可复现素材命令和记录表。
- **Current boundary:** 自动验收、旧栈删除和文档已完成；最后四项真实人工门槛未执行，工作包继续保持 `in_progress`。

## 当前错误日志

- 2026-07-23：首次并行读取技能/仓库信息时，`git status` 因 sandbox 用户触发 dubious ownership，使编排调用整体失败；后续只对单次 git 命令使用 `git -c safe.directory=...`，不修改用户全局 Git 配置。
- 2026-07-23：首次读取 TDD 技能时漏掉 `ok-skills` 路径段；已按技能目录清单修正为完整路径，不重复错误路径。
- 2026-07-23：设计文档首次整文件读取因输出上限截断；已按行分三段读取至文件末尾。
- 2026-07-23：首次向三份工作记忆追加记录时，`progress.md` 尾部锚点不精确导致补丁整体未应用；后续改为分文件使用精确尾部锚点。
- 2026-07-24：首次人工 IME 入口使用 `{ modal: true }` 展示说明；VS Code 在 `--extensionTestsPath` 模式拒绝测试扩展打开模态对话框，导致宿主在输入前退出。现已改为编辑器内联目标、状态栏进度和非模态通知。
- 2026-07-24：恢复 WP5 后首次调用 `npx vitest` 时，桌面沙箱 PATH 中没有 `npx`；已读取工作区自带 Node 路径并直接执行项目 `node_modules/vitest/vitest.mjs`，未安装或改动依赖。
- 2026-07-24：lease 切片首次严格检查误调用不存在的 `pnpm type-check` 脚本，`pnpm` 将其解释为依赖操作并迁移 13 个现有依赖；已在超时后逐项验证并从 `node_modules/.ignored` 原位恢复，随后只用固定 Node 直接执行项目 TypeScript。
