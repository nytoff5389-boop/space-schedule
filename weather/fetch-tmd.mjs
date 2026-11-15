// Runs in GitHub Actions before each Pages deploy (hourly).
// Copies the Thai Meteorological Department (TMD) open-data XML feeds next to the
// weather page, so the browser can read them even when TMD's server does not allow
// cross-site requests. Files are written as-is; the page parses the XML itself.
// The uid/ukey pair is the public example key listed on https://data.tmd.go.th/api/
import { mkdir, writeFile } from 'node:fs/promises';

const KEY = 'uid=api&ukey=api12345';
const FEEDS = {
  forecast7: `https://data.tmd.go.th/api/WeatherForecast7Days/v2/?${KEY}`,
  obs3h: `https://data.tmd.go.th/api/Weather3Hours/V2/?${KEY}`,
  today: `https://data.tmd.go.th/api/WeatherToday/V2/?${KEY}`,
  warning: `https://data.tmd.go.th/api/WeatherWarningNews/v2/?${KEY}`,
};

const dir = new URL('./data/', import.meta.url);
await mkdir(dir, { recursive: true });
const status = { fetchedAt: new Date().toISOString(), feeds: {} };

for (const [name, url] of Object.entries(FEEDS)) {
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      const text = await res.text();
      if (!res.ok || !text.trim().startsWith('<')) throw new Error(`HTTP ${res.status}`);
      await writeFile(new URL(`${name}.xml`, dir), text);
      status.feeds[name] = { ok: true, bytes: text.length };
      ok = true;
      console.log(`${name}: ${text.length} bytes`);
    } catch (e) {
      console.log(`${name}: attempt ${attempt} failed: ${e.message}`);
      status.feeds[name] = { ok: false, error: String(e.message) };
      await new Promise(r => setTimeout(r, 4000 * attempt));
    }
  }
}
await writeFile(new URL('status.json', dir), JSON.stringify(status, null, 1));
