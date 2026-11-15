/**
 * 语料管理接口。分页浏览合成与真实语料，真实语料持久化到训练目录。
 */
'use strict';

const { buildDataset, getLabels, isValidSample } = require('../train/dataset');
const { createSampleStore } = require('./sample-store');

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function createCorpusHandler(store = createSampleStore()) {
  return async function handleCorpus(req, res, readBody, running) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;
  if (!['/api/corpus', '/api/labels', '/api/samples', '/api/samples/import', '/api/samples/export'].includes(route) &&
      !/^\/api\/samples\/\d+$/.test(route)) return false;

  if (req.method === 'GET') {
    if (route === '/api/labels') {
      json(res, { labels: getLabels() });
      return true;
    }
    const data = store.read();
    if (route === '/api/samples/export') {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': 'attachment; filename="fillout-samples.jsonl"',
        'Cache-Control': 'no-store'
      });
      res.end(data.rows.map((row) => JSON.stringify(row)).join('\n') + (data.rows.length ? '\n' : ''));
      return true;
    }
    const dataset = buildDataset({
      seed: url.searchParams.get('seed') || 42,
      samplesPerPattern: url.searchParams.get('samplesPerPattern') || 6
    }, data.rows);
    if (route === '/api/corpus') {
      json(res, { ...dataset.overview, revision: data.revision });
      return true;
    }
    if (route === '/api/samples') {
      const source = url.searchParams.get('source') || 'all';
      const label = url.searchParams.get('label') || '';
      const query = (url.searchParams.get('q') || '').toLowerCase();
      const real = data.rows.map((row, id) => ({
        id: String(id), text: typeof row.text === 'string' ? row.text : '',
        label: String(row.label || ''), source: 'real', valid: isValidSample(row, dataset.keys)
      }));
      const synthetic = dataset.synthetic.map((row, id) => ({ ...row, id: 's-' + id, source: 'synthetic', valid: true }));
      const rows = (source === 'real' ? real : source === 'synthetic' ? synthetic : real.concat(synthetic))
        .filter((row) => (!label || row.label === label) && (!query || (row.text + ' ' + row.label).toLowerCase().includes(query)));
      const pageSize = 30;
      const pages = Math.max(1, Math.ceil(rows.length / pageSize));
      const page = Math.max(1, Math.min(pages, parseInt(url.searchParams.get('page'), 10) || 1));
      json(res, { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pages, revision: data.revision, realCount: real.length });
      return true;
    }
  }

  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const isRunning = () => typeof running === 'function' ? running() : running;
    if (isRunning()) {
      json(res, { ok: false, error: '训练中暂不能修改语料，请在训练结束或停止后操作' }, 409);
      return true;
    }
    const body = await readBody(req);
    if (isRunning()) {
      json(res, { ok: false, error: '训练已开始，请在训练结束或停止后修改语料' }, 409);
      return true;
    }
    let result;
    if (route === '/api/samples' && req.method === 'POST') result = store.add(body);
    else if (route === '/api/samples/import' && req.method === 'POST') result = store.import(body);
    else if (/^\/api\/samples\/\d+$/.test(route) && req.method === 'PUT') result = store.update(route.split('/').pop(), body);
    else if (/^\/api\/samples\/\d+$/.test(route) && req.method === 'DELETE') result = store.remove(route.split('/').pop(), body);
    if (result) {
      json(res, result, result.ok ? 200 : 400);
      return true;
    }
  }
  json(res, { ok: false, error: '不支持的请求方法' }, 405);
  return true;
  };
}

module.exports = { handleCorpus: createCorpusHandler(), createCorpusHandler };
