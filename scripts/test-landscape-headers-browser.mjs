// Landscape branding, CTA rows and page-specific navigation in all six languages.
// Start headless Chrome with --remote-debugging-port=9227, then run:
// node scripts/test-landscape-headers-browser.mjs [--dist]
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const publicRoot = process.argv.includes('--dist') ? resolve(root, 'dist') : root;
const port = Number(process.env.TURKLUXX_I18N_PORT || 8799);
const base = `http://127.0.0.1:${port}`;
const server = http.createServer(async (req, res) => {
    try {
        const pathname = new URL(req.url, base).pathname;
        const file = resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(publicRoot + sep)) throw Error('outside public root');
        const data = await readFile(file);
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(file)] || 'application/octet-stream');
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const target = await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    if (!msg.id) return;
    const task = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? task.reject(msg.error) : task.resolve(msg.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id; pending.set(callId, { resolve, reject }); ws.send(JSON.stringify({ id: callId, method, params }));
});
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    // Ignore invisible bidi isolation marks when comparing rendered content to catalog text.
    const readable = value => typeof value === 'string' ? value.replace(/[\u2066-\u2069]/g, '')
        : Array.isArray(value) ? value.map(readable)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, readable(item)])) : value;
    return readable(r.result.value);
};
async function click(selector) {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(50); }
    throw Error(`Timeout: ${expression}`);
}
async function navigate(path) {
    await send('Page.navigate', { url: base + path });
    await until(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState !== 'loading' && typeof TurkLuxxI18n !== 'undefined'`);
    await evaluate('TurkLuxxI18n.ready'); await pause(100);
    await until(`document.documentElement.lang === ${JSON.stringify(new URL(base + path).searchParams.get('lang'))}`);
}

const records=[];
const paths=['/','/rengi-istanbul.html','/rengi-antalya.html','/meet-our-team.html','/privacy-policy.html','/cookie-policy.html','/terms-and-conditions.html','/disclaimer.html'];
const snapshot=`(()=>{const header=document.querySelector('.turkluxx-sales-header');const box=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:c.display,visibility:c.visibility,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,color:c.color,align:c.textAlign,background:c.backgroundImage,blur:c.backdropFilter,border:c.borderTopWidth}};const q=s=>box(document.querySelector(s));const logo=document.querySelector('.turkluxx-sales-logo');const word=logo.querySelector('span'),tag=logo.querySelector('.turkluxx-brand-tagline');const range=document.createRange();range.selectNodeContents(tag);const r=range.getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,logo:box(logo),word:box(word),tag:box(tag),tagText:{x:r.x,right:r.right,width:r.width},language:q('.turkluxx-sales-language'),header:box(header),ctas:q('.turkluxx-mobile-primary-ctas'),callback:q('.turkluxx-mobile-callback-trigger'),phone:q('.turkluxx-call-top'),toggle:q('.turkluxx-mobile-menu-control'),nav:q(header.querySelector('.turkluxx-home-desktop-nav')?'.turkluxx-home-desktop-nav':'.turkluxx-sales-nav'),links:[...header.querySelectorAll(header.querySelector('.turkluxx-home-desktop-nav')?'.turkluxx-home-desktop-nav a':'.turkluxx-sales-nav a')].map(e=>({href:e.getAttribute('href'),text:e.textContent,...box(e)})),main:document.querySelector('main')?.getBoundingClientRect().top}})()`;
try{
 for(const path of paths){
  for(const code of ['en','ru','es','ar','tr','nl']){
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await navigate(path+'?lang='+code);await evaluate('document.fonts.ready');
   const portrait=await evaluate(snapshot);
   await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await pause(150);
   const desktop=await evaluate(snapshot);
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(150);
   const original=portrait.links.map(e=>({href:e.href,text:e.text}));
   for(const [width,height] of [[667,375],[844,390],[852,393],[932,430]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await pause(150);
    const r=await evaluate(snapshot);records.push({path,code,width});
    assert.equal(r.width,width);assert.equal(r.overflow,false,'Overflow '+path+' '+code+' '+width);
    for(const k of ['logo','word','tag','language','phone','header'])assert.ok(r[k].width>0&&r[k].x>=-1&&r[k].right<=width+1,k+' bounds '+JSON.stringify(r[k]));
    assert.ok(Math.abs(r.word.x+r.word.width/2-r.tag.x-r.tag.width/2)<1,'Centered tagline');
    assert.ok(r.tag.y>=r.word.bottom-1,'Tagline below wordmark');
    assert.ok(r.tagText.x>=r.logo.x&&r.tagText.right<=r.logo.right,'Tagline text fits logo');
    assert.ok(r.tag.font.includes('Cormorant Garamond'));assert.equal(r.tag.weight,'700');assert.equal(r.tag.color,'rgb(243, 217, 146)');
    assert.deepEqual(r.links.map(e=>({href:e.href,text:e.text})),original,'Preserve own navigation');
    assert.ok(r.nav.y>=Math.max(r.logo.bottom,r.language.bottom)-1,'Navigation/header overlap');
    if(path==='/'){
     assert.ok(r.logo.background.includes('linear-gradient'));assert.equal(r.logo.blur,'blur(5px)');assert.equal(r.logo.border,'1px');
     assert.ok(Math.abs(r.callback.y-r.phone.y)<1,'CTA same row');assert.ok(r.callback.right<r.phone.x,'CTA gap');
     assert.ok(Math.abs(r.ctas.x+r.ctas.width/2-width/2)<1,'Centered CTAs');assert.ok(r.ctas.width<width-40,'Compact CTAs');
     for(const k of ['callback','phone'])assert.ok(r[k].right<=width&&r[k].x>=0&&r[k].height>=44);
     const heading=await evaluate("document.querySelector('.turkluxx-sales-heading').getBoundingClientRect().top");assert.ok(heading>=r.nav.bottom);
    }else{
     assert.equal(r.logo.background,'none');assert.equal(r.logo.blur,'none');assert.equal(r.toggle.display,'none');
     assert.ok(r.links.every(e=>e.width>0&&e.display!=='none'&&e.visibility==='visible'&&e.x>=0&&e.right<=width),'Full internal navigation');
     assert.ok(r.nav.y>=r.phone.bottom-1);assert.ok(r.main>=r.header.bottom,'Header/content overlap');
     assert.ok(r.language.x>=r.phone.right-1&&r.phone.x>=r.logo.right-1,'Balanced logo/phone/language row');
    }
    await click('.turkluxx-language-toggle');
    assert.equal(await evaluate("(()=>{const r=document.querySelector('.turkluxx-language-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),true,'Language dropdown fits');
    await click('.turkluxx-language-toggle');
    assert.equal(await evaluate("document.querySelector('.turkluxx-call-top').getAttribute('href')"),'https://wa.me/12137322002');
    const languageParts=await evaluate("(()=>{const toggle=document.querySelector('.turkluxx-language-toggle').getBoundingClientRect();return [...document.querySelector('.turkluxx-language-toggle').children].every(e=>{const r=e.getBoundingClientRect();return r.left>=toggle.left-1&&r.right<=toggle.right+1})})()");
    assert.equal(languageParts,true,'Language control children fit');
    if(width===852&&code==='en'){
     await click('.turkluxx-language-toggle');await evaluate("document.querySelector('.turkluxx-sales-language [data-language=ar]').click()");await until("document.documentElement.lang==='ar'");await pause(150);
     const arabic=await evaluate(snapshot);assert.equal(arabic.overflow,false);assert.equal(await evaluate("document.documentElement.dir"),'rtl');assert.deepEqual(arabic.links.map(e=>e.href),original.map(e=>e.href));
     await click('.turkluxx-language-toggle');await evaluate("document.querySelector('.turkluxx-sales-language [data-language=en]').click()");await until("document.documentElement.lang==='en'");await pause(150);
     if(path==='/'){
      await evaluate("document.querySelector('.turkluxx-mobile-callback-trigger').scrollIntoView({block:'center',behavior:'instant'})");await pause(100);await click('.turkluxx-mobile-callback-trigger');
      await until("document.querySelector('#turkluxx-callback').open");await evaluate("document.querySelector('#turkluxx-callback .turkluxx-callback-close').click()");await until("!document.querySelector('#turkluxx-callback').open&&getComputedStyle(document.body).position!=='fixed'");
      await evaluate("scrollTo({top:0,behavior:'instant'})");await pause(100);
     }
    }
    if(code==='en'&&width===852&&['/','/rengi-istanbul.html'].includes(path)&&process.argv.includes('--screenshot')){
     const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(root,path==='/'?'.tmp-home-landscape.png':'.tmp-internal-landscape.png'),Buffer.from(shot.data,'base64'));
    }
   }
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(150);
   assert.deepEqual(await evaluate(snapshot),portrait,'Portrait unchanged after rotation '+path+' '+code);
   await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await pause(150);
   assert.deepEqual(await evaluate(snapshot),desktop,'Desktop unchanged after rotation '+path+' '+code);
  }
  console.log('PASS '+path+' in all six languages and four landscape sizes');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('Passed '+records.length+' landscape checks and 96 portrait/desktop rotation checks.');
}finally{await send('Page.close');ws.close();server.close();}
