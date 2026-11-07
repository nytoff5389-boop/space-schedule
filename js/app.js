import {
  TH_DAYS, TH_DAYS_SHORT, TH_MONTHS, addDays, dow, diffDays, toMin, fmtTime, bkkNow, thaiDate,
  dayInfo, nextClassDay, examsOn, holidaysOn, eventsOn, buildNotifications, toDS, parseDS, termPhase,
} from './core.js';
import { sfx } from './sfx.js';
import { warpJump } from './space.js';
import { startShip } from './ship.js';
import { startPlanets } from './planet.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const shipCanvas = $('#ship');
let ship = null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let data;
const state = { view: 'today', date: null, month: null, today: null };

// ---------- helpers ----------
function durText(mins) {
  if (mins < 1) return 'ไม่ถึง 1 นาที';
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return [d && `${d} วัน`, h && `${h} ชม.`, !d && m && `${m} นาที`].filter(Boolean).join(' ');
}
function countdown(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} ชม.` : `${m} นาที`;
}
const relDay = (ds) => {
  const n = diffDays(state.today, ds);
  return n === 0 ? 'วันนี้' : n === 1 ? 'พรุ่งนี้' : n === -1 ? 'เมื่อวาน' : n > 0 ? `อีก ${n} วัน` : `${-n} วันที่แล้ว`;
};
function dateChip(ds) {
  const [, m, d] = parseDS(ds);
  return `<div class="date-chip"><b>${d}</b><span>${TH_DAYS_SHORT[dow(ds)]} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][m - 1]}</span></div>`;
}

// ---------- TODAY ----------
function classCard(c, ds, nowMin) {
  const isToday = ds === state.today;
  const s = toMin(c.start), e = toMin(c.end);
  const now = isToday && nowMin >= s && nowMin < e;
  const past = isToday && nowMin >= e;
  const topic = c.topic
    ? `<div class="cc-topic"><small>📖 วันนี้เรียนเกี่ยวกับ</small>${esc(c.topic)}</div>`
    : `<div class="cc-topic empty">${c.hasSyllabus ? 'ไม่มีหัวข้อระบุในคอร์สซิลลาบัสสำหรับวันนี้' : 'ยังไม่มีคอร์สซิลลาบัส'}</div>`;
  return `<article class="class-card${now ? ' now' : ''}${past ? ' past' : ''}" style="--c:${c.course.color}">
    ${now ? '<span class="now-badge">กำลังเรียน</span>' : ''}
    <div class="cc-time"><b>${fmtTime(c.start)}</b><span>${fmtTime(c.end)}</span></div>
    <div>
      <div class="cc-code">${esc(c.code)}</div>
      <div class="cc-name">${esc(c.course.name)}</div>
      <div class="cc-meta">
        <span class="pill">📍 ${esc(c.room)}</span>
        ${c.isLab ? '<span class="pill lab">🧪 LAB</span>' : ''}
        ${c.kind && !c.isLab ? `<span class="pill kind">${esc(c.kind)}</span>` : ''}
      </div>
      ${topic}
    </div>
  </article>`;
}
function missionCard(info, nowMin) {
  if (info.date !== state.today) return '';
  const cur = info.classes.find((c) => nowMin >= toMin(c.start) && nowMin < toMin(c.end));
  if (cur) {
    const s = toMin(cur.start), e = toMin(cur.end);
    const pct = Math.round(((nowMin - s) / (e - s)) * 100);
    return `<section class="panel mission"><div class="mission-label">● กำลังเรียนอยู่</div>
      <div class="mission-main"><div class="mission-course">${esc(cur.code)} ${esc(cur.course.name)}</div><div class="mission-count" data-until="${e}">${countdown(e - nowMin)}</div></div>
      <div class="mission-sub">เหลือเวลาเรียน • ห้อง ${esc(cur.room)} • เลิก ${fmtTime(cur.end)} น.</div>
      <div class="progress"><i style="width:${pct}%"></i></div></section>`;
  }
  const next = info.classes.find((c) => toMin(c.start) > nowMin);
  if (next) {
    const s = toMin(next.start);
    return `<section class="panel mission"><div class="mission-label">🚀 คาบถัดไป</div>
      <div class="mission-main"><div class="mission-course">${esc(next.code)} ${esc(next.course.name)}</div><div class="mission-count" data-until="${s}">${countdown(s - nowMin)}</div></div>
      <div class="mission-sub">เริ่ม ${fmtTime(next.start)} น. • ห้อง ${esc(next.room)}${next.isLab ? ' • 🧪 Lab' : ''}</div></section>`;
  }
  if (info.classes.length) return `<section class="panel mission"><div class="mission-label">✅ ภารกิจวันนี้เสร็จแล้ว</div><div class="mission-course" style="margin-top:4px">เรียนครบทุกคาบแล้ว เก่งมาก!</div>${nextHint(info.date)}</section>`;
  return '';
}
function nextHint(ds) {
  const n = nextClassDay(data, ds);
  if (!n) return '';
  const c = n.classes[0];
  return `<div class="mission-sub" style="margin-top:6px">คาบถัดไป: ${thaiDate(n.date, { short: true })} (${relDay(n.date)}) ${fmtTime(c.start)} น. ${esc(c.code)} ${esc(c.course.name)}</div>`;
}
function emptyState(info) {
  const dn = TH_DAYS[info.dow];
  let cls = '', title = '', sub = '';
  if (info.reason === 'weekend') { title = `วัน${dn} ไม่มีเรียน`; sub = 'พักผ่อนให้เต็มที่ ชาร์จพลังก่อนออกบินสัปดาห์หน้า 🌙'; }
  else if (info.reason === 'holiday') { cls = 'holiday'; title = 'วันหยุด ไม่มีเรียน'; sub = info.holidays.map((h) => esc(h.name)).join(' • '); }
  else if (info.reason === 'midterm' || info.reason === 'final') { cls = 'exam'; title = info.reason === 'midterm' ? 'สัปดาห์สอบกลางภาค' : 'ช่วงสอบปลายภาค'; sub = info.exams.length ? 'วันนี้มีสอบ ดูรายละเอียดด้านล่าง' : 'ไม่มีคาบเรียนปกติ ทบทวนบทเรียนนะ'; }
  else if (info.reason === 'before') { title = 'ยังไม่เปิดเทอม'; sub = `เปิดภาค 2/2569 ${thaiDate(data.term.classStart)}`; }
  else if (info.reason === 'study') { cls = 'exam'; title = 'ไม่มีคาบเรียน'; sub = 'ช่วงก่อนสอบปลายภาค อ่านหนังสือให้เต็มที่!'; }
  else if (info.reason === 'after') { title = 'ปิดภาคเรียนแล้ว'; sub = 'ภาค 2/2569 จบแล้ว 🎉'; }
  else { title = `วัน${dn}ว่าง ไม่มีคาบเรียน`; sub = 'ไม่มีวิชาในตารางวันนี้'; }
  const note = info.holidays.filter((h) => h.note).map((h) => `<div class="cc-topic" style="text-align:left">ℹ️ ${esc(h.note)}</div>`).join('');
  return `<section class="panel empty-state"><div class="empty-planet ${cls}"></div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div>${note}${nextHint(info.date)}</section>`;
}
function examItems(list, withDate = false) {
  return list.map((x) => {
    const past = x.date < state.today;
    return `<div class="item exam${past ? ' past' : ''}">${withDate ? dateChip(x.date) : `<div class="date-chip"><b style="font-size:15px">${fmtTime(x.start)}</b><span>${fmtTime(x.end)}</span></div>`}
      <div><div class="t" style="color:${x.course ? x.course.color : '#fff'}">📝 ${esc(x.code)} ${x.course ? esc(x.course.name) : ''}</div>
      <div class="s">${esc(x.title)}${withDate ? ` • ${fmtTime(x.start)}–${fmtTime(x.end)} น.` : ''}</div>
      ${withDate && !past ? `<div class="countdown">${relDay(x.date)}</div>` : ''}</div></div>`;
  }).join('');
}
function eventItems(list) {
  return list.map((e) => `<div class="item ${e.type === 'it' ? 'it' : ''}"><div class="date-chip"><b style="font-size:18px">${e.type === 'it' ? '💻' : e.type === 'task' ? '✏️' : '📌'}</b><span>${e.start && e.date ? fmtTime(e.start) : 'ทั้งวัน'}</span></div>
    <div><div class="t">${esc(e.title)}</div>${e.start && e.date ? `<div class="s">${fmtTime(e.start)}–${fmtTime(e.end)} น.</div>` : ''}</div></div>`).join('');
}
function renderToday() {
  const ds = state.date;
  const info = dayInfo(data, ds);
  const { minutes } = bkkNow();
  const isToday = ds === state.today;
  const sub = { class: `สัปดาห์ที่ ${info.week} ของภาคเรียน`, midterm: 'สัปดาห์สอบกลางภาค', final: 'ช่วงสอบปลายภาค', study: 'ช่วงอ่านหนังสือก่อนสอบ', before: 'ก่อนเปิดภาคเรียน', after: 'ปิดภาคเรียน' }[info.phase];
  let html = `<div class="daynav">
      <button class="big-arrow" data-act="day" data-n="-1" aria-label="วันก่อนหน้า">‹</button>
      <div class="daynav-center"><div class="daynav-day">${isToday ? 'วันนี้ • ' : ''}${TH_DAYS[info.dow]}</div>
        <div class="daynav-sub">${thaiDate(ds, { weekday: false })} • ${sub}</div>
        ${!isToday ? '<button class="pill today-btn" data-act="gotoday">⟲ กลับมาวันนี้</button>' : ''}</div>
      <button class="big-arrow" data-act="day" data-n="1" aria-label="วันถัดไป">›</button></div>`;
  html += missionCard(info, minutes);
  if (info.classes.length) {
    html += `<div class="section-title">ตารางเรียน ${info.classes.length} คาบ</div><div class="timeline">${info.classes.map((c) => classCard(c, ds, minutes)).join('')}</div>`;
  } else html += emptyState(info);
  if (info.exams.length) html += `<div class="section-title">สอบ</div><div class="list">${examItems(info.exams)}</div>`;
  if (info.events.length) html += `<div class="section-title">กิจกรรม / วันสำคัญ</div><div class="list">${eventItems(info.events)}</div>`;
  return html;
}

// ---------- WEEK ----------
function renderWeek() {
  const todayDow = dow(state.today);
  const days = [1, 2, 3, 4, 5].map((d) => {
    const slots = data.weekly.filter((s) => s.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
    const body = slots.length ? slots.map((s) => {
      const c = data.courses[s.code];
      const lab = data.labRooms.includes(s.room);
      return `<div class="mini" style="--c:${c.color}"><div class="mt">${fmtTime(s.start)}–${fmtTime(s.end)}</div>
        <div class="mc">${s.code}</div><div class="mn">${esc(c.name)}</div><div class="mr">📍 ${s.room}${lab ? ' • <b style="color:var(--green)">🧪 LAB</b>' : ''}</div></div>`;
    }).join('') : '<div class="free-day">🌙 ว่าง ไม่มีเรียน</div>';
    return `<section class="panel week-day${d === todayDow ? ' is-today' : ''}"><h3>${TH_DAYS[d]}${d === todayDow ? '<span class="pill">วันนี้</span>' : ''}</h3>${body}</section>`;
  }).join('');
  const legend = Object.entries(data.courses).map(([code, c]) => `<div class="legend-row" style="--c:${c.color}"><i></i><b class="mono" style="font-size:13px">${code}</b> ${esc(c.name)}<span class="ls${c.syllabus ? ' ok' : ''}">${c.syllabus ? '✓ มีซิลลาบัส' : 'ยังไม่มีซิลลาบัส'}</span></div>`).join('');
  return `<h1 class="view-title">ตารางเรียนรายสัปดาห์</h1>
    <p class="muted small" style="margin:-6px 4px 12px">${esc(data.term.name)} • เรียน ${thaiDate(data.term.classStart, { short: true })} – ${thaiDate(data.term.classEnd, { short: true })} • เสาร์–อาทิตย์ไม่มีเรียน</p>
    <div class="week">${days}</div>
    <div class="section-title">รายวิชา</div><section class="panel legend">${legend}</section>`;
}

// ---------- MONTH ----------
function renderMonth() {
  const [y, m] = state.month;
  const first = toDS(y, m, 1);
  const startDow = dow(first);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = TH_DAYS_SHORT.map((d, i) => `<div class="cal-h${i === 0 || i === 6 ? ' we' : ''}">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-d out"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDS(y, m, d);
    const info = dayInfo(data, ds);
    const cls = ['cal-d'];
    if (info.weekend) cls.push('we');
    if (info.holidays.length) cls.push('hol');
    if (info.exams.length) cls.push('exam');
    if (info.phase === 'midterm' || info.phase === 'final') cls.push('examweek');
    if (ds === state.today) cls.push('today');
    if (ds === state.date && ds !== state.today) cls.push('sel');
    const codes = [...new Set(info.classes.map((c) => c.code))];
    const dots = codes.map((c) => `<i style="--c:${data.courses[c].color}"></i>`).join('');
    const flag = info.exams.length ? '📝' : info.classes.some((c) => c.isLab) ? '🧪' : info.events.length ? '⭐' : '';
    cells += `<button class="${cls.join(' ')}" data-act="pickday" data-date="${ds}" aria-label="${thaiDate(ds)}"><span class="n">${d}</span><span class="dots">${dots}</span>${flag ? `<span class="flag">${flag}</span>` : ''}</button>`;
  }
  // month summary: holidays, exams, important days
  const items = [];
  const seen = new Set();
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDS(y, m, d);
    holidaysOn(data, ds).forEach((h) => {
      const key = 'h' + h.name; if (seen.has(key)) return; seen.add(key);
      items.push({ ds, html: `<div class="item holiday">${dateChip(ds)}<div><div class="t">🎉 ${esc(h.name)}</div><div class="s">${h.start ? `${thaiDate(h.start, { short: true })} – ${thaiDate(h.end, { short: true })}` : 'วันหยุด'}${h.note ? `<br>ℹ️ ${esc(h.note)}` : ''}</div></div></div>` });
    });
    examsOn(data, ds).forEach((x) => items.push({ ds, html: examItems([x], true) }));
    eventsOn(data, ds).forEach((e) => {
      const key = 'e' + e.title; if (seen.has(key)) return; seen.add(key);
      items.push({ ds, html: `<div class="item ${e.type === 'it' ? 'it' : ''}${ds < state.today ? ' past' : ''}">${dateChip(ds)}<div><div class="t">${e.type === 'it' ? '💻' : e.type === 'task' ? '✏️' : '⭐'} ${esc(e.title)}</div><div class="s">${e.start && e.date ? `${fmtTime(e.start)}–${fmtTime(e.end)} น.` : e.end && !e.date ? `ถึง ${thaiDate(e.end, { short: true })}` : ''}</div></div></div>` });
    });
  }
  const t = data.term;
  [[t.midterm.start, t.midterm.label], [t.final.start, t.final.label], [t.classStart, ''], [t.classEnd, 'วันเรียนวันสุดท้ายของภาค']].forEach(([ds, label]) => {
    if (!label) return;
    const [yy, mm] = parseDS(ds);
    if (yy === y && mm === m) items.push({ ds, html: `<div class="item exam">${dateChip(ds)}<div><div class="t">🗓️ ${esc(label)}</div></div></div>` });
  });
  items.sort((a, b) => (a.ds < b.ds ? -1 : a.ds > b.ds ? 1 : 0));
  const summary = items.length ? items.map((i) => i.html).join('') : '<div class="panel muted" style="text-align:center">เดือนนี้ไม่มีวันหยุดหรือวันสำคัญ</div>';
  const holCount = new Set(items.filter((i) => i.html.includes('item holiday')).map((i) => i.html)).size;
  return `<div class="month-head">
      <button class="big-arrow" data-act="month" data-n="-1" aria-label="เดือนก่อน" style="width:56px;height:56px;border-radius:18px;background:var(--panel-strong);border:1px solid var(--line);font-size:24px;color:var(--cyan)">‹</button>
      <div class="daynav-center"><div class="daynav-day">${TH_MONTHS[m - 1]} ${y + 543}</div><div class="daynav-sub">แตะวันที่เพื่อดูตารางของวันนั้น</div></div>
      <button class="big-arrow" data-act="month" data-n="1" aria-label="เดือนถัดไป" style="width:56px;height:56px;border-radius:18px;background:var(--panel-strong);border:1px solid var(--line);font-size:24px;color:var(--cyan)">›</button></div>
    <section class="panel" style="padding:10px"><div class="cal">${cells}</div>
      <div class="cal-legend"><span><i class="sw" style="background:rgba(244,63,94,.5)"></i>วันหยุด</span><span><i class="sw" style="border:2px solid #fbbf24"></i>วันสอบ 📝</span><span>🧪 มี Lab</span><span>⭐ กิจกรรม</span><span><i class="sw" style="border:2px solid #67e8f9"></i>วันนี้</span></div></section>
    <div class="section-title">เดือนนี้มีอะไรบ้าง${holCount ? ` • วันหยุด ${holCount} รายการ` : ''}</div><div class="list">${summary}</div>`;
}

// ---------- EXAMS ----------
function renderExams() {
  const all = data.exams.map((x) => ({ ...x, course: data.courses[x.code] })).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  const upcoming = all.filter((x) => x.date >= state.today);
  const past = all.filter((x) => x.date < state.today);
  const next = upcoming[0];
  const noInfo = Object.entries(data.courses).filter(([c]) => !data.exams.some((x) => x.code === c)).map(([c, v]) => `${c} ${v.name}`);
  const t = data.term;
  return `<h1 class="view-title">ตารางสอบ</h1>
    ${next ? `<section class="panel mission"><div class="mission-label">☄️ สอบถัดไป</div><div class="mission-main"><div class="mission-course">${esc(next.code)} ${esc(next.course.name)}</div><div class="mission-count">${relDay(next.date)}</div></div><div class="mission-sub">${thaiDate(next.date)} • ${fmtTime(next.start)}–${fmtTime(next.end)} น.<br>${esc(next.title)}</div></section>` : ''}
    <section class="panel small"><b>🗓️ ช่วงสอบของมหาวิทยาลัย</b><br>สอบกลางภาค: ${thaiDate(t.midterm.start, { short: true })} – ${thaiDate(t.midterm.end, { short: true })}<br>สอบปลายภาค: ${thaiDate(t.final.start, { short: true })} – ${thaiDate(t.final.end, { short: true })}</section>
    <div class="section-title">กำลังจะมาถึง (${upcoming.length})</div><div class="list">${examItems(upcoming, true) || '<div class="panel muted">ไม่มีสอบที่เหลือแล้ว 🎉</div>'}</div>
    ${noInfo.length ? `<div class="section-title">ยังไม่มีข้อมูลวันสอบ</div><section class="panel small muted">${noInfo.map(esc).join('<br>')}<br><span style="color:var(--dim)">(ยังไม่มีคอร์สซิลลาบัส / ตารางสอบของวิชาเหล่านี้)</span></section>` : ''}
    ${past.length ? `<div class="section-title">สอบไปแล้ว</div><div class="list">${examItems(past, true)}</div>` : ''}`;
}

// ---------- ALERTS ----------
function renderAlerts() {
  const cfg = data.ntfy;
  const url = `${cfg.server}/${cfg.topic}`;
  const preview = [];
  for (let i = 0; i < 7 && preview.length < 14; i++) {
    const ds = addDays(state.today, i);
    buildNotifications(data, ds).forEach((n) => preview.push(n));
  }
  const nowSec = Date.now() / 1000;
  const list = preview.filter((n) => n.at > nowSec).slice(0, 14).map((n) => `<div class="notif"><div class="nw">${thaiDate(n.date, { short: true })} • ${n.time} น.</div><div class="nt">${esc(n.title)}</div><div class="nm">${esc(n.message)}</div></div>`).join('');
  return `<h1 class="view-title">ระบบแจ้งเตือน</h1>
    <section class="panel test-panel">
      <b>🛰️ ทดสอบแจ้งเตือน</b>
      <div class="small muted">กดแล้วนับถอยหลัง 3-2-1 จากนั้นจะส่งแจ้งเตือนจริงเข้า iPhone ทันที (ตัวอย่างคาบเรียนถัดไป)</div>
      <div class="countdown-big" id="cd" aria-live="polite"></div>
      <button class="big-btn" data-act="test" id="testBtn">🚀 ทดสอบแจ้งเตือน</button>
    </section>
    <section class="panel"><div class="toggle-row"><div><b>🔊 เสียงตอนกดปุ่ม</b><div class="small muted">เสียงกดปุ่มและเสียงเครื่องยนต์ยาน</div></div><button class="switch${sfx.enabled ? ' on' : ''}" data-act="sound" aria-label="เปิดปิดเสียง"></button></div></section>
    <div class="section-title">แจ้งเตือนที่จะส่ง 7 วันข้างหน้า</div><div class="list">${list || '<div class="panel muted">ไม่มีแจ้งเตือนใน 7 วันนี้</div>'}</div>
    <details class="panel guide"><summary>📲 วิธีตั้งค่าการแจ้งเตือน และรายละเอียด</summary>
      <div class="steps" style="margin-top:12px">
        <div class="step">ติดตั้งแอป <b>ntfy</b> จาก App Store แล้วอนุญาตการแจ้งเตือน</div>
        <div class="step">ในแอปกด <b>+</b> แล้วใส่ชื่อหัวข้อ (topic) ด้านล่าง ให้ server เป็น ntfy.sh</div>
        <div class="step">เสร็จแล้ว! ระบบจะเด้งเตือนก่อนเรียนทุกคาบ วันหยุด วัน Lab และวันสอบ</div>
      </div>
      <div class="topic-box" id="topicBox">${esc(cfg.topic)}</div>
      <button class="big-btn" data-act="copy">📋 คัดลอกชื่อหัวข้อ</button>
      <a class="big-btn ghost" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">⬇️ ดาวน์โหลดแอป ntfy</a>
      <a class="big-btn ghost" href="${esc(url)}" target="_blank" rel="noopener">🌐 เปิดหัวข้อในเว็บ ntfy</a>
      <div class="small" style="margin-top:14px"><b>⏰ จะแจ้งเตือนอะไรบ้าง</b><br>
      • ${cfg.morningTime} น. สรุปคาบเรียนของวันนี้<br>
      • ก่อนเรียนทุกคาบ ${cfg.leadMinutes} นาที พร้อมหัวข้อที่จะเรียนจากคอร์สซิลลาบัส<br>
      • ${cfg.eveningTime} น. ของวันก่อนหน้า: วันหยุดพิเศษ (ที่ไม่ใช่เสาร์–อาทิตย์) และวันว่างในตาราง<br>
      • วันเรียน Lab (ห้อง ${data.labRooms.join(', ')}) และอบรม IT: ล่วงหน้า ${cfg.labRemindDays.join(' และ ')} วัน<br>
      • วันสอบ: ล่วงหน้า ${cfg.examRemindDays.join(' และ ')} วัน และก่อนสอบ 1 ชม.</div>
    </details>`;
}

let testing = false;
async function runTest(btn) {
  if (testing) return;
  testing = true; btn.disabled = true;
  const cd = $('#cd');
  for (const n of [3, 2, 1]) {
    cd.textContent = n; cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
    sfx.blip(1);
    await new Promise((r) => setTimeout(r, 1000));
  }
  cd.textContent = '🚀'; cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
  sfx.warp(); warpJump(); if (ship) ship.maneuver();
  const nxt = nextClassDay(data, state.today, false);
  const { minutes } = bkkNow();
  let c = nxt && nxt.classes.find((k) => nxt.date !== state.today || toMin(k.start) > minutes);
  let info = nxt;
  if (!c && nxt) { info = nextClassDay(data, nxt.date); c = info && info.classes[0]; }
  const message = c
    ? `ตัวอย่าง: คาบถัดไป ${thaiDate(info.date, { short: true })} ${fmtTime(c.start)}–${fmtTime(c.end)} น.\n${c.code} ${c.course.name} • ห้อง ${c.room}${c.topic ? `\nวันนี้เรียน: ${c.topic}` : ''}`
    : 'ระบบแจ้งเตือนทำงานปกติ';
  try {
    const r = await fetch(data.ntfy.server, { method: 'POST', body: JSON.stringify({ topic: data.ntfy.topic, title: '🧪 ทดสอบแจ้งเตือน', message, priority: 4, click: data.siteUrl }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    cd.textContent = '✅ ส่งแล้ว!'; sfx.chime();
  } catch (e) {
    cd.textContent = '⚠️ ส่งไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
  setTimeout(() => { btn.disabled = false; testing = false; }, 1500);
}

// ---------- render / navigation ----------
const renderers = { today: renderToday, week: renderWeek, month: renderMonth, exams: renderExams, alerts: renderAlerts };
function render(animate = true) {
  view.innerHTML = renderers[state.view]();
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  if (animate) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
}
function go(v, x, y) {
  const changed = v !== state.view;
  state.view = v;
  if (changed) {
    sfx.warp();
    warpJump();
    if (ship) ship.maneuver();
    setTimeout(() => sfx.chime(), 420);
  }
  render(true);
  window.scrollTo({ top: 0, behavior: changed ? 'auto' : 'smooth' });
}

function ripple(el, x, y) {
  const r = el.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.left = x - r.left + 'px'; s.style.top = y - r.top + 'px';
  el.appendChild(s);
  setTimeout(() => s.remove(), 650);
}

document.querySelector('.console').addEventListener('click', (e) => {
  const b = e.target.closest('.nav-btn'); if (!b) return;
  const r = b.getBoundingClientRect();
  const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
  sfx.tap(); ripple(b, x, y);
  if (b.dataset.view === 'today' && state.view === 'today') { state.date = state.today; }
  if (b.dataset.view === 'month' && state.view !== 'month') { const [yy, mm] = parseDS(state.date); state.month = [yy, mm]; }
  go(b.dataset.view, x, y);
});

view.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing');
  if (act === 'day') { const n = +b.dataset.n; sfx.blip(n); state.date = addDays(state.date, n); render(true); }
  else if (act === 'gotoday') { sfx.chime(); state.date = state.today; render(true); }
  else if (act === 'month') {
    const n = +b.dataset.n; sfx.blip(n);
    let [y, m] = state.month; m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    state.month = [y, m]; render(true);
  } else if (act === 'pickday') {
    sfx.tap(); state.date = b.dataset.date;
    const r = b.getBoundingClientRect();
    go('today', r.left + r.width / 2, r.top + r.height / 2);
  } else if (act === 'copy') {
    sfx.tap();
    try { await navigator.clipboard.writeText(data.ntfy.topic); b.textContent = '✅ คัดลอกแล้ว'; }
    catch (_) { const sel = getSelection(); const rg = document.createRange(); rg.selectNodeContents($('#topicBox')); sel.removeAllRanges(); sel.addRange(rg); b.textContent = 'เลือกข้อความแล้ว กดคัดลอกได้เลย'; }
  } else if (act === 'test') {
    sfx.tap(); runTest(b);
  } else if (act === 'sound') {
    const on = !sfx.enabled; sfx.set(on); sfx.toggle(on); b.classList.toggle('on', on); updateSoundBtn();
  }
});

// swipe left/right on the Today view to change day
let touchX = null, touchY = null;
view.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
view.addEventListener('touchend', (e) => {
  if (touchX === null || state.view !== 'today') return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { const n = dx < 0 ? 1 : -1; sfx.blip(n); state.date = addDays(state.date, n); render(true); }
}, { passive: true });

const soundBtn = $('#soundBtn');
function updateSoundBtn() {
  soundBtn.innerHTML = sfx.enabled
    ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
}
soundBtn.addEventListener('click', () => {
  const on = !sfx.enabled; sfx.set(on); sfx.toggle(on); updateSoundBtn();
  soundBtn.classList.remove('boing'); void soundBtn.offsetWidth; soundBtn.classList.add('boing');
  if (state.view === 'alerts') render(false);
});

// ---------- clock ----------
function tick() {
  const now = bkkNow();
  const hh = String(Math.floor(now.minutes / 60)).padStart(2, '0'), mm = String(now.minutes % 60).padStart(2, '0');
  $('#hudClock').textContent = `${hh}:${mm}`;
  if (now.date !== state.today) { // new day (or first run)
    const first = !state.today;
    const wasOnToday = state.date === state.today;
    state.today = now.date;
    $('#hudDate').textContent = thaiDate(now.date);
    const ph = termPhase(data, now.date);
    $('#hudTerm').textContent = ph === 'class' ? `ภาค 2/2569 • สัปดาห์ที่ ${dayInfo(data, now.date).week}` : 'ภาค 2/2569';
    if (first || wasOnToday) state.date = now.date;
    if (!state.month) { const [y, m] = parseDS(now.date); state.month = [y, m]; }
    if (!first) render(false);
  } else if (now.seconds < 1.2 && state.view === 'today' && state.date === state.today) {
    render(false); // refresh countdown / current class every minute
  }
}

async function init() {
  const res = await fetch('data/schedule.json', { cache: 'no-cache' });
  data = await res.json();
  updateSoundBtn();
  try { startPlanets($('#planets')); } catch (e) { console.warn(e); }
  try { ship = startShip(shipCanvas); } catch (e) { console.warn(e); }
  tick();
  render(true);
  setInterval(tick, 1000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init().catch((err) => { view.innerHTML = `<section class="panel">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</section>`; });
