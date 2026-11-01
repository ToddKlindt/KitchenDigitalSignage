import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const day=86400000;
const key=value=>{const u=new URL(value);u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid)/i.test(k))u.searchParams.delete(k);return u.href;};
export function createNewsHistory(directory,now=Date.now) {
 const file=path.join(directory,'news-history.json');let items=[],queue=Promise.resolve();
 const ready=(async()=>{try{const value=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(value))throw Error();items=value.filter(r=>r&&typeof r.title==='string'&&typeof r.url==='string'&&/^https?:\/\//i.test(r.url)&&Number.isFinite(r.lastSeenAt));}catch(e){if(e.code!=='ENOENT')throw Error('News archive could not be loaded.');}})();ready.catch(()=>{});
 const prune=rows=>rows.filter(r=>r.lastSeenAt>=now()-day).sort((a,b)=>b.firstSeenAt-a.firstSeenAt||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,2000);
 return {
  async get(){await ready;await queue.catch(()=>{});return prune(items);},
  ingest(news){const task=queue.catch(()=>{}).then(async()=>{await ready;const rows=new Map(items.map(r=>[key(r.url),r]));for(const item of news.items||[]){const source=news.sources?.find(s=>s.id===item.sourceId);if(source?.error)continue;let url;try{url=new URL(item.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;}catch{continue;}
   const old=rows.get(key(url.href));rows.set(key(url.href),{title:String(item.title).slice(0,240),url:url.href,source:String(item.source||'').slice(0,60),sourceId:String(item.sourceId||'').slice(0,30),publishedAt:item.publishedAt||null,firstSeenAt:old?.firstSeenAt??now(),lastSeenAt:source?.updatedAt??now()});}
   const next=prune([...rows.values()]);await mkdir(directory,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await rename(file+'.tmp',file);items=next;return next.length;
  });queue=task;return task;}
 };
}
