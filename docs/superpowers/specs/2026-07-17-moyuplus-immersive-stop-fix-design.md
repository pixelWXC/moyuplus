# MoyuPlus 沉浸阅读退出阻塞修复设计

日期：2026-07-17
状态：已确认，待实施

## 问题

沉浸阅读的 Decoration 和翻页已经可用后，退出命令、切换书籍和切换阅读模式仍可能永久等待。启动流程在会话串行队列中等待“沉浸阅读已启动”信息通知完成；真实 VS Code 中通知 toast 自动收起不保证对应 Promise 已结算，因此后续停止和切换任务无法进入队列。

现有测试桩会立即完成信息通知 Promise，没有覆盖这个真实运行时差异。

## 已确认行为

- 不再显示“沉浸阅读已启动，请聚焦代码编辑器”通知。
- `moyuplus.immersive.stop` 继续作为唯一退出命令。
- 命令标题保持英文：`MoyuPlus: Stop Immersive Reading`。
- 保留命令面板入口和默认快捷键 `Alt+Shift+Q`。
- 在代码编辑器右键菜单中加入该命令，并使用 `moyuplus.immersiveReadingActive` 作为显示条件；非沉浸状态下不显示。
- 退出仍按现有统一停止流程保存页首、清空 Decoration、释放监听器和 handle，并清除 context key。

## 实现边界

从沉浸启动任务中删除启动信息通知调用，不用超时或后台 Promise 替代。翻页不可用时的“请先聚焦代码编辑器”提示不属于启动提示，保持现状。

`package.json` 的 `menus.editor/context` 增加停止命令贡献，`when` 精确依赖 `moyuplus.immersiveReadingActive`。不新增第二条退出命令，也不绕过 `ReaderSessionCoordinator` 的串行切换队列。

## 测试

- 会话协调器测试验证启动沉浸阅读不会调用启动信息通知。
- 会话协调器测试验证沉浸启动完成后，`stopImmersive()` 能完成并释放 presenter 与 handle、清除 context key。
- 会话协调器测试验证从沉浸模式切换到另一书籍能够完成，实时 handle 数量不超过一个。
- package contribution 测试验证编辑器右键菜单项为英文停止命令，且只在 `moyuplus.immersiveReadingActive` 时显示。
- 运行定向 Vitest、TypeScript 编译和相关回归。

