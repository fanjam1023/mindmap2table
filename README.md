# 脑图转嵌套表格 · MindMap to Table

[![GitHub](https://img.shields.io/badge/github-mindmap2table-25A0FB?logo=github)](https://github.com/fanjam1023/mindmap2table) [![GitHub Release](https://img.shields.io/github/v/release/fanjam1023/mindmap2table?include_prereleases)](https://github.com/fanjam1023/mindmap2table/releases)

将 MarginNote 脑图整理为可阅读、调整和保存的嵌套表格。

**当前版本：4.2.4。**

## 下载与安装

1. 先安装或更新 [MNUtils](https://bbs.marginnote.com.cn/t/topic/49699)。本插件生成与刷新表格需要它提供的卡片读取支持。
2. 打开本仓库的 [Releases](https://github.com/fanjam1023/mindmap2table/releases)，下载 `mindmap2table-v4.2.4.mnaddon`。不要下载 Source code 作为安装包。
3. 使用 MarginNote 打开安装包，按应用提示安装插件，然后重启 MarginNote。
4. 在脑图中选中需要整理的卡片，通过插件菜单生成表格。

更新后请关闭旧表格重新生成，或点击刷新。不需要安装 MNEditor 或 Ostracon。

## 主要功能

- 以嵌套表格呈现脑图层级，支持标题/内容分栏与合并模式。
- 显示文字、图片、评论、留白、手写、Markdown 和数学公式。
- 保留原生节点顺序、图文评论顺序以及同一卡片的多个真实位置。
- 点击表格定位脑图卡片，点击脑图卡片定位表格。
- 调整列宽、图片尺寸、浮窗大小和字号；保存与恢复图表库。
- 分批生成、阶段进度与取消，生成失败时保护已有结果。
- 单表及批量导出 HTML。Markdown 与公式引擎离线提供。
- 按卡片颜色呈现浅色背景，顶部“配色”可开启或关闭；导出和打印保留当前选择。

## 4.2.4 更新

- 表格保留卡片色系，统一降低饱和度，让不同知识点与题型更易区分。
- 顶部新增“配色”按钮，点击可开启或关闭，并提示功能作用。
- 刷新、切换模式、存库与导出保留配色选择，支持学习集自定义颜色。

## 4.2.2 更新

- 修复图片摘录中的手写笔记遗漏，引用卡片也会保留对应原始摘录的手写标记。
- 手写标记随原图一起缩放，并保留在导出的 HTML 中。

## 4.2.1 更新

- 修复一张卡片合并多段摘录后，后续已切换为文字的摘录仍显示成图片的问题。每段摘录按自己的显示设置呈现，内容顺序保持一致。

## 4.2.0 更新

- 改善卡片内容显示，减少文字重复、内容空白和图片遗漏。
- 改善脑图与图文评论顺序，保留不同位置的相同卡片。
- 优化标题、高亮、文字格式和字号缩放。
- 改善留白、手写、单词与图片卡片兼容性。

完整用户说明见 [更新日志](CHANGELOG.md)。

## 常见问题

**能直接导出 PDF 吗？**  
当前支持 HTML 导出，暂不支持直接 PDF。用浏览器打开导出文件后，可通过打印保存为 PDF；请检查分页、图片和公式。

**提示缺少组件怎么办？**  
安装或更新 MNUtils，再重新生成。已有表格通常可直接导出 HTML；如果导出需要重新生成，仍需 MNUtils。

**更新后没有变化？**  
重启 MarginNote，关闭旧表格或刷新后即可使用。

**所有格式都能完整保留吗？**  
支持常用文字与富文本格式，无法读取的内容会尽量回退或提示回源查看。

## 反馈问题

请在 [Issues](https://github.com/fanjam1023/mindmap2table/issues) 中提供插件版本、MarginNote 版本、系统版本、操作步骤，以及原卡片和表格的对照截图。注明合并模式或标题模式。截图请先遮挡个人信息；不必上传整个笔记库。

## 鸣谢与参考

感谢 [MNUtils](https://bbs.marginnote.com.cn/t/topic/49699)、[MNEditor](https://bbs.marginnote.com.cn/t/topic/55508)、[Ostracon / Temsys-Shen](https://github.com/Temsys-Shen/ostracon-mn) 的接口、格式及实现思路参考，也感谢 MarginNote 社区的问题反馈。

Markdown 与数学公式分别使用离线 [Marked](https://github.com/markedjs/marked) 和 [MathJax](https://github.com/mathjax/MathJax)。
