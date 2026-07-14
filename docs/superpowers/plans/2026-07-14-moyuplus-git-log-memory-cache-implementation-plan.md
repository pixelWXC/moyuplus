# MoyuPlus Git Log 内存缓存实施计划

- 日期：2026-07-14
- 依据：[Git Log 内存缓存设计规格](../specs/2026-07-14-moyuplus-git-log-memory-cache-design.md)
- 当前基线：`0.0.6`，Git Log Reader 已发布
- 策略：测试先行、单条内存缓存、严格单飞、首帧缓存渲染、后台校验、显式生命周期释放
- 当前状态：实现与自动验证完成，待 Phase 6 人工验收

## 实施结果（2026-07-14）

- 已完成 Phase 0–5：查询指纹、不可变快照、白名单消息、严格单飞、单条缓存、原子 session、mode generation、缓存首帧、刷新失败提示与生命周期释放均已实现。
- 全量单元测试：39 个文件、180 个测试通过。
- 全量 Chromium 布局与隐私测试：13 个测试通过。
- TypeScript 检查、生产构建与 `git diff --check` 通过，Webview 生成物已与源文件同步。
- Phase 6 仍需在真实 Extension Development Host 与真实 Git 仓库中人工执行本计划第 10 节场景。

## 1. 执行原则

每项任务严格遵循 RED → GREEN → REFACTOR：

1. 先补一个只约束目标行为的最小失败测试。
2. 单独运行目标测试，确认失败原因是能力尚不存在，而不是夹具或环境错误。
3. 只实现使当前测试通过的最小代码。
4. 运行目标测试和直接受影响的既有测试。
5. 全部绿色后再整理命名、提取纯函数或缩小 Provider 职责。

不得先写完缓存和并发状态机再补测试。指纹、查询快照、消息白名单、任务串行、mode generation、deferred outcome 和 dispose 都必须先有可观察的 RED。

## 2. 工作树与提交保护

实现开始前：

```powershell
git status --short
git log -6 --oneline --decorate
```

要求：

- 保留用户已有改动，不执行 `git reset --hard`、`git checkout --`、`git stash` 或清理未跟踪文件。
- 每个 Phase 开始前检查目标文件 diff；有重叠改动时使用小范围 patch。
- 不手工编辑 `media/readerApp.js`、CSS bundle 或 source map；只通过构建脚本生成。
- 每个 RED/GREEN 命令和结果记录到现有 `progress.md`，但不重写既有历史。
- 除非用户再次明确要求，不自动提交实现代码；设计和计划文档提交保持独立。

## 3. 目标边界

计划新增两个小模块，并在现有边界内增量修改：

```text
src/
  git/
    gitLogQuery.ts                 # 查询快照、无歧义 key、Webview 白名单投影
    gitLogRefreshController.ts     # 一个 active job + 一个 latest pending 的单飞状态机
  test/unit/
    gitLogQuery.test.ts
    gitLogRefreshController.test.ts
```

现有文件职责：

- `gitLogService.ts`：执行 Git、解析输出、在原始输出仍可用时生成一次结果指纹。
- `gitLogRefreshController.ts`：严格串行执行查询，拥有 active/pending/abort/finally 状态，不拥有 UI。
- `ReaderViewProvider.ts`：拥有单条缓存、唯一 UI session、mode generation 和刷新 outcome 路由。
- `gitLogModeCoordinator.ts`：只协调 persisted active/inactive、Reader 恢复和原子 Git session 开关。
- `gitLogMessages.ts`：定义严格的 Webview 白名单协议。
- `gitLogState.ts` / `gitLogView.ts`：处理缓存首帧、刷新提示和分页稳定性。
- `readerApp.ts`：只处理顶层 mode generation 与模式切换。

不得创建多仓库 Map、LRU、TTL、文件监听器或持久化缓存。

## 4. Phase 0：基线与测试夹具

### Task 0.1：确认自动测试基线

只读运行：

```powershell
npm run test:unit -- src/test/unit/gitLogService.test.ts src/test/unit/gitLogMessages.test.ts src/test/unit/gitLogModeCoordinator.test.ts src/test/unit/gitLogViewProvider.test.ts src/test/unit/gitLogWebviewState.test.ts
npm run test:layout -- tests/layout/git-log-layout.spec.ts
npm run compile
```

若基线失败：

- 记录现有失败和本功能是否相关。
- 不为通过基线而顺手修改无关代码。
- 只有阻断本功能测试的既有失败才单独处理并说明。

### Task 0.2：补充可控异步夹具

修改：

- `src/test/shims/vscode.ts`
- 对应 shim 测试或 `gitLogViewProvider.test.ts` 内局部夹具

先写失败测试，确保夹具能观察：

- `webview.postMessage` 延迟、按调用单独 resolve 和真实投递顺序。
- hide、reveal、Webview dispose 与 extension disposable 分别触发。
- `AbortSignal` 是否触发，但 deferred runner 可选择暂时忽略 abort。
- 活动文件与 workspace roots getter 的读取次数。
- 同时运行的 `service.load` 数量和历史最大值。

夹具不得使用真实 `setTimeout` 表达竞态；使用 deferred Promise 和显式 resolve/reject。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogViewProvider.test.ts src/test/unit/gitLogModeCoordinator.test.ts
```

## 5. Phase 1：纯查询模型、指纹与消息边界

### Task 1.1：共享 maxCommits 规范化与结果指纹

修改：

- `src/git/gitLogModels.ts`
- `src/git/gitLogService.ts`
- `src/test/unit/gitLogModels.test.ts`
- `src/test/unit/gitLogService.test.ts`

RED 测试顺序：

1. 导出一个共享 `normalizeGitLogMaxCommits()`，覆盖 clamp、round、非有限数回退。
2. Preferences 与 `GitLogService.load()` 使用同一函数，不再各自实现边界逻辑。
3. 相同仓库根、分支、detached 和原始 Git 输出生成相同指纹。
4. 任一元数据或任一输出字节变化都会改变指纹。
5. 带 NUL、分隔符和 Unicode 的字段不会造成元数据编码碰撞。
6. `GitLogResult` 带内部 `fingerprint`，但提交解析结果不变。

GREEN 实现：

- 使用 `node:crypto` 的 SHA-256 或等价稳定哈希。
- 元数据用长度前缀或 tuple 编码；原始 Git 输出作为最终段参与哈希。
- 在 `load()` 已获得原始输出时计算一次，不对 commits 再做逐字段深比较。

更新所有构造 `GitLogResult` 的测试桩，明确提供 fingerprint；不要用宽泛 `as never` 隐藏遗漏。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogModels.test.ts src/test/unit/gitLogService.test.ts
```

### Task 1.2：不可变查询快照与无歧义 key

创建：

- `src/git/gitLogQuery.ts`
- `src/test/unit/gitLogQuery.test.ts`

RED 测试覆盖：

- workspace roots 和 active file 通过 `path.normalize`。
- roots 保留原顺序；active file 缺失使用 `undefined` 语义。
- `maxCommits` 使用共享 clamp/round。
- `queryKey` 使用 JSON tuple 或等价无歧义编码。
- 含 `|`、NUL 类似文本、反斜杠和相同前缀的不同路径不会碰撞。
- 同一输入生成稳定 key，roots 顺序、active file 或 max 改变会改变 key。
- 构造快照时每个 getter 只读一次。

快照对象同时用于缓存命中和 `service.load`，调用查询时只额外添加 `signal`。

### Task 1.3：Webview 显式白名单投影与协议

修改：

- `src/git/gitLogMessages.ts`
- `src/test/unit/gitLogMessages.test.ts`
- 必要时复用 `src/git/gitLogQuery.ts`

RED 测试覆盖：

- `toGitLogDisplayResult()` 只返回 `repositoryName`、`branchName`、`detached` 和 `commits`。
- 返回对象不含 `repositoryRoot`、`fingerprint` 或任意未来测试字段。
- `modeGitLog` 要求正整数 `modeGeneration`，可选 `cached` 必须是完整 display result。
- `gitLogReady` 同样只接受 display result 白名单。
- 新增 `gitLogRefreshFailed` 和 `modeInvalidated` 守卫。
- cached/ready 出现内部字段或未知字段时被拒绝。
- 原 Reader 消息和设置保存消息不受影响。

禁止在 Provider 中继续使用 `{ ...result }` 构造 Webview 消息。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogQuery.test.ts src/test/unit/gitLogMessages.test.ts src/test/unit/gitLogService.test.ts
```

## 6. Phase 2：严格串行的刷新控制器

### Task 2.1：建立单飞控制器最小 API

创建：

- `src/git/gitLogRefreshController.ts`
- `src/test/unit/gitLogRefreshController.test.ts`

Provider 创建并拥有该控制器。建议最小能力：

- `peekReusableToken(queryKey)`：只返回同 key 且未请求 abort 的 active token。
- `request(snapshot)`：启动、复用或排队，返回该请求最终观察的 token/状态。
- `dispose()`：标记 disposed、清 pending、abort active，迟到结果静默。
- 构造函数接收 `service.load` 和唯一 `onOutcome` 回调。

API 名称可调整，但必须保持：没有订阅者数组，没有每次切换新增 `.then`，每个真实 job 只安装一个完成处理器。

### Task 2.2：同 key 复用与完成处理器上限

RED 测试：

1. 第一次 request 启动一个 load。
2. 活动 job 未 settle 时重复同 key 只返回相同 token，load 仍为一次。
3. 重复一百次同 key 不增加完成处理器计数。
4. 成功或失败只产生一个 outcome。
5. settle 后 active job、Promise 和 AbortController 引用被释放。

### Task 2.3：不同 key 严格串行与 latest pending

RED 测试：

1. A 运行时请求 B：A 收到 abort，B 只进入唯一 pending。
2. A 尚未 settle 时绝不启动 B，`maxConcurrentLoads === 1`。
3. 等待期间 B→C→D 只保留 D；A settle 后只启动 D。
4. 已请求 abort 的 A 不能因请求重新变成 A 而复用；它 settle 后按最新 A 快照重启。
5. runner 忽略 abort 并让 A 成功 resolve：A 不写 outcome，finally 只启动一次最新 pending。
6. runner 忽略 abort 并让 A reject：不产生用户错误，仍释放并 drain pending。
7. 旧 job finally 不能清除后来建立的新 job。

测试 runner 同时记录 `activeProcessCount` 和 `maxConcurrentProcesses`，断言均不超过 1。

### Task 2.4：dispose

RED 测试：

- dispose 清空 pending，标记 active 为 abortRequested 并 abort。
- dispose 后 request 不启动查询。
- active 迟到成功/失败均不调用 outcome。
- active settle 后释放所有引用且不 drain pending。
- dispose 可重复调用。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogRefreshController.test.ts
```

## 7. Phase 3：原子 session、缓存和 Provider 生命周期

### Task 3.1：协调器改为原子 Git session 接口

修改：

- `src/git/gitLogModeCoordinator.ts`
- `src/test/unit/gitLogModeCoordinator.test.ts`
- `src/reader/ReaderViewProvider.ts`

RED 测试定义新接口：

- 用单个 `openGitSession(sessionId)` 取代 `showGitLoading()` 后再 `sessions.start()` 的两阶段调用。
- `detachGitSession(sessionId)` 只解除匹配 session，旧取消不能解除新 session。
- `openGitSession` pending 时 toggle exit/hide/dispose，返回后协调器复核 `currentSessionId`，不得继续启动查询。
- 快速奇偶切换、mode 持久化和 Reader 恢复既有测试保持绿色。

只重构会话边界，不改变 active/inactive 持久化顺序。

### Task 3.2：Provider 单条缓存与缓存首帧

修改：

- `src/reader/ReaderViewProvider.ts`
- `src/test/unit/gitLogViewProvider.test.ts`

Provider 新增有界运行时状态：

- 一个 `GitLogCacheEntry | undefined`。
- 一个 `GitLogUiSession | undefined`。
- 一个 Provider-owned `GitLogRefreshController`。
- 一个单调递增 `modeGeneration`。
- 一个幂等 disposed 标记。

RED 测试顺序：

1. 首次进入无缓存，`modeGitLog` 不含 cached，随后 fresh ready 写入缓存。
2. 同 queryKey 再进入，首条 `modeGitLog` 直接带 cached，后台查询尚未 resolve。
3. 新指纹等于 `presentedFingerprint` 时不再 post ready。
4. 新指纹不同才替换缓存并 post ready。
5. 新 queryKey 不展示旧缓存，成功后只保留新条目。
6. 缓存始终只有一个，最大 commits 仍由 1000 上限约束。
7. 实际 cached/ready 消息精确等于 display result 白名单。

测试通过公开消息和可注入 service 观察行为，不读取私有字段；缓存数量可通过上下文切换后的命中行为证明。

### Task 3.3：postMessage 等待窗口与 deferred outcome

继续在 `gitLogViewProvider.test.ts` 先写 RED：

1. 同 key 活动 job 在新 `modeGitLog` post pending 时完成：不提前发 ready，只保存一个 outcome。
2. 首帧 post 完成后只消费一次 outcome，不启动第二次 load。
3. 同场景失败：有 cached 发 refresh failed，无 cached 发 error，均不重复查询。
4. A 活动时开始 delayed `modeGitLog(B)`；A 成功最多更新 A 缓存，不向 B session 发消息。
5. 同场景 A 失败保持静默，不把错误重新标成 B session。
6. outcome 必须同时匹配 queryKey、observed job token、session ID 和 generation。
7. 首帧 post 返回后若 session/store/view 已失效，不请求刷新也不消费到错误页面。

实现中 `modeDelivered` 从 false 到 true 只能转换一次；`deferredOutcome` 最多一个，消费后立即清除。

### Task 3.4：mode generation 与 tombstone

修改：

- `src/reader/ReaderViewProvider.ts`
- `src/git/gitLogMessages.ts`
- `src/test/unit/gitLogViewProvider.test.ts`

RED 测试：

- `modeGitLog`、`modeLibrary`、`modeReaderRestore` 每次顶层转换使用更高 generation。
- cancel、hide 和 Webview detach 即使没有目标页面，也递增 generation 并投递 `modeInvalidated`。
- 顺序为“modeGitLog 未交付 → hide → hidden exit → tombstone → 旧 modeGitLog 迟到 → reveal”时，旧页面不能复活。
- 旧 detach 不能使新 session 失效。

### Task 3.5：Webview dispose 与 extension deactivate 分流

修改：

- `src/reader/ReaderViewProvider.ts`
- `src/test/unit/gitLogViewProvider.test.ts`
- `src/test/unit/extension.test.ts`

RED 测试：

- hide/Webview dispose 只 detach UI，允许同 key active refresh 完成并写缓存。
- Webview 重建后能用 Provider 缓存首帧渲染，并按规则刷新或复用尚未 settle 的同 key job。
- `registerReaderView()` 把 Provider 的幂等 `dispose()` 作为独立 disposable 注册到 `context.subscriptions`。
- extension deactivate 会清缓存、清 pending、abort active，所有迟到回调静默。
- dispose 后不再接受 Webview 消息或启动新查询。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogModeCoordinator.test.ts src/test/unit/gitLogViewProvider.test.ts src/test/unit/extension.test.ts
```

## 8. Phase 4：Webview 缓存首帧、提示与代际防护

### Task 4.1：Reducer 缓存 ready 与刷新失败状态

修改：

- `src/webview/gitLogState.ts`
- `src/test/unit/gitLogWebviewState.test.ts`

RED 测试：

- begin + cached 在首次可见状态直接为 ready，不经过 loading render。
- begin 无 cached 保持现有 loading。
- `refreshFailed` 只接受当前 session，保持 ready、commits、pageIndex、pageCount 和设置状态。
- 刷新失败只增加 `refreshNotice`。
- 新 session、fresh ready、invalidate 和 dispose 清除旧 notice。
- fresh ready 指纹变化路径回到第一页；相同指纹不会从 Provider 发 action。

### Task 4.2：GitLogView 单次首帧与非阻断提示

修改：

- `src/webview/gitLogView.ts`
- `src/webview/styles.css`
- `src/test/unit/buildContract.test.ts`
- 必要时新增轻量 DOM contract test

实现：

- `begin()` 在第一次 `render()` 前应用 session、preferences 和可选 cached。
- 缓存命中不创建 loading notice。
- `gitLogRefreshFailed` 在仓库/分支上下文区域附近显示 `role="status"` 的轻量提示。
- 提示不遮挡正文、不禁用翻页、不改变正文 overflow。
- dispose 继续释放 paginator/layout 并清空 commits、notice 和 DOM 引用。

### Task 4.3：readerApp 顶层 mode generation

修改：

- `src/webview/readerApp.ts`
- `src/test/unit/buildContract.test.ts`
- 相关 Webview 单元测试

RED 测试：

- Webview 记录最大已接受 `modeGeneration`。
- generation 小于或等于当前值的 `modeGitLog`、`modeLibrary`、`modeReaderRestore` 和 `modeInvalidated` 被拒绝。
- 接受 tombstone 时 dispose GitLogView、进入 boot、清空可见 Git DOM。
- 更高 generation 的 reveal/bootstrap 可正常建立目标页面。
- 普通 ready/error 仍要求当前 Git session ID。

验证：

```powershell
npm run test:unit -- src/test/unit/gitLogMessages.test.ts src/test/unit/gitLogWebviewState.test.ts src/test/unit/buildContract.test.ts
npm run build:webview
```

## 9. Phase 5：集成、性能回归与构建

### Task 5.1：完整快捷键切换集成

修改：

- `src/test/unit/gitLogViewProvider.test.ts`
- `src/test/unit/gitLogModeCoordinator.test.ts`
- `src/test/unit/typingPracticeIntegration.test.ts`

场景测试：

1. 首次 Alt+Q：无缓存 loading → fresh ready。
2. 退出再进入：cached 首帧 → 后台相同结果静默。
3. 后台结果变化：只发送一次 ready 并回第一页。
4. 后台失败：缓存保留并显示提示；无缓存仍显示错误页。
5. 同 key 快速切出/切入：同一 in-flight load 被复用。
6. query 已 settle 后再次进入：允许启动一次新的后台校验。
7. maxCommits、active file 或 workspace roots 改变：缓存 miss，旧任务按严格串行规则退出。
8. 多根 workspace 不短暂展示另一根缓存。
9. 快速奇偶连按、Reader 恢复和原快捷键路由无回归。

### Task 5.2：资源上限回归

自动测试明确断言：

- cache entry 最大 1。
- active load 最大 1。
- pending snapshot 最大 1，latest-wins。
- UI session 最大 1，deferred outcome 最大 1。
- 每个 job 完成处理器最大 1。
- Webview paginator/layout dispose 次数与建立次数配对。
- 一百次切换后 load、listener、handler 数量不会随切换次数线性增长。

### Task 5.3：完整自动验证

依次运行：

```powershell
npm run test:unit -- src/test/unit/gitLogModels.test.ts src/test/unit/gitLogService.test.ts src/test/unit/gitLogQuery.test.ts src/test/unit/gitLogMessages.test.ts src/test/unit/gitLogRefreshController.test.ts src/test/unit/gitLogModeCoordinator.test.ts src/test/unit/gitLogViewProvider.test.ts src/test/unit/gitLogWebviewState.test.ts src/test/unit/buildContract.test.ts
npm run test:unit
npm run test:layout -- tests/layout/git-log-layout.spec.ts
npm run compile
git diff --check
```

`npm run compile` 会重新生成 Webview bundle。验证 `media/readerApp.js`、`media/readerApp.css` 和 source map 与源文件同步，禁止手工修补构建产物。

## 10. Phase 6：人工验收

**结果：2026-07-14 已通过。** 缓存首帧、后台静默校验、更新/失败提示、快速切换、Webview 重建、启动即 Git Log、Reader 原位置恢复、书架返回与空书架展示均在真实 Extension Development Host 中完成验收。

在真实 Extension Development Host 和真实 Git 仓库中验证：

1. 第一次 `Alt+Q` 正常显示 loading，完成后显示当前仓库和分支。
2. 退出再进入时首帧直接显示上一次结果，没有 loading 闪烁。
3. 仓库无变化时后台查询完成后页面、当前分页和焦点不跳动。
4. 新增提交后再次进入，先显示缓存，随后只更新一次并回到第一页。
5. 临时让 Git 查询失败，缓存内容仍可阅读和翻页，并显示轻量刷新失败提示。
6. 快速反复按 `Alt+Q`，观察不到 Git 进程堆积、持续内存增长或多个错误提示。
7. 多根 workspace 切换活动文件后不会瞬间展示另一仓库缓存。
8. 修改 maxCommits 后缓存正确 miss，并最终使用新数量。
9. hide、关闭侧边栏、销毁并重建 Webview 后缓存与 mode 锁定符合规格。
10. Reload Window 或重启扩展后缓存自然消失，首次进入重新 loading；持久化 mode 锁定仍保持。
11. Reader 恢复、翻页、设置、打字练习和原 `Close Reader` 行为无回归。

若方便，人工压测前后记录扩展宿主 heap 与 `git` 子进程数量；缓存稳定后内存允许小幅波动，但不能随切换次数持续单调增长。

## 11. 停止条件

出现以下任一情况时暂停并报告，不扩大范围：

- 当前用户改动与目标文件发生无法安全合并的同区域冲突。
- VS Code Webview `postMessage` 无法提供同一 Webview 内的有序交付保证，导致 modeDelivered 仍不能约束数据消息顺序。
- `execFile` AbortSignal 的 Promise 在子进程退出前就 settle，无法证明严格 `maxConcurrentProcesses === 1`。
- 需要持久化缓存、监听 Git 文件或缓存多个仓库才能满足验收。
- mode generation 需要破坏既有 Reader 恢复协议才能接入。
- 构建或布局基线存在与本功能无关且会阻断验证的失败。

## 12. 完成定义

只有同时满足以下条件才算完成：

1. 缓存命中首帧不显示 loading；缓存未命中保持现有行为。
2. 每次进入都会启动或复用当前上下文的一次后台校验。
3. 相同指纹不产生 Webview 更新或重新分页，不同指纹只更新一次。
4. 刷新失败保留缓存和翻页能力，无缓存时保持现有错误页。
5. 自动测试证明一个 cache、一个 active job、一个 latest pending、一个 UI session 和一个 deferred outcome 的上限。
6. 旧进程 settle 前不启动新进程；abortRequested、token、queryKey、session 和 generation 竞态全部覆盖。
7. hide、Webview dispose 与 extension deactivate 生命周期分流正确且无迟到消息污染。
8. Webview 消息不含 repositoryRoot、fingerprint 或其他内部字段。
9. 目标测试、全量单元测试、布局测试、类型检查、生产构建和人工验收全部通过。
