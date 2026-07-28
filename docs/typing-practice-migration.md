# MoyuPlus 打字练习旧版迁移

## 会迁移什么

首次激活新版打字练习时，MoyuPlus 会读取旧 workspace key `moyuplus.typingPracticeSession.v1`。如果它包含活动练习：

1. 通过旧 TXT 记录的 URI 在 Reader v2 书架中重新定位 Book；不会假设旧 ID 与新 Book ID 相同。
2. 写入并回读一次性的 `LegacyResumeHint`。
3. 写入并回读幂等迁移 marker。
4. 最后清理旧 session key。

提示只包含可识别标题、来源是否仍可用、旧物理行附近位置和旧空白偏好。Webview 不接收 book ID、路径、正文或旧 session ID。

## 不会迁移什么

- 旧 session 没有可信成绩事实，因此不会生成新版 Result、History 或 Mastery。
- 提示不会自动创建新版 Snapshot 或活动 Session。
- 单侧 trim、skip-empty 等没有一一对应新版策略的偏好不会被静默扩大；用户必须在新版设置页复核。
- 旧练习文档的未保存 buffer 不会恢复；权威状态只来自 Session、Snapshot、Checkpoint 和连续事务日志。
- 旧输入模式只作为兼容字段读取，迁移后不会写回，也不驱动 Webview 输入判定。

## 失败与重试

迁移先确认新提示和 marker 已可靠写入，再删除旧状态。提示或 marker 写入失败时保留旧 session；若 marker 已提交但旧 key 清理失败，下次激活只重试清理，不覆盖首次提示。

用户点击“进入新版设置确认”时，宿主会重新读取权威提示并再次检查源文件。来源可用后才预选 Reader Book 和首个合法范围；成功打开设置草稿后才消费提示。来源丢失时提示保留，并引导先从书架重新定位。

## 命令兼容

- `startTypingPractice`、`stopTypingPractice`、`toggleTypingPractice` 和 `resetTypingPracticeProgress` 保留为新版 Typing View/Application 的薄别名。
- 旧 next/jump/trim/menu 命令只显示弃用说明并打开新版界面，不再推进物理行或修改旧偏好。
- 旧全局 Tab 路由、Inline Completion、状态栏和 Controller 已物理删除。
- 练习虚拟文档、专用语言、文件系统 Provider、Decoration 和文档按键命令也已删除；练习统一在 Webview 面板中进行。
