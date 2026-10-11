/**
 * 填充引擎：把 resume 值安全地写进各类控件，并触发主流框架（React/Vue/jQuery）能感知的事件。
 * 支持：text/textarea/date/select/radio/checkbox/contenteditable/级联行政区划/富文本段落。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.filler = FO.filler || {};

  var undoStack = [];

  /** 以原生 setter 赋值绕过 React valueTracker，再派发 input/change */
  function setNativeValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      (el instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    var desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function norm(s) { return FO.matcher.norm(s); }

  /** 按站点习惯格式化日期值 */
  function formatDateValue(iso, ctrl) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})(?:[-/.年](\d{1,2}))?(?:[-/.月](\d{1,2}))?/);
    if (!m) return String(iso);
    var y = m[1], mo = m[2] || '', d = m[3] || '';
    var hints = norm([ctrl.signals.placeholder, ctrl.signals.labelText, ctrl.signals.name, ctrl.signals.id].join(' '));
    if (ctrl.type === 'date') return y + '-' + pad(mo) + (d ? '-' + pad(d) : '-01');
    if (ctrl.type === 'month') return y + '-' + (pad(mo) || '01');
    if (/[\u4e00-\u9fa5]年|yyyy年/.test(hints)) {
      return mo ? (y + '年' + pad(mo) + (d ? '月' + pad(d) : '')) : y + '年';
    }
    if (/yyyy\/mm/.test(hints)) return y + '/' + (pad(mo) || '01');
    return iso; // 默认 ISO：YYYY-MM / YYYY-MM-DD
  }

  function pad(n) { n = String(n || ''); return n.length === 1 ? '0' + n : n; }

  /** select 选项匹配：文本 → value → 包含 → 归一化包含 */
  function pickOption(select, value) {
    var want = norm(value);
    if (!want) return null;
    var opts = Array.prototype.slice.call(select.options || []);
    var v;
    v = opts.find(function (o) { return norm(o.text) === want; }) ||
      opts.find(function (o) { return norm(o.value) === want; });
    if (v) return { opt: v, fuzzy: false };
    // 去掉"请选择"类占位项再做包含匹配
    var real = opts.filter(function (o) { return !/^(请选择|请选择|select|choose|-{2,}|全部|不限)$/.test(norm(o.text)); });
    v = real.find(function (o) { return norm(o.text).indexOf(want) !== -1 || want.indexOf(norm(o.text)) !== -1 && norm(o.text).length >= 2; });
    if (v) return { opt: v, fuzzy: true };
    // 级联城市：'浙江省杭州市' 拆词
    var region = FO.region.parse(value);
    if (region && region.city) {
      v = real.find(function (o) { return norm(o.text).indexOf(norm(region.city)) !== -1; });
      if (v) return { opt: v, fuzzy: true };
    }
    return null;
  }

  function radioGroupValue(el) {
    var name = el.getAttribute('name');
    if (!name) return null;
    return el.form || el.closest('form,fieldset,body') || document;
  }

  /**
   * 填一个控件。返回 {ok, fuzzy, message}
   * value: 字符串值；数组组字段请先解析好对应段。
   */
  FO.filler.fillControl = function (ctrl, value, opts) {
    opts = opts || {};
    var el = ctrl.el;
    var result = { ok: false, fuzzy: false, message: '' };
    try {
      switch (ctrl.kind) {
        case 'text':
        case 'textarea':
        case 'date': {
          var v = String(value);
          var isDateish = ctrl.kind === 'date' ||
            (opts.key && /(^|\.)((birth|available|start|end)Date|date)$/.test(opts.key));
          var hints = norm([ctrl.signals.placeholder, ctrl.signals.labelText, ctrl.signals.ocrText || '',
            ctrl.signals.name, ctrl.signals.id].join(' '));
          if (isDateish) {
            v = formatDateValue(value, ctrl);
            // 组件日期选择器（无原生 type、站点也没声明年月格式）一般要求到日：
            // 简历里只有年月时补 1 日并提示核对；已声明 YYYY-MM 的纯文本框保持年月
            if (ctrl.kind !== 'date' && ctrl.kind !== 'month' && /^\d{4}-\d{2}$/.test(v) &&
              !/(yyyy[-/\s]*mm|yyyy年mm|年月|mm\/yyyy)/i.test(hints)) {
              v += '-01';
              result.fuzzy = true;
            }
          }
          undoPush(el);
          setNativeValue(el, v);
          // antd DatePicker 等组件：输入后需要 Enter/blur 提交；原生 date 输入派发 Enter 无副作用
          if (isDateish || /日期|时间|date|picker/.test(hints)) commitEnter(el);
          if (opts.blur !== false) {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.dispatchEvent(new Event('focusout', { bubbles: true }));
          }
          result.ok = true;
          break;
        }
        case 'contenteditable': {
          undoPush(el);
          el.focus();
          var ok = false;
          try { ok = document.execCommand('selectAll', false, null) && document.execCommand('insertText', false, String(value)); } catch (e) { ok = false; }
          if (!ok) {
            el.textContent = String(value);
            el.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }));
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          result.ok = true;
          break;
        }
        case 'select': {
          var pick = pickOption(el, value);
          if (!pick) {
            result.message = '下拉项无匹配：' + String(value).slice(0, 20);
            return result;
          }
          undoPush(el);
          el.value = pick.opt.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          result.ok = true;
          result.fuzzy = pick.fuzzy;
          break;
        }
        case 'radio': {
          var hit = matchRadio(ctrl, value);
          if (!hit) { result.message = '单选项无匹配：' + String(value).slice(0, 20); return result; }
          undoPush(hit);
          hit.click(); // click 触发完整的 checked + change 事件链
          result.ok = true;
          break;
        }
        case 'checkbox': {
          // 多选组：按文本点选匹配项；单独勾选框（协议/同意）一律不碰
          var hit2 = matchRadio(ctrl, value);
          if (!hit2) { result.message = '勾选项无匹配'; return result; }
          undoPush(hit2);
          if (!hit2.checked) hit2.click();
          result.ok = true;
          break;
        }
        case 'combobox': {
          // antd Select / 组件库组合控件：打开下拉 → 搜索过滤 → 点选/回车提交。
          // 异步流程，先回 ok + async，由 fillCombobox 完成后自行 toast 结果。
          result.ok = true;
          result.async = true;
          fillCombobox(ctrl, value);
          break;
        }
        default:
          result.message = '未知控件类型';
      }
    } catch (e) {
      result.message = '填充异常：' + (e && e.message);
    }
    return result;
  };

  /** 派发 Enter 键事件（组件库日期/下拉控件用它提交已输入的值） */
  function commitEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(function (t) {
      try {
        el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      } catch (e) { /* 老浏览器忽略 */ }
    });
  }

  function commitEscape(el) {
    ['keydown', 'keyup'].forEach(function (t) {
      try {
        el.dispatchEvent(new KeyboardEvent(t, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      } catch (e) { /* noop */ }
    });
  }

  /** 轮询等待：fn 返回真值即成功 resolve(真值)；超时 resolve(null) */
  function waitFor(fn, timeout) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        var v = null;
        try { v = fn(); } catch (e) { /* 下一步 */ }
        if (v) return resolve(v);
        if (Date.now() - t0 > (timeout || 4000)) return resolve(null);
        setTimeout(poll, 160);
      })();
    });
  }

  /** 当前 combobox 输入框对应的下拉选项：优先 aria-controls 精确定位，退回最后一个可见下拉。
   *  覆盖 antd Select（option）与 TreeSelect/Cascader（tree 节点）；虚拟列表只看已渲染的可见项。 */
  function comboboxOptions(el) {
    var listId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    var root = listId ? document.getElementById(listId) : null;
    if (!root) {
      var dds = document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden), [class*="select-dropdown"]:not([class*="dropdown-hidden"])');
      for (var i = dds.length - 1; i >= 0; i--) {
        if (dds[i].getClientRects().length) { root = dds[i]; break; }
      }
    }
    if (!root) return [];
    var nodes = root.querySelectorAll('.ant-select-item-option,[role="option"],.ant-select-tree-treenode,[role="treeitem"]');
    return Array.prototype.filter.call(nodes, function (n) { return n.getClientRects().length > 0; });
  }

  function optionText(o) {
    var t = o.querySelector('.ant-select-tree-title');
    return norm((t ? t.textContent : o.textContent) || '').replace(/[\u2713\u2714]/g, '');
  }

  /** 在可见选项里挑与 want 最匹配的：全等 → 双向包含 → null（由上层决定是否兜底第一项） */
  function pickIn(opts, want) {
    if (!opts.length) return null;
    var texts = opts.map(function (o) { return optionText(o); });
    var i = texts.findIndex(function (t) { return t === want; });
    if (i === -1) i = texts.findIndex(function (t) { return t && t.indexOf(want) !== -1; });
    if (i === -1) i = texts.findIndex(function (t) { return t && want.indexOf(t) !== -1 && t.length >= 2; });
    return i === -1 ? null : { el: opts[i], fuzzy: texts[i] !== want };
  }

  function comboboxSelected(el) {
    var box = el.closest('.ant-select,[class*="select"],[class*="picker"]') || el;
    var items = box.querySelectorAll('.ant-select-selection-item,[class*="selection-item"]');
    if (items.length) return norm(items[items.length - 1].textContent || '');
    return norm(box.textContent || '');
  }

  /**
   * 组合控件（antd Select / TreeSelect 等）异步填充：
   * mousedown 打开 → 等选项加载（字典接口异步）→ 写搜索词过滤 → 点选最匹配项 → 校验。
   * 值以 {value,label} 进 React 状态，无法同步确认，完成后 toast 结果；失败重试一次。
   */
  function fillCombobox(ctrl, value, attempt) {
    attempt = attempt || 0;
    var el = ctrl.el;
    var want = norm(String(value));
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* noop */ }
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    waitFor(function () { return comboboxOptions(el).length ? true : null; }, 5000)
      .then(function () {
        // 选项在 focus 时才异步拉取，等首批到位再写搜索词
        var editable = !el.readOnly;
        if (editable && want) setNativeValue(el, String(value));
        return waitFor(function () { return pickIn(comboboxOptions(el), want); }, 5000);
      })
      .then(function (pick) {
        if (!pick) {
          var rest = comboboxOptions(el);
          pick = rest.length ? { el: rest[0], fuzzy: true } : null;
        }
        if (pick && pick.el) pick.el.click();
        else commitEnter(el); // 没等到选项：回车赌一把搜索直选
        return waitFor(function () {
          var cur = comboboxSelected(el);
          return cur && (cur.indexOf(want) !== -1 || (want.indexOf(cur) !== -1 && cur.length >= 2)) ? cur : null;
        }, 2000);
      })
      .then(function (ok) {
        if (ok) {
          FO.floatball.toast('已填入下拉：' + String(value).slice(0, 24));
        } else if (attempt < 1) {
          commitEscape(el);
          setTimeout(function () { fillCombobox(ctrl, value, attempt + 1); }, 350);
        } else {
          FO.floatball.toast('下拉未能匹配：' + String(value).slice(0, 24) + '，请手动选择');
        }
      })
      .catch(function () { FO.floatball.toast('下拉填充失败'); });
  }

  function matchRadio(ctrl, value) {
    var group = ctrl.radioGroup && ctrl.radioGroup.length ? ctrl.radioGroup : [ctrl.el];
    var want = norm(value);
    var scope = radioGroupValue(ctrl.el) || document;
    var nodes = Array.prototype.slice.call(group);
    function labelOf(input) {
      if (input.id) {
        var l = document.querySelector('label[for="' + input.id + '"]');
        if (l) return norm(l.textContent);
      }
      var wrap = input.closest('label');
      if (wrap) return norm(wrap.textContent);
      var p = input.parentElement;
      if (p) {
        var t = norm(p.textContent);
        if (t && t.length < 30) return t;
      }
      return norm(input.value);
    }
    var hit = nodes.find(function (n) { return norm(n.value) === want; }) ||
      nodes.find(function (n) { return labelOf(n) === want; }) ||
      nodes.find(function (n) { var l = labelOf(n); return l && (l.indexOf(want) !== -1 || want.indexOf(l) !== -1) && l.length >= 1; });
    return hit || null;
  }

  function undoPush(el) {
    var prev;
    if (el.tagName === 'SELECT') prev = el.value;
    else if (el.getAttribute && el.getAttribute('contenteditable') !== null) prev = el.textContent;
    else prev = el.value;
    undoStack.push({ el: el, prev: prev });
    if (undoStack.length > 500) undoStack.shift();
  }

  /** 撤销本次会话内所有填充 */
  FO.filler.clearAll = function () {
    var count = 0;
    undoStack.forEach(function (u) {
      try {
        if (!u.el || !u.el.isConnected) return;
        if (u.el.tagName === 'SELECT') { u.el.value = u.prev; u.el.dispatchEvent(new Event('change', { bubbles: true })); }
        else if (u.el.getAttribute && u.el.getAttribute('contenteditable') !== null) {
          u.el.textContent = u.prev;
          u.el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } else {
          setNativeValue(u.el, u.prev);
        }
        count++;
      } catch (e) { /* 控件已销毁则跳过 */ }
    });
    undoStack = [];
    return count;
  };

  /**
   * 级联行政区划：识别同一容器内的 省/市(/区) 三个 select 并逐级点选。
   * els: {province, city, district} select 元素（可为 null）
   */
  FO.filler.fillRegionCascade = function (els, regionText) {
    var parsed = FO.region.parse(regionText);
    if (!parsed) return { ok: false, message: '无法解析地区：' + regionText };
    var okAll = true, msgs = [];
    if (els.province) {
      var pv = FO.region.bestProvince(parsed.province || regionText) || parsed.province;
      var r1 = FO.filler.fillControl({ el: els.province, kind: 'select', type: 'select', signals: {} }, pv);
      if (!r1.ok) { okAll = false; msgs.push(r1.message); }
    }
    if (els.city && parsed.city) {
      var fillCity = function () {
        // 直辖市：城市下拉放的可能是区县，直接给区县兜底
        var cityVal = parsed.city;
        var r2 = FO.filler.fillControl({ el: els.city, kind: 'select', type: 'select', signals: {} }, cityVal);
        if (!r2.ok && FO.region.isMunicipality(parsed.province) && els.province) {
          var districts = FO.region.childrenOf(parsed.province);
          var d = districts.find(function (x) { return regionText && regionText.indexOf(x) !== -1; });
          if (d) r2 = FO.filler.fillControl({ el: els.city, kind: 'select', type: 'select', signals: {} }, d);
        }
        return r2;
      };
      var r2 = fillCity();
      if (!r2.ok) {
        // 市选项异步加载：等它出现再重试（最多 3 次 × 400ms）
        var tries = 0;
        var timer = setInterval(function () {
          tries++;
          var r = fillCity();
          if (r.ok || tries >= 3) clearInterval(timer);
        }, 400);
        // 首次结果按成功计（省份已落，城市在途）
      }
    }
    if (els.district) {
      // 区县数据目前仅直辖市覆盖：从文本中尽量截取 xx区/xx县 兜底
      var dm = String(regionText).match(/([\u4e00-\u9fa5]{1,6}(?:区|县|市))/);
      if (dm) {
        var r3 = FO.filler.fillControl({ el: els.district, kind: 'select', type: 'select', signals: {} }, dm[1]);
        if (!r3.ok) msgs.push(r3.message);
      }
    }
    return { ok: okAll, message: msgs.join(';') };
  };

  /** 找同一容器内的 省/市/区 下拉（市的选项可能要等省选中后才异步加载，不能因此放弃）。
   *  从父节点向上找第一个含 ≥2 个 select 的边界容器，避免把逐字段包装层（.item 等）当容器。 */
  FO.filler.findRegionCascade = function (el) {
    var box = el.parentElement, selects = [];
    for (var hop = 0; box && hop < 6; hop++) {
      var boundary = /^(FORM|FIELDSET|SECTION|TR|TABLE)$/.test(box.tagName) ||
        (box.matches && box.matches('[class*="cascad"],[class*="region"],[class*="address"]'));
      selects = Array.prototype.slice.call(box.querySelectorAll('select'));
      if (selects.length >= 2) break;
      if (boundary) break;
      box = box.parentElement;
    }
    if (!box || selects.length < 2) return null;
    var province = null, idx = -1;
    for (var i = 0; i < selects.length; i++) {
      var s = selects[i];
      var opts = Array.prototype.slice.call(s.options).map(function (o) { return o.text; }).join(' ');
      var label = norm((s.previousElementSibling && s.previousElementSibling.textContent) || '');
      if (FO.region.provinceNames().some(function (p) { return opts.indexOf(p) !== -1; }) || /省/.test(label)) {
        province = s; idx = i; break;
      }
    }
    if (!province) return null;
    return {
      province: province,
      city: selects[idx + 1] || null,
      district: selects[idx + 2] || null
    };
  };

  FO.filler.fillControlValue = setNativeValue;
})(typeof self !== 'undefined' ? self : globalThis);
