import ical from 'node-ical';
import Parser from 'rss-parser';

export const defaultFeeds = [
  { name: 'Yahoo News', url: 'https://news.yahoo.com/rss/' },
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { name: 'Electrek', url: 'https://electrek.co/feed/' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
  { name: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { name: 'KCCI', url: 'https://www.kcci.com/topstories-rss' },
];
const safeText = (s, length = 240) => String(s?.val ?? s ?? '').replace(/<[^>]*>/g, '').slice(0, length);
const numeric = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const dateKey = (date, zone) => { const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date); return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-'); };
export function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(url.hostname) || /^\[|^\d+\./.test(url.hostname)) throw Error('HTTPS public hostname required');
  return url;
}
export function sourcesFromEnv(env) {
  let calendars = [], feeds = defaultFeeds;
  if (env.GOOGLE_CALENDAR_URL?.trim()) calendars.push({ name: env.GOOGLE_CALENDAR_NAME || 'Family', url: env.GOOGLE_CALENDAR_URL.trim(), color: '#b5d0b1' });
  if (env.INCLUDE_US_HOLIDAYS !== 'false') calendars.push({ name: 'US holidays', url: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics', color: '#e3c780' });
  let calendarError = null, newsError = null;
  try {
    if (env.CALENDARS_JSON) { const extra = JSON.parse(env.CALENDARS_JSON); if (!Array.isArray(extra)) throw Error(); calendars.push(...extra); }
    calendars = calendars.slice(0, 10).map((s, i) => ({ id: 'calendar-' + i, name: safeText(s.name || 'Calendar ' + (i + 1), 60), url: publicUrl(s.url).href, color: /^#[a-f0-9]{6}$/i.test(s.color) ? s.color : '#b5d0b1' }));
  } catch { calendars = []; calendarError = 'Calendar configuration is invalid. Check the NAS environment settings.'; }
  try {
    if (env.RSS_FEEDS_JSON) feeds = JSON.parse(env.RSS_FEEDS_JSON);
    if (!Array.isArray(feeds) || !feeds.length) throw Error();
    feeds = feeds.slice(0, 12).map((s, i) => ({ id: 'feed-' + i, name: safeText(s.name || 'Feed ' + (i + 1), 60), url: publicUrl(s.url).href }));
  } catch { feeds = []; newsError = 'RSS configuration is invalid. Check RSS_FEEDS_JSON on the NAS.'; }
  let timezone = env.TZ || 'America/Chicago';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { timezone = 'America/Chicago'; }
  return { calendars, feeds, calendarError, newsError, timezone, weatherCity: env.WEATHER_CITY || 'Ames,IA,US' };
}

// Sources come only from server configuration. Browser requests select opaque IDs, never URLs.
export async function fetchText(url, fetcher = fetch, maxBytes = 5_000_000) {
  const signal = AbortSignal.timeout(12000);
  let target = publicUrl(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(target, { signal, redirect: 'manual', headers: { 'User-Agent': 'KlindtDashboard/2.0 (+personal home dashboard)', Accept: '*/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3 || !response.headers.get('location')) throw Error('Redirect failed');
      await response.body?.cancel();
      target = publicUrl(new URL(response.headers.get('location'), target).href);
      continue;
    }
    if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw Error('Source unavailable'); }
    const reader = response.body.getReader(); let size = 0, chunks = [];
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw Error('Source too large'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw Error('Source unavailable');
}

export function createCachedSource(loader, ttl, now = Date.now) {
  let value, updatedAt = null, checkedAt = 0, retryAt = 0, pending, error = null;
  return async () => {
    if (now() < retryAt) return { data: value ?? null, updatedAt, checkedAt, stale: !!error, error };
    if (!pending) pending = (async () => {
      checkedAt = now();
      try { value = await loader(); updatedAt = now(); error = null; retryAt = now() + ttl; }
      catch { error = 'Source unavailable; check the NAS configuration or try again later.'; retryAt = now() + Math.min(ttl, 60000); }
      return { data: value ?? null, updatedAt, checkedAt, stale: !!error, error };
    })();
    try { return await pending; } finally { pending = null; }
  };
}

export function aggregateForecast(payload, offsetSeconds = 0) {
  if (!Array.isArray(payload.list)) throw Error('Invalid forecast');
  const days = new Map();
  for (const item of payload.list) {
    if (!Number.isFinite(item.dt) || numeric(item.main?.temp_min) === null || numeric(item.main?.temp_max) === null) continue;
    const shifted = new Date((item.dt + offsetSeconds) * 1000), day = shifted.toISOString().slice(0, 10);
    const hour = shifted.getUTCHours(), entry = days.get(day);
    const low = +item.main.temp_min, high = +item.main.temp_max;
    if (!entry) days.set(day, { day, lowCelsius: low, highCelsius: high, description: safeText(item.weather?.[0]?.description, 80), icon: safeText(item.weather?.[0]?.icon, 4), noonDistance: Math.abs(hour - 12) });
    else { entry.lowCelsius = Math.min(entry.lowCelsius, low); entry.highCelsius = Math.max(entry.highCelsius, high); if (Math.abs(hour - 12) < entry.noonDistance) { entry.description = safeText(item.weather?.[0]?.description, 80); entry.icon = safeText(item.weather?.[0]?.icon, 4); entry.noonDistance = Math.abs(hour - 12); } }
  }
  return [...days.values()].slice(0, 5).map(({noonDistance, ...day}) => day);
}

export async function calendarEvents(parsed, from, to, source) {
  const results = [];
  for (const event of Object.values(parsed)) {
    if (event.type !== 'VEVENT' || event.status === 'CANCELLED' || !event.start) continue;
    for (const instance of ical.expandRecurringEvent(event, { from, to, expandOngoing: true })) {
      if ((instance.event?.status ?? event.status) === 'CANCELLED') continue;
      const underlying = instance.event || event;
      const date = instance.start;
      if (!(date instanceof Date) || !Number.isFinite(+date)) continue;
      const allDay = instance.isFullDay === true || underlying.datetype === 'date' || date.dateOnly === true;
      const sourceZone = date.tz || event.start.tz || 'UTC';
      const localDay = allDay ? dateKey(date,sourceZone) : null;
      const endLocalDay = allDay && instance.end ? dateKey(instance.end,sourceZone) : null;
      results.push({ id: source.id + '-' + safeText(event.uid, 100) + '-' + date.toISOString(), calendarId: source.id, calendarName: source.name, color: source.color, title: safeText(instance.summary ?? underlying.summary) || 'Untitled event', location: safeText(instance.location ?? underlying.location, 180), start: date.toISOString(), end: instance.end?.toISOString() || date.toISOString(), allDay, localDay, endLocalDay });
    }
  }
  return results.sort((a,b) => a.start.localeCompare(b.start)).slice(0, 400);
}
const parser = new Parser();
export async function parseNews(xml, source, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Unsupported XML');
  const parsed = await parser.parseString(xml);
  return (parsed.items || []).map(item => {
    let url; try { url = new URL(item.link); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null; } catch { return null; }
    const date = Date.parse(item.isoDate || item.pubDate);
    if (Number.isFinite(date) && (date < now - 3 * 86400000 || date > now + 86400000)) return null;
    return { title: safeText(item.title), url: url.href, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null, source: source.name, sourceId: source.id };
  }).filter(item => item?.title).slice(0, 60);
}
export function mergeNews(items) {
  const seen = new Set();
  return items.flat().sort((a,b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).filter(item => {
    const title = item.title.toLowerCase().replace(/\s+/g, ' ').trim(), url = new URL(item.url);
    url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    const keys = [url.href, title]; if (keys.some(key => seen.has(key))) return false; keys.forEach(key => seen.add(key)); return true;
  }).slice(0, 200);
}

export function createIntegrations(env = process.env, fetcher = fetch, now = Date.now) {
  const cfg = sourcesFromEnv(env);
  const calendars = cfg.calendars.map(source => ({...source, get: createCachedSource(async () => {
    const text = await fetchText(source.url, fetcher);
    if (!text.includes('BEGIN:VCALENDAR')) throw Error('Invalid calendar');
    return ical.async.parseICS(text);
  }, 5 * 60000, now)}));
  const feeds = cfg.feeds.map(source => ({...source, get: createCachedSource(async () => parseNews(await fetchText(source.url, fetcher, 2_000_000), source, now()), 5 * 60000, now)}));
  const weatherCache = new Map();
  const sourceSummary = (s, r) => ({ id:s.id, name:s.name, color:s.color, updatedAt:r.updatedAt, checkedAt:r.checkedAt, stale:r.stale, error:r.error });
  return {
    metadata() { return { version:'2.2.3', timezone:cfg.timezone, weatherCity:cfg.weatherCity, weatherConfigured:!!env.OPENWEATHER_API_KEY?.trim(), calendars:cfg.calendars.map(({url,...s})=>s), feeds:cfg.feeds.map(({url,...s})=>s), calendarError:cfg.calendarError, newsError:cfg.newsError }; },
    async weather(city = cfg.weatherCity) {
      if (!env.OPENWEATHER_API_KEY?.trim()) return { connected:false, error:'Add OPENWEATHER_API_KEY to the NAS .env file.' };
      city = String(city).trim().slice(0,100); if (!city) city = cfg.weatherCity;
      if (!weatherCache.has(city)) {
        if (weatherCache.size >= 20) weatherCache.delete(weatherCache.keys().next().value);
        weatherCache.set(city, createCachedSource(async () => {
          const get = async path => { const url = new URL('https://api.openweathermap.org/data/2.5/' + path); url.searchParams.set('q',city); url.searchParams.set('appid',env.OPENWEATHER_API_KEY.trim()); url.searchParams.set('units','metric'); return JSON.parse(await fetchText(url.href,fetcher,1_000_000)); };
          const [current, forecast] = await Promise.all([get('weather'),get('forecast')]);
          if (numeric(current.main?.temp) === null) throw Error('Invalid weather');
          return { city:safeText(current.name,80), country:safeText(current.sys?.country,10), tempCelsius:+current.main.temp, feelsCelsius:numeric(current.main.feels_like), humidity:numeric(current.main.humidity), description:safeText(current.weather?.[0]?.description,80), icon:safeText(current.weather?.[0]?.icon,4), observedAt:current.dt ? new Date(current.dt*1000).toISOString():null, forecast:aggregateForecast(forecast,current.timezone||0), forecastNote:'Highs/lows are the range of remaining 3-hour forecast samples, not full-day extremes.' };
        }, 10 * 60000, now));
      }
      const r = await weatherCache.get(city)();
      return { connected:!!r.data, ...r, error:r.error ? 'Weather unavailable. Check the city, API key, and access to current weather and 5-day forecast in OpenWeatherMap.' : null };
    },
    async calendar({ids,days=14}={}) {
      const selected = calendars.filter(s => !ids || ids.includes(s.id));
      const end = new Date(now() + Math.max(1,Math.min(60,+days||14))*86400000), start = new Date(now()-2*86400000);
      const results = await Promise.all(selected.map(async s => { const r=await s.get(); try { return { source:sourceSummary(s,r), events:r.data ? await calendarEvents(r.data,start,end,s) : [] }; } catch { return {source:{...sourceSummary(s,r),error:'Calendar could not be expanded.',stale:true},events:[]}; } }));
      const sources=results.map(r=>r.source);
      const today=dateKey(new Date(now()),cfg.timezone);
      const events=results.flatMap(r=>r.events).filter(e=>e.allDay?(e.endLocalDay>today||e.localDay===today):Date.parse(e.end)>now());
      return { connected:sources.some(s=>s.updatedAt!==null), events:events.sort((a,b)=>a.start.localeCompare(b.start)).slice(0,400), sources, error:cfg.calendarError || (!selected.length ? 'No calendars selected or configured.' : sources.every(s=>s.error) ? 'Calendar feeds unavailable.' : null), stale:sources.some(s=>s.stale) };
    },
    async news({ids}={}) {
      const selected=feeds.filter(s=>!ids||ids.includes(s.id));
      const results=await Promise.all(selected.map(async s=>({source:s,result:await s.get()})));
      const sources=results.map(({source,result})=>sourceSummary(source,result));
      return { connected:sources.some(s=>s.updatedAt!==null), items:mergeNews(results.map(r=>r.result.data||[])), sources, stale:sources.some(s=>s.stale), error:cfg.newsError || (!selected.length?'No news sources selected.':sources.every(s=>s.error)?'RSS feeds unavailable.':null) };
    }
  };
}
