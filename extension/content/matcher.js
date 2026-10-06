/**
 * 字段匹配引擎。
 * 输入：scanner 产出的控件信号集合；输出：每个控件 -> { key, score, tier, source, candidates, segmentIdx }。
 * 打分流水线：规则词典 -> 特异度仲裁 -> 控件类型提示 -> 组上下文 -> ML 模型融合 -> 分档。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};
  FO.matcher = FO.matcher || {};

  /** 同义词词典。中文按 includes 匹配；纯 ASCII 词按单词边界匹配，避免 name 误吞 companyname */
  var DICT = {
    // ---- basicInfo ----
    'basicInfo.name': ['姓名', '名字', '您的姓名', '申请人姓名', '应聘人', 'full name', 'fullname', 'your name', 'name'],
    'basicInfo.gender': ['性别', 'gender', 'sex'],
    'basicInfo.birthDate': ['出生年月', '出生日期', '出生日期', '生日', '出生日期', 'date of birth', 'birthdate', 'birth date', 'birthday', '出生'],
    'basicInfo.ethnicity': ['民族', 'ethnicity', 'ethnic group'],
    'basicInfo.politicalStatus': ['政治面貌', '政治状态', 'political status', 'political'],
    'basicInfo.nativePlace': ['籍贯', '户口所在地', '户籍所在地', '户籍地址', '户口地址', '户籍', ' hometown', 'birthplace'],
    'basicInfo.currentCity': ['现居地', '现居住地', '现居住城市', '现居城市', '居住地', '居住城市', '常住地', '常居地', '现住址', 'living city', 'current city', 'residence'],
    'basicInfo.phone': ['手机号码', '手机号', '手机', '联系电话', '联系方式', '电话号码', '电话', 'mobile phone', 'mobile', 'cellphone', 'phone number', 'phone', 'tel'],
    'basicInfo.email': ['电子邮箱', '电子邮件', '邮箱地址', '邮箱', 'e-mail', 'email address', 'email'],
    'basicInfo.idCard': ['身份证号码', '身份证件号', '身份证号', '身份证', '证件号码', '证件号', 'id card', 'idcard', 'id number', 'identity number'],
    'basicInfo.height': ['身高', 'height'],
    'basicInfo.weight': ['体重', 'weight'],
    'basicInfo.maritalStatus': ['婚姻状况', '婚姻', 'marital status', 'marital'],
    'basicInfo.jobIntention': ['求职意向', '意向岗位', '意向职位', '应聘岗位', '应聘职位', '期望职位', '期望岗位', '求职岗位', 'position applied', 'desired position', 'job intention', 'target position'],
    'basicInfo.expectedSalary': ['期望薪资', '薪资要求', '期望月薪', '期望工资', '期望待遇', 'expected salary', 'salary expectation'],
    'basicInfo.expectedCity': ['期望工作城市', '期望城市', '意向城市', '期望工作地点', '期望工作地', 'preferred city', 'expected city'],
    'basicInfo.availableDate': ['到岗时间', '可到岗时间', '预计到岗', '入职时间', 'available from', 'available date', 'onboard date'],
    'basicInfo.homeAddress': ['家庭住址', '家庭地址', '家庭所在地', '家庭详细地址', '通讯地址', '通信地址', '联系地址', '详细地址', '家庭', 'home address', 'address'],
    'basicInfo.emergencyContactName': ['紧急联系人姓名', '紧急联系人', '应急联系人', '紧急联络人', 'emergency contact name', 'emergency contact'],
    'basicInfo.emergencyContactRelation': ['与紧急联系人关系', '紧急联系人关系', '与紧急联系人的关系', '与本人关系', 'emergency relation'],
    'basicInfo.emergencyContactPhone': ['紧急联系人电话', '紧急联系人手机', '紧急联系人号码', '紧急联系电话', '紧急联系方式', 'emergency phone'],
    // ---- family ----
    'family.name': ['家庭成员姓名', '成员姓名', '家人姓名', '亲属姓名', 'member name'],
    'family.relation': ['家庭成员关系', '成员关系', '与本人关系', '家庭关系', 'relationship'],
    'family.workUnit': ['家庭成员工作单位', '成员工作单位', '工作单位', '父母单位', '单位名称', 'work unit', 'employer'],
    'family.jobTitle': ['家庭成员职务', '成员职务', '职务', '职位名称', 'job title', 'position'],
    'family.phone': ['家庭成员电话', '成员电话', '联系电话', 'member phone'],
    // ---- education ----
    'education.school': ['毕业院校', '学校名称', '毕业学校', '就读学校', '院校名称', '毕业院系', '院校', '学校', 'university name', 'university', 'college', 'school'],
    'education.degree': ['最高学历', '学历层次', '学历/学位', '学历', '学位', 'degree', 'education level'],
    'education.college': ['所在院系', '院系名称', '学院名称', '院系', '学院', 'faculty', 'department of'],
    'education.major': ['所学专业', '专业名称', '主修专业', '专业', 'major', 'field of study'],
    'education.startDate': ['入学时间', '入学日期', '入学年月', '就读时间', '开始时间', '开始日期', 'start date', 'from'],
    'education.endDate': ['毕业时间', '毕业日期', '毕业年月', '结束时间', '结束日期', 'end date', 'to', 'graduation date'],
    'education.gpa': ['gpa', '绩点'],
    'education.rank': ['专业排名', '成绩排名', '年级排名', '排名', 'class rank', 'ranking'],
    'education.courses': ['主修课程', '主要课程', '核心课程', '所学课程', '主修', 'relevant courses', 'courses'],
    // ---- internship / work ----
    'internship.company': ['实习单位', '实习公司', '实习企业', 'internship company', 'intern company'],
    'work.company': ['工作单位', '公司名称', '所在公司', '工作企业', '任职公司', '单位名称', '公司', '企业名称', 'company name', 'company', 'employer', 'organization'],
    'internship.city': ['实习城市', '实习地点', 'intern city'],
    'work.city': ['工作城市', '工作地点', '所在城市', '工作所在城市', 'job city', 'work location'],
    'internship.department': ['实习部门', 'department'],
    'work.department': ['所在部门', '部门名称', '任职部门', '部门', 'department name', 'department'],
    'internship.position': ['实习岗位', '实习职位', 'internship position', 'intern position'],
    'work.position': ['担任职务', '岗位名称', '任职岗位', '工作岗位', '职位名称', '所任职位', '岗位', '职位', '职务', 'job title', 'position'],
    'internship.startDate': ['实习开始时间', '开始时间', 'start date'],
    'work.startDate': ['工作开始时间', '开始时间', 'start date'],
    'internship.endDate': ['实习结束时间', '结束时间', 'end date'],
    'work.endDate': ['工作结束时间', '结束时间', 'end date'],
    'work.leaveReason': ['离职原因', '辞职原因', 'reason for leaving', 'leaving reason'],
    // ---- project ----
    'project.name': ['项目名称', '项目名字', '项目', 'project name', 'project'],
    'project.role': ['担任角色', '项目角色', '我的角色', '承担角色', '项目职务', 'your role', 'role'],
    'project.startDate': ['项目开始时间', '开始时间', 'start date'],
    'project.endDate': ['项目结束时间', '结束时间', 'end date'],
    'project.techStack': ['技术栈', '使用技术', '技术栈/工具', '开发技术', '相关技术', 'tech stack', 'technologies', 'stack'],
    'project.description': ['项目描述', '项目介绍', '项目简介', '项目内容', 'project description', 'description'],
    'project.achievement': ['项目成果', '主要成果', '项目业绩', '工作业绩', '取得成果', '成果', 'achievement', 'results'],
    // ---- internship/work description ----
    'internship.description': ['实习内容', '实习描述', '实习工作内容', '工作内容', '职责描述', 'internship description'],
    'work.description': ['工作内容', '工作描述', '工作职责', '职责描述', '岗位职责', '工作业绩', 'job description', 'responsibilities'],
    // ---- certificate ----
    'certificate.name': ['证书名称', '资格证书', '证书', 'certification name', 'certificate', 'certification'],
    'certificate.date': ['获得时间', '获得日期', '发证时间', '取证时间', 'date obtained', 'date received'],
    'certificate.issuer': ['颁发机构', '发证机构', '颁发单位', 'issuing authority', 'issuer'],
    'certificate.number': ['证书编号', '证书号', '编号', 'certificate no', 'certificate number'],
    // ---- honor ----
    'honor.name': ['奖项名称', '奖励名称', '获奖名称', '奖项', '获奖情况', '荣誉名称', '奖惩情况', 'award name', 'award', 'honor'],
    'honor.level': ['奖项级别', '获奖级别', '奖励级别', '级别', 'award level', 'level'],
    'honor.date': ['获奖时间', '获得时间', '授予时间', 'date awarded'],
    'honor.issuer': ['颁发单位', '颁奖单位', '授予单位', 'issuer'],
    // ---- skills ----
    'skills.name': ['技能名称', '技能专长', '掌握技能', '技能/语言', '专业技能', '语言能力', '特长', '技能', 'skill', 'language'],
    'skills.level': ['熟练程度', '掌握程度', '技能水平', '熟练度', '语言水平', '水平', 'proficiency', 'skill level'],
    'skills.selfAssessment': ['自我评价', '自我介绍', '个人评价', '个人简介', '自我描述', '个人陈述', 'self evaluation', 'self-assessment', 'about me', 'summary']
  };

  var GENERIC_SINGLE = { 'phone': 'basicInfo.phone', 'email': 'basicInfo.email' };

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[：:：]/g, '')
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/[*＊✱️\s]+$/g, '')
      .trim();
  }

  var ASCII_RE = /^[\x20-\x7e]+$/;

  /** 单个信号文本 vs 单个 pattern 的匹配强度：1.0 全等 / 0.95 前缀 / 0.8 包含 */
  function patternScore(signalText, pattern) {
    var st = norm(signalText);
    var p = norm(pattern);
    if (!st || !p) return 0;
    if (ASCII_RE.test(p)) {
      // ASCII 词按边界匹配
      var re = new RegExp('(^|[^a-z0-9])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');
      if (re.test(st)) {
        var bare = st.replace(/[^a-z0-9]/gi, '');
        return bare === p.replace(/[^a-z0-9]/g, '') ? 1.0 : 0.8;
      }
      return 0;
    }
    if (st === p) return 1.0;
    if (st.indexOf(p) === 0) return 0.95;
    if (st.indexOf(p) !== -1) return 0.8;
    return 0;
  }

  var SIGNAL_WEIGHTS = {
    labelText: 1.0,
    placeholder: 0.92,
    dataAttrs: 0.9,
    name: 0.85,
    ariaLabel: 0.82,
    id: 0.78,
    optionsText: 0.7,
    contextText: 0.5
  };

  /**
   * 对一个控件计算所有 key 的得分。
   * ctrl 由 scanner 产出：{ el, kind, type, signals: {labelText, placeholder, name, id, ariaLabel, dataAttrs, optionsText}, contextText }
   */
  function scoreControl(ctrl) {
    var scores = {}; // key -> {score, matchedPatternLen}
    var keys = Object.keys(DICT);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var patterns = DICT[key];
      var best = 0, bestLen = 0;
      for (var w = 0; w < patterns.length; w++) {
        var pat = patterns[w];
        var sigNames = Object.keys(SIGNAL_WEIGHTS);
        for (var s = 0; s < sigNames.length; s++) {
          var sig = sigNames[s];
          var text = ctrl.signals[sig];
          if (!text) continue;
          var ps = patternScore(sig === 'optionsText' ? text : text, pat);
          if (ps <= 0) continue;
          var sc = ps * SIGNAL_WEIGHTS[sig];
          if (sig === 'contextText') sc *= 0.75;
          if (sc > best) { best = sc; bestLen = norm(pat).length; }
        }
      }
      if (best > 0) scores[key] = { score: Math.min(best, 1), matchedLen: bestLen };
    }
    return scores;
  }

  /** 特异度仲裁：同一控件上，命中更长 pattern 的 key 胜出 */
  function arbitrate(scores) {
    var keys = Object.keys(scores);
    for (var i = 0; i < keys.length; i++) {
      for (var j = i + 1; j < keys.length; j++) {
        var a = keys[i], b = keys[j];
        var la = scores[a].matchedLen, lb = scores[b].matchedLen;
        if (la === lb) continue;
        var winner = la > lb ? a : b, loser = la > lb ? b : a;
        scores[winner].score = Math.min(1, scores[winner].score + 0.08);
        scores[loser].score *= 0.62;
      }
    }
  }

  /** 控件类型提示加分 */
  function typeHints(ctrl, scores) {
    function bump(key, delta) {
      if (scores[key]) scores[key].score = Math.min(1, scores[key].score + delta);
    }
    var t = (ctrl.type || '').toLowerCase();
    if (t === 'tel') bump('basicInfo.phone', 0.18);
    if (t === 'email') bump('basicInfo.email', 0.22);
    if (t === 'number') { bump('basicInfo.height', 0.05); bump('basicInfo.weight', 0.05); }
    if (t === 'date' || t === 'month') {
      ['basicInfo.birthDate', 'basicInfo.availableDate', 'education.startDate', 'education.endDate',
        'internship.startDate', 'internship.endDate', 'work.startDate', 'work.endDate',
        'project.startDate', 'project.endDate', 'certificate.date', 'honor.date'].forEach(function (k) { bump(k, 0.1); });
    }
    var opts = ctrl.signals.optionsText || '';
    if (opts) {
      if (/(^|\s)(男|女)(\s|$)/.test(opts) && opts.length < 40) bump('basicInfo.gender', 0.3);
      if (/中共党员|共青团员|群众|政治面貌/.test(opts)) bump('basicInfo.politicalStatus', 0.3);
      if (/未婚|已婚|离异/.test(opts) && opts.length < 40) bump('basicInfo.maritalStatus', 0.28);
      if (/本科|硕士|博士|专科|大专/.test(opts)) bump('education.degree', 0.3);
      if (/了解|一般|熟练|精通/.test(opts) && opts.length < 40) bump('skills.level', 0.25);
      if (/汉族|回族|满族|壮族/.test(opts) && opts.length < 40) bump('basicInfo.ethnicity', 0.25);
    }
  }

  /** 组上下文：看控件附近容器文本里的组关键词 */
  function contextBoost(ctrl, scores) {
    var ctx = ctrl.contextText || '';
    if (!ctx) return;
    var ctxGroup = null;
    var groups = Object.keys(FO.GROUP_KEYWORDS);
    for (var i = 0; i < groups.length; i++) {
      var kws = FO.GROUP_KEYWORDS[groups[i]];
      for (var j = 0; j < kws.length; j++) {
        if (ctx.indexOf(kws[j]) !== -1) { ctxGroup = groups[i]; break; }
      }
      if (ctxGroup) break;
    }
    if (!ctxGroup) return;
    Object.keys(scores).forEach(function (key) {
      var g = FO.groupOf(key);
      if (g === ctxGroup) scores[key].score = Math.min(1, scores[key].score + 0.12);
      else if (scores[key].score < 0.9) scores[key].score *= 0.88;
    });
  }

  /** ML 融合：FO.ml.predict(signals) -> {key, score} | null */
  function mergeModel(ctrl, scores, prediction) {
    if (!prediction || !prediction.key || !FO.fieldDef(prediction.key)) return;
    var mp = Math.max(0, Math.min(1, prediction.score));
    if (scores[prediction.key]) {
      var rule = scores[prediction.key].score;
      scores[prediction.key].score = Math.min(1, Math.max(rule, mp * 0.95) + (rule > 0.3 && mp > 0.3 ? 0.06 : 0));
      scores[prediction.key].model = true;
    } else if (mp >= 0.5) {
      scores[prediction.key] = { score: mp * 0.9, matchedLen: 0, model: true };
    }
  }

  function tierOf(score, settings) {
    var s = settings || {};
    var auto = s.autoFillThreshold || 0.85;
    var confirm = s.confirmThreshold || 0.5;
    if (score >= auto) return 'auto';
    if (score >= confirm) return 'confirm';
    return 'skip';
  }

  /** 日期对识别：同一行的两个日期控件，前者 start 后者 end */
  function pairDates(controls, results) {
    var rows = {};
    controls.forEach(function (ctrl, i) {
      var row = ctrl.rowKey || '';
      if (!row) return;
      (rows[row] = rows[row] || []).push(i);
    });
    Object.keys(rows).forEach(function (rk) {
      var idxs = rows[rk];
      if (idxs.length !== 2) return;
      var a = results[idxs[0]], b = results[idxs[1]];
      if (!a || !b || a.key === b.key) return;
      function isDateish(r) {
        return /Date$/.test(r.key) || (r.ctrl && (r.ctrl.type === 'date' || r.ctrl.type === 'month' || /时间|日期/.test(r.ctrl.signals.labelText || '')));
      }
      if (isDateish(a) && isDateish(b) && /Date$/.test(a.key) && /Date$/.test(b.key)) {
        var baseA = a.key.replace(/(start|end)Date$/, '');
        var baseB = b.key.replace(/(start|end)Date$/, '');
        if (baseA && baseA === baseB) {
          var first = a.ctrl.documentOrder <= b.ctrl.documentOrder ? a : b;
          var second = first === a ? b : a;
          first.key = baseA + 'startDate';
          second.key = baseB + 'endDate';
          first.score = Math.min(1, first.score + 0.1);
          second.score = Math.min(1, second.score + 0.1);
        }
      }
    });
  }

  /**
   * 主入口：controls -> matches。
   * 每个 match: { id, ctrl, key, score, tier, source, candidates: [{key, score}], segmentIdx }
   */
  FO.matcher.matchAll = function (controls, resume, settings, modelPredictions) {
    var results = [];
    for (var i = 0; i < controls.length; i++) {
      var ctrl = controls[i];
      ctrl.documentOrder = i;
      var scores = scoreControl(ctrl);
      arbitrate(scores);
      typeHints(ctrl, scores);
      contextBoost(ctrl, scores);
      if (modelPredictions && modelPredictions[i]) mergeModel(ctrl, scores, modelPredictions[i]);

      // 站点适配器的强映射（如 data-field-name 直接命中）
      if (ctrl.adapterKey && FO.fieldDef(ctrl.adapterKey)) {
        scores[ctrl.adapterKey] = { score: 1, matchedLen: 99, adapter: true };
      }

      var ranked = Object.keys(scores)
        .map(function (k) { return { key: k, score: scores[k].score }; })
        .filter(function (r) { return r.score > 0.18; })
        .sort(function (a, b) { return b.score - a.score; });

      if (!ranked.length) {
        results.push(null);
        continue;
      }
      var top = ranked[0];
      results.push({
        id: 'm' + i,
        ctrl: ctrl,
        key: top.key,
        score: Math.round(top.score * 1000) / 1000,
        source: scores[top.key].adapter ? 'adapter' : (scores[top.key].model ? 'model+rules' : 'rules'),
        candidates: ranked.slice(0, 3),
        tier: tierOf(top.score, settings),
        segmentIdx: 0
      });
    }

    pairDates(controls, results);
    assignSegments(results, resume);

    return results.filter(Boolean);
  };

  /**
   * 数组组分段：同一 key 的多个控件按「粗粒度容器」（fieldset/section/step 等）分块。
   * 注意不能把 .item/.row 这类逐字段包装层当成分段容器。
   */
  var SEGMENT_CONTAINER_SEL = 'fieldset,section,article,li,tr,dd,table,[class*="step"],[class*="module"],[class*="card"],[class*="experience"],[class*="segment"],[class*="fieldset"],[class*="block"]';

  function assignSegments(results, resume) {
    var byKey = {};
    results.forEach(function (m) {
      if (!m || !FO.isArrayKey(m.key)) return;
      (byKey[m.key] = byKey[m.key] || []).push(m);
    });
    Object.keys(byKey).forEach(function (key) {
      var ms = byKey[key].sort(function (a, b) { return a.ctrl.documentOrder - b.ctrl.documentOrder; });
      var containers = [];
      ms.forEach(function (m) {
        var c = blockAncestor(m.ctrl.el);
        var idx = containers.indexOf(c);
        if (idx === -1) { containers.push(c); idx = containers.length - 1; }
        m.segmentIdx = idx;
      });
      // 段数不能超过简历里的条数：多余的段从 0 开始兜底
      var maxSeg = FO.segmentCount(resume, FO.groupOf(key));
      ms.forEach(function (m) { if (m.segmentIdx >= maxSeg) m.segmentIdx = 0; });
    });
  }

  function blockAncestor(el) {
    if (!el || !el.closest) return null;
    return el.closest(SEGMENT_CONTAINER_SEL);
  }

  FO.matcher.DICT = DICT;
  FO.matcher.norm = norm;
  FO.matcher.patternScore = patternScore;
})(typeof self !== 'undefined' ? self : globalThis);
