# MoyuPlus 图片预览入口文本链接样式设计

- 日期：2026-07-15
- 状态：已实施并通过自动与人工验收（2026-07-16）

## 范围

本轮不处理长书初始化、目录或跨章注解性能，只调整 EPUB 图片预览入口的视觉样式并生成独立测试 VSIX。

## 设计

Sanitizer 继续生成 `<button type="button" class="moyuplus-image-link">`，保留键盘访问、事件处理、opaque resource id 与安全预览协议。CSS 将该按钮的原生背景、边框、padding 和 appearance 清零，普通状态使用 `--vscode-textLink-foreground`，hover 使用 `--vscode-textLink-activeForeground`，并设置下划线、继承字体和 pointer cursor，使其视觉上等同正文超链接。

不将入口改成带 `href` 的 `<a>`，避免伪 URL、默认导航和安全协议变化。hover/focus 继续提供可见反馈，focus-visible 沿用现有全局焦点轮廓。

## 测试与交付

真实 `reader-app-harness` 断言入口仍为 button，但 computed style 为透明背景、零边框/零 padding、链接色与下划线。随后运行 compile、全量 unit/layout、package 和 VSIX 内容核对，产物使用独立文件名 `moyuplus-0.0.7-image-link.vsix`。
