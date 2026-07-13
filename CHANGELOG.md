# Changelog

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
