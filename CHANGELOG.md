# Changelog

## 0.0.7

- Git Log 增加单条运行时内存缓存：再次进入时立即显示上次结果，并在后台校验当前仓库与分支。
- 后台结果未变化时保持当前分页和焦点；结果变化时仅更新一次，刷新失败时保留已有提交供继续阅读。
- 严格串行化 Git 查询，限制为一个活动任务和一个 latest-wins 待处理查询，并完善 Webview 重建、隐藏和扩展停用生命周期。
- 修复从书架进入 Git Log 后错误恢复历史阅读位置；只有从阅读页进入时才恢复原书与原位置。
- 修复插件启动即 Git Log、恢复书籍后返回书架会显示空书架的问题，恢复消息现在原子携带完整书架快照。
- 简化空书架内容，移除异常“文”字和重复导入按钮；自动测试与 Extension Development Host 人工验收均已通过。

## 0.0.6

- 新增 Git Log Reader 模式，使用 `Alt+Q` 在 Reader 与当前仓库提交历史之间切换。
- 支持当前分支/`HEAD` 可达提交、Hash/作者/相对时间/绝对日期字段、逐行与内联布局。
- 新增 Git Log 设置持久化、真实 DOM 分页、无滚动阅读和 Git 异常状态反馈。
- 保留 Reader 阅读位置，并支持 VS Code 重载、重启和扩展重新激活后的 Git Log 模式恢复。
- 完成 Git Log 自动测试和人工验收，版本发布产物为 `moyuplus-0.0.6.vsix`。

## 0.0.5

- Keep page controls and reading locators synchronized after the reader is resized.
- Save and flush the final TXT/EPUB locator before returning to the library.
- Restore both the saved section and its within-section progression when reopening a book.
- Manual acceptance completed for TXT and EPUB reading flows on 2026-07-13.

## 0.0.1

- 新增本地 TXT、EPUB 2/3 混合书架与重新定位。
- 新增 EPUB 目录、章节分页、阅读偏好和跨工作区进度恢复。
- 保留 TXT 打字练习、ghost text 和受保护的 Enter/Tab 路由。
- 增加严格 CSP、EPUB 内容清洗、零网络请求和无正文持久化约束。
- 移除旧 TXT Reader 栈与 v1 Reader 运行时状态。

已知限制见 README。
