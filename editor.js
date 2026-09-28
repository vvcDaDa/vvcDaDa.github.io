(function () {
  'use strict';
  const core = window.BlogEditorCore;
  const ids = ['title', 'date', 'category', 'slug', 'summary', 'markdown'];
  const fields = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const saveStatus = document.getElementById('save-status');
  const storageKey = 'vvcdada-editor-draft-v1';
  let saveTimer;
  let imageRange;

  function openDraftDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open('vvcdada-blog-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Draft database is blocked'));
    });
  }

  const dbPromise = openDraftDb();

  async function readSavedDraft() {
    try {
      const db = await dbPromise;
      const saved = await new Promise((resolve, reject) => {
        const request = db.transaction('drafts', 'readonly').objectStore('drafts').get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (saved) return saved;
    } catch (_) { /* Fall back to the previous local draft. */ }
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); }
    catch (_) { return null; }
  }

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

  async function saveDraft() {
    const data = readForm();
    try {
      const db = await dbPromise;
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite');
        transaction.objectStore('drafts').put(data, 'current');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      try { localStorage.removeItem(storageKey); } catch (_) { /* Storage may be disabled. */ }
      saveStatus.textContent = '已保存在此浏览器';
    } catch (_) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
        saveStatus.textContent = '已保存在此浏览器';
      } catch (_) {
        saveStatus.textContent = '本浏览器无法保存草稿，请及时下载';
      }
    }
  }

  function queueSave() {
    saveStatus.textContent = '正在保存草稿…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 350);
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
    queueSave();
  }

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('无法读取图片。'));
      reader.readAsDataURL(file);
    });
  }

  async function insertImages(files) {
    const chosen = Array.from(files);
    if (!chosen.length) return;
    const existingBytes = core.embeddedImageBytes(fields.markdown.value);
    const selectedBytes = chosen.reduce((sum, file) => sum + file.size, 0);
    if (existingBytes + selectedBytes > core.maxEmbeddedImageBytes) {
      alert('文章图片总大小不能超过 5 MB，请选择更小的图片。');
      return;
    }
    saveStatus.textContent = '正在读取图片…';
    try {
      const snippets = [];
      for (const file of chosen) {
        const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const mime = core.imageMimeFromHeader(header);
        if (!mime) throw new Error('仅支持 JPG、PNG、GIF、WebP 图片：' + file.name);
        const base64 = (await fileAsDataUrl(file)).split(',', 2)[1];
        snippets.push(core.imageMarkdown(file.name, mime, base64));
      }
      const area = fields.markdown;
      const start = imageRange ? imageRange.start : area.selectionStart;
      const end = imageRange ? imageRange.end : area.selectionEnd;
      area.setRangeText('\n\n' + snippets.join('\n\n') + '\n\n', start, end, 'end');
      area.focus();
      update();
      await saveDraft();
      saveStatus.textContent = chosen.length + ' 张图片已插入并保存';
    } catch (error) {
      saveStatus.textContent = '图片插入失败';
      alert(error.message || '无法读取图片。');
    } finally {
      imageRange = null;
    }
  }

  void readSavedDraft().then(saved => {
    if (saved && typeof saved === 'object') fillForm(saved);
    else fillForm({ date: localDate(), category: '技术笔记', slug: newSlug() });
  });

  for (const id of ids) fields[id].addEventListener('input', function () { update(); queueSave(); });
  for (const button of document.querySelectorAll('[data-insert]')) button.addEventListener('click', function () { insertMarkdown(button.dataset.insert); });

  document.getElementById('insert-image').addEventListener('click', function () {
    imageRange = { start: fields.markdown.selectionStart, end: fields.markdown.selectionEnd };
    document.getElementById('image-file').click();
  });

  document.getElementById('image-file').addEventListener('change', async function () {
    await insertImages(this.files || []);
    this.value = '';
  });

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
      await saveDraft();
      saveStatus.textContent = '文章已导入';
    } catch (error) {
      alert(error.message || '导入失败。');
    }
    this.value = '';
  });
}());
