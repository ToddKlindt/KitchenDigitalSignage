import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chargingReminder} from '../web/rules.js';
import {defaults,validate} from '../web/config.js';
import {normalizeAlerts,createWeatherAlerts} from './weather-alerts.mjs';
import {createNewsHistory} from './news-history.mjs';
import {createHealth} from './health.mjs';
import {normalizeVehicle} from './teslafi.mjs';
const now=Date.parse('2026-10-25T16:00:00Z');
const cfg={...defaults,chargingReminderEnabled:true,chargingHome:'Home',chargingTarget:80};
const vehicle={name:'Lucille',recordedAt:new Date(now).toISOString(),battery:60,locationLabel:'Home',pluggedIn:false,driving:false};
test('charging reminder requires home, unplugged, low battery and fresh parked data',()=>{
 assert.equal(chargingReminder(vehicle,cfg,now).active,true);
 for(const change of [{pluggedIn:true},{pluggedIn:null},{locationLabel:'Office'},{battery:80},{driving:true},{recordedAt:null},{recordedAt:new Date(now-16*60000).toISOString()},{recordedAt:new Date(now+10*60000).toISOString()}])assert.equal(chargingReminder({...vehicle,...change},cfg,now).active,false);
 assert.equal(chargingReminder(vehicle,{...cfg,chargingReminderEnabled:false},now).active,false);
 assert.equal(chargingReminder({...vehicle,locationLabel:' HOME '},cfg,now).active,true);
});
test('TeslaFi account dates are interpreted in the configured time zone',()=>{
 const v=normalizeVehicle({battery_level:60,Date:'2026-10-25 11:00:00',charging_state:'Disconnected'},'America/Chicago');
 assert.equal(Date.parse(v.recordedAt),Date.parse('2026-10-25T16:00:00Z'));assert.equal(v.pluggedIn,false);
 assert.equal(Date.parse(normalizeVehicle({battery_level:60,Date:'2026-01-25 11:00:00'},'America/Chicago').recordedAt),Date.parse('2026-01-25T17:00:00Z'));
 assert.equal(normalizeVehicle({battery_level:60,charging_state:'Stopped'}).pluggedIn,true);
 assert.equal(normalizeVehicle({battery_level:60}).pluggedIn,null);
 assert.equal(Date.parse(normalizeVehicle({battery_level:60,Date:'2026-10-25T16:00:00Z'}).recordedAt),now);
});
function alert(id,extra={}){return {id,properties:{status:'Actual',messageType:'Alert',event:'Severe Thunderstorm Warning',severity:'Severe',headline:'Weather warning',expires:new Date(now+120000).toISOString(),...extra}};}
test('NWS display excludes test, cancelled, expired and below-threshold alerts',()=>{
 const payload={features:[alert('ok'),alert('ok'),alert('test',{status:'Test'}),alert('cancel',{messageType:'Cancel'}),alert('expired',{expires:new Date(now-1).toISOString()}),alert('minor',{severity:'Minor'}),alert('extreme',{severity:'Extreme'})]};
 const a=normalizeAlerts(payload,'Moderate',now);assert.deepEqual(a.map(x=>x.id),['extreme','ok']);assert.equal(normalizeAlerts(payload,'Extreme',now).length,1);assert.throws(()=>normalizeAlerts({},'Moderate',now));
});
test('NWS cache failures never turn into a false all-clear and expired cached alerts disappear',async()=>{
 let tick=now,calls=0,fail=false;const get=createWeatherAlerts(async url=>{calls++;assert.equal(url.hostname,'api.weather.gov');if(fail)throw Error('upstream');return Response.json({features:[alert('warning')]});},()=>tick);
 let r=await get();assert.equal(r.alerts.length,1);await get();assert.equal(calls,1);
 tick+=61000;fail=true;r=await get();assert.equal(r.stale,true);assert.equal(r.alerts.length,1);assert.ok(r.error);
 tick+=61000;r=await get();assert.equal(r.alerts.length,0);assert.equal(r.stale,true);assert.ok(r.error);
 assert.equal((await get(100,0)).connected,false);
});
test('news archive persists, deduplicates URL and expires entries after 24 hours',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.history-test-'));let tick=now;
 try{const store=createNewsHistory(dir,()=>tick),data={items:[{title:'Story',url:'https://example.org/story',source:'BBC',sourceId:'feed-0',publishedAt:null}],sources:[{id:'feed-0',updatedAt:now,error:null}]};
 await store.ingest(data);await store.ingest(data);data.items[0].url='https://example.org/story?utm_source=test';await store.ingest(data);assert.equal((await store.get()).length,1);
 const restarted=createNewsHistory(dir,()=>tick);assert.equal((await restarted.get())[0].title,'Story');
 tick+=86400001;assert.equal((await restarted.get()).length,0);
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(process.cwd())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('failed sources do not extend the lifetime of archived stories',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.history-test-'));let tick=now;
 try{const store=createNewsHistory(dir,()=>tick),data={items:[{title:'Story',url:'https://example.org/story',source:'BBC',sourceId:'feed-0'}],sources:[{id:'feed-0',updatedAt:now,error:null}]};await store.ingest(data);
 tick+=86400001;data.sources[0].error='Feed unavailable';await store.ingest(data);assert.equal((await store.get()).length,0);
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(process.cwd())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('health keeps last success and marks missing display heartbeats offline',async()=>{
 let tick=now;const h=createHealth(()=>tick);await h.track('Weather',async()=>({connected:true,updatedAt:now-1000}));tick+=1000;await h.track('Weather',async()=>({connected:false,error:'Unavailable'}));
 let e=h.snapshot().integrations[0];assert.equal(Date.parse(e.lastSuccess),now-1000);assert.equal(e.consecutiveFailures,1);
 h.heartbeat({id:'display-test',version:'2.2.0',width:1080,height:1920,visibility:'visible'});assert.equal(h.snapshot().displays[0].online,true);tick+=91000;assert.equal(h.snapshot().displays[0].online,false);
 assert.throws(()=>h.heartbeat({id:'bad id'}));
});
test('new configuration survives old settings and news has search controls',async()=>{
 const c=validate({events:4});assert.equal(c.chargingTarget,80);assert.equal(c.events,4);assert.equal(c.alertLatitude,42.0347);
 const html=await readFile(new URL('../web/news.html',import.meta.url),'utf8');for(const id of ['searchNews','newsSource','newsHours','archiveList'])assert.ok(html.includes('id="'+id+'"'));
});


test('new services work with the real default clock',async()=>{
 assert.equal(Number.isFinite(createHealth().snapshot().uptimeSeconds),true);
 const r=await createWeatherAlerts(async()=>Response.json({features:[]}))();assert.equal(r.connected,true);
 const dir=await mkdtemp(path.join(process.cwd(),'.history-test-'));try{assert.deepEqual(await createNewsHistory(dir).get(),[]);}finally{assert.ok(path.resolve(dir).startsWith(path.resolve(process.cwd())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('old home record is conditional only; unsafe or day-old records have no advisory',()=>{const old={...vehicle,recordedAt:new Date(now-20*60000).toISOString()};const r=chargingReminder(old,cfg,now);assert.equal(r.active,false);assert.equal(r.advisory,true);assert.match(r.reason,/If still unplugged/);for(const change of [{recordedAt:new Date(now-25*3600000).toISOString()},{pluggedIn:true},{pluggedIn:null},{driving:true},{locationLabel:'Office'},{battery:80}])assert.ok(!chargingReminder({...old,...change},cfg,now).advisory);});
