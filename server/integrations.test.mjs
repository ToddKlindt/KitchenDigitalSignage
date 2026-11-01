import {test} from 'node:test';
import assert from 'node:assert/strict';
import ical from 'node-ical';
import {createCachedSource, sourcesFromEnv, publicUrl, fetchText, aggregateForecast, calendarEvents, parseNews, mergeNews, createIntegrations} from './integrations.mjs';
const source={id:'calendar-0',name:'Family',color:'#b5d0b1'};
const fixture=`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Klindt tests//EN
BEGIN:VEVENT
UID:daily
DTSTART;TZID=America/Chicago:20261031T090000
DTEND;TZID=America/Chicago:20261031T100000
RRULE:FREQ=DAILY;COUNT=4
EXDATE;TZID=America/Chicago:20261101T090000
SUMMARY:Daily check-in
END:VEVENT
BEGIN:VEVENT
UID:daily
RECURRENCE-ID;TZID=America/Chicago:20261102T090000
DTSTART;TZID=America/Chicago:20261102T100000
DTEND;TZID=America/Chicago:20261102T110000
SUMMARY:Moved check-in
LOCATION:Library
END:VEVENT
BEGIN:VEVENT
UID:daily
RECURRENCE-ID;TZID=America/Chicago:20261103T090000
DTSTART;TZID=America/Chicago:20261103T090000
DTEND;TZID=America/Chicago:20261103T100000
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
UID:holiday
DTSTART;VALUE=DATE:20261101
DTEND;VALUE=DATE:20261103
SUMMARY:Holiday
END:VEVENT
END:VCALENDAR`;
test('calendar expands DST, excluded dates, moved and cancelled occurrences',async()=>{
 const parsed=await ical.async.parseICS(fixture);
 const rows=await calendarEvents(parsed,new Date('2026-10-30T00:00:00Z'),new Date('2026-11-05T00:00:00Z'),source);
 const daily=rows.filter(r=>r.id.includes('daily'));
 assert.deepEqual(daily.map(r=>r.start),['2026-10-31T14:00:00.000Z','2026-11-02T16:00:00.000Z']);
 assert.equal(daily[1].title,'Moved check-in');assert.equal(daily[1].location,'Library');
 const holiday=rows.find(r=>r.title==='Holiday');assert.equal(holiday.allDay,true);assert.equal(holiday.localDay,'2026-11-01');
});
test('ongoing multi-day event survives expansion',async()=>{const rows=await calendarEvents(await ical.async.parseICS(fixture),new Date('2026-11-02T01:00:00Z'),new Date('2026-11-05T00:00:00Z'),source);assert.ok(rows.some(r=>r.title==='Holiday'));});
test('forecast groups remaining samples using the city offset',()=>{const row=(dt,low,high)=>({dt:Date.parse(dt)/1000,main:{temp_min:low,temp_max:high},weather:[{description:'clear sky',icon:'01d'}]});const days=aggregateForecast({list:[row('2026-10-23T00:00:00Z',5,9),row('2026-10-23T03:00:00Z',3,7),row('2026-10-23T06:00:00Z',2,5)]},-18000);assert.equal(days.length,2);assert.equal(days[0].day,'2026-10-22');assert.equal(days[0].lowCelsius,3);assert.equal(days[0].highCelsius,9);});
test('RSS safely parses titles and links and deduplicates sources',async()=>{const now=Date.parse('2026-10-22T12:00Z');const xml=`<rss version="2.0"><channel><title>Test</title><item><title>&lt;b&gt;A story&lt;/b&gt;</title><link>https://example.org/a?utm_source=x</link><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item><item><title>Old</title><link>https://example.org/old</link><pubDate>Thu, 01 Jan 2026 10:00:00 GMT</pubDate></item></channel></rss>`;const rows=await parseNews(xml,{name:'BBC',id:'feed-0'},now);assert.equal(rows.length,1);assert.equal(rows[0].title,'A story');assert.equal(mergeNews([rows,[{...rows[0],url:'https://example.org/a'}]]).length,1);await assert.rejects(parseNews('<!DOCTYPE x><rss/>',source,now));});
test('Atom links are parsed',async()=>{const rows=await parseNews('<feed xmlns="http://www.w3.org/2005/Atom"><title>Test</title><entry><title>Atom headline</title><id>a</id><link href="https://example.org/atom"/><updated>2026-10-22T10:00:00Z</updated></entry></feed>',{name:'Atom',id:'feed-1'},Date.parse('2026-10-22T12:00Z'));assert.equal(rows[0].url,'https://example.org/atom');});
test('cache coalesces requests, retains good data and sanitizes failures',async()=>{let t=100000,calls=0,fail=false;const get=createCachedSource(async()=>{calls++;if(fail)throw Error('secret-url');return [1]},300000,()=>t);await Promise.all([get(),get()]);assert.equal(calls,1);t+=300001;fail=true;const r=await get();assert.equal(r.stale,true);assert.deepEqual(r.data,[1]);assert.ok(!JSON.stringify(r).includes('secret-url'));await get();assert.equal(calls,2);});
test('source metadata excludes private URLs and API keys',()=>{const data=createIntegrations({OPENWEATHER_API_KEY:'PRIVATEKEY',GOOGLE_CALENDAR_URL:'https://calendar.google.com/private-CALENDARSECRET/basic.ics'}).metadata();const s=JSON.stringify(data);assert.ok(!s.includes('PRIVATEKEY'));assert.ok(!s.includes('CALENDARSECRET'));assert.ok(!s.includes('https://'));assert.equal(data.weatherConfigured,true);});
test('invalid environment JSON yields actionable sanitized configuration errors',()=>{const c=sourcesFromEnv({CALENDARS_JSON:'secret-not-json',RSS_FEEDS_JSON:'{}'});assert.ok(c.calendarError);assert.ok(c.newsError);assert.ok(!JSON.stringify(c).includes('secret-not-json'));});
test('HTTP and local URLs are rejected; redirects are validated',async()=>{for(const url of ['http://example.org','https://127.0.0.1/a','https://localhost/a','https://[::1]/','https://user:secret@example.org/'])assert.throws(()=>publicUrl(url));await assert.rejects(fetchText('https://example.org',async()=>new Response(null,{status:302,headers:{location:'http://localhost/'}})));});
test('download size is bounded',async()=>{await assert.rejects(fetchText('https://example.org',async()=>new Response('123456'),5));});
test('missing weather key does not make a request',async()=>{const service=createIntegrations({},()=>{throw Error('Network forbidden')});assert.equal((await service.weather()).connected,false);});
test('one broken RSS feed keeps other source headlines',async()=>{const xml='<rss version="2.0"><channel><title>Feed</title><item><title>A</title><link>https://example.org/a</link></item></channel></rss>';const service=createIntegrations({RSS_FEEDS_JSON:JSON.stringify([{name:'Good',url:'https://example.org/good'},{name:'Bad',url:'https://example.org/bad'}])},async url=>String(url).endsWith('/good')?new Response(xml):new Response('failed',{status:500}));const r=await service.news();assert.equal(r.connected,true);assert.equal(r.items.length,1);assert.equal(r.stale,true);assert.equal(r.sources.find(s=>s.name==='Bad').error!==null,true);});
test('all-day event stays on its calendar date after midnight UTC',async()=>{
 const single=`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:one\nDTSTART;VALUE=DATE:20261101\nDTEND;VALUE=DATE:20261102\nSUMMARY:Today locally\nEND:VEVENT\nEND:VCALENDAR`;
 const service=createIntegrations({TZ:'America/Chicago',GOOGLE_CALENDAR_URL:'https://example.org/calendar.ics',INCLUDE_US_HOLIDAYS:'false'},async()=>new Response(single),()=>Date.parse('2026-11-02T03:00:00Z'));
 const r=await service.calendar();assert.equal(r.events.length,1);assert.equal(r.events[0].localDay,'2026-11-01');assert.equal(r.events[0].endLocalDay,'2026-11-02');
});
test('weather key stays upstream and the successful response is cached',async()=>{
 let calls=0;const service=createIntegrations({OPENWEATHER_API_KEY:'SAMPLEKEY'},async url=>{calls++;assert.equal(url.searchParams.get('appid'),'SAMPLEKEY');return Response.json(url.pathname.endsWith('/weather')?{name:'Ames',sys:{country:'US'},main:{temp:0,feels_like:-2,humidity:50},weather:[{description:'cloudy',icon:'03d'}],dt:1792670400,timezone:-18000}:{list:[]});});
 const r=await service.weather('Ames,IA,US');assert.equal(r.data.tempCelsius,0);assert.ok(!JSON.stringify(r).includes('SAMPLEKEY'));await service.weather('Ames,IA,US');assert.equal(calls,2);
});
