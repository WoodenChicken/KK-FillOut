/**
 * Offscreen OCR：Tesseract.js（LSTM，chi_sim+eng 快速模型，全部本地）。
 * 输入 background 转发的截图 dataURL，输出行级文本 + 图像像素坐标。
 * workerBlobURL 必须为 false：MV3 CSP 禁止 blob: worker，直接用扩展 URL 创建。
 */
'use strict';

// 截图超过此宽度先等比缩小再 OCR。视网膜屏截图常达 3000-4000px，
// 缩小到 1600px 像素量降到约 1/4~1/6，OCR 提速明显，标签识别精度几乎无损。
var MAX_IMG_W = 1600;

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

/**
 * 解码截图尺寸；若超过 MAX_IMG_W 则用 canvas 等比缩小，返回新的 dataURL 与尺寸。
 * 合并了原本独立的 imageSize + 缩放，避免图片被解码两次。
 */
function prepareImage(dataUrl) {
  return new Promise(function (resolve, reject) {
    var im = new Image();
    im.onload = function () {
      var w = im.naturalWidth, h = im.naturalHeight;
      if (w <= MAX_IMG_W) {
        resolve({ dataUrl: dataUrl, w: w, h: h });
        return;
      }
      var scale = MAX_IMG_W / w;
      var cv = document.createElement('canvas');
      cv.width = MAX_IMG_W;
      cv.height = Math.max(1, Math.round(h * scale));
      var ctx = cv.getContext('2d');
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      resolve({ dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height });
    };
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
    var prepared;
    prepareImage(msg.dataUrl)
      .then(function (p) {
        prepared = p;
        return getWorker();
      })
      .then(function (worker) {
        // PSM 11 = Sparse text：只找零散文本行，不做整页版面/栏分析。
        // 表单标签是散布在控件旁的短文本，此模式比默认 PSM 3 快得多。
        return worker.recognize(prepared.dataUrl, { tessedit_pageseg_mode: '11' }, { text: true, blocks: true });
      })
      .then(function (ret) {
        sendResponse({
          ok: true,
          lines: collectLines(ret.data),
          imgW: prepared.w,
          imgH: prepared.h,
          ms: Date.now() - t0
        });
      })
      .catch(function (e) {
        // worker 初始化失败后重置，下次重试
        workerPromise = null;
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      });
  })();
  return true; // 异步响应
});
