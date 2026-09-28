const TYPES = {
  milk:   { name: '喝奶' },
  diaper: { name: '换尿布' },
  sleep:  { name: '睡觉' },
  bath:   { name: '洗澡' },
  play:   { name: '玩耍' },
  out:    { name: '外出' },
};
const DB_URL = '/api/events';

async function loadDB() {
  const res = await fetch(DB_URL, { cache: 'no-store' });
  return await res.json();
}
async function addToDB(ev) {
  const res = await fetch(DB_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
  if (!res.ok) throw new Error('save failed');
}
async function delFromDB(id) {
  await fetch(DB_URL + '/' + id, { method: 'DELETE' });
}

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalInput(d) {
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmt(dt) { return (dt || '').replace('T', ' '); }
function dayKey(s) { return (s || '').slice(0, 10); }

let currentType = null;
let calBase = new Date();
let currentDay = null;
let currentEventId = null;
let currentEvent = null;

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function openForm(type) {
  currentType = type;
  const now = new Date();
  const offsetMin = type === 'sleep' ? 60 : 10;
  const start = new Date(now.getTime() - offsetMin * 60 * 1000);
  document.getElementById('form-title').textContent = TYPES[type].name;
  document.getElementById('f-start').value = toLocalInput(start);
  document.getElementById('f-end').value = toLocalInput(now);
  document.getElementById('save-tip').textContent = '';
  let extra = '';
  if (type === 'milk') {
    extra = `<div class="form-item"><label>喝奶量 (ml)</label><input type="number" id="f-amount" inputmode="decimal" value="120" placeholder="例如 120"></div>
      <div class="form-item"><label><input type="checkbox" id="f-also-diaper" checked style="width:auto;margin-right:8px;transform:scale(1.2)">同时记录换尿包（小便，时间：喝奶前 5 分钟）</label></div>`;
  } else if (type === 'play') {
    extra = `<div class="form-item"><label>运动类型</label><select id="f-playtype">
      <option>大运动</option><option>玩玩具</option><option>练抬头</option></select></div>`;
  } else if (type === 'diaper') {
    extra = `<div class="form-item"><label>尿包内容</label><select id="f-wet" onchange="onWetChange()">
      <option>小便</option><option>大便</option></select></div>
      <div class="form-item" id="f-stool-wrap" style="display:none"><label>大便状态</label><select id="f-stool">
      <option>黄</option><option>绿</option><option>黄绿</option><option>深绿</option></select></div>`;
  }
  document.getElementById('f-extra').innerHTML = extra;
  showPage('page-form');
}

function onWetChange() {
  document.getElementById('f-stool-wrap').style.display =
    document.getElementById('f-wet').value === '大便' ? 'block' : 'none';
}

async function saveEvent() {
  const start = document.getElementById('f-start').value;
  const end = document.getElementById('f-end').value;
  if (!start || !end) { alert('请填写开始和结束时间'); return; }
  const ev = { id: Date.now(), type: currentType, start, end };
  if (currentType === 'milk') {
    const v = document.getElementById('f-amount').value;
    if (!v) { alert('请填写喝奶量'); return; }
    ev.amount = Number(v);
  } else if (currentType === 'play') {
    ev.playType = document.getElementById('f-playtype').value;
  } else if (currentType === 'diaper') {
    ev.wet = document.getElementById('f-wet').value;
    if (ev.wet === '大便') ev.stool = document.getElementById('f-stool').value;
  }
  document.getElementById('save-tip').textContent = '保存中…';
  try {
    await addToDB(ev);
    const alsoDiaper = document.getElementById('f-also-diaper');
    if (currentType === 'milk' && alsoDiaper && alsoDiaper.checked) {
      const dStart = new Date(start);
      dStart.setMinutes(dStart.getMinutes() - 5);
      await addToDB({
        id: Date.now() + 1,
        type: 'diaper',
        start: toLocalInput(dStart),
        end: start,
        wet: '小便',
      });
    }
    document.getElementById('save-tip').textContent = '✅ 已保存';
    setTimeout(() => showPage('page-main'), 600);
  } catch (err) {
    document.getElementById('save-tip').textContent = '❌ 保存失败，请重试';
  }
}

// ---- 日历 ----
function calMove(delta) {
  calBase = new Date(calBase.getFullYear(), calBase.getMonth() + delta, 1);
  renderCal();
  renderMilkChart();
}
async function renderCal() {
  const y = calBase.getFullYear(), m = calBase.getMonth();
  document.getElementById('cal-title').textContent = y + ' 年 ' + (m + 1) + ' 月';
  const db = await loadDB();
  const eventDays = {};
  db.forEach(e => { const k = dayKey(e.start); eventDays[k] = (eventDays[k] || 0) + 1; });
  const today = dayKey(toLocalInput(new Date()));
  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  let html = ['日','一','二','三','四','五','六'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) html += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const k = y + '-' + pad(m + 1) + '-' + pad(d);
    let cls = 'cal-cell';
    if (k === today) cls += ' today';
    if (eventDays[k]) cls += ' has-events';
    html += `<div class="${cls}" onclick="openDay('${k}')">${d}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}
async function renderMilkChart() {
  const db = await loadDB();
  const totals = {};
  db.forEach(e => {
    if (e.type === 'milk') {
      const k = dayKey(e.start);
      totals[k] = (totals[k] || 0) + (e.amount || 0);
    }
  });
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({
      key: d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()),
      label: (d.getMonth()+1) + '/' + d.getDate(),
    });
  }
  const vals = days.map(d => totals[d.key] || 0);
  const W = 440, H = 220, PAD_L = 40, PAD_B = 30, PAD_T = 24, PAD_R = 10;
  const maxV = Math.max(...vals, 100);
  const step = 100;
  const yMax = Math.ceil(maxV / step) * step;
  const x = i => PAD_L + i * (W - PAD_L - PAD_R) / (days.length - 1);
  const y = v => PAD_T + (1 - v / yMax) * (H - PAD_T - PAD_B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:#fff;border-radius:12px">`;
  for (let v = 0; v <= yMax; v += step) {
    svg += `<line x1="${PAD_L}" y1="${y(v)}" x2="${W-PAD_R}" y2="${y(v)}" stroke="#eee"/>
      <text x="${PAD_L-6}" y="${y(v)+4}" font-size="11" fill="#999" text-anchor="end">${v}</text>`;
  }
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  svg += `<polyline points="${pts}" fill="none" stroke="#4a90e2" stroke-width="2.5"/>`;
  days.forEach((d, i) => {
    svg += `<circle cx="${x(i)}" cy="${y(vals[i])}" r="4" fill="#4a90e2"/>
      <text x="${x(i)}" y="${y(vals[i])-10}" font-size="11" fill="#4a90e2" font-weight="bold" text-anchor="middle">${vals[i]}</text>
      <text x="${x(i)}" y="${H-10}" font-size="11" fill="#666" text-anchor="middle">${d.label}</text>`;
  });
  svg += '</svg>';
  document.getElementById('milk-chart').innerHTML = svg;
}

async function openDay(k) {
  currentDay = k;
  document.getElementById('day-title').textContent = k;
  document.getElementById('day-summary').innerHTML = '<div class="summary-row"><span>加载中…</span></div>';
  document.getElementById('day-list').innerHTML = '';
  showPage('page-day');
  const db = (await loadDB()).filter(e => dayKey(e.start) === k).sort((a, b) => a.start.localeCompare(b.start));
  // 汇总
  const counts = {}, milkTotal = { n: 0, ml: 0 };
  db.forEach(e => {
    counts[e.type] = (counts[e.type] || 0) + 1;
    if (e.type === 'milk') { milkTotal.n++; milkTotal.ml += e.amount || 0; }
  });
  let sum = '';
  const order = Object.keys(TYPES);
  order.forEach(t => {
    if (counts[t]) {
      let txt = counts[t] + ' 次';
      if (t === 'milk') txt += ' / 总量 ' + milkTotal.ml + ' ml';
      sum += `<div class="summary-row"><span>${TYPES[t].name}</span><b>${txt}</b></div>`;
    }
  });
  document.getElementById('day-summary').innerHTML = sum || '<div class="summary-row"><span>当天没有记录</span></div>';
  // 列表
  document.getElementById('day-list').innerHTML = db.map(e =>
    `<div class="ev-row t-${e.type}" onclick="openDetail(${e.id})">
      <span>${fmt(e.start).slice(11)}</span><span>${fmt(e.end).slice(11)}</span>
      <span class="type">${TYPES[e.type].name}</span>
      <button class="del" onclick="event.stopPropagation();deleteFromList(${e.id})">🗑</button></div>`).join('') ||
    '<div class="summary-row"><span>暂无事件</span></div>';
}

async function deleteFromList(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  await delFromDB(id);
  if (currentDay) await openDay(currentDay);
}

async function openDetail(id) {
  const ev = (await loadDB()).find(e => e.id === id);
  if (!ev) return;
  currentEventId = id;
  currentEvent = ev;
  document.getElementById('detail-title').textContent = TYPES[ev.type].name;
  let rows = `<div class="detail-item"><span>事件类型</span><span>${TYPES[ev.type].name}</span></div>
    <div class="detail-item"><span>开始时间</span><span>${fmt(ev.start)}</span></div>
    <div class="detail-item"><span>结束时间</span><span>${fmt(ev.end)}</span></div>`;
  if (ev.type === 'milk') rows += `<div class="detail-item"><span>喝奶量</span><span>${ev.amount} ml</span></div>`;
  if (ev.type === 'play') rows += `<div class="detail-item"><span>运动类型</span><span>${ev.playType}</span></div>`;
  if (ev.type === 'diaper') {
    rows += `<div class="detail-item"><span>尿包内容</span><span>${ev.wet}</span></div>`;
    if (ev.stool) rows += `<div class="detail-item"><span>大便状态</span><span>${ev.stool}</span></div>`;
  }
  rows += `<button class="save-btn" onclick="editEvent()">✏️ 编辑</button>`;
  document.getElementById('detail-body').innerHTML = rows;
  showPage('page-detail');
}

function opts(list, sel) {
  return list.map(v => `<option ${v === sel ? 'selected' : ''}>${v}</option>`).join('');
}

function editEvent() {
  const ev = currentEvent;
  let rows = `<div class="form-item"><label>开始时间</label><input type="datetime-local" id="e-start" value="${ev.start}"></div>
    <div class="form-item"><label>结束时间</label><input type="datetime-local" id="e-end" value="${ev.end}"></div>`;
  if (ev.type === 'milk') {
    rows += `<div class="form-item"><label>喝奶量 (ml)</label><input type="number" id="e-amount" inputmode="decimal" value="${ev.amount}"></div>`;
  } else if (ev.type === 'play') {
    rows += `<div class="form-item"><label>运动类型</label><select id="e-playtype">${opts(['大运动','玩玩具','练抬头'], ev.playType)}</select></div>`;
  } else if (ev.type === 'diaper') {
    rows += `<div class="form-item"><label>尿包内容</label><select id="e-wet" onchange="onEditWetChange()">${opts(['小便','大便'], ev.wet)}</select></div>
      <div class="form-item" id="e-stool-wrap" style="display:${ev.wet === '大便' ? 'block' : 'none'}"><label>大便状态</label><select id="e-stool">${opts(['黄','绿','黄绿','深绿'], ev.stool)}</select></div>`;
  }
  rows += `<button class="save-btn" onclick="saveEdit()">保存修改</button>`;
  document.getElementById('detail-body').innerHTML = rows;
}

function onEditWetChange() {
  document.getElementById('e-stool-wrap').style.display =
    document.getElementById('e-wet').value === '大便' ? 'block' : 'none';
}

async function saveEdit() {
  const patch = {
    start: document.getElementById('e-start').value,
    end: document.getElementById('e-end').value,
  };
  if (!patch.start || !patch.end) { alert('请填写开始和结束时间'); return; }
  if (currentEvent.type === 'milk') {
    const v = document.getElementById('e-amount').value;
    if (!v) { alert('请填写喝奶量'); return; }
    patch.amount = Number(v);
  } else if (currentEvent.type === 'play') {
    patch.playType = document.getElementById('e-playtype').value;
  } else if (currentEvent.type === 'diaper') {
    patch.wet = document.getElementById('e-wet').value;
    if (patch.wet === '大便') {
      patch.stool = document.getElementById('e-stool').value;
    } else {
      patch.stool = null;
    }
  }
  await fetch(DB_URL + '/' + currentEventId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await openDetail(currentEventId);
}

async function deleteEvent() {
  if (!confirm('确定删除这条记录吗？')) return;
  await delFromDB(currentEventId);
  if (currentDay) await openDay(currentDay);
}
renderCal();
renderMilkChart();
