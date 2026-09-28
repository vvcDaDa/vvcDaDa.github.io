(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function safeUrl(value, image) {
    const url = String(value).trim();
    if (image && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(url)) return url;
    if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
    if (url.startsWith('/') && !url.startsWith('//') && !/[\s\\]/.test(url)) return url;
    if (!image && /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)) return url;
    if (!image && /^#[a-z\d_-]+$/i.test(url)) return url;
    return null;
  }

  const maxEmbeddedImageBytes = 5 * 1024 * 1024;

  function imageMimeFromHeader(bytes) {
    if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (bytes.length >= 6 && [71, 73, 70, 56].every((byte, i) => bytes[i] === byte) && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return 'image/gif';
    if (bytes.length >= 12 && [82, 73, 70, 70].every((byte, i) => bytes[i] === byte) && [87, 69, 66, 80].every((byte, i) => bytes[i + 8] === byte)) return 'image/webp';
    return null;
  }

  function embeddedImageBytes(markdown) {
    let bytes = 0;
    const pattern = /!\[[^\]]*\]\(data:image\/(?:png|jpeg|gif|webp);base64,([a-z0-9+/]+={0,2})\)/gi;
    for (const match of String(markdown).matchAll(pattern)) {
      const base64 = match[1];
      bytes += Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    }
    return bytes;
  }

  function imageMarkdown(filename, mime, base64) {
    const url = 'data:' + mime + ';base64,' + base64;
    if (!safeUrl(url, true)) throw new Error('图片数据格式无效。');
    const alt = String(filename).replace(/\.[^.]+$/, '').replace(/[\[\]()\r\n]/g, ' ').trim() || '文章图片';
    return '![' + alt + '](' + url + ')';
  }

  function inline(source) {
    const pattern = /`[^`\n]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*/g;
    let output = '';
    let position = 0;
    for (const match of String(source).matchAll(pattern)) {
      output += escapeHtml(source.slice(position, match.index));
      const token = match[0];
      if (token.startsWith('`')) {
        output += '<code>' + escapeHtml(token.slice(1, -1)) + '</code>';
      } else if (token.startsWith('![')) {
        const parts = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
        const url = safeUrl(parts[2], true);
        output += url ? '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(parts[1]) + '" loading="lazy">' : escapeHtml(token);
      } else if (token.startsWith('[')) {
        const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
        const url = safeUrl(parts[2], false);
        const external = url && /^https?:\/\//i.test(url);
        output += url ? '<a href="' + escapeHtml(url) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + escapeHtml(parts[1]) + '</a>' : escapeHtml(token);
      } else if (token.startsWith('**')) {
        output += '<strong>' + escapeHtml(token.slice(2, -2)) + '</strong>';
      } else {
        output += '<em>' + escapeHtml(token.slice(1, -1)) + '</em>';
      }
      position = match.index + token.length;
    }
    return output + escapeHtml(source.slice(position));
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    const isSpecial = line => /^\s*(?:```|#{1,3}\s|[-*+]\s|\d+\.\s|>\s?|---+\s*$)/.test(line);
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = /^\s*```([a-zA-Z0-9_-]*)\s*$/.exec(line);
      if (fence) {
        const code = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        blocks.push('<pre><code' + (fence[1] ? ' class="language-' + fence[1] + '"' : '') + '>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      const heading = /^\s*(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        const level = heading[1].length === 3 ? 3 : 2;
        blocks.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>');
        i++; continue;
      }
      if (/^\s*---+\s*$/.test(line)) { blocks.push('<hr>'); i++; continue; }
      if (/^\s*>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(inline(lines[i++].replace(/^\s*>\s?/, '')));
        blocks.push('<blockquote><p>' + quote.join('<br>') + '</p></blockquote>');
        continue;
      }
      const listType = /^\s*[-*+]\s+/.test(line) ? 'ul' : /^\s*\d+\.\s+/.test(line) ? 'ol' : null;
      if (listType) {
        const items = [];
        const itemPattern = listType === 'ul' ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
        while (i < lines.length && itemPattern.test(lines[i])) items.push('<li>' + inline(itemPattern.exec(lines[i++])[1]) + '</li>');
        blocks.push('<' + listType + '>' + items.join('') + '</' + listType + '>');
        continue;
      }
      const paragraph = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) paragraph.push(lines[i++].trim());
      blocks.push('<p>' + paragraph.map(inline).join('<br>') + '</p>');
    }
    return blocks.join('\n');
  }

  function excerpt(markdown) {
    return String(markdown).replace(/```[\s\S]*?```/g, ' ').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#>*`_\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function normalized(input) {
    const data = {
      title: String(input.title || '').trim(),
      date: String(input.date || '').trim(),
      category: String(input.category || '随笔').trim() || '随笔',
      slug: String(input.slug || '').trim(),
      markdown: String(input.markdown || '').trim(),
      summary: String(input.summary || '').trim()
    };
    if (!data.summary) data.summary = excerpt(data.markdown);
    return data;
  }

  function validate(input) {
    const d = normalized(input);
    if (!d.title) return '请填写文章标题。';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return '请选择有效的发布日期。';
    const [year, month, day] = d.date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return '请选择有效的发布日期。';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) return '文件名只能用小写英文、数字和连字符，且不能以连字符开头或结尾。';
    if (!d.markdown) return '请先写一些正文。';
    if (embeddedImageBytes(d.markdown) > maxEmbeddedImageBytes) return '文章图片总大小不能超过 5 MB。';
    return null;
  }

  function buildArticle(input) {
    const error = validate(input);
    if (error) throw new Error(error);
    const d = normalized(input);
    const source = encodeURIComponent(JSON.stringify(d));
    const dateText = d.date.replace(/-/g, '.');
    const [year, month] = d.date.split('-');
    const readableText = d.markdown.replace(/!\[[^\]]*\]\(data:image\/(?:png|jpeg|gif|webp);base64,[^)]+\)/gi, '');
    const minutes = Math.max(1, Math.ceil(readableText.length / 450));
    const title = escapeHtml(d.title);
    const summary = escapeHtml(d.summary);
    const category = escapeHtml(d.category);
    const canonical = 'https://vvcdada.github.io/posts/' + d.slug + '.html';
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f8f7f4">
  <meta name="description" content="${summary}">
  <meta name="blog-editor-source" content="${escapeHtml(source)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title} · vvcDaDa">
  <meta property="og:description" content="${summary}">
  <meta property="og:url" content="${canonical}">
  <title>${title} · vvcDaDa</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  <script src="/script.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="page-shell">
    <header class="site-header"><a class="brand" href="/" aria-label="vvcDaDa，返回首页"><img class="brand-mark" src="/logo.jpg" alt="" width="44" height="44"><span>vvcDaDa</span></a><nav class="site-nav" aria-label="主导航"><a href="/">首页</a><a class="is-current" href="/#writing">文章</a><a href="/about.html">关于</a></nav><button class="theme-toggle" type="button" aria-label="切换深色模式" title="切换深色模式"><span aria-hidden="true">◐</span></button></header>
    <main id="main" class="inner-main"><article><div class="article-meta"><time datetime="${d.date}">${dateText}</time><span>·</span><span>${category}</span><span>·</span><span>约 ${minutes} 分钟</span></div><h1 class="inner-title article-title">${title}<span class="hero-period">.</span></h1><p class="article-deck">${summary}</p><div class="prose article-body">${renderMarkdown(d.markdown)}</div></article><div class="article-end"><span>写于 ${year} 年 ${Number(month)} 月</span><a href="/">← 返回首页</a></div></main>
    <footer class="site-footer"><span>© ${year} vvcDaDa</span><span>保持好奇，保持记录。</span><a href="#main">回到顶部 ↑</a></footer>
  </div>
</body>
</html>
`;
  }

  function buildCard(input) {
    const d = normalized(input);
    if (validate(d)) return '';
    const dateText = d.date.replace(/-/g, '.');
    const number = d.date.slice(5).replace('-', '/');
    return `<a class="post-card" href="/posts/${d.slug}.html"><div class="post-number">${number}</div><div class="post-main"><div class="post-meta"><time datetime="${d.date}">${dateText}</time><span>·</span><span>${escapeHtml(d.category)}</span></div><h3>${escapeHtml(d.title)}</h3><p>${escapeHtml(d.summary)}</p><span class="post-read">阅读全文 <span aria-hidden="true">↗</span></span></div><span class="post-arrow" aria-hidden="true">↗</span></a>`;
  }

  global.BlogEditorCore = { escapeHtml, renderMarkdown, excerpt, normalized, validate, buildArticle, buildCard, maxEmbeddedImageBytes, imageMimeFromHeader, embeddedImageBytes, imageMarkdown };
}(globalThis));
