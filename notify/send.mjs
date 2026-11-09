// Schedules today's ntfy notifications (Bangkok time) using ntfy's delayed delivery.
// Runs every few hours on GitHub Actions. Safe to run any number of times:
// messages already scheduled (same title + delivery time) are skipped.
//
//   node notify/send.mjs            -> schedule for today (Bangkok)
//   DATE=2026-11-12 DRY=1 node notify/send.mjs   -> preview a given day, send nothing
import { readFile } from 'node:fs/promises';
import { buildNotifications, bkkNow, addDays } from '../js/core.js';

const data = JSON.parse(await readFile(new URL('../data/schedule.json', import.meta.url), 'utf8'));
const server = (process.env.NTFY_SERVER || data.ntfy.server).replace(/\/$/, '');
const topic = process.env.NTFY_TOPIC || data.ntfy.topic;
const date = process.env.DATE || bkkNow().date;
const dry = !!process.env.DRY;
const siteUrl = process.env.SITE_URL || data.siteUrl || '';
const headers = process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {};

// GitHub's scheduler can start a job hours late, so every run queues the next few days
// (ntfy holds delayed messages for up to 3 days). Duplicates are skipped below.
const DAYS = Number(process.env.DAYS || (process.env.DATE ? 1 : 3));
const nowSec = Math.floor(Date.now() / 1000);
const MAX_AHEAD = 3 * 86400 - 600;
const list = [];
for (let i = 0; i < DAYS; i++) list.push(...buildNotifications(data, addDays(date, i)));
console.log(`[${date} +${DAYS - 1}d] ${list.length} notification(s) for topic "${topic}"`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(2000 * 2 ** i); }
  }
}

let existing = new Set();
if (!dry) {
  try {
    const text = await withRetry(async () => {
      const r = await fetch(`${server}/${topic}/json?poll=1&since=all&scheduled=1`, { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      if (m.event === 'message') existing.add(`${m.title}|${m.time}`);
    }
    console.log(`${existing.size} message(s) already queued/delivered`);
  } catch (e) { console.warn('Could not poll existing messages:', e.message); }
}

let sent = 0, failed = 0;
for (const n of list) {
  const label = `${n.date} ${n.time}  ${n.title}`;
  // If GitHub started the job late, still deliver anything up to 45 min overdue.
  if (n.at < nowSec - 45 * 60) { console.log('  skip (past)  ', label); continue; }
  if (n.at > nowSec + MAX_AHEAD) { console.log('  later        ', label); continue; }
  if (existing.has(`${n.title}|${n.at}`)) { console.log('  skip (dup)   ', label); continue; }
  if (dry) { console.log('  DRY          ', label, '\n                ', n.message.replace(/\n/g, '\n                 ')); continue; }
  const body = { topic, title: n.title, message: n.message, priority: n.priority }; // emoji already in title
  if (n.at > nowSec + 30) body.delay = String(n.at); // ntfy delayed delivery (max 3 days)
  if (siteUrl) body.click = siteUrl;
  try {
    await withRetry(async () => {
      const r = await fetch(server, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
    });
    sent++; console.log('  scheduled    ', label);
  } catch (e) { failed++; console.error('  FAILED       ', label, e.message); }
}
console.log(`Done: ${sent} sent/scheduled, ${failed} failed.`);
if (failed) process.exitCode = 1;
