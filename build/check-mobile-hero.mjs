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

const records=[];
try {
for (const width of [390,1440]) {
await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
for(const code of ['en','ru','es','ar','tr','nl']) {
await navigate('/?lang='+code);
await evaluate('document.fonts.ready');
const record=await evaluate(`(() => {const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,font:c.fontSize,margin:c.marginTop,text:e.innerText}};return {lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth,logo:box('.turkluxx-sales-logo > span'),tagline:box('.turkluxx-sales-logo small'),heading:box('.turkluxx-sales-heading'),cta:box('.turkluxx-mobile-primary-ctas'),hero:box('.turkluxx-sales-hero'),imageHeight:getComputedStyle(document.querySelector('.turkluxx-sales-hero'),'::before').height}})()`);
record.width=width;records.push(record);
const nav=await evaluate("[...document.querySelectorAll('.turkluxx-home-desktop-nav a')].map(e=>({display:getComputedStyle(e).display,align:getComputedStyle(e).textAlign,dir:getComputedStyle(e).direction,icon:getComputedStyle(e,'::before').backgroundImage,chevron:getComputedStyle(e,'::after').content}))");
assert.equal(nav.length,4);
for(const row of nav){if(width===390){assert.equal(row.display,'grid');assert.equal(row.align,'start');assert.equal(row.dir,code==='ar'?'rtl':'ltr');assert.ok(row.icon.includes('svg'));assert.ok(row.chevron.includes(String.fromCharCode(8250)));}else{assert.equal(row.icon,'none');assert.equal(row.chevron,'none');}}
if(width===390){await evaluate("document.querySelector('.turkluxx-home-desktop-nav .turkluxx-roi-trigger').click()");assert.equal(await evaluate("document.querySelector('#turkluxx-roi').open"),true);await evaluate("document.querySelector('#turkluxx-roi').close()");}

if(width===390){
assert.equal(record.overflow,false);
assert.equal(record.cta.margin,'0px');
assert.equal(record.cta.y-record.heading.y-record.heading.height,20);
assert.equal(record.tagline.font,'11px');
assert.ok(record.logo.width>200);
await evaluate("document.querySelector('.turkluxx-mobile-callback-trigger').click()");
assert.equal(await evaluate("document.querySelector('#turkluxx-callback').open"),true);
await dismissCallback();
assert.equal(await evaluate("document.querySelector('.turkluxx-call-top').getAttribute('href')"),'https://wa.me/12137322002');
}
if(width===390){await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(r=>writeFile('build/mobile-hero-'+code+'-'+process.argv[2]+'.png',Buffer.from(r.data,'base64')));}
}
}
await writeFile('build/hero-'+process.argv[2]+'.json',JSON.stringify(records,null,2));
console.log(JSON.stringify(records.map(r=>({width:r.width,lang:r.lang,logo:r.logo.width,font:r.tagline.font,headingBottom:r.heading.y+r.heading.height,ctaTop:r.cta.y,margin:r.cta.margin,overflow:r.overflow}))));
}finally{await send('Page.close');ws.close();server.close();}
