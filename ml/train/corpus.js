/**
 * 语料生成：基于 matcher.DICT 的 pattern 合成训练样本。
 * 包含：前缀/后缀噪声、section 上下文（用于跨组消歧）、站点风格 ASCII 字段名。
 */
'use strict';

const PREFIX = ['请输入您的', '您的', '请填写', '请输入', '请完善', '必填*', '*', '【必填】', '填一下', ''];
const SUFFIX = ['', '（必填）', '：', '(必填)', ' *', '是什么', '', '（选填）', 'Title'];
const SITE_WRAPPERS = [
  (t) => `applicant${t}`, (t) => `job_${t}`, (t) => `user${t}`, (t) => `${t}_field`,
  (t) => `input-${t}`, (t) => `${t}Input`, (t) => `${t}`
];

// 组 -> section 标题关键词（合成带上下文样本，让模型学会 section 消歧）
const SECTION_CTX = {
  basicInfo: ['基本信息', '个人信息', '个人资料'],
  family: ['家庭成员', '家庭情况', '家庭主要成员'],
  education: ['教育经历', '教育背景', '学习经历'],
  internship: ['实习经历', '实习经验'],
  work: ['工作经历', '工作经验', '职业经历'],
  project: ['项目经历', '项目经验'],
  certificate: ['证书', '资格证书', '证书情况'],
  honor: ['荣誉奖项', '奖惩情况', '获奖情况'],
  skills: ['技能特长', '专业技能']
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(s, rng, rate) {
  if (rng() < rate) return s + String(Math.floor(rng() * 90) + 10);
  return s;
}

/**
 * 生成合成语料。
 * @param {string[]} keys  - 匹配字段 key 列表（FO.allMatchKeys 过滤后）
 * @param {object}   dict  - matcher.DICT
 * @param {object}   cfg   - 配置（seed, samplesPerPattern, noiseRate）
 * @returns {{ text: string, label: string }[]}
 */
function generateSynthetic(keys, dict, cfg) {
  const rng = mulberry32(cfg.seed);
  const rows = [];
  keys.forEach((key) => {
    const pats = dict[key] || [];
    const group = key.split('.')[0];
    const ctxList = SECTION_CTX[group] || [];
    pats.forEach((p) => {
      for (let v = 0; v < cfg.samplesPerPattern; v++) {
        const pre = PREFIX[Math.floor(rng() * PREFIX.length)];
        const suf = SUFFIX[Math.floor(rng() * SUFFIX.length)];
        const bare = pre + p + suf;
        rows.push({ text: bare, label: key });
        // 带 section 上下文的样本：约 50% 概率拼接 section 标题
        if (ctxList.length && rng() < 0.5) {
          const ctx = ctxList[Math.floor(rng() * ctxList.length)];
          rows.push({ text: ctx + ' ' + bare, label: key });
        }
        // 站点字段名风格（ASCII）
        if (/^[\x20-\x7e]+$/.test(p)) {
          const camel = p.replace(/[^a-z]/g, '').replace(/(^|[-_ ])([a-z])/g, (m, a, b) => b.toUpperCase());
          rows.push({ text: noise(SITE_WRAPPERS[Math.floor(rng() * SITE_WRAPPERS.length)](camel), rng, cfg.noiseRate), label: key });
        }
      }
    });
    // 组合模板：中文 pattern 两两拼接
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

/**
 * 统计各类别样本数，返回 { labels: string[], counts: number[] }
 */
function classDistribution(rows, keys) {
  const counts = new Array(keys.length).fill(0);
  rows.forEach((r) => {
    const i = keys.indexOf(r.label);
    if (i >= 0) counts[i]++;
  });
  return { labels: keys.slice(), counts };
}

module.exports = { generateSynthetic, classDistribution, mulberry32 };
