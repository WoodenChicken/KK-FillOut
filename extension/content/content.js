/**
 * 内容脚本总控：装载简历 → 适配器 → 扫描（含 MutationObserver 动态表单）→ 匹配 → 高亮 → 填充。
 * 快捷键 Ctrl+Shift+B / 工具栏点击 / background 命令 三路均可开关悬浮球。
 */
(function () {
  'use strict';
  if (window.__FO_LOADED__) return;
  window.__FO_LOADED__ = true;
  var FO = window.FO;

  var state = {
    resume: FO.emptyResume(),
    settings: FO.DEFAULT_SETTINGS,
    matches: [],
    adapter: FO.adapters.pick(location.href),
    visible: false,
    filledOnce: false,
    lastToggleAt: 0,
    mlRequested: false,
    lastFocused: null // 用户最后聚焦的页面控件（手动填写目标）
  };

  // ---------- 存储装载 ----------
  function loadStorage(cb) {
    try {
      chrome.storage.local.get(['resume', 'settings'], function (r) {
        state.resume = FO.normalizeResume(r && r.resume);
        state.settings = Object.assign({}, FO.DEFAULT_SETTINGS, (r && r.settings) || {});
        cb();
      });
    } catch (e) {
      // 测试环境（无 chrome API）：window.__FO_TEST_DATA__ 兜底
      var t = window.__FO_TEST_DATA__ || {};
      state.resume = FO.normalizeResume(t.resume);
      state.settings = Object.assign({}, FO.DEFAULT_SETTINGS, t.settings || {});
      cb();
    }
  }

  function saveSettings() {
    try { chrome.storage.local.set({ settings: state.settings }); } catch (e) { /* noop */ }
  }

  // ---------- ML 模型懒加载（可选；models/model.json 不存在则纯规则） ----------
  function ensureModel(done) {
    if (!state.settings.mlEnabled || state.mlRequested) { done(); return; }
    state.mlRequested = true;
    fetchModelThenPredict(function (ok) { if (!ok) FO.ml = null; done(); });
  }

  function fetchModelThenPredict(cb) {
    var url = '';
    try { url = chrome.runtime.getURL('models/model.json'); } catch (e) { cb(false); return; }
    // 只 HEAD 探测是否存在，避免每次页面加载都拉 404
    fetch(url, { method: 'HEAD' }).then(function (resp) {
      if (!resp.ok) { cb(false); return; }
      // 动态注入 TFJS + 推理桥（均来自扩展包，离线可用）
      try {
        chrome.runtime.sendMessage({ type: 'FO_INJECT_ML' }, function (resp2) {
          if (resp2 && resp2.ok && FO.ml) {
            FO.ml.init(url).then(function () { cb(true); }).catch(function () { cb(false); });
          } else cb(false);
        });
      } catch (e) { cb(false); }
    }).catch(function () { cb(false); });
  }

  // ---------- 扫描 + 匹配 ----------
  var scanning = false, rescanTimer = null;

  function scheduleRescan(delay) {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, delay || 600);
  }

  function scan() {
    if (scanning) { scheduleRescan(400); return; }
    scanning = true;
    var adapter = state.adapter;
    try { if (adapter && adapter.expandAddButtons) adapter.expandAddButtons(); } catch (e) { /* noop */ }

    var controls = FO.scanner.scan(document);
    // 适配器强映射
    if (adapter && adapter.resolveKey) {
      controls.forEach(function (c) { c.adapterKey = adapter.resolveKey(c) || ''; });
    } else {
      controls.forEach(function (c) { c.adapterKey = ''; });
    }

    ensureModel(function () {
      var predictions = [];
      if (FO.ml && FO.ml.ready) {
        // 推理逐控件进行（模型极小，首屏 <200ms）
        var pending = controls.length;
        var idx = 0;
        (function next() {
          while (idx < controls.length) {
            var i = idx++;
            try {
              var p = FO.ml.predictSync(controls[i].signals);
              predictions[i] = p;
            } catch (e) { predictions[i] = null; }
          }
          finish();
        })();
      } else {
        finish();
      }
      function finish() {
        state.matches = FO.matcher.matchAll(controls, state.resume, state.settings, predictions);
        state.matches.forEach(function (m) { m._resume = state.resume; });
        render();
        scanning = false;
      }
    });
  }

  function render() {
    if (!state.visible) return;
    var shown = state.matches;
    FO.highlight.clear();
    // 角标默认关闭（面板手动填写为主）；用户可在设置里重新开启
    if (state.settings.highlight && shown.length) {
      FO.highlight.render(shown, onBadgeAction);
    }
    var matchMap = {};
    shown.forEach(function (m) {
      (matchMap[m.key] = matchMap[m.key] || []).push({ segIdx: m.segmentIdx, matchId: m.id, tier: m.tier });
    });
    FO.floatball.setState({
      matches: shown,
      matchMap: matchMap,
      resume: state.resume,
      resumeEmpty: FO.isResumeEmpty(state.resume)
    });
  }

  // ---------- 填充 ----------
  function valueFor(m) {
    var adapter = state.adapter;
    var v = FO.getResumeValue(state.resume, m.key, m.segmentIdx);
    if (!v) return '';
    if (adapter && adapter.transformValue) {
      v = adapter.transformValue(m.key, v, m.ctrl.signals.labelText + ' ' + m.ctrl.signals.name + ' ' + m.ctrl.signals.id);
    }
    return v;
  }

  function fillMatch(m, forcedValue, segIdx) {
    var v = forcedValue != null ? forcedValue : valueFor(m);
    if (!v) return { ok: false, message: '简历中无值' };
    var adapter = state.adapter;
    if (adapter && adapter.fillField) {
      var custom = adapter.fillField(m.ctrl, v, m.key);
      if (custom) return custom;
    }
    // 级联行政区划：籍贯/现居地/期望城市 + 同容器双下拉
    if (/^(basicInfo\.(nativePlace|currentCity|expectedCity))$/.test(m.key) && m.ctrl.kind === 'select') {
      var cas = FO.filler.findRegionCascade(m.ctrl.el);
      if (cas) return FO.filler.fillRegionCascade(cas, v);
    }
    return FO.filler.fillControl(m.ctrl, v, { key: m.key });
  }

  function fillAll() {
    if (!state.matches.length) { FO.floatball.toast('本页没有识别到可填字段'); return; }
    var okN = 0, fuzzyN = 0, confirmN = 0, missN = 0;
    var fuzzyMsg = [];
    state.matches.forEach(function (m) {
      if (m.tier === 'auto') {
        var r = fillMatch(m);
        if (r && r.ok) { okN++; if (r.fuzzy) { fuzzyN++; fuzzyMsg.push((FO.fieldDef(m.key) || {}).label || m.key); } }
        else missN++;
      } else if (m.tier === 'confirm') confirmN++;
    });
    state.filledOnce = true;
    var msg = '已填充 ' + okN + ' 项' + (confirmN ? '，' + confirmN + ' 项待确认（点橙色角标）' : '') + (missN ? '，' + missN + ' 项缺值' : '');
    if (fuzzyN) msg += '；' + fuzzyN + ' 项为接近匹配：' + fuzzyMsg.slice(0, 2).join('、');
    FO.floatball.toast(msg);
  }

  function onBadgeAction(m, forcedValue, segIdx) {
    if (m.tier === 'skip' && forcedValue == null) return;
    var r = fillMatch(m, forcedValue, segIdx);
    if (r && r.ok) {
      // 用户确认/修正即产生一条训练样本（本地，不上传）
      logSample(m);
      if (m.tier === 'confirm') { m.tier = 'auto'; m.score = Math.max(m.score, 0.9); render(); }
      FO.floatball.toast('已填入：' + ((FO.fieldDef(m.key) || {}).label || m.key));
    } else {
      FO.floatball.toast((r && r.message) || '填入失败');
    }
  }

  function logSample(m) {
    try {
      chrome.runtime.sendMessage({
        type: 'FO_LOG_SAMPLE',
        sample: {
          signals: m.ctrl.signals,
          label: m.key,
          score: m.score,
          url: location.origin,
          ts: Date.now()
        }
      }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* 测试环境 */ }
  }

  // ---------- 悬浮球事件总线 ----------
  document.addEventListener('fo-fill-all', function () { fillAll(); });
  document.addEventListener('fo-clear-all', function () {
    var n = FO.filler.clearAll();
    FO.floatball.toast(n ? '已还原 ' + n + ' 个字段' : '没有可还原的字段');
  });
  document.addEventListener('fo-open-editor', function () {
    try {
      chrome.runtime.sendMessage({ type: 'FO_OPEN_PANEL' }, function (resp) {
        void chrome.runtime.lastError;
        if (!resp || !resp.ok) {
          // sidePanel 打不开（旧版浏览器）→ 新标签页兜底
          try { chrome.runtime.sendMessage({ type: 'FO_OPEN_TAB' }, function () { void chrome.runtime.lastError; }); } catch (e) { /* noop */ }
        }
      });
    } catch (e) { /* 测试环境 */ }
  });
  document.addEventListener('fo-rescan', function () { scan(); });
  document.addEventListener('fo-item-click', function (e) {
    var id = e.detail && e.detail.matchId;
    var m = state.matches.find(function (x) { return x.id === id; });
    if (!m) return;
    if (m.tier === 'confirm' || m.tier === 'skip') {
      var v = FO.getResumeValue(state.resume, m.key, m.segmentIdx);
      if (v) onBadgeAction(m, v);
      else FO.floatball.toast('简历中缺少：' + ((FO.fieldDef(m.key) || {}).label || m.key));
    } else {
      onBadgeAction(m);
    }
  });

  // ---------- 手动填写：面板每行「填写」按钮 → 填入当前聚焦的页面输入框 ----------
  // 追踪用户最后聚焦的控件：focusin（真实点击）+ mousedown（预点击）双路径，
  // 兜底在填充时读 document.activeElement（部分环境 programmatic focus 不派发 focus 事件）。
  function trackFocusTarget(el) {
    var ctrl = FO.scanner.describe(el);
    if (ctrl) state.lastFocused = ctrl;
  }
  document.addEventListener('focusin', function (e) { trackFocusTarget(e.target); }, true);
  document.addEventListener('mousedown', function (e) {
    if (e.target && e.target.nodeType === 1 && e.target.tagName === 'INPUT') trackFocusTarget(e.target);
  }, true);

  document.addEventListener('fo-manual-fill', function (e) {
    var d = e.detail || {};
    var key = d.key;
    var def = FO.fieldDef(key);
    if (!def) return;
    var segIdx = d.segIdx || 0;
    var target = (state.lastFocused && state.lastFocused.el && state.lastFocused.el.isConnected) ? state.lastFocused : null;
    if (!target) {
      var ae = document.activeElement;
      if (ae && ae !== document.body && ae.id !== 'fo-ball-host') target = FO.scanner.describe(ae);
    }
    if (!target) {
      FO.floatball.toast('请先点击网页上要填写的输入框，再点「填写」');
      return;
    }
    var v = FO.getResumeValue(state.resume, key, segIdx);
    if (!v) {
      FO.floatball.toast('简历里还没有「' + def.label + '」，先去编辑简历补充');
      return;
    }
    var adapter = state.adapter;
    if (adapter && adapter.transformValue) {
      v = adapter.transformValue(key, v, [target.signals.labelText, target.signals.name, target.signals.id].join(' '));
    }
    // 目标是级联中的省/市下拉时，尝试整组级联填充
    if (/^(basicInfo\.(nativePlace|currentCity|expectedCity))$/.test(key) && target.kind === 'select') {
      var cas = FO.filler.findRegionCascade(target.el);
      if (cas) {
        var cr = FO.filler.fillRegionCascade(cas, v);
        if (cr.ok) { FO.floatball.toast('已级联填入：' + def.label); return; }
      }
    }
    var r = FO.filler.fillControl(target, v, { key: key });
    if (r && r.ok) {
      // 目标恰好是本页识别过的控件 → 记一条训练样本
      var m = state.matches.find(function (x) { return x.ctrl && x.ctrl.el === target.el; });
      if (m) logSample(m);
      FO.floatball.toast('已填入：' + def.label + (segIdx ? '（第' + (segIdx + 1) + '条）' : '') + (r.fuzzy ? '（接近匹配，请核对）' : ''));
    } else {
      FO.floatball.toast((r && r.message) || '填入失败');
    }
  });

  // ---------- 开关 ----------
  function toggleBall() {
    var now = Date.now();
    if (now - state.lastToggleAt < 300) return; // 命令消息 + 键盘事件 双路径去抖
    state.lastToggleAt = now;
    state.visible = !state.visible;
    FO.floatball.setVisible(state.visible);
    if (state.visible) {
      FO.floatball.initPosition();
      scan();
    } else {
      FO.highlight.clear();
    }
  }

  document.addEventListener('fo-toggle', toggleBall);

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'KeyB' || e.key === 'B' || e.key === 'b')) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);
      if (typing) return;
      e.preventDefault();
      toggleBall();
    }
  }, true);

  // background：chrome.commands / 工具栏点击 / URL 变化
  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg) return;
      if (msg.type === 'FO_TOGGLE_BALL') toggleBall();
      else if (msg.type === 'FO_URL_CHANGED') scheduleRescan(500);
      else if (msg.type === 'FO_MENU_FILL') {
        if (!state.visible) { state.visible = true; FO.floatball.setVisible(true); FO.floatball.initPosition(); }
        setTimeout(fillAll, 200);
      }
    });
  } catch (e) { /* 测试环境 */ }

  // ---------- 动态表单监听 ----------
  var mo = null;
  function startObserver() {
    if (mo || !document.documentElement) return;
    mo = new MutationObserver(function (muts) {
      // 忽略自家 UI 的 DOM 变化
      var relevant = muts.some(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) {
          var n = m.addedNodes[i];
          if (n.nodeType === 1 && n.id !== 'fo-ball-host' && n.id !== 'fo-badge-host') return true;
          if (n.nodeType === 1 && n.querySelector && n.querySelector('input,select,textarea,[contenteditable="true"]')) return true;
        }
        return false;
      });
      if (relevant) scheduleRescan(700);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- 启动 ----------
  function boot() {
    loadStorage(function () {
      startObserver();
      // 默认不自动展开悬浮球（不遮挡站点）；首次按 Ctrl+Shift+B 唤起
      FO.floatball.initPosition();
      // 预扫描一次，按 B 时秒出结果
      scan();
      // 只读诊断口（控制台：__FO_DEBUG__.getState()）
      try {
        window.__FO_DEBUG__ = {
          getState: function () {
            return {
              visible: state.visible,
              scanning: scanning,
              matchCount: state.matches.length,
              topKeys: state.matches.slice(0, 10).map(function (m) { return m.key + '@' + m.score; }),
              settings: JSON.parse(JSON.stringify(state.settings)),
              resumeEmpty: FO.isResumeEmpty(state.resume),
              adapter: state.adapter ? state.adapter.id : 'generic'
            };
          }
        };
      } catch (e) { /* noop */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
