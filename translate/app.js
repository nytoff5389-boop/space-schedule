// แปลสด: listen with the device's speech recognition, translate EN⇄TH as the words arrive.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const feed = $('feed'), empty = $('empty'), emptySub = $('emptySub');
  const mic = $('mic'), micLabel = $('micLabel'), statusEl = $('status');
  const speakBtn = $('speakToggle'), bigBtn = $('bigToggle'), clearBtn = $('clearBtn');
  const dirButtons = [...document.querySelectorAll('#dirs [data-dir]')];

  const DIRS = {
    'en-th': { recLang: 'en-US', src: 'en', tgt: 'th', speakLang: 'th-TH', hint: 'คำแปลภาษาไทยจะขึ้นตรงนี้ทันทีขณะที่เขาพูด' },
    'th-en': { recLang: 'th-TH', src: 'th', tgt: 'en', speakLang: 'en-US', hint: 'คำแปลภาษาอังกฤษจะขึ้นตรงนี้ทันทีขณะที่พูด' },
  };

  // ---------- small storage helpers (never let storage break the app) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tr.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tr.' + k, JSON.stringify(v)); } catch {} },
  };

  let dir = store.get('dir', 'en-th');
  if (!DIRS[dir]) dir = 'en-th';
  let speakOn = store.get('speak', false);
  let bigOn = store.get('big', false);
  let history = store.get('history', []);

  // ---------- translation ----------
  const cache = new Map();
  async function translate(text, src, tgt) {
    text = text.trim();
    if (!text) return '';
    const key = src + tgt + text;
    if (cache.has(key)) return cache.get(key);
    let out = '';
    try {
      const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
        + '&sl=' + src + '&tl=' + tgt + '&q=' + encodeURIComponent(text);
      const r = await fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      out = (j[0] || []).map((p) => p[0] || '').join('');
    } catch {
      try {
        const u = 'https://api.mymemory.translated.net/get?langpair=' + src + '|' + tgt + '&q=' + encodeURIComponent(text);
        const r = await fetch(u);
        const j = await r.json();
        out = (j.responseData && j.responseData.translatedText) || '';
      } catch { out = ''; }
    }
    if (out) {
      cache.set(key, out);
      if (cache.size > 400) cache.delete(cache.keys().next().value);
    }
    return out;
  }

  // ---------- rendering ----------
  function timeStr(t) {
    return new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }
  function scrollDown() {
    requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
  }
  function updateEmpty() {
    empty.hidden = feed.querySelectorAll('.line').length > 0;
    emptySub.textContent = DIRS[dir].hint;
  }
  function makeLine(item) {
    const el = document.createElement('article');
    el.className = 'line';
    el.innerHTML = '<p class="tr"></p><p class="or"></p><div class="meta"><span class="when"></span>'
      + '<button class="say" type="button" aria-label="อ่านออกเสียง">🔊</button></div>';
    fillLine(el, item);
    el.querySelector('.say').addEventListener('click', () => speak(el._item.tr, DIRS[el._item.dir].speakLang, true));
    return el;
  }
  function fillLine(el, item) {
    el._item = item;
    el.querySelector('.tr').textContent = item.tr || '…';
    el.querySelector('.or').textContent = item.or;
    el.querySelector('.when').textContent = timeStr(item.t);
  }
  function renderHistory() {
    feed.querySelectorAll('.line').forEach((n) => n.remove());
    for (const item of history) feed.appendChild(makeLine(item));
    updateEmpty();
    scrollDown();
  }
  function saveHistory() {
    if (history.length > 400) history = history.slice(-400);
    store.set('history', history);
  }

  // live line (what is being said right now)
  let liveEl = null;
  function showLive(orText, trText, trPending) {
    if (!liveEl) {
      liveEl = document.createElement('article');
      liveEl.className = 'line live';
      liveEl.innerHTML = '<p class="tr"></p><p class="or"></p>';
      feed.appendChild(liveEl);
      updateEmpty();
    }
    const tr = liveEl.querySelector('.tr');
    tr.textContent = trText || '';
    if (trPending || !trText) {
      const c = document.createElement('span');
      c.className = 'caret';
      tr.appendChild(c);
    }
    liveEl.querySelector('.or').textContent = orText;
    scrollDown();
  }
  function dropLive() {
    if (liveEl) { liveEl.remove(); liveEl = null; updateEmpty(); }
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('err', !!isErr);
  }

  // ---------- speech output ----------
  let speaking = false;
  function speak(text, lang, force) {
    if (!text || !('speechSynthesis' in window)) return;
    if (!force && !speakOn) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 1;
    speaking = true;
    u.onend = u.onerror = () => { speaking = false; };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ---------- speech recognition ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;     // what the user wants
  let full = '', donePrefix = ''; // session transcript, and the part already committed
  let interim = '';
  let silenceTimer = null, restartTimer = null;
  let liveSeq = 0, liveShown = 0, liveFlying = 0, liveAsked = '', liveTr = '', liveFor = '';
  let wakeLock = null;
  let flushing = false;     // true between our own forced cut and the next session

  function commit(text) {
    text = text.trim();
    if (!text) return;
    const d = DIRS[dir];
    const item = { or: text, tr: '', dir, t: Date.now() };
    history.push(item);
    // reuse the live translation for an instant first paint, then refine
    if (liveTr) item.tr = liveTr;
    const el = makeLine(item);
    if (liveEl) feed.insertBefore(el, liveEl); else feed.appendChild(el);
    updateEmpty();
    scrollDown();
    translate(text, d.src, d.tgt).then((tr) => {
      item.tr = tr || item.tr || '(แปลไม่ได้ ตรวจอินเทอร์เน็ต)';
      fillLine(el, item);
      saveHistory();
      speak(item.tr, d.speakLang);
    });
  }

  // translate what is being said right now: newest request wins, a slow one never blocks the next
  function pumpLive() {
    const text = interim.trim();
    if (!text || text === liveAsked || liveFlying >= 3) return;
    liveAsked = text;
    const d = DIRS[dir];
    const seq = ++liveSeq;
    liveFlying++;
    translate(text, d.src, d.tgt).then((tr) => {
      liveFlying--;
      if (tr && seq > liveShown && interim.trim()) {
        liveShown = seq;
        liveTr = tr; liveFor = text;
        showLive(interim, tr, true);
      }
      pumpLive(); // catch up with words that arrived meanwhile
    });
  }

  // Everything heard in this session as one string. Works the same whether the
  // engine marks pieces final early, late, or never (iOS Safari differs from Chrome).
  function onResult(e) {
    if (speaking || flushing) return; // skip our own voice and words already committed
    let all = '', allFinal = e.results.length > 0;
    for (let i = 0; i < e.results.length; i++) {
      all += e.results[i][0].transcript;
      if (!e.results[i].isFinal) allFinal = false;
    }
    if (!all.startsWith(donePrefix)) {
      donePrefix = all.length < donePrefix.length ? '' : all.slice(0, donePrefix.length);
    }
    full = all;
    const next = full.slice(donePrefix.length);
    if (next.trim() !== interim.trim()) {
      interim = next;
      if (interim.trim()) {
        showLive(interim, liveTr, true);
        pumpLive();
      } else {
        dropLive();
      }
    }
    // Close the sentence when the speaker pauses, the engine says it is done, or it gets long.
    clearTimeout(silenceTimer);
    if (interim.trim()) {
      if (interim.length > 150) {
        // lecture: speaker does not pause, so cut at the last sentence end or word gap
        const head = interim.slice(0, 150);
        let cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '), head.lastIndexOf(', '));
        if (cut < 60) cut = head.lastIndexOf(' ');
        forceFinal(cut > 40 ? cut + 1 : interim.length);
      } else silenceTimer = setTimeout(forceFinal, allFinal ? 350 : 900);
    }
  }

  function forceFinal(upTo) {
    clearTimeout(silenceTimer);
    if (!interim.trim()) return;
    const n = typeof upTo === 'number' ? upTo : interim.length;
    const text = interim.slice(0, n);
    donePrefix += text;
    interim = interim.slice(n);
    commit(text);
    liveTr = ''; liveFor = ''; liveAsked = '';
    liveShown = liveSeq; // ignore answers still on the way for the old words
    if (interim.trim()) { showLive(interim, '', true); pumpLive(); silenceTimer = setTimeout(forceFinal, 900); }
    else dropLive();
  }

  function startSession() {
    clearTimeout(restartTimer);
    if (!listening) return;
    rec = new SR();
    rec.lang = DIRS[dir].recLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    full = ''; donePrefix = '';
    interim = '';
    flushing = false;
    rec.onresult = onResult;
    rec.onstart = () => setStatus('กำลังฟัง ' + (dir === 'en-th' ? 'ภาษาอังกฤษ' : 'ภาษาไทย') + '…');
    rec.onerror = (e) => {
      const err = e.error;
      if (err === 'no-speech' || err === 'aborted') return;
      if (err === 'not-allowed') {
        stop();
        setStatus('ยังไม่ได้อนุญาตไมโครโฟน: ตั้งค่า → Safari → ไมโครโฟน → อนุญาต', true);
      } else if (err === 'service-not-allowed') {
        stop();
        setStatus('ต้องเปิด “การป้อนตามคำบอก”: ตั้งค่า → ทั่วไป → แป้นพิมพ์', true);
      } else if (err === 'network') {
        setStatus('ต้องต่ออินเทอร์เน็ตเพื่อฟังและแปล', true);
      } else if (err === 'audio-capture') {
        stop();
        setStatus('เปิดไมโครโฟนไม่ได้ อาจมีแอปอื่นใช้อยู่', true);
      } else if (err === 'language-not-supported') {
        stop();
        setStatus('เครื่องนี้ยังไม่รองรับการฟังภาษานี้', true);
      }
    };
    rec.onend = () => {
      // commit anything left hanging, then keep listening until the user taps stop
      forceFinal();
      full = ''; donePrefix = '';
      rec = null;
      if (listening) restartTimer = setTimeout(startSession, 120);
    };
    try { rec.start(); } catch { restartTimer = setTimeout(startSession, 400); }
  }

  async function start() {
    if (!SR) {
      setStatus('เครื่องนี้ฟังเสียงไม่ได้ ลองเปิดใน Safari (iPhone/iPad) หรือ Chrome', true);
      return;
    }
    listening = true;
    mic.setAttribute('aria-pressed', 'true');
    micLabel.textContent = 'กำลังฟัง · แตะเพื่อหยุด';
    setStatus('กำลังเปิดไมโครโฟน…');
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    startSession();
  }

  function stop() {
    listening = false;
    clearTimeout(silenceTimer);
    clearTimeout(restartTimer);
    mic.setAttribute('aria-pressed', 'false');
    micLabel.textContent = 'แตะเพื่อฟัง';
    setStatus('');
    if (rec) { try { rec.stop(); } catch {} }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  // ---------- controls ----------
  mic.addEventListener('click', () => (listening ? stop() : start()));

  function setDir(d) {
    if (listening && rec && d !== dir && interim.trim()) forceFinal(); // finish old-language words first
    dir = d;
    store.set('dir', d);
    dirButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dir === d)));
    updateEmpty();
    if (listening && rec) {
      // flush current words in the old direction, then restart in the new language
      flushing = true; try { rec.abort(); } catch {}
    }
  }
  dirButtons.forEach((b) => b.addEventListener('click', () => setDir(b.dataset.dir)));

  function paintToggles() {
    speakBtn.setAttribute('aria-pressed', String(speakOn));
    bigBtn.setAttribute('aria-pressed', String(bigOn));
    document.body.classList.toggle('big', bigOn);
  }
  speakBtn.addEventListener('click', () => {
    speakOn = !speakOn; store.set('speak', speakOn); paintToggles();
    if (speakOn && 'speechSynthesis' in window) { // unlock audio on iOS inside the tap
      const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
    }
  });
  bigBtn.addEventListener('click', () => { bigOn = !bigOn; store.set('big', bigOn); paintToggles(); scrollDown(); });
  clearBtn.addEventListener('click', () => { history = []; saveHistory(); dropLive(); renderHistory(); });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && listening && !wakeLock && 'wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    }
  });

  // preview data for screenshots: open with #demo
  if (location.hash === '#demo') {
    const now = Date.now();
    history = [
      { or: 'Hi, could you tell me how to get to the train station?', tr: 'สวัสดีครับ ช่วยบอกทางไปสถานีรถไฟหน่อยได้ไหมครับ', dir: 'en-th', t: now - 180000 },
      { or: 'I think it is about ten minutes from here on foot.', tr: 'ผมคิดว่าเดินจากตรงนี้ไปประมาณสิบนาที', dir: 'en-th', t: now - 120000 },
      { or: 'ขอบคุณมากค่ะ ต้องเลี้ยวซ้ายตรงไฟแดงใช่ไหมคะ', tr: 'Thank you very much. Do I turn left at the traffic light?', dir: 'th-en', t: now - 60000 },
    ];
    renderHistory();
    interim = 'Yes, turn left and then walk straight past the';
    showLive(interim, 'ใช่ครับ เลี้ยวซ้ายแล้วเดินตรงผ่าน', true);
    mic.setAttribute('aria-pressed', 'true');
    micLabel.textContent = 'กำลังฟัง · แตะเพื่อหยุด';
    setStatus('กำลังฟัง ภาษาอังกฤษ…');
  } else {
    renderHistory();
  }
  setDir(dir);
  paintToggles();
  if (!SR) setStatus('เครื่องนี้ฟังเสียงไม่ได้ ลองเปิดใน Safari (iPhone/iPad) หรือ Chrome', true);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
})();
