/**
 * 模型定义：multi-hot 特征 → Dense(relu) → Dropout → Dense(softmax)。
 * 抽成独立模块，便于 Dashboard 展示模型结构与参数调优。
 */
'use strict';

/**
 * 构建模型。
 * @param {object} tf      - @tensorflow/tfjs 实例
 * @param {object} cfg     - 配置（hiddenUnits, dropout, activation, learningRate, numClasses, featureDim）
 * @returns {tf.LayersModel}
 */
function buildModel(tf, cfg) {
  const featureDim = cfg.featureDim;
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [featureDim],
    units: cfg.hiddenUnits,
    activation: cfg.activation
  }));
  model.add(tf.layers.dropout({ rate: cfg.dropout }));
  model.add(tf.layers.dense({
    units: cfg.numClasses,
    activation: 'softmax'
  }));
  model.compile({
    optimizer: tf.train.adam(cfg.learningRate),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  return model;
}

/** 返回模型结构描述（用于 Dashboard 展示） */
function describeModel(cfg) {
  return [
    { layer: 'Input', shape: `[${cfg.featureDim}]`, params: 0 },
    { layer: 'Dense (relu)', shape: `[${cfg.hiddenUnits}]`, params: cfg.featureDim * cfg.hiddenUnits + cfg.hiddenUnits },
    { layer: `Dropout (${cfg.dropout})`, shape: `[${cfg.hiddenUnits}]`, params: 0 },
    { layer: 'Dense (softmax)', shape: `[${cfg.numClasses}]`, params: cfg.hiddenUnits * cfg.numClasses + cfg.numClasses }
  ];
}

/** 估算模型权重体积（KB） */
function estimateModelSize(cfg) {
  const params = (cfg.featureDim * cfg.hiddenUnits + cfg.hiddenUnits) +
                 (cfg.hiddenUnits * cfg.numClasses + cfg.numClasses);
  // 每个参数 float32 = 4 字节
  return Math.round((params * 4) / 1024);
}

module.exports = { buildModel, describeModel, estimateModelSize };
