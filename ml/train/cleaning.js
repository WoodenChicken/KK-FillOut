/**
 * 数据清洗流水线。
 * 每一步记录 before/after 数量与示例，供可视化面板展示。
 */
'use strict';

/**
 * 执行清洗，返回 { rows, steps }
 * steps 是一个数组，每项 { name, before, after, removed, examples: [{before, after}] }
 */
function clean(rows, keys) {
  const keySet = new Set(keys);
  const steps = [];
  let current = rows.slice();

  function step(name, fn) {
    const before = current.length;
    const out = [];
    const examples = [];
    for (const r of current) {
      const res = fn(r);
      if (res !== null && res !== undefined) {
        out.push(res);
        if (examples.length < 3 && (res.text !== r.text)) {
          examples.push({ before: r.text, after: res.text });
        }
      }
    }
    const after = out.length;
    steps.push({ name, before, after, removed: before - after, examples });
    current = out;
  }

  // 1. 过滤非法行：无 text / 无 label / label 不在类别表中
  step('过滤非法行', (r) => {
    if (!r || typeof r.text !== 'string' || !r.text.trim()) return null;
    if (!r.label || !keySet.has(r.label)) return null;
    return r;
  });

  // 2. 规范化空白：合并连续空白、去首尾
  step('规范化空白', (r) => {
    return { text: String(r.text).replace(/\s+/g, ' ').trim(), label: r.label };
  });

  // 3. ASCII 部分统一小写（特征阶段也会 lower，这里保持一致便于去重）
  step('ASCII 转小写', (r) => {
    const t = r.text.replace(/[A-Z]+/g, (m) => m.toLowerCase());
    return { text: t, label: r.label };
  });

  // 4. 去重：相同 (text, label) 只保留一条
  {
    const seen = new Set();
    const before = current.length;
    const out = [];
    for (const r of current) {
      const k = r.label + '\u0001' + r.text;
      if (!seen.has(k)) { seen.add(k); out.push(r); }
    }
    const after = out.length;
    steps.push({ name: '去重 (text+label)', before, after, removed: before - after, examples: [] });
    current = out;
  }

  // 5. 过滤极端长度：过短（<2）或过长（>200）的文本视为噪点
  step('过滤极端长度', (r) => {
    if (r.text.length < 2 || r.text.length > 200) return null;
    return r;
  });

  return { rows: current, steps };
}

module.exports = { clean };
