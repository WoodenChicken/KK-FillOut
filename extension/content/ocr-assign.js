/**
 * 视觉识别的几何分配器：把 OCR 行（CSS 像素坐标）按位置关系分配给附近的表单控件。
 * 纯函数、无 DOM 依赖（矩形由调用方传入 getBoundingClientRect 的结果），便于离线测试。
 *
 * 分配规则（每个控件最多认领一行最近标签）：
 *  1) 同行左侧：行垂直中心落在控件上下 10px 带内，且行尾在控件左缘左侧（距离 < 60% 视口宽）→ 距离 = 水平间隙
 *  2) 上方：行底缘在控件顶上方 48px 内，且水平重叠 ≥ 40% 行宽 → 距离 = 垂直间隙 × 1.6（略降权）
 * 与任何控件矩形相交的行视为「值/按钮文字」，不作为标签候选。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.ocr = FO.ocr || {};

  FO.ocr.assignLinesToControls = function (lines, controls, viewportW) {
    var rects = controls.map(function (c) { return c.el.getBoundingClientRect(); });

    function overlapsAnyControl(l) {
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (r.width < 1 && r.height < 1) continue;
        // 边缘相切不算相交（紧贴控件的标签行是合法候选）
        if (l.x1 <= r.left || l.x0 >= r.right || l.y1 <= r.top || l.y0 >= r.bottom) continue;
        return true;
      }
      return false;
    }

    var cands = lines.filter(function (l) {
      return l && l.text && !overlapsAnyControl(l);
    });

    var assigned = 0;
    controls.forEach(function (c, i) {
      if (c.signals.ocrText) return;
      var R = rects[i];
      if (!R || (R.width < 1 && R.height < 1)) return;
      var best = null, bestD = Infinity;
      for (var j = 0; j < cands.length; j++) {
        var l = cands[j];
        var cy = (l.y0 + l.y1) / 2;
        var d = null;
        if (cy >= R.top - 10 && cy <= R.bottom + 10 && l.x1 <= R.left + 6 && R.left - l.x1 < viewportW * 0.6) {
          d = R.left - l.x1;
        } else if (l.y1 <= R.top + 4 && l.y1 >= R.top - 48) {
          var overlap = Math.min(l.x1, R.right) - Math.max(l.x0, R.left);
          if (overlap > (l.x1 - l.x0) * 0.4) d = (R.top - l.y1) * 1.6 + 40;
        }
        if (d != null && d < bestD) { bestD = d; best = l; }
      }
      if (best) {
        c.signals.ocrText = best.text;
        assigned++;
      }
    });
    return assigned;
  };

  /** 图像像素坐标 → CSS 像素（截图宽 / 视口宽 为比例，天然兼容 DPR 与浏览器缩放） */
  FO.ocr.scaleLines = function (lines, imgW, viewportW) {
    var s = imgW > 0 ? viewportW / imgW : 1;
    return lines.map(function (l) {
      return {
        text: l.text,
        conf: l.conf,
        x0: l.x0 * s, y0: l.y0 * s, x1: l.x1 * s, y1: l.y1 * s
      };
    });
  };
})(typeof self !== 'undefined' ? self : globalThis);
