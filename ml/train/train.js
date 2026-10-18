/**
 * FillOut 字段分类模型训练脚本（CLI 入口）。
 *
 * 用法：
 *   cd ml/train && npm install && npm run train
 *   # 可选：把 Panel 导出的 fillout-samples.jsonl 放到本目录，脚本会合并真实样本
 *   # 可选参数：--epochs 50 --lr 0.01 --hidden 256 --vocab 4000
 *
 * 产出（复制到 extension/models/ 即可被插件加载）：
 *   models/model.json + models/weights.bin + models/meta.json
 *
 * 核心逻辑在 train-lib.js，本文件只做参数解析与控制台输出。
 */
'use strict';

const { runTraining } = require('./train-lib');

function parseArgs(argv) {
  const cfg = {};
  const map = {
    '--epochs': 'epochs', '--lr': 'learningRate', '--hidden': 'hiddenUnits',
    '--vocab': 'vocabSize', '--batch': 'batchSize', '--dropout': 'dropout',
    '--seed': 'seed', '--samples': 'samplesPerPattern'
  };
  for (let i = 0; i < argv.length; i++) {
    const key = map[argv[i]];
    if (key && argv[i + 1] !== undefined) { cfg[key] = argv[i + 1]; i++; }
  }
  return cfg;
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const callbacks = {
    onStage: (s) => console.log(`\n=== 阶段：${s.stage} ===`),
    onLog: (m) => console.log(m),
    onCorpus: (d) => console.log(`  语料 ${d.total} 条 / ${d.numClasses} 类`),
    onCleaning: (d) => console.log(`  清洗 ${d.before} → ${d.after}`),
    onFeatures: (d) => console.log(`  词表 ${d.vocabSize}，特征维 ${d.featureDim}`),
    onEval: (d) => console.log(`  验证集准确率 ${(d.accuracy * 100).toFixed(2)}%`),
    onExport: (d) => console.log(`  导出 ${d.outDir}，weights ${d.weightsSizeKB}KB`)
  };
  const result = await runTraining(cfg, callbacks);
  if (result.stopped) console.log('\n[FillOut] 训练已停止。');
  else console.log('\n[FillOut] 训练完成。重新加载扩展即可启用模型辅助识别。');
}

main().catch((e) => { console.error(e); process.exit(1); });
