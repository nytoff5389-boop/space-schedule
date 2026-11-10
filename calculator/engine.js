// อัศวิน calculator engine: expression parser/evaluator, number formatting, solvers.
// Expressions are trees: arrays of atoms (strings) and template nodes
// ({t:'frac',a,b} {t:'mixed',w,a,b} {t:'sqrt',a} {t:'root',n,a} {t:'pow',a} {t:'logb',b,a} {t:'abs',a}).

export class CalcError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}
export const ERR_TEXT = {
  syntax: ['Syntax ERROR', 'รูปแบบการพิมพ์ไม่ถูกต้อง'],
  math: ['Math ERROR', 'คำนวณไม่ได้ / ค่าอยู่นอกขอบเขต'],
  arg: ['Argument ERROR', 'จำนวนค่าในวงเล็บไม่ถูกต้อง'],
  stack: ['Stack ERROR', 'นิพจน์ซับซ้อนเกินไป'],
  time: ['Time Out', 'หาคำตอบไม่พบ'],
};
const syntax = () => { throw new CalcError('syntax'); };
const matherr = () => { throw new CalcError('math'); };

// ---------- complex numbers ----------
export const C = (re, im = 0) => ({ re, im });
const isR = (z) => z.im === 0;
const add = (a, b) => C(a.re + b.re, a.im + b.im);
const sub = (a, b) => C(a.re - b.re, a.im - b.im);
const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => {
  if (isR(b)) { if (b.re === 0) matherr(); return C(a.re / b.re, a.im / b.re); }
  const d = b.re * b.re + b.im * b.im; if (d === 0) matherr();
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const neg = (a) => C(-a.re, -a.im);
const cabs = (a) => Math.hypot(a.re, a.im);
const carg = (a) => Math.atan2(a.im, a.re);
const cexp = (a) => { const m = Math.exp(a.re); return isR(a) ? C(m) : C(m * Math.cos(a.im), m * Math.sin(a.im)); };
const cln = (a) => C(Math.log(cabs(a)), carg(a));
const real = (z) => { if (!isR(z)) matherr(); return z.re; };

const SQUAREFREE = [];
for (let r = 2; r <= 200; r++) { let ok = true; for (let k = 2; k * k <= r; k++) if (r % (k * k) === 0) ok = false; if (ok) SQUAREFREE.push(r); }

// ---------- scientific constants (CATALOG) ----------
export const CONSTANTS = {
  NA: { label: 'N<sub>A</sub>', name: 'เลขอาโวกาโดร', v: 6.02214076e23 },
  R: { label: 'R', name: 'ค่าคงที่ของแก๊ส', v: 8.314462618 },
  k: { label: 'k', name: 'ค่าคงที่โบลต์ซมันน์', v: 1.380649e-23 },
  h: { label: 'h', name: 'ค่าคงที่ของพลังค์', v: 6.62607015e-34 },
  c0: { label: 'c<sub>0</sub>', name: 'ความเร็วแสง', v: 299792458 },
  F: { label: 'F', name: 'ค่าคงที่ฟาราเดย์', v: 96485.33212 },
  qe: { label: 'e', name: 'ประจุมูลฐาน', v: 1.602176634e-19 },
  me: { label: 'm<sub>e</sub>', name: 'มวลอิเล็กตรอน', v: 9.1093837015e-31 },
  mp: { label: 'm<sub>p</sub>', name: 'มวลโปรตอน', v: 1.67262192369e-27 },
  u: { label: 'u', name: 'หน่วยมวลอะตอม', v: 1.66053906660e-27 },
  g: { label: 'g', name: 'ความเร่งโน้มถ่วง', v: 9.80665 },
  atm: { label: 'atm', name: 'ความดันบรรยากาศ (Pa)', v: 101325 },
  Vm: { label: 'V<sub>m</sub>', name: 'ปริมาตรโมลาร์ (STP, L)', v: 22.41396954 },
  G: { label: 'G', name: 'ค่าคงที่โน้มถ่วง', v: 6.67430e-11 },
};

// ---------- tokens ----------
export const FUNCS = new Set(['sin(', 'cos(', 'tan(', 'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'sinh(', 'cosh(', 'tanh(', 'sinh⁻¹(', 'cosh⁻¹(', 'tanh⁻¹(',
  'ln(', 'log(', 'Abs(', 'Int(', 'Intg(', 'GCD(', 'LCM(', 'RanInt#(', 'Arg(', 'Conjg(', 'ReP(', 'ImP(', 'Neg(', 'Not(', '∫(', 'd/dx(', 'Σ(', 'Π(', 'Rnd(', 'Pol(', 'Rec(']);
const VARS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'x', 'y', 'z', 'M']);
const isDigit = (t) => typeof t === 'string' && t.length === 1 && t >= '0' && t <= '9';
const isNode = (t) => t && typeof t === 'object';

function startsPrimary(t, ctx) {
  if (t === undefined) return false;
  if (isNode(t)) return t.t !== 'pow';
  if (isDigit(t) || t === '.' || t === '(') return true;
  if (FUNCS.has(t)) return true;
  if (t === 'π' || t === 'e' || t === 'i' || t === 'Ans' || t === 'Ran#' || t.startsWith('§')) return true;
  if (VARS.has(t)) return true;
  return false;
}

// ---------- angle helpers ----------
const toRad = (v, ang) => ang === 'deg' ? v * Math.PI / 180 : ang === 'gra' ? v * Math.PI / 200 : v;
const fromRad = (v, ang) => ang === 'deg' ? v * 180 / Math.PI : ang === 'gra' ? v * 200 / Math.PI : v;
function exactDeg(v, ang) { // angle in degrees if close to multiple of 15°, else null
  const d = ang === 'deg' ? v : ang === 'gra' ? v * 0.9 : v * 180 / Math.PI;
  const k = d / 15; if (Math.abs(k - Math.round(k)) < 1e-11 * Math.max(1, Math.abs(k))) return ((Math.round(k) * 15) % 360 + 360) % 360;
  return null;
}
function sinA(v, ang) {
  const d = exactDeg(v, ang);
  if (d !== null && d % 30 === 0) return { 0: 0, 30: .5, 60: Math.sqrt(3) / 2, 90: 1, 120: Math.sqrt(3) / 2, 150: .5, 180: 0, 210: -.5, 240: -Math.sqrt(3) / 2, 270: -1, 300: -Math.sqrt(3) / 2, 330: -.5 }[d];
  return Math.sin(toRad(v, ang));
}
function cosA(v, ang) {
  const d = exactDeg(v, ang);
  if (d !== null && d % 30 === 0) return sinA(ang === 'deg' ? v + 90 : ang === 'gra' ? v + 100 : v + Math.PI / 2, ang);
  return Math.cos(toRad(v, ang));
}
function tanA(v, ang) {
  const d = exactDeg(v, ang);
  if (d !== null) { if (d % 180 === 90) matherr(); if (d % 180 === 0) return 0; if (d % 180 === 45) return 1; if (d % 180 === 135) return -1; }
  return Math.tan(toRad(v, ang));
}

function fact(n) {
  if (!Number.isInteger(n) || n < 0 || n > 69) matherr();
  let r = 1; for (let k = 2; k <= n; k++) r *= k; return r;
}
function nPr(n, r) {
  if (![n, r].every(Number.isInteger) || r < 0 || n < r || n >= 1e10) matherr();
  let v = 1; for (let k = 0; k < r; k++) { v *= n - k; if (v > 1e100) matherr(); } return v;
}
function nCr(n, r) {
  if (![n, r].every(Number.isInteger) || r < 0 || n < r || n >= 1e10) matherr();
  r = Math.min(r, n - r); let v = 1; for (let k = 1; k <= r; k++) { v = v * (n - r + k) / k; if (v > 1e100) matherr(); }
  return Math.round(v);
}
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

function realPow(a, b) {
  if (a === 0 && b <= 0) matherr();
  if (a < 0 && !Number.isInteger(b)) {
    const q = 1 / b, qr = Math.round(q);
    if (Math.abs(q - qr) < 1e-10 && Math.abs(qr) % 2 === 1) return -Math.pow(-a, b);
    // p/q with odd q: (−8)^(2/3) = 4
    const f = toFrac(b, 99);
    if (f && f.d % 2 === 1) { const m = Math.pow(-a, Math.abs(f.n) / f.d * Math.sign(b)); return f.n % 2 ? -m : m; }
    matherr();
  }
  return Math.pow(a, b);
}
function cpow(a, b, ctx) {
  if (isR(a) && isR(b)) {
    if (ctx.mode === 'complex' && a.re < 0 && !Number.isInteger(b.re)) return cexp(mul(b, cln(a)));
    return C(realPow(a.re, b.re));
  }
  if (isR(b) && Number.isInteger(b.re) && Math.abs(b.re) <= 4096) {
    let n = Math.abs(b.re), r = C(1), x = a;
    while (n) { if (n & 1) r = mul(r, x); x = mul(x, x); n >>= 1; }
    return b.re < 0 ? div(C(1), r) : r;
  }
  if (a.re === 0 && a.im === 0) matherr();
  return cexp(mul(b, cln(a)));
}
function csqrt(a, ctx) {
  if (isR(a)) {
    if (a.re >= 0) return C(Math.sqrt(a.re));
    if (ctx.mode === 'complex') return C(0, Math.sqrt(-a.re));
    matherr();
  }
  const m = cabs(a); return C(Math.sqrt((m + a.re) / 2), Math.sign(a.im) * Math.sqrt((m - a.re) / 2));
}
function nroot(n, x, ctx) {
  const nn = real(n);
  if (nn === 0) matherr();
  if (isR(x) && x.re < 0 && Number.isInteger(nn) && Math.abs(nn) % 2 === 1) return C(-Math.pow(-x.re, 1 / nn));
  return cpow(x, C(1 / nn), ctx);
}

// ---------- base-n integer helpers ----------
const I32 = (v) => { if (!Number.isFinite(v) || v > 4294967295 || v < -2147483648) matherr(); return v > 2147483647 ? v - 4294967296 : v; };

// ---------- parser ----------
class Parser {
  constructor(list, ctx) { this.l = list; this.i = 0; this.ctx = ctx; this.depth = (ctx.depth || 0); if (this.depth > 60) throw new CalcError('stack'); }
  peek() { return this.l[this.i]; }
  next() { return this.l[this.i++]; }
  sub(list) { const c = { ...this.ctx, depth: this.depth + 1 }; return evalList(list, c); }
  full() {
    const v = this.logical();
    if (this.i < this.l.length) syntax();
    return v;
  }
  logical() {
    let a = this.additive();
    for (;;) {
      const t = this.peek();
      if (!['and', 'or', 'xor', 'xnor'].includes(t)) return a;
      this.next(); const b = this.additive();
      const x = real(a) | 0, y = real(b) | 0;
      a = C(I32(t === 'and' ? x & y : t === 'or' ? x | y : t === 'xor' ? x ^ y : ~(x ^ y)));
    }
  }
  additive() {
    let a = this.mult();
    for (;;) {
      const t = this.peek();
      if (t !== '+' && t !== '−') return a;
      this.next(); const b = this.mult();
      a = t === '+' ? add(a, b) : sub(a, b);
      if (this.ctx.mode === 'base') a = C(I32(a.re));
    }
  }
  mult() {
    let a = this.implicit();
    for (;;) {
      const t = this.peek();
      if (t !== '×' && t !== '÷' && t !== '∠') return a;
      this.next(); const b = this.implicit();
      if (t === '×') a = mul(a, b);
      else if (t === '÷') { a = div(a, b); if (this.ctx.mode === 'base') a = C(I32(Math.trunc(a.re))); }
      else { const r = real(a), th = toRad(real(b), this.ctx.angle); a = C(r * Math.cos(th), r * Math.sin(th)); }
      if (this.ctx.mode === 'base') a = C(I32(a.re));
    }
  }
  implicit() {
    let a = this.perm();
    while (startsPrimary(this.peek(), this.ctx)) {
      // in Base-N, letters A-F belong to the number itself
      const b = this.perm(); a = mul(a, b);
    }
    return a;
  }
  perm() {
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      if (t !== 'P' && t !== 'C') return a;
      this.next(); const b = this.unary();
      a = C(t === 'P' ? nPr(real(a), real(b)) : nCr(real(a), real(b)));
    }
  }
  unary() {
    const t = this.peek();
    if (t === '−') { this.next(); const v = neg(this.unary()); return this.ctx.mode === 'base' ? C(I32(v.re)) : v; }
    if (t === '+') { this.next(); return this.unary(); }
    return this.power();
  }
  power() {
    const base = this.postfix();
    const exps = [];
    while (isNode(this.peek()) && this.peek().t === 'pow') {
      exps.push(this.sub(this.next().a));
      // postfix operators after an exponent apply to the whole power
    }
    if (!exps.length) return base;
    let e = exps[exps.length - 1];
    for (let k = exps.length - 2; k >= 0; k--) e = cpow(exps[k], e, this.ctx);
    return this.postfixOps(cpow(base, e, this.ctx));
  }
  postfix() { return this.postfixOps(this.primary()); }
  postfixOps(v) {
    for (;;) {
      const t = this.peek();
      if (t === '²') { this.next(); v = mul(v, v); }
      else if (t === '³') { this.next(); v = mul(mul(v, v), v); }
      else if (t === '⁻¹') { this.next(); v = div(C(1), v); }
      else if (t === '!') { this.next(); v = C(fact(real(v))); }
      else if (t === '%') { this.next(); v = C(real(v) / 100); }
      else if (t === 'ᵒ') { this.next(); v = C(fromRad(real(v) * Math.PI / 180, this.ctx.angle)); }
      else if (t === '°') { // sexagesimal input: d°m°s°
        this.next(); let d = real(v);
        for (const div of [60, 3600]) {
          const save = this.i;
          if (!(isDigit(this.peek()) || this.peek() === '.')) break;
          const part = real(this.number());
          if (this.peek() !== '°') { this.i = save; break; }
          this.next(); d += Math.sign(d || 1) * part / div;
        }
        v = C(d);
      }
      else if (t === 'ʳ') { this.next(); v = C(fromRad(real(v), this.ctx.angle)); }
      else if (t === 'ᵍ') { this.next(); v = C(fromRad(real(v) * Math.PI / 200, this.ctx.angle)); }
      else return v;
      if (!Number.isFinite(v.re) || !Number.isFinite(v.im)) matherr();
    }
  }
  number() {
    const ctx = this.ctx;
    let s = '';
    const isNumChar = (t) => isDigit(t) || t === '.' || (ctx.mode === 'base' && ctx.base === 16 && /^[A-F]$/.test(t));
    while (isNumChar(this.peek())) s += this.next();
    if (ctx.mode === 'base') {
      if (s.includes('.')) syntax();
      const digits = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9A-F]+$/ }[ctx.base];
      if (!digits.test(s)) syntax();
      const v = parseInt(s, ctx.base);
      if (ctx.base === 10) return C(I32(v));
      if (v > 4294967295) matherr();
      return C(I32(v));
    }
    if ((s.match(/\./g) || []).length > 1 || s === '.') syntax();
    let exp = '';
    if (this.peek() === 'E') {
      this.next();
      if (this.peek() === '−') { this.next(); exp = '-'; } else if (this.peek() === '+') this.next();
      let d = ''; while (isDigit(this.peek())) d += this.next();
      if (!d) syntax();
      exp += d;
    }
    return C(parseFloat((s || '1') + (exp ? 'e' + exp : '')));
  }
  args() { // after 'fn(' : comma separated, closing ')' optional at end
    const out = [this.logical()];
    while (this.peek() === ',') { this.next(); out.push(this.logical()); }
    if (this.peek() === ')') this.next(); else if (this.i < this.l.length) syntax();
    return out;
  }
  rawArgs() { // returns array of item-lists split on top-level commas
    const parts = [[]]; let depth = 0;
    while (this.i < this.l.length) {
      const t = this.next();
      if (t === '(' || FUNCS.has(t)) depth++;
      if (t === ')') { if (depth === 0) break; depth--; }
      if (t === ',' && depth === 0) { parts.push([]); continue; }
      parts[parts.length - 1].push(t);
    }
    return parts;
  }
  primary() {
    const t = this.peek(), ctx = this.ctx;
    if (t === undefined) syntax();
    if (isDigit(t) || t === '.' || (ctx.mode === 'base' && /^[A-F]$/.test(t))) return this.number();
    if (t === 'E') return this.number();
    this.next();
    if (isNode(t)) {
      switch (t.t) {
        case 'frac': return div(this.sub(t.a), this.sub(t.b));
        case 'mixed': {
          const w = this.sub(t.w), f = div(this.sub(t.a), this.sub(t.b));
          return real(w) < 0 ? sub(w, f) : add(w, f);
        }
        case 'sqrt': return csqrt(this.sub(t.a), ctx);
        case 'root': return nroot(this.sub(t.n), this.sub(t.a), ctx);
        case 'logb': {
          const b = this.sub(t.b), a = this.sub(t.a);
          if (isR(a) && isR(b)) { if (a.re <= 0 || b.re <= 0 || b.re === 1) matherr(); return C(Math.log(a.re) / Math.log(b.re)); }
          return div(cln(a), cln(b));
        }
        case 'abs': return C(cabs(this.sub(t.a)));
        default: syntax();
      }
    }
    if (t === '(') { const v = this.logical(); if (this.peek() === ')') this.next(); else if (this.i < this.l.length) syntax(); return v; }
    if (t === 'π') return C(Math.PI);
    if (t === 'e') return C(Math.E);
    if (t === 'i') { if (ctx.mode !== 'complex') syntax(); return C(0, 1); }
    if (t === 'Ans') return ctx.vars.Ans || C(0);
    if (t === 'Ran#') return C(Math.floor(Math.random() * 1000) / 1000);
    if (t.startsWith('§')) { const k = CONSTANTS[t.slice(1)]; if (!k) syntax(); return C(k.v); }
    if (VARS.has(t)) { const v = ctx.vars[t]; return v ? (typeof v === 'number' ? C(v) : v) : C(0); }
    if (FUNCS.has(t)) return this.func(t);
    syntax();
  }
  func(t) {
    const ctx = this.ctx, ang = ctx.angle;
    if (t === '∫(' || t === 'd/dx(' || t === 'Σ(' || t === 'Π(') return this.calculus(t);
    const a = this.args();
    const one = () => { if (a.length !== 1) throw new CalcError('arg'); return a[0]; };
    const two = () => { if (a.length !== 2) throw new CalcError('arg'); return [real(a[0]), real(a[1])]; };
    const r1 = () => real(one());
    const check = (v) => { if (!Number.isFinite(v)) matherr(); return C(v); };
    switch (t) {
      case 'sin(': return check(sinA(r1(), ang));
      case 'cos(': return check(cosA(r1(), ang));
      case 'tan(': return check(tanA(r1(), ang));
      case 'sin⁻¹(': { const v = r1(); if (v < -1 || v > 1) matherr(); return C(fromRad(Math.asin(v), ang)); }
      case 'cos⁻¹(': { const v = r1(); if (v < -1 || v > 1) matherr(); return C(fromRad(Math.acos(v), ang)); }
      case 'tan⁻¹(': return C(fromRad(Math.atan(r1()), ang));
      case 'sinh(': return check(Math.sinh(r1()));
      case 'cosh(': return check(Math.cosh(r1()));
      case 'tanh(': return check(Math.tanh(r1()));
      case 'sinh⁻¹(': return check(Math.asinh(r1()));
      case 'cosh⁻¹(': { const v = r1(); if (v < 1) matherr(); return C(Math.acosh(v)); }
      case 'tanh⁻¹(': { const v = r1(); if (v <= -1 || v >= 1) matherr(); return C(Math.atanh(v)); }
      case 'ln(': {
        const z = one();
        if (isR(z)) { if (z.re <= 0) { if (ctx.mode === 'complex' && z.re < 0) return cln(z); matherr(); } return C(Math.log(z.re)); }
        return cln(z);
      }
      case 'log(': {
        if (a.length === 2) { const [b, x] = two(); if (b <= 0 || b === 1 || x <= 0) matherr(); return C(Math.log(x) / Math.log(b)); }
        const v = r1(); if (v <= 0) matherr(); return C(Math.log10(v));
      }
      case 'Abs(': return C(cabs(one()));
      case 'Int(': return C(Math.trunc(r1()));
      case 'Intg(': return C(Math.floor(r1()));
      case 'Rnd(': return C(Number(r1().toPrecision(10)));
      case 'GCD(': case 'LCM(': {
        const [x, y] = two(); if (!Number.isInteger(x) || !Number.isInteger(y)) matherr();
        if (t === 'GCD(') return C(gcd(x, y));
        const g = gcd(x, y); return C(g === 0 ? 0 : Math.abs(x * y) / g);
      }
      case 'RanInt#(': { const [x, y] = two(); if (!Number.isInteger(x) || !Number.isInteger(y) || x > y) matherr(); return C(x + Math.floor(Math.random() * (y - x + 1))); }
      case 'Arg(': return C(fromRad(carg(one()), ang));
      case 'Conjg(': { const z = one(); return C(z.re, -z.im); }
      case 'ReP(': return C(one().re);
      case 'ImP(': return C(one().im);
      case 'Neg(': return C(I32(-(r1() | 0)));
      case 'Pol(': { const [x, y] = two(); const r = Math.hypot(x, y), th = fromRad(Math.atan2(y, x), ang); ctx.vars.x = C(r); ctx.vars.y = C(th); return C(r); }
      case 'Rec(': { const [r, th] = two(); const x = r * cosA(th, ang), y = r * sinA(th, ang); ctx.vars.x = C(x); ctx.vars.y = C(y); return C(x); }
      case 'Not(': return C(I32(~(r1() | 0)));
    }
    syntax();
  }
  calculus(t) {
    const parts = this.rawArgs();
    const f = parts[0];
    const ctx = this.ctx;
    const ev = (list) => real(this.sub(list));
    const at = (x) => real(evalList(f, { ...ctx, depth: this.depth + 1, vars: { ...ctx.vars, x: C(x) } }));
    if (t === 'd/dx(') {
      if (parts.length !== 2) throw new CalcError('arg');
      const a = ev(parts[1]);
      let h = 1e-3 * Math.max(1, Math.abs(a));
      const d1 = (h) => (-at(a + 2 * h) + 8 * at(a + h) - 8 * at(a - h) + at(a - 2 * h)) / (12 * h);
      const r1 = d1(h), r2 = d1(h / 2);
      return C(r2 + (r2 - r1) / 15);
    }
    if (parts.length !== 3) throw new CalcError('arg');
    const a = ev(parts[1]), b = ev(parts[2]);
    if (t === '∫(') return C(integrate(at, a, b));
    if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 1e5) matherr();
    let s = t === 'Σ(' ? 0 : 1;
    for (let x = a; x <= b; x++) s = t === 'Σ(' ? s + at(x) : s * at(x);
    if (!Number.isFinite(s)) matherr();
    return C(s);
  }
}

function integrate(f, a, b) {
  if (a === b) return 0;
  // adaptive Gauss–Kronrod (7-15)
  const xk = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0];
  const wk = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728];
  const wg = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];
  let evals = 0;
  const seg = (lo, hi) => {
    const c = (lo + hi) / 2, h = (hi - lo) / 2;
    let K = 0, G = 0;
    for (let j = 0; j < 8; j++) {
      const x = xk[j];
      const v = j === 7 ? f(c) : f(c - h * x) + f(c + h * x);
      evals += j === 7 ? 1 : 2;
      K += wk[j] * v;
      if (j === 7) G += wg[3] * v; else if (j % 2 === 1) G += wg[(j - 1) / 2] * v;
    }
    return { K: K * h, err: Math.abs((K - G) * h) };
  };
  const rec = (lo, hi, depth, tol) => {
    const { K, err } = seg(lo, hi);
    if (!Number.isFinite(K)) matherr();
    if (err <= tol || depth > 40 || evals > 200000) return K;
    const m = (lo + hi) / 2;
    return rec(lo, m, depth + 1, tol / 2) + rec(m, hi, depth + 1, tol / 2);
  };
  return rec(a, b, 0, 1e-11 * Math.max(1, Math.abs(b - a)));
}

export function evalList(list, ctx) {
  if (!list.length) syntax();
  const p = new Parser(list, ctx);
  const v = p.full();
  if (!Number.isFinite(v.re) || !Number.isFinite(v.im)) matherr();
  if (Math.abs(v.re) >= 1e100 || Math.abs(v.im) >= 1e100) matherr();
  if (ctx.mode !== 'complex' && !isR(v)) matherr();
  return v;
}

// SOLVE: list may contain '='. Finds x near guess.
export function solveFor(list, ctx, guess = 0) {
  const k = list.indexOf('=');
  const lhs = k < 0 ? list : list.slice(0, k), rhs = k < 0 ? ['0'] : list.slice(k + 1);
  if (!lhs.length || !rhs.length) syntax();
  const f = (x) => { const c = { ...ctx, vars: { ...ctx.vars, x: C(x) } }; return real(evalList(lhs, c)) - real(evalList(rhs, c)); };
  const tryNewton = (x0) => {
    let x = x0;
    for (let it = 0; it < 200; it++) {
      let fx; try { fx = f(x); } catch { return null; }
      if (fx === 0) return x;
      const h = 1e-6 * Math.max(1, Math.abs(x));
      let d; try { d = (f(x + h) - f(x - h)) / (2 * h); } catch { return null; }
      if (!Number.isFinite(d) || d === 0) return null;
      const nx = x - fx / d;
      if (!Number.isFinite(nx)) return null;
      if (Math.abs(nx - x) < 1e-13 * Math.max(1, Math.abs(nx))) return nx;
      x = nx;
    }
    return null;
  };
  const starts = [guess, guess + 1, guess - 1, 0, 1, -1, 10, -10, 100, -100, 0.5, 1000, -1000];
  for (const s of starts) {
    const x = tryNewton(s);
    if (x !== null) { let r; try { r = f(x); } catch { continue; } if (Math.abs(r) < 1e-8 * Math.max(1, Math.abs(x))) return { x, lr: r }; }
  }
  // bracketing scan
  let prev = null;
  for (let k2 = -2000; k2 <= 2000; k2++) {
    const x = guess + k2 * 0.5; let v; try { v = f(x); } catch { prev = null; continue; }
    if (prev && Math.sign(v) !== Math.sign(prev.v)) {
      let lo = prev.x, hi = x, flo = prev.v;
      for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2, fm = f(m); if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m; }
      const r = (lo + hi) / 2; return { x: r, lr: f(r) };
    }
    prev = { x, v };
  }
  throw new CalcError('time');
}

// ---------- number formatting ----------
export function round12(v) { if (v === 0 || !Number.isFinite(v)) return v; return Number(v.toPrecision(13)); }

export function toFrac(v, maxDen = 10000) {
  if (!Number.isFinite(v)) return null;
  const sign = v < 0 ? -1 : 1; const x = Math.abs(v);
  if (x > 1e10) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = x;
  for (let it = 0; it < 40; it++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(x - h1 / k1) <= 1e-11 * Math.max(1, x)) return { n: sign * h1, d: k1 };
    const f = b - a; if (f < 1e-15) break; b = 1 / f;
  }
  return null;
}

// Returns {mant, exp} pieces or a plain string. fmt: {mode:'norm'|'fix'|'sci'|'eng', n}
export function fmtReal(v, fmt = { mode: 'norm' }) {
  if (v === 0 || Object.is(v, -0)) return { s: '0' };
  const abs = Math.abs(v);
  const sci = (digits) => {
    let [m, e] = v.toExponential(digits - 1).split('e');
    if (fmt.mode !== 'sci') m = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
    return { s: m, exp: Number(e) };
  };
  if (fmt.mode === 'sci') return sci(fmt.n || 10);
  if (fmt.mode === 'eng') {
    let e = Math.floor(Math.log10(abs)); e -= ((e % 3) + 3) % 3;
    let m = Number((v / Math.pow(10, e)).toPrecision(10));
    if (Math.abs(m) >= 1000) { m /= 1000; e += 3; }
    return { s: String(m), exp: e };
  }
  if (fmt.mode === 'fix') {
    if (abs >= 1e10) return sci(10);
    return { s: v.toFixed(fmt.n) };
  }
  if (abs >= 1e10 || abs < 1e-9) return sci(10);
  const mag = Math.floor(Math.log10(abs)) + 1;
  let s = v.toFixed(Math.min(20, Math.max(0, 10 - mag)));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (Math.abs(Number(s)) >= 1e10) return sci(10);
  return { s };
}

// Exact-form detection for a real value.
export function exactForm(v, opts = {}) {
  v = round12(v);
  if (Number.isInteger(v) && Math.abs(v) < 1e10) return { t: 'int', v };
  const f = toFrac(v, 9999);
  if (f && Math.abs(f.n) < 1e10 && String(Math.abs(f.n)).length + String(f.d).length <= 10) return { t: 'frac', n: f.n, d: f.d };
  if (opts.noSurd) return null;
  // k√r/d
  for (const r of SQUAREFREE) {
    const w = toFrac(v / Math.sqrt(r), 999);
    if (w && Math.abs(w.n) <= 9999) return { t: 'surd', k: w.n, d: w.d, r };
  }
  // (A + B√r)/d
  for (const r of SQUAREFREE.slice(0, 40)) {
    const sr = Math.sqrt(r);
    for (let d = 1; d <= 12; d++) for (let B = -60; B <= 60; B++) {
      if (!B) continue;
      const A = v * d - B * sr, Ar = Math.round(A);
      if (Ar !== 0 && Math.abs(A - Ar) < 1e-9 * Math.max(1, Math.abs(A)) && Math.abs(Ar) < 1e6) {
        const g = gcd(gcd(Ar, B), d);
        return { t: 'surd2', A: Ar / g, B: B / g, d: d / g, r };
      }
    }
  }
  if (opts.pi) {
    const p = toFrac(v / Math.PI, 99);
    if (p && Math.abs(p.n) <= 999) return { t: 'pi', n: p.n, d: p.d };
  }
  return null;
}

export function containsAny(list, pred) {
  for (const t of list) {
    if (isNode(t)) { for (const k of ['a', 'b', 'n', 'w']) if (t[k] && containsAny(t[k], pred)) return true; }
    else if (pred(t)) return true;
  }
  return false;
}

// ---------- statistics ----------
export function stats1(xs, fs) {
  const data = [];
  xs.forEach((x, i) => { const f = fs ? fs[i] : 1; if (!(f >= 0) || !Number.isInteger(f)) matherr(); for (let k = 0; k < f; k++) data.push(x); });
  const n = data.length; if (!n) matherr();
  const sum = data.reduce((a, b) => a + b, 0), sum2 = data.reduce((a, b) => a + b * b, 0);
  const mean = sum / n;
  const ss = data.reduce((a, b) => a + (b - mean) ** 2, 0);
  const s = [...data].sort((a, b) => a - b);
  const med = (arr) => { const m = arr.length; if (!m) return NaN; return m % 2 ? arr[(m - 1) / 2] : (arr[m / 2 - 1] + arr[m / 2]) / 2; };
  const lower = s.slice(0, Math.floor(n / 2)), upper = s.slice(Math.ceil(n / 2));
  return {
    n, mean, sum, sum2, sigma: Math.sqrt(ss / n), s: n > 1 ? Math.sqrt(ss / (n - 1)) : NaN,
    min: s[0], q1: n > 1 ? med(lower) : NaN, med: med(s), q3: n > 1 ? med(upper) : NaN, max: s[n - 1],
  };
}
export function stats2(xs, ys) {
  const n = xs.length; if (n < 1) matherr();
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx ? sxy / sxx : NaN, a = my - b * mx;
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  return {
    n, mx, my, sx: Math.sqrt(sxx / n), sy: Math.sqrt(syy / n), sxs: n > 1 ? Math.sqrt(sxx / (n - 1)) : NaN, sys: n > 1 ? Math.sqrt(syy / (n - 1)) : NaN,
    sumx: mx * n, sumy: my * n, sumxy: xs.reduce((acc, x, i) => acc + x * ys[i], 0), sumx2: xs.reduce((acc, x) => acc + x * x, 0), a, b, r, r2: r * r,
  };
}

// ---------- distributions ----------
function erfcPos(x) { // x >= 0
  if (x < 3) {
    let term = x, sum = x;
    for (let n = 1; n < 200; n++) { term *= 2 * x * x / (2 * n + 1); sum += term; if (term < 1e-17 * sum) break; }
    return 1 - 2 / Math.sqrt(Math.PI) * Math.exp(-x * x) * sum;
  }
  // continued fraction (Lentz)
  let f = x, Cc = x, D = 0;
  for (let n = 1; n < 300; n++) {
    const an = n / 2;
    D = x + an * D; D = 1 / D;
    Cc = x + an / Cc;
    const delta = Cc * D; f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}
export const Phi = (z) => z >= 0 ? 1 - erfcPos(z / Math.SQRT2) / 2 : erfcPos(-z / Math.SQRT2) / 2;
export function normPD(x, s, m) { if (!(s > 0)) matherr(); const z = (x - m) / s; return Math.exp(-z * z / 2) / (s * Math.sqrt(2 * Math.PI)); }
export function normCD(lo, hi, s, m) { if (!(s > 0)) matherr(); return Phi((hi - m) / s) - Phi((lo - m) / s); }
export function invNorm(p, s, m) {
  if (!(p > 0 && p < 1) || !(s > 0)) matherr();
  // Acklam + Newton refinement
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let z;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 3; i++) { const e = Phi(z) - p; z -= e / (Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)); }
  return m + s * z;
}
function lnGamma(x) {
  const g = 7, cf = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1; let a = cf[0]; const t = x + g + 0.5;
  for (let i = 1; i < 9; i++) a += cf[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
export function binomPD(x, N, p) {
  if (!Number.isInteger(N) || N < 0 || !(p >= 0 && p <= 1)) matherr();
  if (!Number.isInteger(x) || x < 0 || x > N) return 0;
  if (p === 0) return x === 0 ? 1 : 0; if (p === 1) return x === N ? 1 : 0;
  if (N <= 1000) return nCr(N, x) * Math.pow(p, x) * Math.pow(1 - p, N - x);
  return Math.exp(lnChoose(N, x) + x * Math.log(p) + (N - x) * Math.log(1 - p));
}
export function binomCD(lo, hi, N, p) { let s = 0; for (let x = Math.max(0, Math.ceil(lo)); x <= Math.min(N, Math.floor(hi)); x++) s += binomPD(x, N, p); return Math.min(1, s); }
export function poissonPD(x, l) {
  if (!(l > 0)) matherr();
  if (!Number.isInteger(x) || x < 0) return 0;
  return Math.exp(-l + x * Math.log(l) - lnGamma(x + 1));
}
export function poissonCD(lo, hi, l) { let s = 0; for (let x = Math.max(0, Math.ceil(lo)); x <= Math.floor(hi) && x < 1e6; x++) s += poissonPD(x, l); return Math.min(1, s); }

// ---------- equations ----------
export function linSolve(A, bvec) {
  const n = A.length; const M = A.map((r, i) => [...r, bvec[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) {
      // singular: decide none vs infinite by rank test
      return { singular: true, infinite: rank(A) === rank(M) };
    }
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return { x: M.map((r, i) => r[n] / r[i]) };
}
function rank(M) {
  const A = M.map((r) => [...r]); let rk = 0; const rows = A.length, cols = A[0].length;
  for (let c = 0; c < cols && rk < rows; c++) {
    let p = rk; for (let r = rk + 1; r < rows; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10) continue;
    [A[rk], A[p]] = [A[p], A[rk]];
    for (let r = rk + 1; r < rows; r++) { const f = A[r][c] / A[rk][c]; for (let k = c; k < cols; k++) A[r][k] -= f * A[rk][k]; }
    rk++;
  }
  return rk;
}
export function polyRoots(co) { // co: [a_n, ..., a_0], a_n != 0; returns complex roots
  const n = co.length - 1; if (co[0] === 0) matherr();
  const a = co.map((c) => c / co[0]);
  if (n === 1) return [C(-a[1])];
  if (n === 2) {
    const D = a[1] * a[1] - 4 * a[2];
    if (D >= 0) { const s = Math.sqrt(D); const r1 = (-a[1] - Math.sign(a[1] || 1) * s) / 2; const r2 = r1 !== 0 ? a[2] / r1 : (-a[1] + Math.sign(a[1] || 1) * s) / 2; return [C(Math.min(r1, r2)), C(Math.max(r1, r2))]; }
    const re = -a[1] / 2, im = Math.sqrt(-D) / 2; return [C(re, im), C(re, -im)];
  }
  const P = (z) => { let r = C(1); for (let k = 1; k <= n; k++) r = add(mul(r, z), C(a[k])); return r; };
  let z = []; let seed = C(0.4, 0.9); let cur = C(1);
  for (let k = 0; k < n; k++) { z.push(cur); cur = mul(cur, seed); }
  for (let it = 0; it < 2000; it++) {
    let delta = 0;
    z = z.map((zi, i) => {
      let den = C(1); z.forEach((zj, j) => { if (j !== i) den = mul(den, sub(zi, zj)); });
      const step = div(P(zi), den); delta = Math.max(delta, cabs(step));
      return sub(zi, step);
    });
    if (delta < 1e-15) break;
  }
  // polish with Newton on the original polynomial
  const dP = (zz) => { let r = C(0); for (let k = 0; k < n; k++) r = add(mul(r, zz), C(a[k] * (n - k))); return r; };
  z = z.map((zi) => { for (let k = 0; k < 5; k++) { const d = dP(zi); if (cabs(d) < 1e-300) break; zi = sub(zi, div(P(zi), d)); } return zi; });
  z = z.map((zi) => {
    let { re, im } = zi;
    if (Math.abs(im) < 1e-8 * Math.max(1, Math.abs(re))) im = 0;
    if (Math.abs(re) < 1e-12 * Math.max(1, Math.abs(im))) re = 0;
    const rr = Math.round(re); if (Math.abs(re - rr) < 1e-9) re = rr;
    return C(round12(re), round12(im));
  });
  z.sort((p, q) => (p.im !== 0) - (q.im !== 0) || p.re - q.re || q.im - p.im);
  return z;
}
export function polyEval(co, x) { return co.reduce((acc, c) => acc * x + c, 0); }

// Inequality: co = [a_n..a_0], op in '>','<','≥','≤' ; returns array of segments {lo, hi, loIn, hiIn} (lo/hi may be ±Infinity)
export function solveInequality(co, op) {
  if (co[0] === 0) matherr();
  const roots = [...new Set(polyRoots(co).filter((z) => z.im === 0).map((z) => z.re))].sort((p, q) => p - q);
  const ok = (v) => { const e = Math.abs(v) < 1e-10 ? 0 : v; return op === '>' ? e > 0 : op === '<' ? e < 0 : op === '≥' ? e >= 0 : e <= 0; };
  const pieces = []; // ordered list of {kind:'open', lo, hi} | {kind:'pt', x}
  const pts = [-Infinity, ...roots, Infinity];
  for (let i = 0; i < pts.length - 1; i++) {
    const lo = pts[i], hi = pts[i + 1];
    const mid = lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2;
    pieces.push({ lo, hi, sat: ok(polyEval(co, mid)) });
    if (hi !== Infinity) pieces.push({ pt: hi, sat: ok(0) });
  }
  const segs = []; let cur = null;
  for (const p of pieces) {
    if (p.sat) {
      if (!cur) cur = 'pt' in p ? { lo: p.pt, loIn: true, hi: p.pt, hiIn: true } : { lo: p.lo, loIn: false, hi: p.hi, hiIn: false };
      else if ('pt' in p) { cur.hi = p.pt; cur.hiIn = true; } else { cur.hi = p.hi; cur.hiIn = false; }
    } else if (cur) { segs.push(cur); cur = null; }
  }
  if (cur) segs.push(cur);
  return segs;
}
