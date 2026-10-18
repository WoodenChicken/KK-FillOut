/**
 * Section 消歧验证：家庭成员区的裸「姓名」应命中 family.name，而非 basicInfo.name。
 * 运行：node test/section-disambiguate.test.js
 */
globalThis.window = globalThis;
require('../extension/utils/schema.js');
require('../extension/content/matcher.js');
const FO = globalThis.FO;

let pass = 0, fail = 0;
function assert(label, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + ' => ' + actual + (ok ? '' : ' (expected ' + expected + ')'));
  ok ? pass++ : fail++;
}

function fakeCtrl(label, ctx, type) {
  return {
    el: {},
    kind: 'text',
    type: type || 'text',
    signals: { labelText: label, placeholder: '', name: '', id: '', ariaLabel: '', dataAttrs: '', optionsText: '' },
    contextText: ctx || '',
    rowKey: '',
    documentOrder: 0
  };
}

// 1. 家庭成员区，裸标签「姓名」 -> 必须是 family.name
{
  const ctrl = fakeCtrl('姓名', '家庭成员 家庭成员信息');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('家庭区-姓名->family.name', matches[0].key, 'family.name');
}

// 2. 基本信息区，裸标签「姓名」 -> 必须是 basicInfo.name
{
  const ctrl = fakeCtrl('姓名', '基本信息 个人信息');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('基本信息区-姓名->basicInfo.name', matches[0].key, 'basicInfo.name');
}

// 3. 家庭成员区，标签「申请人姓名」（组特有词） -> 不应被路由走，仍是 basicInfo.name
{
  const ctrl = fakeCtrl('申请人姓名', '家庭成员 家庭成员信息');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('家庭区-申请人姓名->basicInfo.name(不路由)', matches[0].key, 'basicInfo.name');
}

// 4. 家庭成员区，裸标签「电话」 -> family.phone
{
  const ctrl = fakeCtrl('电话', '家庭成员');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('家庭区-电话->family.phone', matches[0].key, 'family.phone');
}

// 5. 工作经历区，裸标签「职务」 -> work.position
{
  const ctrl = fakeCtrl('职务', '工作经历 工作经验');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('工作区-职务->work.position', matches[0].key, 'work.position');
}

// 6. 教育经历区，标签「学历」 -> education.degree
{
  const ctrl = fakeCtrl('学历', '教育经历');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('教育区-学历->education.degree', matches[0].key, 'education.degree');
}

// 7. 无 section 上下文时，裸标签「姓名」 -> basicInfo.name（默认）
{
  const ctrl = fakeCtrl('姓名', '');
  const matches = FO.matcher.matchAll([ctrl], FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  assert('无上下文-姓名->basicInfo.name(默认)', matches[0].key, 'basicInfo.name');
}

// 8. 同一行内有「关系=父亲」字段，同行的「姓名」必须路由到 family.name
//    （即使没有 section 上下文，亲属称谓就是 family 区的确凿证据）
{
  const rowKey = 'row-family-1';
  const ctrls = [
    fakeCtrl('关系', ''),  // 关系字段（标签含"关系"）
    fakeCtrl('姓名', '')   // 姓名字段（裸标签）
  ];
  // 给关系字段的 optionsText 加入亲属称谓，模拟 select 选项
  ctrls[0].signals.optionsText = '父亲 母亲 配偶 子女';
  ctrls[0].rowKey = rowKey;
  ctrls[1].rowKey = rowKey;
  const matches = FO.matcher.matchAll(ctrls, FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  const nameMatch = matches.find(function (m) { return m.ctrl === ctrls[1]; });
  assert('同行有父亲关系-姓名->family.name', nameMatch && nameMatch.key, 'family.name');
}

// 9. 同一行内有「母亲」，同行的「电话」路由到 family.phone
{
  const rowKey = 'row-family-2';
  const ctrls = [
    fakeCtrl('与本人关系', ''),
    fakeCtrl('电话', '')
  ];
  ctrls[0].signals.optionsText = '父亲 母亲 配偶';
  ctrls[0].rowKey = rowKey;
  ctrls[1].rowKey = rowKey;
  const matches = FO.matcher.matchAll(ctrls, FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  const phoneMatch = matches.find(function (m) { return m.ctrl === ctrls[1]; });
  assert('同行有母亲关系-电话->family.phone', phoneMatch && phoneMatch.key, 'family.phone');
}

// 10. 没有亲属称谓的同行「姓名」不应被误路由（保持 basicInfo.name）
{
  const rowKey = 'row-basic-1';
  const ctrls = [
    fakeCtrl('性别', ''),
    fakeCtrl('姓名', '')
  ];
  ctrls[0].signals.optionsText = '男 女';
  ctrls[0].rowKey = rowKey;
  ctrls[1].rowKey = rowKey;
  const matches = FO.matcher.matchAll(ctrls, FO.emptyResume(), { autoFillThreshold: 0.85, confirmThreshold: 0.5 }, null);
  const nameMatch = matches.find(function (m) { return m.ctrl === ctrls[1]; });
  assert('无亲属关系同行-姓名->basicInfo.name(不误路由)', nameMatch && nameMatch.key, 'basicInfo.name');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
