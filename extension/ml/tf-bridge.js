/**
 * TFJS 推理桥 —— 由 background 按需注入到页面 ISOLATED 世界（vendor/tf.min.js 之后加载）。
 * 模型与词表全部来自扩展包本地文件（models/model.json + models/meta.json），零远程请求。
 * 模型不存在时保持 FO.ml = null，引擎自动退回纯规则打分。
 */
(function () {
  'use strict';
  if (!window.FO || !window.tf) return;
  if (window.FO.ml) return;

  var model = null, meta = null;
  var TYPE_SLOTS = ['text', 'textarea', 'select', 'date', 'number', 'radio'];

  function buildFeatures(signals) {
    var vocab = meta.vocab;
    var dim = vocab.length;
    var vec = new Array(dim + TYPE_SLOTS.length).fill(0);
    var texts = [
      signals.labelText || '', signals.placeholder || '', signals.name || '',
      signals.id || '', signals.ariaLabel || '', signals.dataAttrs || ''
    ].join(' ').toLowerCase();
    // 中文 char-bigram + ASCII 词
    var cjk = texts.replace(/[\x00-\x7e]+/g, ' $& ');
    for (var i = 0; i < cjk.length - 1; i++) {
      var bg = cjk.slice(i, i + 2);
      if (/[\u4e00-\u9fa5]{2}/.test(bg)) {
        var j = vocab.indexOf(bg);
        if (j >= 0) vec[j] = 1;
      }
    }
    texts.replace(/[a-z0-9_\-]{2,}/g, function (w) {
      var j = vocab.indexOf(w);
      if (j >= 0) vec[j] = 1;
      return w;
    });
    var tIdx = TYPE_SLOTS.indexOf((signals.type || 'text'));
    if (tIdx >= 0) vec[dim + tIdx] = 1;
    return vec;
  }

  window.FO.ml = {
    ready: false,
    init: function (modelUrl) {
      var base = modelUrl.replace(/model\.json$/, '');
      return fetch(base + 'meta.json').then(function (r) { return r.json(); }).then(function (m) {
        meta = m;
        return window.tf.loadLayersModel(modelUrl);
      }).then(function (m) {
        model = m;
        try { window.tf.setBackend('cpu'); } catch (e) { /* webgl 亦可 */ }
        window.FO.ml.ready = true;
      });
    },
    /** signals -> { key, score } | null（top1） */
    predictSync: function (signals) {
      if (!model || !meta) return null;
      try {
        var vec = buildFeatures(signals);
        var input = window.tf.tensor2d([vec]);
        var out = model.predict(input);
        var probs = out.dataSync();
        input.dispose(); out.dispose();
        var best = 0;
        for (var i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
        return { key: meta.labels[best], score: probs[best] };
      } catch (e) {
        return null;
      }
    }
  };
})();
