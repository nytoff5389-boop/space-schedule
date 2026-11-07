// Foreground star layer: slow parallax drift (we are flying through space) and a brief
// light-speed streak when switching pages. One 2D canvas, ~30 fps idle, pauses when hidden.
const canvas = document.getElementById('space');
const g = canvas.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// realistic star colours (O/B blue-white → K orange)
const COLORS = ['#ffffff', '#f4f7ff', '#dfe8ff', '#fff4e6', '#ffe2c4', '#cfdcff'];
let W = 0, H = 0, DPR = 1, stars = [];
let warp = 0, warpTarget = 0, warpUntil = 0;
let raf = 0, last = performance.now(), lastDraw = 0, running = true;

function mkStar(y) {
  const z = Math.random() ** 2.2 * .9 + .1;
  return { x: Math.random() * W, y, z, r: .35 + z * 1.1, c: COLORS[(Math.random() * COLORS.length) | 0] };
}
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 1.5);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.max(80, Math.min(240, Math.round((W * H) / 4000)));
  stars = Array.from({ length: n }, () => mkStar(Math.random() * H));
  draw(0);
}
function draw(dt) {
  const now = performance.now();
  if (now > warpUntil) warpTarget = 0;
  warp += (warpTarget - warp) * Math.min(1, dt * (warpTarget ? .005 : .003));
  const speed = .004 + warp * 1.1;
  g.clearRect(0, 0, W, H);
  const streak = warp > .03;
  for (const s of stars) {
    s.y += speed * s.z * dt;
    if (s.y > H + 40) Object.assign(s, mkStar(-5 - Math.random() * 30));
    g.globalAlpha = .25 + .7 * s.z;
    if (streak) {
      g.strokeStyle = s.c; g.lineWidth = s.r;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x, s.y - Math.min(160, speed * s.z * 22)); g.stroke();
    } else {
      g.fillStyle = s.c;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill();
    }
  }
  g.globalAlpha = 1;
}
function busy() { return warpTarget || warp > .01; }
function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(50, now - last); last = now;
  if (busy() || now - lastDraw > 33) { draw(busy() ? dt : Math.min(60, now - lastDraw)); lastDraw = now; }
}
export function warpJump(ms = 650) {
  if (reduce) return;
  warpTarget = 1; warpUntil = performance.now() + ms;
}
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (!running) { cancelAnimationFrame(raf); raf = 0; }
  else if (!reduce && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
});
addEventListener('resize', resize, { passive: true });
resize();
if (!reduce) raf = requestAnimationFrame(loop);
