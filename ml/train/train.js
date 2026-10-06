/**
 * FillOut 字段分类模型训练脚本（全离线）。
 *
 * 用法：
 *   cd ml/train && npm install && npm run train
 *   # 可选：把 Panel 导出的 fillout-samples.jsonl 放到本目录，脚本会合并真实样本
 *
 * 产出（复制到 extension/models/ 即可被插件加载）：
 *   models/model.json + models/weights.bin + models/meta.json
 *
 * 模型：multi-hot(char-bigram + ASCII词 + 控件类型 one-hot) → Dense(128, relu) → Dense(类别数, softmax)
 * 体积 < 2MB；CPU 推理单控件 < 5ms。
 */
const fs = require('fs');
const path = require('path');

// ---------- 加载 FO（matcher 提供词典，schema 提供字段表） ----------
globalThis.window = globalThis; // 让两个脚本按浏览器方式挂载 FO
require('../../extension/utils/schema.js');
require('../../extension/content/matcher.js');
const FO = globalThis.FO;

const DICT = FO.matcher.DICT;
const KEYS = FO.allMatchKeys().filter((k) => DICT[k]);
const OUT_DIR = path.join(__dirname, '..', '..', 'extension', 'models');

// ---------- 1. 合成数据集（模板 + 噪声） ----------
const PREFIX = ['请输入您的', '您的', '请填写', '请输入', '请完善', '必填*', '*', '【必填】', '填一下', ''];
const SUFFIX = ['', '（必填）', '：', '(必填)', ' *', '是什么', '', '（选填）', 'Title'];
const SITE_WRAPPERS = [
  (t) => `applicant${t}`, (t) => `job_${t}`, (t) => `user${t}`, (t) => `${t}_field`,
  (t) => `input-${t}`, (t) => `${t}Input`, (t) => `${t}`
];

function noise(s, rng) {
  if (rng() < 0.25) return s + String(Math.floor(rng() * 90) + 10);
  return s;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSynthetic() {
  const rng = mulberry32(42);
  const rows = [];
  KEYS.forEach((key, cls) => {
    const pats = DICT[key];
    pats.forEach((p) => {
      for (let v = 0; v < 6; v++) {
        const pre = PREFIX[Math.floor(rng() * PREFIX.length)];
        const suf = SUFFIX[Math.floor(rng() * SUFFIX.length)];
        rows.push({ text: pre + p + suf, label: key });
        // 站点字段名风格（ASCII）
        if (/^[\x20-\x7e]+$/.test(p)) {
          const camel = p.replace(/[^a-z]/g, '').replace(/(^|[-_ ])([a-z])/g, (m, a, b) => b.toUpperCase());
          rows.push({ text: noise(SITE_WRAPPERS[Math.floor(rng() * SITE_WRAPPERS.length)](camel), rng), label: key });
        }
      }
    });
    // 组合模板：中文 pattern 两两拼接（如「紧急联系人手机号码」）
    for (let i = 0; i < Math.min(pats.length, 4); i++) {
      for (let j = 0; j < Math.min(pats.length, 4); j++) {
        if (i !== j && /[\u4e00-\u9fa5]/.test(pats[i]) && /[\u4e00-\u9fa5]/.test(pats[j]) && rng() < 0.5) {
          rows.push({ text: pats[i] + pats[j], label: key });
        }
      }
    }
  });
  return rows;
}

// ---------- 2. 真实样本（Panel 导出的 JSONL，可选） ----------
function loadRealSamples() {
  const f = path.join(__dirname, 'fillout-samples.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter((r) => r && r.text && r.label && KEYS.includes(r.label));
}

// ---------- 3. 特征 ----------
const TYPE_SLOTS = ['text', 'textarea', 'select', 'date', 'number', 'radio'];

function buildVocab(rows, maxVocab) {
  const freq = new Map();
  const add = (g, w) => freq.set(g, (freq.get(g) || 0) + (w || 1));
  rows.forEach((r) => {
    const text = String(r.text).toLowerCase();
    const padded = ' ' + text.replace(/[\x00-\x7e]+/g, ' $& ') + ' ';
    for (let i = 0; i < padded.length - 1; i++) {
      const bg = padded.slice(i, i + 2);
      if (/[\u4e00-\u9fa5]{2}/.test(bg)) add(bg);
    }
    text.replace(/[a-z0-9_\-]{2,}/g, (w) => { add(w); return w; });
  });
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxVocab).map((e) => e[0]);
}

function featurize(text, vocab, type) {
  const vec = new Array(vocab.length + TYPE_SLOTS.length).fill(0);
  const t = String(text).toLowerCase();
  const padded = ' ' + t.replace(/[\x00-\x7e]+/g, ' $& ') + ' ';
  for (let i = 0; i < padded.length - 1; i++) {
    const bg = padded.slice(i, i + 2);
    if (/[\u4e00-\u9fa5]{2}/.test(bg)) {
      const j = vocab.indexOf(bg);
      if (j >= 0) vec[j] = 1;
    }
  }
  t.replace(/[a-z0-9_\-]{2,}/g, (w) => {
    const j = vocab.indexOf(w);
    if (j >= 0) vec[j] = 1;
    return w;
  });
  const ti = TYPE_SLOTS.indexOf(type || 'text');
  if (ti >= 0) vec[vocab.length + ti] = 1;
  return vec;
}

// ---------- 4. 训练 ----------
async function main() {
  console.log('[FillOut] 加载 TFJS…');
  const tf = require('@tensorflow/tfjs');

  const all = generateSynthetic().concat(loadRealSamples());
  console.log(`[FillOut] 样本：合成+真实 共 ${all.length} 条，类别 ${KEYS.length}`);

  const vocab = buildVocab(all, 3000);
  console.log(`[FillOut] 词表大小：${vocab.length}`);

  const X = tf.tensor2d(all.map((r) => featurize(r.text, vocab, 'text')));
  const labels = all.map((r) => KEYS.indexOf(r.label));
  const Y = tf.oneHot(tf.tensor1d(labels, 'int32'), KEYS.length);

  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [vocab.length + TYPE_SLOTS.length], units: 128, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.15 }));
  model.add(tf.layers.dense({ units: KEYS.length, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(0.005), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

  await model.fit(X, Y, { epochs: 30, batchSize: 64, shuffle: true, callbacks: {
    onEpochEnd: (e, logs) => console.log(`  epoch ${e + 1}: loss=${logs.loss.toFixed(4)} acc=${logs.acc.toFixed(4)}`)
  } });

  // 训练集自评
  const evalOut = model.evaluate(X, Y);
  const acc = (await evalOut[1].data())[0];
  console.log(`[FillOut] 训练集准确率：${(acc * 100).toFixed(2)}%（合成数据仅验证流程，真实命中率看站点实测）`);

  // ---------- 5. 导出 ----------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const handler = tf.io.withSaveHandler(async (artifacts) => {
    fs.writeFileSync(path.join(OUT_DIR, 'model.json'), JSON.stringify({
      modelTopology: artifacts.modelTopology,
      weightsManifest: [{ paths: ['weights.bin'], weightSpecs: artifacts.weightSpecs }],
      format: 'tfjs-graph-model',
      generatedBy: 'fillout-train'
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'weights.bin'), Buffer.from(artifacts.weightData));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  });
  await model.save(handler);
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({ vocab, labels: KEYS }, null, 0));

  const sizeKB = Math.round(fs.statSync(path.join(OUT_DIR, 'weights.bin')).size / 1024);
  console.log(`[FillOut] 模型已导出到 extension/models/（weights ${sizeKB}KB）`);
  console.log('[FillOut] 完成。重新加载扩展即可启用模型辅助识别。');
}

main().catch((e) => { console.error(e); process.exit(1); });
