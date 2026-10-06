/**
 * 简历文本 → 标准字段抽取器（纯本地正则 + 分节启发式）。
 * 输入：从 PDF/DOCX/MD 提取的纯文本；输出：resume.json 结构。
 * 适用国内简历常见版式：单列 label: value、分节标题（教育经历/实习经历/工作经历/项目经历…）。
 */
(function (root) {
  'use strict';
  var FO = root.FO = root.FO || {};

  var SECTION_PATTERNS = [
    { group: 'education', re: /^(教育经历|教育背景|教育|学习经历|学业情况|教育培训)$/ },
    { group: 'internship', re: /^(实习经历|实习经验|实习实践|实习|实践经历|校内实践)$/ },
    { group: 'work', re: /^(工作经历|工作经验|职业经历|工作背景|任职经历|工作)$/ },
    { group: 'project', re: /^(项目经历|项目经验|项目实践|项目)$/ },
    { group: 'family', re: /^(家庭成员|家庭情况|家庭成员情况|主要家庭成员|家庭关系)$/ },
    { group: 'certificate', re: /^(证书|证书资格|资格证书|技能证书|获得证书|持证情况)$/ },
    { group: 'honor', re: /^(奖惩情况|荣誉奖项|获奖情况|所获奖励|荣誉|奖励|奖项|校园荣誉)$/ },
    { group: 'skills', re: /^(技能特长|专业技能|技能水平|语言能力|技能证书|个人技能|IT技能|技能|计算机技能|语言水平)$/ },
    { group: 'summary', re: /^(自我评价|自我介绍|个人评价|个人优势|个人简介|职业总结|综合评价)$/ },
    { group: 'basicInfo', re: /^(基本信息|个人资料|个人信息|联系方式|基础信息|个人基本信息)$/ }
  ];

  function isSectionHeading(line) {
    var t = line.replace(/[\s：:•·—\-|]+$/g, '').trim();
    if (!t || t.length > 14) return null;
    for (var i = 0; i < SECTION_PATTERNS.length; i++) {
      if (SECTION_PATTERNS[i].re.test(t)) return SECTION_PATTERNS[i].group;
    }
    return null;
  }

  /** 按分节标题把文本切成段：[{group|null, lines:[]}] */
  function splitSections(lines) {
    var sections = [];
    var cur = { group: null, lines: [] };
    lines.forEach(function (ln) {
      var g = isSectionHeading(ln);
      if (g) {
        if (cur.lines.length) sections.push(cur);
        cur = { group: g, lines: [] };
      } else {
        cur.lines.push(ln);
      }
    });
    if (cur.lines.length) sections.push(cur);
    return sections;
  }

  var RE = {
    phone: /(?:\+?86[-\s—]?)?(1[3-9]\d{9})/,
    email: /([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/,
    idCard: /([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])/,
    range: /(\d{4})\s*[年.\-/]?\s*(\d{1,2})?\s*[月]?\s*[-—~至到–]\s*(\d{4}|至今|现在|迄今|present|now)\s*[年.\-/]?\s*(\d{1,2})?\s*[月]?/i,
    gender: /性\s*别[\s:：]*\s*(男|女)/,
    birth: /(?:出生年月|出生日期|生日|出\s*生)[\s:：]*\s*(\d{4})\s*[年.\-/]\s*(\d{1,2})(?:\s*[月.\-/]\s*(\d{1,2}))?/,
    height: /身\s*高[\s:：]*\s*(\d{2,3})/,
    weight: /体\s*重[\s:：]*\s*(\d{2,3})/,
    political: /(?:政治面貌|政治状态|党派)[\s:：]*\s*([^\s,，。;；|]+)/,
    nativePlace: /(?:籍贯|户籍|户口|家乡)[\s:：]*\s*([^\s,，。;；|]{2,20})/,
    currentCity: /(?:现居|现住|居住地|现居住|常驻地|常住地|所在城市|现所在地)[\s:：]*\s*([^\s,，。;；|]{2,20})/,
    ethnicity: /民\s*族[\s:：]*\s*([\u4e00-\u9fa5]{1,8}族?)/,
    marital: /(?:婚姻状况|婚否|婚姻)[\s:：]*\s*(未婚|已婚|离异|保密)/,
    name: /姓\s*名[\s:：]*\s*([\u4e00-\u9fa5·]{2,4})/,
    jobIntention: /(?:求职意向|意向岗位|意向职位|应聘岗位|应聘职位|期望职位|期望岗位|求职岗位)[\s:：]*\s*([^\n，,;；]{2,30})/,
    expectedSalary: /(?:期望薪资|薪资要求|期望月薪|期望工资|期望待遇)[\s:：]*\s*([^\n，,;；]{2,20})/,
    expectedCity: /(?:期望城市|意向城市|期望工作地|期望工作城市|期望地点)[\s:：]*\s*([^\s,，。;；|]{2,20})/,
    availableDate: /(?:到岗时间|可到岗时间|入职时间)[\s:：]*\s*(\d{4}\s*[年.\-/]\s*\d{1,2}|随时|[^\n，,;；]{2,10})/,
    homeAddress: /(?:家庭住址|家庭地址|通讯地址|通信地址|联系地址|住址)[\s:：]*\s*([^\n，,;；]{4,50})/,
    emergencyName: /(?:紧急联系人|应急联系人|紧急联络人)(?:姓名)?[\s:：]*\s*([\u4e00-\u9fa5·A-Za-z]{2,10})/,
    emergencyRel: /(?:与(?:紧急)?联系人关系|紧急联系人关系|与本人关系)[\s:：]*\s*([\u4e00-\u9fa5]{1,6})/,
    emergencyPhone: /紧急(?:联系人)?(?:电话|手机|号码|方式)[\s:：]*\s*((?:\+?86[-\s—]?)?1[3-9]\d{9})/,
    school: /[\u4e00-\u9fa5]{2,14}(?:大学|学院|学校)|[\w\s&.]{4,40}(?:University|College|Institute|School)/i,
    degree: /(博士|硕士研究生|硕士|MBA|研究生|本科|大专|专科|高中|中专)/,
    relation: /(父亲|母亲|爸爸|妈妈|父|母|兄|弟|姐|妹|哥哥|姐姐|弟弟|妹妹|丈夫|妻子|配偶|爷爷|奶奶|外公|外婆|儿子|女儿)/
  };

  function normalizeMonth(y, m, d) {
    if (!y) return '';
    var out = y;
    if (m) out += '-' + (m.length === 1 ? '0' + m : m);
    if (d) out += '-' + (d.length === 1 ? '0' + d : d);
    return out;
  }

  function labelValue(line, labels) {
    for (var i = 0; i < labels.length; i++) {
      var re = new RegExp(labels[i] + '[\\s:：]*\\s*([^\\n，,;；|]{1,50})');
      var m = line.match(re);
      if (m) return m[1].trim();
    }
    return '';
  }

  /** 主入口 */
  FO.extractor = {
    parse: function (text) {
      var resume = FO.emptyResume();
      var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/\s+$/g, ''); });
      var flat = lines.join('\n');

      // ---------- 基本信息（全文扫描 label） ----------
      var m;
      if ((m = flat.match(RE.name))) resume.basicInfo.name = m[1];
      if ((m = flat.match(RE.gender))) resume.basicInfo.gender = m[1];
      if ((m = flat.match(RE.birth))) resume.basicInfo.birthDate = normalizeMonth(m[1], m[2]);
      if ((m = flat.match(RE.ethnicity)) && /族$/.test(m[1])) resume.basicInfo.ethnicity = m[1];
      if ((m = flat.match(RE.political))) resume.basicInfo.politicalStatus = m[1];
      if ((m = flat.match(RE.nativePlace))) resume.basicInfo.nativePlace = m[1];
      if ((m = flat.match(RE.currentCity))) resume.basicInfo.currentCity = m[1];
      if ((m = flat.match(RE.phone))) resume.basicInfo.phone = m[1];
      if ((m = flat.match(RE.email))) resume.basicInfo.email = m[1];
      if ((m = flat.match(RE.idCard))) resume.basicInfo.idCard = m[1];
      if ((m = flat.match(RE.height))) resume.basicInfo.height = m[1];
      if ((m = flat.match(RE.weight))) resume.basicInfo.weight = m[1];
      if ((m = flat.match(RE.marital))) resume.basicInfo.maritalStatus = m[1];
      if ((m = flat.match(RE.jobIntention))) resume.basicInfo.jobIntention = m[1];
      if ((m = flat.match(RE.expectedSalary))) resume.basicInfo.expectedSalary = m[1];
      if ((m = flat.match(RE.expectedCity))) resume.basicInfo.expectedCity = m[1];
      if ((m = flat.match(RE.availableDate)) && !/^\d{4}/.test(m[1])) resume.basicInfo.availableDate = m[1];
      if ((m = flat.match(RE.homeAddress))) resume.basicInfo.homeAddress = m[1];
      if ((m = flat.match(RE.emergencyName))) resume.basicInfo.emergencyContactName = m[1];
      if ((m = flat.match(RE.emergencyRel))) resume.basicInfo.emergencyContactRelation = m[1];
      if ((m = flat.match(RE.emergencyPhone))) resume.basicInfo.emergencyContactPhone = m[1];
      // 姓名 fallback：全文无「姓名」标签时，取首行 2-4 个汉字且不含数字
      if (!resume.basicInfo.name) {
        for (var i0 = 0; i0 < Math.min(lines.length, 6); i0++) {
          var first = lines[i0].trim();
          if (/^[\u4e00-\u9fa5·]{2,4}$/.test(first)) { resume.basicInfo.name = first; break; }
        }
      }
      // 求职意向兜底：性别行下方的「求职意向」多在基本信息段
      lines.slice(0, 30).forEach(function (ln) {
        if (!resume.basicInfo.jobIntention) {
          var v = labelValue(ln, ['求职意向', '意向岗位', '应聘岗位', '期望职位']);
          if (v) resume.basicInfo.jobIntention = v;
        }
      });

      var sections = splitSections(lines);

      sections.forEach(function (sec) {
        switch (sec.group) {
          case 'education': parseEducation(sec.lines, resume); break;
          case 'internship': parseExperience(sec.lines, resume, 'internship'); break;
          case 'work': parseExperience(sec.lines, resume, 'work'); break;
          case 'project': parseProject(sec.lines, resume); break;
          case 'family': parseFamily(sec.lines, resume); break;
          case 'certificate': parseCertificate(sec.lines, resume); break;
          case 'honor': parseHonor(sec.lines, resume); break;
          case 'skills': parseSkills(sec.lines, resume); break;
          case 'summary': resume.skills.selfAssessment = sec.lines.join('\n').trim().slice(0, 1000); break;
          case 'basicInfo': break; // 已全文扫描
          default: parseLoose(sec.lines, resume); break;
        }
      });

      return FO.normalizeResume(resume);
    }
  };

  // ---------- 教育经历 ----------
  function parseEducation(lines, resume) {
    var blocks = toBlocks(lines);
    blocks.forEach(function (b) {
      var text = b.join('\n');
      var row = { school: '', degree: '', college: '', major: '', startDate: '', endDate: '', gpa: '', rank: '', courses: '' };
      var rm = text.match(RE.range);
      if (rm) {
        row.startDate = normalizeMonth(rm[1], rm[2]);
        row.endDate = /\d{4}/.test(rm[3]) ? normalizeMonth(rm[3], rm[4]) : (rm[3] || '');
      }
      // 学校：含大学/学院/学校/Univ 的词块
      var school = '';
      b.forEach(function (ln) {
        var cand = ln.match(/([\u4e00-\u9fa5]{2,12}(?:大学|学院|学校)|[\w\s&.]{4,40}(?:University|College|Institute|School))/i);
        if (cand && !school) school = cand[1].trim();
      });
      row.school = school || labelValue(text, ['学校', '毕业院校', '院校']);
      var dm = text.match(RE.degree);
      if (dm) row.degree = standardDegree(dm[1]);
      var mj = labelValue(text, ['专业', '所学专业', '主修专业', '专业名称']);
      if (mj) row.major = mj.replace(/^\d{4}[^年]/, '');
      row.college = labelValue(text, ['学院', '院系']);
      row.gpa = labelValue(text, ['GPA', '绩点', 'gpa']);
      row.rank = labelValue(text, ['排名', '专业排名']);
      row.courses = labelValue(text, ['主修课程', '主要课程', '核心课程', '所学课程']);
      if (row.school || row.major || row.startDate) resume.education.push(row);
    });
  }

  function standardDegree(d) {
    if (!d) return '';
    if (/博士/.test(d)) return '博士';
    if (/硕士|研究生|MBA/.test(d)) return '硕士';
    if (/本科/.test(d)) return '本科';
    if (/大专|专科/.test(d)) return '专科';
    if (/高中|中专/.test(d)) return '高中';
    return d;
  }

  // ---------- 实习/工作经历 ----------
  function parseExperience(lines, resume, kind) {
    var blocks = toBlocks(lines);
    blocks.forEach(function (b) {
      var text = b.join('\n');
      var row = { company: '', city: '', department: '', position: '', startDate: '', endDate: '', description: '', leaveReason: '' };
      var rm = text.match(RE.range);
      if (rm) {
        row.startDate = normalizeMonth(rm[1], rm[2]);
        row.endDate = /\d{4}/.test(rm[3]) ? normalizeMonth(rm[3], rm[4]) : (rm[3] || '');
      }
      // 公司：第一行中「时间范围之后」或含 公司/有限/集团/科技/互联网 的部分
      b.forEach(function (ln) {
        var cand = ln.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·]{3,30}(?:公司|集团|厂|中心|银行|事务所|研究院|工作室|科技|信息技术))|([A-Za-z][A-Za-z0-9 &.,()]{3,40}(?:Inc|Ltd|Corp|LLC|Co\.|Company))/i);
        if (cand && !row.company) row.company = (cand[1] || cand[2] || '').trim();
      });
      row.company = row.company || labelValue(text, ['公司', '实习单位', '单位', '企业']);
      row.city = labelValue(text, ['城市', '所在城市', '工作城市', '实习城市', '地点']);
      row.department = labelValue(text, ['部门', '所在部门', '事业部']);
      row.position = labelValue(text, ['岗位', '职位', '职务', '担任', '角色']);
      // 描述：无 label 的长行聚合
      var desc = b.filter(function (ln) {
        return ln.length >= 8 && !RE.range.test(ln) && !/(公司|部门|岗位|职位)/.test(ln.slice(0, 12));
      }).join('\n');
      row.description = desc.slice(0, 2000);
      row.leaveReason = labelValue(text, ['离职原因']);
      if (row.company || row.position || row.startDate) (resume[kind] = resume[kind] || []).push(row);
    });
  }

  // ---------- 项目经历 ----------
  function parseProject(lines, resume) {
    var blocks = toBlocks(lines);
    blocks.forEach(function (b) {
      var text = b.join('\n');
      var row = { name: '', role: '', startDate: '', endDate: '', techStack: '', description: '', achievement: '' };
      var rm = text.match(RE.range);
      if (rm) {
        row.startDate = normalizeMonth(rm[1], rm[2]);
        row.endDate = /\d{4}/.test(rm[3]) ? normalizeMonth(rm[3], rm[4]) : (rm[3] || '');
      }
      // 项目名：首行去掉时间范围后的剩余
      var first = (b[0] || '').replace(RE.range, '').replace(/^[|、,，\s]+/, '').trim();
      row.name = labelValue(text, ['项目名称', '项目']) || first.slice(0, 40);
      row.role = labelValue(text, ['角色', '担任', '职责', '我的角色', '项目角色']);
      row.techStack = labelValue(text, ['技术栈', '技术', '使用技术', '工具']);
      row.description = labelValue(text, ['项目描述', '项目介绍', '项目内容', '描述']) ||
        b.filter(function (ln) { return ln.length >= 10 && !RE.range.test(ln) && ln !== b[0]; }).join('\n').slice(0, 2000);
      row.achievement = labelValue(text, ['成果', '业绩', '贡献']);
      if (row.name || row.startDate) resume.project.push(row);
    });
  }

  // ---------- 家庭成员 ----------
  function parseFamily(lines, resume) {
    lines.forEach(function (ln) {
      var rel = ln.match(RE.relation);
      if (!rel) return;
      var rest = ln.replace(rel[0], '').replace(/[\s|、,，/]+/g, '|').split('|').filter(Boolean);
      var name = rest.find(function (x) { return /^[\u4e00-\u9fa5·]{2,4}$/.test(x); }) || '';
      var phone = (ln.match(RE.phone) || [])[1] || '';
      var unit = rest.find(function (x) { return /公司|单位|集团|厂|银行|学校|医院|局|所/.test(x) && x.length >= 3; }) || '';
      var title = rest.find(function (x) { return /经理|主任|科长|局长|董事|员工|教师|医生|工人|干部|退休|职务|长$/.test(x); }) || '';
      if (name || phone) {
        resume.family.push({ name: name, relation: rel[0].replace('爸爸', '父亲').replace('妈妈', '母亲'), workUnit: unit, jobTitle: title, phone: phone });
      }
    });
  }

  // ---------- 证书 ----------
  function parseCertificate(lines, resume) {
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t || t.length < 3) return;
      var row = { name: '', date: '', issuer: '', number: '' };
      var dm = t.match(/(\d{4})\s*[年.\-/]\s*(\d{1,2})?/);
      if (dm) row.date = normalizeMonth(dm[1], dm[2]);
      var nm = t.match(RE.range);
      row.name = labelValue(t, ['证书名称', '证书']) ||
        t.replace(/[\d]{4}[年.\-/][\d]{0,2}[月]?/g, '').replace(RE.range, '').replace(/[|、,，;；:\s]+$/, '').trim().slice(0, 40);
      row.issuer = labelValue(t, ['颁发机构', '发证机构', '颁发单位']);
      row.number = labelValue(t, ['编号', '证书编号', '证书号']);
      var known = /(证书|资格|等级|CET|TOEFL|IELTS|驾照|驾驶证|普通话|教师资格|CPA|CFA|计算机|英语四级|英语六级|四六级|PMP)/i;
      if (known.test(t)) resume.certificate.push(row);
    });
  }

  // ---------- 奖惩 ----------
  function parseHonor(lines, resume) {
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t || t.length < 3) return;
      if (!/(奖学金|奖|荣誉|称号|一等奖|二等奖|三等奖|优胜|优秀|三好|国奖|竞赛)/.test(t)) return;
      var row = { name: '', level: '', date: '', issuer: '' };
      var dm = t.match(/(\d{4})\s*[年.\-/]\s*(\d{1,2})?/);
      if (dm) row.date = normalizeMonth(dm[1], dm[2]);
      var lm = t.match(/(国家级|省级|市级|校级|院级|全国|全省|一等奖|二等奖|三等奖|特等奖)/);
      if (lm) row.level = lm[1];
      row.name = t.replace(/\d{4}[年.\-/]?\d{0,2}月?/g, '').replace(/[|、,，;；:\s]+$/, '').trim().slice(0, 40);
      row.issuer = labelValue(t, ['颁发单位', '授予单位']);
      resume.honor.push(row);
    });
  }

  // ---------- 技能 ----------
  function parseSkills(lines, resume) {
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t) return;
      var parts = t.split(/[：:|，,;；（(]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var lm = t.match(/(精通|熟练|熟悉|掌握|了解|一般)/);
      var name = parts[0] ? parts[0].replace(/(精通|熟练|熟悉|掌握|了解)/, '').replace(/^(英语|日语|韩语|法语|德语)$/, '$1').trim() : '';
      var level = lm ? lm[1] : (parts[1] || '');
      if (/^(精通|熟练|熟悉|掌握|了解)$/.test(name)) { level = name; name = (parts[1] || '').trim(); }
      if (name && name.length <= 30) resume.skills.items.push({ name: name, level: level });
    });
  }

  // ---------- 未分节区松散解析（无标题简历兜底） ----------
  function parseLoose(lines, resume) {
    // 找形如「2018.09-2022.06 XX大学」的教育行
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t) return;
      var schoolM = t.match(/([\u4e00-\u9fa5]{2,12}(?:大学|学院))\s*[|,，、]?\s*([\u4e00-\u9fa5]{2,12})?\s*[|,，、]?\s*(本科|硕士|研究生|博士|大专|专科)?/);
      if (schoolM && RE.range.test(t) && !resume.education.length) {
        var rm = t.match(RE.range);
        resume.education.push({
          school: schoolM[1], degree: standardDegree(schoolM[3] || ''), college: '',
          major: schoolM[2] || '',
          startDate: normalizeMonth(rm[1], rm[2]),
          endDate: /\d{4}/.test(rm[3]) ? normalizeMonth(rm[3], rm[4]) : (rm[3] || ''),
          gpa: '', rank: '', courses: ''
        });
      }
    });
  }

  /** 把段内行聚合成条目块：以「日期范围行」或空行作为分界 */
  function toBlocks(lines) {
    var blocks = [], cur = [];
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t) {
        if (cur.length) { blocks.push(cur); cur = []; }
        return;
      }
      if (RE.range.test(t) && cur.length && /[\u4e00-\u9fa5A-Za-z]/.test(t)) {
        // 新条目的开始（日期在前）——把上一行并回来当标题的一部分
        blocks.push(cur); cur = [];
      }
      cur.push(t);
    });
    if (cur.length) blocks.push(cur);
    return blocks.length ? blocks : [[]];
  }
})(typeof self !== 'undefined' ? self : globalThis);
