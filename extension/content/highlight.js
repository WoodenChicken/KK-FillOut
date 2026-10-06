/**
 * 命中高亮层：给命中控件画描边 + 编号角标，编号与悬浮球列表一一对应。
 * 全部渲染在 #fo-badge-host 的 ShadowRoot 里，固定定位 + rAF 跟随滚动。
 * 角标颜色：绿=自动填充 / 橙=待确认 / 灰=未识别。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.highlight = FO.highlight || {};

  var TIER_COLOR = { auto: '#16a34a', confirm: '#ea580c', skip: '#94a3b8' };
  var TIER_TEXT = { auto: '自动', confirm: '待确认', skip: '未识别' };

  var host = null, shadow = null, badgeLayer = null, popover = null;
  var items = []; // { matchId, el, num, tier, labelEl, badgeEl }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'fo-badge-host';
    host.style.cssText = 'all:initial; position:fixed; inset:0; pointer-events:none; z-index:2147483646;';
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = [
      '.fo-badge{position:fixed;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:2px;',
      'height:18px;padding:0 5px;border-radius:9px;color:#fff;font:600 11px/18px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
      'box-shadow:0 1px 4px rgba(0,0,0,.35);user-select:none;white-space:nowrap;transition:transform .1s;}',
      '.fo-badge:hover{transform:scale(1.08);z-index:2;}',
      '.fo-badge .fo-num{font-size:12px;}',
      '.fo-pop{position:fixed;pointer-events:auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;',
      'box-shadow:0 8px 30px rgba(15,23,42,.18);padding:8px;min-width:200px;max-width:300px;',
      'font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a;}',
      '.fo-pop .fo-pop-title{font-weight:600;margin-bottom:6px;color:#334155;}',
      '.fo-pop .fo-cand{display:block;width:100%;text-align:left;border:1px solid #e2e8f0;background:#f8fafc;',
      'border-radius:8px;padding:6px 8px;margin:4px 0;cursor:pointer;font-size:12px;color:#0f172a;}',
      '.fo-pop .fo-cand:hover{background:#e0f2fe;border-color:#38bdf8;}',
      '.fo-pop .fo-empty{color:#94a3b8;font-size:12px;padding:4px 2px;}'
    ].join('');
    badgeLayer = document.createElement('div');
    shadow.appendChild(style);
    shadow.appendChild(badgeLayer);
    (document.documentElement || document.body).appendChild(host);
    startFollow();
  }

  var rafPending = false;
  function startFollow() {
    if (startFollow._on) return;
    startFollow._on = true;
    var tick = function () {
      rafPending = false;
      reposition();
    };
    window.addEventListener('scroll', function () { if (!rafPending) { rafPending = true; requestAnimationFrame(tick); } }, true);
    window.addEventListener('resize', function () { if (!rafPending) { rafPending = true; requestAnimationFrame(tick); } }, true);
  }

  function reposition() {
    items.forEach(function (it) {
      if (!it.el.isConnected || !isVisibleEl(it.el)) { hide(it.badgeEl); return; }
      var r = it.el.getBoundingClientRect();
      if (r.width < 1) { hide(it.badgeEl); return; }
      var x = Math.min(Math.max(r.right - 14, 8), window.innerWidth - 60);
      var y = Math.max(r.top - 20, 2);
      it.badgeEl.style.left = x + 'px';
      it.badgeEl.style.top = y + 'px';
      show(it.badgeEl);
    });
    if (popover && popover._anchor && popover._anchor.el.isConnected) {
      var r2 = popover._anchor.el.getBoundingClientRect();
      popover.style.left = Math.min(r2.left, window.innerWidth - 320) + 'px';
      popover.style.top = Math.min(r2.bottom + 26, window.innerHeight - 200) + 'px';
    }
  }

  function hide(el) { el.style.display = 'none'; }
  function show(el) { el.style.display = 'flex'; }
  function isVisibleEl(el) {
    var r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }

  /** 渲染一批 match（content.js 调用）；onBadgeClick(matchId) */
  FO.highlight.render = function (matches, onBadgeClick) {
    ensureHost();
    badgeLayer.textContent = '';
    items = [];
    matches.forEach(function (m, i) {
      var el = m.ctrl.el;
      var color = TIER_COLOR[m.tier] || TIER_COLOR.skip;
      var badge = document.createElement('div');
      badge.className = 'fo-badge';
      badge.style.background = color;
      badge.title = FO.fieldDef(m.key) ? FO.fieldDef(m.key).label + '（' + TIER_TEXT[m.tier] + ' ' + Math.round(m.score * 100) + '%）' : m.key;
      badge.innerHTML = '<span class="fo-num">' + FO.badgeLabel(i + 1) + '</span>';
      if (m.tier !== 'skip') {
        var def = FO.fieldDef(m.key);
        var nameSpan = document.createElement('span');
        nameSpan.textContent = def ? def.label : m.key;
        badge.appendChild(nameSpan);
      }
      badge.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closePopover();
        if (m.tier === 'confirm') openConfirm(m, onBadgeClick);
        else if (onBadgeClick) onBadgeClick(m);
      });
      badgeLayer.appendChild(badge);
      items.push({ matchId: m.id, el: el, num: i + 1, tier: m.tier, badgeEl: badge });
    });
    reposition();
  };

  FO.highlight.clear = function () {
    if (badgeLayer) badgeLayer.textContent = '';
    items = [];
    closePopover();
  };

  FO.highlight.count = function () { return items.length; };

  /** 待确认字段：点角标弹出候选值 */
  function openConfirm(m, onBadgeClick) {
    closePopover();
    popover = document.createElement('div');
    popover.className = 'fo-pop';
    popover._anchor = m;
    var def = FO.fieldDef(m.key);
    var title = document.createElement('div');
    title.className = 'fo-pop-title';
    title.textContent = (def ? def.label : m.key) + ' · 置信度 ' + Math.round(m.score * 100) + '%，请确认填入值';
    popover.appendChild(title);

    var segCount = FO.segmentCount(m._resume, FO.groupOf(m.key));
    var values = [];
    for (var s = 0; s < Math.min(segCount, 5); s++) {
      var v = FO.getResumeValue(m._resume, m.key, s);
      if (v) values.push(v);
    }
    if (!values.length) {
      var empty = document.createElement('div');
      empty.className = 'fo-empty';
      empty.textContent = '简历中没有该字段的值，去「编辑简历」补充';
      popover.appendChild(empty);
    }
    values.forEach(function (v, idx) {
      var btn = document.createElement('button');
      btn.className = 'fo-cand';
      btn.textContent = (segCount > 1 ? '第' + (idx + 1) + '条：' : '') + (v.length > 46 ? v.slice(0, 46) + '…' : v);
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        closePopover();
        if (onBadgeClick) onBadgeClick(m, v, idx);
      });
      popover.appendChild(btn);
    });
    badgeLayer.appendChild(popover);
    reposition();
  }

  function closePopover() {
    if (popover) { popover.remove(); popover = null; }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePopover();
  }, true);
})(typeof self !== 'undefined' ? self : globalThis);
