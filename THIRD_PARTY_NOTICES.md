# 鸣谢与第三方说明

## 运行依赖及参考项目

- MNUtils：研究快照 0.2.6.alpha0920；研究 MNNote.noteFromNote、标题和媒体接口，运行时使用所需只读接口。该版本不代表最低兼容版本承诺。https://bbs.marginnote.com.cn/t/topic/49699
- MNEditor：参考已核验的 0.0.6 包及 editorUtils.js 的高亮格式，兼容 mark 标签；无需安装。https://bbs.marginnote.com.cn/t/topic/55508
- Ostracon：参考 1.5.1，提交 d1bd17edf370c7ee6b0d9893145956720a2d8d80；研究 CardSelectionService、CardContentService、HtmlCompatibilityService 和测试。https://github.com/Temsys-Shen/ostracon-mn
- MarginNote 社区重复显示反馈：https://bbs.marginnote.com.cn/t/67016/29
- MarginNote 本地 API 文档：核对原生节点层级、顺序、选择和笔记接口。

参考插件未确认可直接复用的整体源码许可。新增 src/card-content 模块独立实现，未复制 MNUtils、MNEditor 或 Ostracon 的参考源码；MNUtils 通过运行时接口使用。研究包及本机插件副本不随仓库发布。

## 已内嵌的第三方组件

- Marked 4.3.0：离线 Markdown/GFM 解析，MIT 许可。源码 vendor/marked-4.3.0.min.js，许可 vendor/LICENSE-marked-4.3.0。https://github.com/markedjs/marked
- MathJax 3.2.2：离线公式排版，Apache License 2.0。源码 vendor/mathjax-3.2.2-tex-svg-full.js，许可 vendor/LICENSE-mathjax-3.2.2。https://github.com/mathjax/MathJax

这些组件也已嵌入插件 main.js 和历史测试基线；保留相应版权及许可文件。
