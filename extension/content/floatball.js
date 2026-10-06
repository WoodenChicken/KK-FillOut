/**
 * 「填表小精灵」悬浮球：可拖拽、记忆位置，展开后显示识别字段列表与操作按钮。
 * 全部 UI 在 #fo-ball-host ShadowRoot(closed) 中，Esc 可关闭展开面板。
 * 通过 FO.ballEvents (CustomEvent) 与 content.js 通信：
 *   发出：fo-fill-all / fo-clear-all / fo-open-editor / fo-rescan / fo-toggle
 *   接收：fo-state（{matches, resume, visible}）
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.floatball = FO.floatball || {};

  var host = null, shadow = null;
  var ball = null, panel = null, countChip = null, listEl = null;
  var expanded = false, visible = true;
  var pos = { right: 24, bottom: 96 }; // 用 right/bottom 记忆，避免小屏溢出

  var CSS = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}',
    '.ball{position:fixed;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);',
    'color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:grab;',
    'box-shadow:0 6px 20px rgba(37,99,235,.45);z-index:2147483647;user-select:none;transition:transform .15s, box-shadow .15s;}',
    '.ball:hover{transform:scale(1.06);box-shadow:0 8px 26px rgba(37,99,235,.6);}',
    '.ball:active{cursor:grabbing;}',
    '.ball .ico{font-size:20px;line-height:1;}',
    '.ball .cnt{font-size:10px;line-height:1.4;opacity:.92;}',
    '.panel{position:fixed;width:340px;max-height:70vh;background:#fff;border-radius:14px;overflow:hidden;',
    'box-shadow:0 12px 40px rgba(15,23,42,.22);border:1px solid #e2e8f0;display:flex;flex-direction:column;z-index:2147483647;}',
    '.hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;}',
    '.hd .t{font-size:14px;font-weight:600;}',
    '.hd .sub{font-size:11px;opacity:.85;}',
    '.hd button{background:rgba(255,255,255,.2);border:none;color:#fff;width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:13px;}',
    '.ops{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #f1f5f9;background:#f8fafc;}',
    '.ops button{flex:1;border:none;border-radius:8px;padding:7px 0;font-size:12px;cursor:pointer;font-weight:600;}',
    '.btn-fill{background:#16a34a;color:#fff;} .btn-fill:hover{background:#15803d;}',
    '.btn-clear{background:#e2e8f0;color:#475569;} .btn-clear:hover{background:#cbd5e1;}',
    '.btn-edit{background:#2563eb;color:#fff;} .btn-edit:hover{background:#1d4ed8;}',
    '.list{overflow-y:auto;padding:4px 8px 10px;}',
    '.grp{padding:9px 6px 3px;font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.06em;}',
    '.it{display:flex;align-items:center;gap:6px;padding:6px 6px;border-radius:8px;cursor:pointer;margin:0 2px;}',
    '.it:hover{background:#f1f5f9;}',
    '.it .dot{width:7px;height:7px;border-radius:50%;flex:none;}',
    '.it .lab{font-size:12px;color:#0f172a;font-weight:600;white-space:nowrap;flex:none;}',
    '.it .val{font-size:11px;color:#64748b;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.it .tag{font-size:10px;border-radius:4px;padding:1px 4px;flex:none;}',
    '.tag.auto{background:#dcfce7;color:#15803d;} .tag.confirm{background:#ffedd5;color:#c2410c;} .tag.onpage{background:#dbeafe;color:#1d4ed8;}',
    '.fillbtn{flex:none;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;',
    'border-radius:6px;padding:3px 9px;cursor:pointer;}',
    '.fillbtn:hover{background:#2563eb;color:#fff;border-color:#2563eb;}',
    '.hintbar{margin:2px 4px 8px;padding:7px 10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;',
    'font-size:11px;color:#92400e;line-height:1.6;}',
    '.empty{padding:18px 12px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.8;}',
    '.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:120px;background:rgba(15,23,42,.88);color:#fff;',
    'font-size:13px;padding:8px 16px;border-radius:20px;z-index:2147483647;pointer-events:none;transition:opacity .3s;}'
  ].join('');

  function ensure() {
    if (host && host.isConnected) return true;
    host = document.createElement('div');
    host.id = 'fo-ball-host';
    (document.documentElement || document.body).appendChild(host);
    try { shadow = host.attachShadow({ mode: 'closed' }); } catch (e) { return false; }
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    ball = document.createElement('div');
    ball.className = 'ball';
    ball.innerHTML = '<span class="ico">🧚</span><span class="cnt" id="fo-cnt">0 命中</span>';
    shadow.appendChild(ball);

    panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="hd"><div><div class="t">填表小精灵</div><div class="sub" id="fo-sub">识别到 0 个字段</div></div>' +
      '<button id="fo-close" title="收起 (Esc)">✕</button></div>' +
      '<div class="ops">' +
      '<button class="btn-fill" id="fo-fill">⚡ 一键填充</button>' +
      '<button class="btn-clear" id="fo-clear">↩ 清空</button>' +
      '<button class="btn-edit" id="fo-edit">✎ 编辑简历</button>' +
      '</div><div class="list" id="fo-list"></div>';
    shadow.appendChild(panel);

    bindDrag();
    ball.addEventListener('click', function (e) {
      if (dragMoved) { dragMoved = false; return; }
      toggle();
    });
    panel.querySelector('#fo-close').addEventListener('click', function () { toggle(false); });
    panel.querySelector('#fo-fill').addEventListener('click', function () { emit('fo-fill-all'); });
    panel.querySelector('#fo-clear').addEventListener('click', function () { emit('fo-clear-all'); });
    panel.querySelector('#fo-edit').addEventListener('click', function () { emit('fo-open-editor'); });
    applyPos();
    return true;
  }

  var dragMoved = false;
  function bindDrag() {
    var dragging = false, sx = 0, sy = 0, sp = null;
    ball.addEventListener('pointerdown', function (e) {
      dragging = true; dragMoved = false;
      sx = e.clientX; sy = e.clientY;
      sp = { right: pos.right, bottom: pos.bottom };
      ball.setPointerCapture(e.pointerId);
    });
    ball.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
      pos.right = Math.max(4, sp.right - dx);
      pos.bottom = Math.max(4, sp.bottom - dy);
      applyPos();
    });
    ball.addEventListener('pointerup', function (e) {
      dragging = false;
      try { chrome.storage.local.set({ ballPos: pos }); } catch (err) { /* 测试环境无 chrome */ }
    });
  }

  function applyPos() {
    ball.style.right = pos.right + 'px';
    ball.style.bottom = pos.bottom + 'px';
    panel.style.right = pos.right + 'px';
    var pb = pos.bottom + 60;
    if (pb + panel.offsetHeight > window.innerHeight) pb = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    panel.style.bottom = pb + 'px';
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function toggle(force) {
    expanded = typeof force === 'boolean' ? force : !expanded;
    panel.style.display = expanded ? 'flex' : 'none';
    if (expanded) applyPos();
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    shadow.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 1800);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /** content.js 推送状态进来 */
  FO.floatball.setState = function (state) {
    if (!ensure()) return;
    var matches = state.matches || [];
    var matchMap = state.matchMap || {};
    var resume = state.resume || FO.emptyResume();
    var auto = matches.filter(function (m) { return m.tier === 'auto'; }).length;
    var confirm_ = matches.filter(function (m) { return m.tier === 'confirm'; }).length;
    shadow.querySelector('#fo-cnt').textContent = matches.length ? matches.length + ' 命中' : '无命中';
    panel.querySelector('#fo-sub').textContent = '本页识别 ' + matches.length + ' 项（自动 ' + auto + ' · 待确认 ' + confirm_ + '）';

    var list = panel.querySelector('#fo-list');
    list.textContent = '';
    listRows = 0;

    if (state.resumeEmpty) {
      var bar = document.createElement('div');
      bar.className = 'hintbar';
      bar.textContent = '简历还是空的：先点「✎ 编辑简历」导入简历，再回到本页填写。';
      list.appendChild(bar);
    } else {
      var tip = document.createElement('div');
      tip.className = 'hintbar';
      tip.textContent = '用法：先点击网页上要填的输入框 → 再点字段右侧「填写」';
      list.appendChild(tip);
    }

    function groupHeader(text) {
      var g = document.createElement('div');
      g.className = 'grp';
      g.textContent = text;
      list.appendChild(g);
    }

    function fieldRow(key, segIdx, label) {
      var def = FO.fieldDef(key);
      var hit = (matchMap[key] || []).find(function (x) { return x.segIdx === segIdx; }) || null;
      var row = document.createElement('div');
      row.className = 'it';
      row.title = hit
        ? '本页已识别此字段，点行直接填入；或聚焦任意输入框后点「填写」'
        : '聚焦网页输入框后点「填写」，将该字段填进去';
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = hit ? (hit.tier === 'auto' ? '#16a34a' : hit.tier === 'confirm' ? '#ea580c' : '#94a3b8') : '#cbd5e1';
      var lab = document.createElement('span');
      lab.className = 'lab';
      lab.textContent = label;
      var val = document.createElement('span');
      val.className = 'val';
      val.textContent = FO.valuePreview(resume, key, segIdx);
      row.appendChild(dot);
      row.appendChild(lab);
      row.appendChild(val);
      if (hit) {
        var tag = document.createElement('span');
        tag.className = 'tag ' + (hit.tier === 'confirm' ? 'confirm' : 'onpage');
        tag.textContent = hit.tier === 'confirm' ? '待确认' : '本页';
        row.appendChild(tag);
      }
      var btn = document.createElement('button');
      btn.className = 'fillbtn';
      btn.textContent = '填写';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        emit('fo-manual-fill', { key: key, segIdx: segIdx });
      });
      row.appendChild(btn);
      row.addEventListener('click', function () {
        if (hit) emit('fo-item-click', { matchId: hit.matchId });
        else emit('fo-manual-fill', { key: key, segIdx: segIdx });
      });
      list.appendChild(row);
      listRows++;
    }

    Object.keys(FO.SCHEMA).forEach(function (gKey) {
      var def = FO.SCHEMA[gKey];
      if (def.type === 'object') {
        groupHeader(def.label);
        def.fields.forEach(function (f) { fieldRow(gKey + '.' + f.key, 0, f.label); });
      } else if (def.type === 'array') {
        groupHeader(def.label);
        var segs = Math.max(1, FO.segmentCount(resume, gKey));
        for (var s = 0; s < segs; s++) {
          def.fields.forEach(function (f) {
            fieldRow(gKey + '.' + f.key, s, (def.label.length > 4 ? def.label.slice(0, 2) : def.label) + ' ' + (s + 1) + ' · ' + f.label);
          });
        }
      } else if (def.type === 'skills') {
        groupHeader(def.label);
        var items = Math.max(1, (resume.skills && resume.skills.items ? resume.skills.items.length : 0));
        for (var i = 0; i < items; i++) {
          def.fields.forEach(function (f) { fieldRow('skills.' + f.key, i, '技能 ' + (i + 1) + ' · ' + f.label); });
        }
        (def.extras || []).forEach(function (f) { fieldRow('skills.' + f.key, 0, f.label); });
      } else if (def.type === 'custom') {
        groupHeader(def.label);
        var keys = Object.keys(resume.custom || {});
        if (!keys.length) {
          var empty = document.createElement('div');
          empty.className = 'grp';
          empty.style.paddingTop = '2px';
          empty.textContent = '（暂无，可在编辑简历中添加）';
          list.appendChild(empty);
        }
        keys.forEach(function (k) { fieldRow('custom.' + k, 0, k); });
      }
    });
    applyPos();
  };

  var listRows = 0;

  /** 只读诊断（控制台 / 测试用） */
  FO.floatball.debugInfo = function () {
    return { expanded: expanded, visible: visible, rows: listRows };
  };

  FO.floatball.toast = function (msg) { if (ensure()) toast(msg); };

  FO.floatball.setVisible = function (v) {
    visible = v;
    if (!ensure()) return;
    host.style.display = v ? '' : 'none';
    if (!v) toggle(false);
  };

  FO.floatball.isVisible = function () { return visible; };

  FO.floatball.initPosition = function () {
    try {
      chrome.storage.local.get('ballPos', function (r) {
        if (r && r.ballPos) { pos = r.ballPos; if (host) applyPos(); }
      });
    } catch (e) { /* 测试环境 */ }
  };

  // Esc 关闭展开面板
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && expanded) { toggle(false); e.stopPropagation(); }
  }, true);
})(typeof self !== 'undefined' ? self : globalThis);
