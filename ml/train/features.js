/**
 * 特征工程：构建词表 + 文本向量化（multi-hot char-bigram + ASCII 词 + 控件类型 one-hot）。
 */
'use strict';

/**
 * 从清洗后的样本构建词表。
 * 特征由两部分组成：中文 char-bigram + ASCII 词（长度>=2）。
 * @param {{text:string,label:string}[]} rows
 * @param {number} maxVocab 词表上限
 * @returns {string[]} vocab
 */
function buildVocab(rows, maxVocab) {
  const freq = new Map();
  const add = (g) => freq.set(g, (freq.get(g) || 0) + 1);
  rows.forEach((r) => {
    const text = String(r.text).toLowerCase();
    // 中文 char-bigram：在 ASCII 段两侧补空格，避免中英边界粘连
    const padded = ' ' + text.replace(/[\x00-\x7e]+/g, ' $& ') + ' ';
    for (let i = 0; i < padded.length - 1; i++) {
      const bg = padded.slice(i, i + 2);
      if (/[\u4e00-\u9fa5]{2}/.test(bg)) add(bg);
    }
    // ASCII 词
    text.replace(/[a-z0-9_\-]{2,}/g, (w) => { add(w); return w; });
  });
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxVocab)
    .map((e) => e[0]);
}

/**
 * 单条文本向量化。
 * @param {string} text
 * @param {string[]} vocab
 * @param {string} type 控件类型
 * @param {string[]} typeSlots
 * @returns {number[]} 长度 = vocab.length + typeSlots.length
 */
function featurize(text, vocab, type, typeSlots) {
  const vec = new Array(vocab.length + typeSlots.length).fill(0);
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
  const ti = typeSlots.indexOf(type || 'text');
  if (ti >= 0) vec[vocab.length + ti] = 1;
  return vec;
}

/** 计算特征向量的非零维度数（用于展示稀疏度） */
function sparsity(vec) {
  let nz = 0;
  for (let i = 0; i < vec.length; i++) if (vec[i] !== 0) nz++;
  return { nonZero: nz, total: vec.length, ratio: nz / vec.length };
}

module.exports = { buildVocab, featurize, sparsity };
