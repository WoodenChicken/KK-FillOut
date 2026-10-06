/**
 * DOCX 文本提取 —— 零依赖：手写 ZIP 目录解析 + DecompressionStream('deflate-raw')。
 * 仅需 word/document.xml（含表格）。.doc（OLE2 老格式）走 best-effort 的 UTF-16LE 游程提取。
 * 在扩展页面（Side Panel）环境中运行，依赖 DOMParser / DecompressionStream。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};

  function u16(dv, off) { return dv.getUint16(off, true); }
  function u32(dv, off) { return dv.getUint32(off, true); }

  /** 在 ZIP 的 central directory 中找 named entry；返回 {compSize, uncompSize, method, localOff} */
  function findZipEntry(buf, name) {
    var dv = new DataView(buf);
    // 从尾部扫描 EOCD（0x06054b50），最多回退 64KB+22
    var eocd = -1;
    var lo = Math.max(0, buf.byteLength - (65536 + 22));
    for (var i = buf.byteLength - 22; i >= lo; i--) {
      if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 ZIP/DOCX 文件');
    var count = u16(dv, eocd + 10);
    var cdOff = u32(dv, eocd + 16);
    var p = cdOff;
    for (var n = 0; n < count; n++) {
      if (u32(dv, p) !== 0x02014b50) break;
      var method = u16(dv, p + 10);
      var compSize = u32(dv, p + 20);
      var uncompSize = u32(dv, p + 24);
      var nameLen = u16(dv, p + 28);
      var extraLen = u16(dv, p + 30);
      var cmtLen = u16(dv, p + 32);
      var localOff = u32(dv, p + 42);
      var entryName = '';
      for (var c = 0; c < nameLen; c++) entryName += String.fromCharCode(dv.getUint8(p + 46 + c));
      if (entryName === name) {
        return { method: method, compSize: compSize, uncompSize: uncompSize, localOff: localOff };
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    throw new Error('DOCX 中缺少 word/document.xml');
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持 DecompressionStream');
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    var reader = stream.getReader();
    var chunks = [];
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
    }
    return new Blob(chunks).text();
  }

  function xmlToText(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var lines = [];
    // 表格行：单元格用 " | " 连接
    var tables = doc.getElementsByTagName('w:tbl');
    Array.prototype.forEach.call(tables, function (tbl) {
      var rows = tbl.getElementsByTagName('w:tr');
      Array.prototype.forEach.call(rows, function (tr) {
        var cells = tr.getElementsByTagName('w:tc');
        var parts = [];
        Array.prototype.forEach.call(cells, function (tc) {
          var ts = tc.getElementsByTagName('w:t');
          var cell = '';
          Array.prototype.forEach.call(ts, function (t) { cell += t.textContent; });
          parts.push(cell.trim());
        });
        lines.push(parts.join(' | '));
      });
    });
    // 普通段落（去重表格内已提取的）
    var body = doc.getElementsByTagName('w:body')[0] || doc.documentElement;
    var paragraphs = body.getElementsByTagName('w:p');
    Array.prototype.forEach.call(paragraphs, function (p) {
      if (p.closest && p.closest('w:tbl')) return;
      var ts = p.getElementsByTagName('w:t');
      var txt = '';
      Array.prototype.forEach.call(ts, function (t) { txt += t.textContent; });
      if (txt.trim()) lines.push(txt.trim());
    });
    return lines.join('\n');
  }

  /** ArrayBuffer -> text（DOCX） */
  FO.docx = {
    extractText: function (buf) {
      try {
        var entry = findZipEntry(buf, 'word/document.xml');
        var u8 = new Uint8Array(buf, entry.localOff, entry.compSize);
        // local header 跳过：nameLen/extraLen 在 local header 内
        var dv = new DataView(buf);
        var nameLen = u16(dv, entry.localOff + 26);
        var extraLen = u16(dv, entry.localOff + 28);
        var dataOff = entry.localOff + 30 + nameLen + extraLen;
        u8 = new Uint8Array(buf, dataOff, entry.compSize);
        if (entry.method === 0) {
          // stored
          return Promise.resolve(xmlToText(new TextDecoder('utf-8').decode(u8)));
        }
        return inflateRaw(u8, entry.compSize).then(xmlToText);
      } catch (e) {
        return Promise.reject(e);
      }
    },

    /** .doc 老格式：best-effort 提取 UTF-16LE 文本游程 */
    extractLegacyDoc: function (buf) {
      var dv = new DataView(buf);
      var out = [], run = '';
      for (var i = 0; i + 1 < buf.byteLength; i += 2) {
        var code = u16(dv, i);
        var ch = null;
        if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x20 && code <= 0x7e) || code === 0x2014 || code === 0x2018 || code === 0x2019 || code === 0x201c || code === 0x201d || code === 0x3001 || code === 0x3002) {
          ch = String.fromCharCode(code);
        }
        if (ch) run += ch;
        else {
          if (run.length >= 4) out.push(run);
          run = '';
        }
      }
      if (run.length >= 4) out.push(run);
      var text = out.join('\n');
      if (text.replace(/\s/g, '').length < 30) {
        return Promise.reject(new Error('.doc 老格式解析质量较低，请另存为 .docx 或 .pdf 后重试'));
      }
      return Promise.resolve(text);
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
