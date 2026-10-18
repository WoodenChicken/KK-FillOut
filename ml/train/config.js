/**
 * 训练超参数与全局配置。
 * CLI 与 Dashboard 共用同一份默认值；Dashboard 可在运行时覆盖。
 */
'use strict';

const DEFAULT_CONFIG = {
  // —— 数据 ——
  seed: 42,                      // 随机种子，保证可复现
  samplesPerPattern: 6,          // 每个 pattern 生成的样本数
  noiseRate: 0.25,               // 加噪声概率
  realSamplesPath: 'fillout-samples.jsonl', // 真实样本 JSONL（可选）

  // —— 特征 ——
  vocabSize: 3000,               // 词表大小（char-bigram + ASCII 词）
  typeSlots: ['text', 'textarea', 'select', 'date', 'number', 'radio'],

  // —— 模型 ——
  hiddenUnits: 128,              // 隐层神经元数
  dropout: 0.15,                 // dropout 率
  activation: 'relu',

  // —— 训练 ——
  epochs: 30,                    // 训练轮数
  batchSize: 64,                 // 批大小
  learningRate: 0.005,           // Adam 学习率
  validationSplit: 0.15,         // 验证集比例
  shuffle: true,

  // —— 输出 ——
  outDir: null                   // 模型导出目录，默认 extension/models
};

/** 深拷贝默认配置（避免调用方修改全局默认值） */
function defaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/** 把用户传入的配置与默认配置合并 */
function mergeConfig(user) {
  const cfg = defaultConfig();
  if (user && typeof user === 'object') {
    Object.keys(user).forEach((k) => {
      if (user[k] !== undefined && user[k] !== null) cfg[k] = user[k];
    });
  }
  // 数值字段做类型兜底
  ['seed', 'samplesPerPattern', 'vocabSize', 'hiddenUnits', 'epochs', 'batchSize']
    .forEach((k) => { cfg[k] = Math.max(1, parseInt(cfg[k], 10) || DEFAULT_CONFIG[k]); });
  ['noiseRate', 'dropout', 'learningRate', 'validationSplit']
    .forEach((k) => { cfg[k] = Math.max(0, Math.min(1, parseFloat(cfg[k]) || 0)); });
  return cfg;
}

module.exports = { DEFAULT_CONFIG, defaultConfig, mergeConfig };
