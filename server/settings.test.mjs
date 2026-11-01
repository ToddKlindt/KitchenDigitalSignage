import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createSettingsStore} from './settings.mjs';
import {defaults} from '../web/config.js';

test('shared settings persist across server restarts and strip unknown fields',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.settings-test-'));
 try{const first=createSettingsStore(dir);assert.deepEqual(await first.get(),{revision:0,settings:null});
 const saved=await first.save({...defaults,events:5,city:'Ames,IA,US',apiKey:'not-a-setting'},0);
 assert.equal(saved.revision,1);const restarted=createSettingsStore(dir);assert.equal((await restarted.get()).settings.events,5);
 assert.ok(!(await readFile(path.join(dir,'settings.json'),'utf8')).includes('not-a-setting'));
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(process.cwd())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('concurrent editors cannot silently overwrite each other',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.settings-test-'));
 try{const store=createSettingsStore(dir);const r=await Promise.allSettled([store.save({...defaults,events:4},0),store.save({...defaults,events:6},0)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.status,409);assert.equal((await store.get()).revision,1);
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(process.cwd())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('kiosk document has no controls and settings live at a separate page',async()=>{
 const kiosk=await readFile(new URL('../web/index.html',import.meta.url),'utf8'), settings=await readFile(new URL('../web/settings.html',import.meta.url),'utf8');
 const body=kiosk.slice(kiosk.indexOf('<body'));
 assert.ok(!/<(?:button|input|select|a|dialog)\b/i.test(body));assert.ok(!body.includes('Next story'));assert.ok(settings.includes('id="save"'));assert.ok(settings.includes('id="events"'));assert.ok(settings.includes('type="module"'));
});
