/**
 * 站点适配器。通用逻辑走公共引擎（matcher/filler），站点差异走 adapter。
 * 每个 adapter 暴露：
 *   match(url) -> boolean
 *   getFields() -> [{dataKey, key}]  站点私有字段标记 → 标准 key 的强映射
 *   fillField(ctrl, value) -> result | undefined   特殊控件（自定义日期弹窗等）的定制填充
 *   transformValue(key, value, signalText) -> value  语义变换（如英文姓名拆分）
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};

  function mapDataAttr(el, attrs) {
    for (var i = 0; i < attrs.length; i++) {
      var v = el.getAttribute && el.getAttribute(attrs[i]);
      if (v) return v;
    }
    return '';
  }

  /** 通用：日期类 input 的只读弹窗选择器兜底 —— 直接赋值 + 事件，多数 Vue/React 组件能接收 */
  function genericDateFill(ctrl, value) {
    return FO.filler.fillControl(ctrl, value);
  }

  /** 站点私有字段标记 → 标准 key：先查直查表，再按 'group.field' / 'basicInfo.field' 试探 */
  function directKey(v) {
    if (!v) return '';
    v = String(v).trim();
    if (FO.DIRECT_KEY_MAP[v]) return FO.DIRECT_KEY_MAP[v];
    var full = v.indexOf('.') > 0 ? v : 'basicInfo.' + v;
    return FO.fieldDef(full) ? full : '';
  }

  var ADAPTERS = [
    {
      id: 'beisen',
      label: '北森 Beisen',
      match: function (url) { return /https?:\/\/([^/]*\.)?beisen\.(com|cn)/i.test(url); },
      // 北森：Vue 动态渲染 + 分步表单 + 自定义日期弹窗
      getFields: function () {
        return [
          { dataKey: 'data-field-name', key: '@direct' },
          { dataKey: 'data-v-alias', key: '@direct' },
          { dataKey: 'data-automation-id', key: '@direct' }
        ];
      },
      resolveKey: function (ctrl) {
        var el = ctrl.el;
        return directKey(mapDataAttr(el, ['data-field-name', 'data-v-alias', 'data-automation-id']));
      },
      fillField: function (ctrl, value) {
        if (ctrl.kind === 'date') return genericDateFill(ctrl, value);
        return undefined; // 其余走通用引擎
      }
    },
    {
      id: 'moka',
      label: 'Moka',
      match: function (url) { return /https?:\/\/([^/]*\.)?mokahr\.com/i.test(url); },
      // Moka：React，字段常带 data-field-name；"添加教育经历"多段按钮 → 通用引擎靠重扫描覆盖
      getFields: function () {
        return [{ dataKey: 'data-field-name', key: '@direct' }];
      },
      resolveKey: function (ctrl) {
        return directKey(mapDataAttr(ctrl.el, ['data-field-name']));
      },
      expandAddButtons: function () {
        // 自动展开 "添加教育经历 / 添加工作经历 / 添加项目经历" 折叠块
        var btns = document.querySelectorAll('button, a, [role="button"], [class*="add"]');
        var n = 0;
        btns.forEach(function (b) {
          var t = (b.textContent || '').trim();
          if (t && t.length < 16 && /^(添加|新增|\+ ?添加)/.test(t) && /(教育|工作|项目|实习|经历|证书)/.test(t)) {
            b.click(); n++;
          }
        });
        return n;
      },
      fillField: function (ctrl, value) { return undefined; }
    },
    {
      id: 'zhilian',
      label: '智联招聘',
      match: function (url) { return /https?:\/\/([^/]*\.)?zhaopin\.com/i.test(url); },
      getFields: function () { return []; },
      resolveKey: function (ctrl) { return ''; },
      fillField: function (ctrl, value) {
        // 智联：期望薪资/到岗时间为枚举下拉，通用 select 文本匹配即可；无需特判
        return undefined;
      }
    },
    {
      id: 'boss',
      label: 'BOSS直聘',
      match: function (url) { return /https?:\/\/([^/]*\.)?zhipin\.com/i.test(url); },
      getFields: function () { return []; },
      resolveKey: function (ctrl) { return ''; },
      // BOSS：聊天式填写，大量 contenteditable —— 通用 contenteditable 分支负责
      fillField: function (ctrl, value) { return undefined; }
    },
    {
      id: 'phoenix',
      label: 'Phoenix（海外校招）',
      match: function (url) { return /https?:\/\/([^/]*\.)?(phoenix|applyphoenix)[^/]*\.(com|org|io|net)/i.test(url) || /phoenix\.[a-z]+\/apply/i.test(url); },
      getFields: function () { return []; },
      resolveKey: function (ctrl) { return ''; },
      transformValue: function (key, value, signalText) {
        var s = (signalText || '').toLowerCase();
        var parts = String(value).trim().split(/\s+/);
        if (/first[- _]?name|given[- _]?name/.test(s)) return parts[0] || value;
        if (/last[- _]?name|family[- _]?name|sur[- _]?name/.test(s)) return parts.length > 1 ? parts.slice(1).join(' ') : value;
        return value;
      },
      fillField: function (ctrl, value) { return undefined; }
    }
  ];

  FO.adapters = {
    list: ADAPTERS,
    pick: function (url) {
      for (var i = 0; i < ADAPTERS.length; i++) if (ADAPTERS[i].match(url)) return ADAPTERS[i];
      return null;
    }
  };

  /** 站点私有字段标记 → 标准 key 的通用直查表（adapter 共用） */
  FO.DIRECT_KEY_MAP = {
    name: 'basicInfo.name', username: 'basicInfo.name', realname: 'basicInfo.name', xm: 'basicInfo.name',
    sex: 'basicInfo.gender', gender: 'basicInfo.gender', xb: 'basicInfo.gender',
    phone: 'basicInfo.phone', mobile: 'basicInfo.phone', shouji: 'basicInfo.phone', tel: 'basicInfo.phone',
    email: 'basicInfo.email', mail: 'basicInfo.email', yx: 'basicInfo.email',
    birthday: 'basicInfo.birthDate', birth: 'basicInfo.birthDate', csrq: 'basicInfo.birthDate',
    idcard: 'basicInfo.idCard', idCard: 'basicInfo.idCard', sfz: 'basicInfo.idCard',
    school: 'education.school', major: 'education.major', zy: 'education.major',
    degree: 'education.degree', xl: 'education.degree',
    company: 'work.company', position: 'work.position', department: 'work.department',
    address: 'basicInfo.homeAddress', jg: 'basicInfo.nativePlace', native: 'basicInfo.nativePlace',
    emergency: 'basicInfo.emergencyContactName', emergencyContact: 'basicInfo.emergencyContactName',
    salary: 'basicInfo.expectedSalary', expectedSalary: 'basicInfo.expectedSalary',
    jobIntention: 'basicInfo.jobIntention', desiredPosition: 'basicInfo.jobIntention'
  };
})(typeof self !== 'undefined' ? self : globalThis);
