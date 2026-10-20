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
    'basicInfo.nativePlace': ['籍贯', '户口所在地', '户籍所在地', '户籍地址', '户口地址', '户籍', '生源地区', ' hometown', 'birthplace'],
    'basicInfo.currentCity': ['现居地', '现居住地', '现居住城市', '现居城市', '居住地', '居住城市', '常住地', '常居地', '现住址', 'living city', 'current city', 'residence'],
    'basicInfo.phone': ['手机号码', '手机号', '手机', '联系电话', '联系方式', '电话号码', '电话', 'mobile phone', 'mobile', 'cellphone', 'phone number', 'phone', 'tel'],
    'basicInfo.email': ['电子邮箱', '电子邮件', '邮箱地址', '邮箱', 'e-mail', 'email address', 'email'],
    'basicInfo.idCard': ['身份证号码', '身份证件号', '身份证号', '身份证', '证件号码', '证件号', 'id card', 'idcard', 'id number', 'identity number'],
    'basicInfo.height': ['身高', 'height'],
    'basicInfo.weight': ['体重', 'weight'],
    'basicInfo.maritalStatus': ['婚姻状况', '婚姻', 'marital status', 'marital'],
    'basicInfo.jobIntention': ['求职意向', '意向岗位', '意向职位', '应聘岗位', '应聘职位', '期望职位', '期望岗位', '求职岗位', 'position applied', 'desired position', 'job intention', 'target position'],
    'basicInfo.expectedSalary': ['期望薪资', '薪资要求', '期望月薪', '期望工资', '期望待遇', '期望年薪', 'expected salary', 'salary expectation'],
    'basicInfo.expectedCity': ['期望工作城市', '期望城市', '意向城市', '期望工作地点', '期望工作地', 'preferred city', 'expected city'],
    'basicInfo.availableDate': ['到岗时间', '可到岗时间', '预计到岗', '入职时间', 'available from', 'available date', 'onboard date'],
    'basicInfo.homeAddress': ['家庭住址', '家庭地址', '家庭所在地', '家庭详细地址', '通讯地址', '通信地址', '联系地址', '详细地址', '家庭', 'home address', 'address'],
    'basicInfo.emergencyContactName': ['紧急联系人姓名', '紧急联系人', '应急联系人', '紧急联络人', 'emergency contact name', 'emergency contact'],
    'basicInfo.emergencyContactRelation': ['与紧急联系人关系', '紧急联系人关系', '与紧急联系人的关系', '与本人关系', 'emergency relation'],
    'basicInfo.emergencyContactPhone': ['紧急联系人电话', '紧急联系人手机', '紧急联系人号码', '紧急联系电话', '紧急联系方式', 'emergency phone'],
    'basicInfo.educationDegree': ['最高学历', '学历', '学历层次', '学历/学位', '文化程度', '学位', 'degree', 'education level', 'highest education'],
    'basicInfo.studyForm': ['学习形式', '学习方式', '培养方式', '就读方式', 'study form', 'study mode', 'education type'],
    'basicInfo.nationality': ['国籍', '民族国籍', 'nationality', 'citizenship', 'country'],
    'basicInfo.healthStatus': ['健康状况', '健康情况', '健康状态', '身体状况', 'health status', 'health condition'],
    'basicInfo.hobbies': ['兴趣爱好', '爱好', '兴趣', '特长爱好', 'hobbies', 'interests'],
    'basicInfo.specialties': ['专业特长', '专业技能', '专长', '特长', 'specialties', 'special skills', 'professional skills'],
    'basicInfo.studentOrigin': ['生源地', '生源', '生源所在地', '生源地区', 'student origin', 'source place'],
    // ---- family ----
    // 注意：'姓名'/'电话' 等裸标签同时出现在 basicInfo 与 family 两组，
    // 由 disambiguateBySection 根据 section 上下文裁决归属，避免家庭成员字段被填成自己的。
    'family.name': ['家庭成员姓名', '成员姓名', '家人姓名', '亲属姓名', '姓名', '名字', 'member name'],
    'family.relation': ['家庭成员关系', '成员关系', '与本人关系', '家庭关系', '关系', 'relationship'],
    'family.workUnit': ['家庭成员工作单位', '成员工作单位', '工作单位', '父母单位', '单位名称', '单位', 'work unit', 'employer'],
    'family.jobTitle': ['家庭成员职务', '成员职务', '职务', '职位名称', '职位', 'job title', 'position'],
    'family.phone': ['家庭成员电话', '成员电话', '联系电话', '电话', '手机', '手机号', 'member phone'],
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
    // 注意：裸标签 '单位' / '工作单位' 同时属于实习/工作/家庭成员三组，
    // 由 section 上下文（GROUP_KEYWORDS）与 SEMANTIC_SIBLINGS 的 company 簇裁决归属，
    // 避免把「实习单位」「工作单位」误填成家庭成员的工作单位。
    'internship.company': ['实习单位', '实习公司', '实习企业', '实习工作单位', '工作单位', '单位', 'internship company', 'intern company'],
    'work.company': ['工作单位', '公司名称', '所在公司', '工作企业', '任职公司', '单位名称', '单位', '公司', '企业名称', 'company name', 'company', 'employer', 'organization'],
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

  /**
   * 跨组通用裸标签：同一个 pattern 出现在多个 key 的 DICT 中。
   * 例如 '姓名' 同时属于 basicInfo.name 和 family.name，这类词不能仅凭自身决定归属，
   * 必须结合 section 上下文（disambiguateBySection）裁决。
   */
  var GENERIC_PATTERNS = (function () {
    var count = {};
    Object.keys(DICT).forEach(function (k) {
      DICT[k].forEach(function (p) {
        var np = norm(p);
        if (!np) return;
        count[np] = (count[np] || 0) + 1;
      });
    });
    var gen = {};
    Object.keys(count).forEach(function (p) { if (count[p] > 1) gen[p] = true; });
    return gen;
  })();

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[：:：]/g, '')
      .replace(/（/g, '(').replace(/）/g, ')')
      .replace(/^[*＊✱️\s]+/, '') // 必填星号常渲染在标签前（如 antd Form.Item 自绘标题）
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
    ocrText: 0.9, // 视觉识别：OCR 出的邻近标签文本（几何分配，见 ocr-assign.js）
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
    var scores = {}; // key -> {score, matchedLen, matchedPat}
    var keys = Object.keys(DICT);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var patterns = DICT[key];
      var best = 0, bestLen = 0, bestPat = '';
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
          if (sc > best) { best = sc; bestLen = norm(pat).length; bestPat = norm(pat); }
        }
      }
      if (best > 0) scores[key] = { score: Math.min(best, 1), matchedLen: bestLen, matchedPat: bestPat };
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
      // 性别：男/女 是极强特征（radio/select 均可），即使标签没写"性别"也直接命中
      if (/(^|\s|）)(男|女)(\s|$|）)/.test(opts) || /(^|[^男女])(男|女)([^男女]|$)/.test(opts)) {
        if (!scores['basicInfo.gender']) scores['basicInfo.gender'] = { score: 0.78, matchedLen: 2, matchedPat: '性别' };
        else bump('basicInfo.gender', 0.2);
      }
      if (/中共党员|共青团员|群众|政治面貌/.test(opts)) bump('basicInfo.politicalStatus', 0.3);
      if (/未婚|已婚|离异/.test(opts) && opts.length < 40) bump('basicInfo.maritalStatus', 0.28);
      if (/本科|硕士|博士|专科|大专|中专/.test(opts)) { bump('basicInfo.educationDegree', 0.3); bump('education.degree', 0.2); }
      if (/全日制|非全日制|自考|成人高考|网络教育/.test(opts)) bump('basicInfo.studyForm', 0.3);
      if (/良好|一般|较差|健康/.test(opts) && opts.length < 40) bump('basicInfo.healthStatus', 0.28);
      if (/了解|一般|熟练|精通/.test(opts) && opts.length < 40) bump('skills.level', 0.25);
      // 民族：56个民族选项文本很长，不能用长度限制
      if (/汉族|回族|满族|壮族|维吾尔族|蒙古族|藏族|苗族|彝族|土家族|哈萨克族|傣族|黎族|傈僳族|佤族|畲族|高山族|拉祜族|水族|东乡族|纳西族|景颇族|柯尔克孜族|土族|达斡尔族|仫佬族|羌族|布朗族|撒拉族|毛南族|仡佬族|锡伯族|阿昌族|普米族|塔吉克族|怒族|乌孜别克族|俄罗斯族|鄂温克族|德昂族|保安族|裕固族|京族|塔塔尔族|独龙族|鄂伦春族|赫哲族|门巴族|珞巴族|基诺族/.test(opts)) {
        bump('basicInfo.ethnicity', 0.35);
      }
    }
  }

  /** 从控件的 contextText 推断它所属的 section 组（如「家庭」「教育」「工作」） */
  function detectSectionGroup(ctrl) {
    var ctx = ctrl.contextText || '';
    if (!ctx) return null;
    var groups = Object.keys(FO.GROUP_KEYWORDS);
    for (var i = 0; i < groups.length; i++) {
      var kws = FO.GROUP_KEYWORDS[groups[i]];
      for (var j = 0; j < kws.length; j++) {
        if (ctx.indexOf(kws[j]) !== -1) return groups[i];
      }
    }
    return null;
  }

  /**
   * 组上下文：看控件附近容器文本里的组关键词。
   * 与旧版相比：移除了 score<0.9 才惩罚的例外，跨组字段一律轻罚，
   * 让「家庭区里的姓名」即使和 basicInfo.name 同分也能被裁决。
   */
  function contextBoost(ctrl, scores) {
    var ctxGroup = detectSectionGroup(ctrl);
    if (!ctxGroup) return;
    Object.keys(scores).forEach(function (key) {
      var g = FO.groupOf(key);
      if (g === ctxGroup) scores[key].score = Math.min(1, scores[key].score + 0.15);
      else scores[key].score *= 0.85;
    });
  }

  /**
   * 跨组语义同名字段簇：section 消歧时用于把裸标签路由到正确组。
   * 例如 '姓名' 可能命中 basicInfo.name 或 family.name，由 section 决定。
   */
  var SEMANTIC_SIBLINGS = {
    name: ['basicInfo.name', 'family.name'],
    phone: ['basicInfo.phone', 'family.phone'],
    company: ['family.workUnit', 'work.company', 'internship.company'],
    position: ['family.jobTitle', 'work.position', 'internship.position'],
    degree: ['basicInfo.educationDegree', 'education.degree']
  };

  /** 反查表：key -> 它所属的语义簇名 */
  var SIBLING_CLUSTER_OF = (function () {
    var m = {};
    Object.keys(SEMANTIC_SIBLINGS).forEach(function (c) {
      SEMANTIC_SIBLINGS[c].forEach(function (k) { m[k] = c; });
    });
    return m;
  })();

  /**
   * Section 消歧：当控件所在 section 明确（如「家庭成员」），且当前最高分命中的是
   * 「跨组通用裸标签」（如 '姓名'），则把分数路由到 section 所属组的语义同名字段，
   * 避免家庭成员姓名被填成自己的姓名。
   *
   * 触发条件：
   *  1. detectSectionGroup 返回非 basicInfo 的组；
   *  2. 当前 top key 的组 ≠ section 组；
   *  3. top key 的 matchedPat 是 GENERIC_PATTERNS 中的通用裸标签
   *     （组特有词如 '申请人姓名' 不会被路由，仍归 basicInfo）。
   */
  function disambiguateBySection(ctrl, scores) {
    var ctxGroup = detectSectionGroup(ctrl);
    if (!ctxGroup || ctxGroup === 'basicInfo') return;

    var topKey = null, topScore = 0;
    Object.keys(scores).forEach(function (k) {
      if (scores[k].score > topScore) { topScore = scores[k].score; topKey = k; }
    });
    if (!topKey) return;
    if (FO.groupOf(topKey) === ctxGroup) return; // 已经在正确组

    // top key 的命中 pattern 必须是跨组通用裸标签，才允许路由
    var topPat = scores[topKey].matchedPat || '';
    if (!topPat || !GENERIC_PATTERNS[topPat]) return;

    // 找 top key 所属的语义簇，再在 section 组里找同簇字段
    var cluster = SIBLING_CLUSTER_OF[topKey];
    if (!cluster) return;
    var siblings = SEMANTIC_SIBLINGS[cluster];
    var targetKey = null;
    for (var i = 0; i < siblings.length; i++) {
      if (FO.groupOf(siblings[i]) === ctxGroup) { targetKey = siblings[i]; break; }
    }
    if (!targetKey) return;

    // 把分数转移到 section 组的同名字段（略打折），并惩罚原 top key
    var transfer = topScore * 0.9;
    if (scores[targetKey]) {
      scores[targetKey].score = Math.max(scores[targetKey].score, transfer);
      scores[targetKey].section = true;
    } else {
      scores[targetKey] = { score: transfer, matchedLen: scores[topKey].matchedLen || 0, matchedPat: topPat, section: true };
    }
    scores[topKey].score *= 0.4;
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
      scores[prediction.key] = { score: mp * 0.9, matchedLen: 0, matchedPat: '', model: true };
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
      if (a.dateGroup || b.dateGroup) return; // 日期区间已由 bindDateGroups 处理
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
   * 家庭成员关系联动：同一行（rowKey 相同）内若存在「关系」字段且其标签/选项/已填值
   * 包含父亲/母亲/配偶/子女等亲属称谓，则同行的「姓名」「电话」「工作单位」「职务」
   * 字段强制路由到 family.*，避免被 basicInfo 同名裸标签抢走。
   * 这是比 section 消歧更强的信号——亲属称谓本身就是 family 区的确凿证据。
   */
  var FAMILY_RELATION_HINT = /父亲|母亲|爸爸|妈妈|父|母|配偶|妻子|丈夫|老公|老婆|子女|儿子|女儿|兄|弟|姐|妹|爷爷|奶奶|外公|外婆|岳父|岳母|公公|婆婆/;

  function pairFamilyRelation(controls, results) {
    var rows = {};
    results.forEach(function (m, i) {
      if (!m) return;
      var rk = controls[i].rowKey || '';
      if (!rk) return;
      (rows[rk] = rows[rk] || []).push(i);
    });
    Object.keys(rows).forEach(function (rk) {
      var idxs = rows[rk];
      if (idxs.length < 2) return;
      // 检查该行是否有 family 关系信号（关系字段的标签/选项/值含亲属称谓）
      var hasFamilyRelation = false;
      for (var i = 0; i < idxs.length; i++) {
        var ctrl = controls[idxs[i]];
        var sig = (ctrl.signals.labelText || '') + ' ' + (ctrl.signals.optionsText || '') + ' ' + (ctrl.signals.placeholder || '');
        if (FAMILY_RELATION_HINT.test(sig)) { hasFamilyRelation = true; break; }
      }
      if (!hasFamilyRelation) return;
      // 同行内的 basicInfo 裸标签字段，若 family 有同名字段则强制路由
      var SIBLING_MAP = {
        'basicInfo.name': 'family.name',
        'basicInfo.phone': 'family.phone'
      };
      // workUnit / jobTitle 在 family 里叫 workUnit/jobTitle，basicInfo 没有，所以它们不会误命中 basicInfo
      for (var j = 0; j < idxs.length; j++) {
        var m = results[idxs[j]];
        if (!m) continue;
        var target = SIBLING_MAP[m.key];
        if (target) {
          // 仅当该控件标签是裸标签（姓名/电话）而非组特有词时才路由
          var pat = m.ctrl.signals.labelText || '';
          if (/^(姓名|名字|电话|手机|手机号|联系电话)$/.test(pat.trim())) {
            m.key = target;
            m.score = Math.min(1, m.score + 0.12);
            m.source = 'family-relation';
          }
        }
      }
    });
  }

  /* ---------------- 日期区间（年/月 下拉）成组识别 ----------------
   * 国内 ATS（Moka / 北森等）的「起止时间」常由「年下拉 + 月下拉」两组子控件构成。
   * 子控件自身标签只有"年""月"，单独打分会命中错误字段甚至落空，所以这里把它们聚合成
   * 一个"日期单元"：用单元标签（如"入学时间""起止时间"）整体确定字段，再按
   * 前半 = 开始、后半 = 结束 拆分到 startDate / endDate；单值日期（如"出生年月"）则共用同一字段。
   * 结果以一条 match 表示（携带 dateGroup），由 content.js/filler.js 成组写入。
   */

  // 显式日期区间容器（Moka 的 .month-range-select / .date_info 等）
  var DATE_BOX_SELECTOR = '[class*="month-range"],[class*="date-range"],[class*="dateRange"]' +
    ',[class*="date_info"],[class*="dateInfo"],[class*="range-select"],[class*="daterange"]';

  // 字段行容器：用于把日期子控件限定在同一行内聚类，避免把相邻两个区间并成一个
  var ROW_SELECTOR = 'tr,li,dd,[class*="form-item"],[class*="form_item"],[class*="form-group"]' +
    ',[class*="field-item"],[class*="field_item"],[class*="date"],[class*="time"],[class*="period"],[class*="range"]';

  // "区间型"标签：一个标签同时覆盖开始与结束（如"起止时间""就读时间"）
  var RANGE_LABEL_RE = /起止|时间区间|起至|起始时间|结束时间|就读时间|在职时间|入学时间|离职时间|实习时间|工作时间|项目时间/;

  function isDatePartCtrl(c) {
    if (!c) return false;
    if (c.datePart) return true;
    if (c.el && FO.scanner && FO.scanner.datePartOf) {
      var p = FO.scanner.datePartOf(c.el);
      if (p) { c.datePart = p; return true; }
    }
    return false;
  }

  function dateRowBox(el) { return (el && el.closest) ? el.closest(ROW_SELECTOR) : null; }

  /** 把日期子控件聚成若干单元：先按显式容器，再按同一行内的连续子控件（上限 4 = 年/月 × 起止） */
  function clusterDateParts(controls) {
    var idxs = [];
    for (var i = 0; i < controls.length; i++) if (isDatePartCtrl(controls[i])) idxs.push(i);
    if (idxs.length < 2) return [];
    var used = {}, clusters = [];

    idxs.forEach(function (i) {
      if (used[i]) return;
      var el = controls[i].el;
      var box = (el && el.closest) ? el.closest(DATE_BOX_SELECTOR) : null;
      if (!box) return;
      var members = idxs.filter(function (j) {
        return !used[j] && controls[j].el && controls[j].el.closest &&
          controls[j].el.closest(DATE_BOX_SELECTOR) === box;
      });
      if (members.length < 2) return;
      members.forEach(function (j) { used[j] = 1; });
      clusters.push(members);
    });

    for (var a = 0; a < idxs.length; a++) {
      var i2 = idxs[a];
      if (used[i2]) continue;
      var run = [i2]; used[i2] = 1;
      var rowI = dateRowBox(controls[i2].el);
      for (var b = a + 1; b < idxs.length && run.length < 4; b++) {
        var j2 = idxs[b];
        if (used[j2]) continue;
        var rowJ = dateRowBox(controls[j2].el);
        if (rowI && rowJ && rowI !== rowJ) break; // 换了字段行：不并组
        used[j2] = 1; run.push(j2);
        if (run.length >= 4) break;
      }
      if (run.length >= 2) clusters.push(run);
    }
    return clusters;
  }

  function cleanDateLabel(s) {
    return String(s == null ? '' : s)
      .replace(/[（(][^）)]{0,12}[）)]/g, ' ')
      .replace(/[*＊]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 去掉"年/月/日"这类部件词，只留字段名本体（"就读时间 年" → "就读时间"） */
  function stripDateTokens(s) {
    return cleanDateLabel(s)
      .split(/\s+/)
      .filter(function (w) { return !/^[年月日天]$/.test(w); })
      .join(' ')
      .replace(/[年月日天]\s*$/g, '')
      .replace(/[：:]/g, '')
      .trim();
  }

  function labelQuality(t) {
    return !!t && t.length >= 2 && t.length <= 30 && !/^\d+$/.test(t) && !/\d{4}/.test(t);
  }

  /** 日期单元的标签：优先子控件自身标签，其次行容器内的 label，最后退到区块上下文 */
  function dateGroupLabel(parts) {
    for (var i = 0; i < parts.length; i++) {
      var t = stripDateTokens(parts[i].signals.labelText);
      if (labelQuality(t)) return t;
    }
    var box = dateRowBox(parts[0].el);
    if (box) {
      var labs = box.querySelectorAll('label,.label,[class*="label"],[class*="title"]');
      for (var j = 0; j < labs.length; j++) {
        if (labs[j].querySelector('select,input,textarea')) continue;
        var lt = stripDateTokens(labs[j].textContent);
        if (labelQuality(lt)) return lt;
      }
    }
    var ct = stripDateTokens(parts[0].contextText);
    return labelQuality(ct) ? ct : '';
  }

  /** 用一个"标签"去词典里找最合适的字段 key（全等/前缀优先，其次更长的 pattern） */
  function labelMatchKey(label) {
    if (!label) return null;
    var bestKey = null, bestScore = 0, bestLen = 0;
    Object.keys(DICT).forEach(function (key) {
      DICT[key].forEach(function (pat) {
        var ps = patternScore(label, pat);
        if (ps <= 0) return;
        var len = norm(pat).length;
        if (ps > bestScore || (ps === bestScore && len > bestLen)) {
          bestScore = ps; bestLen = len; bestKey = key;
        }
      });
    });
    return bestKey ? { key: bestKey, score: bestScore } : null;
  }

  function hasDatePair(groupKey) {
    var def = FO.SCHEMA[groupKey];
    if (!def || !def.fields) return false;
    var keys = def.fields.map(function (f) { return f.key; });
    return keys.indexOf('startDate') !== -1 && keys.indexOf('endDate') !== -1;
  }

  /** 由标签推出日期字段：起止 → start+end；单值 → 单个字段 */
  function resolveDateKeys(label, ctxCtrl) {
    var hit = labelMatchKey(label);
    if (hit) {
      var g = FO.groupOf(hit.key);
      if (/startDate$/.test(hit.key)) return { startKey: hit.key, endKey: g + '.endDate', score: hit.score };
      if (/endDate$/.test(hit.key)) return { startKey: g + '.startDate', endKey: hit.key, score: hit.score };
      return { singleKey: hit.key, score: hit.score };
    }
    if (RANGE_LABEL_RE.test(label || '')) {
      var sec = detectSectionGroup(ctxCtrl);
      if (sec && hasDatePair(sec)) return { startKey: sec + '.startDate', endKey: sec + '.endDate', score: 0.88 };
    }
    return null;
  }

  /** 同一行内的"至今"复选框（区间结束为"至今"时勾选它） */
  function findUntilBox(controls, partEl) {
    var box = dateRowBox(partEl) || (partEl && partEl.parentElement);
    if (!box) return null;
    for (var i = 0; i < controls.length; i++) {
      var c = controls[i];
      if (!c || c.kind !== 'checkbox' || !c.el) continue;
      if (!box.contains(c.el)) continue;
      var t = norm((c.signals.labelText || '') + ' ' + (c.signals.name || ''));
      if (/至今|现在|present|now/.test(t)) return c.el;
    }
    return null;
  }

  function bindDateGroups(controls, results, settings) {
    var clusters = clusterDateParts(controls);
    if (!clusters.length) return;
    clusters.forEach(function (idxs) {
      var parts = idxs.map(function (i) { return controls[i]; });
      var label = dateGroupLabel(parts);
      var keys = resolveDateKeys(label, parts[0]);
      if (!keys) return;

      // 单元内 >=2 个"年"部件（或部件数 >=3）视为区间（开始+结束），否则是单值日期
      var yearCount = parts.filter(function (c) { return c.datePart === 'year'; }).length;
      var isRange = keys.singleKey ? false : (yearCount >= 2 || parts.length >= 3);

      var half = Math.floor(parts.length / 2);
      var plan = [], ok = true;
      parts.forEach(function (c, k) {
        var key = isRange ? (k < half ? keys.startKey : keys.endKey) : (keys.singleKey || keys.startKey);
        if (!key) { ok = false; return; }
        plan.push({ el: c.el, key: key, datePart: c.datePart });
      });
      if (!ok || !plan.length) return;

      var score = keys.score || 0.9;
      // 用首个子控件的位置承载整组匹配，其余置空：保持 results 与 controls 索引一一对应，
      // 否则后续 pairDates / pairFamilyRelation / assignSegments 按索引取 controls 会错位甚至崩溃。
      results[idxs[0]] = {
        id: 'dg' + idxs.join('_'),
        ctrl: parts[0],
        key: plan[0].key,
        score: Math.round(score * 1000) / 1000,
        source: 'date-range',
        candidates: plan.map(function (p) { return { key: p.key, score: score }; }),
        tier: tierOf(score, settings),
        segmentIdx: 0,
        dateGroup: { parts: plan, untilEl: findUntilBox(controls, parts[0].el), label: label, isRange: isRange }
      };
      for (var t = 1; t < idxs.length; t++) results[idxs[t]] = null;
    });
  }

  /**
   * 主入口：controls -> matches。
   * 每个 match: { id, ctrl, key, score, tier, source, candidates: [{key, score}], segmentIdx }
   */
  FO.matcher.matchAll = function (controls, resume, settings, modelPredictions) {
    // 把简历中各组的自定义字段注册进 DICT，字段名本身作为匹配关键词
    // （例如 basicInfo.wechat -> 用「微信号」去匹配页面标签）
    if (resume) {
      Object.keys(FO.SCHEMA).forEach(function (gKey) {
        var def = FO.SCHEMA[gKey];
        if (def.type === 'custom') return; // 全局 custom 组单独处理
        var ckeys = FO.customKeysOf(resume, gKey);
        ckeys.forEach(function (ck) {
          var dkey = gKey + '.' + ck;
          // 用字段名 + 常见变体做匹配词
          DICT[dkey] = [ck];
        });
      });
      // 全局自定义字段
      Object.keys(resume.custom || {}).forEach(function (ck) {
        DICT['custom.' + ck] = [ck];
      });
    }

    var results = [];
    // radio 组去重：同组多个 radio 共享标签和选项，只需匹配一次，避免列表出现重复行
    var seenRadioGroups = new Set();
    for (var i = 0; i < controls.length; i++) {
      var ctrl = controls[i];
      ctrl.documentOrder = i;
      if (ctrl.kind === 'radio' && ctrl.radioGroup && ctrl.radioGroup.length > 1) {
        var gKey = ctrl.el.name ||
          (ctrl.radioGroup[0] && (ctrl.radioGroup[0].name || ctrl.radioGroup[0].id)) ||
          '__radio_grp_' + i;
        if (seenRadioGroups.has(gKey)) continue;
        seenRadioGroups.add(gKey);
      }
      var scores = scoreControl(ctrl);
      arbitrate(scores);
      typeHints(ctrl, scores);
      contextBoost(ctrl, scores);
      disambiguateBySection(ctrl, scores);
      if (modelPredictions && modelPredictions[i]) mergeModel(ctrl, scores, modelPredictions[i]);

      // 站点适配器的强映射（如 data-field-name 直接命中）
      if (ctrl.adapterKey && FO.fieldDef(ctrl.adapterKey)) {
        scores[ctrl.adapterKey] = { score: 1, matchedLen: 99, matchedPat: '__adapter__', adapter: true };
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
        source: scores[top.key].adapter ? 'adapter' : (scores[top.key].section ? 'section-routed' : (scores[top.key].model ? 'model+rules' : 'rules')),
        candidates: ranked.slice(0, 3),
        tier: tierOf(top.score, settings),
        segmentIdx: 0
      });
    }

    bindDateGroups(controls, results, settings);
    pairDates(controls, results);
    pairFamilyRelation(controls, results);
    assignSegments(results, resume);

    return results.filter(Boolean);
  };

  /**
   * 数组组分段：把同一「组」的多段控件切分到各自的段。
   *
   * 旧实现按单个 key 分组，并用固定的容器选择器（table / class*=block 等）找 block 祖先：
   *   1) 找不到容器时全部落到第 0 段（两段工作经历都填到了第一段）；
   *   2) 选择器过于宽泛时常返回包住「所有段」的大容器，同样把多段压成一段。
   *
   * 新实现按「组」整体计算：
   *   - 结构分段：取所有控件的最深公共祖先（LCA），LCA 之下的直接子节点即一段；
   *   - 结构无法区分时退回「同一 key 的出现次序」分段（第 n 次出现 -> 第 n 段）。
   */
  function ancestorPath(node, limit) {
    var path = [], cur = node, n = 0;
    while (cur && n < (limit || 30)) { path.push(cur); cur = cur.parentElement; n++; }
    return path;
  }

  function lowestCommonAncestor(nodes) {
    var valid = nodes.filter(Boolean);
    if (!valid.length) return null;
    if (valid.length === 1) return valid[0].parentElement || valid[0];
    var path = ancestorPath(valid[0]);
    for (var i = 1; i < valid.length; i++) {
      var p = ancestorPath(valid[i]);
      var j = 0;
      while (j < path.length && j < p.length && path[j] === p[j]) j++;
      path = path.slice(0, j);
      if (!path.length) return null;
    }
    return path.length ? path[path.length - 1] : null;
  }

  /** 控件所在段节点 = 从控件向上、LCA（不含）之下的那一层节点 */
  function segmentNodeOf(el, lca) {
    if (!el) return null;
    var cur = el, prev = el;
    while (cur && cur !== lca) { prev = cur; cur = cur.parentElement; }
    return cur === lca ? prev : null;
  }

  /** 结构分段：返回每个匹配的段号；无法结构区分时返回 null */
  function structuralIndices(ms) {
    var els = ms.map(function (m) { return m.ctrl && m.ctrl.el; });
    var lca = lowestCommonAncestor(els);
    if (!lca) return null;
    var order = [], idxOf = new Map(), indices = [];
    for (var i = 0; i < ms.length; i++) {
      var node = segmentNodeOf(els[i], lca);
      if (!node) return null;
      var k = idxOf.get(node);
      if (k === undefined) { k = order.length; order.push(node); idxOf.set(node, k); }
      indices.push(k);
    }
    return { indices: indices, count: order.length };
  }

  /** 次序分段：同一 key 的第 n 次出现 -> 第 n 段 */
  function ordinalIndices(ms) {
    var counter = {}, indices = [];
    ms.forEach(function (m) {
      var c = counter[m.key] || 0;
      counter[m.key] = c + 1;
      indices.push(c);
    });
    return indices;
  }

  function assignSegments(results, resume) {
    var byGroup = {};
    results.forEach(function (m) {
      if (!m || !FO.isArrayKey(m.key)) return;
      var g = FO.groupOf(m.key);
      (byGroup[g] = byGroup[g] || []).push(m);
    });
    Object.keys(byGroup).forEach(function (g) {
      var ms = byGroup[g].sort(function (a, b) { return a.ctrl.documentOrder - b.ctrl.documentOrder; });
      var maxSeg = Math.max(1, FO.segmentCount(resume, g));

      var indices = null;
      var s = structuralIndices(ms);
      // 结构结果可信的条件：确实切出多段（>=2）、不超过简历段数、且存在「同段多字段」的分组
      if (s && s.count >= 2 && s.count <= maxSeg && s.count < ms.length) {
        indices = s.indices;
      } else {
        indices = ordinalIndices(ms);
      }

      ms.forEach(function (m, i) {
        var idx = indices[i] || 0;
        if (idx >= maxSeg) idx = maxSeg - 1; // 页面段数多于简历：落到最后一段，避免全挤到第 0 段
        m.segmentIdx = idx;
      });
    });
  }

  FO.matcher.DICT = DICT;
  FO.matcher.norm = norm;
  FO.matcher.patternScore = patternScore;
})(typeof self !== 'undefined' ? self : globalThis);
