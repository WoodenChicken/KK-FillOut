/**
 * 模型评估：准确率 + 各类别混淆/精确率/召回率摘要。
 */
'use strict';

/**
 * 在验证集上评估，返回准确率与各类别统计。
 * @param {object} model - tf model
 * @param {tf.Tensor} X
 * @param {tf.Tensor} Y - one-hot
 * @param {string[]} labels
 */
async function evaluate(model, X, Y, labels) {
  const preds = model.predict(X);
  const predIdx = preds.argMax(-1);
  const trueIdx = Y.argMax(-1);
  const predArr = await predIdx.data();
  const trueArr = await trueIdx.data();

  let correct = 0;
  const perClass = labels.map((l) => ({ label: l, tp: 0, fp: 0, fn: 0, total: 0 }));
  for (let i = 0; i < trueArr.length; i++) {
    const t = trueArr[i], p = predArr[i];
    perClass[t].total++;
    if (t === p) { correct++; perClass[t].tp++; }
    else { perClass[t].fn++; perClass[p].fp++; }
  }
  const accuracy = correct / trueArr.length;

  const classStats = perClass.map((c) => ({
    label: c.label,
    total: c.total,
    precision: c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 0,
    recall: c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 0,
    tp: c.tp, fp: c.fp, fn: c.fn
  }));

  // 找出最差的 5 个类别（按 F1）
  classStats.forEach((c) => {
    c.f1 = c.precision + c.recall > 0 ? 2 * c.precision * c.recall / (c.precision + c.recall) : 0;
  });
  const worst = classStats.slice().sort((a, b) => a.f1 - b.f1).slice(0, 5);

  return { accuracy, total: trueArr.length, classStats, worstClasses: worst };
}

module.exports = { evaluate };
