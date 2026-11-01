import {test} from 'node:test';
import assert from 'node:assert/strict';
import {articleQr} from './news-qr.mjs';

test('encodes an article as a black-and-white SVG with a quiet zone',async()=>{
 const svg=await articleQr('https://example.org/article?topic=rock&day=friday');
 assert.match(svg,/<svg/);assert.match(svg,/width="220"/);assert.match(svg,/#ffffff/);assert.match(svg,/#000000/);
 assert.ok(!svg.includes('http://example.org/article'));
});
test('refuses non-web URLs, credentials, missing URLs and over-capacity links',async()=>{
 for(const value of [null,'javascript:alert(1)','file:///etc/passwd','https://user:secret@example.org/','https://example.org/'+ 'x'.repeat(2300)])await assert.rejects(articleQr(value));
});
test('different stories produce different codes and Unicode URLs work',async()=>{
 const a=await articleQr('https://example.org/first');const b=await articleQr('https://example.org/second');assert.notEqual(a,b);
 assert.match(await articleQr('https://example.org/café?q=吉他'),/<svg/);
});
import {PNG} from 'pngjs';
test('PNG QR has black modules and white quiet zone',async()=>{const b=await articleQr('https://example.org/news?a=1','png');assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10]);const p=PNG.sync.read(b);assert.equal(p.width,440);assert.deepEqual([...p.data.subarray(0,4)],[255,255,255,255]);assert.ok(p.data.some((v,i)=>i%4===0&&v===0));});
