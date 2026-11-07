// Cinematic starship rendered in real time with a ray-marched signed-distance-field
// shader: armored wedge hull with plating, bridge tower, twin nacelles, three main
// thrusters with plasma plumes, rim light from the planet below and soft shadows.
// Small canvas only (the ship's bounding box), so it stays cheap on phones.
import { createGL, program } from './gl.js';

const FRAG = `
precision highp float;
uniform vec2 res; uniform float time; uniform float bank; uniform float thrust; uniform float yaw;
#define MAXS 84
float hash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q,0.)) + min(max(q.x,max(q.y,q.z)),0.); }
float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r,h); return min(max(d.x,d.y),0.) + length(max(d,0.)); }
float smin(float a, float b, float k){ float h = clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h) - k*h*(1.-h); }
mat2 r2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float mat;
float hull(vec3 p){
  // wedge hull: diamond cross-section, tapering to a sharp prow (-z)
  float d = sdBox(p, vec3(1.15, .34, 2.7));
  d = max(d, (abs(p.x) - .205*p.z - .62) / 1.021);
  d = max(d, (abs(p.y) + .30*abs(p.x) - .27 + .03*p.z) / 1.045);
  return d;
}
float map(vec3 p){
  mat = 1.;
  float d = hull(p);
  // armor plating steps on the dorsal side
  vec3 q = p; q.z = mod(q.z + .1, .55) - .275;
  d = min(d, max(sdBox(q - vec3(0., .2, 0.), vec3(.9, .08, .25)), hull(p) - .014));
  // greebles (surface detail) along the spine
  vec3 g = p; vec2 id = floor(g.xz / .22); g.xz = mod(g.xz, .22) - .11;
  float hh = hash(vec3(id, 1.));
  float gr = sdBox(g - vec3(0., .25 + hh*.03, 0.), vec3(.03 + hh*.03, .015 + hh*.03, .045));
  gr = max(gr, hull(p) - .045);
  gr = max(gr, abs(p.x) - .42 + .06*p.z);
  gr = max(gr, step(.55, hh) - .5);
  d = min(d, gr);
  // command bridge tower
  vec3 b = p - vec3(0., .43, 1.55);
  float br = sdBox(b, vec3(.24 - .1*b.y, .13, .5)) - .02;
  br = min(br, sdBox(b - vec3(0., .15, .12), vec3(.42, .025, .1)));
  br = min(br, sdCyl((b - vec3(0., .28, .25)).xzy, .015, .12));
  d = smin(d, br, .05);
  // rear engine block
  float eb = sdBox(p - vec3(0., -.01, 2.47), vec3(.74, .2, .28)) - .05;
  eb = max(eb, (abs(p.y) + .25*abs(p.x) - .3) / 1.03);
  d = min(d, eb);
  // three main thrusters
  vec3 e = p - vec3(0., -.01, 2.78); e.x = abs(e.x);
  vec3 e1 = e - vec3(0., 0., 0.); vec3 e2 = e - vec3(.52, 0., 0.);
  float th = min(sdCyl(e1, .19, .14), sdCyl(e2, .16, .13));
  float inner = min(sdCyl(e1 - vec3(0.,0.,.1), .14, .1), sdCyl(e2 - vec3(0.,0.,.1), .115, .1));
  th = max(th, -inner);
  d = min(d, th);
  // side nacelles + pylons
  vec3 n = p; n.x = abs(n.x);
  float nc = sdCyl(n - vec3(1.42, -.08, 1.55), .17, .85) - .02;
  nc = min(nc, sdBox(n - vec3(1.42, -.08, .62), vec3(.12, .1, .14)));
  float py = sdBox(n - vec3(1.12, -.06, 1.7), vec3(.34, .035, .38));
  float wing = sdBox(n - vec3(1.75, -.08, 1.95), vec3(.32, .02, .28));
  wing = max(wing, (n.z - 1.7 + (n.x - 1.5)*.9));
  d = min(d, min(min(nc, py), wing));
  // engine cores (emissive)
  float core = min(length(e1 - vec3(0.,0.,.06)) - .13, length(e2 - vec3(0.,0.,.06)) - .105);
  core = min(core, length(n - vec3(1.42, -.08, 2.42)) - .12);
  if (core < d) { mat = 2.; d = core; }
  // bridge windows
  float win = sdBox(b - vec3(0., .02, -.5), vec3(.16, .022, .02));
  if (win < d) { mat = 3.; d = win; }
  return d;
}
vec3 normal(vec3 p){ vec2 e = vec2(.0015, 0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float softShadow(vec3 ro, vec3 rd){
  float r = 1., t = .03;
  for (int i = 0; i < 22; i++) { float h = map(ro + rd*t); r = min(r, 10.*h/t); t += clamp(h, .03, .3); if (r < .02 || t > 4.) break; }
  return clamp(r, 0., 1.);
}
float ao(vec3 p, vec3 n){ float o = 0., s = 1.; for (int i = 1; i < 5; i++) { float h = .04*float(i); o += (h - map(p + n*h))*s; s *= .7; } return clamp(1. - 2.5*o, 0., 1.); }
// distance from ray to segment a-b
float segDist(vec3 ro, vec3 rd, vec3 a, vec3 b, out float h){
  vec3 ba = b - a, oa = ro - a;
  float rb = dot(rd, ba), ob = dot(oa, ba), bb = dot(ba, ba), ro2 = dot(oa, rd);
  float den = bb - rb*rb; float s = clamp((ob - rb*ro2)/max(den,1e-4), 0., 1.);
  float t = max(dot(a + ba*s - ro, rd), 0.);
  h = s; return length(ro + rd*t - (a + ba*s));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*res) / res.y;
  // camera: behind and above, looking down the ship toward the prow
  vec3 ro = vec3(2.35, 4.7, 9.0);
  ro.xz *= r2(yaw);
  vec3 ta = vec3(.1, -.55, .35);
  vec3 ww = normalize(ta - ro), uu = normalize(cross(ww, vec3(0.,1.,0.))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 2.2*ww);
  // bank the ship (rotate world around ship's long axis)
  mat2 B = r2(bank);
  vec3 ro2 = ro; ro2.xy *= B; vec3 rd2 = rd; rd2.xy *= B;
  ro2.y -= .05*sin(time*1.3);

  float t = 0.; float m = 0.; bool hit = false;
  for (int i = 0; i < MAXS; i++) {
    float h = map(ro2 + rd2*t);
    if (h < .0015*t) { hit = true; m = mat; break; }
    t += h * .9;
    if (t > 14.) break;
  }
  vec3 col = vec3(0.); float a = 0.;
  vec3 L = normalize(vec3(.8, .55, -.45));       // sun
  vec3 L2 = normalize(vec3(-.3, -1., .2));         // blue bounce light from the planet below
  float flick = .92 + .08*sin(time*37.) * sin(time*23.);
  vec3 engCol = vec3(.45, .75, 1.);
  if (hit) {
    vec3 p = ro2 + rd2*t; vec3 n = normal(p);
    if (m > 2.5) { col = vec3(1., .72, .38) * 1.6; }
    else if (m > 1.5) { col = mix(vec3(.85,.95,1.), engCol, .55) * (1.1 + 1.6*thrust) * flick; }
    else {
      // painted metal panels with weathering
      vec3 pid = floor(p * vec3(5., 8., 3.3) + vec3(0., 0., floor(p.x*5.)*.5));
      float pv = hash(pid);
      vec3 base = mix(vec3(.085, .09, .1), vec3(.2, .205, .215), pv*pv);
      base *= .85 + .15*hash(floor(p*24.));
      vec3 f = fract(p * vec3(5., 8., 3.3) + vec3(0., 0., floor(p.x*5.)*.5));
      float seam = smoothstep(.0, .03, min(min(f.x, 1.-f.x), min(f.z, 1.-f.z)));
      base *= .55 + .45*seam;
      if (abs(p.x) > .95 && abs(p.x) < 1.05 && p.y > 0. && p.z > -1.) base = vec3(.32, .05, .03); // red hull stripe
      float sh = softShadow(p + n*.01, L);
      float o = ao(p, n);
      float dif = max(dot(n, L), 0.) * sh;
      vec3 H = normalize(L - rd2);
      float spe = pow(max(dot(n, H), 0.), 48.) * sh * (.4 + .6*pv);
      float fre = pow(1. - max(dot(n, -rd2), 0.), 4.);
      col = base * (dif * vec3(1.15, 1.08, 1.) * 1.7 + max(dot(n, L2), 0.) * vec3(.10, .22, .5) + .03) * o;
      col += spe * vec3(1.,.95,.9) * 1.8 + fre * vec3(.25, .45, .9) * .25 * o;
      // engine light spill on the rear block
      col += engCol * .5 * thrust * smoothstep(2.3, 2.9, p.z) * max(n.z, 0.);
    }
    a = 1.;
  }
  // plasma plumes (additive glow, works with alpha)
  float glow = 0.; float hh;
  vec3 E[5]; E[0] = vec3(0., -.01, 2.84); E[1] = vec3(.52, -.01, 2.84); E[2] = vec3(-.52, -.01, 2.84); E[3] = vec3(1.42, -.08, 2.44); E[4] = vec3(-1.42, -.08, 2.44);
  float plume = .8 + 2.4*thrust;
  for (int i = 0; i < 5; i++) {
    vec3 s = E[i];
    float w = i == 0 ? .12 : .09;
    float dd = segDist(ro2, rd2, s, s + vec3(0., 0., plume), hh);
    if (hit && t < length(s - ro2) - .3) continue;
    glow += exp(-dd*dd / (w*w*(1. + 2.5*hh))) * (1. - hh) * (1. - hh) * .9;
    glow += .1 * exp(-dd / (w*1.1)) * (1. - hh) * (1. - hh);
  }
  glow *= flick;
  vec3 gcol = mix(engCol, vec3(1.), clamp(glow*.5, 0., 1.)) * glow;
  col += gcol; a = clamp(a + glow, 0., 1.);
  col = col / (1. + col*.25);
  col = pow(col, vec3(.4545));
  gl_FragColor = vec4(col * (a > 0. ? 1. : 0.), a);
}`;

export function startShip(canvas) {
  const gl = createGL(canvas);
  if (!gl) return null;
  let u;
  try { u = program(gl, FRAG).u; } catch (e) { console.warn(e); return null; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = 0, t0 = performance.now();
  // maneuver animation state
  let man = null; // {start, dur}
  const state = { bank: 0, thrust: 0, yaw: 0 };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(2, Math.round(r.width * dpr));
    canvas.height = Math.max(2, Math.round(r.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u('res'), canvas.width, canvas.height);
    draw(performance.now());
  }
  const ease = (x) => x < .5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2) / 2;
  function draw(now) {
    const time = (now - t0) / 1000;
    let bank = Math.sin(time * .5) * .06, thrust = .15 + .05 * Math.sin(time * 2.1), yaw = Math.sin(time * .23) * .12;
    if (man) {
      const k = (now - man.start) / man.dur;
      if (k >= 1) man = null;
      else {
        // roll one way, then the other (evasive maneuver) and fire the engines
        const s = Math.sin(k * Math.PI);
        bank += Math.sin(k * Math.PI * 2) * .55 * man.dir;
        thrust += s * .95;
        yaw += ease(k) * 0 + s * .18 * man.dir;
      }
    }
    gl.uniform1f(u('time'), time);
    gl.uniform1f(u('bank'), bank);
    gl.uniform1f(u('thrust'), thrust);
    gl.uniform1f(u('yaw'), yaw);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!man && now - last < 33) return; // idle: ~30 fps
    last = now; draw(now);
  }
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!reduce && !raf) raf = requestAnimationFrame(loop);
  });
  resize();
  if (!reduce) raf = requestAnimationFrame(loop);
  canvas.classList.add('on');
  return {
    maneuver(dir = Math.random() < .5 ? -1 : 1) { man = { start: performance.now(), dur: 1100, dir }; },
  };
}
