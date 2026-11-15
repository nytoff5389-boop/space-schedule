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

// Chiang Mai only. The exact point comes from the device location when allowed.
const CM = { th: 'เชียงใหม่', en: 'Chiang Mai', lat: 18.7883, lon: 98.9853 };
const inCmBox = (lat, lon) => lat > 17.2 && lat < 20.2 && lon > 97.9 && lon < 99.7;

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
const OM_HOURLY = 'temperature_2m,precipitation_probability,precipitation,weather_code,is_day,relative_humidity_2m,wind_speed_10m';
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

const dist = (a, b, c, d) => { const R = Math.PI / 180, x = (d - b) * R * Math.cos((a + c) / 2 * R), y = (c - a) * R; return 6371 * Math.hypot(x, y); };

// ---------- state ----------
const state = {
  place: CM,
  coords: null, loc: store.get('wx.loc', null), locNote: '', tmd: null, model: null, climate: null, updated: null, tab: store.get('wx.tab', 'week'),
};

function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      e => rej(e), { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 6e4 });
  });
}
// District / subdistrict name for the point (free, no key; Thai names).
async function placeName(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cache = store.get('wx.rgeo', {});
  if (cache[key]) return cache[key];
  const q = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'th' });
  const r = await fetchJson('https://api.bigdatacloud.net/data/reverse-geocode-client?' + q, 8000);
  const adm = r.localityInfo?.administrative || [];
  const find = re => adm.map(x => x.name || '').find(n => re.test(n));
  const amphoe = find(/^(อำเภอ|เขต)/);
  const tambon = find(/^(ตำบล|แขวง)/) || (r.locality && r.locality !== r.city ? r.locality : '');
  const short = n => (n || '').replace(/^อำเภอ/, 'อ.').replace(/^ตำบล/, 'ต.');
  const out = { label: [short(amphoe), short(tambon)].filter(Boolean).join(' · ') || r.locality || r.city || '', prov: r.principalSubdivision || '' };
  cache[key] = out;
  store.set('wx.rgeo', cache);
  return out;
}
async function resolveCoords() {
  try {
    const pos = await getPosition();
    let info = null;
    try { info = await placeName(pos.lat, pos.lon); } catch { /* name is optional */ }
    const inCm = info?.prov ? /เชียงใหม่|Chiang Mai/i.test(info.prov) : inCmBox(pos.lat, pos.lon);
    if (!inCm) {
      state.loc = { lat: CM.lat, lon: CM.lon, label: 'ตัวเมืองเชียงใหม่', gps: false };
      state.locNote = 'ตอนนี้คุณอยู่นอกจังหวัดเชียงใหม่ จึงแสดงอากาศตัวเมืองเชียงใหม่';
    } else {
      state.loc = { lat: pos.lat, lon: pos.lon, label: info?.label || 'เชียงใหม่ (ตำแหน่งของคุณ)', gps: true };
      state.locNote = '';
    }
    store.set('wx.loc', state.loc);
  } catch (e) {
    const denied = e && e.code === 1;
    if (!state.loc) state.loc = { lat: CM.lat, lon: CM.lon, label: 'ตัวเมืองเชียงใหม่', gps: false };
    state.locNote = denied
      ? 'ยังไม่ได้อนุญาตตำแหน่ง จึงแสดงอากาศ' + (state.loc.gps ? 'จากตำแหน่งล่าสุด' : 'ตัวเมืองเชียงใหม่') + ' · เปิดได้ที่ การตั้งค่า › Safari/Chrome › ตำแหน่ง แล้วแตะปุ่มชื่อสถานที่ด้านบน'
      : state.loc.gps ? 'หาตำแหน่งรอบนี้ไม่ได้ ใช้ตำแหน่งล่าสุด' : 'หาตำแหน่งไม่ได้ จึงแสดงอากาศตัวเมืองเชียงใหม่';
  }
  return { lat: state.loc.lat, lon: state.loc.lon };
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
  setLive('busy', 'อัปเดต…');
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
    hideSplash();
    if (!anyTmd && !model) setLive('err', 'โหลดข้อมูลไม่ได้');
    else setLive('ok', hm(state.updated) + ' น.');
  } catch (e) {
    console.error(e);
    setLive('err', 'โหลดข้อมูลไม่ได้');
    hideSplash();
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
  const label = state.loc?.label || 'ตัวเมืองเชียงใหม่';
  $('placeName').textContent = label;
  $('locNote').textContent = state.locNote;
  $('locNote').hidden = !state.locNote;
  document.title = `${label} · ฟ้าวันนี้`;
  const days = buildDays();
  state.days = days;
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
    const km = state.coords && st.lat != null ? Math.round(dist(state.coords.lat, state.coords.lon, st.lat, st.lon)) : null;
    lines.push(`🌡️ วัดจริงที่สถานี${esc(st.name || st.nameEn)}${km != null ? ` (ห่าง ${km} กม.)` : ''} ${r0(st.temp)}° เวลา ${hm(st.time)} น. <span class="badge tmd">กรมอุตุฯ</span>`);
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
    return `<div class="day" role="button" tabindex="0" data-date="${d.date}"><div class="dn">${name}<small>${dayNum(d.date)} ${monTh(d.date)}</small></div><div class="ic">${d.kind ? KINDS[d.kind][1] : ''}</div><div class="desc">${esc(desc)}</div><div class="tt"><span class="hi">${r0(d.max)}°</span><span class="lo">${r0(d.min)}°</span></div><div class="meta">${meta.join('')}</div></div>`;
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
    html += `<div class="cell ${d.src}${d.date === t0 ? ' today' : ''}" role="button" tabindex="0" data-date="${d.date}" title="${d.src === 'clim' ? 'ค่าเฉลี่ย 5 ปี ไม่ใช่พยากรณ์' : d.src === 'tmd' ? 'กรมอุตุนิยมวิทยา' : 'Open-Meteo'}"><div class="d">${lbl}</div><div class="i">${d.kind ? KINDS[d.kind][1] : ''}</div><div class="hi">${r0(d.max)}°</div><div class="lo">${r0(d.min)}°</div><div class="r">${rain}</div></div>`;
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

// ---------- day detail ----------
const SEVERITY = ['clear', 'mostly', 'partly', 'cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'heavy', 'storm'];
const PERIODS = [['ช่วงดึก', '00–06 น.', 0, 6], ['ช่วงเช้า', '06–12 น.', 6, 12], ['ช่วงบ่าย', '12–18 น.', 12, 18], ['ช่วงค่ำ', '18–24 น.', 18, 24]];
const mm = v => v == null ? '–' : v < 0.05 ? '0' : v < 10 ? v.toFixed(1) : Math.round(v);
function rainWord(sum) { return sum == null ? '' : sum < 0.1 ? 'ไม่มีฝน' : sum < 2 ? 'ฝนเล็กน้อย' : sum < 10 ? 'ฝนปานกลาง' : sum < 35 ? 'ฝนหนัก' : 'ฝนหนักมาก'; }
function openDay(date) {
  const d = (state.days || []).find(x => x.date === date);
  if (!d) return;
  const t0 = todayYMD();
  const name = date === t0 ? 'วันนี้' : date === addDays(t0, 1) ? 'พรุ่งนี้' : 'วัน' + TH_DOW_LONG[dow(date)];
  const h = state.model?.hourly;
  const idx = h ? h.time.map((t, i) => t.startsWith(date) ? i : -1).filter(i => i >= 0) : [];
  let html = `<div class="dd-head"><div><div class="dd-name">${name}</div><div class="dd-date">${dayNum(date)} ${monTh(date)} ${+date.slice(0, 4) + 543}</div></div>
    <div class="dd-ic">${d.kind ? KINDS[d.kind][1] : ''}</div>
    <div class="dd-tt"><span class="hi">${r0(d.max)}°</span><span class="lo">${r0(d.min)}°</span></div></div>
    <div class="dd-desc">${esc(d.desc || (d.kind ? KINDS[d.kind][0] : ''))} ${srcBadge(d.src)}</div>`;
  if (d.src === 'tmd') {
    html += `<div class="dd-box tmd"><b>กรมอุตุนิยมวิทยา พยากรณ์จังหวัดเชียงใหม่</b><br>${esc(d.desc || '')}${d.tempDesc && d.tempDesc !== '-' ? ' · ' + esc(d.tempDesc) : ''}<br>
      สูงสุด ${r0(d.max)}° ต่ำสุด ${r0(d.min)}° · ฝน ${r0(d.rainPct)}% ของพื้นที่${d.windKmh != null ? ` · ลม${compass(d.windDir)} ${r0(d.windKmh)} กม./ชม.` : ''}</div>`;
  }
  if (idx.length) {
    const sum = idx.reduce((a, i) => a + (h.precipitation?.[i] || 0), 0);
    html += tempChart(h, idx, date === t0 ? +hm(new Date()).slice(0, 2) : -1);
    html += `<h3>ปริมาณฝนตามช่วงเวลา <small>รวมทั้งวัน ${mm(sum)} มม. · ${rainWord(sum)}</small></h3><div class="periods">`;
    for (const [pn, pr, a, b] of PERIODS) {
      const ii = idx.filter(i => { const hr = +h.time[i].slice(11, 13); return hr >= a && hr < b; });
      if (!ii.length) continue;
      const rain = ii.reduce((x, i) => x + (h.precipitation?.[i] || 0), 0);
      const prob = Math.max(...ii.map(i => h.precipitation_probability?.[i] ?? 0));
      const temps = ii.map(i => h.temperature_2m[i]);
      const k = ii.map(i => kindFromCode(h.weather_code[i])).sort((x, y) => SEVERITY.indexOf(y) - SEVERITY.indexOf(x))[0];
      const night = a === 0 || a === 18;
      const icon = night && (k === 'clear' || k === 'mostly') ? '🌙' : KINDS[k][1];
      html += `<div class="per"><div class="pn">${pn}<small>${pr}</small></div><div class="pi">${icon}</div>
        <div class="pr"><b>${mm(rain)}</b> มม.</div><div class="pp">โอกาส ${prob}%</div><div class="pt">${r0(Math.min(...temps))}–${r0(Math.max(...temps))}°</div></div>`;
    }
    html += `</div><h3>รายชั่วโมง</h3><div class="hlist"><div class="hrow hh"><span>เวลา</span><span></span><span>อุณหภูมิ</span><span>ฝน</span><span>โอกาส</span><span>ความชื้น</span><span>ลม</span></div>`;
    const nowH = date === t0 ? +hm(new Date()).slice(0, 2) : -1;
    const maxR = Math.max(1, ...idx.map(i => h.precipitation?.[i] || 0));
    for (const i of idx) {
      const hr = +h.time[i].slice(11, 13);
      const k = kindFromCode(h.weather_code[i]);
      const icon = h.is_day && !h.is_day[i] && (k === 'clear' || k === 'mostly') ? '🌙' : KINDS[k][1];
      const r = h.precipitation?.[i] || 0;
      html += `<div class="hrow${hr < nowH ? ' past' : ''}${hr === nowH ? ' cur' : ''}"><span>${String(hr).padStart(2, '0')}:00</span><span>${icon}</span><span class="tc">${r0(h.temperature_2m[i])}°</span>
        <span class="rr"><i style="width:${Math.round(100 * r / maxR)}%"></i><em>${mm(r)}</em></span><span>${h.precipitation_probability?.[i] ?? '–'}%</span><span>${r0(h.relative_humidity_2m?.[i])}%</span><span>${r0(h.wind_speed_10m?.[i])}</span></div>`;
    }
    html += `</div><p class="note">ฝนเป็นมิลลิเมตรต่อชั่วโมง ลมเป็น กม./ชม. ข้อมูลรายชั่วโมงมาจากแบบจำลอง Open-Meteo ณ ตำแหน่งของคุณ เพราะกรมอุตุฯ ไม่ได้เปิดข้อมูลรายชั่วโมงให้ใช้ฟรี</p>`;
  } else if (d.src === 'clim') {
    html += `<div class="dd-box">วันนี้ไกลเกินช่วงพยากรณ์ (16 วัน) ตัวเลขนี้เป็น<b>ค่าเฉลี่ยของวันเดียวกันใน 5 ปีที่ผ่านมา</b> ไม่ใช่พยากรณ์<br>
      ฝนเฉลี่ย ${mm(d.rainMm)} มม. · มีฝนตก ${r0(d.rainPct)}% ของปีที่ผ่านมา</div>`;
  } else {
    html += '<p class="note">ยังไม่มีข้อมูลรายชั่วโมงสำหรับวันนี้</p>';
  }
  $('dayBody').innerHTML = html;
  $('dayDlg').showModal();
  $('dayBody').scrollTop = 0;
}
// Temperature through the day as a line, labelled every 3 hours.
function tempChart(h, idx, nowH) {
  const T = idx.map(i => h.temperature_2m[i]);
  const lo = Math.floor(Math.min(...T)) - 1, hi = Math.ceil(Math.max(...T)) + 1;
  const W = 600, H = 170, L = 24, R = 24, top = 30, bot = 30;
  const x = k => L + (W - L - R) * k / Math.max(1, T.length - 1);
  const y = v => top + (H - top - bot) * (hi - v) / Math.max(1, hi - lo);
  const pts = T.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const iMax = T.indexOf(Math.max(...T)), iMin = T.indexOf(Math.min(...T));
  let g = `<polygon points="${x(0)},${H - bot} ${pts} ${x(T.length - 1)},${H - bot}" fill="url(#tg)"/><polyline points="${pts}" fill="none" stroke="#ffb36b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  idx.forEach((i, k) => {
    const hr = +h.time[i].slice(11, 13);
    if (hr % 3 === 0) {
      g += `<text x="${x(k)}" y="${H - 10}" text-anchor="middle" class="ax">${String(hr).padStart(2, '0')}</text>`;
      g += `<circle cx="${x(k)}" cy="${y(T[k])}" r="3.5" fill="#fff"/><text x="${x(k)}" y="${y(T[k]) - 9}" text-anchor="middle" class="tv">${Math.round(T[k])}°</text>`;
    }
    if (hr === nowH) g += `<line x1="${x(k)}" x2="${x(k)}" y1="${top - 14}" y2="${H - bot}" stroke="#fff" stroke-dasharray="3 3" opacity=".7"/><text x="${x(k)}" y="${top - 16}" text-anchor="middle" class="ax">ตอนนี้</text>`;
  });
  return `<h3>อุณหภูมิตามเวลา <small>ร้อนสุด ${Math.round(T[iMax])}° ราว ${h.time[idx[iMax]].slice(11, 13)}:00 น. · เย็นสุด ${Math.round(T[iMin])}° ราว ${h.time[idx[iMin]].slice(11, 13)}:00 น.</small></h3>
    <svg class="tchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟอุณหภูมิรายชั่วโมง"><defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb36b" stop-opacity=".45"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></linearGradient></defs>${g}</svg>`;
}
function bindDayClicks(el) {
  el.addEventListener('click', e => { const t = e.target.closest('[data-date]'); if (t) openDay(t.dataset.date); });
  el.addEventListener('keydown', e => { const t = e.target.closest('[data-date]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDay(t.dataset.date); } });
}

// ---------- splash ----------
const splashStart = Date.now();
function hideSplash() {
  const sp = $('splash');
  if (!sp || sp.classList.contains('out')) return;
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 700); }, Math.max(0, 1400 - (Date.now() - splashStart)));
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
  $('placeBtn').addEventListener('click', () => { bgKey = null; refresh(); });
  $('tabWeek').addEventListener('click', () => setTab('week'));
  $('tabMonth').addEventListener('click', () => setTab('month'));
  setTab(state.tab);
  bindDayClicks($('week'));
  bindDayClicks($('cal'));
  $('dayClose').addEventListener('click', () => $('dayDlg').close());
  $('dayDlg').addEventListener('click', e => { if (e.target === $('dayDlg')) $('dayDlg').close(); });
  setTimeout(hideSplash, 12000);
  $('placeName').textContent = state.loc ? state.loc.label : 'กำลังหาตำแหน่ง…';
  fetch('img/credits.json').then(r => r.json()).then(c => { credits = c; renderCredits(); }).catch(() => {});
  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(() => { if (state.updated && !busy) { const m = Math.round((Date.now() - state.updated) / 6e4); setLive('ok', m < 1 ? 'เมื่อสักครู่' : `${m} นาทีก่อน`); } }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.updated && Date.now() - state.updated > 5 * 6e4) refresh();
  });
}
init();
