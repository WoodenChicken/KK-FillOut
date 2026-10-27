/**
 * FillOut 共享 Schema —— 内容脚本 / Side Panel / 解析器 / 训练脚本共用。
 * 纯无依赖全局脚本：挂载到 globalThis.FO，可被 <script>、manifest content_scripts、
 * importScripts 或 Node (vm) 直接加载，禁止引用 chrome.* API。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};

  /**
   * 标准字段描述符。
   * group.type = 'object'（单例）| 'array'（多段经历）
   * field.type = text | textarea | date(YYYY-MM-DD) | month(YYYY-MM) | select | number | region | tel | email
   * ext: true 表示产品文档之外的可扩展字段（民族/婚姻/期望薪资/到岗时间等国内站常见项）
   */
  FO.SCHEMA = {
    basicInfo: {
      label: '基本信息',
      type: 'object',
      fields: [
        { key: 'name', label: '姓名', type: 'text' },
        { key: 'gender', label: '性别', type: 'select', options: ['男', '女'] },
        { key: 'birthDate', label: '出生日期', type: 'date' },
        { key: 'ethnicity', label: '民族', type: 'text', ext: true },
        { key: 'politicalStatus', label: '政治面貌', type: 'select', options: ['中共党员', '中共预备党员', '共青团员', '民主党派', '群众', '无党派人士'] },
        { key: 'nativePlace', label: '籍贯', type: 'text' },
        { key: 'currentCity', label: '现居地', type: 'text' },
        { key: 'phone', label: '手机号码', type: 'tel' },
        { key: 'email', label: '邮箱', type: 'email' },
        { key: 'idCard', label: '身份证号码', type: 'text' },
        { key: 'height', label: '身高(cm)', type: 'number' },
        { key: 'weight', label: '体重(kg)', type: 'number' },
        { key: 'maritalStatus', label: '婚姻状况', type: 'select', options: ['未婚', '已婚', '保密'], ext: true },
        { key: 'educationDegree', label: '最高学历', type: 'select', options: ['博士', '硕士', '本科', '专科', '高中', '中专', '初中', '其他'] },
        { key: 'studyForm', label: '学习形式', type: 'select', options: ['全日制', '非全日制', '自考', '成人高考', '网络教育', '开放大学', '其他'] },
        { key: 'nationality', label: '国籍', type: 'text' },
        { key: 'healthStatus', label: '健康状况', type: 'select', options: ['良好', '一般', '较差'] },
        { key: 'hobbies', label: '兴趣爱好', type: 'textarea' },
        { key: 'specialties', label: '专业特长', type: 'textarea' },
        { key: 'studentOrigin', label: '生源地', type: 'text' },
        { key: 'jobIntention', label: '求职意向', type: 'text' },
        { key: 'expectedSalary', label: '期望薪资', type: 'text', ext: true },
        { key: 'expectedCity', label: '期望城市', type: 'text', ext: true },
        { key: 'availableDate', label: '到岗时间', type: 'date', ext: true },
        { key: 'homeAddress', label: '家庭住址', type: 'text' },
        { key: 'emergencyContactName', label: '紧急联系人姓名', type: 'text' },
        { key: 'emergencyContactRelation', label: '紧急联系人关系', type: 'text' },
        { key: 'emergencyContactPhone', label: '紧急联系人电话', type: 'tel' }
      ]
    },
    family: {
      label: '家庭成员',
      type: 'array',
      fields: [
        { key: 'name', label: '姓名', type: 'text' },
        { key: 'relation', label: '关系', type: 'text' },
        { key: 'workUnit', label: '工作单位', type: 'text' },
        { key: 'jobTitle', label: '职务', type: 'text' },
        { key: 'phone', label: '电话', type: 'tel' }
      ]
    },
    education: {
      label: '教育经历',
      type: 'array',
      fields: [
        { key: 'school', label: '学校', type: 'text' },
        { key: 'degree', label: '学历', type: 'select', options: ['博士', '硕士', '本科', '专科', '高中', '其他'] },
        { key: 'college', label: '学院', type: 'text' },
        { key: 'major', label: '专业', type: 'text' },
        { key: 'startDate', label: '开始时间', type: 'date' },
        { key: 'endDate', label: '结束时间', type: 'date' },
        { key: 'gpa', label: 'GPA', type: 'text' },
        { key: 'rank', label: '排名', type: 'text' },
        { key: 'courses', label: '主修课程', type: 'textarea' }
      ]
    },
    internship: {
      label: '实习经历',
      type: 'array',
      fields: [
        { key: 'company', label: '公司', type: 'text' },
        { key: 'city', label: '所在城市', type: 'text' },
        { key: 'department', label: '部门', type: 'text' },
        { key: 'position', label: '岗位', type: 'text' },
        { key: 'startDate', label: '开始时间', type: 'date' },
        { key: 'endDate', label: '结束时间', type: 'date' },
        { key: 'description', label: '工作内容', type: 'textarea' }
      ]
    },
    work: {
      label: '工作经历',
      type: 'array',
      fields: [
        { key: 'company', label: '公司', type: 'text' },
        { key: 'city', label: '所在城市', type: 'text' },
        { key: 'department', label: '部门', type: 'text' },
        { key: 'position', label: '岗位', type: 'text' },
        { key: 'startDate', label: '开始时间', type: 'date' },
        { key: 'endDate', label: '结束时间', type: 'date' },
        { key: 'leaveReason', label: '离职原因', type: 'text' }
      ]
    },
    project: {
      label: '项目经历',
      type: 'array',
      fields: [
        { key: 'name', label: '项目名称', type: 'text' },
        { key: 'role', label: '角色', type: 'text' },
        { key: 'startDate', label: '开始时间', type: 'date' },
        { key: 'endDate', label: '结束时间', type: 'date' },
        { key: 'techStack', label: '技术栈', type: 'text' },
        { key: 'description', label: '项目描述', type: 'textarea' },
        { key: 'achievement', label: '成果', type: 'textarea' }
      ]
    },
    certificate: {
      label: '证书',
      type: 'array',
      fields: [
        { key: 'name', label: '证书名', type: 'text' },
        { key: 'date', label: '获得时间', type: 'date' },
        { key: 'issuer', label: '颁发机构', type: 'text' },
        { key: 'number', label: '编号', type: 'text' }
      ]
    },
    honor: {
      label: '奖惩',
      type: 'array',
      fields: [
        { key: 'name', label: '名称', type: 'text' },
        { key: 'level', label: '级别', type: 'text' },
        { key: 'date', label: '时间', type: 'date' },
        { key: 'issuer', label: '颁发单位', type: 'text' }
      ]
    },
    skills: {
      label: '技能',
      // 特殊结构：{ items: [{name, level}], selfAssessment: '...' }
      type: 'skills',
      fields: [
        { key: 'name', label: '技能 / 语言', type: 'text' },
        { key: 'level', label: '熟练度', type: 'select', options: ['了解', '一般', '熟练', '精通'] }
      ],
      extras: [
        { key: 'selfAssessment', label: '自我评价', type: 'textarea' }
      ]
    },
    custom: {
      label: '自定义字段',
      type: 'custom',
      fields: []
    }
  };

  FO.DEFAULT_SETTINGS = {
    // 页面上不再默认绘制角标图标（网申界面保持干净）；面板手动填写为主交互。
    // 用户仍可在 Side Panel「设置」里手动开启角标。
    highlight: false,
    autoFillThreshold: 0.85,
    confirmThreshold: 0.5,
    mlEnabled: true,
    ballVisible: true,
    // 拟人化填充节奏：字段之间随机停顿，避免整页字段在同一 tick 内写完全部值
    fillSpeed: 'normal',   // fast | normal | slow
    humanTyping: false     // 逐字符模拟键盘输入（更自然，但明显更慢）
  };

  var GROUP_KEYWORDS = {
    education: ['教育', '学历', '学业'],
    internship: ['实习'],
    work: ['工作经历', '工作经验', '职业经历'],
    project: ['项目'],
    family: ['家庭', '成员', '亲人', '家属', '亲属', '父母', '父母亲', '父亲', '母亲', '配偶', '子女', '家庭成员'],
    certificate: ['证书', '资格证'],
    honor: ['荣誉', '奖项', '奖惩', '获奖'],
    skills: ['技能', '特长']
  };

  function emptyGroup(group, groupKey) {
    if (group.type === 'array') return [];
    if (group.type === 'skills') return { items: [], selfAssessment: '' };
    if (group.type === 'custom') return {};
    var obj = {};
    group.fields.forEach(function (f) { obj[f.key] = ''; });
    return obj;
  }

  /** 生成一份全空但结构完整的 resume */
  FO.emptyResume = function () {
    var resume = {};
    Object.keys(FO.SCHEMA).forEach(function (g) { resume[g] = emptyGroup(FO.SCHEMA[g], g); });
    return resume;
  };

  /** 取某组 schema 定义的字段 key 列表（含 extras），用于识别自定义字段 */
  function schemaFieldKeys(def) {
    var keys = def.fields.map(function (f) { return f.key; });
    (def.extras || []).forEach(function (f) { keys.push(f.key); });
    return keys;
  }

  /**
   * 取某组里「自定义字段」的 key 列表（即不在 schema.fields/extras 中的 key）。
   * - object 组：直接看 resume[gKey] 的 key
   * - array 组：汇总所有段中出现过的自定义 key
   * - skills 组：汇总所有 skill item 中除 name/level 外的 key
   */
  FO.customKeysOf = function (resume, groupKey) {
    var def = FO.SCHEMA[groupKey];
    if (!def || !resume) return [];
    var sk = schemaFieldKeys(def);
    if (def.type === 'object') {
      var node = resume[groupKey];
      if (!node || typeof node !== 'object') return [];
      return Object.keys(node).filter(function (k) { return sk.indexOf(k) === -1; });
    }
    if (def.type === 'array') {
      var arr = resume[groupKey];
      if (!Array.isArray(arr)) return [];
      var set = {};
      arr.forEach(function (row) {
        if (!row || typeof row !== 'object') return;
        Object.keys(row).forEach(function (k) { if (sk.indexOf(k) === -1) set[k] = 1; });
      });
      return Object.keys(set);
    }
    if (def.type === 'skills') {
      var items = (resume.skills && resume.skills.items) || [];
      var s2 = {};
      items.forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        Object.keys(it).forEach(function (k) { if (k !== 'name' && k !== 'level') s2[k] = 1; });
      });
      return Object.keys(s2);
    }
    return [];
  };

  /** 把任意来源（解析器/手填/旧版本）的数据规范成标准 resume；非法输入尽量兜底 */
  FO.normalizeResume = function (input) {
    var resume = FO.emptyResume();
    if (!input || typeof input !== 'object') return resume;
    Object.keys(FO.SCHEMA).forEach(function (g) {
      var def = FO.SCHEMA[g];
      var val = input[g];
      if (val == null) return;
      if (def.type === 'array') {
        if (Array.isArray(val)) {
          resume[g] = val.map(function (item) {
            var row = {};
            def.fields.forEach(function (f) { row[f.key] = stringify(item && item[f.key]); });
            // 保留该段的自定义字段（不在 schema.fields 中的 key）
            if (item && typeof item === 'object') {
              Object.keys(item).forEach(function (k) {
                if (schemaFieldKeys(def).indexOf(k) === -1) row[k] = stringify(item[k]);
              });
            }
            return row;
          }).filter(function (row) {
            // 至少有一个 schema 字段或自定义字段非空才保留该段
            return def.fields.some(function (f) { return row[f.key]; }) ||
              Object.keys(row).some(function (k) {
                return schemaFieldKeys(def).indexOf(k) === -1 && row[k];
              });
          });
        }
      } else if (def.type === 'skills') {
        if (Array.isArray(val)) {
          resume.skills.items = val.map(function (item) {
            var it = { name: stringify(item && item.name), level: stringify(item && item.level) };
            if (item && typeof item === 'object') {
              Object.keys(item).forEach(function (k) {
                if (k !== 'name' && k !== 'level') it[k] = stringify(item[k]);
              });
            }
            return it;
          }).filter(function (it) { return it.name; });
        } else if (val && typeof val === 'object') {
          if (Array.isArray(val.items)) {
            resume.skills.items = val.items.map(function (item) {
              var it = { name: stringify(item && item.name), level: stringify(item && item.level) };
              if (item && typeof item === 'object') {
                Object.keys(item).forEach(function (k) {
                  if (k !== 'name' && k !== 'level') it[k] = stringify(item[k]);
                });
              }
              return it;
            }).filter(function (it) { return it.name; });
          }
          resume.skills.selfAssessment = stringify(val.selfAssessment);
        }
      } else if (def.type === 'custom') {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.keys(val).forEach(function (k) {
            if (k === 'basicInfo' || FO.SCHEMA[k]) return; // 防御：误把整份简历塞进来
            resume.custom[k] = stringify(val[k]);
          });
        }
      } else {
        def.fields.forEach(function (f) {
          var v = stringify(val[f.key]);
          if (v) resume[g][f.key] = v;
        });
        // 保留该组的自定义字段（不在 schema.fields 中的 key）
        if (val && typeof val === 'object') {
          Object.keys(val).forEach(function (k) {
            if (schemaFieldKeys(def).indexOf(k) === -1) resume[g][k] = stringify(val[k]);
          });
        }
      }
    });
    return resume;
  };

  function stringify(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(stringify).filter(Boolean).join('，');
    if (typeof v === 'object') return JSON.stringify(v);
    return '';
  }

  /** resume 是否为空（用于引导用户先录入简历） */
  FO.isResumeEmpty = function (resume) {
    if (!resume) return true;
    return !Object.keys(FO.SCHEMA).some(function (g) {
      var def = FO.SCHEMA[g];
      var v = resume[g];
      if (!v) return false;
      if (def.type === 'array') return v.length > 0;
      if (def.type === 'skills') return (v.items && v.items.length > 0) || !!v.selfAssessment;
      if (def.type === 'custom') return Object.keys(v).length > 0;
      // object 组：任一字段（含自定义）非空即算有内容
      return Object.keys(v).some(function (k) { return v[k]; });
    });
  };

  /** 展平后的可匹配字段 key 列表，如 'basicInfo.name'、'education.school' */
  FO.allMatchKeys = function () {
    var keys = [];
    Object.keys(FO.SCHEMA).forEach(function (g) {
      var def = FO.SCHEMA[g];
      def.fields.forEach(function (f) { keys.push(g + '.' + f.key); });
      (def.extras || []).forEach(function (f) { keys.push(g + '.' + f.key); });
    });
    return keys;
  };

  FO.fieldDef = function (dottedKey) {
    var parts = dottedKey.split('.');
    var g = parts[0], fk = parts[1];
    var def = FO.SCHEMA[g];
    if (!def) return null;
    var all = def.fields.concat(def.extras || []);
    for (var i = 0; i < all.length; i++) if (all[i].key === fk) return all[i];
    return null;
  };

  FO.groupDef = function (groupKey) { return FO.SCHEMA[groupKey] || null; };

  /** 读字段值；数组组需给 segIdx，不给则取第 0 段 */
  FO.getResumeValue = function (resume, dottedKey, segIdx) {
    if (!resume) return '';
    var parts = dottedKey.split('.');
    var g = parts[0], fk = parts[1];
    var def = FO.SCHEMA[g];
    var node = resume[g];
    if (!def || node == null) return '';
    if (def.type === 'array') {
      var idx = segIdx || 0;
      var row = Array.isArray(node) ? (node[idx] || node[0]) : null;
      return row ? stringify(row[fk]) : '';
    }
    if (def.type === 'skills') {
      if (fk === 'selfAssessment') return stringify(node.selfAssessment);
      var it = Array.isArray(node.items) ? (node.items[segIdx || 0] || (node.items[0] || null)) : null;
      return it ? stringify(it[fk]) : '';
    }
    return stringify(node[fk]);
  };

  /** 数组组的可用段数（按简历里实际条数），对象组恒为 1 */
  FO.segmentCount = function (resume, groupKey) {
    if (!resume) return 1;
    var def = FO.SCHEMA[groupKey];
    var v = resume[groupKey];
    if (!def || !v) return 1;
    if (def.type === 'array') return Math.max(1, v.length);
    if (def.type === 'skills') return Math.max(1, (v.items || []).length);
    return 1;
  };

  /** 写字段值（Panel / 解析器用） */
  FO.setResumeValue = function (resume, dottedKey, value, segIdx) {
    var parts = dottedKey.split('.');
    var g = parts[0], fk = parts[1];
    var def = FO.SCHEMA[g];
    if (!def) return;
    var v = stringify(value);
    if (def.type === 'array') {
      if (!Array.isArray(resume[g])) resume[g] = [];
      var idx = segIdx || 0;
      while (resume[g].length <= idx) {
        var row = {};
        def.fields.forEach(function (f) { row[f.key] = ''; });
        resume[g].push(row);
      }
      resume[g][idx][fk] = v;
    } else if (def.type === 'skills') {
      if (!resume[g] || typeof resume[g] !== 'object') resume[g] = { items: [], selfAssessment: '' };
      if (fk === 'selfAssessment') { resume[g].selfAssessment = v; return; }
      if (!Array.isArray(resume[g].items)) resume[g].items = [];
      var i = segIdx || 0;
      while (resume[g].items.length <= i) resume[g].items.push({ name: '', level: '' });
      resume[g].items[i][fk] = v;
    } else if (def.type === 'custom') {
      if (!resume[g] || typeof resume[g] !== 'object') resume[g] = {};
      resume[g][fk] = v;
    } else {
      resume[g][fk] = v;
    }
  };

  /** 判断 key 是否属于数组组（页面上可能出现多段） */
  FO.isArrayKey = function (dottedKey) {
    var g = dottedKey.split('.')[0];
    var def = FO.SCHEMA[g];
    return !!(def && (def.type === 'array' || (def.type === 'skills' && !/selfAssessment$/.test(dottedKey))));
  };

  /** 组上下文关键词（用于祖先节点文本 → 组 boost / 惩罚） */
  FO.GROUP_KEYWORDS = GROUP_KEYWORDS;

  /** 字段分组归属，如 'basicInfo.name' -> 'basicInfo' */
  FO.groupOf = function (dottedKey) { return dottedKey.split('.')[0]; };

  /** 角标编号：1-20 用带圈数字 */
  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  FO.badgeLabel = function (n) {
    return n >= 1 && n <= 20 ? CIRCLED.charAt(n - 1) : String(n);
  };

  /** 值文本预览（悬浮球列表用） */
  FO.valuePreview = function (resume, dottedKey, segIdx) {
    var v = FO.getResumeValue(resume, dottedKey, segIdx);
    if (!v) return '（简历中暂无此字段）';
    return v.length > 42 ? v.slice(0, 42) + '…' : v;
  };
})(typeof self !== 'undefined' ? self : globalThis);
