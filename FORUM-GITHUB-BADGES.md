# 论坛 GitHub 徽章

把下面这一行放在论坛主题开头即可显示与截图相同风格的 GitHub 徽章：

```markdown
[![GitHub](https://img.shields.io/badge/github-mindmap2table-25A0FB?logo=github)](https://github.com/fanjam1023/mindmap2table) [![GitHub Release](https://img.shields.io/github/v/release/fanjam1023/mindmap2table?include_prereleases)](https://github.com/fanjam1023/mindmap2table/releases)
```

如果只想显示仓库徽章，使用：

```markdown
[![GitHub](https://img.shields.io/badge/github-mindmap2table-25A0FB?logo=github)](https://github.com/fanjam1023/mindmap2table)
```

论坛会把 Markdown 图片渲染成徽章，并保留点击链接。`25A0FB` 是蓝色；想换成紫色可以改为 `9974F7`。发布版本徽章会从 GitHub Releases 自动读取当前版本。

建议把徽章放在简介第一行，后面紧接插件介绍；不要把 URL 单独贴出来，否则论坛可能显示普通链接或预览卡片。
