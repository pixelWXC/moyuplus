# MoyuPlus 沉浸阅读书架状态同步设计

日期：2026-07-17
状态：已实施并通过自动验收及真实 Extension Development Host 人工验收（2026-07-17）

## 目标

- 书架可见时，当前正在沉浸阅读的书籍显示红色“停止阅读”动作，不再显示“沉浸阅读”。
- 停止沉浸阅读后，书架立即显示刚刚保存的最新阅读百分比。
- 快捷键、命令面板、编辑器右键菜单和书架按钮共用同一停止与刷新流程。
- 全部同步由已有事件和书架激活触发，不增加轮询、定时刷新或后台状态探测。

## 状态权威

`ReaderSessionCoordinator` 继续作为活动书籍会话的唯一权威，`ReadingProgressStore` 继续作为已持久化百分比的唯一权威。`ReaderViewController` 暴露只读会话快照，Provider 在发送书架快照时从中派生可选的 `immersiveBookId`；`LibraryService` 不自行推断活动会话。

Webview 不靠一次性的 start/stop 消息长期维护活动状态。现有未消费的 `immersiveState` 单次消息删除。每次收到 `libraryState` 时，根据权威快照为书籍派生 `immersiveActive`。书架重新显示、沉浸启动完成或沉浸停止完成时均请求刷新该快照，因此隐藏期间遗漏消息不会造成永久状态漂移。

每条 `libraryState` 携带单调递增的 `libraryRevision`。Provider 串行并合并快照刷新，Webview 只接受比已应用 revision 更新且与当前书架模式匹配的结果。旧刷新完成得更晚、Webview 已重建或期间进入 Git Log 时，旧结果不得提交。

## 书架行为

- 活动沉浸书籍的动作列表用 `stopImmersive` 替换 `startImmersive`。
- `stopImmersive` 显示文案为“停止阅读”，使用现有危险动作红色样式。
- 其他书籍继续显示“沉浸阅读”；点击后沿用现有串行切书流程。
- 缺失书籍的现有禁用与恢复行为不因活动状态同步而改变。

## 停止与进度刷新

`ReaderViewProvider` 提供单飞的统一停止入口 `stopImmersive(expectedBookId?)`：

1. 通过协调器只读快照验证当前确为沉浸模式；书架请求还要验证 `expectedBookId` 与活动书籍一致，丢弃过期按钮事件。
2. 调用协调器的 `stopImmersive()`。
3. 协调器冻结当前页首、尝试强制 flush、清理 Decoration 和 handle，并清除 context key；清理不因保存失败而中断。
4. 协调器返回停止结果以及本次进度是否成功持久化。保存失败时提示用户，并且只展示上一次成功保存的百分比，不声称已更新到最新位置。
5. Provider 在 `finally` 中把书架标记为待刷新，确保停止按钮能够清除；满足可见性条件时立即刷新一次。
6. 新快照从 `ReadingProgressStore` 读取已成功写入的 `bookProgression`，Webview 更新现有“已读 N%”并恢复“沉浸阅读”按钮。

命令面板、`Alt+Shift+Q` 和编辑器右键菜单的命令注册改为调用该统一入口且不传 expected ID；书架按钮通过受协议校验的 `stopImmersive` 消息传入 book ID。并发或连续停止复用同一个进行中的 Promise，不重复 flush 或刷新。若书架当前没有可用 Webview，停止本身仍成功；下次书架激活时再由激活刷新得到最新状态。

## 快照调度与生命周期

Provider 使用单一串行刷新 drain 和 dirty 标记合并请求，任意时刻最多执行一次包含书籍可用性文件检查的快照构造。

- 只有 Webview 仍是当前实例、视图可见、Git Log 未激活且界面处于书架模式时才构造并提交快照。
- 视图缺失、隐藏、已重建、处于常规阅读页或 Git Log 时只标记 dirty，不执行隐藏刷新。
- 下一次 ready、可见或回到书架事件消费 dirty，并只发送一次最新快照。
- 构造快照期间发生更新时，当前结果作废；drain 紧接着构造下一份，旧结果不会发送到新 Webview。
- Webview 在 boot/书架模式接受带 revision 的快照；进入 reader/Git Log 后拒绝无关的迟到 `libraryState`。

## 性能

- 不轮询。
- 不新增 interval、重复进度读取或沉浸翻页期间的书架重绘。
- 只在书架激活、沉浸启动完成和沉浸停止完成时请求快照；并发请求由 drain 合并为所需的最少次数。
- 翻页仍只更新协调器内存位置并按现有防抖策略保存，不逐页刷新书架。

## 测试

- Reducer 测试：权威快照只把匹配书籍标记为 `immersiveActive`，动作切换为 `stopImmersive`。
- Webview 测试：活动书籍显示红色“停止阅读”，点击发送带正确 `bookId` 的停止请求；其他书籍仍显示“沉浸阅读”。
- Provider 测试：书架按钮停止、快捷键/命令停止均在成功 flush 后刷新书架快照；过期 `bookId` 不停止当前会话。
- Provider 测试：停止后的 `libraryState.progress` 包含最新百分比并清除 `immersiveBookId`。
- 激活/恢复测试：书架重新显示时从快照恢复活动按钮状态，不依赖历史一次性消息。
- 协调器/Provider 测试：保存失败仍完成资源清理、清除活动按钮并提示，百分比保留上一次成功值。
- Provider 测试：并发停止只执行一次 stop/flush 和一次最终刷新。
- Provider 测试：隐藏时停止只标记 dirty，重新激活后才执行唯一一次快照。
- Provider/Webview 测试：延迟刷新 A 不得覆盖刷新 B；刷新期间 dispose/recreate 或进入 Git Log 时不得向错误界面提交。
- 协议测试：拒绝缺少有效 request ID/book ID 的 `stopImmersive` 请求，并确认删除旧 `immersiveState` 消息。
- 回归验证 TypeScript 编译、Vitest 和 Playwright。
