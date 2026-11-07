// Schedules today's ntfy notifications (Bangkok time) using ntfy's delayed delivery.
// Run once early each morning by GitHub Actions. Safe to run more than once a day:
// messages already scheduled (same title + delivery time) are skipped.
//
//   node notify/send.mjs            -> schedule for today (Bangkok)
//   DATE=2026-11-12 DRY=1 node notify/send.mjs   -> preview a given day, send nothing
import { readFile } from 'node:fs/promises';
import { buildNotifications, bkkNow } from '../js/core.js';

const data = JSON.parse(await readFile(new URL('../data/schedule.json', import.meta.url), 'utf8'));
const server = (process.env.NTFY_SERVER || data.ntfy.server).replace(/\/$/, '');
const topic = process.env.NTFY_TOPIC || data.ntfy.topic;
const date = process.env.DATE || bkkNow().date;
const dry = !!process.env.DRY;
const siteUrl = process.env.SITE_URL || data.siteUrl || '';
const headers = process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {};

const list = buildNotifications(data, date);
const nowSec = Math.floor(Date.now() / 1000);
console.log(`[${date}] ${list.length} notification(s) for topic "${topic}"`);

let existing = new Set();
if (!dry) {
  try {
    const r = await fetch(`${server}/${topic}/json?poll=1&since=24h&scheduled=1`, { headers });
    const text = await r.text();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      if (m.event === 'message') existing.add(`${m.title}|${m.time}`);
    }
  } catch (e) { console.warn('Could not poll existing messages:', e.message); }
}

let sent = 0;
for (const n of list) {
  const label = `${n.time}  ${n.title}`;
  // If GitHub started the job late, still deliver anything up to 45 min overdue.
  if (n.at < nowSec - 45 * 60) { console.log('  skip (past)  ', label); continue; }
  if (existing.has(`${n.title}|${n.at}`)) { console.log('  skip (dup)   ', label); continue; }
  if (dry) { console.log('  DRY          ', label, '\n                ', n.message.replace(/\n/g, '\n                 ')); continue; }
  const body = { topic, title: n.title, message: n.message, priority: n.priority }; // emoji already in title
  if (n.at > nowSec + 30) body.delay = String(n.at); // ntfy delayed delivery (max 3 days)
  if (siteUrl) body.click = siteUrl;
  const r = await fetch(server, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { console.error('  FAILED       ', label, r.status, await r.text()); process.exitCode = 1; continue; }
  sent++;
  console.log('  scheduled    ', label);
}
console.log(`Done: ${sent} sent/scheduled.`);
