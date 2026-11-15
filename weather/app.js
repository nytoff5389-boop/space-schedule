/* ฟ้าวันนี้ — Thai weather page.
   Sources:
   - Thai Meteorological Department (TMD) open data: station observations (every 3 h),
     today's max/min, 7-day province forecast, warnings. Read straight from data.tmd.go.th
     when the browser is allowed to, otherwise from the copy the hourly GitHub Action
     saves to ./data/.
   - Open-Meteo: model data for "now" between TMD reports, hourly, days 8-16, and
     5-year averages for days 17-30. Always labelled as Open-Meteo on the page. */
'use strict';

const TMD_KEY = 'uid=api&ukey=api12345';
const TMD_FEEDS = {
  forecast7: `https://data.tmd.go.th/api/WeatherForecast7Days/v2/?${TMD_KEY}`,
  obs3h: `https://data.tmd.go.th/api/Weather3Hours/V2/?${TMD_KEY}`,
  today: `https://data.tmd.go.th/api/WeatherToday/V2/?${TMD_KEY}`,
  warning: `https://data.tmd.go.th/api/WeatherWarningNews/v2/?${TMD_KEY}`,
};
const REFRESH_MS = 10 * 60 * 1000;
const TZ = 'Asia/Bangkok';

// 77 provinces: Thai name, English name (English is used to look up coordinates).
const PROVINCES = [
  ['กรุงเทพมหานคร','Bangkok'],['กระบี่','Krabi'],['กาญจนบุรี','Kanchanaburi'],['กาฬสินธุ์','Kalasin'],['กำแพงเพชร','Kamphaeng Phet'],
  ['ขอนแก่น','Khon Kaen'],['จันทบุรี','Chanthaburi'],['ฉะเชิงเทรา','Chachoengsao'],['ชลบุรี','Chon Buri'],['ชัยนาท','Chai Nat'],
  ['ชัยภูมิ','Chaiyaphum'],['ชุมพร','Chumphon'],['เชียงราย','Chiang Rai'],['เชียงใหม่','Chiang Mai'],['ตรัง','Trang'],
  ['ตราด','Trat'],['ตาก','Tak'],['นครนายก','Nakhon Nayok'],['นครปฐม','Nakhon Pathom'],['นครพนม','Nakhon Phanom'],
  ['นครราชสีมา','Nakhon Ratchasima'],['นครศรีธรรมราช','Nakhon Si Thammarat'],['นครสวรรค์','Nakhon Sawan'],['นนทบุรี','Nonthaburi'],['นราธิวาส','Narathiwat'],
  ['น่าน','Nan'],['บึงกาฬ','Bueng Kan'],['บุรีรัมย์','Buri Ram'],['ปทุมธานี','Pathum Thani'],['ประจวบคีรีขันธ์','Prachuap Khiri Khan'],
  ['ปราจีนบุรี','Prachin Buri'],['ปัตตานี','Pattani'],['พระนครศรีอยุธยา','Phra Nakhon Si Ayutthaya'],['พะเยา','Phayao'],['พังงา','Phangnga'],
  ['พัทลุง','Phatthalung'],['พิจิตร','Phichit'],['พิษณุโลก','Phitsanulok'],['เพชรบุรี','Phetchaburi'],['เพชรบูรณ์','Phetchabun'],
  ['แพร่','Phrae'],['ภูเก็ต','Phuket'],['มหาสารคาม','Maha Sarakham'],['มุกดาหาร','Mukdahan'],['แม่ฮ่องสอน','Mae Hong Son'],
  ['ยโสธร','Yasothon'],['ยะลา','Yala'],['ร้อยเอ็ด','Roi Et'],['ระนอง','Ranong'],['ระยอง','Rayong'],
  ['ราชบุรี','Ratchaburi'],['ลพบุรี','Lop Buri'],['ลำปาง','Lampang'],['ลำพูน','Lamphun'],['เลย','Loei'],
  ['ศรีสะเกษ','Si Sa Ket'],['สกลนคร','Sakon Nakhon'],['สงขลา','Songkhla'],['สตูล','Satun'],['สมุทรปราการ','Samut Prakan'],
  ['สมุทรสงคราม','Samut Songkhram'],['สมุทรสาคร','Samut Sakhon'],['สระแก้ว','Sa Kaeo'],['สระบุรี','Saraburi'],['สิงห์บุรี','Sing Buri'],
  ['สุโขทัย','Sukhothai'],['สุพรรณบุรี','Suphan Buri'],['สุราษฎร์ธานี','Surat Thani'],['สุรินทร์','Surin'],['หนองคาย','Nong Khai'],
  ['หนองบัวลำภู','Nong Bua Lam Phu'],['อ่างทอง','Ang Thong'],['อำนาจเจริญ','Amnat Charoen'],['อุดรธานี','Udon Thani'],['อุตรดิตถ์','Uttaradit'],
  ['อุทัยธานี','Uthai Thani'],['อุบลราชธานี','Ubon Ratchathani'],
];

const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_DOW_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const COMPASS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const r0 = v => v == null ? '–' : Math.round(v);
const norm = s => String(s || '').replace(/\s|จังหวัด|\./g, '').replace(/^กรุงเทพฯ?$/, 'กรุงเทพมหานคร').replace(/^กทม$/, 'กรุงเทพมหานคร');

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- dates (always Bangkok time) ----------
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const ymd = d => ymdFmt.format(d);
const todayYMD = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00+07:00'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const dow = s => new Date(s + 'T12:00:00+07:00').getUTCDay();
const dayNum = s => +s.slice(8, 10);
const monTh = s => TH_MON[+s.slice(5, 7) - 1];
const hm = d => hmFmt.format(d);
const bkk = (y, m, d, H = 0, M = 0) => new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}:00+07:00`);
const compass = deg => deg == null ? '' : COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// ---------- weather conditions ----------
// kind → [Thai label, emoji, background key]
const KINDS = {
  clear: ['ท้องฟ้าแจ่มใส', '☀️', 'clear'],
  mostly: ['มีเมฆเล็กน้อย', '🌤️', 'clear'],
  partly: ['มีเมฆบางส่วน', '⛅', 'partly'],
  cloudy: ['มีเมฆมาก', '☁️', 'cloudy'],
  overcast: ['เมฆครึ้ม', '☁️', 'overcast'],
  fog: ['มีหมอก', '🌫️', 'overcast'],
  drizzle: ['ฝนปรอยๆ', '🌦️', 'rain'],
  rain: ['ฝนตก', '🌧️', 'rain'],
  heavy: ['ฝนตกหนัก', '🌧️', 'rain'],
  storm: ['ฝนฟ้าคะนอง', '⛈️', 'storm'],
};
function kindFromCode(c) {
  if (c == null) return null;
  if (c === 0) return 'clear';
  if (c === 1) return 'mostly';
  if (c === 2) return 'partly';
  if (c === 3) return 'overcast';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if (c === 65 || c === 67 || c === 82) return 'heavy';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if (c >= 95) return 'storm';
  return 'cloudy';
}
// TMD 7-day: Thai description + % of area with rain.
function kindFromTmd(desc, pct) {
  const d = desc || '';
  if (/คะนอง/.test(d) && (pct ?? 0) >= 20) return 'storm';
  if ((pct ?? 0) >= 60) return /หนัก/.test(d) ? 'heavy' : 'rain';
  if ((pct ?? 0) >= 30) return 'rain';
  if (/หมอก/.test(d)) return 'fog';
  if (/เมฆมาก|ครึ้ม/.test(d)) return 'cloudy';
  if (/เมฆบางส่วน|เมฆเป็นส่วนมาก/.test(d)) return 'partly';
  if (/แจ่มใส|ร้อน|หนาว|เย็น/.test(d)) return 'clear';
  if ((pct ?? 0) >= 10) return 'partly';
  return 'mostly';
}

// ---------- XML helpers ----------
const kids = (el, name) => el ? [...el.children].filter(c => c.localName.toLowerCase() === name.toLowerCase()) : [];
const kid = (el, name) => kids(el, name)[0] || null;
const txt = (el, name) => { const k = kid(el, name); return k ? k.textContent.trim() : ''; };
const deep = (el, name) => el ? [...el.getElementsByTagName('*')].filter(c => c.localName.toLowerCase() === name.toLowerCase()) : [];

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML parse error');
  return doc;
}
function headerBuild(doc) {
  const h = deep(doc.documentElement, 'LastBuildDate')[0];
  if (!h) return null;
  const m = h.textContent.trim().match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? bkk(m[1], m[2], m[3], m[4], m[5]) : null;
}

function parseForecast7(doc) {
  const out = {};
  for (const p of deep(doc.documentElement, 'Province')) {
    const th = txt(p, 'ProvinceNameThai');
    if (!th) continue;
    const days = [];
    let cur = null;
    // Each day is a flat run of siblings that starts at <ForecastDate>. Handle both flat
    // and nested layouts by walking every descendant in document order.
    for (const el of p.getElementsByTagName('*')) {
      const n = el.localName;
      const v = el.textContent.trim();
      if (n === 'ForecastDate') {
        const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        cur = m ? { date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` } : null;
        if (cur) days.push(cur);
      } else if (cur && !el.children.length) {
        if (n === 'MaximumTemperature') cur.max = num(v);
        else if (n === 'MinimumTemperature') cur.min = num(v);
        else if (n === 'WindDirection') cur.windDir = num(v);
        else if (n === 'WindSpeed') cur.windKmh = num(v) == null ? null : num(v) * 1.852; // knots → km/h
        else if (n === 'PercentRainCover') cur.rainPct = num(v);
        else if (n === 'DescriptionThai') cur.desc = v;
        else if (n === 'TemperatureThai') cur.tempDesc = v;
      }
    }
    out[norm(th)] = { th, en: txt(p, 'ProvinceNameEnglish'), days };
  }
  return out;
}

function parseStations(doc, kind) {
  const list = [];
  for (const s of deep(doc.documentElement, 'Station')) {
    const o = kid(s, 'Observation');
    if (!o) continue;
    const st = {
      wmo: txt(s, 'WmoStationNumber'), name: txt(s, 'StationNameThai'), nameEn: txt(s, 'StationNameEnglish'),
      prov: txt(s, 'Province'), lat: num(txt(s, 'Latitude')), lon: num(txt(s, 'Longitude')),
    };
    const dt = txt(o, 'DateTime');
    let m;
    if ((m = dt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/))) st.time = bkk(m[3], m[1], m[2], m[4], m[5]);
    else if ((m = dt.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/))) st.time = bkk(m[1], m[2], m[3], m[4], m[5]);
    if (kind === 'obs3h') {
      Object.assign(st, {
        temp: num(txt(o, 'AirTemperature')), rh: num(txt(o, 'RelativeHumidity')), dew: num(txt(o, 'DewPoint')),
        mslp: num(txt(o, 'MeanSeaLevelPressure')), vis: num(txt(o, 'LandVisibility')),
        windDir: num(txt(o, 'WindDirection')), windKmh: num(txt(o, 'WindSpeed')),
        rain: num(txt(o, 'Rainfall')), rain24: num(txt(o, 'Rainfall24Hr')),
      });
    } else {
      Object.assign(st, {
        max: num(txt(o, 'MaxTemperature')), min: num(txt(o, 'MinTemperature')),
        rain: num(txt(o, 'Rainfall')), temp: num(txt(o, 'Temperature')),
      });
    }
    list.push(st);
  }
  return list;
}

// Warning feed: shape is not documented, so read it defensively and only use clear Thai text.
function parseWarning(doc) {
  const root = doc.documentElement;
  const title = deep(root, 'TitleThai')[0] || deep(root, 'HeadlineThai')[0];
  const body = deep(root, 'DescriptionThai')[0] || deep(root, 'DetailThai')[0];
  const date = deep(root, 'AnnounceDateTime')[0] || deep(root, 'AnnounceDate')[0] || deep(root, 'IssueDate')[0];
  if (!title) return null;
  return { title: title.textContent.trim(), body: body ? body.textContent.trim() : '', date: date ? date.textContent.trim() : '' };
}

// ---------- fetching ----------
async function fetchText(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}
async function fetchJson(url, ms = 12000) { return JSON.parse(await fetchText(url, ms)); }

let directBlocked = store.get('wx.directBlocked', 0); // TMD direct fetch failed recently → skip for a day
async function tmdFeed(name) {
  if (Date.now() - directBlocked > 864e5) {
    try { return { text: await fetchText(TMD_FEEDS[name], 7000), via: 'direct' }; }
    catch { directBlocked = Date.now(); store.set('wx.directBlocked', directBlocked); }
  }
  return { text: await fetchText(`data/${name}.xml?t=${Math.floor(Date.now() / 6e5)}`), via: 'mirror' };
}

async function loadTmd() {
  const out = { forecast7: null, obs: [], today: [], warning: null, built: {} };
  await Promise.all(Object.keys(TMD_FEEDS).map(async name => {
    try {
      const { text } = await tmdFeed(name);
      const doc = parseXml(text);
      out.built[name] = headerBuild(doc);
      if (name === 'forecast7') out.forecast7 = parseForecast7(doc);
      else if (name === 'obs3h') out.obs = parseStations(doc, 'obs3h');
      else if (name === 'today') out.today = parseStations(doc, 'today');
      else if (name === 'warning') out.warning = parseWarning(doc);
    } catch (e) { console.warn('TMD', name, e.message); }
  }));
  return out;
}

const OM_CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,uv_index,visibility';
const OM_HOURLY = 'temperature_2m,precipitation_probability,weather_code,is_day';
const OM_DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max';
function loadModel(lat, lon) {
  const q = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), current: OM_CURRENT, hourly: OM_HOURLY, daily: OM_DAILY, timezone: TZ, forecast_days: 16 });
  return fetchJson('https://api.open-meteo.com/v1/forecast?' + q);
}

// Average of the same calendar days over the last 5 years (for days beyond the 16-day forecast).
async function loadClimate(lat, lon, from, to) {
  const key = `wx.clim.${lat.toFixed(2)},${lon.toFixed(2)},${from}`;
  const cached = store.get(key, null);
  if (cached) return cached;
  const years = [1, 2, 3, 4, 5];
  const res = await Promise.all(years.map(async k => {
    const s = String(+from.slice(0, 4) - k) + from.slice(4), e = String(+to.slice(0, 4) - k) + to.slice(4);
    const q = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), start_date: s, end_date: e, daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code', timezone: TZ });
    try { return await fetchJson('https://archive-api.open-meteo.com/v1/archive?' + q, 15000); } catch { return null; }
  }));
  const acc = {};
  for (const r of res) {
    if (!r?.daily) continue;
    r.daily.time.forEach((t, i) => {
      const md = t.slice(5);
      const a = acc[md] ||= { max: [], min: [], rain: [], wet: 0, n: 0 };
      if (r.daily.temperature_2m_max[i] != null) a.max.push(r.daily.temperature_2m_max[i]);
      if (r.daily.temperature_2m_min[i] != null) a.min.push(r.daily.temperature_2m_min[i]);
      if (r.daily.precipitation_sum[i] != null) { a.rain.push(r.daily.precipitation_sum[i]); if (r.daily.precipitation_sum[i] >= 1) a.wet++; a.n++; }
    });
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const out = {};
  for (const [md, a] of Object.entries(acc)) out[md] = { max: avg(a.max), min: avg(a.min), rain: avg(a.rain), wetPct: a.n ? Math.round(100 * a.wet / a.n) : null };
  if (Object.keys(out).length) store.set(key, out);
  return out;
}

async function geocode(p) {
  const cache = store.get('wx.geo', {});
  if (cache[p.th]) return cache[p.th];
  const q = new URLSearchParams({ name: p.en, count: 10, language: 'en', format: 'json', countryCode: 'TH' });
  const r = await fetchJson('https://geocoding-api.open-meteo.com/v1/search?' + q);
  const hit = (r.results || []).find(x => x.feature_code?.startsWith('PPLA')) || (r.results || [])[0];
  if (!hit) throw new Error('geocode');
  cache[p.th] = { lat: hit.latitude, lon: hit.longitude };
  store.set('wx.geo', cache);
  return cache[p.th];
}

const dist = (a, b, c, d) => { const R = Math.PI / 180, x = (d - b) * R * Math.cos((a + c) / 2 * R), y = (c - a) * R; return 6371 * Math.hypot(x, y); };

// ---------- state ----------
const state = {
  place: store.get('wx.place', { th: 'เชียงใหม่', en: 'Chiang Mai' }),
  coords: null, gps: false, tmd: null, model: null, climate: null, updated: null, tab: store.get('wx.tab', 'week'),
};

async function resolveCoords() {
  if (state.place.lat != null) return { lat: state.place.lat, lon: state.place.lon };
  // Prefer the TMD station in this province nearest the city centre.
  let c = null;
  try { c = await geocode(state.place); } catch { /* fall back to station */ }
  if (!c) {
    const st = (state.tmd?.obs || []).find(s => norm(s.prov) === norm(state.place.th) && s.lat != null);
    if (st) c = { lat: st.lat, lon: st.lon };
  }
  return c || { lat: 18.788, lon: 98.985 };
}

function pickStation(list, lat, lon, maxKm = 60) {
  const inProv = list.filter(s => norm(s.prov) === norm(state.place.th) && s.lat != null);
  const pool = inProv.length ? inProv : list.filter(s => s.lat != null && dist(lat, lon, s.lat, s.lon) <= maxKm);
  return pool.sort((a, b) => dist(lat, lon, a.lat, a.lon) - dist(lat, lon, b.lat, b.lon))[0] || null;
}

// ---------- refresh ----------
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  setLive('busy', 'กำลังอัปเดต…');
  try {
    state.tmd = await loadTmd();
    const c = await resolveCoords();
    state.coords = c;
    const [model] = await Promise.all([loadModel(c.lat, c.lon).catch(e => { console.warn('model', e); return null; })]);
    state.model = model;
    const t0 = todayYMD();
    state.climate = await loadClimate(c.lat, c.lon, addDays(t0, 14), addDays(t0, 34)).catch(() => null);
    state.updated = new Date();
    render();
    const anyTmd = state.tmd.obs.length || state.tmd.forecast7;
    if (!anyTmd && !model) setLive('err', 'โหลดข้อมูลไม่ได้');
    else setLive('ok', 'อัปเดต ' + hm(state.updated) + ' น.');
  } catch (e) {
    console.error(e);
    setLive('err', 'โหลดข้อมูลไม่ได้');
  } finally { busy = false; }
}

function setLive(cls, text) {
  const el = $('live');
  el.className = 'live ' + (cls === 'ok' ? '' : cls);
  $('liveText').textContent = text;
}

// ---------- render ----------
function render() {
  const p = state.place;
  $('placeName').textContent = state.gps ? `${p.th} (ตำแหน่งของฉัน)` : p.th;
  document.title = `${p.th} · ฟ้าวันนี้`;
  const days = buildDays();
  renderNow(days);
  renderTiles(days);
  renderHours();
  renderWeek(days);
  renderMonth(days);
  renderWarning();
}

function tmdProvince() {
  const f = state.tmd?.forecast7;
  return f ? f[norm(state.place.th)] || null : null;
}

// One record per day for the next 30 days, choosing the best source for each.
function buildDays() {
  const t0 = todayYMD();
  const tp = tmdProvince();
  const tmdDays = Object.fromEntries((tp?.days || []).map(d => [d.date, d]));
  const m = state.model?.daily;
  const mIdx = m ? Object.fromEntries(m.time.map((t, i) => [t, i])) : {};
  const out = [];
  for (let i = 0; i < 30; i++) {
    const date = addDays(t0, i);
    const td = tmdDays[date];
    const mi = mIdx[date];
    const md = mi != null ? {
      max: m.temperature_2m_max[mi], min: m.temperature_2m_min[mi], code: m.weather_code[mi],
      rainPct: m.precipitation_probability_max?.[mi], rainMm: m.precipitation_sum[mi],
      windKmh: m.wind_speed_10m_max[mi], windDir: m.wind_direction_10m_dominant?.[mi],
      sunrise: m.sunrise?.[mi], sunset: m.sunset?.[mi], uv: m.uv_index_max?.[mi],
    } : null;
    if (td && td.max != null) {
      out.push({ date, src: 'tmd', max: td.max, min: td.min, rainPct: td.rainPct, windKmh: td.windKmh, windDir: td.windDir,
        kind: kindFromTmd(td.desc, td.rainPct), desc: td.desc, tempDesc: td.tempDesc, model: md });
    } else if (md) {
      out.push({ date, src: 'model', ...md, kind: kindFromCode(md.code), model: md });
    } else {
      const c = state.climate?.[date.slice(5)];
      out.push(c ? { date, src: 'clim', max: c.max, min: c.min, rainPct: c.wetPct, rainMm: c.rain, kind: c.wetPct >= 50 ? 'rain' : c.wetPct >= 25 ? 'partly' : 'mostly' }
        : { date, src: 'none' });
    }
  }
  return out;
}

function nowData() {
  const { lat, lon } = state.coords || {};
  const st = state.tmd?.obs?.length ? pickStation(state.tmd.obs, lat, lon) : null;
  const cur = state.model?.current;
  const ageMin = st?.time ? (Date.now() - st.time) / 6e4 : Infinity;
  const stOk = st && st.temp != null && ageMin <= 120;
  return { st, cur, stOk, ageMin };
}

function renderNow(days) {
  const { st, cur, stOk } = nowData();
  const today = days[0];
  const temp = stOk ? st.temp : cur?.temperature_2m ?? st?.temp;
  $('nowTemp').textContent = r0(temp);
  const kind = cur ? kindFromCode(cur.weather_code) : today?.kind;
  const label = kind ? KINDS[kind][0] : '';
  $('nowCond').textContent = label ? `${KINDS[kind][1]} ${label}` : '';
  const hi = today?.max, lo = today?.min;
  const ts = state.tmd?.today?.length ? pickStation(state.tmd.today, state.coords?.lat, state.coords?.lon) : null;
  $('nowHiLo').innerHTML = hi != null
    ? `สูงสุด <b class="hi">${r0(hi)}°</b> · ต่ำสุด <b class="lo">${r0(lo)}°</b>${today.src === 'tmd' ? ' <span class="badge tmd">กรมอุตุฯ</span>' : ''}`
    : '&nbsp;';
  const lines = [];
  if (st && st.temp != null) {
    lines.push(`🌡️ วัดจริงที่สถานี${esc(st.name || st.nameEn)} ${r0(st.temp)}° เวลา ${hm(st.time)} น. <span class="badge tmd">กรมอุตุฯ</span>`);
  }
  if (cur) {
    const curTime = new Date(cur.time + ':00+07:00');
    lines.push(`${stOk ? 'แบบจำลองตอนนี้' : 'ค่าตอนนี้จากแบบจำลอง'} ${r0(cur.temperature_2m)}° (${hm(curTime)} น.) <span class="badge model">Open-Meteo</span>`);
  }
  if (ts && ts.max != null && ts.time && ymd(ts.time) === todayYMD()) {
    lines.push(`เมื่อวาน–เช้านี้ สถานีวัดได้ สูงสุด ${r0(ts.max)}° ต่ำสุด ${r0(ts.min)}°`);
  }
  $('nowSrc').innerHTML = lines.join('<br>');
  $('nowLabel').textContent = stOk ? `ตอนนี้ · วัดจริง ${hm(st.time)} น.` : 'ตอนนี้';
  setBackground(kind, temp);
}

function tile(icon, k, v, s = '') {
  return `<div class="tile"><div class="k">${icon} ${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}
function renderTiles(days) {
  const { st, cur, stOk } = nowData();
  const today = days[0] || {};
  const md = today.model || {};
  const rh = stOk && st.rh != null ? st.rh : cur?.relative_humidity_2m;
  const wDir = stOk && st.windDir != null ? st.windDir : cur?.wind_direction_10m;
  const wSpd = stOk && st.windKmh != null ? st.windKmh : cur?.wind_speed_10m;
  const pres = stOk && st.mslp != null ? st.mslp : cur?.pressure_msl;
  const vis = stOk && st.vis != null ? st.vis : cur?.visibility != null ? cur.visibility / 1000 : null;
  const srcNote = stOk ? 'สถานีกรมอุตุฯ' : 'แบบจำลอง';
  const rainPct = today.rainPct;
  const rainNote = today.src === 'tmd' ? '% พื้นที่ที่มีฝน (กรมอุตุฯ)' : 'โอกาสเกิดฝน';
  const arrow = wDir != null ? `<span class="arrow" style="transform:rotate(${wDir + 180}deg)">↑</span>` : '';
  const sun = md.sunrise ? `${md.sunrise.slice(11)} / ${md.sunset.slice(11)}` : '–';
  const rainToday = stOk && st.rain24 != null ? `${st.rain24} มม. ใน 24 ชม. (สถานี)` : md.rainMm != null ? `คาด ${md.rainMm.toFixed(1)} มม. วันนี้` : '';
  $('tiles').innerHTML = [
    tile('🌧️', 'ฝน', rainPct != null ? `${r0(rainPct)}<small>%</small>` : '–', `${rainNote}${rainToday ? '<br>' + rainToday : ''}`),
    tile('💧', 'ความชื้น', rh != null ? `${r0(rh)}<small>%</small>` : '–', srcNote),
    tile('🌬️', 'ลม', wSpd != null ? `${arrow} ${r0(wSpd)}<small> กม./ชม.</small>` : '–', wDir != null ? `จากทิศ${compass(wDir)}` : ''),
    tile('🤒', 'รู้สึกเหมือน', cur?.apparent_temperature != null ? `${r0(cur.apparent_temperature)}°` : '–', 'แบบจำลอง'),
    tile('☀️', 'UV สูงสุดวันนี้', md.uv != null ? `${r0(md.uv)}` : '–', uvText(md.uv)),
    tile('👁️', 'ทัศนวิสัย', vis != null ? `${vis >= 10 ? '10+' : vis.toFixed(1)}<small> กม.</small>` : '–', srcNote),
    tile('🧭', 'ความกดอากาศ', pres != null ? `${r0(pres)}<small> hPa</small>` : '–', srcNote),
    tile('🌅', 'ขึ้น / ตก', `<small>${sun}</small>`, 'พระอาทิตย์'),
  ].join('');
}
const uvText = u => u == null ? '' : u < 3 ? 'ต่ำ' : u < 6 ? 'ปานกลาง' : u < 8 ? 'สูง' : u < 11 ? 'สูงมาก ควรกันแดด' : 'อันตราย';

function renderHours() {
  const h = state.model?.hourly;
  if (!h) { $('hours').innerHTML = '<p class="note">โหลดข้อมูลรายชั่วโมงไม่ได้</p>'; return; }
  const nowKey = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T').slice(0, 13);
  let start = h.time.findIndex(t => t.slice(0, 13) >= nowKey);
  if (start < 0) start = 0;
  let html = '';
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
    const k = kindFromCode(h.weather_code[i]);
    const night = h.is_day && !h.is_day[i];
    const icon = night && (k === 'clear' || k === 'mostly') ? '🌙' : KINDS[k][1];
    const p = h.precipitation_probability?.[i];
    html += `<div class="hr${i === start ? ' now' : ''}"><div class="t">${i === start ? 'ตอนนี้' : h.time[i].slice(11, 13) + ' น.'}</div><div class="i">${icon}</div><div class="c">${r0(h.temperature_2m[i])}°</div><div class="p">${p >= 20 ? '💧' + p + '%' : ''}</div></div>`;
  }
  $('hours').innerHTML = html;
}

function srcBadge(src) {
  return src === 'tmd' ? '<span class="badge tmd">กรมอุตุฯ</span>' : src === 'model' ? '<span class="badge model">Open-Meteo</span>' : src === 'clim' ? '<span class="badge clim">ค่าเฉลี่ย</span>' : '';
}

function renderWeek(days) {
  const t0 = todayYMD();
  $('week').innerHTML = days.slice(0, 7).map(d => {
    if (d.src === 'none') return '';
    const name = d.date === t0 ? 'วันนี้' : d.date === addDays(t0, 1) ? 'พรุ่งนี้' : TH_DOW_LONG[dow(d.date)];
    const desc = d.desc || (d.kind ? KINDS[d.kind][0] : '');
    const meta = [];
    if (d.rainPct != null) meta.push(`<span class="rain">💧 ${d.src === 'tmd' ? 'ฝน ' + r0(d.rainPct) + '% ของพื้นที่' : 'โอกาสฝน ' + r0(d.rainPct) + '%'}</span>`);
    if (d.windKmh != null) meta.push(`<span>🌬️ ${r0(d.windKmh)} กม./ชม.${d.windDir != null ? ' ' + compass(d.windDir) : ''}</span>`);
    if (d.tempDesc && d.tempDesc !== '-') meta.push(`<span>🌡️ ${esc(d.tempDesc)}</span>`);
    meta.push(srcBadge(d.src));
    return `<div class="day"><div class="dn">${name}<small>${dayNum(d.date)} ${monTh(d.date)}</small></div><div class="ic">${d.kind ? KINDS[d.kind][1] : ''}</div><div class="desc">${esc(desc)}</div><div class="tt"><span class="hi">${r0(d.max)}°</span><span class="lo">${r0(d.min)}°</span></div><div class="meta">${meta.join('')}</div></div>`;
  }).join('');
  const tp = tmdProvince();
  const built = state.tmd?.built?.forecast7;
  const nTmd = days.slice(0, 7).filter(d => d.src === 'tmd').length;
  let note = '';
  if (!state.tmd?.forecast7) note = 'ยังดึงพยากรณ์ 7 วันของกรมอุตุฯ ไม่ได้ในรอบนี้ จึงแสดงจากแบบจำลอง Open-Meteo แทน และจะลองใหม่ทุก 10 นาที';
  else if (!tp) note = `ไม่พบ ${esc(state.place.th)} ในพยากรณ์ 7 วันของกรมอุตุฯ จึงแสดงจาก Open-Meteo`;
  else if (nTmd < 7) note = `พยากรณ์ 7 วันของกรมอุตุฯ ฉบับล่าสุด${built ? ' (ออกเมื่อ ' + dayNum(ymd(built)) + ' ' + monTh(ymd(built)) + ' ' + hm(built) + ' น.)' : ''} มีถึงวันที่ ${tp.days.length ? lastDateTxt(tp.days) : '–'} วันที่เหลือจึงแสดงจาก Open-Meteo`;
  else if (built) note = `พยากรณ์กรมอุตุฯ ออกเมื่อ ${dayNum(ymd(built))} ${monTh(ymd(built))} ${hm(built)} น.`;
  $('weekNote').innerHTML = note;
}
function lastDateTxt(arr) { const d = arr.map(x => x.date).sort().pop(); return `${dayNum(d)} ${monTh(d)}`; }

function renderMonth(days) {
  const t0 = todayYMD();
  $('calHead').innerHTML = TH_DOW.map(d => `<div>${d}</div>`).join('');
  const lead = dow(days[0].date);
  let html = '<div class="cell blank"></div>'.repeat(lead);
  for (const d of days) {
    const first = dayNum(d.date) === 1 || d.date === t0;
    const lbl = first ? `<b>${dayNum(d.date)}</b> ${monTh(d.date)}` : `<b>${dayNum(d.date)}</b>`;
    if (d.src === 'none') { html += `<div class="cell clim${d.date === t0 ? ' today' : ''}"><div class="d">${lbl}</div><div class="i">·</div></div>`; continue; }
    const rain = d.rainPct != null && d.rainPct >= 20 ? `💧${r0(d.rainPct)}%` : '';
    html += `<div class="cell ${d.src}${d.date === t0 ? ' today' : ''}" title="${d.src === 'clim' ? 'ค่าเฉลี่ย 5 ปี ไม่ใช่พยากรณ์' : d.src === 'tmd' ? 'กรมอุตุนิยมวิทยา' : 'Open-Meteo'}"><div class="d">${lbl}</div><div class="i">${d.kind ? KINDS[d.kind][1] : ''}</div><div class="hi">${r0(d.max)}°</div><div class="lo">${r0(d.min)}°</div><div class="r">${rain}</div></div>`;
  }
  $('cal').innerHTML = html;
}

function renderWarning() {
  const w = state.tmd?.warning;
  const el = $('warn');
  if (!w || !w.title) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>⚠️ ${esc(w.title)}</b>${w.date ? `<small>${esc(w.date)}</small><br>` : ''}${esc(w.body).slice(0, 260)}${w.body.length > 260 ? '… ' : ' '}<a href="https://www.tmd.go.th/warning-and-events/warning-storm" target="_blank" rel="noopener">อ่านต่อที่กรมอุตุฯ</a>`;
}

// ---------- background ----------
let credits = {};
let bgKey = null;
let bgFront = 'bg';
function setBackground(kind, temp) {
  const cur = state.model?.current;
  const md = state.model?.daily;
  let key = kind ? KINDS[kind][2] : 'partly';
  const isDay = cur ? !!cur.is_day : (() => { const h = +hm(new Date()).slice(0, 2); return h >= 6 && h < 18; })();
  if (md?.sunset?.[0] && md?.sunrise?.[0] && key !== 'rain' && key !== 'storm') {
    const now = Date.now();
    const ss = new Date(md.sunset[0] + ':00+07:00').getTime();
    const sr = new Date(md.sunrise[0] + ':00+07:00').getTime();
    if ((now > ss - 45 * 6e4 && now < ss + 25 * 6e4) || (now > sr - 20 * 6e4 && now < sr + 30 * 6e4)) key = 'sunset';
  }
  if (!isDay && key !== 'sunset' && key !== 'storm') key = 'night';
  if (key === 'clear' && temp >= 35) key = 'hot';
  if (key === bgKey) return;
  bgKey = key;
  const url = `img/sky-${key}.jpg`;
  const img = new Image();
  img.onload = () => {
    const back = bgFront === 'bg' ? 'bg2' : 'bg';
    $(back).style.backgroundImage = `url("${url}")`;
    $(back).style.opacity = 1;
    $(bgFront).style.opacity = 0;
    bgFront = back;
  };
  img.src = url;
  renderCredits();
}
function renderCredits() {
  const names = { clear: 'ฟ้าใส', hot: 'ร้อนจัด', partly: 'เมฆบางส่วน', cloudy: 'เมฆมาก', overcast: 'เมฆครึ้ม', rain: 'ฝนตก', storm: 'ฝนฟ้าคะนอง', night: 'กลางคืน', sunset: 'เย็น/เช้าตรู่' };
  $('credits').innerHTML = Object.entries(credits).map(([k, c]) =>
    `<li>${k === bgKey ? '▶ ' : ''}${names[k] || k}: <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.title.replace(/\.jpe?g$/i, ''))}</a> โดย ${esc(c.author)} · ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}</li>`).join('');
}

// ---------- place picker ----------
function openPicker() {
  const dlg = $('placeDlg');
  $('placeSearch').value = '';
  fillList('');
  dlg.showModal();
  setTimeout(() => $('placeList').querySelector('.sel')?.scrollIntoView({ block: 'center' }), 30);
}
function fillList(q) {
  const qq = q.trim().toLowerCase();
  const items = PROVINCES.filter(([th, en]) => !qq || th.includes(qq) || en.toLowerCase().includes(qq));
  $('placeList').innerHTML = items.map(([th, en]) =>
    `<li><button type="button" data-th="${th}" data-en="${en}" class="${!state.gps && th === state.place.th ? 'sel' : ''}">${th}<small>${en}</small></button></li>`).join('');
}
function choose(place, gps = false) {
  state.place = place;
  state.gps = gps;
  if (!gps) store.set('wx.place', { th: place.th, en: place.en });
  bgKey = null;
  $('placeDlg').close();
  refresh();
}
function useGps() {
  if (!navigator.geolocation) return;
  $('geoBtn').textContent = 'กำลังหาตำแหน่ง…';
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    $('geoBtn').textContent = '📍 ใช้ตำแหน่งของฉัน';
    const st = (state.tmd?.obs || []).filter(s => s.lat != null).sort((a, b) => dist(lat, lon, a.lat, a.lon) - dist(lat, lon, b.lat, b.lon))[0];
    const prov = st ? PROVINCES.find(([th]) => norm(th) === norm(st.prov)) : null;
    choose({ th: prov ? prov[0] : 'ตำแหน่งของฉัน', en: prov ? prov[1] : '', lat, lon }, true);
  }, () => { $('geoBtn').textContent = 'เปิดสิทธิ์ตำแหน่งไม่ได้ ลองเลือกจังหวัดแทน'; }, { timeout: 12000, maximumAge: 6e5 });
}

// ---------- tabs ----------
function setTab(t) {
  state.tab = t;
  store.set('wx.tab', t);
  $('tabWeek').setAttribute('aria-selected', t === 'week');
  $('tabMonth').setAttribute('aria-selected', t === 'month');
  $('weekCard').hidden = t !== 'week';
  $('monthCard').hidden = t !== 'month';
}

// ---------- init ----------
function init() {
  $('placeBtn').addEventListener('click', openPicker);
  $('placeSearch').addEventListener('input', e => fillList(e.target.value));
  $('placeList').addEventListener('click', e => {
    const b = e.target.closest('button[data-th]');
    if (b) choose({ th: b.dataset.th, en: b.dataset.en });
  });
  $('geoBtn').addEventListener('click', useGps);
  $('tabWeek').addEventListener('click', () => setTab('week'));
  $('tabMonth').addEventListener('click', () => setTab('month'));
  setTab(state.tab);
  $('placeName').textContent = state.place.th;
  fetch('img/credits.json').then(r => r.json()).then(c => { credits = c; renderCredits(); }).catch(() => {});
  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(() => { if (state.updated && !busy) { const m = Math.round((Date.now() - state.updated) / 6e4); setLive('ok', m < 1 ? 'อัปเดตเมื่อสักครู่' : `อัปเดต ${m} นาทีที่แล้ว`); } }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.updated && Date.now() - state.updated > 5 * 6e4) refresh();
  });
}
init();
