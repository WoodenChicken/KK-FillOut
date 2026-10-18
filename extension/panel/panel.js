/**
 * Side Panel 简历编辑器：分组表单 + 文件导入（PDF/DOC/DOCX/JSON/MD）+ 导出 + 设置 + 隐私。
 * 全部本地：chrome.storage.local 读写，无任何远程请求。
 */
(function () {
  'use strict';
  var FO = window.FO;

  var resume = FO.emptyResume();
  var pendingImport = null;
  var saveTimer = null;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ---------- 存取 ----------
  function load(cb) {
    chrome.storage.local.get(['resume', 'settings'], function (r) {
      resume = FO.normalizeResume(r && r.resume);
      var st = Object.assign({}, FO.DEFAULT_SETTINGS, (r && r.settings) || {});
      $('#set-highlight').checked = st.highlight;
      $('#set-ml').checked = st.mlEnabled;
      $('#set-auto').value = st.autoFillThreshold; $('#set-auto-v').textContent = st.autoFillThreshold;
      $('#set-confirm').value = st.confirmThreshold; $('#set-confirm-v').textContent = st.confirmThreshold;
      cb();
    });
  }

  function save() {
    $('#save-status').textContent = '保存中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      chrome.storage.local.set({ resume: resume }, function () {
        $('#save-status').textContent = '已保存 ✓';
        setTimeout(function () { $('#save-status').textContent = '已保存'; }, 1200);
      });
    }, 350);
  }

  // ---------- Tabs ----------
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('.tab').forEach(function (x) { x.classList.remove('active'); });
      $$('.tabpane').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      $('#tab-' + t.dataset.tab).classList.add('active');
      if (t.dataset.tab === 'json') refreshJsonEditor();
      if (t.dataset.tab === 'settings') refreshSamplesCount();
    });
  });

  // ---------- 表单渲染 ----------
  function inputHtml(def, gKey, idx) {
    var safeKey = escapeHtml(def.key);
    var id = ['f', gKey, idx == null ? 'x' : idx, safeKey].join('-');
    var attrs = ' data-g="' + gKey + '" data-f="' + safeKey + '"' + (idx != null ? ' data-i="' + idx + '"' : '');
    var val = FO.getResumeValue(resume, gKey + '.' + def.key, idx);
    val = escapeHtml(val);
    if (def.type === 'select') {
      var opts = ['<option value="">请选择</option>'].concat(def.options.map(function (o) {
        return '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>';
      }));
      return '<select' + attrs + '>' + opts.join('') + '</select>';
    }
    if (def.type === 'textarea') {
      return '<textarea' + attrs + ' placeholder="每行一条，支持换行">' + val + '</textarea>';
    }
    var typeMap = { tel: 'tel', email: 'email', number: 'number', month: 'month', date: 'date' };
    var t = typeMap[def.type] || 'text';
    var ph = def.type === 'month' ? 'YYYY-MM' : (def.type === 'date' ? 'YYYY-MM-DD' : '');
    return '<input type="' + t + '"' + (ph ? ' placeholder="' + ph + '"' : '') + attrs + ' value="' + val + '" />';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderAll() {
    var wrap = $('#resume-forms');
    wrap.textContent = '';
    Object.keys(FO.SCHEMA).forEach(function (gKey) {
      wrap.appendChild(renderGroup(gKey));
    });
  }

  function renderGroup(gKey) {
    var def = FO.SCHEMA[gKey];
    var card = document.createElement('div');
    card.className = 'group-card closed';
    card.dataset.group = gKey;
    var filledCount = countFilled(gKey);
    var hd = document.createElement('div');
    hd.className = 'group-hd';
    hd.innerHTML = '<span><span class="t">' + def.label + '</span><span class="n">' + filledCount + '</span></span><span class="arrow">▼</span>';
    hd.addEventListener('click', function () { card.classList.toggle('closed'); });
    card.appendChild(hd);

    var bd = document.createElement('div');
    bd.className = 'group-bd';

    if (def.type === 'object') {
      var grid = document.createElement('div');
      grid.className = 'frow';
      grid.style.flexWrap = 'wrap';
      def.fields.forEach(function (f) {
        var item = document.createElement('div');
        item.className = 'fitem';
        item.style.minWidth = '46%';
        item.innerHTML = '<label>' + f.label + (f.ext ? ' <span style="color:#94a3b8">(扩展)</span>' : '') + '</label>' + inputHtml(f, gKey, null);
        grid.appendChild(item);
      });
      // 该组的自定义字段
      FO.customKeysOf(resume, gKey).forEach(function (ck) {
        grid.appendChild(customFieldItem(gKey, ck, null));
      });
      bd.appendChild(grid);
      bd.appendChild(addCustomFieldBtn(gKey));
    } else if (def.type === 'array') {
      var list = resume[gKey];
      (list.length ? list : [{}]).forEach(function (_, i) {
        bd.appendChild(renderSegment(gKey, i));
      });
      var add = document.createElement('button');
      add.className = 'btn add-seg';
      add.textContent = '＋ 添加一条' + def.label;
      add.addEventListener('click', function () {
        FO.setResumeValue(resume, gKey + '.' + def.fields[0].key, '', resume[gKey].length);
        renderAll(); save();
      });
      bd.appendChild(add);
      bd.appendChild(addCustomFieldBtn(gKey));
    } else if (def.type === 'skills') {
      var sl = resume.skills.items;
      (sl.length ? sl : [{}]).forEach(function (_, i) {
        var seg = document.createElement('div');
        seg.className = 'seg';
        var ckeys = FO.customKeysOf(resume, gKey);
        var customHtml = ckeys.map(function (ck) {
          return '<div class="fitem" style="flex:1"><label>' + escapeHtml(ck) + customTag() + delCustomBtnHtml(gKey, ck) + '</label>' +
            inputHtml({ key: ck, label: ck, type: 'text' }, gKey, i) + '</div>';
        }).join('');
        seg.innerHTML = '<div class="seg-hd"><span class="idx">技能 ' + (i + 1) + '</span>' + delBtn(gKey, i) + '</div>' +
          '<div class="frow">' +
          '<div class="fitem" style="flex:2"><label>技能 / 语言</label>' + inputHtml(def.fields[0], gKey, i) + '</div>' +
          '<div class="fitem"><label>熟练度</label>' + inputHtml(def.fields[1], gKey, i) + '</div>' +
          customHtml +
          '</div>';
        bd.appendChild(seg);
      });
      var addSkill = document.createElement('button');
      addSkill.className = 'btn add-seg';
      addSkill.textContent = '＋ 添加一项技能';
      addSkill.addEventListener('click', function () {
        resume.skills.items.push({ name: '', level: '' });
        renderAll(); save();
      });
      bd.appendChild(addSkill);
      bd.appendChild(addCustomFieldBtn(gKey));
      var sa = def.extras[0];
      var saBox = document.createElement('div');
      saBox.style.marginTop = '10px';
      saBox.innerHTML = '<div class="fitem"><label>' + sa.label + '</label>' + inputHtml(sa, gKey, null) + '</div>';
      bd.appendChild(saBox);
    } else if (def.type === 'custom') {
      var keys = Object.keys(resume.custom);
      if (!keys.length) {
        var tip = document.createElement('div');
        tip.className = 'hint';
        tip.textContent = '站点问到的特殊问题（如「是否愿意出差」）可在此自定义 key/value，填充引擎同样会尝试匹配。';
        bd.appendChild(tip);
      }
      var addCustom = document.createElement('button');
      addCustom.className = 'btn add-seg';
      addCustom.textContent = '＋ 添加自定义字段';
      addCustom.addEventListener('click', function () {
        var k = prompt('字段名（将作为匹配关键词）');
        if (k) { resume.custom[k.trim()] = ''; renderAll(); save(); }
      });
      bd.appendChild(addCustom);
      keys.forEach(function (k) {
        var seg = document.createElement('div');
        seg.className = 'seg';
        seg.innerHTML = '<div class="seg-hd"><span class="idx">' + escapeHtml(k) + '</span><button class="seg-del" data-ck="' + escapeHtml(k) + '">删除</button></div>' +
          '<div class="fitem"><input type="text" data-custom="' + escapeHtml(k) + '" value="' + escapeHtml(resume.custom[k]) + '" /></div>';
        bd.appendChild(seg);
      });
    }
    card.appendChild(bd);
    return card;
  }

  function renderSegment(gKey, idx) {
    var def = FO.SCHEMA[gKey];
    var seg = document.createElement('div');
    seg.className = 'seg';
    var ckeys = FO.customKeysOf(resume, gKey);
    var rows = [];
    var fs = def.fields.slice();
    ckeys.forEach(function (ck) { fs.push({ key: ck, label: ck, type: 'text', custom: true }); });
    for (var i = 0; i < fs.length; i += 2) {
      rows.push(fs.slice(i, i + 2));
    }
    var html = '<div class="seg-hd"><span class="idx">' + def.label.slice(0, 2) + '经历 ' + (idx + 1) + '</span>' + delBtn(gKey, idx) + '</div>';
    rows.forEach(function (pair) {
      html += '<div class="frow">' + pair.map(function (f) {
        return '<div class="fitem"><label>' + escapeHtml(f.label) + (f.custom ? customTag() + delCustomBtnHtml(gKey, f.key) : '') + '</label>' + inputHtml(f, gKey, idx) + '</div>';
      }).join('') + '</div>';
    });
    seg.innerHTML = html;
    return seg;
  }

  function delBtn(gKey, idx) {
    return '<button class="seg-del" data-seg-del="' + gKey + '" data-seg-idx="' + idx + '">删除</button>';
  }

  /** 自定义字段标签旁的小标记 */
  function customTag() {
    return ' <span style="color:#94a3b8">(自定义)</span>';
  }

  /** 自定义字段的删除按钮（放在 label 内） */
  function delCustomBtnHtml(gKey, ck) {
    return ' <button class="seg-del" data-custom-del-g="' + gKey + '" data-custom-del-k="' + escapeHtml(ck) + '" style="margin-left:4px">删除</button>';
  }

  /** object 组里单个自定义字段的表单项 */
  function customFieldItem(gKey, ck, idx) {
    var item = document.createElement('div');
    item.className = 'fitem';
    item.style.minWidth = '46%';
    item.innerHTML = '<label>' + escapeHtml(ck) + customTag() + delCustomBtnHtml(gKey, ck) + '</label>' +
      inputHtml({ key: ck, label: ck, type: 'text' }, gKey, idx);
    return item;
  }

  /** 每组底部的「添加自定义字段」按钮 */
  function addCustomFieldBtn(gKey) {
    var btn = document.createElement('button');
    btn.className = 'btn add-seg';
    btn.textContent = '＋ 为本组添加自定义字段';
    btn.addEventListener('click', function () {
      var k = prompt('字段名（将作为匹配关键词，如「微信号」）');
      if (!k) return;
      k = k.trim();
      if (!k) return;
      var def = FO.SCHEMA[gKey];
      var sk = def.fields.map(function (f) { return f.key; }).concat((def.extras || []).map(function (f) { return f.key; }));
      if (sk.indexOf(k) !== -1) { alert('该字段已存在于本组预设字段中'); return; }
      if (def.type === 'object') {
        if (resume[gKey][k] !== undefined) { alert('该自定义字段已存在'); return; }
        resume[gKey][k] = '';
      } else if (def.type === 'array') {
        if (resume[gKey].some(function (row) { return row[k] !== undefined; })) { alert('该自定义字段已存在'); return; }
        resume[gKey].forEach(function (row) { row[k] = ''; });
      } else if (def.type === 'skills') {
        if (resume.skills.items.some(function (it) { return it[k] !== undefined; })) { alert('该自定义字段已存在'); return; }
        resume.skills.items.forEach(function (it) { it[k] = ''; });
      }
      renderAll(); save();
    });
    return btn;
  }

  function countFilled(gKey) {
    var def = FO.SCHEMA[gKey];
    var v = resume[gKey];
    if (!v) return '0 项';
    if (def.type === 'array') return v.length + ' 条';
    if (def.type === 'skills') return (v.items.length + (v.selfAssessment ? 1 : 0)) + ' 项';
    if (def.type === 'custom') return Object.keys(v).length + ' 项';
    // object 组：统计所有非空字段（含自定义）
    return Object.keys(v).filter(function (k) { return v[k]; }).length + ' 项';
  }

  // ---------- 表单事件（委托） ----------
  $('#resume-forms').addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.custom !== undefined) {
      resume.custom[t.dataset.custom] = t.value.trim();
      save(); return;
    }
    if (!t.dataset.g || !t.dataset.f) return;
    var idx = t.dataset.i != null ? +t.dataset.i : undefined;
    FO.setResumeValue(resume, t.dataset.g + '.' + t.dataset.f, t.value, idx);
    save();
  });

  $('#resume-forms').addEventListener('click', function (e) {
    var del = e.target.closest('[data-seg-del]');
    if (del) {
      var g = del.dataset.segDel;
      var i = +del.dataset.segIdx;
      resume[g].splice(i, 1);
      renderAll(); save();
      return;
    }
    // 删除某组内的自定义字段
    var cdel = e.target.closest('[data-custom-del-g]');
    if (cdel) {
      var cg = cdel.dataset.customDelG;
      var ck = cdel.dataset.customDelK;
      var cdef = FO.SCHEMA[cg];
      if (cdef.type === 'object') {
        delete resume[cg][ck];
      } else if (cdef.type === 'array') {
        resume[cg].forEach(function (row) { delete row[ck]; });
      } else if (cdef.type === 'skills') {
        resume.skills.items.forEach(function (it) { delete it[ck]; });
      }
      renderAll(); save();
      return;
    }
    var cdel2 = e.target.closest('[data-ck]');
    if (cdel2) {
      delete resume.custom[cdel2.dataset.ck];
      renderAll(); save();
    }
  });

  // ---------- 导入 ----------
  $('#pick-file').addEventListener('click', function () { $('#file-input').click(); });
  $('#file-input').addEventListener('change', function () { if (this.files[0]) doImport(this.files[0]); this.value = ''; });
  var drop = $('#drop');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) doImport(e.dataTransfer.files[0]);
  });

  async function doImport(file) {
    var box = $('#import-result');
    box.style.display = 'block';
    $('#result-title').textContent = '解析中：' + file.name + '（' + Math.ceil(file.size / 1024) + ' KB）';
    $('#result-title').className = 'result-title';
    $('#result-detail').textContent = '本地解析中，不经过任何服务器…';
    try {
      var t0 = performance.now();
      var out = await FO.parser.parseFile(file);
      var cost = Math.round(performance.now() - t0);
      pendingImport = out.resume;
      var stats = [];
      Object.keys(FO.SCHEMA).forEach(function (g) {
        var def = FO.SCHEMA[g];
        var v = out.resume[g];
        if (!v) return;
        if (def.type === 'array' && v.length) stats.push(def.label + ' ' + v.length + ' 条');
        if (def.type === 'skills' && (v.items.length || v.selfAssessment)) stats.push(def.label + ' ' + v.items.length + ' 项');
        if (def.type === 'object') {
          var n = def.fields.filter(function (f) { return v[f.key]; }).length;
          if (n) stats.push(def.label + ' ' + n + ' 项');
        }
      });
      $('#result-title').textContent = '✓ 解析成功（' + cost + 'ms）';
      $('#result-title').className = 'result-title ok';
      $('#result-detail').textContent = (out.warning ? '⚠ ' + out.warning + '\n' : '') + stats.join(' · ') || '（未识别到内容，可换 PDF/DOCX 重试）';
      $('#import-overwrite').disabled = false;
      $('#import-merge').disabled = false;
    } catch (e) {
      pendingImport = null;
      $('#result-title').textContent = '✗ 解析失败';
      $('#result-title').className = 'result-title err';
      $('#result-detail').textContent = e && e.code === 'SCANNED_PDF'
        ? '这份 PDF 是扫描件（无文本层）。请在电脑上用 OCR 工具转成可复制文本的 PDF，或把内容粘贴到 .txt 再导入。'
        : String(e && e.message || e);
      $('#import-overwrite').disabled = true;
      $('#import-merge').disabled = true;
    }
  }

  $('#import-overwrite').addEventListener('click', function () {
    if (!pendingImport) return;
    resume = pendingImport;
    renderAll(); save();
    $('#import-result').style.display = 'none';
  });

  $('#import-merge').addEventListener('click', function () {
    if (!pendingImport) return;
    resume = mergeResume(resume, pendingImport);
    renderAll(); save();
    $('#import-result').style.display = 'none';
  });

  function mergeResume(base, inc) {
    var out = FO.normalizeResume(base);
    Object.keys(FO.SCHEMA).forEach(function (g) {
      var def = FO.SCHEMA[g];
      var sk = def.fields.map(function (f) { return f.key; }).concat((def.extras || []).map(function (f) { return f.key; }));
      if (def.type === 'array') {
        (inc[g] || []).forEach(function (row) {
          var dup = out[g].some(function (r) {
            return r.school && row.school && r.school === row.school ||
              r.company && row.company && r.company === row.company ||
              r.name && row.name && r.name === row.name;
          });
          if (!dup) {
            // 保留行内自定义字段
            var nr = {};
            def.fields.forEach(function (f) { nr[f.key] = row[f.key] || ''; });
            Object.keys(row).forEach(function (k) { if (sk.indexOf(k) === -1) nr[k] = row[k]; });
            out[g].push(nr);
          }
        });
      } else if (def.type === 'skills') {
        (inc[g].items || []).forEach(function (it) {
          if (!out[g].items.some(function (x) { return x.name === it.name; })) {
            var nit = { name: it.name || '', level: it.level || '' };
            Object.keys(it).forEach(function (k) { if (k !== 'name' && k !== 'level') nit[k] = it[k]; });
            out[g].items.push(nit);
          }
        });
        if (!out[g].selfAssessment && inc[g].selfAssessment) out[g].selfAssessment = inc[g].selfAssessment;
      } else if (def.type === 'custom') {
        Object.keys(inc[g]).forEach(function (k) {
          if (!out[g][k]) out[g][k] = inc[g][k];
        });
      } else {
        def.fields.forEach(function (f) {
          if (!out[g][f.key] && inc[g][f.key]) out[g][f.key] = inc[g][f.key];
        });
        // 合并 object 组的自定义字段
        if (inc[g] && typeof inc[g] === 'object') {
          Object.keys(inc[g]).forEach(function (k) {
            if (sk.indexOf(k) === -1 && !out[g][k]) out[g][k] = inc[g][k];
          });
        }
      }
    });
    return out;
  }

  $('#import-cancel').addEventListener('click', function () {
    pendingImport = null;
    $('#import-result').style.display = 'none';
  });

  // ---------- 导出 ----------
  $('#export-json').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(resume, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resume.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  // ---------- 视觉识别（截图 OCR 兜底） ----------
  $('#ocr-scan').addEventListener('click', function () {
    var btn = $('#ocr-scan');
    btn.disabled = true;
    $('#save-status').textContent = 'OCR 识别中…';
    chrome.runtime.sendMessage({ type: 'FO_OCR_SCAN' }, function (r) {
      void chrome.runtime.lastError;
      btn.disabled = false;
      $('#save-status').textContent = (r && r.ok) ? 'OCR 完成 ✓' : 'OCR 失败：' + ((r && r.error) || '未知错误');
      setTimeout(function () { $('#save-status').textContent = '已保存'; }, 3000);
    });
  });

  // ---------- JSON 直编 ----------
  function refreshJsonEditor() {
    $('#json-editor').value = JSON.stringify(resume, null, 2);
  }
  $('#json-refresh').addEventListener('click', refreshJsonEditor);
  $('#json-apply').addEventListener('click', function () {
    var msg = $('#json-msg');
    try {
      resume = FO.normalizeResume(JSON.parse($('#json-editor').value));
      renderAll(); save();
      msg.textContent = '✓ 已应用';
      msg.className = 'json-msg ok';
    } catch (e) {
      msg.textContent = '✗ JSON 解析失败：' + (e && e.message);
      msg.className = 'json-msg err';
    }
  });

  // ---------- 设置 ----------
  $('#set-highlight').addEventListener('change', persistSettings);
  $('#set-ml').addEventListener('change', persistSettings);
  $('#set-auto').addEventListener('input', function () {
    $('#set-auto-v').textContent = this.value;
    persistSettings();
  });
  $('#set-confirm').addEventListener('input', function () {
    $('#set-confirm-v').textContent = this.value;
    persistSettings();
  });
  function persistSettings() {
    chrome.storage.local.get('settings', function (r) {
      var st = Object.assign({}, FO.DEFAULT_SETTINGS, (r && r.settings) || {});
      st.highlight = $('#set-highlight').checked;
      st.mlEnabled = $('#set-ml').checked;
      st.autoFillThreshold = +$('#set-auto').value;
      st.confirmThreshold = +$('#set-confirm').value;
      chrome.storage.local.set({ settings: st });
    });
  }

  // ---------- 样本 ----------
  function refreshSamplesCount() {
    chrome.runtime.sendMessage({ type: 'FO_GET_SAMPLES_COUNT' }, function (r) {
      $('#samples-count').textContent = '本地样本：' + ((r && r.count) || 0) + ' 条';
    });
  }
  $('#export-samples').addEventListener('click', function () {
    chrome.runtime.sendMessage({ type: 'FO_EXPORT_SAMPLES' }, function (r) {
      if (!r || !r.ok) return;
      var lines = (r.rows || []).map(function (row) {
        var sig = row.signals || {};
        var parts = [sig.labelText, sig.placeholder, sig.name, sig.id].filter(Boolean);
        // 把 section 上下文（如「家庭」「教育」）拼进文本，让模型学到 section 消歧
        if (row.contextText) parts.push('【' + row.contextText + '】');
        return JSON.stringify({ text: parts.join(' | '), label: row.label });
      });
      var blob = new Blob([lines.join('\n')], { type: 'application/jsonl' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fillout-samples.jsonl';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  });

  // ---------- 清除全部数据 ----------
  $('#clear-all').addEventListener('click', function () {
    if (!confirm('确定删除全部本地数据？\n包括：简历、设置、训练样本。该操作不可恢复。')) return;
    chrome.runtime.sendMessage({ type: 'FO_CLEAR_ALL_DATA' }, function () {
      load(function () { renderAll(); });
      $('#save-status').textContent = '已全部清除';
    });
  });

  // ---------- 启动 ----------
  load(function () { renderAll(); });
})();
