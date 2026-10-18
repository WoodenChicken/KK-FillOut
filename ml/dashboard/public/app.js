/**
 * FillOut 训练可视化面板 - 前端逻辑。
 * 连接 SSE 实时接收训练事件，更新各面板内容与图表。
 */
(() => {
  const $ = (id) => document.getElementById(id);

  // —— 标签页切换 ——
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.pane').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      $('tab-' + t.dataset.tab).classList.add('active');
    });
  });

  // —— 状态 ——
  let eventSource = null;
  let epochHistory = [];
  let running = false;

  function setStatus(state, text) {
    const dot = $('status-dot');
    dot.className = 'status-dot ' + state;
    $('status-text').textContent = text;
  }

  // —— 日志 ——
  function log(msg) {
    const area = $('log-area');
    const line = document.createElement('div');
    line.className = 'line';
    line.textContent = msg;
    area.appendChild(line);
    area.scrollTop = area.scrollHeight;
  }

  // —— 简易 Canvas 图表 ——
  function drawBarChart(canvas, labels, values, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.height || 220;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!values.length) return;
    const max = Math.max(...values, 1);
    const padL = 10, padR = 10, padT = 10, padB = 24;
    const bw = (cssW - padL - padR) / values.length;
    values.forEach((v, i) => {
      const h = (v / max) * (cssH - padT - padB);
      const x = padL + i * bw;
      const y = cssH - padB - h;
      const grad = ctx.createLinearGradient(0, y, 0, cssH - padB);
      grad.addColorStop(0, opts.color1 || '#60a5fa');
      grad.addColorStop(1, opts.color2 || '#2563eb');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, y, Math.max(1, bw - 2), h);
      if (i % Math.ceil(values.length / 12) === 0 || values.length <= 12) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const lbl = labels[i].replace(/^[a-z]+\./, '');
        ctx.fillText(lbl.length > 6 ? lbl.slice(0, 5) + '…' : lbl, x + bw / 2, cssH - 8);
      }
    });
  }

  function drawLineChart(canvas, series) {
    // series: [{name, color, data:[number|null]}]
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.height || 260;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 40, padR = 16, padT = 16, padB = 28;
    const w = cssW - padL - padR, h = cssH - padT - padB;
    const n = Math.max(...series.map((s) => s.data.length), 1);
    if (n < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待训练数据…', cssW / 2, cssH / 2);
      return;
    }

    // 坐标轴
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + h); ctx.lineTo(padL + w, padT + h); ctx.stroke();

    // Y 轴刻度
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padT + h - (i / 4) * h;
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
      ctx.fillText((i / 4).toFixed(1), padL - 4, y + 3);
    }

    // X 轴标签
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      if (i % Math.ceil(n / 10) === 0 || i === n - 1) {
        ctx.fillText(String(i + 1), padL + (i / (n - 1)) * w, padT + h + 16);
      }
    }

    // 曲线
    series.forEach((s) => {
      const pts = s.data.map((v, i) => v === null ? null : {
        x: padL + (i / (n - 1)) * w,
        y: padT + h - Math.max(0, Math.min(1, v)) * h
      });
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      let started = false;
      pts.forEach((p) => {
        if (!p) { started = false; return; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      // 数据点
      ctx.fillStyle = s.color;
      pts.forEach((p) => { if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); } });
    });

    // 图例
    ctx.textAlign = 'left'; ctx.font = '11px sans-serif';
    series.forEach((s, i) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(padL + i * 110, padT - 10, 10, 10);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(s.name, padL + i * 110 + 14, padT - 1);
    });
  }

  function redrawTrainChart() {
    const epochs = epochHistory.map((e) => e.epoch);
    drawLineChart($('chart-train'), [
      { name: 'Loss', color: '#f87171', data: epochHistory.map((e) => e.loss) },
      { name: 'Acc', color: '#22c55e', data: epochHistory.map((e) => e.acc) },
      { name: 'Val Loss', color: '#fbbf24', data: epochHistory.map((e) => e.valLoss) },
      { name: 'Val Acc', color: '#60a5fa', data: epochHistory.map((e) => e.valAcc) }
    ]);
  }

  // —— 事件处理 ——
  function onReset() {
    epochHistory = [];
    $('sample-tbody').innerHTML = '<tr><td colspan="2" class="muted">等待训练启动…</td></tr>';
    $('cleaning-flow').innerHTML = '<p class="muted">等待训练启动…</p>';
    $('cleaning-before-after').innerHTML = '<p class="muted">等待训练启动…</p>';
    $('model-info').innerHTML = '<p class="muted">等待训练启动…</p>';
    $('eval-result').innerHTML = '<p class="muted">等待评估…</p>';
    $('log-area').innerHTML = '';
    ['stat-total', 'stat-synthetic', 'stat-real', 'stat-classes'].forEach((id) => $(id).textContent = '—');
    ['stat-acc', 'stat-valacc', 'stat-loss'].forEach((id) => $(id).textContent = '—');
    $('stat-epoch').textContent = '0 / 0';
    redrawTrainChart();
    drawBarChart($('chart-dist'), [], [], {});
  }

  function onCorpus(d) {
    $('stat-total').textContent = d.total.toLocaleString();
    $('stat-synthetic').textContent = d.synthetic.toLocaleString();
    $('stat-real').textContent = d.real.toLocaleString();
    $('stat-classes').textContent = d.numClasses;
    // 类别分布柱状图
    drawBarChart($('chart-dist'), d.perClass.labels, d.perClass.counts, { color1: '#a78bfa', color2: '#7c3aed' });
    // 样本表
    const tbody = $('sample-tbody');
    tbody.innerHTML = '';
    d.samples.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(s.text)}</td><td><code>${escapeHtml(s.label)}</code></td>`;
      tbody.appendChild(tr);
    });
  }

  function onCleaning(d) {
    const flow = $('cleaning-flow');
    flow.innerHTML = '';
    d.steps.forEach((step, i) => {
      if (i > 0) {
        const arr = document.createElement('div');
        arr.className = 'clean-arrow';
        arr.textContent = '→';
        flow.appendChild(arr);
      }
      const box = document.createElement('div');
      box.className = 'clean-step';
      box.innerHTML = `<div class="name">${escapeHtml(step.name)}</div>
        <div class="counts">输入 <b>${step.before}</b> → 输出 <b class="kept">${step.after}</b> <span class="removed">-${step.removed}</span></div>`;
      flow.appendChild(box);
    });

    const ba = $('cleaning-before-after');
    ba.innerHTML = `<div class="muted" style="margin-bottom:8px">清洗前总数 ${d.before} → 清洗后总数 <b style="color:#4ade80">${d.after}</b></div>`;
    d.steps.forEach((step) => {
      (step.examples || []).forEach((ex) => {
        const row = document.createElement('div');
        row.className = 'ba-row';
        row.innerHTML = `<div class="before">${escapeHtml(ex.before)}</div>
          <div class="arrow">→</div><div class="after">${escapeHtml(ex.after)}</div>`;
        ba.appendChild(row);
      });
    });
  }

  function onFeatures(d) {
    const info = $('model-info');
    info.innerHTML = `<table>
      <tr><td>词表大小</td><td>${d.vocabSize.toLocaleString()}</td></tr>
      <tr><td>特征维度</td><td>${d.featureDim.toLocaleString()}</td></tr>
      <tr><td>稀疏度</td><td>${(d.sparsity.ratio * 100).toFixed(2)}% 非零 (${d.sparsity.nonZero}/${d.sparsity.total})</td></tr>
      <tr><td>训练集</td><td>${d.trainSize.toLocaleString()}</td></tr>
      <tr><td>验证集</td><td>${d.valSize.toLocaleString()}</td></tr>
    </table>`;
  }

  function onModel(d) {
    const info = $('model-info');
    info.innerHTML = '<table>' +
      d.layers.map((l) => `<tr><td>${escapeHtml(l.layer)}</td><td>${escapeHtml(String(l.shape))}</td><td style="color:#94a3b8">${l.params.toLocaleString()} params</td></tr>`).join('') +
      `<tr><td>估算权重体积</td><td colspan="2">~${d.estimatedSizeKB} KB</td></tr>` +
      '</table>';
  }

  function onEpoch(d) {
    epochHistory.push(d);
    $('stat-epoch').textContent = `${d.epoch} / ${epochHistory.length > 0 ? '...' : ''}`;
    $('stat-acc').textContent = (d.acc * 100).toFixed(2) + '%';
    $('stat-valacc').textContent = d.valAcc !== null ? (d.valAcc * 100).toFixed(2) + '%' : '—';
    $('stat-loss').textContent = d.loss;
    redrawTrainChart();
  }

  function onEval(d) {
    const el = $('eval-result');
    el.innerHTML = `
      <div class="acc-big">${(d.accuracy * 100).toFixed(2)}%</div>
      <div class="muted">验证集准确率（共 ${d.total} 条）</div>
      <div class="worst"><b>最需改进的类别（F1 最低）：</b>
        ${d.worstClasses.map((c) => `<div class="worst-row"><span>${escapeHtml(c.label)}</span><span>F1 ${(c.f1 * 100).toFixed(1)}% · P ${(c.precision * 100).toFixed(0)}% · R ${(c.recall * 100).toFixed(0)}%</span></div>`).join('')}
      </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // —— SSE 连接 ——
  function connect() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('reset', () => onReset());
    eventSource.addEventListener('stage', (e) => {
      const d = JSON.parse(e.data);
      log(`▶ 阶段：${d.stage}`);
    });
    eventSource.addEventListener('log', (e) => {
      const d = JSON.parse(e.data);
      log(d.message);
    });
    eventSource.addEventListener('corpus', (e) => onCorpus(JSON.parse(e.data)));
    eventSource.addEventListener('cleaning', (e) => onCleaning(JSON.parse(e.data)));
    eventSource.addEventListener('features', (e) => onFeatures(JSON.parse(e.data)));
    eventSource.addEventListener('model', (e) => onModel(JSON.parse(e.data)));
    eventSource.addEventListener('epoch', (e) => onEpoch(JSON.parse(e.data)));
    eventSource.addEventListener('eval', (e) => onEval(JSON.parse(e.data)));
    eventSource.addEventListener('export', (e) => {
      const d = JSON.parse(e.data);
      log(`✓ 模型已导出：${d.outDir}（weights ${d.weightsSizeKB}KB）`);
    });
    eventSource.addEventListener('done', (e) => {
      const d = JSON.parse(e.data);
      running = false;
      setStatus(d.stopped ? 'error' : 'idle', d.stopped ? '已停止' : '完成');
      $('btn-start').disabled = false;
      $('btn-stop').disabled = true;
      log(d.stopped ? '■ 训练已停止' : '✓ 训练完成');
    });
    eventSource.addEventListener('error', (e) => {
      let d = {};
      try { d = JSON.parse(e.data); } catch (x) {}
      log('✗ 错误：' + (d.message || '连接异常'));
      setStatus('error', '错误');
    });
    eventSource.onerror = () => {
      // 断线重连
      setTimeout(connect, 2000);
    };
  }

  // —— 控制按钮 ——
  function getConfig() {
    return {
      seed: +$('cfg-seed').value,
      samplesPerPattern: +$('cfg-samples').value,
      vocabSize: +$('cfg-vocab').value,
      hiddenUnits: +$('cfg-hidden').value,
      epochs: +$('cfg-epochs').value,
      batchSize: +$('cfg-batch').value,
      learningRate: +$('cfg-lr').value,
      dropout: +$('cfg-dropout').value,
      validationSplit: +$('cfg-val').value
    };
  }

  async function startTrain() {
    if (running) return;
    running = true;
    setStatus('running', '训练中…');
    $('btn-start').disabled = true;
    $('btn-stop').disabled = false;
    // 切到训练页
    document.querySelector('.tab[data-tab="training"]').click();
    const res = await fetch('/api/train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getConfig()) });
    const r = await res.json();
    if (!r.ok) {
      running = false;
      setStatus('error', '启动失败');
      $('btn-start').disabled = false;
      $('btn-stop').disabled = true;
      log('✗ 启动失败：' + (r.error || '未知'));
    }
  }

  async function stopTrain() {
    await fetch('/api/stop', { method: 'POST' });
    $('btn-stop').disabled = true;
    setStatus('idle', '停止中…');
  }

  $('btn-start').addEventListener('click', startTrain);
  $('btn-stop').addEventListener('click', stopTrain);
  $('btn-apply').addEventListener('click', startTrain);
  $('btn-reset').addEventListener('click', () => {
    $('cfg-seed').value = 42; $('cfg-samples').value = 6; $('cfg-vocab').value = 3000;
    $('cfg-hidden').value = 128; $('cfg-epochs').value = 30; $('cfg-batch').value = 64;
    $('cfg-lr').value = 0.005; $('cfg-dropout').value = 0.15; $('cfg-val').value = 0.15;
  });

  // 启动
  connect();
})();
