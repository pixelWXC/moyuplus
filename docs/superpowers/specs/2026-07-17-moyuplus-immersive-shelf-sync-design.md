# MoyuPlus 沉浸阅读书架状态同步设计

日期：2026-07-17
状态：已确认，待实施

## 目标

- 书架可见时，当前正在沉浸阅读的书籍显示红色“停止阅读”动作，不再显示“沉浸阅读”。
- 停止沉浸阅读后，书架立即显示刚刚保存的最新阅读百分比。
- 快捷键、命令面板、编辑器右键菜单和书架按钮共用同一停止与刷新流程。
- 全部同步由已有事件和书架激活触发，不增加轮询、定时刷新或后台状态探测。

## 状态权威

`ReaderSessionCoordinator` 继续作为活动书籍会话和进度的唯一权威。书架快照增加可选的 `immersiveBookId`，其值只在当前 presentation mode 为 `immersive` 时存在。

Webview 不靠一次性的 start/stop 消息长期维护活动状态。每次收到 `libraryState` 时，根据权威快照为书籍派生 `immersiveActive`。书架重新显示、沉浸启动完成或沉浸停止完成时均刷新该快照，因此隐藏期间遗漏消息不会造成永久状态漂移。

## 书架行为

- 活动沉浸书籍的动作列表用 `stopImmersive` 替换 `startImmersive`。
- `stopImmersive` 显示文案为“停止阅读”，使用现有危险动作红色样式。
- 其他书籍继续显示“沉浸阅读”；点击后沿用现有串行切书流程。
- 缺失书籍的现有禁用与恢复行为不因活动状态同步而改变。

## 停止与进度刷新

`ReaderViewProvider` 提供统一的停止入口：

1. 验证当前确为沉浸模式；书架请求还要验证请求 `bookId` 与活动书籍一致，丢弃过期按钮事件。
2. 调用协调器的 `stopImmersive()`。
3. 协调器冻结当前页首、强制 flush、清理 Decoration 和 handle，并清除 context key。
4. 停止成功后调用一次 `refreshLibrary()`。
5. 新快照从 `ReadingProgressStore` 读取刚写入的 `bookProgression`，Webview 立即更新现有“已读 N%”并恢复“沉浸阅读”按钮。

命令面板、`Alt+Shift+Q` 和编辑器右键菜单的命令注册改为调用该统一入口。若书架当前没有可用 Webview，停止本身仍成功；下次书架激活时再由激活刷新得到最新状态。

## 性能

- 不轮询。
- 不新增 interval、重复进度读取或沉浸翻页期间的书架重绘。
- 只在书架激活、沉浸启动完成和沉浸停止完成时读取并发送一次快照。
- 翻页仍只更新协调器内存位置并按现有防抖策略保存，不逐页刷新书架。

## 测试

- Reducer 测试：权威快照只把匹配书籍标记为 `immersiveActive`，动作切换为 `stopImmersive`。
- Webview 测试：活动书籍显示红色“停止阅读”，点击发送带正确 `bookId` 的停止请求；其他书籍仍显示“沉浸阅读”。
- Provider 测试：书架按钮停止、快捷键/命令停止均在成功 flush 后刷新书架快照；过期 `bookId` 不停止当前会话。
- Provider 测试：停止后的 `libraryState.progress` 包含最新百分比并清除 `immersiveBookId`。
- 激活/恢复测试：书架重新显示时从快照恢复活动按钮状态，不依赖历史一次性消息。
- 回归验证 TypeScript 编译、Vitest 和 Playwright。

