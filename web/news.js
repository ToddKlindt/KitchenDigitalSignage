import {fetchWithTimeout} from '/compat.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[],busy=false,error='',loadedAt=null;
function draw(){
 const query=$('searchNews').value.trim().toLowerCase(),source=$('newsSource').value,cutoff=Date.now()-Number($('newsHours').value)*3600000;
 const rows=items.filter(r=>r.lastSeenAt>=cutoff&&(!source||r.source===source)&&(!query||(r.title+' '+r.source).toLowerCase().includes(query)));
 $('archiveStatus').textContent=error||(rows.length+' headlines · Last checked '+(loadedAt?new Date(loadedAt).toLocaleTimeString():'never'));
 $('archiveList').innerHTML=rows.length?rows.map(r=>'<article class="archive-item"><h3><a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.title)+'</a></h3><small>'+esc(r.source)+(r.publishedAt?' · Published '+esc(new Date(r.publishedAt).toLocaleString()):' · Publication date unavailable')+'<br>Last seen in feed '+esc(new Date(r.lastSeenAt).toLocaleString())+'</small></article>').join(''):'<p class="muted">No matching headlines yet. The archive starts collecting when this version is installed.</p>';
}
async function load(){if(busy)return;busy=true;$('refreshNews').disabled=true;try{const r=await fetchWithTimeout('/api/news-history',{cache:'no-store'},45000),d=await r.json();if(!r.ok||!d.connected)throw Error(d.error||'News archive unavailable');items=d.items;error=d.feedError?'Feeds currently unavailable; showing retained headlines.':d.stale?'Some feeds are unavailable; showing collected headlines.':'';loadedAt=Date.now();const selected=$('newsSource').value;$('newsSource').innerHTML='<option value="">All sources</option>'+[...new Set(items.map(r=>r.source))].sort().map(name=>'<option>'+esc(name)+'</option>').join('');$('newsSource').value=selected;}catch(e){error='Could not refresh news. '+(e.message||'Check the NAS.');}finally{busy=false;$('refreshNews').disabled=false;draw();}}
for(const id of ['searchNews','newsSource','newsHours'])$(id).addEventListener('input',draw);
$('refreshNews').onclick=load;load();setInterval(load,60000);

