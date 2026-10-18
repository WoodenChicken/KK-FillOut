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
  var collapsedGroups = {}; // 分组折叠状态，跨 setState 重渲染保留
  var pos = { right: 24, bottom: 96 }; // 用 right/bottom 记忆，避免小屏溢出

  var CSS = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}',
    '.ball{position:fixed;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);',
    'color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:grab;',
    'box-shadow:0 6px 20px rgba(37,99,235,.45);z-index:2147483647;user-select:none;transition:transform .15s, box-shadow .15s;}',
    '.ball:hover{transform:scale(1.06);box-shadow:0 8px 26px rgba(37,99,235,.6);}',
    '.ball:active{cursor:grabbing;}',
    '.ball .ico{display:block;width:40px;height:40px;line-height:0;}',
    '.ball .ico img{display:block;width:100%;height:100%;}',
    '.ball .cnt{font-size:10px;line-height:1.4;opacity:.95;font-weight:600;}',
    '.panel{position:fixed;width:420px;max-height:72vh;background:#fff;border-radius:16px;overflow:hidden;',
    'box-shadow:0 12px 40px rgba(15,23,42,.22);border:1px solid #e2e8f0;display:flex;flex-direction:column;z-index:2147483647;}',
    '.hd{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;}',
    '.hd .lft{display:flex;align-items:center;gap:9px;}',
    '.hd .logo{width:26px;height:26px;flex:none;border-radius:6px;overflow:hidden;}',
    '.hd .logo img{display:block;width:100%;height:100%;}',
    '.hd .t{font-size:14px;font-weight:700;}',
    '.hd .sub{font-size:11px;opacity:.88;margin-top:1px;}',
    '.hd button{background:rgba(255,255,255,.2);border:none;color:#fff;width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:13px;}',
    '.ops{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;border-bottom:1px solid #f1f5f9;background:#f8fafc;}',
    '.ops button{border:none;border-radius:9px;padding:8px 0;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap;transition:filter .15s, transform .1s;}',
    '.ops button:hover{filter:brightness(1.05);}',
    '.ops button:active{transform:translateY(1px);}',
    '.ops .btn-fill{grid-column:1/-1;padding:11px 0;font-size:14px;box-shadow:0 4px 12px rgba(22,163,74,.35);}',
    '.btn-fill{background:#16a34a;color:#fff;} .btn-fill:hover{background:#15803d;}',
    '.btn-clear{background:#e2e8f0;color:#475569;} .btn-clear:hover{background:#cbd5e1;}',
    '.btn-edit{background:#2563eb;color:#fff;} .btn-edit:hover{background:#1d4ed8;}',
    '.btn-ocr{background:#7c3aed;color:#fff;} .btn-ocr:hover{background:#6d28d9;} .btn-ocr:disabled{opacity:.6;cursor:wait;}',
    '.btn-dump{background:#0891b2;color:#fff;} .btn-dump:hover{background:#0e7490;}',
    '.list{overflow-y:auto;padding:4px 8px 10px;}',
    '.dump-mask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;}',
    '.dump-box{width:min(900px,92vw);max-height:86vh;background:#fff;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);}',
    '.dump-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;}',
    '.dump-hd .t{font-size:15px;font-weight:700;}',
    '.dump-hd .sub{font-size:11px;opacity:.85;margin-top:2px;}',
    '.dump-hd .acts{display:flex;gap:8px;}',
    '.dump-hd button{border:none;border-radius:7px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600;}',
    '.dump-hd .copy{background:#fff;color:#0e7490;} .dump-hd .copy:hover{background:#f1f5f9;}',
    '.dump-hd .close{background:rgba(255,255,255,.25);color:#fff;} .dump-hd .close:hover{background:rgba(255,255,255,.4);}',
    '.dump-body{padding:12px 16px;overflow:auto;}',
    '.dump-summary{font-size:12px;color:#475569;margin-bottom:10px;line-height:1.7;}',
    '.dump-pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:10px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;max-height:55vh;overflow:auto;font-family:"Cascadia Code",Consolas,"Microsoft YaHei",monospace;}',
    '.dump-empty{padding:30px;text-align:center;color:#94a3b8;font-size:13px;}',
    '.grp{padding:12px 10px 6px;font-size:11px;color:#64748b;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}',
    '.grp-sec{margin:2px 0;}',
    '.grp-hd{display:flex;align-items:center;gap:6px;padding:10px 12px 6px;cursor:pointer;font-size:11px;color:#475569;font-weight:700;letter-spacing:.06em;text-transform:uppercase;user-select:none;border-radius:8px;}',
    '.grp-hd:hover{background:#f1f5f9;}',
    '.grp-hd .chev{font-size:10px;color:#94a3b8;transition:transform .18s;display:inline-block;width:12px;}',
    '.grp-hd .chev.collapsed{transform:rotate(-90deg);}',
    '.grp-hd .grp-lab{flex:1;}',
    '.grp-body{padding-bottom:2px;}',
    '.it{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;cursor:pointer;margin:2px 4px;border:1px solid #eef2f7;background:#fff;transition:background .12s,border-color .12s;}',
    '.it:hover{background:#f1f5f9;border-color:#dbeafe;}',
    '.it .dot{width:8px;height:8px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(148,163,184,.25);}',
    '.it .lab{font-size:13px;color:#0f172a;font-weight:700;white-space:nowrap;flex:none;}',
    '.it .val{font-size:12px;color:#1e293b;font-weight:500;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.it .tag{font-size:10px;border-radius:5px;padding:2px 6px;flex:none;font-weight:600;}',
    '.tag.auto{background:#dcfce7;color:#15803d;} .tag.confirm{background:#ffedd5;color:#c2410c;} .tag.onpage{background:#dbeafe;color:#1d4ed8;} .tag.ocr{background:#ede9fe;color:#7c3aed;}',
    '.fillbtn{flex:none;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:12px;font-weight:700;',
    'border-radius:7px;padding:5px 12px;cursor:pointer;transition:background .12s;}',
    '.fillbtn:hover{background:#1d4ed8;border-color:#1d4ed8;}',
    '.hintbar{margin:2px 4px 8px;padding:7px 10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;',
    'font-size:11px;color:#92400e;line-height:1.6;}',
    '.empty{padding:18px 12px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.8;}',
    '.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:120px;background:rgba(15,23,42,.88);color:#fff;',
    'font-size:13px;padding:8px 16px;border-radius:20px;z-index:2147483647;pointer-events:none;transition:opacity .3s;}'
  ].join('');

  /** 取扩展内部 logo 图标的 URL；测试环境无 chrome.runtime 时回退到相对路径 */
  function logoUrl(size) {
    try {
      if (chrome && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL('icons/icon' + size + '.png');
    } catch (e) {}
    return '../extension/icons/icon' + size + '.png';
  }

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
    ball.innerHTML =
      '<span class="ico"><img src="' + logoUrl(48) + '" alt="填表小精灵" draggable="false"/></span>' +
      '<span class="cnt" id="fo-cnt">0 命中</span>';
    shadow.appendChild(ball);

    panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="hd"><div class="lft">' +
      '<span class="logo"><img src="' + logoUrl(48) + '" alt="" draggable="false"/></span>' +
      '<div><div class="t">KK-FillOut智能网申助手</div><div class="sub" id="fo-sub">识别到 0 个字段</div></div></div>' +
      '<button id="fo-close" title="收起 (Esc)">✕</button></div>' +
      '<div class="ops">' +
      '<button class="btn-fill" id="fo-fill">⚡ 一键填充</button>' +
      '<button class="btn-clear" id="fo-clear">↩ 清空</button>' +
      '<button class="btn-edit" id="fo-edit">✎ 编辑简历</button>' +
      '<button class="btn-ocr" id="fo-ocr" title="DOM 识别不到时：截图 + 本地 OCR，按位置把标签关联到控件">👁 视觉识别</button>' +
      '<button class="btn-dump" id="fo-dump" title="收集本页所有表单控件的结构信息，方便排查识别问题">🔍 收集表单</button>' +
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
    panel.querySelector('#fo-ocr').addEventListener('click', function () { emit('fo-ocr-scan'); });
    panel.querySelector('#fo-dump').addEventListener('click', function () { openDumpDialog(); });
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
    var pb = pos.bottom + 72; // 球直径 64 + 间距 8
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

  /** 展开/收起面板（供 content.js 在 OCR 完成后自动展开结果） */
  FO.floatball.expand = function (v) {
    if (!ensure()) return;
    toggle(!!v);
  };

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
    var total = state.totalControls || 0;
    var pct = total ? Math.round(matches.length / total * 100) : 0;
    // 悬浮球上的角标：显示命中率百分比（无字段时显示「无命中」）
    shadow.querySelector('#fo-cnt').textContent = total ? (pct + '% 命中') : (matches.length ? matches.length + ' 命中' : '无命中');
    // 副标题：网页字段总数 / 命中数 / 命中率 / 自动与待确认分布
    var sub = total
      ? ('本页 ' + total + ' 个字段，命中 ' + matches.length + ' 个（' + pct + '%）· 自动 ' + auto + ' · 待确认 ' + confirm_)
      : ('本页识别 ' + matches.length + ' 项（自动 ' + auto + ' · 待确认 ' + confirm_ + '）');
    panel.querySelector('#fo-sub').textContent = sub;

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

    // 折叠状态跨 setState 重渲染保留（按分组 key 记忆）
    function groupHeader(text, gKey) {
      var sec = document.createElement('div');
      sec.className = 'grp-sec';
      var collapsed = !!collapsedGroups[gKey];
      var hd = document.createElement('div');
      hd.className = 'grp-hd';
      var chev = document.createElement('span');
      chev.className = 'chev' + (collapsed ? ' collapsed' : '');
      chev.textContent = '▼';
      var lab = document.createElement('span');
      lab.className = 'grp-lab';
      lab.textContent = text;
      hd.appendChild(chev);
      hd.appendChild(lab);
      var body = document.createElement('div');
      body.className = 'grp-body';
      if (collapsed) body.style.display = 'none';
      hd.addEventListener('click', function () {
        collapsed = !collapsed;
        collapsedGroups[gKey] = collapsed;
        chev.classList.toggle('collapsed', collapsed);
        body.style.display = collapsed ? 'none' : '';
      });
      sec.appendChild(hd);
      sec.appendChild(body);
      list.appendChild(sec);
      return body;
    }

    function fieldRow(body, key, segIdx, label) {
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
        // 视觉识别（OCR）命中的字段额外加一个紫色「视觉」标签
        if (hit.fromOcr) {
          var ocrTag = document.createElement('span');
          ocrTag.className = 'tag ocr';
          ocrTag.textContent = '视觉';
          ocrTag.title = '该字段由视觉识别（截图 OCR）关联到标签';
          row.appendChild(ocrTag);
        }
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
      body.appendChild(row);
      listRows++;
    }

    Object.keys(FO.SCHEMA).forEach(function (gKey) {
      var def = FO.SCHEMA[gKey];
      if (def.type === 'object') {
        var body = groupHeader(def.label, gKey);
        def.fields.forEach(function (f) { fieldRow(body, gKey + '.' + f.key, 0, f.label); });
        FO.customKeysOf(resume, gKey).forEach(function (ck) { fieldRow(body, gKey + '.' + ck, 0, ck); });
      } else if (def.type === 'array') {
        var abody = groupHeader(def.label, gKey);
        var segs = Math.max(1, FO.segmentCount(resume, gKey));
        var ckeys = FO.customKeysOf(resume, gKey);
        for (var s = 0; s < segs; s++) {
          def.fields.forEach(function (f) {
            fieldRow(abody, gKey + '.' + f.key, s, (def.label.length > 4 ? def.label.slice(0, 2) : def.label) + ' ' + (s + 1) + ' · ' + f.label);
          });
          ckeys.forEach(function (ck) {
            fieldRow(abody, gKey + '.' + ck, s, (def.label.length > 4 ? def.label.slice(0, 2) : def.label) + ' ' + (s + 1) + ' · ' + ck);
          });
        }
      } else if (def.type === 'skills') {
        var sbody = groupHeader(def.label, gKey);
        var items = Math.max(1, (resume.skills && resume.skills.items ? resume.skills.items.length : 0));
        var sckeys = FO.customKeysOf(resume, gKey);
        for (var i = 0; i < items; i++) {
          def.fields.forEach(function (f) { fieldRow(sbody, 'skills.' + f.key, i, '技能 ' + (i + 1) + ' · ' + f.label); });
          sckeys.forEach(function (ck) { fieldRow(sbody, 'skills.' + ck, i, '技能 ' + (i + 1) + ' · ' + ck); });
        }
        (def.extras || []).forEach(function (f) { fieldRow(sbody, 'skills.' + f.key, 0, f.label); });
      } else if (def.type === 'custom') {
        var cbody = groupHeader(def.label, gKey);
        var keys = Object.keys(resume.custom || {});
        if (!keys.length) {
          var empty = document.createElement('div');
          empty.className = 'grp';
          empty.style.paddingTop = '2px';
          empty.style.borderBottom = 'none';
          empty.textContent = '（暂无，可在编辑简历中添加）';
          cbody.appendChild(empty);
        }
        keys.forEach(function (k) { fieldRow(cbody, 'custom.' + k, 0, k); });
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

  /** 视觉识别进行中：禁用按钮 + 显示加载状态文字，防止重复触发 */
  FO.floatball.setOcrBusy = function (busy) {
    if (!ensure()) return;
    var btn = panel.querySelector('#fo-ocr');
    if (!btn) return;
    if (busy) {
      if (!btn._origHTML) btn._origHTML = btn.innerHTML;
      btn.innerHTML = '⏳ 识别中…';
      btn.disabled = true;
      btn.title = '正在截图并本地 OCR 识别，请稍候…';
    } else {
      if (btn._origHTML) { btn.innerHTML = btn._origHTML; btn._origHTML = null; }
      btn.disabled = false;
      btn.title = 'DOM 识别不到时：截图 + 本地 OCR，按位置把标签关联到控件';
    }
  };

  /** 收集本页所有表单控件的诊断信息，弹出对话框展示并可复制 */
  function openDumpDialog() {
    if (!ensure()) return;
    var info = collectFormInfo();
    var mask = document.createElement('div');
    mask.className = 'dump-mask';
    mask.innerHTML =
      '<div class="dump-box">' +
      '<div class="dump-hd">' +
      '<div><div class="t">🔍 表单结构诊断</div><div class="sub" id="fo-dump-sub">收集到 ' + info.total + ' 个控件</div></div>' +
      '<div class="acts">' +
      '<button class="copy" id="fo-dump-copy">📋 复制 JSON</button>' +
      '<button class="close" id="fo-dump-close">关闭</button>' +
      '</div></div>' +
      '<div class="dump-body">' +
      '<div class="dump-summary">' +
      '将下方 JSON 发给开发者，可精准定位「性别/民族等字段识别不了」的原因。' +
      '包含控件的 tag、type、name、id、placeholder、附近标签文本、选项文本及 HTML 片段。' +
      '</div>' +
      '<pre class="dump-pre" id="fo-dump-pre"></pre>' +
      '</div></div>';
    shadow.appendChild(mask);
    var pre = mask.querySelector('#fo-dump-pre');
    pre.textContent = info.json;
    mask.querySelector('#fo-dump-close').addEventListener('click', function () { mask.remove(); });
    mask.querySelector('#fo-dump-copy').addEventListener('click', function () {
      var txt = info.json;
      try {
        navigator.clipboard.writeText(txt).then(function () {
          toast('已复制到剪贴板');
        }, function () {
          fallbackCopy(txt);
        });
      } catch (e) {
        fallbackCopy(txt);
      }
    });
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
  }

  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    shadow.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e) { toast('复制失败，请手动选择'); }
    ta.remove();
  }

  /** 扫描页面所有表单控件，提取诊断信息 */
  function collectFormInfo() {
    var SELECTOR = [
      'select', 'textarea',
      'input[type="text"]', 'input[type="tel"]', 'input[type="email"]', 'input[type="number"]',
      'input[type="date"]', 'input[type="month"]', 'input[type="radio"]', 'input[type="checkbox"]',
      'input:not([type])', 'input[type="search"][role="combobox"]',
      '[contenteditable="true"]', '[contenteditable=""]'
    ].join(',');
    var nodes = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
    var out = [];
    nodes.forEach(function (el) {
      if (el.id === 'fo-ball-host' || el.id === 'fo-badge-host') return;
      // 跳过隐藏/禁用
      try {
        var s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return;
      } catch (e) {}
      if (el.disabled) return;
      var type = (el.getAttribute('type') || (el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'))).toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password'].indexOf(type) !== -1) return;
      // 提取附近标签文本（排除 input 自身 value，找真正的字段标签）
      var labelTxt = '';
      var inputVal = (el.value || '').trim();
      var box = el.closest('[class*="form-item"],[class*="form_group"],[class*="field"],[class*="item"],tr,[class*="row"],[class*="cell"],[class*="group"]');
      if (box) {
        // 1) 优先找 label 元素或带 label 类的标签（排除值显示元素）
        var labelEl = box.querySelector('label,[class*="label"]:not([class*="__labelText"])');
        if (labelEl && !labelEl.contains(el)) {
          var lt = (labelEl.textContent || '').replace(/\s+/g, ' ').trim();
          if (lt && lt !== inputVal) labelTxt = lt.slice(0, 60);
        }
        // 2) 找 input 前面的文本节点/元素
        if (!labelTxt) {
          var prev = el.previousElementSibling;
          var hops = 0;
          while (prev && hops < 4) {
            var t = (prev.textContent || '').replace(/\s+/g, ' ').trim();
            if (t && t.length < 30 && t !== inputVal && !prev.querySelector('input,select,textarea,button')) {
              labelTxt = t; break;
            }
            prev = prev.previousElementSibling;
            hops++;
          }
        }
        // 3) 向上找父级兄弟的标签
        if (!labelTxt) {
          var p = el.parentElement;
          for (var h = 0; h < 5 && p && p !== box; h++) {
            var ps = p.previousElementSibling;
            if (ps) {
              var pt = (ps.textContent || '').replace(/\s+/g, ' ').trim();
              if (pt && pt.length < 30 && pt !== inputVal && !ps.querySelector('input,select,textarea')) { labelTxt = pt; break; }
            }
            p = p.parentElement;
          }
        }
        // 4) 兜底：整个容器文本去掉 input value
        if (!labelTxt) {
          var full = (box.textContent || '').replace(/\s+/g, ' ').trim();
          if (inputVal) full = full.split(inputVal).join('').trim();
          labelTxt = full.slice(0, 100);
        }
      } else if (el.parentElement) {
        labelTxt = (el.parentElement.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      }
      // 选项文本（select）
      var optTxt = '';
      if (el.tagName === 'SELECT' && el.options) {
        var arr = [];
        for (var i = 0; i < Math.min(el.options.length, 20); i++) {
          arr.push((el.options[i].text || '').trim());
        }
        optTxt = arr.join(' | ');
        if (el.options.length > 20) optTxt += ' ...(共' + el.options.length + '项)';
      }
      // radio 组 value
      var radioVals = '';
      if (type === 'radio' || type === 'checkbox') {
        var name = el.getAttribute('name') || '';
        var group = name ? document.querySelectorAll('input[type="' + type + '"][name="' + name.replace(/"/g, '\\"') + '"]') : [el];
        var vals = [];
        Array.prototype.forEach.call(group, function (g) {
          vals.push(g.value + '|' + (g.parentElement ? (g.parentElement.textContent || '').trim().slice(0, 20) : ''));
        });
        radioVals = vals.join(' ; ');
      }
      out.push({
        tag: el.tagName.toLowerCase(),
        type: type,
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        nearbyLabel: labelTxt,
        options: optTxt,
        radioGroup: radioVals,
        html: el.outerHTML.slice(0, 300)
      });
    });
    var data = { url: location.href, total: out.length, controls: out };
    return { total: out.length, json: JSON.stringify(data, null, 2) };
  }

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
