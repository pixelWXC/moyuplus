# Changelog

## 未发布

- 打字练习新增素材级续练位置：手动结束、限时结束或中途退出后保留当前字符进度；再次选择同一素材与范围时默认从上次位置继续，也可在开始前选择从头开始或指定 0–99% 的文章进度。
- 打字练习素材支持可撤销移除：10 秒撤销期结束后永久删除 MoyuPlus 托管正文和旧版本；活动练习引用的素材会延迟清理，启动时自动回收孤立正文。
- 移除打字练习的全部内置素材、素材分区、资源包和 Provider；生成练习改用独立生成词池，不再依赖内置素材模块。

## 0.2.0

- 将打字输入迁移到独立 Webview 面板：使用浏览器 composition 事件保留输入法预编辑，最终候选、普通键入和粘贴统一按 Unicode 字素事务判定。
- 打字练习改为上下双行单视口对照，输入字符独立渲染并按正确/错误状态着色，避免与原文共用 DOM 引发的布局抖动。
- 新增高对比左右手虚拟键盘、下一物理按键提示和显示开关；中文练习会结合短语拼音与输入法预编辑状态逐键提示。
- 新增练习记录清理能力，并在清理后重建历史、每日统计和熟练度投影，避免记录无限增长。
- EPUB 练习素材改为先选择章节，再按选中章节内容校验和截取最大长度。
- 新增单 in-flight FIFO、稳定事务 ID、revision ack、先写日志再更新权威状态、崩溃重放与重复完成防护。
- 删除练习虚拟文档、语言贡献、文件系统 Provider、Decoration、文档保存/回滚、按键路由和延迟候选推断；练习不再打开或保存 TextDocument。
- 增加 workspace Snapshot/Checkpoint、pending Result、原子 Session Lease/heartbeat 和超时检查点恢复，避免多窗口同时写同一活动会话。
- 旧 `moyuplus.typingPracticeSession.v1` 只迁移为一次性安全设置提示，不生成 Result；保留的 start/stop/toggle/reset 命令改为新版 Application 薄别名。
- 删除旧 TypingPracticeController、全局 Inline Completion、状态栏、物理行 SourceCatalog、全局 Tab 路由和旧专属设置/测试。
- 修复输入热路径随历史增长进行深拷贝的问题；50k 条既有历史下的领域输入和 200k 字素快照可见窗口现由性能门禁约束。
- 自动测试已覆盖 composition 协议模拟、真实 Chromium、WebviewPanel 宿主、恢复和性能；新的 Windows 微软拼音候选切换/取消/词组/恢复矩阵仍需用户真实执行。

## 0.1.0

- 新增 TXT/EPUB 沉浸阅读：聚焦文本编辑器后，以不修改文档的 Decoration 在代码行末尾分页显示纯文本，并跟随活动编辑器与光标重绘。
- 常规阅读与沉浸阅读统一为单一书籍会话和同一份阅读进度；复用翻页/切章命令，并提供仅在沉浸模式活动时生效的 `Alt+Shift+Q` 停止命令。
- 书架会标记当前沉浸阅读书籍并将动作替换为红色“停止阅读”；停止流程强制保存页首、完整清理会话，并以单调 revision 刷新已持久化百分比。
- 新增单例 MoyuPlus 设置面板，集中管理阅读、沉浸阅读、Git Log、实验性打字练习和快捷键；Reader/Git Log 设置入口支持直接定位相应分区。
- 修复沉浸阅读停止时进度保存失败会阻塞清理的问题；失败时仍结束会话并明确提示，书架保留上一次成功保存的位置。
- 2026-07-17 沉浸阅读、统一设置与书架同步已通过 264 项单元测试、39 项 Chromium 布局/隐私测试、编译构建和真实 Extension Development Host 人工验收。
- EPUB 正文图片改为安全的“查看图片”入口，通过内存只读 Custom Editor 预览 raster 与清洗后的 SVG，不暴露 archive 路径。
- “查看图片”入口保留安全按钮语义，但视觉改为 VS Code 普通文本超链接，不再显示原生白色按钮背景和边框。
- 支持目录 fragment、同章/跨章脚注与内部链接跳转，并增加最多 50 条的会话级“撤回阅读位置”。
- 新增 `moyuplus.reader.undoLocation`，与上一页/下一页一样可由工作区任意焦点触发且默认不绑定按键；非正文状态静默无操作。
- 修复阅读页四边 padding、隐藏测量面和真实渲染面不一致造成的底部末行裁切与页脚重叠风险。
- EPUB 正文改为 MoyuPlus 统一排版：移除出版物 CSS、内联样式、表现 class 与尺寸属性，同时保留标题、列表、引用、表格、代码和内部目标语义。
- 分页测量、真实渲染修正与跨章预检统一检查横向和纵向边界，修复 `white-space: nowrap`、长 `pre`、宽表格导致的右侧裁切、页数误算和末页状态错误。
- 修复 Reader 在 footer 挂载前提前测量造成的首屏可用高度偏大与末行重叠。
- Reader 消息协议升级到 v3，图片、目标和导航状态都使用 request/book/section/generation 关联校验。
- 修复 0.0.7 长章节性能回归：分页候选不再深克隆整章，改用 Range 局部分片、二分 text-span 定位和一次性正文文本缓存。
- 打开/关闭目录与设置只增量更新抽屉，不再销毁正文和重新分页当前章节。
- 跨章脚注与内部目标只完整分页目标章节一次，成功后直接提升候选布局；失败时保持旧正文、页码和撤回历史不变。
- 2026-07-16 已使用真实 VSIX 与长书完成人工验收，资源预览、内部导航、统一排版、图片链接样式和性能修复全部通过。

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
