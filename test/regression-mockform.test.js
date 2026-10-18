/**
 * 回归验证：模拟 mock-form.html 里的关键字段，确保改动没有破坏已有匹配。
 * 运行：node test/regression-mockform.test.js
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

function fakeCtrl(label, ctx, type, opts) {
  return {
    el: {}, kind: 'text', type: type || 'text',
    signals: { labelText: label, placeholder: '', name: '', id: '', ariaLabel: '', dataAttrs: '', optionsText: opts || '' },
    contextText: ctx || '', rowKey: '', documentOrder: 0
  };
}

const settings = { autoFillThreshold: 0.85, confirmThreshold: 0.5 };

// 基本信息区
assert('姓名', FO.matcher.matchAll([fakeCtrl('姓名', '基本信息')], FO.emptyResume(), settings)[0].key, 'basicInfo.name');
assert('性别(select)', FO.matcher.matchAll([fakeCtrl('性别', '基本信息', 'select', '男 女')], FO.emptyResume(), settings)[0].key, 'basicInfo.gender');
assert('手机号码', FO.matcher.matchAll([fakeCtrl('手机号码', '基本信息', 'tel')], FO.emptyResume(), settings)[0].key, 'basicInfo.phone');
assert('身份证号码', FO.matcher.matchAll([fakeCtrl('身份证号码', '基本信息')], FO.emptyResume(), settings)[0].key, 'basicInfo.idCard');
assert('最高学历', FO.matcher.matchAll([fakeCtrl('最高学历', '基本信息', 'select', '博士 硕士 本科')], FO.emptyResume(), settings)[0].key, 'basicInfo.educationDegree');
assert('家庭住址', FO.matcher.matchAll([fakeCtrl('家庭住址', '基本信息')], FO.emptyResume(), settings)[0].key, 'basicInfo.homeAddress');

// 紧急联系人（仍归 basicInfo，因为独立组无 family 上下文）
assert('紧急联系人姓名', FO.matcher.matchAll([fakeCtrl('紧急联系人姓名', '紧急联系人')], FO.emptyResume(), settings)[0].key, 'basicInfo.emergencyContactName');

// 教育经历区
assert('毕业院校', FO.matcher.matchAll([fakeCtrl('毕业院校', '教育经历')], FO.emptyResume(), settings)[0].key, 'education.school');
assert('专业', FO.matcher.matchAll([fakeCtrl('专业', '教育经历')], FO.emptyResume(), settings)[0].key, 'education.major');

// 家庭成员区（mock form 用的是全称）
assert('家庭成员姓名', FO.matcher.matchAll([fakeCtrl('家庭成员姓名', '其他 家庭成员')], FO.emptyResume(), settings)[0].key, 'family.name');
assert('家庭成员工作单位', FO.matcher.matchAll([fakeCtrl('家庭成员工作单位', '其他 家庭成员')], FO.emptyResume(), settings)[0].key, 'family.workUnit');
assert('家庭成员电话', FO.matcher.matchAll([fakeCtrl('家庭成员电话', '其他 家庭成员', 'tel')], FO.emptyResume(), settings)[0].key, 'family.phone');

// 实习/项目
assert('实习公司', FO.matcher.matchAll([fakeCtrl('实习公司', '实习经历')], FO.emptyResume(), settings)[0].key, 'internship.company');
assert('项目名称', FO.matcher.matchAll([fakeCtrl('项目名称', '项目经历')], FO.emptyResume(), settings)[0].key, 'project.name');
assert('自我评价', FO.matcher.matchAll([fakeCtrl('自我评价', '其他')], FO.emptyResume(), settings)[0].key, 'skills.selfAssessment');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
