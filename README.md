# 脑图转嵌套表格 · MindMap to Table

将 MarginNote 脑图整理为可阅读、调整和保存的嵌套表格。

**当前版本：4.2.0 测试版。** 自动测试已通过，真实卡片、复杂格式及交互仍需实际使用验证。

## 下载与安装

1. 先安装或更新 [MNUtils](https://bbs.marginnote.com.cn/t/topic/49699)。本插件生成与刷新表格需要它提供的卡片读取支持。
2. 打开本仓库的 [Releases](https://github.com/fanjam1023/mindmap2table/releases)，下载 `mindmap2table-v4.2.0.mnaddon`。不要下载 Source code 作为安装包。
3. 使用 MarginNote 打开安装包，按应用提示安装插件，然后重启 MarginNote。
4. 在脑图中选中需要整理的卡片，通过插件菜单生成表格。

更新后请关闭旧表格重新生成，或点击刷新。不需要安装 MNEditor 或 Ostracon。

本版本的实际安装与验证环境为 macOS 上的 MarginNote 4；其他平台尚未完成验证。

## 主要功能

- 以嵌套表格呈现脑图层级，支持标题/内容分栏与合并模式。
- 显示文字、图片、评论、留白、手写、Markdown 和数学公式。
- 保留原生节点顺序、图文评论顺序以及同一卡片的多个真实位置。
- 点击表格定位脑图卡片，点击脑图卡片定位表格。
- 调整列宽、图片尺寸、浮窗大小和字号；保存与恢复图表库。
- 分批生成、阶段进度与取消，生成失败时保护已有结果。
- 单表及批量导出 HTML。Markdown 与公式引擎离线提供。

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
重启 MarginNote，关闭旧表格或刷新后再测试。

**所有格式都能完整保留吗？**  
支持常用文字与富文本格式，复杂 HTML 样式可能存在差异；无法读取的内容会尽量回退或提示回源查看。本版仍为测试版，不承诺所有卡片都完全正确或生成速度一定更快。

## 反馈问题

请在 [Issues](https://github.com/fanjam1023/mindmap2table/issues) 中提供插件版本、MarginNote 版本、系统版本、操作步骤，以及原卡片和表格的对照截图。注明合并模式或标题模式。截图请先遮挡个人信息；不必上传整个笔记库。

## 鸣谢与参考

感谢 [MNUtils](https://bbs.marginnote.com.cn/t/topic/49699)、[MNEditor](https://bbs.marginnote.com.cn/t/topic/55508)、[Ostracon / Temsys-Shen](https://github.com/Temsys-Shen/ostracon-mn) 的接口、格式及实现思路参考，也感谢 MarginNote 社区的问题反馈。

Markdown 与数学公式分别使用离线 [Marked](https://github.com/markedjs/marked) 和 [MathJax](https://github.com/mathjax/MathJax)。参考范围与第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 开发与构建

需要 Node.js 和 Python 3。直接部署源码位于 `.mnaddon-work/`，内容模块位于 `src/card-content/`。

```sh
node scripts/embed-card-content.js
node --check .mnaddon-work/main.js
node tests/all-v4.2.0.js
python3 scripts/package-addon.py
```

只有修改对应离线引擎资源时才需要运行 `scripts/embed-marked.js` 或 `scripts/embed-mathjax.js`。打包只包含六个插件文件，不包含测试、参考插件或笔记资料。

自动测试包含内容矩阵、结构、性能夹具及交互保护检查。历史源码仅作为 `tests/fixtures/` 中的测试基线保留。自动测试不能代替 MarginNote 的真实界面验收。

## 许可说明

本项目暂未指定整体开源许可证；公开源码不等同于授予任意复制、修改或再分发许可。第三方组件按各自许可证使用，见 `vendor/` 中许可文件。
