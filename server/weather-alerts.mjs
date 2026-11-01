import {createCachedSource,fetchText} from './integrations.mjs';
export const severityRank={Unknown:0,Minor:1,Moderate:2,Severe:3,Extreme:4};
const plain=(v,n=500)=>String(v||'').replace(/<[^>]*>/g,'').slice(0,n);
export function normalizeAlerts(payload,minimum='Moderate',now=Date.now()) {
 if(!Array.isArray(payload.features))throw Error('Invalid NWS response');
 const seen=new Set();
 return payload.features.map(f=>{
  const p=f.properties||{},expiration=Math.min(...[p.ends,p.expires].map(Date.parse).filter(Number.isFinite));
  if(p.status!=='Actual'||p.messageType==='Cancel'||!Number.isFinite(expiration)||expiration<=now||(severityRank[p.severity]||0)<severityRank[minimum])return null;
  const id=plain(f.id||p.id,200);if(!id||seen.has(id))return null;seen.add(id);
  return {id,event:plain(p.event,100),severity:p.severity,headline:plain(p.headline,500),description:plain(p.description,3000),instruction:plain(p.instruction,1500),area:plain(p.areaDesc,300),onset:p.onset||null,expires:new Date(expiration).toISOString(),sender:plain(p.senderName,150)};
 }).filter(Boolean).sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||a.expires.localeCompare(b.expires)).slice(0,30);
}
export function createWeatherAlerts(fetcher=fetch,now=Date.now) {
 const caches=new Map();
 return async (latitude=42.0347,longitude=-93.6199,minimum='Moderate')=>{
  latitude=Number(latitude);longitude=Number(longitude);
  if(!Number.isFinite(latitude)||latitude< -90||latitude>90||!Number.isFinite(longitude)||longitude< -180||longitude>180||!['Moderate','Severe','Extreme'].includes(minimum))return {connected:false,alerts:[],error:'Invalid weather alert point or severity.'};
  const point=latitude.toFixed(4)+','+longitude.toFixed(4);
  if(!caches.has(point)){if(caches.size>=10)caches.delete(caches.keys().next().value);caches.set(point,createCachedSource(async()=>JSON.parse(await fetchText('https://api.weather.gov/alerts/active?point='+encodeURIComponent(point),fetcher,3_000_000)),60000,now));}
  const r=await caches.get(point)();
  try{return {connected:!!r.data,alerts:r.data?normalizeAlerts(r.data,minimum,now()):[],updatedAt:r.updatedAt,checkedAt:r.checkedAt,stale:r.stale,error:r.error?'NWS alerts unavailable. Check again later.':null,point,provider:'National Weather Service'};}
  catch{return {connected:false,alerts:[],error:'NWS returned an invalid alert response.',stale:true,point};}
 };
}
