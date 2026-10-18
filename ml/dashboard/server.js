/**
 * FillOut 训练可视化面板 - 服务端。
 *
 * 功能：
 *   - 静态文件服务（public/ 目录）
 *   - POST /api/train       启动训练（body 为配置 JSON）
 *   - GET  /api/stream      SSE 实时推送训练全过程事件
 *   - POST /api/stop        停止当前训练
 *   - GET  /api/state       当前训练状态与历史事件
 *
 * 启动：node server.js  （默认端口 5173）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { runTraining } = require('../train/train-lib');

const PORT = parseInt(process.env.PORT, 10) || 5173;
const PUBLIC_DIR = path.join(__dirname, 'public');

// 全局状态
let state = {
  running: false,
  stopped: false,
  config: null,
  history: [],         // 所有 SSE 事件（供新连接的客户端回放）
  result: null
};
let stopFlag = false;
const clients = new Set(); // SSE 客户端响应对象集合

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  state.history.push({ event, data });
  // 限制历史长度，避免内存无限增长
  if (state.history.length > 2000) state.history = state.history.slice(-1500);
  for (const res of clients) {
    try { sendEvent(res, event, data); } catch (e) { /* 客户端已断开 */ }
  }
}

function wrapCallbacks() {
  return {
    onStage: (s) => broadcast('stage', s),
    onLog: (m) => broadcast('log', { message: m }),
    onCorpus: (d) => broadcast('corpus', d),
    onCleaning: (d) => broadcast('cleaning', d),
    onFeatures: (d) => broadcast('features', d),
    onModel: (d) => broadcast('model', d),
    onEpoch: (d) => broadcast('epoch', d),
    onEval: (d) => broadcast('eval', d),
    onExport: (d) => broadcast('export', d),
    shouldStop: () => stopFlag
  };
}

async function startTraining(config) {
  if (state.running) return { ok: false, error: '训练已在运行中' };
  state = { running: true, stopped: false, config, history: [], result: null };
  stopFlag = false;
  broadcast('reset', {});
  broadcast('stage', { stage: 'init' });
  broadcast('log', { message: `[Dashboard] 启动训练，配置：${JSON.stringify(config)}` });
  try {
    const result = await runTraining(config, wrapCallbacks());
    state.result = result;
    state.running = false;
    state.stopped = result.stopped;
    broadcast('done', { stopped: result.stopped, weightsSizeKB: result.weightsSizeKB, accuracy: result.eval ? result.eval.accuracy : null });
    return { ok: true };
  } catch (e) {
    state.running = false;
    broadcast('error', { message: String((e && e.message) || e) });
    broadcast('done', { stopped: true, error: String((e && e.message) || e) });
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function handleStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  // 防穿越
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function handleStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  // 先回放历史事件
  for (const h of state.history) {
    try { sendEvent(res, h.event, h.data); } catch (e) { break; }
  }
  clients.add(res);
  const alive = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch (e) {} }, 15000);
  req_on_close: {
    const cleanup = () => { clearInterval(alive); clients.delete(res); };
    res.on('close', cleanup);
    res.on('error', cleanup);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/api/stream' && req.method === 'GET') {
      handleStream(res);
      return;
    }
    if (url === '/api/state' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ running: state.running, stopped: state.stopped, config: state.config, result: state.result, historyCount: state.history.length }));
      return;
    }
    if (url === '/api/train' && req.method === 'POST') {
      const config = await readBody(req);
      // 异步启动，不阻塞响应
      const r = await startTraining(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
      return;
    }
    if (url === '/api/stop' && req.method === 'POST') {
      stopFlag = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: '已请求停止' }));
      return;
    }
    handleStatic(req, res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
  }
});

server.listen(PORT, () => {
  console.log(`\n[FillOut Dashboard] 训练可视化面板已启动：http://localhost:${PORT}\n`);
});
