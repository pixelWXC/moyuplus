# 打字练习 Webview 输入架构重做实施计划

日期：2026-07-28
状态：待确认
设计基线：`docs/superpowers/specs/2026-07-28-typing-practice-webview-input-architecture-design.md`

## 1. 实施原则

- 所有生产行为严格执行 RED → 验证预期失败 → GREEN → 全量回归 → REFACTOR。
- 不允许先写生产代码再补测试；每个任务都必须保存目标失败和通过证据。
- 新旧输入适配器可以在未注册状态下短暂共存，但任何运行时刻只能有一条活动输入链路。
- Webview 不做正确性判定；Domain/Application 不导入 `vscode` 或 DOM。
- 每个 session 只允许一个 in-flight 输入事务，未发送输入留在 Webview FIFO。
- Host 只有在 durable receipt 写入成功后才能确认事务。
- 切换前保留现有用户改动；不清理、不回退、不覆盖本计划范围外文件。
- 自动测试不能代替 Windows 真实输入法验收。

## 2. 目标模块

计划新增或重构为以下边界：

```text
src/typing/domain/session/
  PracticeSessionEngine.ts
  PracticeTransactionEngine.ts

src/typing/application/
  PracticeInputTransactionCoordinator.ts
  PracticePanelSnapshotProjector.ts

src/typing/adapters/panel/
  typingPracticePanelProtocol.ts
  PracticeWebviewPanel.ts
  typingPracticePanelHtml.ts

src/typing/adapters/storage/
  PracticeTransactionJournalStore.ts

src/typing/registration/
  practicePanelRegistration.ts

src/webview/
  typingPracticeInputState.ts
  typingPracticePanelApp.ts
  typingPracticePanelStyles.css
```

文件名允许在实现中因既有目录约定做小幅调整，但层次和依赖方向不能改变。

## 3. 测试命令约定

聚焦单测：

```powershell
npm run test:unit -- src/test/unit/<target>.test.ts
```

严格类型检查：

```powershell
npx tsc -p . --noEmit
```

Webview 构建：

```powershell
npm run build:webview
```

布局与浏览器事件测试：

```powershell
npm run test:layout -- tests/layout/typing-practice-panel-input.spec.ts
```

Extension Host：

```powershell
npm run test:extension-host
```

全量门槛：

```powershell
npm run compile
npm run test:unit
npm run test:layout
npm run test:extension-host
```

每个 RED 必须确认是“目标行为缺失”造成的断言失败，而不是导入错误、测试拼写错误或 fixture
损坏。

## 4. 工作包 1：新会话契约、来源类型与旧数据迁移

### 目标

建立 Webview 输入所需的新领域契约，但暂不接入 UI 或扩展注册。

### 预计文件

- 修改 `src/typing/domain/session/index.ts`
- 修改 `src/typing/domain/content/index.ts`
- 修改 `src/typing/domain/policies/index.ts`
- 修改 `src/typing/domain/analytics/index.ts`
- 修改 `src/typing/domain/analytics/PracticeAnalytics.ts`
- 修改 `src/typing/application/commands/index.ts`
- 修改 `src/typing/application/ports/index.ts`
- 修改 `src/typing/adapters/storage/PracticePreferencesStore.ts`
- 新增 `src/typing/migration/TypingInputArchitectureMigration.ts`
- 修改 `src/typing/migration/index.ts`
- 修改 `src/test/unit/typingContracts.test.ts`
- 修改 `src/test/unit/practicePreferencesStore.test.ts`
- 新增 `src/test/unit/typingInputArchitectureMigration.test.ts`

### RED

先写并运行以下失败测试：

1. 新 Plan 不再包含 `evaluation.mode`，只保留 `evaluation.errorPolicy`。
2. 新提交来源只允许 `direct | composition | paste`。
3. 新 Session 包含从 0 开始的 `revision` 和 durable transaction receipt 容器或索引。
4. v1 Snapshot/Preferences/Session 可迁移到新 schema；旧 mode 被忽略。
5. 旧 Result/InputAttempt origin 可读取，但新运行时不能写
   `character | committedBatch | enter | tab`。
6. 迁移重复执行保持幂等。

运行：

```powershell
npm run test:unit -- src/test/unit/typingContracts.test.ts src/test/unit/practicePreferencesStore.test.ts src/test/unit/typingInputArchitectureMigration.test.ts
```

预期：因新 schema、来源类型和迁移器尚不存在而失败。

### GREEN

- 引入新 `PracticeInputOrigin`，把 legacy origin 限制在兼容读取模型。
- 为 Session/Checkpoint 增加 revision 与 receipt schema。
- 删除新 Plan 写入路径中的 `evaluation.mode`。
- Preferences reader 接受旧值并输出新值；writer 只写新 schema。
- 为旧 Snapshot、Session 和 Result 提供显式、可测试的迁移函数。
- 不在此工作包改变运行时输入行为。

### 退出证据

- 三个聚焦测试文件通过。
- `npx tsc -p . --noEmit` 通过。
- 现有旧数据 fixture 仍可读取，新 fixture 不再写 mode。

## 5. 工作包 2：纯领域事务 delta 与阻塞语义

### 目标

让领域层从明确的提交事务计算 O(本次输入长度) 的 delta，不再依赖文档 diff，
也不通过复制完整历史实现失败回滚。

### 预计文件

- 新增 `src/typing/domain/session/PracticeTransactionEngine.ts`
- 修改 `src/typing/domain/session/PracticeSessionEngine.ts`
- 修改 `src/typing/domain/session/index.ts`
- 修改 `src/typing/application/PracticeSessionRuntime.ts`
- 修改 `src/typing/application/ports/index.ts`
- 新增 `src/test/unit/typingPracticeTransactionEngine.test.ts`
- 修改 `src/test/unit/typingSessionEngine.test.ts`
- 修改 `src/test/unit/practiceSessionRuntime.test.ts`
- 修改 `src/test/unit/typingPerformanceBudget.test.ts`

### RED

逐个增加并观察失败：

1. `abc` direct 提交产生三个正确 attempt、目标推进 3、revision 只增加 1。
2. composition 提交“主题”按两个字素依次消费。
3. paste `abXrest` 在 block 模式下只消费到首个 `X`，
   `rest` 作为 `unconsumedText` 返回且不产生 attempt。
4. allowSkip 沿用现有跳错语义。
5. blocked Session 只接受纠错事务。
6. 一个 correction 只移除当前阻塞错误，不撤销正确历史。
7. 同一 transaction id 的领域 receipt 描述相同结果。
8. emoji、组合附加符和代理对按字素处理。
9. 计算 delta 不复制完整 `inputAttempts` 历史，性能测试证明单次计算不随历史长度线性增长。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticeTransactionEngine.test.ts src/test/unit/typingSessionEngine.test.ts src/test/unit/practiceSessionRuntime.test.ts src/test/unit/typingPerformanceBudget.test.ts
```

### GREEN

- 让 `PracticeTransactionEngine` 纯计算：
  - 输入当前轻量权威状态、Snapshot、事务和时钟。
  - 输出 `PracticeSessionDelta`、attempt additions、consumed/unconsumed text 和 receipt。
- delta 尚未提交时不得修改传入 Session。
- receipt 应包含 transaction id、输入摘要、前后 revision、outcome 和消费结果。
- 提供 O(delta) 的 `applyDelta()`；只在持久化成功后调用。
- 删除 `confirmCommittedInput` 领域入口。

### REFACTOR

- 复用现有 normalization、空白和标点策略。
- 不复制或重写一套 Analytics。
- 保持 Domain 不导入文件系统、VS Code 或 Webview。

### 退出证据

- 聚焦领域测试通过。
- 性能守卫能在故意恢复全历史 clone 时失败。
- 现有 Analytics/Result 测试通过。

## 6. 工作包 3：持久事务日志、恢复与原子应用

### 目标

在不每键重写完整历史的前提下，保证“已应用但 ack 丢失”的事务可幂等恢复。

### 存储方案

- 初始、暂停、关闭和完成时写原子 Checkpoint。
- 活动输入写每 session 的有序事务 journal。
- journal record 包含 revision、receipt 和可重放 delta，不包含预编辑文本。
- 单 session 队列保证有序写。
- 恢复时加载 Checkpoint，再重放 revision 更高的完整 journal records。
- compaction 先原子写入覆盖旧 revision 的 Checkpoint，再清理已覆盖 records；
  崩溃留下的旧 record 通过 revision 忽略。

采用分段、带校验和的 JSONL journal：

- 每条 record 是单行 envelope，包含 payload 和基于规范化 payload 计算的校验和。
- 使用单 session 队列打开当前 segment、追加完整行并 `sync`，成功后才允许 applied ack。
- 每 256 条 record 滚动到新 segment，避免单文件无限增长。
- 恢复只接受换行完整、schema 合法且校验和匹配的连续 record；只允许丢弃最后一个
  segment 的不完整尾部。
- pause/close/complete 时写新 Checkpoint，再删除 revision 已被覆盖的完整旧 segments。
- 实现前测试固定崩溃恢复、segment 滚动和文件数量预算。

### 预计文件

- 新增 `src/typing/adapters/storage/PracticeTransactionJournalStore.ts`
- 修改 `src/typing/adapters/storage/WorkspaceSessionStore.ts`
- 修改 `src/typing/adapters/storage/index.ts`
- 修改 `src/typing/application/PracticeSessionRecovery.ts`
- 新增 `src/test/unit/typingPracticeTransactionJournal.test.ts`
- 修改 `src/test/unit/typingWorkspaceStores.test.ts`
- 修改 `src/test/unit/practiceSessionRecovery.test.ts`

### RED

1. append 后可按 revision 顺序恢复 delta 与 receipt。
2. 重复 transaction id 不产生第二条领域记录。
3. 尾部半写 record 不覆盖最后完整 revision。
4. Checkpoint 之后的 records 被重放，已覆盖 records 被忽略。
5. compaction 崩溃前后都能恢复到同一权威 revision。
6. Store 失败不改变内存 Session，也不生成 applied ack 条件。
7. 同一个 receipt 在 Extension Host 重载后仍可查询。
8. 10,000 次短输入不要求每次序列化完整历史，文件数量或 journal 大小满足已固定预算。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticeTransactionJournal.test.ts src/test/unit/typingWorkspaceStores.test.ts src/test/unit/practiceSessionRecovery.test.ts
```

### GREEN

- 实现 append/recover/findReceipt/compact。
- 使用现有 `AtomicFileWriter` 和安全 session id 校验。
- 所有 record 运行时校验 schema、session id、revision 和 transaction id。
- 恢复只重放连续 revision；gap 进入可恢复错误，不猜测跳过。
- 在暂停、关闭、完成时执行安全 compaction；正常每键路径不做全历史重写。

### 退出证据

- 崩溃 fixture、重复恢复和性能测试通过。
- Store 失败时内存与磁盘都保持最后已确认 revision。

## 7. 工作包 4：应用层单 in-flight 事务协调器

### 目标

把 revision、receipt、领域 delta、持久化、完成 Result 和 Snapshot 投影组合成唯一 Host
事务入口。

### 预计文件

- 新增 `src/typing/application/PracticeInputTransactionCoordinator.ts`
- 新增 `src/typing/application/PracticePanelSnapshotProjector.ts`
- 修改 `src/typing/application/PracticeApplicationCoordinator.ts`
- 修改 `src/typing/application/events/index.ts`
- 修改 `src/typing/application/ports/index.ts`
- 修改 `src/test/typing/helpers/inMemoryTypingPorts.ts`
- 新增 `src/test/unit/practiceInputTransactionCoordinator.test.ts`
- 新增 `src/test/unit/practicePanelSnapshotProjector.test.ts`
- 修改 `src/test/unit/practiceApplicationSessionIntegration.test.ts`

### RED

1. base revision 正确时：计算 delta → 持久 receipt → 应用内存状态 → 返回 ack。
2. Store 写失败时：revision、Session 和 Result 均不前移，Promise 被观察。
3. 相同 transaction id 重试不再调用 Domain，只返回 receipt 结果。
4. receipt 已存在但内存 revision 落后时，从 journal 恢复后返回当前 Snapshot。
5. stale base revision 返回 stale，不消费输入。
6. blocked 事务返回 consumed/unconsumed 和权威错误投影。
7. correction in-flight 时第二个 correction 被拒绝或合并为同一等待结果。
8. 最终输入与迟到输入竞争只生成一个 Result。
9. ack 只在 Session/receipt 以及完成时的 Result 持久化满足后置条件后返回。
10. Snapshot 只包含当前目标附近的有界窗口，不复制全文逐字投影。

运行：

```powershell
npm run test:unit -- src/test/unit/practiceInputTransactionCoordinator.test.ts src/test/unit/practicePanelSnapshotProjector.test.ts src/test/unit/practiceApplicationSessionIntegration.test.ts
```

### GREEN

- 为每个 session 建立 Promise 串行队列，失败不毒化后续队列。
- 使用候选 delta，不在持久化前修改权威 Session。
- 对 duplicate 请求返回当前 Snapshot，而不是旧页面的完整 ack。
- 复用现有 `ResilientPracticeResultCommitter` 的 pending result 合约。
- 所有注册边界调用统一 `reportError`，不留下 unhandled rejection。

### 退出证据

- 聚焦测试全部通过。
- 故意注入 Store/Result/PostMessage 失败均无双重消费。

## 8. 工作包 5：严格版本化 Panel 协议

### 目标

建立可运行时校验的 Client/Host 消息协议，不接入真实 Panel。

### 预计文件

- 新增 `src/typing/adapters/panel/typingPracticePanelProtocol.ts`
- 新增 `src/typing/adapters/panel/index.ts`
- 修改 `src/typing/adapters/index.ts`
- 新增 `src/test/unit/typingPracticePanelProtocol.test.ts`

### RED

1. `practice/ready`、submit、correct、requestSnapshot、pause 的合法消息通过。
2. 缺少 protocol/session/panel/sequence/transaction/base revision 时拒绝。
3. 未知 type、未知 input kind、空 transaction id、非正整数 sequence 被拒绝。
4. ack 同时包含 transaction revision、current revision 和当前 Snapshot。
5. duplicate receipt 可用新 panel instance/sequence 重新封装。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticePanelProtocol.test.ts
```

### GREEN

- 定义单一协议版本常量。
- 提供显式 type guard/decoder，不使用未经校验的类型断言。
- 协议对象只含 JSON 可序列化值。

### 退出证据

- 协议测试通过。
- Domain/Application 不依赖协议文件。

## 9. 工作包 6：Webview 纯输入状态机

### 目标

先完成与 DOM 分离的 composition/transport/authority 正交状态和单 in-flight FIFO。

### 预计文件

- 新增 `src/webview/typingPracticeInputState.ts`
- 新增 `src/test/unit/typingPracticeInputState.test.ts`

### RED

1. loading/resyncing 禁止捕获输入。
2. composition start/update 只更新 draft，不发消息。
3. composition end 产生一个稳定 transaction id。
4. 同一 composition 的尾随 input 被精确去重，不使用 timer。
5. direct 输入立即入 FIFO。
6. 只有队首发送；发送时才绑定当前 base revision 和 panel sequence。
7. ack 后发送下一项。
8. blocked ack 清除未发送 submit，并把活动 composition 标记 `discardOnEnd`。
9. completed ack 清空 pending 并拒绝后续输入。
10. correction in-flight 时重复 Backspace 不创建第二个事务。
11. 新 panel instance 恢复 pending transaction id，但重建 sequence/envelope。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticeInputState.test.ts
```

### GREEN

- 实现纯 reducer 和 effect 描述，不访问 DOM 或 VS Code API。
- transaction id 由注入端口生成，测试使用确定性 id。
- 不添加 debounce、稳定窗口或候选内容判断。

### 退出证据

- 状态机测试覆盖每条状态转换。
- `rg` 证明输入提交路径没有用于推断上屏的 timer。

## 10. 工作包 7：真实 DOM 输入控制器与浏览器事件测试

### 目标

使用真实可见 `<input type="text">` 接收 composition/input/paste/beforeinput，
并把事件转换为工作包 6 的 reducer action。

### 预计文件

- 新增 `src/webview/typingPracticePanelApp.ts`
- 新增 `src/webview/typingPracticePanelStyles.css`
- 新增 `tests/fixtures/layout/typing-practice-panel-harness.html`
- 新增 `tests/layout/typing-practice-panel-input.spec.ts`
- 修改 `scripts/build.mjs`
- 修改 `src/test/unit/buildContract.test.ts`

### RED

在 Chromium 页面中真实 dispatch 并观察失败：

1. `compositionstart → z → zh → zhu` 只显示中性 draft，消息数组为空。
2. `compositionend('主')` 只 post 一个 composition submit。
3. 尾随非 composing input 不重复 post。
4. composition cancel/空值不 post。
5. 非 composition `a` 立即 post direct submit。
6. paste 只 post paste submit，DOM 不保留可编辑历史。
7. blocked Backspace 只 post correct；重复按下不重复。
8. 候选切换期间等待任意时长都不改变进度或样式。
9. Tab/Shift+Tab/F6 允许焦点导航；方向、Home/End 不移动练习 caret。
10. Ctrl+A/X/Z/Y 不修改历史，Ctrl+V 走受控 paste。
11. 页面隐藏时未结束 composition 取消。

运行：

```powershell
npm run build:webview
npm run test:layout -- tests/layout/typing-practice-panel-input.spec.ts
```

### GREEN

- 绑定标准 composition/beforeinput/input/paste 事件。
- 从真实 input value 读取浏览器生成文本，不从 `keydown.key` 拼接。
- input 保持可见并位于当前目标位置。
- composition 尾随 input 去重只基于 composition id 与 DOM 变化序号。
- 将新入口加入 `scripts/build.mjs`，输出 `media/typingPracticePanelApp.js` 和 CSS。

### 退出证据

- 浏览器事件矩阵通过。
- 改变候选停留时间不会改变测试结果。

## 11. 工作包 8：Panel 渲染、窗口化与可访问性

### 目标

渲染权威 Snapshot，不在 Webview 复制领域判定。

### 预计文件

- 新增 `src/webview/typingPracticePanelRender.ts`
- 修改 `src/webview/typingPracticePanelApp.ts`
- 修改 `src/webview/typingPracticePanelStyles.css`
- 修改 `tests/fixtures/layout/typing-practice-panel-harness.html`
- 新增 `tests/layout/typing-practice-panel-layout.spec.ts`
- 新增 `src/test/unit/typingPracticePanelRender.test.ts`

### RED

1. 正确、错误、composition、pending、当前目标和剩余文字分别使用正确语义 class。
2. 错误同时有文本提示，不只依赖颜色。
3. 输入控件是可见、可命名的真实 input，关闭 spellcheck/autocomplete。
4. aria-live 不播报每次 composition update。
5. 失焦显示“点击继续输入”，不轮询抢焦点。
6. 浅色、深色、高对比和窄宽度可读。
7. 200,000 字素 Snapshot 只创建有界 DOM 节点。
8. 输入控件宽度随 draft 调整，候选锚点保持在当前目标附近。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticePanelRender.test.ts
npm run build:webview
npm run test:layout -- tests/layout/typing-practice-panel-layout.spec.ts
```

### GREEN

- 只消费 `PracticePanelSnapshot`。
- 使用 VS Code Webview CSS variables。
- 渲染当前目标附近窗口；禁止全文逐字 DOM。
- 正常操作后聚焦输入；程序恢复只显示可操作提示，等待用户动作。

### 退出证据

- 单元与 Playwright layout/accessibility 测试通过。
- DOM 节点预算和主题截图检查通过。

## 12. 工作包 9：VS Code PracticeWebviewPanel 与生命周期

### 目标

把应用事务协调器接入真实 WebviewPanel，但暂不删除旧输入注册。

### 预计文件

- 新增 `src/typing/adapters/panel/PracticeWebviewPanel.ts`
- 新增 `src/typing/adapters/panel/typingPracticePanelHtml.ts`
- 新增 `src/typing/registration/practicePanelRegistration.ts`
- 修改 `src/test/shims/vscode.ts`
- 新增 `src/test/unit/typingPracticeWebviewPanel.test.ts`
- 新增 `src/test/unit/typingPracticePanelRegistration.test.ts`
- 修改 `src/test/unit/typingWebviewState.test.ts`

### RED

1. 同一活动 session 打开两次只创建一个 panel，第二次 reveal。
2. ready 后返回权威 Snapshot。
3. submit/correct 进入同一 session 队列。
4. duplicate 请求使用当前 panel/sequence 重新封装。
5. dispose/pause 不越过已经接收的输入事务。
6. 页面隐藏后可用 getState/setState 恢复，不启用 `retainContextWhenHidden`。
7. 新 panel instance 拒绝旧 instance 迟到消息。
8. postMessage、Store 或协调器失败被统一观察并显示恢复错误。
9. CSP 只允许 nonce 脚本和扩展本地资源。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticeWebviewPanel.test.ts src/test/unit/typingPracticePanelRegistration.test.ts src/test/unit/typingWebviewState.test.ts
```

### GREEN

- 实现 Panel owner、HTML、消息路由和 dispose。
- 使用无状态重建，不使用 Custom Editor save/dirty 生命周期。
- 面板关闭后暂停权威 Session，保留侧栏恢复入口。
- 完成后显示结果摘要并拒绝迟到输入。

### 退出证据

- Panel、协议、生命周期聚焦测试通过。
- 没有把 `vscode` 导入 Domain/Application。

## 13. 工作包 10：一次性运行时切换与旧链路删除

### 目标

把开始、恢复、暂停、完成全部切换到 Practice Webview，并删除原生文档输入架构。

### 预计文件

- 修改 `src/extension.ts`
- 修改 `src/typing/application/PracticeApplicationCoordinator.ts`
- 修改 `src/typing/application/TypingViewPracticeCommands.ts`
- 修改 `src/typing/application/PracticeSessionRecovery.ts`
- 修改 `src/typing/registration/index.ts`
- 修改 `src/typing/adapters/index.ts`
- 修改 `src/typing/adapters/view/typingViewProtocol.ts`
- 修改 `src/webview/typingSetupForm.ts`
- 修改 `src/webview/typingViewRender.ts`
- 修改 `package.json`
- 修改 `src/reader/ImmersiveDecorationPresenter.ts`
- 删除 `src/typing/adapters/editor/`
- 删除 `src/typing/registration/editorRegistration.ts`
- 删除对应原生编辑器单元测试
- 新增或修改：
  - `src/test/unit/typingCutoverIntegration.test.ts`
  - `src/test/unit/typingPackageCutover.test.ts`
  - `src/test/unit/packageContributions.test.ts`
  - `src/test/unit/extension.test.ts`
  - `src/test/unit/typingViewRender.test.ts`
  - `src/test/unit/typingSetupForm.test.ts`
  - `src/test/unit/typingLegacyStackRemoval.test.ts`

### RED

先把切换契约写成失败测试：

1. Start/Resume 调用 PracticeWebviewPanel，不调用 Editor Port。
2. setup 不再渲染“输入方式 / 稳定上屏判定”。
3. 新保存的 Plan/Preferences 不包含 evaluation mode。
4. package 不再贡献 `moyuplus-practice` language/configuration defaults/keybindings。
5. activation 不再注册 FileSystemProvider、TextDocument listener 或 save/close listener。
6. Reader 不再按 `moyuplus-practice` scheme 特判。
7. 仓库运行时代码不存在 stable/candidate/document-change 输入推断。
8. 旧活动 checkpoint 可迁移并在新 Panel 恢复。

运行：

```powershell
npm run test:unit -- src/test/unit/typingCutoverIntegration.test.ts src/test/unit/typingPackageCutover.test.ts src/test/unit/packageContributions.test.ts src/test/unit/extension.test.ts src/test/unit/typingViewRender.test.ts src/test/unit/typingSetupForm.test.ts src/test/unit/typingLegacyStackRemoval.test.ts
```

### GREEN

- 将 `PracticeEditorPort` 替换为更窄的 `PracticePanelPort`，或把现有端口重命名并收窄。
- extension composition root 只实例化新 Panel/transaction/journal 链路。
- 删除旧 editor adapters、注册、语言配置桥、命令路由和清理后的无用 shim。
- 移除 manifest 语言、配置覆盖和 scheme keybindings。
- 更新旧数据恢复入口，使其只使用 Session/Snapshot checkpoint。
- 不保留 feature flag 双运行路径。

### 退出证据

- 切换测试通过。
- `rg` 和架构守卫证明旧输入链路不在运行时代码或 package 中。
- TypeScript 和 build 通过。

## 14. 工作包 11：Extension Host、恢复竞争与性能

### 目标

验证真实 VS Code Panel 集成、生命周期和性能，不冒充真实输入法验收。

### 预计文件

- 新增 `src/test/extensionHost/typingPracticeWebviewHost.ts`
- 修改 `src/test/extensionHost/index.ts` 或当前测试入口
- 删除或改写 `src/test/extensionHost/typingPracticeEditorHost.ts`
- 删除旧 `typingPracticeImeManual.ts` 的稳定窗口逻辑
- 新增 `src/test/unit/typingPracticePanelPerformance.test.ts`
- 修改 `scripts/run-extension-host-tests.mjs`

### RED

1. 自由粘贴设置后创建真实 WebviewPanel。
2. 不打开 `moyuplus-practice:` TextDocument。
3. 模拟 panel 消息完成 direct、composition payload、block/correct。
4. close/resume 获得相同权威 revision。
5. Extension Host 重载 fixture 重放同 transaction id 不重复推进。
6. 完成与迟到输入只写一份 Result。
7. 控制台和 Promise 观察器无未处理 rejection。
8. 200,000 字素目标 Snapshot 有界，提交到 ack p95 小于 50 ms。

运行：

```powershell
npm run test:unit -- src/test/unit/typingPracticePanelPerformance.test.ts
npm run test:extension-host
```

### GREEN

- 只增加使真实集成测试通过的适配代码。
- 自动测试明确标注 composition payload 是协议模拟，不声称等价于操作系统 IME。
- 性能测量分开记录 Webview reducer、Host transaction 和 projection。

### 退出证据

- Extension Host 退出码为 0。
- 无 save、dirty、rollback 或 unhandled Promise 错误。
- 性能预算通过并记录硬件/环境。

## 15. 工作包 12：文档更新与 Windows 真实输入法验收

### 目标

更新用户文档，并执行不能由自动测试替代的真实输入法矩阵。

### 预计文件

- 修改 `docs/typing-practice-settings.md`
- 重写 `docs/typing-practice-verification.md`
- 修改 `README.md`
- 修改 `CHANGELOG.md`
- 修改 `progress.md`

### RED

文档契约测试先失败：

- 文档不得再指导用户选择“稳定上屏判定”。
- 验收不得再通过原生文档、延时窗口或模拟完整文本声称 IME 通过。
- 必须包含微软拼音候选切换、候选停留、取消、词组、错误修正和关闭恢复。

对应守卫可加入：

- `src/test/unit/typingPackageCutover.test.ts`
- `src/test/unit/typingLegacyStackRemoval.test.ts`

### GREEN

- 更新设置与验收说明。
- 提供新的人工入口，只负责启动真实产品流程和记录结果，不注入伪造 tracker。

### 人工验收

使用 Windows 微软拼音，素材：

```text
abc主题检查：错误修正
```

逐项记录：

1. 英文关闭输入法输入 `abc`，全部正确。
2. 开启微软拼音输入 `zhu`，多次切换候选并任意停留：
   - `zhu` 中性；
   - 进度不动；
   - 不报错、不退出。
3. 确认“主”，只提交一次并立即推进到“题”。
4. 分别使用单字和词组候选完成“主题”。
5. Esc 取消候选不产生输入。
6. 输入错误 `X`，只有 `X` 红色；退格后继续。
7. 快速英文、paste、切换标签、关闭恢复和完成正常。
8. 控制台无未处理 Promise、save 错误或自动退出。

用户实际执行并确认前，不把该工作包或整体任务标为 complete。

## 16. 最终回归与退出条件

### 自动验证

```powershell
npm run compile
npm run test:unit
npm run test:layout
npm run test:extension-host
git diff --check
```

同时执行静态守卫：

```powershell
rg -n "moyuplus-practice|PracticeDocumentLifecycleAdapter|PracticeFileSystemProvider|WorkspacePracticeEditorAdapter|confirmCommittedInput|committedBatch|稳定上屏" src package.json
```

预期：运行时代码和 manifest 无旧链路；只允许 migration、历史兼容 fixture 或明确的负向测试中出现。

### 完成定义

- 每个新生产行为都有先失败后通过的测试证据。
- Webview 组合状态、单 in-flight FIFO、Host 幂等与恢复测试全部通过。
- 原生文档输入架构和稳定上屏设置已一次性删除。
- 全量自动验证通过且输出无未处理 Promise。
- Windows 微软拼音人工矩阵由用户实际完成并确认。

在最后一项人工确认之前，只能报告“自动实现与自动验证完成，等待真实输入法验收”，
不能报告功能已经可用。

## 17. 计划提交边界

建议按以下可回滚提交组织实施：

1. `Add typing input transaction contracts`
2. `Add durable practice transaction journal`
3. `Add practice input transaction coordinator`
4. `Add typing practice panel protocol`
5. `Add Webview composition input state machine`
6. `Add typing practice Webview panel`
7. `Cut over typing practice to Webview input`
8. `Remove native practice document stack`
9. `Update typing practice verification`

每次提交前只暂存本工作包相关文件；不得把当前工作区中无关的用户改动一并提交。
