/**
 * 拟人化填充节奏（humanize）
 * ------------------------------------------------------------------
 * 目的：把「整页字段在同一 tick 内写完全部值」改成有随机停顿、有鼠标悬停/聚焦过渡
 * 的操作序列，降低页面侧对「填充速度异常 / 事件序列机械」的机器判定概率。
 *
 * 能力边界（必须明确）：content script 里派发的事件 isTrusted 恒为 false，
 * 本模块无法伪造可信事件，只能改善「节奏 + 事件序列」两项特征。
 * 真正的可信事件（isTrusted=true）只能由 chrome.debugger + CDP 派发。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.humanize = FO.humanize || {};

  // 速度档位：
  //   gap        字段间基础间隔区间 (ms)
  //   pause      长停顿区间 (ms)，模拟注意力转移
  //   pauseEvery 每 N 个字段插入一次长停顿
  //   char       逐字符输入间隔区间 (ms)
  var PROFILES = {
    fast: { gap: [40, 140], pause: [180, 420], pauseEvery: 8, char: [15, 45] },
    normal: { gap: [120, 380], pause: [400, 950], pauseEvery: 6, char: [30, 110] },
    slow: { gap: [280, 780], pause: [800, 1800], pauseEvery: 4, char: [60, 190] }
  };

  function profile(settings) {
    return PROFILES[(settings && settings.fillSpeed) || 'normal'] || PROFILES.normal;
  }

  function randInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return max <= min ? min : min + Math.floor(Math.random() * (max - min + 1));
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms || 0)); });
  }

  /** 第 index 个字段前的等待：基础间隔 + 按节奏插入一次长停顿 */
  function nextGap(settings, index) {
    var p = profile(settings);
    var ms = randInt(p.gap[0], p.gap[1]);
    if (p.pauseEvery && index > 0 && index % p.pauseEvery === 0) ms += randInt(p.pause[0], p.pause[1]);
    return ms;
  }

  function mouse(el, type, x, y) {
    try {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: type !== 'mouseenter' && type !== 'mouseleave',
        cancelable: true, view: root, clientX: x, clientY: y
      }));
    } catch (e) { /* 老浏览器忽略 */ }
  }

  /** 滚入视野并模拟一次鼠标悬停（坐标带抖动，避免每次都落在控件正中） */
  function hoverInto(el, settings) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    var fast = ((settings && settings.fillSpeed) || 'normal') === 'fast';
    try { el.scrollIntoView({ block: 'center', behavior: fast ? 'auto' : 'smooth' }); } catch (e) { /* noop */ }
    var r;
    try { r = el.getBoundingClientRect(); } catch (e) { return; }
    if (!r || (!r.width && !r.height)) return;
    var x = r.left + r.width * (0.25 + Math.random() * 0.5);
    var y = r.top + r.height * (0.3 + Math.random() * 0.4);
    mouse(el, 'mouseover', x, y);
    mouse(el, 'mouseenter', x, y);
    mouse(el, 'mousemove', x + randInt(-4, 4), y + randInt(-4, 4));
  }

  function key(el, type, ch) {
    try {
      el.dispatchEvent(new KeyboardEvent(type, { key: ch, code: '', bubbles: true, cancelable: true }));
    } catch (e) { /* noop */ }
  }

  /**
   * 逐字符模拟键盘输入：keydown → beforeinput → 写值 → input → keyup，末尾补 change。
   * 返回 Promise，全部字符写完才 resolve；由调用方决定是否等待。
   */
  function typeInto(el, text, settings) {
    var p = profile(settings);
    var write = FO.filler && FO.filler.writeNative;
    var str = String(text == null ? '' : text);
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* noop */ } }
    var acc = '';
    var chain = Promise.resolve();
    str.split('').forEach(function (ch) {
      chain = chain.then(function () { return sleep(randInt(p.char[0], p.char[1])); }).then(function () {
        if (!el.isConnected || typeof write !== 'function') return;
        key(el, 'keydown', ch);
        try {
          el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: ch, inputType: 'insertText' }));
        } catch (e) { /* 老浏览器忽略 */ }
        acc += ch;
        write(el, acc, 'input');
        key(el, 'keyup', ch);
      });
    });
    return chain.then(function () {
      if (el.isConnected) { try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* noop */ } }
      return acc;
    });
  }

  FO.humanize.PROFILES = PROFILES;
  FO.humanize.randInt = randInt;
  FO.humanize.sleep = sleep;
  FO.humanize.nextGap = nextGap;
  FO.humanize.profile = profile;
  FO.humanize.hoverInto = hoverInto;
  FO.humanize.typeInto = typeInto;
})(typeof self !== 'undefined' ? self : globalThis);
