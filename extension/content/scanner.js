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
    'input:not([type])', 'input[type="search"][role="combobox"]', 'textarea', 'select',
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

  function inputClass(el) {
    return (el && el.className && typeof el.className === 'string') ? el.className : '';
  }

  function inputPlaceholder(el) {
    return String((el && el.getAttribute && el.getAttribute('placeholder')) || '').trim();
  }

  function isTdesignChooser(el) {
    var cls = inputClass(el);
    var ph = inputPlaceholder(el);
    return /(^|\s)t-input__inner(\s|$)/.test(cls) && /^请选择/.test(ph);
  }

  /**
   * Layui 自定义控件：原生的 select 被隐藏，可见入口是只读的模拟输入框。
   *   - 下拉：class 含 layui-unselect（layui.form 渲染的 select）
   *   - 日期：laydate 年月选择器，只读 + 「请选择…」占位
   * 这些 readonly 输入若不做例外会被 isFillable 过滤掉（整段表单识别不到）。
   */
  function isLayuiChooser(el) {
    var cls = inputClass(el);
    if (!/(^|\s)layui-/.test(cls)) return false;
    if (/(^|\s)layui-unselect(\s|$)/.test(cls)) return true;
    return !!(el.readOnly && /^请选择/.test(inputPlaceholder(el)));
  }
  FO.scanner.isLayuiChooser = isLayuiChooser;

  function isFillable(el) {
    // [role=combobox]：antd Select 等组件库的内部搜索框（type=search + readonly），
    // 是「组合控件」的填写入口，不能因 readonly 被过滤；真 disabled 仍然排除。
    var isWidget = (el.getAttribute && el.getAttribute('role') === 'combobox') ||
      isTdesignChooser(el) || isLayuiChooser(el);
    if (el.disabled) return false;
    if (!isWidget && el.readOnly) return false;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password'].indexOf(type) !== -1) return false;
    return true;
  }

  /** 找控件的人类可读标签 */
  function labelText(el) {
    var parts = [];
    var inputVal = (el.value || '').trim();
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
    // 3.5) aria-label（自定义组件常用）
    var aLabel = el.getAttribute('aria-label');
    if (aLabel) parts.push(aLabel);
    // 4) 前置兄弟 / 表格单元格 / 前置文本
    // 爬 12 层：antd Form.Item 等组件库会在输入框外裹 4~6 层包装 div，
    // 标签 div（如光大站 .resume-form-title）在包装层之外，浅爬拿不到
    var sib = previousTextSibling(el, 12);
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
    var item = el.closest && el.closest('[class*="form-item"],[class*="form_group"],[class*="form-group"],[class*="field"],[class*="item"],[class*="row"],[class*="cell"],[class*="label-"]');
    if (item) {
      // 5.1) 优先找明确的表单标签元素（Phoenix/antd/Element 等）
      var preciseLabel = item.querySelector('[class*="form-item__label"],[class*="form-item-label"],[class*="form-item__labelText"],[class*="ant-form-item-label"] > label,[class*="el-form-item__label"],[class*="van-field__label"],[class*="nut-form-item__label"],[class*="phoenix-form-item__label"]');
      if (preciseLabel && !preciseLabel.contains(el)) {
        var pt = (preciseLabel.textContent || '').replace(/\s+/g, ' ').trim();
        if (pt && pt.length < 30 && pt !== inputVal) parts.push(pt);
      }
      // 5.2) 通用 label 元素（排除值显示元素）
      if (!preciseLabel || parts.length === 0) {
        var labelEls = item.querySelectorAll('label,.label,[class*="label"],.title,[class*="title"]');
        for (var li = 0; li < labelEls.length; li++) {
          var l = labelEls[li];
          if (l.contains(el)) continue;
          var lt = (l.textContent || '').trim();
          // 排除选中值显示元素（文本等于 input value 的）
          if (lt && lt.length < 30 && lt !== inputVal) parts.push(lt);
        }
      }
    }
    // 6) 兜底：控件前面最近的短文本节点（select/radio 尤其有效）
    var inline = findInlineLabelBefore(el);
    if (inline) parts.push(inline);
    return dedup(parts).join(' ').slice(0, 120);
  }

  /** 找控件前面紧邻的"短文本标签"，如 <span>性别</span><select> 或 <label>性别：</label> */
  function findInlineLabelBefore(el) {
    var inputVal = (el.value || '').trim();
    var n = el;
    for (var i = 0; i < 8 && n; i++) {
      var prev = n.previousElementSibling;
      while (prev) {
        var t = (prev.textContent || '').trim();
        // 排除选项容器、按钮、值显示元素（文本等于 input value）等；只取短文本（<30字）
        if (t && t.length < 30 && t.length >= 1 &&
            t !== inputVal &&
            !/^(选|请选择|search|input|button)/i.test(t) &&
            !prev.querySelector('input,select,textarea,button')) {
          // 去掉末尾冒号
          return t.replace(/[：:]\s*$/, '').trim();
        }
        prev = prev.previousElementSibling;
      }
      n = n.parentElement;
    }
    return '';
  }

  function previousTextSibling(el, maxHops) {
    var n = el;
    var inputVal = (el.value || '').trim();
    for (var i = 0; i < maxHops && n; i++) {
      var probe = n.previousElementSibling;
      if (probe) {
        var t = (probe.textContent || '').trim();
        // 排除值显示元素（文本等于 input value）和包含子控件的容器
        if (t && t !== inputVal && !probe.querySelector('input,select,textarea,button')) return t.slice(0, 60);
      }
      n = n.parentElement;
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

  /**
   * 日期子控件识别：placeholder 为「年/月/日」，或 select 的选项全是年份 / 1-12 月份。
   * 这类控件自身没有字段名（标签就是"年""月"），必须由 matcher 聚合成区间单元后再成组填充。
   */
  var DATE_PART_PLACEHOLDER = { '年': 'year', '月': 'month', '日': 'day', '天': 'day' };

  function datePartOf(el) {
    var ph = String((el.getAttribute && el.getAttribute('placeholder')) || '').trim();
    if (DATE_PART_PLACEHOLDER[ph]) return DATE_PART_PLACEHOLDER[ph];
    if (el.tagName !== 'SELECT' || !el.options) return null;
    var hasYear = false, hasMonth = false, n = Math.min(el.options.length, 60);
    for (var i = 0; i < n; i++) {
      var t = String((el.options[i] && el.options[i].text) || '').trim();
      if (/^\d{4}\s*年?$/.test(t)) hasYear = true;
      else if (/^\d{1,2}\s*月?$/.test(t)) {
        var m = parseInt(t, 10);
        if (m >= 1 && m <= 12) hasMonth = true;
      }
    }
    if (hasYear && !hasMonth) return 'year';
    if (hasMonth && !hasYear) return 'month';
    return null;
  }
  FO.scanner.datePartOf = datePartOf;

  /**
   * 附近上下文：向上找最近的语义容器，采集其中可能的区块标题文本。
   * 不仅限于 h1-h6，还包括容器自身开头的直接文本（很多表单把"家庭成员"写在 plain div 里），
   * 以及容器前一个兄弟元素（常见于"标题在上、表单在下"的布局）。
   */
  function contextText(el) {
    var container = el.closest && el.closest('fieldset,section,article,[class*="step"],[class*="module"],[class*="block"],[class*="panel"],[class*="card"],[class*="form-item"],[class*="group"],[class*="section"],[class*="fieldset"],table,dl');
    if (!container) return '';
    var out = [];
    // 1) 语义标题元素
    var heads = container.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,caption,.title,[class*="title"],[class*="header"],[class*="heading"]');
    for (var i = 0; i < Math.min(heads.length, 4); i++) {
      var t = (heads[i].textContent || '').trim();
      if (t) out.push(t);
    }
    // 2) 容器自身的直接文本节点（开头一段，通常是区块标题/说明）
    var direct = '';
    for (var c = container.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { direct += c.textContent; }
      else if (c.nodeType === 1) {
        var tag = c.tagName;
        // 跳过表单控件容器，取前面的标题性文本
        if (/^(INPUT|TEXTAREA|SELECT|BUTTON|LABEL)$/.test(tag)) break;
      }
      if (direct.length > 40) break;
    }
    direct = direct.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (direct) out.push(direct);
    // 3) 容器前一个兄弟元素（"标题在上、区块在下"的布局）
    var prev = container.previousElementSibling;
    if (prev) {
      var pt = (prev.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (pt) out.push(pt);
    }
    return out.join(' ').slice(0, 100);
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
      datePart: datePartOf(el), // 'year' | 'month' | 'day' | null（年/月子控件，交给 matcher 聚合成日期区间）
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
      // antd Radio/Checkbox 的 input 常没有 name 属性，按 name 分组会只剩自己一个；
      // 此时退回按组容器（ant-radio-group / role=radiogroup 等）收集整组
      var grp = name ? (root || doc).querySelectorAll('input[type="' + kind + '"][name="' + cssEscape(name) + '"]') : null;
      if (!grp || grp.length <= 1) {
        var groupBox = el.closest('[role="radiogroup"],[role="group"],.ant-radio-group,.ant-checkbox-group,[class*="radio-group"],[class*="checkbox-group"],[class*="el-radio-group"],[class*="el-checkbox-group"],[class*="van-radio-group"],[class*="van-checkbox-group"],[class*="nut-radio-group"],[class*="nut-checkbox-group"],[class*="uni-radio-group"],[class*="uni-checkbox-group"],fieldset');
        if (groupBox) grp = groupBox.querySelectorAll('input[type="' + kind + '"]');
      }
      // 兜底：同 name 在整个文档里找（部分站 name 不同但实际是一组的，靠上面容器逻辑）
      if (!grp || grp.length <= 1) {
        var docAll = (root || doc).querySelectorAll('input[type="' + kind + '"][name="' + cssEscape(name) + '"]');
        if (docAll && docAll.length > 1) grp = docAll;
      }
      ctrl.radioGroup = grp && grp.length ? grp : [el];
      // 提取组内所有选项的文本（value + 包裹 label 的文本），写入 optionsText，
      // 供 matcher 做类型提示（如性别「男/女」、健康状况「良好/一般/较差」等）
      var optTexts = [];
      (ctrl.radioGroup || []).forEach(function (r) {
        var v = (r.value || '').trim();
        if (v) optTexts.push(v);
        var w = r.closest ? r.closest('label') : null;
        if (w) {
          var t = (w.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t !== v && t.length < 20) optTexts.push(t);
        }
      });
      ctrl.signals.optionsText = optTexts.join(' ').slice(0, 160);
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
    // 自定义选择框：Phoenix/antd/Element 等组件库的 Select 底层是 input
    var cls = inputClass(el);
    var ph = inputPlaceholder(el);
    if (el.getAttribute('role') === 'combobox' ||
        /phoenix-select__input|ant-select-selection-search-input|el-input__inner.*select|van-field__control|nut-input__input/.test(cls) ||
        el.hasAttribute('data-select')) {
      return 'combobox';
    }
    if (isTdesignChooser(el)) {
      return /日期|时间/.test(ph) ? 'date' : 'combobox';
    }
    if (isLayuiChooser(el)) {
      return /(^|\s)layui-unselect(\s|$)/.test(cls) ? 'combobox' : 'date';
    }
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'radio') return 'radio';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'date' || t === 'month') return 'date';
    if (['text', 'tel', 'email', 'number'].indexOf(t) !== -1 || !el.getAttribute('type')) return 'text';
    return null;
  }
})(typeof self !== 'undefined' ? self : globalThis);
