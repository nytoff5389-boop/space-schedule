// Lightweight animated space background: parallax stars, shooting stars,
// warp-speed streaks, asteroids and big-bang particle bursts. One canvas, no libraries.
const canvas = document.getElementById('space');
const g = canvas.getContext('2d', { alpha: true });
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#ffffff', '#cfe8ff', '#ffe9c7', '#d9ccff'];
let W = 0, H = 0, DPR = 1;
let stars = [];
let rocks = [];
let parts = [];
let shooters = [];
let warp = 0;          // current speed multiplier boost (0..1)
let warpTarget = 0;
let warpUntil = 0;
let last = performance.now();
let nextShooter = last + 3000;
let running = true;
let raf = 0;
let lastDraw = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const count = Math.max(110, Math.min(360, Math.round((W * H) / 2600)));
  stars = Array.from({ length: count }, () => mkStar(Math.random() * H));
  if (reduce) drawFrame(0);
}
function mkStar(y) {
  const z = Math.random() ** 1.8 * 0.9 + 0.1; // depth: most stars are far
  return { x: Math.random() * W, y, z, r: 0.4 + z * 1.5, tw: Math.random() * 6.28, c: COLORS[(Math.random() * COLORS.length) | 0] };
}

// ---------- Asteroid sprites (pre-rendered once) ----------
const rockSprites = [];
function makeRock(size) {
  const c = document.createElement('canvas');
  const s = Math.ceil(size * 2.4);
  c.width = c.height = s;
  const x = c.getContext('2d');
  const cx = s / 2, cy = s / 2, n = 11;
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = size * (0.72 + Math.random() * 0.36);
    x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  const grd = x.createRadialGradient(cx - size * 0.35, cy - size * 0.4, size * 0.1, cx, cy, size * 1.1);
  grd.addColorStop(0, '#b8a99a'); grd.addColorStop(0.45, '#6b5d52'); grd.addColorStop(1, '#1c1714');
  x.fillStyle = grd; x.fill();
  x.save(); x.clip();
  for (let i = 0; i < 5; i++) { // craters
    const px = cx + (Math.random() - 0.5) * size, py = cy + (Math.random() - 0.5) * size, pr = size * (0.08 + Math.random() * 0.16);
    const cg = x.createRadialGradient(px + pr * 0.3, py + pr * 0.3, 0, px, py, pr);
    cg.addColorStop(0, 'rgba(0,0,0,.55)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = cg; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
  }
  x.restore();
  x.strokeStyle = 'rgba(255,200,150,.25)'; x.lineWidth = 1; x.stroke(); // rim light
  return c;
}
function ensureRocks() { if (!rockSprites.length) for (let i = 0; i < 5; i++) rockSprites.push(makeRock(14 + i * 6)); }

// ---------- Public API ----------
export function warpJump(ms = 950) {
  if (reduce) return;
  ensureRocks();
  warpTarget = 1; warpUntil = performance.now() + ms;
  const n = 4 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const sp = rockSprites[(Math.random() * rockSprites.length) | 0];
    rocks.push({
      sp, x: W * (0.1 + Math.random() * 0.8), y: -60 - Math.random() * H * 0.6,
      vx: (Math.random() - 0.5) * 0.25, vy: 0.9 + Math.random() * 0.9,
      a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.012, s: 0.6 + Math.random() * 0.9,
    });
  }
  kick();
}
export function bigBang(x, y) {
  if (reduce) return;
  const hues = ['#ffffff', '#fde68a', '#f9a8d4', '#a5b4fc', '#67e8f9', '#fb923c'];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, v = 0.15 + Math.random() ** 0.6 * 0.75;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.0009 + Math.random() * 0.0011, r: 0.8 + Math.random() * 2.4, c: hues[(Math.random() * hues.length) | 0] });
  }
  kick();
}

// ---------- Loop ----------
function drawFrame(dt) {
  const now = performance.now();
  if (now > warpUntil) warpTarget = 0;
  warp += (warpTarget - warp) * Math.min(1, dt * (warpTarget ? 0.006 : 0.0035));
  const speed = 0.006 + warp * 1.6; // px per ms for z=1

  g.clearRect(0, 0, W, H);
  // stars
  const streak = warp > 0.04;
  g.lineCap = 'round';
  for (const s of stars) {
    s.y += speed * s.z * dt * (streak ? 1 : 1);
    s.tw += dt * 0.002 * (0.5 + s.z);
    if (s.y > H + 40) { Object.assign(s, mkStar(-10 - Math.random() * 30)); }
    const alpha = 0.35 + 0.65 * s.z * (0.75 + 0.25 * Math.sin(s.tw));
    g.globalAlpha = alpha;
    if (streak) {
      const len = Math.min(220, speed * s.z * 26);
      g.strokeStyle = s.c; g.lineWidth = s.r;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x, s.y - len); g.stroke();
    } else {
      g.fillStyle = s.c;
      if (s.r > 1.3) { g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill(); g.globalAlpha = alpha * 0.18; g.beginPath(); g.arc(s.x, s.y, s.r * 3.2, 0, 6.283); g.fill(); }
      else g.fillRect(s.x, s.y, s.r * 1.4, s.r * 1.4);
    }
  }
  g.globalAlpha = 1;

  // shooting stars
  if (!reduce && now > nextShooter && !streak) {
    shooters.push({ x: Math.random() * W * 0.8 + W * 0.2, y: Math.random() * H * 0.4, vx: -0.9 - Math.random() * 0.6, vy: 0.35 + Math.random() * 0.3, life: 1 });
    nextShooter = now + 4000 + Math.random() * 7000;
  }
  for (let i = shooters.length - 1; i >= 0; i--) {
    const m = shooters[i];
    m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 0.0012;
    if (m.life <= 0) { shooters.splice(i, 1); continue; }
    const grd = g.createLinearGradient(m.x, m.y, m.x - m.vx * 120, m.y - m.vy * 120);
    grd.addColorStop(0, `rgba(255,255,255,${m.life})`); grd.addColorStop(1, 'rgba(147,197,253,0)');
    g.strokeStyle = grd; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 120, m.y - m.vy * 120); g.stroke();
  }

  // asteroids
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    r.x += r.vx * dt; r.y += r.vy * dt * (0.5 + warp); r.a += r.va * dt;
    if (r.y > H + 120) { rocks.splice(i, 1); continue; }
    const w = r.sp.width * r.s;
    g.save(); g.translate(r.x, r.y); g.rotate(r.a); g.drawImage(r.sp, -w / 2, -w / 2, w, w); g.restore();
  }

  // big-bang particles
  if (parts.length) {
    g.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; p.life -= p.decay * dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      g.globalAlpha = p.life; g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, p.r * (0.6 + p.life), 0, 6.283); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

function busy() { return warp > 0.01 || warpTarget || rocks.length || parts.length || shooters.length; }
function loop(now) {
  raf = 0;
  if (!running) return;
  const dt = Math.min(50, now - last);
  // Idle: ~30 fps to save battery. Busy (effects): full frame rate.
  if (busy() || now - lastDraw > 32) { drawFrame(busy() ? dt : now - lastDraw); lastDraw = now; }
  last = now;
  raf = requestAnimationFrame(loop);
}
function kick() { if (!raf && running) { last = performance.now(); raf = requestAnimationFrame(loop); } }

document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running && !reduce) kick();
});
window.addEventListener('resize', resize, { passive: true });
resize();
if (!reduce) kick();
