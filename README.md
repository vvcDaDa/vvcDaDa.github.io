# vvcDaDa 的博客

一个无需构建步骤的静态博客，直接由 GitHub Pages 发布。访问地址：<https://vvcdada.github.io/>。

## 本地预览

在仓库根目录运行 `python -m http.server 8000`，然后打开 <http://localhost:8000/>。页面使用根路径引用资源，直接双击 HTML 文件可能无法正确加载样式。

## 使用编辑器写文章

打开 <https://vvcdada.github.io/editor.html>，填写文章信息和 Markdown 正文。页面会实时预览，并将草稿保存在当前浏览器。点击“下载文章 HTML”得到 `文件名.html`；以后也可在编辑器中导入这个文件继续修改。

编辑器只在浏览器中运行，不会自动提交内容。把下载的文件上传到仓库的 `posts/` 文件夹即可获得文章网址；要在首页列出文章，再把编辑器生成的“首页卡片代码”插入 `index.html` 的 `writing` 区域。

## 手工添加文章

1. 在 `posts/` 中新增 HTML 页面，沿用 `posts/start.html` 的结构。
2. 在 `index.html` 的“最近写的”区域添加对应文章卡片。
3. 为新页面设置独立的标题、描述和发布日期。

站点没有第三方运行依赖，也没有统计或跟踪脚本。
