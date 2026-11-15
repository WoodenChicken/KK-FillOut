/**
 * 语料管理交互：分页筛选、弹窗编辑、JSONL 导入导出与概览预览。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  let options;
  let labels = [];
  let rows = [];
  let page = 1;
  let pages = 1;
  let revision = '';
  let editRevision = '';
  let editId = null;
  let running = false;
  let busy = false;
  let requestId = 0;

  function message(text, error = false) {
    $('sample-message').textContent = text;
    $('sample-message').classList.toggle('error', error);
  }

  async function api(url, method = 'GET', body) {
    const response = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      const detail = (data.errors || []).slice(0, 10).map((item) => `第 ${item.line} 行：${item.message}`).join('；');
      throw new Error((data.error || '请求失败') + (detail ? '。' + detail : ''));
    }
    return data;
  }

  function configQuery() {
    const cfg = options.getConfig();
    return new URLSearchParams({ seed: cfg.seed, samplesPerPattern: cfg.samplesPerPattern });
  }

  function fillLabels(select, emptyText) {
    select.replaceChildren(new Option(emptyText, ''));
    const groups = new Map();
    labels.forEach((label) => {
      if (!groups.has(label.group)) {
        const group = document.createElement('optgroup');
        group.label = label.group;
        groups.set(label.group, group);
        select.appendChild(group);
      }
      groups.get(label.group).appendChild(new Option(`${label.name} · ${label.key}`, label.key));
    });
  }

  function setRunning(value) {
    running = value;
    $('sample-add').disabled = running || busy;
    $('sample-import').disabled = running || busy;
    $('sample-save').disabled = running || busy;
    $('sample-list').querySelectorAll('button').forEach((button) => { button.disabled = running || busy; });
  }

  function render(data) {
    rows = data.rows;
    page = data.page;
    pages = data.pages;
    revision = data.revision;
    const tbody = $('sample-list');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'muted';
      cell.textContent = $('sample-search').value || $('sample-filter-label').value
        ? '没有符合筛选条件的语料，请调整搜索或类别。'
        : '暂无真实语料。点击「新增语料」或导入扩展导出的 JSONL 文件。';
      tr.appendChild(cell);
      tbody.appendChild(tr);
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const label = labels.find((item) => item.key === row.label);
      [row.text, label ? `${label.group} / ${label.name}\n${row.label}` : `${row.label}（无效类别，请修正）`,
        row.source === 'real' ? '真实语料' : '合成语料'].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      const actions = document.createElement('td');
      actions.className = 'row-actions';
      const edit = document.createElement('button');
      edit.className = 'btn-ghost';
      edit.textContent = row.source === 'real' ? '编辑' : '复制新增';
      edit.addEventListener('click', () => openEditor(row));
      actions.appendChild(edit);
      if (row.source === 'real') {
        const remove = document.createElement('button');
        remove.className = 'btn-ghost delete-sample';
        remove.textContent = '删除';
        remove.addEventListener('click', () => removeRow(row));
        actions.appendChild(remove);
      }
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    $('sample-count').textContent = `匹配 ${data.total.toLocaleString()} 条 · 已保存真实语料 ${data.realCount.toLocaleString()} 条`;
    $('sample-page').textContent = `第 ${page} / ${pages} 页`;
    $('sample-prev').disabled = page <= 1;
    $('sample-next').disabled = page >= pages;
    setRunning(running);
  }

  async function loadList() {
    const currentRequest = ++requestId;
    const query = configQuery();
    query.set('source', $('sample-source').value);
    query.set('label', $('sample-filter-label').value);
    query.set('q', $('sample-search').value);
    query.set('page', page);
    const data = await api('/api/samples?' + query);
    if (currentRequest === requestId) render(data);
  }

  async function loadOverview() {
    const data = await api('/api/corpus?' + configQuery());
    options.onOverview(data);
  }

  async function refresh() {
    try { await Promise.all([loadList(), loadOverview()]); }
    catch (e) { message(e.message, true); }
  }

  function openEditor(row) {
    if (running || busy) return;
    editId = row && row.source === 'real' ? row.id : null;
    editRevision = revision;
    $('sample-dialog-title').textContent = editId === null ? '新增语料' : '编辑语料';
    $('sample-text').value = row ? row.text : '';
    $('sample-edit-label').value = row ? row.label : $('sample-filter-label').value;
    $('sample-form-error').textContent = '';
    $('sample-dialog').showModal();
    $('sample-text').focus();
  }

  async function mutate(action) {
    busy = true;
    setRunning(running);
    try {
      const result = await action();
      message(result);
      await refresh();
      return true;
    } catch (e) {
      message(e.message, true);
      return false;
    } finally {
      busy = false;
      setRunning(running);
    }
  }

  async function removeRow(row) {
    if (running || busy || !window.confirm(`确定删除语料「${row.text}」吗？`)) return;
    const currentRevision = revision;
    await mutate(async () => {
      await api('/api/samples/' + row.id, 'DELETE', { revision: currentRevision });
      return '语料已删除并保存，下次训练生效。';
    });
  }

  async function init(config) {
    options = config;
    $('sample-add').addEventListener('click', () => openEditor());
    $('sample-cancel').addEventListener('click', () => $('sample-dialog').close());
    $('sample-refresh').addEventListener('click', () => { message(''); refresh(); });
    $('sample-prev').addEventListener('click', () => { page--; loadList().catch((e) => message(e.message, true)); });
    $('sample-next').addEventListener('click', () => { page++; loadList().catch((e) => message(e.message, true)); });
    ['sample-source', 'sample-filter-label'].forEach((id) => {
      $(id).addEventListener('change', () => { page = 1; loadList().catch((e) => message(e.message, true)); });
    });
    let searchTimer;
    $('sample-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { page = 1; loadList().catch((e) => message(e.message, true)); }, 250);
    });
    $('sample-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (running || busy) return;
      const body = { text: $('sample-text').value, label: $('sample-edit-label').value, revision: editRevision };
      const ok = await mutate(async () => {
        await api(editId === null ? '/api/samples' : '/api/samples/' + editId, editId === null ? 'POST' : 'PUT', body);
        return '语料已保存，下次训练生效。';
      });
      if (ok) $('sample-dialog').close();
      else $('sample-form-error').textContent = $('sample-message').textContent;
    });
    $('sample-import').addEventListener('click', () => { if (!running && !busy) $('sample-file').click(); });
    $('sample-file').addEventListener('change', async () => {
      const file = $('sample-file').files[0];
      if (!file) return;
      const importRevision = revision;
      await mutate(async () => {
        if (file.size > 8 * 1024 * 1024) throw new Error('文件超过 8MB，请拆分后导入');
        const result = await api('/api/samples/import', 'POST', { content: await file.text(), revision: importRevision });
        $('sample-source').value = 'real';
        $('sample-search').value = '';
        $('sample-filter-label').value = '';
        page = 1;
        return `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条，已保存。`;
      });
      $('sample-file').value = '';
    });
    $('sample-export').addEventListener('click', async () => {
      try {
        const response = await fetch('/api/samples/export');
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || '导出失败');
        }
        const link = document.createElement('a');
        const blobUrl = URL.createObjectURL(await response.blob());
        link.href = blobUrl;
        link.download = 'fillout-samples.jsonl';
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        message('已导出全部真实语料。');
      } catch (e) { message(e.message, true); }
    });
    try {
      labels = (await api('/api/labels')).labels;
      fillLabels($('sample-filter-label'), '全部类别');
      fillLabels($('sample-edit-label'), '请选择字段类别');
      await refresh();
    } catch (e) { message(e.message, true); }
  }

  window.CorpusManager = { init, refresh, setRunning };
})();
