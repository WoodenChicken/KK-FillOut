/**
 * 分段匹配 + 「单位」归属 验证。
 * 运行：node test/segment-assign.test.js
 *
 * 覆盖：
 *  - 两段工作经历 / 家庭成员 / 项目经历 各自落到正确段，而不是都填第一段；
 *  - 无 DOM 结构时按「同一 key 出现次序」分段（回退路径）；
 *  - 裸标签「单位」在实习区归 internship.company，而非 family.workUnit。
 */
globalThis.window = globalThis;
require('../extension/utils/schema.js');
require('../extension/content/matcher.js');
const FO = globalThis.FO;

let pass = 0, fail = 0;
function assert(label, actual, expected) {
  const ok = String(actual) === String(expected);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + ' => ' + actual + (ok ? '' : ' (expected ' + expected + ')'));
  ok ? pass++ : fail++;
}

const settings = { autoFillThreshold: 0.85, confirmThreshold: 0.5 };

function mkEl(parent) { return { parentElement: parent || null }; }
function ctrl(label, ctx, el, opts) {
  return {
    el: el || {}, kind: 'text', type: 'text',
    signals: { labelText: label, placeholder: '', name: '', id: '', ariaLabel: '', dataAttrs: '', optionsText: opts || '' },
    contextText: ctx || '', rowKey: '', documentOrder: 0
  };
}
function resumeWith(group, rows) {
  const r = FO.emptyResume();
  r[group] = rows;
  return r;
}
function find(matches, el) { return matches.find((m) => m.ctrl.el === el); }

// ---- 1. 两段工作经历：结构分段 ----
{
  const root = mkEl(null);
  const segA = mkEl(root), segB = mkEl(root);
  const unitA = mkEl(segA), posA = mkEl(segA);
  const unitB = mkEl(segB), posB = mkEl(segB);
  const ctrls = [ctrl('单位', '工作经历', unitA), ctrl('职位', '工作经历', posA),
                 ctrl('单位', '工作经历', unitB), ctrl('职位', '工作经历', posB)];
  const resume = resumeWith('work', [{ company: 'A', position: 'A' }, { company: 'B', position: 'B' }]);
  const m = FO.matcher.matchAll(ctrls, resume, settings);
  assert('工作经历-第1段单位->work.company#0', find(m, unitA).key + '#' + find(m, unitA).segmentIdx, 'work.company#0');
  assert('工作经历-第2段单位->work.company#1', find(m, unitB).key + '#' + find(m, unitB).segmentIdx, 'work.company#1');
  assert('工作经历-第1段职位->work.position#0', find(m, posA).key + '#' + find(m, posA).segmentIdx, 'work.position#0');
  assert('工作经历-第2段职位->work.position#1', find(m, posB).key + '#' + find(m, posB).segmentIdx, 'work.position#1');
}

// ---- 2. 两段家庭成员：姓名/关系 各归其段 ----
{
  const root = mkEl(null);
  const famA = mkEl(root), famB = mkEl(root);
  const nameA = mkEl(famA), relA = mkEl(famA);
  const nameB = mkEl(famB), relB = mkEl(famB);
  const ctrls = [ctrl('姓名', '家庭成员', nameA), ctrl('关系', '家庭成员', relA),
                 ctrl('姓名', '家庭成员', nameB), ctrl('关系', '家庭成员', relB)];
  const resume = resumeWith('family', [{ name: '父', relation: '父亲' }, { name: '母', relation: '母亲' }]);
  const m = FO.matcher.matchAll(ctrls, resume, settings);
  assert('家庭成员-第1段姓名->family.name#0', find(m, nameA).key + '#' + find(m, nameA).segmentIdx, 'family.name#0');
  assert('家庭成员-第2段姓名->family.name#1', find(m, nameB).key + '#' + find(m, nameB).segmentIdx, 'family.name#1');
  assert('家庭成员-第2段关系->family.relation#1', find(m, relB).key + '#' + find(m, relB).segmentIdx, 'family.relation#1');
}

// ---- 3. 两段项目经验：项目名称各归其段 ----
{
  const root = mkEl(null);
  const pjA = mkEl(root), pjB = mkEl(root);
  const nameA = mkEl(pjA), roleA = mkEl(pjA);
  const nameB = mkEl(pjB), roleB = mkEl(pjB);
  const ctrls = [ctrl('项目名称', '项目经历', nameA), ctrl('角色', '项目经历', roleA),
                 ctrl('项目名称', '项目经历', nameB), ctrl('角色', '项目经历', roleB)];
  const resume = resumeWith('project', [{ name: 'P1' }, { name: 'P2' }]);
  const m = FO.matcher.matchAll(ctrls, resume, settings);
  assert('项目-第1段名称->project.name#0', find(m, nameA).key + '#' + find(m, nameA).segmentIdx, 'project.name#0');
  assert('项目-第2段名称->project.name#1', find(m, nameB).key + '#' + find(m, nameB).segmentIdx, 'project.name#1');
}

// ---- 4. 无 DOM 结构（el 无 parentElement）：回退到出现次序分段 ----
{
  const ctrls = [ctrl('单位', '工作经历', {}), ctrl('单位', '工作经历', {})];
  const resume = resumeWith('work', [{ company: 'A' }, { company: 'B' }]);
  const m = FO.matcher.matchAll(ctrls, resume, settings);
  assert('无结构-第1个单位#0', m[0].key + '#' + m[0].segmentIdx, 'work.company#0');
  assert('无结构-第2个单位#1', m[1].key + '#' + m[1].segmentIdx, 'work.company#1');
}

// ---- 5. 裸标签「单位」在实习区 -> internship.company（不是 family.workUnit）----
{
  const ctrls = [ctrl('单位', '实习经历', {})];
  const m = FO.matcher.matchAll(ctrls, FO.emptyResume(), settings);
  assert('实习区-单位->internship.company', m[0].key, 'internship.company');
}

// ---- 6. 裸标签「工作单位」在实习区 -> internship.company ----
{
  const ctrls = [ctrl('工作单位', '实习经历', {})];
  const m = FO.matcher.matchAll(ctrls, FO.emptyResume(), settings);
  assert('实习区-工作单位->internship.company', m[0].key, 'internship.company');
}

// ---- 7. 裸标签「工作单位」在工作区 -> work.company ----
{
  const ctrls = [ctrl('工作单位', '工作经历', {})];
  const m = FO.matcher.matchAll(ctrls, FO.emptyResume(), settings);
  assert('工作区-工作单位->work.company', m[0].key, 'work.company');
}

// ---- 8. 家庭成员区「工作单位」仍归 family.workUnit ----
{
  const ctrls = [ctrl('工作单位', '家庭成员', {})];
  const m = FO.matcher.matchAll(ctrls, FO.emptyResume(), settings);
  assert('家庭成员区-工作单位->family.workUnit', m[0].key, 'family.workUnit');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
