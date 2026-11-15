/**
 * 共享数据入口：面板预览与训练使用相同的类别、合成配置和真实样本。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { mergeConfig } = require('./config');
const { generateSynthetic, classDistribution } = require('./corpus');

const SAMPLES_PATH = path.join(__dirname, 'fillout-samples.jsonl');

function loadFO() {
  globalThis.window = globalThis;
  require('../../extension/utils/schema.js');
  require('../../extension/content/matcher.js');
  return globalThis.FO;
}

function getLabels() {
  const FO = loadFO();
  return FO.allMatchKeys().filter((key) => FO.matcher.DICT[key]).map((key) => {
    const [group, field] = key.split('.');
    const section = FO.SCHEMA[group];
    const descriptor = section && section.fields.find((f) => f.key === field);
    return { key, group: section ? section.label : group, name: descriptor ? descriptor.label : field };
  });
}

function readSamples(file = SAMPLES_PATH) {
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const rows = [];
  content.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error();
      rows.push(row);
    } catch (e) {
      throw new Error(`真实语料文件第 ${index + 1} 行不是有效的 JSON 对象，请先修正文件`);
    }
  });
  return { content, rows };
}

function isValidSample(row, keys) {
  return typeof row.text === 'string' && !!row.text.trim() && keys.includes(row.label);
}

function buildDataset(userConfig, realRows = readSamples().rows) {
  const cfg = mergeConfig(userConfig);
  const FO = loadFO();
  const keys = getLabels().map((label) => label.key);
  const synthetic = generateSynthetic(keys, FO.matcher.DICT, cfg);
  const real = realRows.filter((row) => isValidSample(row, keys));
  const rows = synthetic.concat(real);
  return {
    keys, synthetic, real, rows,
    overview: {
      total: rows.length, synthetic: synthetic.length, real: real.length,
      numClasses: keys.length, perClass: classDistribution(rows, keys),
      samples: rows.slice(0, 30)
    }
  };
}

module.exports = { SAMPLES_PATH, loadFO, getLabels, readSamples, isValidSample, buildDataset };
