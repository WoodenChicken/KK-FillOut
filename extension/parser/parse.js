/**
 * 解析入口：按扩展名分发 PDF / DOC / DOCX / JSON / Markdown → resume.json。
 * 运行在扩展页面（Side Panel），依赖 window.pdfjsLib（vendor/pdf.min.js）。
 * 隐私：文件仅在本地内存中解析，绝不发起任何网络请求。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};

  if (root.pdfjsLib) {
    try { root.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js'); } catch (e) { /* 测试环境 */ }
  }

  async function pdfToText(arrayBuffer) {
    if (!root.pdfjsLib) throw new Error('pdf.js 未加载（vendor/pdf.min.js 缺失）');
    var doc = await root.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false, useSystemFonts: true }).promise;
    var out = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var content = await page.getTextContent();
      // 按 y 坐标聚类成行
      var rows = [];
      var items = content.items;
      items.forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var y = Math.round(it.transform[5] / 3) * 3; // 3pt 容差
        var row = rows.find(function (r) { return Math.abs(r.y - y) <= 3; });
        if (!row) { row = { y: y, items: [] }; rows.push(row); }
        row.items.push({ x: it.transform[4], s: it.str });
      });
      rows.sort(function (a, b) { return b.y - a.y; });
      rows.forEach(function (r) {
        r.items.sort(function (a, b) { return a.x - b.x; });
        var line = '';
        var lastEnd = -1;
        r.items.forEach(function (seg) {
          if (lastEnd >= 0 && seg.x - lastEnd > 12) line += ' | ';
          else if (lastEnd >= 0 && seg.x - lastEnd > 1 && !/\s$/.test(line)) line += ' ';
          line += seg.s;
          lastEnd = seg.x + (seg.width || 0);
        });
        if (line.trim()) out.push(line.trim());
      });
      if (p < doc.numPages) out.push('');
    }
    var text = out.join('\n');
    // 扫描型 PDF：几乎无文本层
    if (text.replace(/\s/g, '').length < 40) {
      var err = new Error('SCANNED_PDF');
      err.code = 'SCANNED_PDF';
      throw err;
    }
    return text;
  }

  function markdownToText(text) {
    return String(text)
      .replace(/^---[\s\S]*?---/m, '')          // front-matter
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/[*_`]{1,3}/g, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\|/gm, '').replace(/\|\s*$/gm, '')
      .trim();
  }

  /**
   * @param {File} file
   * @returns {Promise<{resume, text, warning?}>}
   */
  FO.parser = {
    parseFile: async function (file) {
      var name = (file.name || '').toLowerCase();
      var warning = null;
      var text = null;

      if (name.endsWith('.pdf')) {
        text = await pdfToText(await file.arrayBuffer());
      } else if (name.endsWith('.docx')) {
        text = await FO.docx.extractText(await file.arrayBuffer());
      } else if (name.endsWith('.doc')) {
        text = await FO.docx.extractLegacyDoc(await file.arrayBuffer());
        warning = '.doc 为老格式，解析精度有限；建议另存为 .docx / .pdf';
      } else if (name.endsWith('.json')) {
        var obj = JSON.parse(new TextDecoder('utf-8').decode(await file.arrayBuffer()));
        return { resume: FO.normalizeResume(obj), text: JSON.stringify(obj, null, 2), warning: null };
      } else if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
        text = markdownToText(new TextDecoder('utf-8').decode(await file.arrayBuffer()));
      } else {
        throw new Error('暂不支持的格式：' + file.name + '（支持 PDF / DOC / DOCX / JSON / MD / TXT）');
      }

      var resume = FO.extractor.parse(text);
      return { resume: resume, text: text, warning: warning };
    },

    pdfToText: pdfToText
  };
})(typeof self !== 'undefined' ? self : globalThis);
