// Tiny synthesized sound effects (Web Audio, no files to download).
let ctx = null;
let master = null;
let enabled = true;
try { enabled = localStorage.getItem('sfx') !== 'off'; } catch (_) {}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// iOS: audio must be unlocked by a user gesture.
window.addEventListener('pointerdown', () => { if (enabled) ac(); }, { once: true, passive: true });

function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.15, vol = 0.3, attack = 0.005 }) {
  const c = ac(); if (!c) return;
  const now = c.currentTime + t;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now); o.stop(now + dur + 0.02);
}
let noiseBuf = null;
function noise({ t = 0, dur = 0.5, vol = 0.2, from = 400, to = 4000, q = 1.2 }) {
  const c = ac(); if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const now = c.currentTime + t;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, now); f.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f).connect(g).connect(master);
  s.start(now); s.stop(now + dur + 0.05);
}

export const sfx = {
  get enabled() { return enabled; },
  set(on) { enabled = on; try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch (_) {} if (on) ac(); },
  /** cute "bloop" for any button */
  tap() { if (!enabled) return; tone({ f0: 620, f1: 1240, dur: 0.11, vol: 0.22 }); tone({ type: 'triangle', f0: 1240, f1: 1560, t: 0.06, dur: 0.1, vol: 0.12 }); },
  /** sparkly chime when a page arrives */
  chime() { if (!enabled) return; [1046, 1318, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f0: f, t: 0.05 + i * 0.06, dur: 0.22, vol: 0.09 })); },
  /** big bang + warp whoosh when switching functions */
  warp() {
    if (!enabled) return;
    tone({ f0: 140, f1: 38, dur: 0.6, vol: 0.4, attack: 0.01 });
    noise({ dur: 0.9, vol: 0.18, from: 300, to: 5200, q: 0.9 });
    tone({ type: 'sawtooth', f0: 220, f1: 880, t: 0.05, dur: 0.5, vol: 0.04 });
  },
  /** soft blip for day/month arrows */
  blip(dir = 1) { if (!enabled) return; tone({ type: 'sine', f0: dir > 0 ? 880 : 700, f1: dir > 0 ? 1320 : 520, dur: 0.12, vol: 0.18 }); },
  toggle(on) { if (!enabled && !on) return; tone({ f0: on ? 660 : 880, f1: on ? 1320 : 440, dur: 0.16, vol: 0.2 }); },
};
