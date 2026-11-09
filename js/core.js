// Shared schedule logic: used by the website (browser) and the ntfy notifier (Node).
// All dates are civil dates in Asia/Bangkok (UTC+7, no DST), as "YYYY-MM-DD" strings.

export const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const TH_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const BKK_OFFSET_MIN = 7 * 60;

const pad = (n) => String(n).padStart(2, '0');
export const toDS = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parseDS = (ds) => ds.split('-').map(Number);

export function addDays(ds, n) {
  const [y, m, d] = parseDS(ds);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toDS(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function dow(ds) {
  const [y, m, d] = parseDS(ds);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function diffDays(a, b) {
  const [y1, m1, d1] = parseDS(a);
  const [y2, m2, d2] = parseDS(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const fmtTime = (hm) => hm.replace(':', '.');

/** Current moment in Bangkok: { date, minutes, dow } */
export function bkkNow(now = new Date()) {
  const t = new Date(now.getTime() + BKK_OFFSET_MIN * 60000);
  const date = toDS(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  return { date, minutes: t.getUTCHours() * 60 + t.getUTCMinutes(), seconds: t.getUTCSeconds(), dow: t.getUTCDay() };
}
/** Unix epoch seconds for a Bangkok civil date + "HH:MM" (or minutes). */
export function bkkEpoch(ds, hm) {
  const [y, m, d] = parseDS(ds);
  const mins = typeof hm === 'number' ? hm : toMin(hm);
  return Math.floor((Date.UTC(y, m - 1, d, 0, mins) - BKK_OFFSET_MIN * 60000) / 1000);
}

export function thaiDate(ds, { weekday = true, short = false } = {}) {
  const [y, m, d] = parseDS(ds);
  const mon = short ? TH_MONTHS_SHORT[m - 1] : TH_MONTHS[m - 1];
  const yr = short ? String(y + 543).slice(2) : y + 543;
  return `${weekday ? (short ? TH_DAYS_SHORT[dow(ds)] + '. ' : 'วัน' + TH_DAYS[dow(ds)] + 'ที่ ') : ''}${d} ${mon} ${yr}`;
}

const inRange = (ds, s, e) => ds >= s && ds <= e;
const coversDate = (item, ds) => item.date ? item.date === ds : inRange(ds, item.start, item.end);

export function holidaysOn(data, ds) { return data.holidays.filter((h) => coversDate(h, ds)); }
export function eventsOn(data, ds) {
  return data.events.filter((e) => (e.date ? e.date === ds : inRange(ds, e.start, e.end)));
}
export function examsOn(data, ds) {
  return data.exams.filter((x) => x.date === ds)
    .map((x) => ({ ...x, course: data.courses[x.code] }))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}
export const isLabRoom = (data, room) => data.labRooms.includes(room);

export function termPhase(data, ds) {
  const t = data.term;
  if (ds < t.classStart) return 'before';
  if (inRange(ds, t.midterm.start, t.midterm.end)) return 'midterm';
  if (inRange(ds, t.final.start, t.final.end)) return 'final';
  if (ds > t.final.end) return 'after';
  if (ds > t.classEnd) return 'study'; // gap between last class and finals
  return 'class';
}
export function weekOfTerm(data, ds) {
  const n = diffDays(data.term.classStart, ds);
  return n < 0 ? 0 : Math.floor(n / 7) + 1;
}

/** One-line quiz status for a lab class. */
export function quizLine(c) {
  if (!c.isLab) return '';
  if (c.quiz) return `📝 ${c.quiz.sure ? 'มีควิซหลังแล็บ' : 'อาจมีควิซหลังแล็บ'}: ${c.quiz.topic}`;
  return `✅ ไม่มีควิซ${c.labNote ? ' • ' + c.labNote : ''}`;
}

export function slotWithDetails(data, slot, ds) {
  const course = data.courses[slot.code] || { name: slot.code, color: '#93c5fd' };
  const topic = ds && data.topics[slot.code] ? data.topics[slot.code][ds] || '' : '';
  const isLab = isLabRoom(data, slot.room);
  const quiz = isLab && ds ? (data.labQuiz?.[slot.code]?.[ds] || null) : null;
  const labNote = isLab ? (data.labNote?.[slot.code] || '') : '';
  return { ...slot, course, topic, hasSyllabus: !!course.syllabus, isLab, quiz, labNote };
}

/** Everything about one day. */
export function dayInfo(data, ds) {
  const d = dow(ds);
  const weekend = d === 0 || d === 6;
  const holidays = holidaysOn(data, ds);
  const phase = termPhase(data, ds);
  const exams = examsOn(data, ds);
  const events = eventsOn(data, ds);
  const regular = data.weekly.filter((s) => s.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
  let classes = [];
  let reason = '';
  if (weekend) reason = 'weekend';
  else if (holidays.length) reason = 'holiday';
  else if (phase !== 'class') reason = phase;
  else if (!regular.length) reason = 'free';
  else classes = regular.map((s) => slotWithDetails(data, s, ds));
  return { date: ds, dow: d, weekend, holidays, phase, exams, events, classes, reason, week: weekOfTerm(data, ds) };
}

/** First day on/after `ds` (exclusive if `strict`) that has classes, within 120 days. */
export function nextClassDay(data, ds, strict = true) {
  for (let i = strict ? 1 : 0; i < 120; i++) {
    const info = dayInfo(data, addDays(ds, i));
    if (info.classes.length) return info;
  }
  return null;
}

/** Build the ntfy notifications that should be delivered during Bangkok date `ds`. */
export function buildNotifications(data, ds) {
  const cfg = data.ntfy;
  const out = [];
  const push = (date, hm, n) => out.push({ at: bkkEpoch(date, hm), date, time: typeof hm === 'number' ? `${pad(Math.floor(hm / 60))}:${pad(hm % 60)}` : hm, ...n });
  const today = dayInfo(data, ds);
  const tomorrowDs = addDays(ds, 1);
  const tomorrow = dayInfo(data, tomorrowDs);

  // 1) Morning summary
  if (today.classes.length || today.exams.length) {
    const lines = today.classes.map((c) => `${fmtTime(c.start)}–${fmtTime(c.end)} ${c.code} ${c.course.name} • ${c.room}${c.isLab ? ' 🧪Lab' : ''}`);
    today.exams.forEach((x) => lines.push(`📝 ${fmtTime(x.start)} สอบ ${x.code}: ${x.title}`));
    const n = today.classes.length;
    push(ds, cfg.morningTime, {
      title: n ? `☀️ วันนี้มีเรียน ${n} คาบ` : '📝 วันนี้มีสอบ',
      message: lines.join('\n'), tags: ['sunrise'], priority: 3,
    });
  }
  // 2) Before each class
  today.classes.forEach((c) => {
    push(ds, toMin(c.start) - cfg.leadMinutes, {
      title: `${c.isLab ? '🧪' : '🚀'} อีก ${cfg.leadMinutes} นาที: ${c.code} ${c.course.name}`,
      message: `${fmtTime(c.start)}–${fmtTime(c.end)} น. • ห้อง ${c.room}${c.kind ? ' • ' + c.kind : ''}` +
        (c.topic ? `\nวันนี้เรียน: ${c.topic}` : ''),
      tags: [c.isLab ? 'test_tube' : 'rocket'], priority: 4,
    });
  });
  // 3) Exams today: 60 min before
  today.exams.forEach((x) => push(ds, toMin(x.start) - 60, {
    title: `📝 อีก 1 ชม. สอบ ${x.code} ${x.course ? x.course.name : ''}`,
    message: `${fmtTime(x.start)}–${fmtTime(x.end)} น. • ${x.title}`, tags: ['memo'], priority: 5,
  }));
  // 4) Timed events today: 30 min before
  today.events.filter((e) => e.start && e.date === ds).forEach((e) => push(ds, toMin(e.start) - 30, {
    title: `📌 อีก 30 นาที: ${e.title}`, message: `${fmtTime(e.start)}–${fmtTime(e.end)} น.`, tags: ['pushpin'], priority: 4,
  }));

  // 5) Evening heads-up about tomorrow and the days after
  const ev = toMin(cfg.eveningTime);
  let k = 0;
  const evening = (n) => push(ds, ev + (k++), n);
  const todayHolidayNames = new Set(today.holidays.map((h) => h.name));
  const newHolidays = today.holidays.length ? [] : tomorrow.holidays.filter((h) => !todayHolidayNames.has(h.name) && (h.start || !tomorrow.weekend));
  if (newHolidays.length) {
    evening({
      title: `🎉 พรุ่งนี้วันหยุด: ${newHolidays.map((h) => h.name).join(' / ')}`,
      message: newHolidays.map((h) => (h.start ? `หยุด ${thaiDate(h.start, { short: true })} – ${thaiDate(h.end, { short: true })}` : thaiDate(h.date)) + (h.note ? `\nℹ️ ${h.note}` : '')).join('\n'),
      tags: ['tada'], priority: 4,
    });
  } else if (cfg.notifyFreeWeekday && tomorrow.reason === 'free') {
    const extra = [...tomorrow.exams.map((x) => `📝 ${fmtTime(x.start)} สอบ ${x.code}: ${x.title}`), ...tomorrow.events.map((e) => `📌 ${e.title}`)];
    evening({
      title: `🌙 พรุ่งนี้วัน${TH_DAYS[tomorrow.dow]}ว่าง ไม่มีคาบเรียน`,
      message: extra.length ? extra.join('\n') : 'พักผ่อนให้เต็มที่ หรือทบทวนบทเรียนนะ ✨', tags: ['crescent_moon'], priority: 3,
    });
  }
  // Back to class after a break (holiday block / exam week), not after a normal weekend
  if (tomorrow.classes.length) {
    let gap = 0;
    for (let i = 1; i <= 10; i++) { if (dayInfo(data, addDays(tomorrowDs, -i)).classes.length) break; gap++; }
    if (gap >= 4 && gap < 10) evening({
      title: '📚 พรุ่งนี้กลับมาเรียนแล้ว',
      message: tomorrow.classes.map((c) => `${fmtTime(c.start)} ${c.code} ${c.course.name} • ${c.room}`).join('\n'),
      priority: 4,
    });
  }
  // Labs N days ahead
  [...cfg.labRemindDays].sort((a, b) => b - a).forEach((n) => {
    const info = dayInfo(data, addDays(ds, n));
    info.classes.filter((c) => c.isLab).forEach((c) => evening({
      title: `🧪 ${n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`} มี Lab${c.quiz ? (c.quiz.sure ? ' + ควิซ' : ' (อาจมีควิซ)') : ''}: ${c.code} ${c.course.name}`,
      message: `${thaiDate(info.date)} ${fmtTime(c.start)}–${fmtTime(c.end)} น. • ห้อง ${c.room}` + (c.topic ? `\nหัวข้อ: ${c.topic}` : '') + `\n${quizLine(c)}` + '\nเตรียมเสื้อกาวน์/สมุดแล็บให้พร้อม',
      tags: ['test_tube'], priority: 4,
    }));
  });
  // Exams N days ahead
  [...cfg.examRemindDays].sort((a, b) => b - a).forEach((n) => {
    const byCourse = {};
    examsOn(data, addDays(ds, n)).forEach((x) => (byCourse[x.code] ||= []).push(x));
    Object.values(byCourse).forEach((xs) => evening({
      title: `📝 ${n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`} สอบ ${xs[0].code} ${xs[0].course ? xs[0].course.name : ''}`,
      message: `${thaiDate(xs[0].date)}\n` + xs.map((x) => `${fmtTime(x.start)}–${fmtTime(x.end)} น. ${x.title}`).join('\n'), tags: ['memo'], priority: 4,
    }));
  });
  // Events with remindDays
  const maxAhead = Math.max(1, ...data.events.flatMap((e) => e.remindDays || []));
  for (let n = 1; n <= maxAhead; n++) {
    const target = addDays(ds, n);
    data.events.filter((e) => (e.date || e.start) === target && (e.remindDays || []).includes(n)).forEach((e) => evening({
      title: `${e.type === 'it' ? '💻' : '📌'} ${n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`}: ${e.title}`,
      message: `${thaiDate(target)}${e.start && e.date ? ` เวลา ${fmtTime(e.start)}–${fmtTime(e.end)} น.` : ''}`,
      tags: [e.type === 'it' ? 'computer' : 'pushpin'], priority: 4,
    }));
  }
  // Assignments: heads-up 3 days and 1 day before (evening), plus the morning of the due day
  const taskList = data.tasks || [];
  for (const n of [3, 1]) {
    const target = addDays(ds, n);
    taskList.filter((t) => t.due === target).forEach((t) => evening({
      title: `📋 ${n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`}ส่งงาน${t.code ? ' ' + t.code : ''}`,
      message: `${t.title}\nส่ง ${thaiDate(target)}${t.time ? ` ก่อน ${fmtTime(t.time)} น.` : ''}${t.how ? `\nวิธีส่ง: ${t.how}` : ''}`,
      priority: n === 1 ? 5 : 4,
    }));
  }
  taskList.filter((t) => t.due === ds).forEach((t, i) => push(ds, toMin(cfg.morningTime) + 1 + i, {
    title: `📋 วันนี้ส่งงาน${t.code ? ' ' + t.code : ''}`,
    message: `${t.title}${t.time ? `\nก่อน ${fmtTime(t.time)} น.` : ''}${t.how ? `\nวิธีส่ง: ${t.how}` : ''}`,
    priority: 5,
  }));
  // Special day (e.g. birthday): one heads-up a week before
  if (data.special) {
    const sp = data.special, n = sp.remindDays || 7;
    const target = addDays(ds, n);
    const [, tm, td] = parseDS(target);
    if (tm === sp.month && td === sp.day) evening({
      title: `${sp.emoji || '💖'} อีก ${n} วัน ${sp.title}!`,
      message: `${thaiDate(target)}\nเตรียมของขวัญ/เซอร์ไพรส์ให้พร้อมนะ 🎁`, priority: 5,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
