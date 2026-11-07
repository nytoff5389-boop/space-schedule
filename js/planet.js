// Photoreal Earth (NASA Blue Marble based textures) + Moon, ray-traced per pixel in one
// lightweight shader: day/night side with city lights, moving clouds with shadows,
// ocean sun glint and an atmospheric limb glow. Renders ~20 fps, pauses when hidden.
import { createGL, program, loadTexture } from './gl.js';

const FRAG = `
precision highp float;
uniform vec2 res; uniform float time; uniform float aspectShift;
uniform sampler2D dayT, nightT, cloudT, specT;
const float PI = 3.14159265;
vec3 toLin(vec3 c){ return c*c; }
float sphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b*b - dot(oc,oc) + r*r;
  return h < 0. ? -1. : -b - sqrt(h);
}
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
vec2 sph(vec3 n){ return vec2(atan(n.x, n.z)/(2.*PI) + .5, .5 - asin(clamp(n.y,-1.,1.))/PI); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*res) / res.y;
  vec3 ro = vec3(0.);
  vec3 rd = normalize(vec3(uv, -1.55));
  vec3 L = normalize(vec3(.95, .42, .30));
  vec3 sunCol = vec3(1., .96, .9);
  vec3 col = vec3(0.); float a = 0.;

  // ---- Earth ----
  vec3 C = vec3(.18 + aspectShift, -3.02, -4.2); float R = 2.6;
  float t = sphere(ro, rd, C, R);
  vec3 atmCol = vec3(.28, .55, 1.);
  if (t > 0.) {
    vec3 p = ro + rd*t; vec3 n = normalize(p - C); vec3 V = -rd;
    mat3 M = rotY(time*.006) * rotX(-.55) * rotZ(.41);
    vec3 ln = M * n;
    vec2 tc = sph(ln);
    float ndl = dot(n, L);
    float day = smoothstep(-.08, .25, ndl);
    vec3 albedo = toLin(texture2D(dayT, tc).rgb);
    vec2 ctc = tc + vec2(time*.0009, 0.);
    float cloud = texture2D(cloudT, ctc).r;
    float shadow = texture2D(cloudT, ctc + vec2(-.004, .002)).r;
    float spec = texture2D(specT, tc).r;
    vec3 night = toLin(texture2D(nightT, tc).rgb) * vec3(1.6, 1.25, .8);
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(n, H), 0.), 60.) * spec * (1. - cloud) * 1.6;
    vec3 surf = albedo * (1. - .55*shadow) * max(ndl, 0.) * sunCol * 1.25;
    surf += glint * sunCol * smoothstep(0., .2, ndl);
    surf = mix(surf, vec3(.95) * max(ndl + .05, 0.) * 1.1, cloud);
    surf += night * (1. - day) * (1. - cloud*.85) * .9;
    float fres = pow(1. - max(dot(n, V), 0.), 2.6);
    float lit = smoothstep(-.25, .55, ndl);
    surf = mix(surf, atmCol * lit, fres * .75);
    surf += atmCol * fres * lit * .35;
    col = surf; a = 1.;
  } else {
    // atmospheric halo just outside the limb
    vec3 oc = C - ro; float b = dot(oc, rd); vec3 cp = ro + rd*b;
    float d = length(cp - C) - R;
    if (d > 0. && b > 0.) {
      vec3 nn = normalize(cp - C);
      float lit = smoothstep(-.35, .6, dot(nn, L));
      float g = exp(-d / .055) * .9 + exp(-d / .22) * .18;
      col = atmCol * g * lit * 1.4 + vec3(.6,.75,1.) * exp(-d/.02) * lit * .4;
      a = clamp(g * lit * 1.2, 0., 1.);
    }
  }

  col = col / (1. + col * .35);     // soft tone map
  col = sqrt(col);                  // back to display gamma
  gl_FragColor = vec4(col * a, a);
}`;

export function startPlanets(canvas) {
  const gl = createGL(canvas);
  if (!gl) { canvas.remove(); return; }
  let prog;
  try { prog = program(gl, FRAG); } catch (e) { console.warn(e); canvas.remove(); return; }
  const { u } = prog;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = false, raf = 0, lastT = 0;
  const t0 = performance.now() - 120000;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u('res'), canvas.width, canvas.height);
    // On wide screens push the Earth to the right a little.
    const ar = innerWidth / innerHeight;
    gl.uniform1f(u('aspectShift'), Math.max(0, Math.min(.6, (ar - .6) * .45)));
    if (ready) draw(performance.now());
  }
  function draw(now) {
    gl.uniform1f(u('time'), (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - lastT < 50) return; // ~20 fps is plenty for a slowly turning planet
    lastT = now; draw(now);
  }
  Promise.all([
    loadTexture(gl, 'img/earth_day.jpg', 0), loadTexture(gl, 'img/earth_night.jpg', 1),
    loadTexture(gl, 'img/earth_clouds.jpg', 2), loadTexture(gl, 'img/earth_spec.jpg', 3),
  ]).then(() => {
    ['dayT', 'nightT', 'cloudT', 'specT'].forEach((n, i) => gl.uniform1i(u(n), i));
    ready = true; resize();
    canvas.classList.add('on');
    if (!reduce) raf = requestAnimationFrame(loop);
  }).catch((e) => console.warn('planet textures', e));

  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (ready && !reduce && !raf) raf = requestAnimationFrame(loop);
  });
  resize();
}
