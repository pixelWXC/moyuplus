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
6. 缓存、查询任务和异步回调数量均有固定上限，频繁切换不会造成内存泄漏或 Git 进程堆积。

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
}

interface GitLogUiSession {
  id: string;
  queryKey: string;
  presentedFingerprint?: string;
  usedCache: boolean;
}
```

上述类型表达生命周期边界，不要求逐字采用相同字段或类型名。

## 5. 查询上下文与缓存命中

每次准备 Git session 时只读取一次以下输入并形成不可变查询快照：

- 规范化后的 workspace root 列表，保留原有顺序；
- 当前活动文件路径；
- 规范化后的 `maxCommits`。

查询快照同时用于生成稳定 `queryKey` 和调用 `GitLogService.load`，避免“用于命中缓存的输入”和“实际查询的输入”在两次读取之间发生变化。

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

`modeGitLog` 可增加可选的缓存载荷；缓存载荷只包含 Webview 需要的仓库名、分支、detached 状态和提交记录，不暴露仓库绝对路径或内部指纹。

## 8. 单飞刷新与频繁切换

Provider 在任意时刻最多维护一个 `GitLogRefreshJob`。

- 没有任务时，创建一个任务并安装唯一的完成处理器。
- 已有相同 `queryKey` 的任务时直接复用，不创建新 Git 进程，也不为每次切换追加 `.then`、事件监听器或订阅者数组。
- 已有不同 `queryKey` 的任务时，先 abort 并释放旧任务，再启动新任务。
- 切出 Git Log、隐藏 Webview 或取消 UI session 时，只解除 `GitLogUiSession` 并使页面消息失效；相同上下文的刷新任务可以继续，在完成后仅更新缓存。
- 刷新任务完成时通过任务 token 验证自己仍是当前任务。旧任务的成功、失败或 abort 回调不得清除或覆盖新任务。
- 完成处理器读取当时唯一的当前 UI session；没有有效 session 时不发送 UI 消息。

现有协调器对快速连续快捷键的奇偶合并继续生效。单飞刷新进一步保证已经启动的同上下文查询不会因切出再切入而反复创建。

## 9. 取消、释放与内存上限

- 缓存始终只有一个条目，且提交数上限为 1000。
- 刷新任务始终最多一个，持有一个 Promise、一个 `AbortController` 和一个任务 token。
- 不保留 session 历史、回调列表、订阅者数组或多仓库 LRU。
- 任务 settle 后在 `finally` 等价路径中释放 Promise、controller 和 token 引用；只有 token 仍匹配时才允许清理当前任务。
- Provider/扩展真正 dispose 时 abort 当前任务、清空 UI session、缓存和任务引用。
- Webview 模式退出继续调用 `GitLogView.dispose()`；分页器继续调用 `LayoutEngine.dispose()`，释放布局监听、观察器和 DOM 引用。
- Webview dispose 不要求丢弃 Provider 缓存；缓存仍受扩展进程生命周期约束。

## 10. 状态与消息

`GitLogState` 增加可选的刷新提示状态，例如 `refreshNotice?: string`，但缓存刷新失败不得把 `status: 'ready'` 改成 `error`，也不得清空 commits 或分页能力。

新增等价消息：

```ts
type ExtensionToGitLogMessage =
  | {
      type: 'modeGitLog';
      sessionId: string;
      preferences: GitLogPreferences;
      readerPreferences: ReaderPreferences;
      cached?: GitLogDisplayResult;
    }
  | { type: 'gitLogRefreshFailed'; sessionId: string; code: string; message: string }
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
- 不同 key 会 abort 旧任务并启动新任务。
- 查询在切出后完成时只更新缓存，不发送 UI 消息。
- 旧 token、旧 session 和迟到结果不能覆盖当前任务或页面。
- Provider dispose 会 abort 查询并清空缓存和运行时引用。
- 缓存始终只有一个条目；新 key 成功后替换旧条目。

测试使用 deferred Promise 和可观察的 AbortSignal，不依赖真实延时。

### 12.3 Webview 状态与渲染

- `begin` 携带缓存时首次状态为 ready，不经过可见 loading。
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
5. 任意时刻只有一个缓存条目和一个刷新任务；频繁切换不增加 Git 进程、监听器、Promise 回调链或 session 历史。
6. 所有取消、token、session 和 dispose 边界均有自动测试。
7. 目标测试、全量测试、类型检查、生产构建、布局测试和人工验收全部通过。
