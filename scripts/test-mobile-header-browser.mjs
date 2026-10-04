// Real pointer checks for all mobile header actions in six languages.
// Start Chrome with --remote-debugging-port=9227, then run:
// node scripts/test-mobile-header-browser.mjs [--dist]
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = process.argv.includes('--dist') ? resolve(root, 'dist') : root;
const port = Number(process.env.TURKLUXX_I18N_PORT || 8799);
const base = `http://127.0.0.1:${port}`;
const messages = [], payloads = [];
let failNextLead = false;
const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/api/lead') {
            if (failNextLead) {
                failNextLead = false;
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false })); return;
            }
            let body = ''; for await (const chunk of req) body += chunk;
            payloads.push(JSON.parse(body));
            const result = await worker.fetch(new Request(`${base}/api/lead`, { method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: base }, body }),
                { LEAD_EMAIL: { send: async message => { messages.push(message); } } });
            res.writeHead(result.status, { 'Content-Type': 'application/json' }); res.end(await result.text()); return;
        }
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
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(50); }
    throw Error(`Timeout: ${expression}`);
}
async function navigate(path) {
    await send('Page.navigate', { url: base + path });
    await until(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState !== 'loading' && typeof TurkLuxxI18n !== 'undefined'`);
    await evaluate('TurkLuxxI18n.ready'); await pause(100);
}
async function dismissCallback() {
    await evaluate(`new Promise(resolve => {
        const dialog = document.querySelector('#turkluxx-callback');
        if (!dialog.open) return resolve();
        dialog.addEventListener('close', () => queueMicrotask(resolve), {once:true});
        dialog.querySelector('.turkluxx-callback-close').click();
    })`);
}

// Every activation uses a real browser pointer event and checks its result.
async function click(selector) {
    const point=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)throw Error("Missing target");const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,visible:r.width>0&&r.height>0&&y>=0&&y<innerHeight,hit:e.contains(document.elementFromPoint(x,y))}})()');
    assert.ok(point.visible&&point.hit,'Unclickable or covered: '+selector+' '+JSON.stringify(point));
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
}
const menu='.turkluxx-mobile-menu',toggle='.turkluxx-mobile-menu-toggle',quick='.turkluxx-mobile-primary-nav';
const paths=['/','/rengi-istanbul.html','/rengi-antalya.html','/meet-our-team.html'];
const codes=['en','nl','ru','es','tr','ar'];
const results=[];
async function load(path,code){await navigate(path+'?lang='+code);await until('document.documentElement.lang==='+JSON.stringify(code));await evaluate('document.fonts.ready');await until("!!document.querySelector('.turkluxx-mobile-menu-toggle')");await evaluate('scrollTo(0,0)');}
async function roiClick(selector){await click(selector);await until("document.querySelector('#turkluxx-roi')?.open");assert.equal(await evaluate("document.querySelectorAll('#turkluxx-roi').length"),1);await click('#turkluxx-roi .turkluxx-callback-close');await until("!document.querySelector('#turkluxx-roi').open && getComputedStyle(document.body).position!=='fixed'");}
async function scrollClick(selector){
    const destination=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');const u=new URL(e.href);const target=document.querySelector(u.hash);const section=target?.closest("section,footer")||target;return {path:u.pathname,hash:u.hash,expected:section?Math.min(Math.max(0,section.getBoundingClientRect().top+scrollY),document.documentElement.scrollHeight-innerHeight):null}})()');
    await click(selector);
    await until('location.pathname==='+JSON.stringify(destination.path)+' && location.hash==='+JSON.stringify(destination.hash));
    await pause(1150);
    assert.ok(await evaluate('scrollY>0'),'No scroll after '+selector);
    if(destination.expected!==null)await until('document.activeElement===document.querySelector('+JSON.stringify(destination.hash)+')');
    assert.equal(await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(destination.hash)+');const r=(e.closest("section,footer")||e).getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()'),true,'Destination is not visible: '+selector);

}
try{
await mkdir(resolve(root,'build/mobile-navigation'),{recursive:true});
await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
for(const path of paths)for(const code of codes){
await load(path,code);
assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,path+code+' overflow');
assert.equal(await evaluate("[...document.querySelectorAll('.turkluxx-sales-header>.turkluxx-sales-logo small')].every(e=>getComputedStyle(e).display==='none'&&e.getBoundingClientRect().height===0)"),true);
assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').children.length"),4);
assert.equal(await evaluate("[...document.querySelector('.turkluxx-mobile-menu').children].every((e,i)=>e.textContent===TurkLuxxI18n.t(['mobile.nav.team','mobile.nav.primary_roi','mobile.nav.primary_properties','mobile.nav.contact'][i]))"),true);
await roiClick(quick+' a:first-child');
await scrollClick(quick+' a:last-child');
await load(path,code);
await click(toggle);assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),false);
const shape=await evaluate("(()=>{const w=document.querySelector('.turkluxx-mobile-menu-wrapper'),b=document.querySelector('.turkluxx-mobile-menu-toggle'),m=document.querySelector('.turkluxx-mobile-menu'),s=document.querySelector('.turkluxx-mobile-menu-surface');const r=w.getBoundingClientRect(),br=b.getBoundingClientRect(),mr=m.getBoundingClientRect();return {left:r.left,right:r.right,h:r.height,bottom:br.bottom,menuTop:mr.top,same:w.contains(b)&&w.contains(m),path:s.querySelectorAll('path').length,transparent:getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(m).backgroundColor==='rgba(0, 0, 0, 0)',border:getComputedStyle(b).borderTopColor,display:getComputedStyle(s).display}})()");
assert.ok(shape.same&&shape.transparent&&shape.path===1&&shape.display==='block');assert.equal(shape.menuTop,shape.bottom);assert.ok(shape.h>240&&shape.left>=0&&shape.right<=390);
await send('Page.captureScreenshot',{format:'png'}).then(r=>writeFile(resolve(root,'build/mobile-navigation/'+(path==='/'?'home':path.slice(1).replace('.html',''))+'-'+code+'.png'),Buffer.from(r.data,'base64')));
await click(toggle);assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),true);
await click(toggle);await click('.turkluxx-sales-language .turkluxx-language-toggle');assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),true);assert.equal(await evaluate("document.querySelector('.turkluxx-sales-language .turkluxx-language-toggle').getAttribute('aria-expanded')"),'true');await click('.turkluxx-sales-language .turkluxx-language-toggle');
await click(toggle);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:385,y:850,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:385,y:850,button:'left',clickCount:1});assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),true);
await click(toggle);await roiClick(menu+' a:nth-child(2)');assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),true);
await click(toggle);await scrollClick(menu+' a:nth-child(3)');
await load(path,code);await click(toggle);await scrollClick(menu+' a:nth-child(4)');assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),true);
await load(path,code);await click(toggle);await click(menu+' a:first-child');await until("location.pathname==='/meet-our-team.html' && document.readyState!=='loading' && !!document.querySelector('#team-heading')");await until('document.documentElement.lang==='+JSON.stringify(code));assert.equal(await evaluate("document.querySelector('.turkluxx-mobile-menu').hidden"),true);
results.push({path,code,quickROI:true,quickProperties:true,team:true,menuROI:true,menuProperties:true,contact:true,shape:true});console.log('PASS '+path+' '+code+' all six link activations + toggle/X/outside close + shape');
}
assert.equal(errors.length,0,JSON.stringify(errors));await writeFile(resolve(root,'build/mobile-navigation/results.json'),JSON.stringify(results,null,2));
 }finally{ws.close();server.closeAllConnections();server.close();await fetch('http://127.0.0.1:9227/json/close/'+target.id,{signal:AbortSignal.timeout(3000)}).catch(()=>{});}
