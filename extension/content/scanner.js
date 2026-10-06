/**
 * DOM 扫描器：遍历页面所有可填控件并提取打分信号。
 * 覆盖 input / textarea / select / radio / checkbox / [contenteditable]。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.scanner = FO.scanner || {};

  var SELECTOR = [
    'input[type="text"]', 'input[type="tel"]', 'input[type="email"]', 'input[type="number"]',
    'input[type="date"]', 'input[type="month"]', 'input[type="radio"]', 'input[type="checkbox"]',
    'input:not([type])', 'textarea', 'select',
    '[contenteditable="true"]', '[contenteditable=""]'
  ].join(',');

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    var style;
    try { style = getComputedStyle(el); } catch (e) { return false; }
    if (style.visibility === 'hidden' || style.display === 'none' || +style.opacity === 0) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    return true;
  }

  function isFillable(el) {
    if (el.disabled || el.readOnly) return false;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password'].indexOf(type) !== -1) return false;
    return true;
  }

  /** 找控件的人类可读标签 */
  function labelText(el) {
    var parts = [];
    // 1) <label for>
    if (el.id) {
      var lab = el.ownerDocument.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (lab) parts.push(lab.textContent || '');
    }
    // 2) 包裹式 label
    var wrap = el.closest ? el.closest('label') : null;
    if (wrap) parts.push(wrap.textContent || '');
    // 3) aria-labelledby
    var lbby = el.getAttribute('aria-labelledby');
    if (lbby) {
      lbby.split(/\s+/).forEach(function (id) {
        var n = el.ownerDocument.getElementById(id);
        if (n) parts.push(n.textContent || '');
      });
    }
    // 4) 前置兄弟 / 表格单元格 / 前置文本
    var sib = previousTextSibling(el, 3);
    if (sib) parts.push(sib);
    var cell = el.closest && el.closest('td,th');
    if (cell) {
      var row = cell.closest('tr');
      var idx = cell.cellIndex;
      if (row && idx > 0) {
        var head = row.cells[idx - 1];
        if (head) parts.push(head.textContent || '');
      }
      var tbl = cell.closest('table');
      if (tbl && idx > 0) {
        var th = tbl.querySelector('thead th:nth-child(' + (idx + 1) + '), thead td:nth-child(' + (idx + 1) + ')');
        if (th) parts.push(th.textContent || '');
      }
    }
    // 5) 父级 .form-item / .field 类容器里的 label
    var item = el.closest && el.closest('[class*="form-item"],[class*="form-group"],[class*="field"],[class*="item"],[class*="row"],[class*="cell"],[class*="label-"]');
    if (item) {
      item.querySelectorAll('label,.label,[class*="label"]').forEach(function (l) {
        if (!l.contains(el) && l.textContent) parts.push(l.textContent);
      });
    }
    return dedup(parts).join(' ').slice(0, 120);
  }

  function previousTextSibling(el, maxHops) {
    var n = el;
    for (var i = 0; i < maxHops && n; i++) {
      var prev = i === 0 ? n.previousElementSibling : (n.parentElement ? n.parentElement.previousElementSibling : null);
      var probe = n.previousElementSibling;
      if (probe) {
        var t = (probe.textContent || '').trim();
        if (t && probe.children.length === 0) return t.slice(0, 60);
        if (t) return t.slice(0, 60);
      }
      n = probe || n.parentElement;
    }
    return '';
  }

  function dataAttrs(el) {
    var out = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf('data-') === 0 && a.value && a.value.length < 60) out.push(a.value);
    }
    return out.join(' ');
  }

  function optionsText(el) {
    if (el.tagName !== 'SELECT') return '';
    var texts = [];
    var opts = el.options || [];
    for (var i = 0; i < Math.min(opts.length, 30); i++) texts.push((opts[i].text || '').trim());
    return texts.join(' ').slice(0, 160);
  }

  /** 附近上下文：向上找最近的一个语义容器，取其中标题/说明文本（截断） */
  function contextText(el) {
    var container = el.closest && el.closest('fieldset,section,[class*="step"],[class*="module"],[class*="block"],[class*="panel"],[class*="card"],table');
    if (!container) return '';
    var heads = container.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,.title,[class*="title"],[class*="header"],caption');
    var out = [];
    for (var i = 0; i < Math.min(heads.length, 4); i++) {
      var t = (heads[i].textContent || '').trim();
      if (t) out.push(t);
    }
    return out.join(' ').slice(0, 80);
  }

  /** 同一行 key（用于日期对识别：同一 tr/行容器内两个日期控件 → start/end） */
  function domRowKey(el) {
    var n = el.closest('tr,[class*="row"],[class*="date-item"],[class*="range"],[class*="period"]');
    return n ? nodePath(n) : '';
  }

  function nodePath(n) {
    var path = [];
    var cur = n;
    for (var i = 0; i < 4 && cur && cur.nodeType === 1; i++) {
      var sib = 0, p = cur;
      while (p) { sib++; p = p.previousElementSibling; }
      path.unshift(cur.tagName + ':' + sib + ':' + (cur.className && typeof cur.className === 'string' ? cur.className.split(' ')[0] : ''));
      cur = cur.parentElement;
    }
    return path.join('>');
  }

  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  function dedup(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) {
      var k = x && x.trim();
      if (k && !seen[k]) { seen[k] = 1; out.push(k); }
    });
    return out;
  }

  /** 描述单个控件（扫描与「聚焦追踪」共用） */
  FO.scanner.describe = function (el, root) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id === 'fo-ball-host' || el.id === 'fo-badge-host') return null;
    if (!isFillable(el) || !isVisible(el)) return null;
    var name = el.getAttribute('name') || '';
    var kind = classify(el);
    if (!kind) return null;
    var doc = el.ownerDocument || document;
    var ctrl = {
      el: el,
      kind: kind,
      type: el.getAttribute('type') || (el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')),
      signals: {
        name: name,
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        dataAttrs: dataAttrs(el),
        labelText: labelText(el),
        optionsText: optionsText(el),
        type: el.getAttribute('type') || (el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'))
      },
      contextText: contextText(el),
      rowKey: domRowKey(el),
      documentOrder: 0
    };
    if (kind === 'radio' || kind === 'checkbox') {
      ctrl.radioGroup = name ? (root || doc).querySelectorAll('input[type="' + kind + '"][name="' + cssEscape(name) + '"]') : [el];
    }
    return ctrl;
  };

  /**
   * 扫描 root（默认 document）下所有可填控件。
   * 返回 Ctrl[]：{ el, kind, type, signals, contextText, rowKey, radioGroup }
   */
  FO.scanner.scan = function (root) {
    root = root || document;
    var nodes;
    try { nodes = root.querySelectorAll(SELECTOR); } catch (e) { return []; }
    var out = [], seen = new Set();
    nodes.forEach(function (el) {
      if (seen.has(el)) return;
      seen.add(el);
      var ctrl = FO.scanner.describe(el, root);
      if (ctrl) out.push(ctrl);
    });
    return out;
  };

  function classify(el) {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.getAttribute('contenteditable') !== null) return 'contenteditable';
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'radio') return 'radio';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'date' || t === 'month') return 'date';
    if (['text', 'tel', 'email', 'number'].indexOf(t) !== -1 || !el.getAttribute('type')) return 'text';
    return null;
  }
})(typeof self !== 'undefined' ? self : globalThis);
