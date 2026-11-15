/**
 * 语料管理回归：持久化、批量导入、并发版本与训练数据一致性。
 * 测试语料使用系统临时目录，不改写项目的真实语料或模型。
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createSampleStore } = require('./sample-store');
const { createCorpusHandler } = require('./corpus-api');
const { buildDataset, getLabels } = require('../train/dataset');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fillout-corpus-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'samples.jsonl');
  return { file, store: createSampleStore(file) };
}

test('新增、编辑、删除持久化，编辑保留扩展元数据', (t) => {
  const { file, store } = setup(t);
  fs.writeFileSync(file, '{"text":"联系手机","label":"basicInfo.phone","site":"example.test","type":"tel"}\n');
  store.update('0', { revision: store.read().revision, text: '手机联系方式', label: 'basicInfo.phone' });
  assert.equal(createSampleStore(file).read().rows[0].site, 'example.test');
  store.add({ revision: store.read().revision, text: '教育经历 毕业院校', label: 'education.school' });
  assert.equal(createSampleStore(file).read().rows.length, 2);
  store.remove('0', { revision: store.read().revision });
  assert.equal(store.read().rows[0].label, 'education.school');
  store.remove('0', { revision: store.read().revision });
  assert.equal(fs.readFileSync(file, 'utf8'), '');
});

test('多页面旧版本不能覆盖新数据', (t) => {
  const { store } = setup(t);
  const revision = store.read().revision;
  store.add({ revision, text: '联系手机', label: 'basicInfo.phone' });
  assert.throws(() => store.update('0', { revision, text: '联系邮箱', label: 'basicInfo.email' }), /刷新列表/);
  assert.equal(store.read().rows[0].label, 'basicInfo.phone');
});

test('JSONL 导入兼容 BOM、CRLF 和扩展属性，重复按训练规范化规则跳过', (t) => {
  const { store } = setup(t);
  const result = store.import({
    revision: store.read().revision,
    content: '\uFEFF{"text":"Education   School","label":"education.school","site":"test"}\r\n' +
      '{"text":"education school","label":"education.school"}\r\n\n'
  });
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(store.read().rows[0].site, 'test');
  assert.throws(() => store.add({
    revision: store.read().revision, text: 'education school', label: 'education.school'
  }), /已存在/);
});

test('错误导入整批拒绝并报告行号，无效类别和清洗长度不可保存', (t) => {
  const { store } = setup(t);
  const revision = store.read().revision;
  const result = store.import({
    revision,
    content: '{"text":"联系手机","label":"basicInfo.phone"}\ninvalid\n{"text":"字段标签","label":"unknown"}'
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.line), [2, 3]);
  assert.equal(store.read().revision, revision);
  assert.equal(store.read().rows.length, 0);
  assert.throws(() => store.add({ revision, text: '名', label: 'basicInfo.name' }), /2～200/);
});

test('已有文件 JSON 损坏时不覆盖原始数据', (t) => {
  const { file, store } = setup(t);
  fs.writeFileSync(file, 'invalid\n');
  assert.throws(() => store.add({ revision: 'old', text: '联系手机', label: 'basicInfo.phone' }), /第 1 行/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid\n');
});

test('预览数据包含已保存语料，合成部分与训练的共享生成器一致', (t) => {
  const { store } = setup(t);
  store.add({ revision: store.read().revision, text: '教育经历 毕业院校', label: 'education.school' });
  const cfg = { seed: 13, samplesPerPattern: 2 };
  const dataset = buildDataset(cfg, store.read().rows);
  assert.equal(dataset.real.length, 1);
  assert.deepEqual(dataset.real[0], store.read().rows[0]);
  assert.deepEqual(dataset.synthetic, buildDataset(cfg, []).synthetic);
  assert.equal(dataset.overview.total, dataset.synthetic.length + 1);
  assert.equal(dataset.keys.length, getLabels().length);
});

test('HTTP 接口支持筛选分页、增删改、导出与训练期间禁止修改', async (t) => {
  const { store } = setup(t);
  const handle = createCorpusHandler(store);
  let running = false;
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, async (request) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        return JSON.parse(body || '{}');
      }, running);
    } catch (e) {
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(base + route, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
  };
  let list = (await request('/api/samples?source=real')).data;
  assert.equal(list.total, 0);
  assert.equal((await request('/api/samples', 'POST', {
    revision: list.revision, text: '教育经历 毕业院校', label: 'education.school'
  })).status, 200);
  list = (await request('/api/samples?source=real&q=毕业院校&label=education.school&page=999')).data;
  assert.equal(list.total, 1);
  assert.equal(list.page, 1);
  assert.equal((await request('/api/samples/0', 'PUT', {
    revision: list.revision, text: '教育经历 所在院校', label: 'education.school'
  })).status, 200);
  const exported = await (await fetch(base + '/api/samples/export')).text();
  assert.equal(JSON.parse(exported.trim()).text, '教育经历 所在院校');
  running = true;
  assert.equal((await request('/api/samples/0', 'DELETE', { revision: store.read().revision })).status, 409);
  assert.equal((await request('/api/corpus')).data.real, 1);
  running = false;
  assert.equal((await request('/api/samples/0', 'DELETE', { revision: store.read().revision })).status, 200);
  assert.equal((await request('/api/samples?source=real')).data.total, 0);
  const synthetic = (await request('/api/samples?source=synthetic&page=2')).data;
  assert.equal(synthetic.page, 2);
  assert.equal(synthetic.rows.length, 30);
});

test('实际页面启动预览、弹窗增改、筛选、导入与删除均可用', async (t) => {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) { t.skip('页面交互验证需安装可选的 jsdom 测试依赖'); return; }
  const { store } = setup(t);
  const handle = createCorpusHandler(store);
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, async (request) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        return JSON.parse(body || '{}');
      }, false);
    } catch (e) {
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const publicDir = path.join(__dirname, 'public');
  const dom = new JSDOM(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'), {
    url: base, runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.fetch = (url, init) => fetch(new URL(url, base), init);
  window.EventSource = class { addEventListener() {} close() {} };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.confirm = () => true;
  window.eval(fs.readFileSync(path.join(publicDir, 'corpus-manager.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8'));
  async function until(check) {
    const deadline = Date.now() + 3000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('页面未完成预期操作：' + $('sample-message').textContent);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  const submit = () => $('sample-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => $('stat-total').textContent === '5,647');
  assert.equal($('stat-classes').textContent, '74');
  assert.equal($('sample-list').querySelectorAll('tr').length, 30);
  window.document.querySelector('[data-tab="samples"]').click();
  assert.ok($('tab-samples').classList.contains('active'));
  $('sample-add').click();
  assert.equal($('sample-dialog').open, true);
  $('sample-text').value = '页面测试 毕业院校';
  $('sample-edit-label').value = 'education.school';
  submit();
  await until(() => !$('sample-dialog').open);
  assert.equal(store.read().rows[0].text, '页面测试 毕业院校');
  assert.equal($('stat-real').textContent, '1');
  $('sample-source').value = 'real';
  $('sample-source').dispatchEvent(new window.Event('change'));
  await until(() => $('sample-list').querySelectorAll('tr').length === 1);
  $('sample-list').querySelector('button').click();
  $('sample-text').value = '页面测试 所在学校';
  submit();
  await until(() => !$('sample-dialog').open);
  assert.equal(store.read().rows[0].text, '页面测试 所在学校');
  Object.defineProperty($('sample-file'), 'files', {
    configurable: true,
    value: [{ size: 80, text: async () => '{"text":"页面测试 联系手机","label":"basicInfo.phone"}' }]
  });
  $('sample-file').dispatchEvent(new window.Event('change'));
  await until(() => $('sample-message').textContent.includes('导入完成') && $('stat-real').textContent === '2');
  assert.equal(store.read().rows.length, 2);
  $('sample-search').value = '所在学校';
  $('sample-filter-label').value = 'education.school';
  $('sample-filter-label').dispatchEvent(new window.Event('change'));
  await until(() => $('sample-list').querySelectorAll('tr').length === 1);
  assert.ok($('sample-list').textContent.includes('所在学校'));
  $('sample-list').querySelector('.delete-sample').click();
  await until(() => $('stat-real').textContent === '1');
  assert.equal(store.read().rows[0].label, 'basicInfo.phone');
  window.CorpusManager.setRunning(true);
  assert.equal($('sample-add').disabled, true);
  assert.equal($('sample-import').disabled, true);
  assert.equal($('sample-export').disabled, false);
});
