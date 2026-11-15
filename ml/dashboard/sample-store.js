/**
 * JSONL 语料管理：原子保存、版本校验、导入去重，保留已有扩展元数据。
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { SAMPLES_PATH, readSamples, getLabels } = require('../train/dataset');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function fingerprint(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sampleKey(row) {
  return JSON.stringify([row.text.replace(/\s+/g, ' ').trim().toLowerCase(), row.label]);
}

function createSampleStore(file = SAMPLES_PATH) {
  function read() {
    const data = readSamples(file);
    return { ...data, revision: fingerprint(data.content) };
  }

  function validate(row) {
    if (!row || typeof row.text !== 'string' || !row.text.trim()) fail('请填写字段标签文本');
    if (!getLabels().some((label) => label.key === row.label)) fail('请选择有效的字段类别');
    const text = row.text.replace(/\s+/g, ' ').trim();
    // 与训练清洗的长度规则保持一致，避免保存后无法参与训练。
    if (text.length < 2 || text.length > 200) fail('字段标签文本须为 2～200 个字符（与训练清洗规则一致）');
    return { ...row, text, label: row.label };
  }

  function save(rows, revision) {
    if (!revision || read().revision !== revision) fail('语料已发生变化，请刷新列表后重试', 409);
    const content = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
    const temp = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return { ok: true, revision: fingerprint(content) };
  }

  function indexOf(id, rows) {
    if (!/^\d+$/.test(String(id)) || !rows[Number(id)]) fail('语料不存在，请刷新列表', 404);
    return Number(id);
  }

  function duplicate(rows, row, except = -1) {
    return rows.some((r, i) => i !== except && typeof r.text === 'string' && sampleKey(r) === sampleKey(row));
  }

  return {
    read,
    add(body) {
      const { rows } = read();
      const row = validate({ text: body.text, label: body.label });
      if (duplicate(rows, row)) fail('相同文本和类别的语料已存在', 409);
      return save(rows.concat(row), body.revision);
    },
    update(id, body) {
      const { rows } = read();
      const index = indexOf(id, rows);
      const row = validate({ ...rows[index], text: body.text, label: body.label });
      if (duplicate(rows, row, index)) fail('相同文本和类别的语料已存在', 409);
      rows[index] = row;
      return save(rows, body.revision);
    },
    remove(id, body) {
      const { rows } = read();
      const index = indexOf(id, rows);
      rows.splice(index, 1);
      return save(rows, body.revision);
    },
    import(body) {
      if (typeof body.content !== 'string') fail('请提供 JSONL 文件内容');
      const { rows } = read();
      const additions = [];
      const errors = [];
      const seen = new Set(rows.filter((r) => typeof r.text === 'string').map(sampleKey));
      let skipped = 0;
      body.content.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        try {
          let row;
          try { row = JSON.parse(line); } catch (e) { fail('不是有效的 JSON'); }
          row = validate(row);
          const key = sampleKey(row);
          if (seen.has(key)) { skipped++; return; }
          seen.add(key);
          additions.push(row);
        } catch (e) {
          errors.push({ line: index + 1, message: e.message });
        }
      });
      // 错误行存在时整批拒绝，用户修正后可重新导入。
      if (errors.length) return { ok: false, error: `导入失败：${errors.length} 行有误，未保存任何记录`, errors, skipped };
      return { ...save(rows.concat(additions), body.revision), added: additions.length, skipped };
    }
  };
}

module.exports = { createSampleStore };
