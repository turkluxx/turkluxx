// Local Chrome CDP checks. Start Chrome with --remote-debugging-port=9227.
// node scripts/test-i18n-browser.mjs [--english-only]
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

const root = process.cwd();
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

const results=[];const codes=['en','nl','ru','es','tr','ar'];
try{
for(const path of ['/', '/rengi-istanbul.html','/rengi-antalya.html','/meet-our-team.html']){
await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
await navigate(path+'?lang=en');
const hrefs=await evaluate("[...document.querySelectorAll('.turkluxx-home-desktop-nav a, .rengi-header-shell .turkluxx-sales-nav a')].map(e=>e.getAttribute('href'))");
for(const code of codes){
await evaluate('TurkLuxxI18n.setLanguage('+JSON.stringify(code)+')');await evaluate('document.fonts.ready');
const r=await evaluate(`(() => {const nav=document.querySelector('.turkluxx-home-desktop-nav, .rengi-header-shell .turkluxx-sales-nav');return {height:nav.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,rows:[...nav.querySelectorAll('a')].map(e=>({text:e.textContent,key:e.dataset.i18nMobile,expected:e.dataset.i18nMobile?TurkLuxxI18n.t(e.dataset.i18nMobile):e.textContent,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight,display:getComputedStyle(e).display,dir:getComputedStyle(e).direction,icon:getComputedStyle(e,'::before').backgroundImage,href:e.getAttribute('href')}))}})()`);
assert.equal(r.overflow,false,path+code);assert.deepEqual(r.rows.map(e=>e.href),hrefs);
for(const row of r.rows){assert.equal(row.text,row.expected);assert.equal(row.display,'grid');assert.equal(row.font,'15px');assert.equal(row.weight,'700');assert.ok(row.height>=44);assert.ok(row.icon.includes('svg'),path+code+JSON.stringify(row));assert.equal(row.dir,code==='ar'?'rtl':'ltr');}
assert.ok(r.height<=190,path+code+' height '+r.height);
await evaluate("document.querySelector('.turkluxx-home-desktop-nav .turkluxx-roi-trigger, .rengi-header-shell .turkluxx-roi-trigger').click()");
await until("document.querySelector('#turkluxx-roi')?.open");await evaluate("document.querySelector('#turkluxx-roi').close()");
const png=await send('Page.captureScreenshot',{format:'png'});await writeFile('build/compact-'+(path==='/'?'home':path.slice(1).replace('.html',''))+'-'+code+'.png',Buffer.from(png.data,'base64'));
results.push({path,code,height:r.height,labels:r.rows.map(e=>e.text)});
// Check full labels and undecorated desktop rows after crossing the breakpoint.
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await pause(80);
assert.equal(await evaluate("[...document.querySelectorAll('[data-i18n-mobile]')].every(e=>e.textContent===TurkLuxxI18n.t(e.dataset.i18n)&&getComputedStyle(e,'::before').backgroundImage==='none'&&getComputedStyle(e,'::after').content==='none')"),true,path+code+' desktop');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await pause(80);
assert.equal(await evaluate("[...document.querySelectorAll('[data-i18n-mobile]')].every(e=>e.textContent===TurkLuxxI18n.t(e.dataset.i18nMobile))"),true);
}
}
assert.equal(errors.length,0,JSON.stringify(errors));await writeFile('build/compact-menu-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await fetch('http://127.0.0.1:9227/json/close/'+target.id);ws.close();server.close();}
