(function () {
  'use strict';
  const core = window.BlogEditorCore;
  const ids = ['title', 'date', 'category', 'slug', 'summary', 'markdown'];
  const fields = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const saveStatus = document.getElementById('save-status');
  const storageKey = 'vvcdada-editor-draft-v1';

  function localDate() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }

  function newSlug() {
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    const time = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')].join('');
    return 'post-' + date + '-' + time;
  }

  function readForm() {
    return Object.fromEntries(ids.map(id => [id, fields[id].value]));
  }

  function fillForm(data) {
    for (const id of ids) fields[id].value = data[id] || '';
    update();
  }

  function saveDraft() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(readForm()));
      saveStatus.textContent = '已保存在此浏览器';
    } catch (_) {
      saveStatus.textContent = '本浏览器无法保存草稿，请及时下载';
    }
  }

  function update() {
    const data = core.normalized(readForm());
    document.getElementById('preview-date').textContent = data.date ? data.date.replace(/-/g, '.') : '未选择日期';
    document.getElementById('preview-category').textContent = data.category;
    document.getElementById('preview-article-title').textContent = data.title || '文章标题';
    document.getElementById('preview-summary').textContent = data.summary || '文章简介会出现在这里。';
    document.getElementById('preview-body').innerHTML = data.markdown ? core.renderMarkdown(data.markdown) : '<p>正文预览会出现在这里。</p>';
    document.getElementById('card-output').value = core.buildCard(data) || '填写标题、日期、文件名和正文后，这里会生成首页卡片代码。';
  }

  function insertMarkdown(kind) {
    const area = fields.markdown;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = area.value.slice(start, end);
    const snippets = {
      heading: '\n## ' + (selected || '小标题') + '\n',
      bold: '**' + (selected || '加粗文字') + '**',
      link: '[' + (selected || '链接文字') + '](https://example.com)',
      list: '\n- ' + (selected || '列表项目') + '\n',
      code: '\n```\n' + (selected || '代码') + '\n```\n'
    };
    const snippet = snippets[kind];
    if (!snippet) return;
    area.setRangeText(snippet, start, end, 'end');
    area.focus();
    update();
    saveDraft();
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') fillForm(saved);
    else fillForm({ date: localDate(), category: '技术笔记', slug: newSlug() });
  } catch (_) {
    fillForm({ date: localDate(), category: '技术笔记', slug: newSlug() });
  }

  for (const id of ids) fields[id].addEventListener('input', function () { update(); saveDraft(); });
  for (const button of document.querySelectorAll('[data-insert]')) button.addEventListener('click', function () { insertMarkdown(button.dataset.insert); });

  document.getElementById('download').addEventListener('click', function () {
    const data = readForm();
    const error = core.validate(data);
    if (error) { alert(error); return; }
    const html = core.buildArticle(data);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = data.slug.trim() + '.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    saveStatus.textContent = '文章 HTML 已下载';
  });

  document.getElementById('copy-card').addEventListener('click', async function () {
    const code = core.buildCard(readForm());
    if (!code) { alert(core.validate(readForm())); return; }
    try {
      await navigator.clipboard.writeText(code);
    } catch (_) {
      const output = document.getElementById('card-output');
      output.focus(); output.select();
      if (!document.execCommand('copy')) { alert('请手动复制下方代码。'); return; }
    }
    this.textContent = '已复制';
    window.setTimeout(() => { this.textContent = '复制代码'; }, 1800);
  });

  document.getElementById('import-file').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    if (!file) return;
    try {
      const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
      const source = doc.querySelector('meta[name="blog-editor-source"]');
      if (!source) throw new Error('此文件没有可编辑的原稿信息。请导入由本编辑器生成的 HTML。');
      const data = JSON.parse(decodeURIComponent(source.content));
      if (!data || typeof data !== 'object') throw new Error('文章原稿格式有误。');
      fillForm(data);
      saveDraft();
      saveStatus.textContent = '文章已导入';
    } catch (error) {
      alert(error.message || '导入失败。');
    }
    this.value = '';
  });
}());
