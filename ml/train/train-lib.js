/**
 * 训练核心库：把语料生成 / 清洗 / 特征 / 建模 / 训练 / 评估 / 导出串起来，
 * 每个阶段通过 callbacks 上报进度。CLI 与 Dashboard 共用此模块。
 *
 * callbacks 可选：
 *   onStage(stage, data)         阶段切换（corpus / cleaning / features / model / training / eval / export / done）
 *   onCorpus(data)               语料生成完成 { total, perClass, samples }
 *   onCleaning(data)             清洗完成 { steps, finalCount }
 *   onFeatures(data)             特征完成 { vocabSize, featureDim, sparsity }
 *   onEpoch(data)                每轮结束 { epoch, loss, acc, valLoss, valAcc }
 *   onEval(data)                 评估完成 { accuracy, classStats, worstClasses }
 *   onLog(message)               文本日志
 *   shouldStop()                 返回 true 时中断训练
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { mergeConfig } = require('./config');
const { generateSynthetic, classDistribution } = require('./corpus');
const { clean } = require('./cleaning');
const { buildVocab, featurize, sparsity } = require('./features');
const { buildModel, describeModel, estimateModelSize } = require('./model');
const { evaluate } = require('./evaluate');

// 加载 FO（schema + matcher）
function loadFO() {
  globalThis.window = globalThis;
  require('../../extension/utils/schema.js');
  require('../../extension/content/matcher.js');
  return globalThis.FO;
}

function loadRealSamples(dir, keys) {
  const f = path.join(dir, 'fillout-samples.jsonl');
  if (!fs.existsSync(f)) return [];
  const keySet = new Set(keys);
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter((r) => r && r.text && r.label && keySet.has(r.label));
}

async function runTraining(userConfig, callbacks) {
  const cb = callbacks || {};
  const emit = (evt, data) => { try { cb[evt] && cb[evt](data); } catch (e) { /* 回调异常不中断训练 */ } };
  const log = (m) => emit('onLog', m);
  const shouldStop = () => (cb.shouldStop ? cb.shouldStop() : false);

  const cfg = mergeConfig(userConfig);
  log('[FillOut] 加载 schema + matcher…');
  const FO = loadFO();
  const DICT = FO.matcher.DICT;
  const KEYS = FO.allMatchKeys().filter((k) => DICT[k]);

  // —— 1. 语料 ——
  emit('onStage', { stage: 'corpus' });
  log('[FillOut] 生成合成语料…');
  const synthetic = generateSynthetic(KEYS, DICT, cfg);
  const realSamples = loadRealSamples(__dirname, KEYS);
  const allRaw = synthetic.concat(realSamples);
  const dist = classDistribution(allRaw, KEYS);
  log(`[FillOut] 语料：合成 ${synthetic.length} + 真实 ${realSamples.length} = ${allRaw.length} 条，类别 ${KEYS.length}`);
  emit('onCorpus', {
    total: allRaw.length,
    synthetic: synthetic.length,
    real: realSamples.length,
    numClasses: KEYS.length,
    perClass: dist,
    samples: allRaw.slice(0, 30) // 抽样展示
  });

  // —— 2. 清洗 ——
  emit('onStage', { stage: 'cleaning' });
  log('[FillOut] 数据清洗…');
  const { rows: cleanRows, steps } = clean(allRaw, KEYS);
  log(`[FillOut] 清洗后：${cleanRows.length} 条（减少 ${allRaw.length - cleanRows.length}）`);
  emit('onCleaning', { steps, before: allRaw.length, after: cleanRows.length });

  if (cleanRows.length === 0) throw new Error('清洗后无可用样本');

  // —— 3. 特征 ——
  emit('onStage', { stage: 'features' });
  log('[FillOut] 构建词表与特征…');
  const vocab = buildVocab(cleanRows, cfg.vocabSize);
  const featureDim = vocab.length + cfg.typeSlots.length;
  log(`[FillOut] 词表：${vocab.length}，特征维度：${featureDim}`);

  // 切分 train / val
  const shuffled = cleanRows.slice();
  // 简单确定性打乱（基于 seed）
  let s = cfg.seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const valSize = Math.max(1, Math.floor(shuffled.length * cfg.validationSplit));
  const valRows = shuffled.slice(0, valSize);
  const trainRows = shuffled.slice(valSize);
  log(`[FillOut] 训练集 ${trainRows.length} / 验证集 ${valRows.length}`);

  const Xarr = trainRows.map((r) => featurize(r.text, vocab, 'text', cfg.typeSlots));
  const Yarr = trainRows.map((r) => KEYS.indexOf(r.label));
  const XvalArr = valRows.map((r) => featurize(r.text, vocab, 'text', cfg.typeSlots));
  const YvalArr = valRows.map((r) => KEYS.indexOf(r.label));

  const sp = sparsity(Xarr[0]);
  emit('onFeatures', {
    vocabSize: vocab.length,
    featureDim,
    sparsity: sp,
    trainSize: trainRows.length,
    valSize: valRows.length
  });

  // —— 4. 建模 ——
  emit('onStage', { stage: 'model' });
  log('[FillOut] 加载 TensorFlow.js…');
  const tf = require('@tensorflow/tfjs');
  cfg.featureDim = featureDim;
  cfg.numClasses = KEYS.length;
  const model = buildModel(tf, cfg);
  const layers = describeModel(cfg);
  const estSize = estimateModelSize(cfg);
  log(`[FillOut] 模型：${layers.map((l) => l.layer).join(' → ')}，估算权重 ~${estSize}KB`);
  emit('onModel', { layers, estimatedSizeKB: estSize, config: cfg });

  // —— 5. 训练 ——
  emit('onStage', { stage: 'training' });
  log('[FillOut] 开始训练…');
  const X = tf.tensor2d(Xarr);
  const Y = tf.oneHot(tf.tensor1d(Yarr, 'int32'), KEYS.length);
  const Xval = tf.tensor2d(XvalArr);
  const Yval = tf.oneHot(tf.tensor1d(YvalArr, 'int32'), KEYS.length);

  const epochStart = Date.now();
  let stopped = false;
  const history = [];

  await model.fit(X, Y, {
    epochs: cfg.epochs,
    batchSize: cfg.batchSize,
    shuffle: cfg.shuffle,
    validationData: [Xval, Yval],
    callbacks: {
      onEpochEnd: (e, logs) => {
        const dt = ((Date.now() - epochStart) / 1000).toFixed(1);
        const rec = {
          epoch: e + 1,
          loss: +logs.loss.toFixed(4),
          acc: +logs.acc.toFixed(4),
          valLoss: logs.val_loss !== undefined ? +logs.val_loss.toFixed(4) : null,
          valAcc: logs.val_acc !== undefined ? +logs.val_acc.toFixed(4) : null,
          elapsedSec: parseFloat(dt)
        };
        history.push(rec);
        log(`  epoch ${rec.epoch}/${cfg.epochs}: loss=${rec.loss} acc=${rec.acc} valLoss=${rec.valLoss} valAcc=${rec.valAcc} (${dt}s)`);
        emit('onEpoch', rec);
        if (shouldStop()) {
          stopped = true;
          model.stopTraining = true;
          log('[FillOut] 收到停止信号，训练中断');
        }
      }
    }
  });

  X.dispose(); Y.dispose();

  if (stopped) {
    emit('onStage', { stage: 'stopped' });
    return { stopped: true, history };
  }

  // —— 6. 评估 ——
  emit('onStage', { stage: 'eval' });
  log('[FillOut] 在验证集上评估…');
  const evalRes = await evaluate(model, Xval, Yval, KEYS);
  Xval.dispose(); Yval.dispose();
  log(`[FillOut] 验证集准确率：${(evalRes.accuracy * 100).toFixed(2)}%`);
  emit('onEval', evalRes);

  // —— 7. 导出 ——
  emit('onStage', { stage: 'export' });
  const outDir = cfg.outDir || path.join(__dirname, '..', '..', 'extension', 'models');
  fs.mkdirSync(outDir, { recursive: true });
  const handler = tf.io.withSaveHandler(async (artifacts) => {
    fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify({
      modelTopology: artifacts.modelTopology,
      weightsManifest: [{ paths: ['weights.bin'], weightSpecs: artifacts.weightSpecs }],
      format: 'tfjs-graph-model',
      generatedBy: 'fillout-train'
    }));
    fs.writeFileSync(path.join(outDir, 'weights.bin'), Buffer.from(artifacts.weightData));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  });
  await model.save(handler);
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ vocab, labels: KEYS }, null, 0));
  const sizeKB = Math.round(fs.statSync(path.join(outDir, 'weights.bin')).size / 1024);
  log(`[FillOut] 模型已导出到 ${outDir}（weights ${sizeKB}KB）`);
  emit('onExport', { outDir, weightsSizeKB: sizeKB, vocabSize: vocab.length, numClasses: KEYS.length });

  emit('onStage', { stage: 'done' });
  log('[FillOut] 全部完成。');

  return {
    stopped: false,
    history,
    eval: evalRes,
    vocab,
    labels: KEYS,
    outDir,
    weightsSizeKB: sizeKB
  };
}

module.exports = { runTraining, loadFO };
