import * as E from './engine.js?v=4';
const { C, CalcError, ERR_TEXT } = E;

// ======================= persistence =======================
const store = {
  get(k, d) { try { const v = localStorage.getItem('knight-calc:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('knight-calc:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const settings = Object.assign({ angle: 'deg', fmt: { mode: 'norm' }, output: 'math', freq: false }, store.get('settings', {}));
const vars = Object.assign({}, store.get('vars', {}));
let history = store.get('history', []);
const saveAll = () => { store.set('settings', settings); store.set('vars', vars); store.set('history', history.slice(-40)); };

// ======================= expression editor =======================
const SLOTS = { frac: ['a', 'b'], mixed: ['w', 'a', 'b'], sqrt: ['a'], root: ['n', 'a'], pow: ['a'], logb: ['b', 'a'], abs: ['a'] };
const isNode = (t) => t && typeof t === 'object';
const clone = (x) => JSON.parse(JSON.stringify(x));

class Editor {
  constructor(items) { this.root = items ? clone(items) : []; this.cur = { list: this.root, idx: this.root.length }; }
  clear() { this.root.length = 0; this.cur = { list: this.root, idx: 0 }; }
  isEmpty() { return this.root.length === 0; }
  set(items) { this.root = clone(items); this.cur = { list: this.root, idx: this.root.length }; }
  parentOf(list, within = this.root) {
    for (let i = 0; i < within.length; i++) {
      const t = within[i];
      if (!isNode(t)) continue;
      for (const k of SLOTS[t.t]) {
        if (t[k] === list) return { node: t, key: k, plist: within, pidx: i };
        const r = this.parentOf(list, t[k]); if (r) return r;
      }
    }
    return null;
  }
  insert(t) { this.cur.list.splice(this.cur.idx, 0, t); this.cur.idx++; }
  insertNode(type, opts = {}) {
    const node = { t: type }; for (const k of SLOTS[type]) node[k] = [];
    const { list } = this.cur;
    let enter = SLOTS[type][0];
    if (type === 'frac' && opts.absorb !== false) {
      // pull a preceding number into the numerator
      let j = this.cur.idx;
      while (j > 0 && typeof list[j - 1] === 'string' && /^[0-9.]$/.test(list[j - 1])) j--;
      if (j < this.cur.idx) { node.a = list.splice(j, this.cur.idx - j); this.cur.idx = j; enter = 'b'; }
    }
    list.splice(this.cur.idx, 0, node);
    this.cur = { list: node[enter], idx: node[enter].length };
  }
  del() {
    const { list, idx } = this.cur;
    if (idx > 0) { list.splice(idx - 1, 1); this.cur.idx--; return; }
    const p = this.parentOf(list);
    if (!p) return;
    // at the start of a slot: unwrap the template, keeping what was typed in it
    const keep = [];
    for (const k of SLOTS[p.node.t]) keep.push(...p.node[k]);
    p.plist.splice(p.pidx, 1, ...keep);
    this.cur = { list: p.plist, idx: p.pidx };
  }
  right() {
    const { list, idx } = this.cur;
    if (idx < list.length) {
      const t = list[idx];
      if (isNode(t)) { const k = SLOTS[t.t][0]; this.cur = { list: t[k], idx: 0 }; } else this.cur.idx++;
      return;
    }
    const p = this.parentOf(list);
    if (!p) { this.cur.idx = 0; return; }
    const ks = SLOTS[p.node.t], i = ks.indexOf(p.key);
    if (i < ks.length - 1) this.cur = { list: p.node[ks[i + 1]], idx: 0 };
    else this.cur = { list: p.plist, idx: p.pidx + 1 };
  }
  left() {
    const { list, idx } = this.cur;
    if (idx > 0) {
      const t = list[idx - 1];
      if (isNode(t)) { const ks = SLOTS[t.t]; const k = ks[ks.length - 1]; this.cur = { list: t[k], idx: t[k].length }; } else this.cur.idx--;
      return;
    }
    const p = this.parentOf(list);
    if (!p) { this.cur.idx = list.length; return; }
    const ks = SLOTS[p.node.t], i = ks.indexOf(p.key);
    if (i > 0) { const l2 = p.node[ks[i - 1]]; this.cur = { list: l2, idx: l2.length }; }
    else this.cur = { list: p.plist, idx: p.pidx };
  }
  vertical(dir) { // move between numerator/denominator; returns true if handled
    let list = this.cur.list;
    for (let p = this.parentOf(list); p; p = this.parentOf(p.plist)) {
      if (p.node.t === 'frac' || p.node.t === 'mixed') {
        if (dir < 0 && p.key === 'b') { this.cur = { list: p.node.a, idx: Math.min(this.cur.idx, p.node.a.length) }; return true; }
        if (dir > 0 && p.key === 'a') { this.cur = { list: p.node.b, idx: Math.min(this.cur.idx, p.node.b.length) }; return true; }
      }
    }
    return false;
  }
  html(showCursor = true) { return renderList(this.root, showCursor ? this.cur : null); }
}

// ======================= rendering of expressions =======================
const ATOM_HTML = {
  '×': '×', '÷': '÷', '−': '−', '+': '+', 'E': '<span class="e10">×10</span>', '²': '<sup>2</sup>', '³': '<sup>3</sup>', '⁻¹': '<sup>−1</sup>',
  'P': '<span class="op">P</span>', 'C': '<span class="op">C</span>', 'Ans': 'Ans', 'Ran#': 'Ran#', ',': ',', '=': ' = ', '∠': '∠',
  '°': '°', 'ᵒ': '<sup>o</sup>', 'and': ' and ', 'or': ' or ', 'xor': ' xor ', 'xnor': ' xnor ', 'ʳ': '<sup>r</sup>', 'ᵍ': '<sup>g</sup>', 'i': '<i class="im">i</i>',
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function atomHtml(t) {
  if (ATOM_HTML[t]) return ATOM_HTML[t];
  if (t.startsWith('§')) return `<span class="const">${E.CONSTANTS[t.slice(1)].label}</span>`;
  if (t === 'x' || t === 'y' || t === 'z') return `<i>${t}</i>`;
  return esc(t);
}
const CUR = '<span class="cursor"></span>';
function renderList(list, cur, isSlot = false) {
  let h = '';
  const here = cur && cur.list === list;
  list.forEach((t, i) => {
    if (here && cur.idx === i) h += CUR;
    h += isNode(t) ? nodeHtml(t, cur) : `<span class="a">${atomHtml(t)}</span>`;
  });
  if (here && cur.idx === list.length) h += CUR;
  if (isSlot && !list.length) return `<span class="slot${here ? ' on' : ''}">${here ? CUR : ''}</span>`;
  return h;
}
function nodeHtml(n, cur) {
  const s = (k) => renderList(n[k], cur, true);
  switch (n.t) {
    case 'frac': return `<span class="frac"><span class="num">${s('a')}</span><span class="den">${s('b')}</span></span>`;
    case 'mixed': return `<span class="mixw">${s('w')}</span><span class="frac"><span class="num">${s('a')}</span><span class="den">${s('b')}</span></span>`;
    case 'sqrt': return `<span class="sqrt"><span class="rs">√</span><span class="rad">${s('a')}</span></span>`;
    case 'root': return `<span class="ridx">${s('n')}</span><span class="sqrt"><span class="rs">√</span><span class="rad">${s('a')}</span></span>`;
    case 'pow': return `<span class="pow">${s('a')}</span>`;
    case 'logb': return `<span class="a">log</span><span class="lb">${s('b')}</span><span class="a">(</span>${s('a')}<span class="a">)</span>`;
    case 'abs': return `<span class="abs">${s('a')}</span>`;
  }
  return '';
}

// ======================= rendering of numbers =======================
const fracHtml = (n, d) => `<span class="frac"><span class="num">${n}</span><span class="den">${d}</span></span>`;
const sciHtml = (o) => o.exp === undefined ? o.s.replace('-', '−') : `${o.s.replace('-', '−')}<span class="e10">×10</span><sup>${String(o.exp).replace('-', '−')}</sup>`;
function exactHtml(x) {
  const sg = (v) => v < 0 ? '−' : '';
  switch (x.t) {
    case 'int': return sg(x.v) + Math.abs(x.v);
    case 'frac': return sg(x.n) + fracHtml(Math.abs(x.n), x.d);
    case 'surd': {
      const k = Math.abs(x.k), top = `${k === 1 ? '' : k}<span class="sqrt"><span class="rs">√</span><span class="rad">${x.r}</span></span>`;
      return sg(x.k) + (x.d === 1 ? top : fracHtml(top, x.d));
    }
    case 'surd2': {
      const B = Math.abs(x.B), top = `${x.A < 0 ? '−' : ''}${Math.abs(x.A)} ${x.B < 0 ? '−' : '+'} ${B === 1 ? '' : B}<span class="sqrt"><span class="rs">√</span><span class="rad">${x.r}</span></span>`;
      return x.d === 1 ? top : fracHtml(top, x.d);
    }
    case 'pi': { const n = Math.abs(x.n), top = `${n === 1 ? '' : n}π`; return sg(x.n) + (x.d === 1 ? top : fracHtml(top, x.d)); }
  }
}
// format: 'std' | 'dec' | 'improper' | 'mixed' | 'eng' | 'dms'
function realHtml(v, format = 'std', opts = {}) {
  v = E.round12(v);
  if (format === 'eng') return sciHtml(E.fmtReal(v, { mode: 'eng' }));
  if (format === 'dms') {
    const sg = v < 0 ? '−' : ''; let a = Math.abs(v);
    let d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
    s = Number(s.toFixed(2)); if (s >= 60) { s -= 60; m++; } if (m >= 60) { m -= 60; d++; }
    return `${sg}${d}°${m}′${s}″`;
  }
  if (format === 'improper' || format === 'mixed') {
    const f = E.toFrac(v, 9999);
    if (!f) return realHtml(v, 'dec');
    if (format === 'mixed' && Math.abs(f.n) > f.d && f.d > 1) {
      const w = Math.trunc(Math.abs(f.n) / f.d), r = Math.abs(f.n) % f.d;
      return `${v < 0 ? '−' : ''}${w}${fracHtml(r, f.d)}`;
    }
    return exactHtml(f.d === 1 ? { t: 'int', v: f.n } : { t: 'frac', n: f.n, d: f.d });
  }
  if (format === 'std' && settings.output === 'math' && settings.fmt.mode === 'norm') {
    const x = E.exactForm(v, opts);
    if (x) return exactHtml(x);
  }
  return sciHtml(E.fmtReal(v, settings.fmt));
}
function valueHtml(z, format = 'std', opts = {}) {
  if (z.im === 0) return realHtml(z.re, format, opts);
  if (format === 'polar') {
    const r = Math.hypot(z.re, z.im), th = Math.atan2(z.im, z.re) * (settings.angle === 'deg' ? 180 / Math.PI : settings.angle === 'gra' ? 200 / Math.PI : 1);
    return `${realHtml(r, 'std', opts)}∠${realHtml(th, 'std', { pi: settings.angle === 'rad' })}`;
  }
  const im = E.round12(z.im), re = E.round12(z.re);
  const imAbs = Math.abs(im) === 1 ? '' : realHtml(Math.abs(im), format, opts);
  if (re === 0) return `${im < 0 ? '−' : ''}${imAbs}<i class="im">i</i>`;
  return `${realHtml(re, format, opts)} ${im < 0 ? '−' : '+'} ${imAbs}<i class="im">i</i>`;
}
const errHtml = (e) => {
  const k = e instanceof CalcError ? e.kind : 'math';
  if (!(e instanceof CalcError)) console.error(e);
  const [t, d] = ERR_TEXT[k] || ERR_TEXT.math;
  return `<div class="err"><b>${t}</b><span>${d}</span><small>[◀][▶] กลับไปแก้ไข · [AC] ล้าง</small></div>`;
};

// ======================= apps =======================
const ctxFor = (mode = 'real', extra = {}) => ({ mode, angle: settings.angle, vars, ...extra });
const getVal = (k) => { const v = vars[k]; return v ? v : C(0); };


const state = {
  app: 'calc', shift: false, alpha: false, menu: null, // menu: stack of {title, items, sel}
  view: null,
};

// ---------- Calc-like apps (calc, cplx, base) ----------
function makeCalcApp(kind) {
  return {
    kind, ed: new Editor(), phase: 'input', result: null, error: null, fmt: 'std', histIdx: -1, base: 10,
    title() { return { calc: 'คำนวณ', cplx: 'เชิงซ้อน', base: 'ฐานเลข' }[kind]; },
    mode() { return kind === 'cplx' ? 'complex' : kind === 'base' ? 'base' : 'real'; },
    formats() {
      if (kind === 'base') return [];
      if (kind === 'cplx') return [['std', 'มาตรฐาน (a+bi)'], ['dec', 'ทศนิยม'], ['polar', 'เชิงขั้ว r∠θ']];
      return [['std', 'มาตรฐาน'], ['dec', 'ทศนิยม'], ['improper', 'เศษเกิน'], ['mixed', 'จำนวนคละ'], ['eng', 'วิศวกรรม ×10³ⁿ'], ['dms', 'องศา ลิปดา ฟิลิปดา']];
    },
    exec(forceDec = false, solve = false) {
      const items = clone(this.ed.root);
      if (!items.length) return;
      try {
        const ctx = ctxFor(this.mode(), { base: this.base });
        if (items.includes('=') || solve) {
          const g = vars.x ? vars.x.re : 0;
          const r = E.solveFor(items, ctx, g);
          vars.x = C(E.round12(r.x));
          this.result = { solve: r };
        } else {
          const v = E.evalList(items, ctx);
          vars.PreAns = vars.Ans; vars.Ans = v;
          if (items[0] === 'Pol(' || items[0] === 'Rec(') { this.result = { pr: items[0], a: vars.x, b: vars.y, v }; }
          else {
          const piish = E.containsAny(items, (t) => t === 'π' || /⁻¹\(/.test(t)) && settings.angle === 'rad';
          this.result = { v, pi: piish || E.containsAny(items, (t) => t === 'π') };
          }
        }
        this.fmt = forceDec ? 'dec' : 'std';
        this.phase = 'result'; this.error = null; this.histIdx = -1;
        history.push({ items, mode: this.mode(), html: this.resultHtml() });
        if (history.length > 40) history = history.slice(-40);
        saveAll(); renderSide();
      } catch (e) { this.error = e; this.phase = 'error'; }
    },
    resultHtml() {
      const r = this.result; if (!r) return '';
      if (r.solve) return `<div class="solve"><div><i>x</i> = ${realHtml(r.solve.x, 'std')}</div><div class="lr">L−R = ${realHtml(Math.abs(r.solve.lr) < 1e-10 * Math.max(1, Math.abs(r.solve.x)) ? 0 : r.solve.lr, 'dec')}</div></div>`;
      if (kind === 'base') {
        const n = r.v.re | 0, u = n >>> 0;
        const show = (b) => b === 10 ? String(n) : u.toString(b).toUpperCase();
        const name = { 10: 'DEC', 16: 'HEX', 2: 'BIN', 8: 'OCT' };
        const others = [10, 16, 2, 8].filter((b) => b !== this.base).map((b) => `<div><b>${name[b]}</b> ${show(b)}</div>`).join('');
        return `${show(this.base)}<div class="others">${others}</div>`;
      }
      if (r.pr) {
        const [la, lb] = r.pr === 'Pol(' ? ['r', 'θ'] : ['<i>x</i>', '<i>y</i>'];
        return `<div class="solve"><div>${la} = ${realHtml(r.a.re, 'dec')}</div><div>${lb} = ${realHtml(r.b.re, 'dec')}</div></div>`;
      }
      return valueHtml(r.v, this.fmt, { pi: r.pi });
    },
    render() {
      const showCur = this.phase === 'input';
      let h = `<div class="expr" id="expr">${this.ed.html(showCur) || (showCur ? CUR : '')}</div>`;
      if (this.phase === 'result') h += `<div class="res">${this.resultHtml()}</div>`;
      if (this.phase === 'error') h = errHtml(this.error);
      if (kind === 'base') h += `<div class="hint">โหมด <b>${{ 10: 'DEC', 16: 'HEX', 2: 'BIN', 8: 'OCT' }[this.base]}</b> · ปุ่ม (−) °′″ hyp sin cos tan = A–F · x² DEC · x<sup>■</sup> HEX · log BIN · ln OCT</div>`;
      if (kind === 'cplx') h += `<div class="hint">ENG = <i>i</i> · SHIFT 2 = เมนูเชิงซ้อน (r∠θ, Arg, Conjg)</div>`;
      return h;
    },
    startNew() { if (this.phase !== 'input') { this.ed.clear(); this.phase = 'input'; this.error = null; } },
    key(k, payload) {
      if (this.phase === 'error') {
        if (k === 'left' || k === 'right') { this.phase = 'input'; return; }
        if (k === 'ac') { this.ed.clear(); this.phase = 'input'; return; }
        if (k === 'back') { this.phase = 'input'; return; }
        return;
      }
      if (k === 'exe') return this.exec();
      if (k === 'approx') return this.exec(true);
      if (k === 'solve') return this.exec(false, true);
      const res = this.phase === 'result' && this.result && this.result.v && kind !== 'base';
      if (k === 'sd') { if (res) this.fmt = this.fmt === 'std' ? 'dec' : 'std'; return; }
      if (k === 'mixtoggle') { if (res) this.fmt = this.fmt === 'mixed' ? 'improper' : 'mixed'; return; }
      if (k === 'polar' || k === 'rect') { if (res) this.fmt = k === 'polar' ? 'polar' : 'std'; return; }
      if (k === 'eng') { if (kind === 'cplx') k = 'i'; else { if (res) this.fmt = this.fmt === 'eng' ? 'std' : 'eng'; return; } }
      if (k === 'dms' && res) { this.fmt = this.fmt === 'dms' ? 'std' : 'dms'; return; }
      if (k === 'mplus' || k === 'mminus') {
        if (this.phase === 'input') { this.exec(); if (this.phase !== 'result') return; }
        const a = vars.Ans || C(0), m = vars.M || C(0), sg = k === 'mplus' ? 1 : -1;
        vars.M = C(m.re + sg * a.re, m.im + sg * a.im); saveAll(); return;
      }
      if (k === 'ac') { this.ed.clear(); this.phase = 'input'; this.result = null; return; }
      if (k === 'left' || k === 'right') {
        if (this.phase !== 'input') { this.phase = 'input'; if (k === 'left') this.ed.cur = { list: this.ed.root, idx: this.ed.root.length }; else this.ed.cur = { list: this.ed.root, idx: 0 }; return; }
        return k === 'left' ? this.ed.left() : this.ed.right();
      }
      if (k === 'up' || k === 'down') {
        if (this.phase === 'input' && this.ed.vertical(k === 'up' ? -1 : 1)) return;
        const hs = history.filter((h) => h.mode === this.mode());
        if (!hs.length) return;
        if (this.histIdx < 0) this.histIdx = hs.length;
        this.histIdx = Math.max(0, Math.min(hs.length - 1, this.histIdx + (k === 'up' ? -1 : 1)));
        const h = hs[this.histIdx]; this.ed.set(h.items); this.phase = 'histview'; this.histHtml = h.html;
        return;
      }
      if (k === 'del') { if (this.phase !== 'input') { this.phase = 'input'; return; } return this.ed.del(); }
      // base-n remaps
      if (kind === 'base') {
        const hex = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', 'var:A': 'A', 'var:B': 'B', 'var:C': 'C', 'var:D': 'D', 'var:E': 'E', 'var:F': 'F' };
        const bases = { sq: 10, pow: 16, log: 2, ln: 8 };
        if (bases[k]) { this.base = bases[k]; return; }
        if (hex[k]) { this.startNew(); return this.ed.insert(hex[k]); }
        if (!['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'add', 'sub', 'mul', 'div', 'lp', 'rp', 'ans', 'insert'].includes(k)) return;
      }
      return insertKey(this, k, payload);
    },
  };
}
// Calc apps share insertion semantics
const OPS_START_ANS = new Set(['add', 'sub', 'mul', 'div', 'sq', 'cube', 'inv', 'fact', 'pow', 'pct', 'npr', 'ncr', 'dms']);
function insertKey(app, k, payload) {
  if (app.phase === 'histview') app.phase = 'input';
  if (app.phase === 'result') {
    app.ed.clear(); app.phase = 'input';
    if (OPS_START_ANS.has(k)) app.ed.insert('Ans');
  }
  insertInto(app.ed, k, payload);
}
const SIMPLE = {
  add: '+', sub: '−', mul: '×', div: '÷', dot: '.', exp: 'E', lp: '(', rp: ')', comma: ',', ans: 'Ans', x: 'x', pi: 'π', e: 'e', i: 'i',
  sin: 'sin(', cos: 'cos(', tan: 'tan(', asin: 'sin⁻¹(', acos: 'cos⁻¹(', atan: 'tan⁻¹(', ln: 'ln(', sq: '²', cube: '³', inv: '⁻¹', fact: '!',
  npr: 'P', ncr: 'C', pct: '%', ran: 'Ran#', eq: '=', log: 'log(', neg: '−', dms: '°', angle: '∠', integ: '∫(', deriv: 'd/dx(', sigma: 'Σ(',
  pol: 'Pol(', rec: 'Rec(', rnd: 'Rnd(', ranint: 'RanInt#(',
};
function insertInto(ed, k, payload) {
  if (/^[0-9]$/.test(k)) return ed.insert(k);
  if (k === 'insert') { if (Array.isArray(payload)) payload.forEach((t) => ed.insert(t)); else if (typeof payload === 'string') ed.insert(payload); else if (payload && payload.node) { ed.insertNode(payload.node); } return; }
  if (SIMPLE[k]) return ed.insert(SIMPLE[k]);
  if (k.startsWith('var:')) return ed.insert(k.slice(4));
  if (k === 'cbrt') { ed.insertNode('root'); ed.insert('3'); return ed.right(); }
  switch (k) {
    case 'frac': return ed.insertNode('frac');
    case 'mixed': return ed.insertNode('mixed');
    case 'sqrt': return ed.insertNode('sqrt');
    case 'root': return ed.insertNode('root');
    case 'pow': return ed.insertNode('pow');
    case 'tenx': ed.insert('1'); ed.insert('0'); return ed.insertNode('pow');
    case 'ex': ed.insert('e'); return ed.insertNode('pow');
    case 'logb': return ed.insertNode('logb');
    case 'abs': return ed.insertNode('abs');
  }
}

// ---------- Form apps (equation, inequality, distribution, ratio, table setup) ----------
function makeForm({ title, header, fields, grid, compute, allowX = false }) {
  return {
    title: () => title, fields: fields.map((f) => ({ ...f, ed: new Editor(f.init !== undefined ? [...String(f.init)].map((ch) => ch === '-' ? '−' : ch) : []), val: f.init !== undefined ? Number(f.init) : null })),
    sel: 0, phase: 'input', error: null, results: null, scroll: 0,
    evalField(f) {
      if (f.raw) { f.val = clone(f.ed.root); return; }
      if (f.ed.isEmpty()) { f.val = 0; return; }
      f.val = E.round12(E.evalList(clone(f.ed.root), ctxFor('real')).re);
    },
    computeAll() {
      try {
        this.fields.forEach((f) => this.evalField(f));
        this.results = compute(this.fields.map((f) => f.val));
        this.phase = 'result'; this.scroll = 0;
      } catch (e) { this.error = e; this.phase = 'error'; }
    },
    render() {
      if (this.phase === 'error') return errHtml(this.error);
      if (this.phase === 'result') {
        const rows = this.results;
        const vis = rows.slice(this.scroll, this.scroll + 6);
        return `<div class="results">${vis.map((r) => r.html !== undefined ? `<div class="rrow wide">${r.html}</div>` : `<div class="rrow"><span class="rl">${r.label}</span><span class="rv">${r.value}</span></div>`).join('')}</div>`
          + (rows.length > 6 ? `<div class="scrollhint">${this.scroll > 0 ? '▲' : ''} ${this.scroll + 6 < rows.length ? '▼' : ''}</div>` : '')
          + `<div class="hint">[AC] กลับไปแก้ค่า</div>`;
      }
      const cell = (f, i) => {
        const on = i === this.sel;
        const body = on ? (f.ed.html(true) || CUR) : (f.ed.isEmpty() ? '<span class="zero">0</span>' : f.ed.html(false));
        return `<div class="fcell${on ? ' on' : ''}" data-field="${i}">${f.label ? `<span class="fl">${f.label}</span>` : ''}<span class="fv">${body}</span></div>`;
      };
      let h = header ? `<div class="fhead">${header}</div>` : '';
      if (grid) {
        h += `<div class="fgrid" style="grid-template-columns:repeat(${grid.cols},1fr)">${grid.heads.map((x) => `<div class="gh">${x}</div>`).join('')}${this.fields.map(cell).join('')}</div>`;
      } else h += `<div class="flist">${this.fields.map(cell).join('')}</div>`;
      h += `<div class="hint">[=] ใส่ค่าถัดไป · ช่องสุดท้ายกด [=] เพื่อคำนวณ</div>`;
      return h;
    },
    key(k, payload) {
      if (this.phase === 'error') { if (['ac', 'back', 'left', 'right', 'exe'].includes(k)) this.phase = 'input'; return; }
      if (this.phase === 'result') {
        if (k === 'up') this.scroll = Math.max(0, this.scroll - 1);
        else if (k === 'down') this.scroll = Math.min(Math.max(0, this.results.length - 5), this.scroll + 1);
        else if (k === 'ac' || k === 'back' || k === 'exe') this.phase = 'input';
        return;
      }
      const f = this.fields[this.sel];
      const cols = grid ? grid.cols : 1;
      if (k === 'ok') return this.computeAll();
      if (k === 'exe') {
        try { this.evalField(f); } catch (e) { this.error = e; this.phase = 'error'; return; }
        if (this.sel === this.fields.length - 1) return this.computeAll();
        this.sel++; return;
      }
      if (k === 'up' || k === 'down') {
        if (f.ed.vertical(k === 'up' ? -1 : 1)) return;
        const n = this.sel + (k === 'up' ? -cols : cols);
        if (n >= 0 && n < this.fields.length) this.sel = n;
        return;
      }
      if (k === 'left' || k === 'right') {
        if (!f.ed.isEmpty() && f.ed.cur.list !== f.ed.root) return k === 'left' ? f.ed.left() : f.ed.right();
        if (grid || f.ed.isEmpty() || (k === 'left' && f.ed.cur.idx === 0) || (k === 'right' && f.ed.cur.idx === f.ed.root.length)) {
          if (grid) { const n = this.sel + (k === 'left' ? -1 : 1); if (n >= 0 && n < this.fields.length) this.sel = n; }
          return;
        }
        return k === 'left' ? f.ed.left() : f.ed.right();
      }
      if (k === 'ac') { f.ed.clear(); return; }
      if (k === 'del') return f.ed.del();
      if (k === 'var:x' && !allowX && !f.raw) return;
      if (!['0','1','2','3','4','5','6','7','8','9'].includes(k) && !(k in SIMPLE) && !/^(var:|frac|mixed|sqrt|root|pow|tenx|ex|logb|abs|cbrt|insert)/.test(k)) return;
      insertInto(f.ed, k, payload);
    },
    select(i) { this.sel = i; },
  };
}

const R = (label, v, opts) => ({ label, value: typeof v === 'number' ? (Number.isNaN(v) ? '—' : realHtml(v, 'std', opts)) : v });

function equationForm(type, n) {
  const names = ['x', 'y', 'z', 't'];
  const sub = (i) => `<sub>${i}</sub>`;
  if (type === 'simul') {
    const fields = [];
    for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) fields.push({ label: '' });
    const vn = names.slice(0, n);
    const header = `${'abcd'.slice(0, n).split('').map((ch, i) => `${ch}${sub('n')}<i>${vn[i]}</i>`).join(' + ')} = ${'abcde'[n]}${sub('n')}`;
    return makeForm({
      title: `สมการ ${n} ตัวแปร`, header, fields, grid: { cols: n + 1, heads: [...vn.map((v) => `<i>${v}</i>`), '='] },
      compute(vals) {
        const A = [], b = [];
        for (let r = 0; r < n; r++) { A.push(vals.slice(r * (n + 1), r * (n + 1) + n)); b.push(vals[r * (n + 1) + n]); }
        const res = E.linSolve(A, b);
        if (res.singular) return [{ html: res.infinite ? 'มีคำตอบมากมายไม่จำกัด' : 'ไม่มีคำตอบ' }];
        return res.x.map((v, i) => R(`<i>${vn[i]}</i> =`, E.round12(v)));
      },
    });
  }
  const letters = 'abcde'.slice(0, n + 1).split('');
  const terms = letters.map((ch, i) => { const p = n - i; return p === 0 ? ch : `${ch}<i>x</i>${p > 1 ? `<sup>${p}</sup>` : ''}`; }).join(' + ');
  return makeForm({
    title: `พหุนามดีกรี ${n}`, header: `${terms} = 0`, fields: letters.map(() => ({ label: '' })), grid: { cols: n + 1, heads: letters.map((l) => l) },
    compute(co) {
      if (co[0] === 0) throw new CalcError('math');
      const roots = E.polyRoots(co);
      const out = roots.map((z, i) => R(`<i>x</i>${sub(i + 1)} =`, valueHtml(z)));
      if (roots.every((z) => z.im !== 0) && n === 2) out.unshift({ html: '<span class="note">ไม่มีคำตอบเป็นจำนวนจริง</span>' });
      if (n === 2) {
        const [a, b, c] = co, xv = -b / (2 * a), yv = c - b * b / (4 * a);
        out.push(R(a > 0 ? 'ค่าต่ำสุด <i>x</i> =' : 'ค่าสูงสุด <i>x</i> =', E.round12(xv)));
        out.push(R(a > 0 ? 'ค่าต่ำสุด <i>y</i> =' : 'ค่าสูงสุด <i>y</i> =', E.round12(yv)));
      }
      return out;
    },
  });
}

function inequalityForm(n, op) {
  const letters = 'abcde'.slice(0, n + 1).split('');
  const terms = letters.map((ch, i) => { const p = n - i; return p === 0 ? ch : `${ch}<i>x</i>${p > 1 ? `<sup>${p}</sup>` : ''}`; }).join(' + ');
  return makeForm({
    title: `อสมการดีกรี ${n}`, header: `${terms} ${op} 0`, fields: letters.map(() => ({ label: '' })), grid: { cols: n + 1, heads: letters },
    compute(co) {
      const segs = E.solveInequality(co, op);
      const v = (x) => realHtml(x, 'std');
      if (!segs.length) return [{ html: 'ไม่มีคำตอบ' }];
      if (segs.length === 1 && segs[0].lo === -Infinity && segs[0].hi === Infinity) return [{ html: 'ทุกจำนวนจริง' }];
      if (segs.length === 2 && segs[0].lo === -Infinity && segs[1].hi === Infinity && segs[0].hi === segs[1].lo) return [{ html: `<i>x</i> ≠ ${v(segs[0].hi)}` }];
      return segs.map((s) => {
        const L = s.loIn ? '≤' : '<', Rr = s.hiIn ? '≤' : '<';
        if (s.lo === s.hi) return { html: `<i>x</i> = ${v(s.lo)}` };
        if (s.lo === -Infinity) return { html: `<i>x</i> ${Rr} ${v(s.hi)}` };
        if (s.hi === Infinity) return { html: `${v(s.lo)} ${L} <i>x</i>` };
        return { html: `${v(s.lo)} ${L} <i>x</i> ${Rr} ${v(s.hi)}` };
      });
    },
  });
}

const DISTS = [
  { name: 'ปกติ: ความหนาแน่น (Normal PD)', f: [['<i>x</i>', 0], ['σ', 1], ['μ', 0]], c: ([x, s, m]) => [R('p =', E.normPD(x, s, m), { noSurd: true })] },
  { name: 'ปกติ: สะสม (Normal CD)', f: [['ล่าง', -1], ['บน', 1], ['σ', 1], ['μ', 0]], c: ([lo, hi, s, m]) => [R('p =', E.normCD(lo, hi, s, m), { noSurd: true }), R('z ล่าง =', (lo - m) / s), R('z บน =', (hi - m) / s)] },
  { name: 'ปกติ: ผกผัน (Inverse Normal)', f: [['พื้นที่', 0.95], ['σ', 1], ['μ', 0]], c: ([p, s, m]) => [R('<i>x</i> =', E.invNorm(p, s, m), { noSurd: true })], note: 'พื้นที่ฝั่งซ้าย' },
  { name: 'ทวินาม: ความน่าจะเป็น (Binomial PD)', f: [['<i>x</i>', 0], ['N', 10], ['p', 0.5]], c: ([x, N, p]) => [R('P =', E.binomPD(x, N, p))] },
  { name: 'ทวินาม: สะสม (Binomial CD)', f: [['ล่าง', 0], ['บน', 5], ['N', 10], ['p', 0.5]], c: ([lo, hi, N, p]) => [R('P =', E.binomCD(lo, hi, N, p))] },
  { name: 'ปัวซง: ความน่าจะเป็น (Poisson PD)', f: [['<i>x</i>', 0], ['λ', 1]], c: ([x, l]) => [R('P =', E.poissonPD(x, l), { noSurd: true })] },
  { name: 'ปัวซง: สะสม (Poisson CD)', f: [['ล่าง', 0], ['บน', 2], ['λ', 1]], c: ([lo, hi, l]) => [R('P =', E.poissonCD(lo, hi, l), { noSurd: true })] },
];
function distForm(d) {
  return makeForm({ title: 'การแจกแจง', header: d.name + (d.note ? ` <small>(${d.note})</small>` : ''), fields: d.f.map(([label, init]) => ({ label, init })), compute: d.c });
}
function ratioForm(type) {
  const labels = type === 1 ? ['A', 'B', 'D'] : ['A', 'B', 'C'];
  return makeForm({
    title: 'อัตราส่วน', header: type === 1 ? 'A : B = <i>X</i> : D' : 'A : B = C : <i>X</i>', fields: labels.map((l) => ({ label: l })),
    compute([a, b, c]) {
      if (type === 1) { if (b === 0) throw new CalcError('math'); return [R('<i>X</i> =', E.round12(a * c / b))]; }
      if (a === 0) throw new CalcError('math'); return [R('<i>X</i> =', E.round12(b * c / a))];
    },
  });
}
function tableForm() {
  const form = makeForm({
    title: 'ตารางค่า', header: 'ตั้งค่าตาราง (<i>x</i> = ALPHA + ปุ่ม ) )', allowX: true,
    fields: [{ label: '<i>f</i>(<i>x</i>)=', raw: true }, { label: 'เริ่ม', init: 1 }, { label: 'สิ้นสุด', init: 5 }, { label: 'ขั้น', init: 1 }],
    compute([f, a, b, s]) {
      if (!f.length || !(s > 0) || b < a || (b - a) / s > 45) throw new CalcError('math');
      const rows = [{ html: '<span class="th"><i>x</i></span><span class="th"><i>f</i>(<i>x</i>)</span>' }];
      for (let k = 0; a + k * s <= b + 1e-12; k++) {
        const x = E.round12(a + k * s);
        let y; try { y = realHtml(E.evalList(f, ctxFor('real', { vars: { ...vars, x: C(x) } })).re, 'dec'); } catch { y = 'ERROR'; }
        rows.push({ html: `<span class="tc">${realHtml(x, 'dec')}</span><span class="tc">${y}</span>` });
      }
      return rows;
    },
  });
  return form;
}

// ---------- Statistics ----------
function makeStat(twoVar) {
  return {
    twoVar, rows: [], r: 0, c: 0, ed: new Editor(), phase: 'input', results: null, scroll: 0, top: 0, error: null,
    title() { return twoVar ? 'สถิติ y=a+bx' : 'สถิติ 1 ตัวแปร'; },
    cols() { return twoVar ? ['x', 'y'] : settings.freq ? ['x', 'Freq'] : ['x']; },
    commit() {
      if (this.ed.isEmpty()) return true;
      try {
        const v = E.round12(E.evalList(clone(this.ed.root), ctxFor('real')).re);
        while (this.rows.length <= this.r) this.rows.push(this.cols().map((c) => c === 'Freq' ? 1 : 0));
        this.rows[this.r][this.c] = v; this.ed.clear(); return true;
      } catch (e) { this.error = e; this.phase = 'error'; return false; }
    },
    compute() {
      if (!this.commit()) return;
      try {
        if (!this.rows.length) throw new CalcError('math');
        const xs = this.rows.map((r) => r[0]);
        let out;
        const d = { noSurd: true };
        if (twoVar) {
          const s = E.stats2(xs, this.rows.map((r) => r[1]));
          out = [R('n =', s.n), R('x̄ =', s.mx, d), R('ȳ =', s.my, d), R('Σx =', s.sumx, d), R('Σy =', s.sumy, d), R('Σx² =', s.sumx2, d), R('Σxy =', s.sumxy, d),
            R('σx =', s.sx, d), R('sx =', s.sxs, d), R('σy =', s.sy, d), R('sy =', s.sys, d), { html: '<span class="note">สมการถดถอย y = a + bx</span>' }, R('a =', s.a, d), R('b =', s.b, d), R('r =', s.r, d), R('r² =', s.r2, d)];
        } else {
          const s = E.stats1(xs, settings.freq ? this.rows.map((r) => r[1]) : null);
          out = [R('n =', s.n), R('x̄ =', s.mean, d), R('Σx =', s.sum, d), R('Σx² =', s.sum2, d), R('σx =', s.sigma, d), R('sx =', s.s, d), R('min =', s.min, d), R('Q₁ =', s.q1, d), R('Med =', s.med, d), R('Q₃ =', s.q3, d), R('max =', s.max, d)];
        }
        this.results = out; this.phase = 'result'; this.scroll = 0;
      } catch (e) { this.error = e; this.phase = 'error'; }
    },
    render() {
      if (this.phase === 'error') return errHtml(this.error);
      const cols = this.cols();
      const total = Math.max(this.rows.length + 1, this.r + 1);
      if (this.r < this.top) this.top = this.r; if (this.r > this.top + 3) this.top = this.r - 3;
      let h = `<table class="stab"><tr><th></th>${cols.map((c) => `<th><i>${c}</i></th>`).join('')}</tr>`;
      for (let i = this.top; i < Math.min(total, this.top + 4); i++) {
        h += `<tr><td class="rn">${i + 1}</td>${cols.map((c, j) => {
          const v = this.rows[i] ? this.rows[i][j] : undefined;
          const on = i === this.r && j === this.c;
          return `<td class="${on ? 'on' : ''}" data-cell="${i},${j}">${v === undefined ? '' : realHtml(v, 'dec')}</td>`;
        }).join('')}</tr>`;
      }
      h += '</table>';
      h += `<div class="sinput">${this.ed.isEmpty() ? CUR : this.ed.html(true)}</div><div class="hint">[=] บันทึก · SHIFT 1 (STAT) = ผลลัพธ์/จัดการข้อมูล</div>`;
      return h;
    },
    key(k, payload) {
      if (this.phase === 'error') { if (['ac', 'back', 'left', 'right', 'exe'].includes(k)) { this.phase = 'input'; } return; }
      if (this.phase === 'result') {
        if (k === 'up') this.scroll = Math.max(0, this.scroll - 1);
        else if (k === 'down') this.scroll = Math.min(Math.max(0, this.results.length - 5), this.scroll + 1);
        else if (['ac', 'exe'].includes(k)) this.phase = 'input';
        return;
      }
      const nc = this.cols().length;
      if (k === 'ok') return this.compute();
      if (k === 'exe') { if (this.ed.isEmpty() && this.r >= this.rows.length) return this.compute(); if (this.commit()) this.r++; return; }
      if (k === 'up' || k === 'down') { if (this.ed.vertical(k === 'up' ? -1 : 1)) return; this.ed.clear(); this.r = Math.max(0, Math.min(this.rows.length, this.r + (k === 'up' ? -1 : 1))); return; }
      if ((k === 'left' || k === 'right') && this.ed.isEmpty()) { this.c = Math.max(0, Math.min(nc - 1, this.c + (k === 'left' ? -1 : 1))); return; }
      if (k === 'left') return this.ed.left();
      if (k === 'right') return this.ed.right();
      if (k === 'ac') return this.ed.clear();
      if (k === 'del') { if (this.ed.isEmpty() && this.rows[this.r]) { this.rows.splice(this.r, 1); return; } return this.ed.del(); }
      insertInto(this.ed, k, payload);
    },
    tools() {
      return [
        { label: 'ลบแถวนี้', act: () => { this.rows.splice(this.r, 1); } },
        { label: 'แทรกแถวว่าง', act: () => { this.rows.splice(this.r, 0, this.cols().map((c) => c === 'Freq' ? 1 : 0)); } },
        { label: 'ลบข้อมูลทั้งหมด', act: () => { this.rows = []; this.r = 0; this.top = 0; } },
        ...(twoVar ? [] : [{ label: `คอลัมน์ความถี่ (Freq): ${settings.freq ? 'เปิด' : 'ปิด'}`, act: () => { settings.freq = !settings.freq; if (this.c > 0) this.c = 0; this.rows = this.rows.map((r) => settings.freq ? [r[0], 1] : [r[0]]); saveAll(); } }]),
      ];
    },
  };
}
// stats results reuse the form results renderer
const resultsHtml = (app) => {
  const rows = app.results, vis = rows.slice(app.scroll, app.scroll + 5);
  return `<div class="results">${vis.map((r) => r.html !== undefined ? `<div class="rrow wide">${r.html}</div>` : `<div class="rrow"><span class="rl">${r.label}</span><span class="rv">${r.value}</span></div>`).join('')}</div>`
    + (rows.length > 5 ? `<div class="scrollhint">${app.scroll > 0 ? '▲' : ''} ${app.scroll + 5 < rows.length ? '▼' : ''}</div>` : '')
    + `<div class="hint">[AC] กลับไปแก้ข้อมูล</div>`;
};

// ======================= menus =======================
function openMenu(title, items, opts = {}) {
  state.menu = state.menu || [];
  state.menu.push({ title, items, sel: Math.max(0, items.findIndex((i) => i.check)), ...opts });
}
function closeMenu(all = false) { if (!state.menu) return; if (all) state.menu = null; else { state.menu.pop(); if (!state.menu.length) state.menu = null; } }
function menuKey(k) {
  const m = state.menu[state.menu.length - 1];
  if (k === 'up') m.sel = (m.sel - 1 + m.items.length) % m.items.length;
  else if (k === 'down') m.sel = (m.sel + 1) % m.items.length;
  else if (k === 'exe' || k === 'right') chooseMenu(m.sel);
  else if (k === 'left' || k === 'del') closeMenu();
  else if (k === 'ac') closeMenu(true);
  else if (/^[1-9]$/.test(k) && Number(k) <= m.items.length) chooseMenu(Number(k) - 1);
}
function chooseMenu(i) {
  const m = state.menu[state.menu.length - 1]; const it = m.items[i]; if (!it) return;
  m.sel = i;
  if (it.sub) return openMenu(it.label.replace(/<[^>]+>/g, ''), it.sub());
  if (it.keep) { it.act(); return; }
  closeMenu(true);
  it.act && it.act();
}
function menuHtml() {
  const m = state.menu[state.menu.length - 1];
  const per = 6, start = Math.max(0, Math.min(m.sel - 2, m.items.length - per));
  const vis = m.items.slice(start, start + per);
  return `<div class="menu"><div class="mtitle">${m.title}</div>${vis.map((it, j) => {
    const i = start + j;
    return `<div class="mi${i === m.sel ? ' on' : ''}" data-mi="${i}"><span class="mn">${i < 9 ? i + 1 : ''}</span><span class="ml">${it.label}</span>${it.check ? '<span class="mc">●</span>' : it.sub ? '<span class="mc">›</span>' : it.hint ? `<span class="mh">${it.hint}</span>` : ''}</div>`;
  }).join('')}${m.items.length > per ? `<div class="scrollhint">${start > 0 ? '▲' : ''} ${start + per < m.items.length ? '▼' : ''}</div>` : ''}</div>`;
}

// ---- menu contents ----
const ins = (tokens, label, hint) => ({ label, hint, act: () => appInsert(tokens) });
function appInsert(tokens) {
  const app = state.view; if (!app || !app.key) return;
  const list = Array.isArray(tokens) ? tokens : [tokens];
  list.forEach((t) => {
    if (typeof t === 'object' && t.k) app.key(t.k);
    else app.key('insert', t);
  });
}
const K = (k) => ({ k });
function functionMenu() {
  const cat = [
    { label: 'เลขยกกำลัง / ลอการิทึม', sub: () => [ins('ln(', 'ln( ลอการิทึมธรรมชาติ'), ins([K('ex')], 'e<sup>x</sup>'), ins([K('tenx')], '10<sup>x</sup>'), ins('log(', 'log( ฐาน 10'), ins([K('logb')], 'log<sub>a</sub>b'), ins([K('cube')], 'x³'), ins([K('root')], '<sup>n</sup>√x')] },
    { label: 'ไฮเพอร์โบลิก', sub: () => ['sinh(', 'cosh(', 'tanh(', 'sinh⁻¹(', 'cosh⁻¹(', 'tanh⁻¹('].map((t) => ins(t, t)) },
    { label: 'ความน่าจะเป็น', sub: () => [ins('!', 'x! แฟกทอเรียล'), ins('P', 'nPr การเรียงสับเปลี่ยน'), ins('C', 'nCr การจัดหมู่'), ins('%', '% เปอร์เซ็นต์'), ins('Ran#', 'Ran# สุ่ม 0–1'), ins('RanInt#(', 'RanInt#(a,b) สุ่มจำนวนเต็ม')] },
    { label: 'ตัวเลข', sub: () => [ins([K('abs')], '|x| ค่าสัมบูรณ์'), ins('Int(', 'Int( ส่วนจำนวนเต็ม'), ins('Intg(', 'Intg( ปัดลง'), ins('Rnd(', 'Rnd( ปัดตามหลักแสดงผล'), ins('GCD(', 'GCD(a,b) ห.ร.ม.'), ins('LCM(', 'LCM(a,b) ค.ร.น.')] },
    { label: 'แคลคูลัส', sub: () => [ins('∫(', '∫( ปริพันธ์', '∫(f(x),a,b)'), ins('d/dx(', 'd/dx( อนุพันธ์', 'd/dx(f(x),a)'), ins('Σ(', 'Σ( ผลบวก', 'Σ(f(x),a,b)'), ins('Π(', 'Π( ผลคูณ', 'Π(f(x),a,b)')] },
    { label: 'มุม', sub: () => [ins('ᵒ', '° องศา'), ins('ʳ', 'ʳ เรเดียน'), ins('ᵍ', 'ᵍ เกรเดียน')] },
    { label: 'แก้สมการ (SOLVE)', sub: () => [ins('=', 'ใส่เครื่องหมาย =', 'แล้วกด EXE'), ins('x', 'ตัวแปร x')] },
    { label: 'ค่าคงที่ทางวิทยาศาสตร์', sub: constMenu },
  ];
  if (state.app === 'cplx') cat.unshift({ label: 'จำนวนเชิงซ้อน', sub: () => [ins('i', '<i>i</i> หน่วยจินตภาพ'), ins('∠', '∠ รูปเชิงขั้ว'), ins('Arg(', 'Arg( อาร์กิวเมนต์'), ins('Conjg(', 'Conjg( สังยุค'), ins('ReP(', 'ReP( ส่วนจริง'), ins('ImP(', 'ImP( ส่วนจินตภาพ')] });
  if (state.app === 'base') return [{ label: 'ตรรกะ (Logic)', sub: () => ['and', 'or', 'xor', 'xnor', 'Not(', 'Neg('].map((t) => ins(t, t)) }];
  return cat;
}
const constMenu = () => Object.entries(E.CONSTANTS).map(([k, c]) => ins('§' + k, `${c.label} <small>${c.name}</small>`));
function settingsMenu() {
  const set = (fn) => () => { fn(); saveAll(); };
  return [
    { label: 'หน่วยมุม', sub: () => [['deg', 'องศา (Degree)'], ['rad', 'เรเดียน (Radian)'], ['gra', 'เกรเดียน (Gradian)']].map(([v, l]) => ({ label: l, check: settings.angle === v, act: set(() => { settings.angle = v; }) })) },
    { label: 'รูปแบบคำตอบ', sub: () => [['math', 'เศษส่วน / รูท / π (ตามตำรา)'], ['dec', 'ทศนิยมเสมอ']].map(([v, l]) => ({ label: l, check: settings.output === v, act: set(() => { settings.output = v; }) })) },
    { label: 'รูปแบบตัวเลข', sub: () => [
      { label: 'ปกติ (Norm)', check: settings.fmt.mode === 'norm', act: set(() => { settings.fmt = { mode: 'norm' }; }) },
      { label: 'ทศนิยมคงที่ (Fix)', check: settings.fmt.mode === 'fix', sub: () => Array.from({ length: 10 }, (_, n) => ({ label: `Fix ${n} ตำแหน่ง`, check: settings.fmt.mode === 'fix' && settings.fmt.n === n, act: set(() => { settings.fmt = { mode: 'fix', n }; }) })) },
      { label: 'วิทยาศาสตร์ (Sci)', check: settings.fmt.mode === 'sci', sub: () => Array.from({ length: 10 }, (_, n) => ({ label: `Sci ${n + 1} หลัก`, check: settings.fmt.mode === 'sci' && settings.fmt.n === n + 1, act: set(() => { settings.fmt = { mode: 'sci', n: n + 1 }; }) })) },
    ] },
    { label: 'รีเซ็ตเครื่องคิดเลข', sub: () => [{ label: 'ยืนยัน: ล้างการตั้งค่า ตัวแปร และประวัติ', act: () => { Object.assign(settings, { angle: 'deg', fmt: { mode: 'norm' }, output: 'math', freq: false }); Object.keys(vars).forEach((k) => delete vars[k]); history = []; saveAll(); renderSide(); launch('calc'); } }, { label: 'ยกเลิก', act: () => {} }] },
    { label: 'เกี่ยวกับ', sub: () => [{ label: 'อัศวิน KN-991 ชมพู · เครื่องคิดเลขวิทยาศาสตร์', act: () => {} }, { label: 'ทำงานออฟไลน์ได้ · เก็บข้อมูลไว้ในเครื่องนี้', act: () => {} }] },
  ];
}

// ======================= app switching =======================
const calcCache = {};
const MODES = [
  ['calc', 'COMP', 'คำนวณทั่วไป'], ['cplx', 'CMPLX', 'จำนวนเชิงซ้อน'], ['stat', 'STAT', 'สถิติ'], ['base', 'BASE-N', 'ฐานเลข'], ['eqn', 'EQN', 'สมการ'],
  ['table', 'TABLE', 'ตารางค่า f(x)'], ['ineq', 'INEQ', 'อสมการ'], ['dist', 'DIST', 'การแจกแจง'], ['ratio', 'RATIO', 'อัตราส่วน'],
];
const modeTag = () => (MODES.find((m) => m[0] === state.app) || [])[1] || '';
function launch(id) {
  state.menu = null;
  state.app = id;
  if (id === 'calc' || id === 'cplx' || id === 'base') { state.view = calcCache[id] = calcCache[id] || makeCalcApp(id); return; }
  state.view = null;
  if (id === 'stat') openMenu('STAT: เลือกชนิด', [{ label: '1-VAR (1 ตัวแปร)', act: () => { state.view = makeStat(false); } }, { label: 'A+BX (y = a + bx)', act: () => { state.view = makeStat(true); } }], { root: true });
  if (id === 'eqn') openMenu('EQN: เลือกชนิด', [
    ...[2, 3, 4].map((n) => ({ label: `ระบบสมการ ${n} ตัวแปร`, act: () => { state.view = equationForm('simul', n); } })),
    ...[2, 3, 4].map((n) => ({ label: `${['ax²+bx+c', 'ax³+bx²+cx+d', 'ax⁴+…+e'][n - 2]} = 0`, act: () => { state.view = equationForm('poly', n); } })),
  ], { root: true });
  if (id === 'ineq') openMenu('INEQ: เลือกดีกรี', [2, 3, 4].map((n) => ({ label: `ดีกรี ${n}`, sub: () => ['>', '<', '≥', '≤'].map((op) => ({ label: `… ${op} 0`, act: () => { state.view = inequalityForm(n, op); } })) })), { root: true });
  if (id === 'dist') openMenu('DIST: เลือกชนิด', DISTS.map((d) => ({ label: d.name, act: () => { state.view = distForm(d); } })), { root: true });
  if (id === 'ratio') openMenu('RATIO: เลือกแบบ', [{ label: 'A : B = X : D', act: () => { state.view = ratioForm(1); } }, { label: 'A : B = C : X', act: () => { state.view = ratioForm(2); } }], { root: true });
  if (id === 'table') state.view = tableForm();
}
const modeMenu = () => MODES.map(([id, tag, name]) => ({ label: `<b>${tag}</b> <small>${name}</small>`, act: () => launch(id) }));
const hypMenu = () => ['sinh(', 'cosh(', 'tanh(', 'sinh⁻¹(', 'cosh⁻¹(', 'tanh⁻¹('].map((t) => ins(t, t));
const drgMenu = () => [ins('ᵒ', '° องศา'), ins('ʳ', 'ʳ เรเดียน'), ins('ᵍ', 'ᵍ เกรเดียน')];
const VARNAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'x', 'y', 'M'];
const rclMenu = () => VARNAMES.map((k) => ({ label: `<i>${k}</i> = ${vars[k] ? valueHtml(vars[k], 'dec') : '0'}`, act: () => appInsert(k) }));
const stoMenu = () => VARNAMES.map((k) => ({ label: `Ans → <i>${k}</i>`, act: () => { vars[k] = vars.Ans || C(0); saveAll(); } }));
function clrMenu() {
  return [
    { label: 'Setup ตั้งค่ากลับเป็นค่าเริ่มต้น', act: () => { Object.assign(settings, { angle: 'deg', fmt: { mode: 'norm' }, output: 'math', freq: false }); saveAll(); } },
    { label: 'Memory ล้างตัวแปรและ M', act: () => { VARNAMES.forEach((k) => delete vars[k]); delete vars.Ans; saveAll(); } },
    { label: 'History ล้างประวัติ', act: () => { history = []; saveAll(); renderSide(); } },
    { label: 'All ล้างทั้งหมด', act: () => { Object.assign(settings, { angle: 'deg', fmt: { mode: 'norm' }, output: 'math', freq: false }); Object.keys(vars).forEach((k) => delete vars[k]); history = []; saveAll(); renderSide(); Object.keys(calcCache).forEach((k) => delete calcCache[k]); launch('calc'); } },
  ];
}
function cmplxMenu() {
  return [ins('Arg(', 'arg อาร์กิวเมนต์'), ins('Conjg(', 'Conjg สังยุค'), ins('ReP(', 'ReP ส่วนจริง'), ins('ImP(', 'ImP ส่วนจินตภาพ'), ins('∠', '∠ ใส่รูปเชิงขั้ว'),
    { label: '▶r∠θ แสดงคำตอบเชิงขั้ว', act: () => state.view.key('polar') }, { label: '▶a+bi แสดงคำตอบ a+bi', act: () => state.view.key('rect') }];
}
const baseMenu = () => ['and', 'or', 'xor', 'xnor', 'Not(', 'Neg('].map((t) => ins(t, t));
function statMenu() {
  const v = state.view;
  return [{ label: 'ผลลัพธ์ทางสถิติ', act: () => v.compute() }, ...v.tools()];
}

// ======================= key dispatch =======================
const SHIFTED = {
  mode: 'setup', abs: 'integ', cube: 'cbrt', inv: 'fact', logb: 'sigma', frac: 'mixed', sqrt: 'deriv', sq: 'solve', pow: 'root', log: 'tenx', ln: 'ex',
  neg: 'angle', sin: 'asin', cos: 'acos', tan: 'atan', rcl: 'sto', lp: 'pct', rp: 'comma', sd: 'mixtoggle', mplus: 'mminus',
  '7': 'const', '8': 'funcmenu', '9': 'clr', mul: 'npr', div: 'ncr', '1': 'statmenu', '2': 'cmplxmenu', '3': 'basemenu', add: 'pol', sub: 'rec',
  '0': 'rnd', dot: 'ran', exp: 'pi', ans: 'drg', exe: 'approx',
};
const ALPHAED = { neg: 'var:A', dms: 'var:B', hyp: 'var:C', sin: 'var:D', cos: 'var:E', tan: 'var:F', rp: 'var:x', sd: 'var:y', mplus: 'var:M', sq: 'eq', dot: 'ranint', exp: 'e' };
function press(k) {
  if (k === 'shift') { state.shift = !state.shift; state.alpha = false; return render(); }
  if (k === 'alpha') { state.alpha = !state.alpha; state.shift = false; return render(); }
  if (state.shift) { state.shift = false; if (SHIFTED[k]) k = SHIFTED[k]; }
  else if (state.alpha) { state.alpha = false; if (ALPHAED[k]) k = ALPHAED[k]; }
  if (k === 'on') { state.menu = null; if (!state.view) launch('calc'); else if (state.view.key) { state.view.key('ac'); state.view.key('ac'); } return render(); }
  if (k === 'mode') { state.menu = null; openMenu('MODE เลือกโหมด', modeMenu()); return render(); }
  if (k === 'setup') { state.menu = null; openMenu('SETUP ตั้งค่า', settingsMenu()); return render(); }
  if (k === 'clr') { state.menu = null; openMenu('CLR ล้างข้อมูล', clrMenu()); return render(); }
  if (state.menu) { menuKey(k); if (!state.menu && !state.view) launch('calc'); return render(); }
  const v = state.view;
  if (!v) { launch('calc'); return render(); }
  const menus = { hyp: ['hyp', hypMenu], drg: ['DRG▶ แปลงหน่วยมุม', drgMenu], rcl: ['RCL เรียกค่าตัวแปร', rclMenu], sto: ['STO เก็บ Ans ลงตัวแปร', stoMenu], const: ['CONST ค่าคงที่วิทยาศาสตร์', constMenu], funcmenu: ['ฟังก์ชันเพิ่มเติม', functionMenu] };
  if (state.app === 'base' && k === 'hyp') { v.key(k); return render(); }
  if (menus[k]) { openMenu(menus[k][0], menus[k][1]()); return render(); }
  if (k === 'cmplxmenu') { if (state.app === 'cplx') openMenu('CMPLX', cmplxMenu()); return render(); }
  if (k === 'basemenu') { if (state.app === 'base') openMenu('BASE ตรรกะ', baseMenu()); return render(); }
  if (k === 'statmenu') { if (state.app === 'stat' && v.tools) openMenu('STAT', statMenu()); return render(); }
  v.key(k);
  render();
}

// ======================= DOM =======================
const $ = (s) => document.querySelector(s);
const screen = $('#lcd');
function statusHtml() {
  const ang = { deg: 'D', rad: 'R', gra: 'G' }[settings.angle];
  const m = vars.M && (vars.M.re || vars.M.im);
  const fx = settings.fmt.mode === 'fix' ? 'FIX' : settings.fmt.mode === 'sci' ? 'SCI' : '';
  const v = state.view;
  const up = v && v.kind && history.some((h) => h.mode === v.mode());
  const ind = (on, t, cls = '') => `<span class="ind${on ? ' on' : ''} ${cls}">${t}</span>`;
  return `<div class="status">${ind(state.shift, 'S', 'sh')}${ind(state.alpha, 'A', 'al')}${ind(m, 'M')}${modeTag() !== 'COMP' ? ind(true, modeTag()) : ''}${ind(true, ang)}${fx ? ind(true, fx) : ''}<span class="stitle"></span>${ind(settings.output === 'math', 'Math')}<span class="arrow">${up ? '▲' : ''}</span></div>`;
}
function render() {
  let body;
  if (state.menu) body = menuHtml();
  else if (!state.view) body = '';
  else if (state.view.phase === 'result' && !state.view.kind) body = resultsHtml(state.view);
  else if (state.view.phase === 'histview') body = `<div class="expr">${state.view.ed.html(false)}</div><div class="res">${state.view.histHtml}</div><div class="hint">▲▼ ประวัติ · ◀▶ แก้ไข</div>`;
  else body = state.view.render();
  screen.innerHTML = statusHtml() + `<div class="lcd-body">${body}</div>`;
  document.body.classList.toggle('shifted', state.shift);
  document.body.classList.toggle('alphaed', state.alpha);
  const cur = screen.querySelector('.cursor');
  const ex = screen.querySelector('#expr');
  if (cur && ex) {
    const cr = cur.getBoundingClientRect(), er = ex.getBoundingClientRect();
    if (cr.right > er.right - 8) ex.scrollLeft += cr.right - er.right + 24;
    else if (cr.left < er.left + 8) ex.scrollLeft -= er.left - cr.left + 24;
  }
}

// side panel (iPad / desktop)
function renderSide() {
  const el = $('#histList'); if (!el) return;
  const hs = history.slice().reverse().slice(0, 30);
  el.innerHTML = hs.length ? hs.map((h, i) => `<li data-h="${history.length - 1 - i}"><div class="hx">${renderList(h.items, null)}</div><div class="hr">= ${h.html}</div></li>`).join('') : '<li class="empty">ยังไม่มีประวัติ ลองกดคำนวณดูสิ ♡</li>';
}

// keypad wiring
document.querySelectorAll('[data-k]').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.classList.add('down');
    if (navigator.vibrate) navigator.vibrate(6);
    press(b.dataset.k);
  });
  const up = () => b.classList.remove('down');
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
});
// tapping the screen
screen.addEventListener('click', (e) => {
  const mi = e.target.closest('[data-mi]'); if (mi) { chooseMenu(Number(mi.dataset.mi)); return render(); }
  const f = e.target.closest('[data-field]'); if (f && state.view && state.view.select) { state.view.select(Number(f.dataset.field)); return render(); }
  const c = e.target.closest('[data-cell]'); if (c && state.view && state.view.rows) { const [r, cc] = c.dataset.cell.split(',').map(Number); state.view.ed.clear(); state.view.r = r; state.view.c = cc; return render(); }
});
$('#histList')?.addEventListener('click', (e) => {
  const li = e.target.closest('[data-h]'); if (!li) return;
  const h = history[Number(li.dataset.h)];
  const id = h.mode === 'complex' ? 'cplx' : h.mode === 'base' ? 'base' : 'calc';
  launch(id); state.view.ed.set(h.items); state.view.phase = 'input'; render();
});
$('#clearHist')?.addEventListener('click', () => { history = []; saveAll(); renderSide(); });

// physical keyboard
const KB = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '.': 'dot', ',': 'comma',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '(': 'lp', ')': 'rp', '^': 'pow', '!': 'fact', '%': 'pct', '=': 'eq',
  Enter: 'exe', Backspace: 'del', Delete: 'ac', Escape: 'ac', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  x: 'var:x', y: 'var:y', s: 'sin', c: 'cos', t: 'tan', l: 'ln', r: 'sqrt', p: 'pi', e: 'e', m: 'mode', Shift: null,
};
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = KB[e.key];
  if (k) { e.preventDefault(); press(k); }
});

// iOS: block double-tap zoom & rubber-band on the keypad
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});

launch('calc');
renderSide();
render();
window.__calc = { press, state, settings, vars };
