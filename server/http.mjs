import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createTeslaService} from './teslafi.mjs';
import {createIntegrations} from './integrations.mjs';
import {articleQr} from './news-qr.mjs';
import {createSettingsStore} from './settings.mjs';
import {createNewsHistory} from './news-history.mjs';
import {createHealth} from './health.mjs';
import {createWeatherAlerts} from './weather-alerts.mjs';
import {defaults,APP_VERSION} from '../web/config.js';
const dataDir=process.env.DATA_DIR||path.resolve('data');
const vehicle=createTeslaService(),settings=createSettingsStore(dataDir),integrations=createIntegrations();
const history=createNewsHistory(dataDir),health=createHealth(),weatherAlerts=createWeatherAlerts();
const assets=new Map();
for(const [route,file,type]of [
 ['/','index.html','text/html'],['/settings','settings.html','text/html'],['/news','news.html','text/html'],
 ['/compat.js','compat.js','text/javascript'],['/app.js','app.js','text/javascript'],['/config.js','config.js','text/javascript'],['/rules.js','rules.js','text/javascript'],['/news.js','news.js','text/javascript']
])assets.set(route,{body:await readFile(new URL('../web/'+file,import.meta.url)),type});
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Cache-Control':'no-store'};
const json=(res,body,status=200)=>{res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
const sameOrigin=req=>req.headers['content-type']?.toLowerCase().startsWith('application/json')&&(!req.headers.origin||new URL(req.headers.origin).host===req.headers.host);
async function input(req){let raw='',length=0;for await(const chunk of req){length+=chunk.length;if(length>64000)throw Error('Body too large');raw+=chunk;}return JSON.parse(raw);}
async function getVehicle(){let r;await health.track('TeslaFi',async()=>{r=await vehicle(process.env.TESLAFI_API_KEY);return {...r.body,stale:r.body.vehicle?.stale===true,updatedAt:r.body.vehicle?.recordedAt||r.body.vehicle?.fetchedAt};});return r;}
async function collectNews(){
 const r=await health.track('News feeds',()=>integrations.news());
 try{await health.track('News archive',async()=>({connected:true,count:await history.ingest(r)}));}catch{}
 return r;
}
async function getAlerts(query){
 const cfg=(await settings.get()).settings||defaults;
 return health.track('NWS alerts',()=>weatherAlerts(query.get('latitude')??cfg.alertLatitude,query.get('longitude')??cfg.alertLongitude,query.get('minimum')||cfg.alertMinimumSeverity));
}
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  if(route==='/api/settings'){
   if(req.method==='GET')return json(res,await settings.get());
   if(req.method==='POST'){
    if(!sameOrigin(req))return json(res,{error:'Same-origin JSON requests required'},403);
    try{const body=await input(req);return json(res,await settings.save(body.settings,body.expectedRevision));}
    catch(e){return json(res,{error:e.status===409?e.message:'Could not save settings. Check values and the persistent data volume.'},e.status||400);}
   }
  }
  if(route==='/api/display-heartbeat'&&req.method==='POST'){
   if(!sameOrigin(req))return json(res,{error:'Same-origin JSON requests required'},403);
   try{health.heartbeat(await input(req));return json(res,{ok:true});}catch{return json(res,{error:'Invalid display heartbeat'},400);}
  }
  if(req.method!=='GET'){res.writeHead(405,{...security,Allow:'GET'});return res.end();}
  if(route==='/api/news-qr'){
   try{const png=url.searchParams.get('format')==='png',image=await articleQr(url.searchParams.get('url'),png?'png':'svg');res.writeHead(200,{...security,'Content-Type':png?'image/png':'image/svg+xml; charset=utf-8'});return res.end(image);}
   catch{res.writeHead(400,{...security,'Content-Type':'text/plain'});return res.end('Cannot create a QR code for this article URL.');}
  }
  if(route==='/api/tesla'){const r=await getVehicle();return json(res,r.body,r.status);}
  if(route==='/api/alerts')return json(res,await getAlerts(url.searchParams));
  if(route==='/api/news-history'){
   const feeds=await collectNews();try{return json(res,{connected:true,items:await history.get(),retentionHours:24,feedError:feeds.error||null,stale:feeds.stale});}catch{return json(res,{connected:false,error:'News archive unavailable. Check the persistent data volume.'},503);}
  }
  if(route==='/api/health'){
   let storage;try{const saved=await settings.get();storage={ok:true,settingsRevision:saved.revision,archivedHeadlines:(await history.get()).length};}catch{storage={ok:false,error:'Persistent settings or news archive unavailable'};}
   return json(res,{version:APP_VERSION,nodeVersion:process.version,...health.snapshot(),storage});
  }
  if(route.startsWith('/api/')){
   const ids=url.searchParams.has('ids')?url.searchParams.get('ids').split(',').filter(Boolean).slice(0,12):undefined;
   if(route==='/api/sources')return json(res,integrations.metadata());
   if(route==='/api/weather')return json(res,await health.track('Weather',()=>integrations.weather(url.searchParams.get('city')||undefined)));
   if(route==='/api/calendar')return json(res,await health.track('Calendars',()=>integrations.calendar({ids,days:url.searchParams.get('days')})));
   if(route==='/api/news')return json(res,await collectNews());
  }
  const canonical=(route==='/'||route==='/index.html')?'/':route.endsWith('/')?route.slice(0,-1):route;
  const asset=assets.get(canonical);
  if(asset){res.writeHead(200,{...security,'Content-Type':asset.type+'; charset=utf-8'});return res.end(asset.body);}
  res.writeHead(404,security);res.end('Not found');
 }catch{return json(res,{connected:false,error:'The dashboard could not complete this request.'},500);}
}).listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Dashboard '+APP_VERSION+' ready on port '+(process.env.PORT||8080)));
collectNews().catch(()=>{});
setInterval(()=>collectNews().catch(()=>{}),10*60000).unref();

