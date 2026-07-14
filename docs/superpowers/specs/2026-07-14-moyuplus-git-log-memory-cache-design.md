# MoyuPlus Git Log 内存缓存设计规格

## 1. 背景

当前 Git Log Reader 每次通过 `moyuplus.gitLog.toggle` 进入时，都会销毁上一次 Git Log Webview 状态、渲染 loading 页面，并依次识别仓库、读取分支和执行 `git log`。即使仓库历史没有变化，用户仍会看到重复加载。

本设计为现有 Git Log Reader 增加进程内 stale-while-revalidate 缓存：先用上一次成功结果完成首帧渲染，同时在后台重新查询；查询结果一致时保持页面不动，不一致时才更新。

本规格是 `2026-07-13-moyuplus-git-log-reader-mode-design.md` 的增量修订。原规格中“禁止缓存提交记录或上一次 Git Log 数据会话”“每次进入必须先显示 loading”“退出必须清除全部 Git Log 数据”的要求由本文相应条款取代。模式锁定、Reader 恢复、快捷键入口、Git 查询边界和 session 隔离等其余要求继续有效。

## 2. 目标

1. 查询上下文未变化且存在缓存时，切入 Git Log 的首帧直接显示上一次成功结果，不闪现 loading。
2. 每次进入仍会后台读取当前 Git 历史，缓存不成为长期真值。
3. 新结果与缓存一致时不发送 Webview 更新，不触发 DOM 重建或重新分页。
4. 新结果不一致时更新页面并回到第一页。
5. 刷新失败时保留可用缓存并给出非阻断提示。
6. 缓存、活动查询、待处理查询和异步回调数量均有固定上限，频繁切换不会造成内存泄漏或 Git 进程堆积。

## 3. 非目标

- 不把缓存写入 `workspaceState`、`globalState`、文件或其他持久化介质。
- 不跨扩展宿主重载、VS Code 窗口重载或重启保留缓存。
- 不缓存多个仓库、分支或查询配置的历史结果。
- 不增加 TTL、手动刷新按钮、仓库监听器或 Git 文件系统监听。
- 不恢复上一次 Git Log 页码；数据更新后仍回到第一页。
- 不改变现有最大提交数 `20..1000`、查询超时、输出上限或错误归一化规则。

## 4. 选定方案

缓存由 `ReaderViewProvider` 拥有。它位于 Git 查询服务与 Webview 之间，能够在 Webview 被重建后继续保留进程内数据，同时不把 UI 刷新协议塞入 `GitLogService`。

Provider 只持有一个缓存条目和一个刷新任务：

```ts
interface GitLogCacheEntry {
  queryKey: string;
  fingerprint: string;
  result: GitLogResult;
}

interface GitLogRefreshJob {
  queryKey: string;
  token: symbol;
  abort: AbortController;
  settled: Promise<void>;
  abortRequested: boolean;
}

interface GitLogUiSession {
  id: string;
  modeGeneration: number;
  queryKey: string;
  presentedFingerprint?: string;
  usedCache: boolean;
  modeDelivered: boolean;
  observedJobToken?: symbol;
  deferredOutcome?: GitLogRefreshOutcome;
}

type GitLogRefreshOutcome =
  | { jobToken: symbol; type: 'success'; result: GitLogResult }
  | { jobToken: symbol; type: 'error'; error: GitLogError };

interface GitLogRefreshControllerState {
  activeJob?: GitLogRefreshJob;
  pendingSnapshot?: GitLogQuerySnapshot;
}
```

上述类型表达生命周期边界，不要求逐字采用相同字段或类型名。

## 5. 查询上下文与缓存命中

每次准备 Git session 时只读取一次以下输入并形成不可变查询快照：

- 规范化后的 workspace root 列表，保留原有顺序；
- 当前活动文件路径；
- 规范化后的 `maxCommits`。

查询快照具有明确结构：

```ts
interface GitLogQuerySnapshot {
  workspaceRoots: readonly string[];
  activeFilePath?: string;
  maxCommits: number;
  queryKey: string;
}
```

Provider 使用同一个纯函数一次性构造它：workspace roots 与活动文件使用 `path.normalize`；roots 保留原有顺序；`maxCommits` 使用与 `GitLogService` 相同的共享 clamp/round 函数规范化。`queryKey` 使用 `JSON.stringify([workspaceRoots, activeFilePath ?? null, maxCommits])` 或等价的无歧义 tuple 编码，禁止用分隔符直接拼接。

同一个快照对象同时用于缓存命中和 `GitLogService.load`，后者只额外附加当前任务的 `AbortSignal`。`showGitLoading()` 与 `start()` 不得分别重新读取这些 getter；第 7.3 节将现有两阶段协议合并为一次 Provider 建会话操作。

只有 `queryKey` 完全相等时才展示缓存。活动文件或 workspace roots 发生变化时，即使最终可能解析到同一仓库，也按缓存未命中处理，以避免多根工作区中短暂展示错误仓库。`maxCommits` 改变时同样不复用旧缓存。

缓存未命中不会删除旧条目；新上下文查询成功后以新条目替换它。查询失败时旧条目仍可保留，但因为 key 不匹配而不会展示。

## 6. 结果指纹与比较成本

`GitLogService` 在已有 Git 输出仍位于内存中时生成结果指纹。指纹使用 Node.js 加密哈希，并覆盖：

- 规范化仓库根路径；
- 分支名；
- detached 状态；
- 原始、无颜色、NUL 分隔的完整 `git log` 输出。

元数据使用无歧义的长度前缀或等价编码后再参与哈希。指纹只存在扩展宿主内部，不发送给 Webview，也不持久化。

每次真实查询最多计算一次指纹。缓存保存该指纹；刷新完成后只做一次字符串等值比较，因此缓存命中后的新旧判断为 O(1)。读取和哈希新查询输出本身仍与返回数据量线性相关，但上限为 1000 条提交，而且不会因单次查询期间反复切换而重复执行。

哈希只用于避免重复渲染，不用于安全决策。如果指纹不同，结果视为变化；如果相同，结果视为可复用。

## 7. 进入与刷新数据流

### 7.1 缓存未命中

1. `GitLogModeCoordinator` 创建新 session ID。
2. Provider 捕获查询快照并发送不含缓存的 `modeGitLog`。
3. Webview 进入现有 loading 状态。
4. Provider 启动或接管该上下文的刷新任务。
5. 查询成功后写入单条缓存，并向仍然有效的当前 session 发送 `gitLogReady`。
6. 查询失败时发送现有 `gitLogError`。

### 7.2 缓存命中

1. Provider 将缓存的 UI 数据随 `modeGitLog` 一次性发送。
2. `GitLogView.begin` 在首次 `render()` 前依次建立 session、载入偏好并应用缓存结果。
3. Webview 首帧直接为 `ready`，不创建 loading DOM。
4. Provider 同时启动或复用后台刷新任务。
5. 新指纹与已展示指纹相同：只更新内部任务状态，不发送任何 Webview 消息。
6. 新指纹不同：替换缓存，向当前 session 发送 `gitLogReady`，Webview 替换数据并回到第一页。

`modeGitLog` 可增加可选的缓存载荷；缓存载荷使用第 10 节定义的显式白名单投影，不暴露仓库绝对路径或内部指纹。

### 7.3 原子建会话与 mode generation

现有 `GitLogModeCoordinator.beginGitSession()` 先等待 `view.showGitLoading()`、再调用 `sessions.start()` 的两阶段协议必须合并。Provider 暴露一个等价的原子操作，例如 `openGitSession(sessionId)`，在一次调用内完成：

1. 捕获唯一查询快照；
2. 递增顶层 `modeGeneration`；
3. 先登记唯一 `GitLogUiSession`；如果此时有相同 key、尚未 abort 的活动 job，只记录其 token 到 `observedJobToken`，不追加 Promise 回调；
4. 投递携带 generation 的缓存首帧或 loading 首帧；
5. 投递返回后再次验证 Provider 未 dispose、mode store 仍 active、view 仍可见，且 session ID/generation 仍为当前值，然后设置 `modeDelivered = true`；
6. 若等待投递期间 matching job 已完成，消费唯一 `deferredOutcome`：成功结果按指纹决定静默或发 ready，失败按是否使用缓存决定提示或错误；该 outcome 被消费后不得再次启动查询；
7. 若 matching job 仍在运行则继续复用；只有既没有 matching job、也没有已消费 outcome 时才请求新刷新。新启动任务的 token 必须写入该 session 的 `observedJobToken`。

协调器在等待该操作返回后同样复核自己的 `currentSessionId`；取消操作必须携带 session ID，旧取消不能解除新 session。

所有能切换顶层页面的消息——`modeGitLog`、`modeLibrary`、`modeReaderRestore` 和仅用于推进代际的 `modeInvalidated` tombstone——都携带由 Provider 单调递增的 `modeGeneration`。Webview 保存已接受的最大 generation，拒绝小于或等于该值的重复/迟到顶层模式消息。取消、hide 或 detach UI session 时，即使没有可立即展示的 Reader/Library 目标，也必须递增 generation，并向仍存在的 Webview 投递 `modeInvalidated`；Webview 接受后释放当前 Git view、进入空白 boot 状态并推进 generation。后续 reveal/bootstrap 再投递更高 generation 的真实目标模式。这样即使旧 `postMessage` 延迟送达，也不能在已经退出、隐藏或恢复 Reader 后重新激活 Git Log。普通 Git 数据消息仍同时使用 session ID 隔离。

## 8. 单飞刷新与频繁切换

Provider 在任意时刻最多维护一个活动 `GitLogRefreshJob` 和一个 latest-wins 的待处理快照。

- 没有活动任务时，创建一个任务并安装唯一的完成处理器。
- 已有相同 `queryKey` 且尚未请求 abort 的任务时直接复用，不创建新 Git 进程，也不为每次切换追加 `.then`、事件监听器或订阅者数组。
- 已有不同 `queryKey` 的活动任务时，把待处理快照替换为最新值，将旧 job 标记为 `abortRequested` 并调用 abort，但继续保留旧 job 和 token 作为当前活动任务身份，等待其 Promise settle。只有旧 `service.load` 已 settle、即 runner 已确认子进程退出后，才能启动待处理快照。禁止在 `abort()` 返回后立即并行启动新查询。
- 等待旧任务 settle 期间再次收到请求时，只替换唯一的 `pendingSnapshot`。即使最新请求重新变为正在退出的 job key，也不能复用已请求 abort 的任务；旧任务 settle 后按最新快照重新启动。
- 切出 Git Log、隐藏 Webview 或取消 UI session 时，只解除 `GitLogUiSession` 并使页面消息失效；相同上下文的刷新任务可以继续，在完成后仅更新缓存。
- 刷新任务完成时通过任务 token 验证自己仍是当前活动任务，并通过 `abortRequested` 决定是否允许写缓存或发消息。它的 `finally` 只有在 token 仍匹配时才清除 active job，随后 drain 唯一 pending；旧任务不得清除或覆盖已建立的新任务。
- 完成处理器读取当时唯一的当前 UI session。只有 `uiSession.queryKey === job.queryKey`、`uiSession.observedJobToken === job.token`、session/generation 仍有效且 `abortRequested === false` 时，该 job 才可能为该 session 产生结果；消息的 session ID 必须取自这个已匹配 session。key/token 不匹配时，成功结果最多更新单条缓存，失败保持静默。
- matching session 的 `modeDelivered === false` 时，完成处理器不得立即 post 数据消息，而是只保存一个带 job token 的 `deferredOutcome`。投递首帧完成后由第 7.3 节的原子操作消费它，保证 `gitLogReady`/错误不会先于 `modeGitLog` 到达，也不会再次启动同 key 查询。
- matching session 的 `modeDelivered === true` 时才允许按现有指纹/错误规则立即发消息。没有有效 session 时不发送 UI 消息。
- abort 被视为内部控制流：被替换或 dispose 的任务不得产生刷新失败提示或错误页。

现有协调器对快速连续快捷键的奇偶合并继续生效。单飞刷新进一步保证已经启动的同上下文查询不会因切出再切入而反复创建。

本节明确覆盖基础规格 §8.3 中“hide、Webview dispose、新 session 一律 abort 查询”的旧规则：hide、Webview dispose 和同 key 新 session 只解除 UI；不同 key 按上述严格串行流程 abort 并等待；只有扩展级 Provider dispose 无条件 abort 且不再 drain pending。

## 9. 取消、释放与内存上限

- 缓存始终只有一个条目，且提交数上限为 1000。
- 活动刷新任务始终最多一个，持有一个 Promise、一个 `AbortController` 和一个任务 token；另有最多一个不含 Promise/controller 的待处理快照。
- 不保留 session 历史、回调列表、订阅者数组或多仓库 LRU。
- 任务 settle 后在 `finally` 等价路径中释放 Promise、controller 和 token 引用；只有 token 仍匹配时才允许清理当前任务。
- `ReaderViewProvider` 增加幂等 `dispose()`，并由 `registerReaderView` 作为独立 disposable 注册进 `context.subscriptions`。扩展停用时它会先设置 disposed 标记、清空 pending、解除 UI session和缓存，再把当前 job 标记为 `abortRequested` 并 abort；现有唯一完成处理器负责在 settle 后释放 job 引用且绝不 drain pending。所有迟到回调先检查 disposed 标记并保持静默。
- Webview hide 或 `view.onDidDispose()` 只走 `detachUiSession(sessionId)`/协调器取消路径，不调用 Provider 的扩展级 `dispose()`；因此允许当前刷新完成并保留单条缓存。
- Webview 模式退出继续调用 `GitLogView.dispose()`；分页器继续调用 `LayoutEngine.dispose()`，释放布局监听、观察器和 DOM 引用。
- Webview dispose 不要求丢弃 Provider 缓存；缓存仍受扩展进程生命周期约束。

## 10. 状态与消息

`GitLogState` 增加可选的刷新提示状态，例如 `refreshNotice?: string`，但缓存刷新失败不得把 `status: 'ready'` 改成 `error`，也不得清空 commits 或分页能力。

内部结果与 Webview 结果必须通过显式投影隔离：

```ts
interface GitLogDisplayResult {
  repositoryName: string;
  branchName: string;
  detached: boolean;
  commits: GitLogCommit[];
}

function toGitLogDisplayResult(result: GitLogResult): GitLogDisplayResult;
```

`toGitLogDisplayResult` 是缓存首帧和普通 `gitLogReady` 的唯一数据出口，只逐项返回上述白名单字段。禁止继续使用 `{ ...result }` 构造 Webview 消息，确保 `repositoryRoot`、`fingerprint` 及未来内部字段不会通过 structured clone 泄露。消息守卫必须完整验证 `cached`，并拒绝缓存/ready 载荷中的内部字段。

新增等价消息：

```ts
type ExtensionToGitLogMessage =
  | {
      type: 'modeGitLog';
      sessionId: string;
      modeGeneration: number;
      preferences: GitLogPreferences;
      readerPreferences: ReaderPreferences;
      cached?: GitLogDisplayResult;
    }
  | { type: 'gitLogRefreshFailed'; sessionId: string; code: string; message: string }
  | { type: 'modeInvalidated'; sessionId?: string; modeGeneration: number }
  // existing messages remain
```

刷新失败行为：

- 当前 session 使用了缓存：保留数据，在顶部上下文区域附近显示轻量、非模态、`role="status"` 的“刷新失败，正在显示上次结果”提示。
- 当前 session 未使用缓存：维持现有错误页。
- 无有效 session：不显示消息，只结束任务；已有缓存保持不变。

每次新 session 开始或刷新成功时清除旧提示。迟到、已取消或 session ID 不匹配的消息继续由 reducer/view 丢弃。

## 11. 分页与视觉稳定性

- 缓存命中首帧按现有 Reader 偏好和 Git Log 偏好重新建立分页。
- 刷新结果一致时不调用 `render()`、不替换 DOM、不重建 `GitLogPaginator`，当前页保持不变。
- 刷新结果不一致时复用现有 `ready` 路径，替换提交并回到第一页。
- 刷新失败提示不得遮挡正文、改变正文滚动约束或禁用翻页。
- loading、空状态和无缓存错误页保持现有行为。

## 12. 测试策略

### 12.1 指纹与查询服务

- 相同仓库、分支、detached 状态和原始输出生成相同指纹。
- 仓库、分支、detached 状态或任意提交输出变化都会改变指纹。
- 指纹只计算一次并随 `GitLogResult` 返回，不进入 Webview 消息。

### 12.2 Provider 缓存与单飞

- 首次成功查询写入缓存；同 key 再次进入时 `modeGitLog` 携带缓存。
- 缓存首帧消息发生在后台查询 resolve 之前。
- 相同指纹不发送第二个 ready 消息。
- 不同指纹替换缓存并只更新当前有效 session。
- 缓存刷新失败发送 `gitLogRefreshFailed`；无缓存失败发送 `gitLogError`。
- 相同 key 的频繁切出/切入只调用一次 `service.load`，并且不累积完成回调。
- 不同 key 会 abort 旧任务；旧任务 settle/子进程退出前不启动新任务。快速轮换多个 key 时 `maxConcurrentLoads` 和 runner 观测到的 `maxConcurrentProcesses` 均为 1，pending 始终最多一个且 latest-wins。
- 查询在切出后完成时只更新缓存，不发送 UI 消息。
- 旧 token、旧 session 和迟到结果不能覆盖当前任务或页面。
- 延迟 `postMessage` 期间发生 hide、退出或 Webview dispose 时，不会启动查询或让迟到 `modeGitLog` 复活页面；mode generation 有独立测试。
- 活动 A 在 delayed `modeGitLog(B)` 期间成功或失败时，不得向 B session 发送 A 的 ready/error；A 成功最多更新 A 缓存，A 失败保持静默。
- 同 key job 在 `modeGitLog` 投递等待期间 settle 时只生成/消费一个 deferred outcome，首帧交付后不再启动第二次 `service.load`；ready/error 不得先于建会话消息到达。
- `modeGitLog` 尚未交付时执行 hide → hidden exit → 迟到交付 → reveal，tombstone generation 会拒绝旧模式且 reveal 前不闪现 Git 页面。
- hide、Webview dispose、Webview 重建和扩展 deactivate 分别测试：前几者保留缓存/允许刷新，deactivate abort、清空并静默所有迟到回调。
- Provider dispose 通过 `context.subscriptions` 的真实注册测试验证，不只直接调用实例方法。
- 缓存始终只有一个条目；新 key 成功后替换旧条目。
- 查询快照 getter 每项只读取一次；覆盖 roots 顺序、路径规范化、active file、max clamp/round 和带分隔符路径不会产生 key 碰撞。
- 实际投递的 cached/ready 消息严格等于 `GitLogDisplayResult` 白名单，不含 `repositoryRoot`、`fingerprint` 或其他额外字段。
- 可计数 job harness 断言每个真实 job 只安装一个完成处理器，不能仅用 `service.load` 次数间接推断。
- runner 忽略 abort 并让 `abortRequested` job 成功 resolve 时，该结果不得写缓存或发消息，finally 只启动一次最新 pending；同场景 reject 时不得显示 `gitLogError`/`gitLogRefreshFailed`，且仍正确释放 active 并 drain pending。

测试使用 deferred Promise 和可观察的 AbortSignal，不依赖真实延时。

### 12.3 Webview 状态与渲染

- `begin` 携带缓存时首次状态为 ready，不经过可见 loading。
- Webview 拒绝小于或等于当前 `modeGeneration` 的迟到或重复顶层模式消息。
- 刷新结果一致时没有 reducer/render 动作。
- 刷新结果变化时更新数据并重置页码。
- `gitLogRefreshFailed` 保留 ready、commits、页码和翻页能力，并设置提示。
- 新 session、成功刷新和 dispose 清除旧提示。
- Git Log view dispose 继续释放 paginator/layout。

### 12.4 回归验证

- Git Log 目标单元测试通过。
- 全量单元测试通过。
- TypeScript 类型检查和生产构建通过。
- Playwright Git Log 布局测试通过。
- 人工验证真实仓库中 `Alt+Q` 首次显示、缓存瞬开、相同结果静止、提交变化后更新、刷新失败保留缓存，以及频繁切换无明显进程或内存增长。

## 13. 完成定义

1. 缓存命中时不显示 loading，缓存未命中时保持原行为。
2. 每次进入仍触发或复用一次当前上下文刷新，缓存不会阻止新鲜度校验。
3. 相同结果不产生 Webview 更新或重新分页，不同结果正确更新并回到第一页。
4. 刷新失败且有缓存时数据仍可阅读和翻页，并显示非阻断提示。
5. 任意时刻只有一个缓存条目、一个活动刷新任务和一个 latest-wins 待处理快照；旧进程退出前绝不启动新进程，频繁切换不增加监听器、Promise 回调链或 session 历史。
6. 所有取消、token、session、mode generation、Webview 生命周期和扩展 dispose 边界均有自动测试。
7. 目标测试、全量测试、类型检查、生产构建、布局测试和人工验收全部通过。
