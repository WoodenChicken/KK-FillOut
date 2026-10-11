/**
 * Offscreen OCR：Tesseract.js（LSTM，chi_sim+eng 快速模型，全部本地）。
 * 输入 background 转发的截图 dataURL，输出行级文本 + 图像像素坐标。
 * workerBlobURL 必须为 false：MV3 CSP 禁止 blob: worker，直接用扩展 URL 创建。
 */
'use strict';

var workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(['chi_sim', 'eng'], 1, {
      workerPath: chrome.runtime.getURL('vendor/ocr/worker.min.js'),
      corePath: chrome.runtime.getURL('vendor/ocr/'),
      langPath: chrome.runtime.getURL('vendor/ocr/langs'),
      workerBlobURL: false,
      lstmOnly: true,          // 只加载 LSTM 核心（tesseract-core-simd-lstm）
      cacheMethod: 'none',     // offscreen 环境不依赖 Cache Storage，语言包本身就在本地
      logger: function () { /* 静默 */ },
      errorHandler: function () { /* 失败由 recognize 的 reject 上报 */ }
    });
  }
  return workerPromise;
}

function imageSize(dataUrl) {
  return new Promise(function (resolve, reject) {
    var im = new Image();
    im.onload = function () { resolve({ width: im.naturalWidth, height: im.naturalHeight }); };
    im.onerror = function () { reject(new Error('截图解码失败')); };
    im.src = dataUrl;
  });
}

/** 展平 blocks → 行级 {text, x0,y0,x1,y1, conf}（坐标为图像像素） */
function collectLines(data) {
  var lines = [];
  (data.blocks || []).forEach(function (b) {
    (b.paragraphs || []).forEach(function (p) {
      (p.lines || []).forEach(function (l) {
        var text = String(l.text || '').replace(/\s+/g, ' ').trim();
        if (!text || !l.bbox) return;
        var conf = typeof l.confidence === 'number' ? l.confidence : 60;
        if (conf < 35) return; // 低置信度噪点直接丢弃
        lines.push({ text: text, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1, conf: conf });
      });
    });
  });
  return lines;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'FO_OCR_RUN') return;
  (function () {
    var t0 = Date.now();
    getWorker()
      .then(function (worker) {
        return worker.recognize(msg.dataUrl, {}, { text: true, blocks: true }).then(function (ret) {
          return Promise.all([collectLines(ret.data), imageSize(msg.dataUrl)]);
        });
      })
      .then(function (out) {
        sendResponse({ ok: true, lines: out[0], imgW: out[1].width, imgH: out[1].height, ms: Date.now() - t0 });
      })
      .catch(function (e) {
        // worker 初始化失败后重置，下次重试
        workerPromise = null;
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      });
  })();
  return true; // 异步响应
});
