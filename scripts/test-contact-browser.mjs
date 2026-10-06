// Local Chrome CDP checks. Start Chrome with --remote-debugging-port=9227.
// node scripts/test-contact-browser.mjs [--dist]
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
    await evaluate('TurkLuxxI18n.ready'); await pause(250);
}
const catalogs = Object.fromEntries(await Promise.all(['en', 'ru', 'es', 'ar', 'tr', 'nl'].map(async code => [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));

try {
for(const width of [1440,390]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<768});
 for(const path of ['/', '/rengi-istanbul.html','/rengi-antalya.html','/meet-our-team.html','/privacy-policy.html','/cookie-policy.html','/terms-and-conditions.html','/disclaimer.html']) {
  for(const code of Object.keys(catalogs)) {
   await navigate(path+'?lang='+code);
   if(width<768) {
    await evaluate('document.querySelector(".turkluxx-mobile-menu-toggle").click();document.querySelector("#turkluxx-mobile-menu a:last-child").click()');
   } else await evaluate(`document.querySelector('[data-home-scroll="contact"]').click()`);
   await until('document.querySelector("#turkluxx-contact").open');
   assert.equal(await evaluate('document.querySelector("#turkluxx-contact-title").textContent'),catalogs[code]['contact.title']);
   assert.equal(await evaluate('document.querySelector("#turkluxx-contact .turkluxx-callback-close").getAttribute("aria-label")'),catalogs[code]['contact.close']);
   if (path === '/' && ['en', 'ar'].includes(code)) {
    await mkdir(resolve(root, 'build/contact'), { recursive: true });
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(root, `build/contact/${code}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
   }
   assert.equal(await evaluate('document.querySelectorAll("#turkluxx-contact input, #turkluxx-contact textarea").length'),3);
   assert.equal(await evaluate('getComputedStyle(document.querySelector("#turkluxx-contact")).direction'),code==='ar'?'rtl':'ltr');
   assert.equal(await evaluate('(()=>{const e=document.querySelector("#turkluxx-contact"),r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1})()'),true);
   assert.equal(await evaluate('document.querySelector(".turkluxx-footer-brand").querySelector("p")===null'),true);
   assert.equal(await evaluate('document.querySelector(".turkluxx-footer-nav").textContent.includes("Karaarslan")'),false);
   assert.equal(await evaluate(`document.querySelector('[data-company-field="address"]').textContent.includes("Beverly Hills, CA 90210")`),true);
   assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-company-field="address"] p')).marginTop`),'0px');
   for(const [name,key] of [['name','requiredName'],['email','requiredEmail'],['message','requiredMessage']]) {
    await evaluate('(()=>{const e=document.querySelector("#contact-'+name+'"); e.value=" "; e.dispatchEvent(new Event("input"))})()');
    assert.equal(await evaluate('document.querySelector("#contact-'+name+'").validationMessage'),catalogs[code]['contact.'+key]);
   }
   await evaluate('(()=>{const e=document.querySelector("#contact-email");e.value="bad";e.dispatchEvent(new Event("input"))})()');
   assert.equal(await evaluate('document.querySelector("#contact-email").validationMessage'),catalogs[code]['contact.invalidEmail']);
   await evaluate('(()=>{for(const [name,value] of Object.entries({name:"Test Visitor",email:"test@example.com",message:"Hello\\nPlease contact me"})){const e=document.querySelector("#contact-"+name);e.value=value;e.dispatchEvent(new Event("input"))}document.querySelector("#turkluxx-contact form").requestSubmit()})()');
   await until('document.querySelector("#turkluxx-contact [role=status]").textContent===TurkLuxxI18n.t("contact.success")');
   assert.equal(payloads.at(-1).language,code);assert.equal(payloads.at(-1).source,'general-contact');
   assert.ok(messages.at(-1).text.includes('Hello\nPlease contact me'));
   if(path==='/' ) {
    failNextLead=true;
    await evaluate('(()=>{for(const [name,value] of Object.entries({name:"Retry Visitor",email:"retry@example.com",message:"Preserve me"})){const e=document.querySelector("#contact-"+name);e.value=value;e.dispatchEvent(new Event("input"))}const f=document.querySelector("#turkluxx-contact form");f.requestSubmit();f.requestSubmit()})()');
    await until('document.querySelector("#turkluxx-contact [role=status]").textContent===TurkLuxxI18n.t("contact.error")');
    assert.equal(await evaluate('document.querySelector("#contact-message").value'),'Preserve me');
    await send('Emulation.setDeviceMetricsOverride',{width,height:320,deviceScaleFactor:1,mobile:width<768});
    assert.equal(await evaluate('(()=>{const e=document.querySelector("#turkluxx-contact");e.scrollTop=e.scrollHeight;const r=e.querySelector("button").getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight})()'),true);
    await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<768});
   }
  }
  console.log(width+' '+path+': all six languages, footer, fields, validation, RTL, viewport and API delivery passed');
 }
}
assert.equal(errors.length,0,JSON.stringify(errors));
} finally {await fetch('http://127.0.0.1:9227/json/close/'+target.id);ws.close();server.close();}
