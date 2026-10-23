// Local Chrome CDP checks. Start Chrome with --remote-debugging-port=9227.
// node scripts/test-sms-browser.mjs [--dist]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = process.argv.includes('--dist') ? resolve(root, 'dist') : root;
const port = Number(process.env.TURKLUXX_I18N_PORT || 8799);
const base = `http://127.0.0.1:${port}`;
const messages = [], payloads = [];
const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/api/lead') {
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
    await evaluate(`TurkLuxxI18n.ready`); await pause(250);
}
const catalogs = Object.fromEntries(await Promise.all(['en', 'ru', 'es', 'ar', 'tr', 'nl'].map(async code => [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));

try {
 let submissions = 0;
 for (const width of [1440, 390]) {
  await send('Emulation.setDeviceMetricsOverride', {width,height:700,deviceScaleFactor:1,mobile:width<768});
  for (const code of Object.keys(catalogs)) {
   await navigate('/?lang='+code);
   for (const selector of ['#turkluxx-callback', '#turkluxx-contact']) {
    await evaluate(selector === '#turkluxx-contact' ? "document.querySelector('[data-home-scroll=contact]').click()" : "document.querySelector('.turkluxx-callback-trigger').click()");
    await until('document.querySelector('+JSON.stringify(selector)+').open');
    const inspect = await evaluate(`(() => { const d=document.querySelector(${JSON.stringify(selector)}); return { controls: [...d.querySelectorAll('[type=checkbox]')].map(c=>({checked:c.checked,required:c.required,label:c.closest('label').innerText})), dir:getComputedStyle(d).direction, links:[...d.querySelectorAll('.turkluxx-sms-consent a')].map(a=>a.getAttribute('href')) }; })()`);
    assert.equal(inspect.controls.length,2);
    inspect.controls.forEach(c=>{assert.equal(c.checked,false);assert.equal(c.required,false);});
    assert.equal(inspect.controls[0].label,catalogs[code]['sms.informational']);
    assert.equal(inspect.controls[1].label,catalogs[code]['sms.marketing']);
    assert.equal(inspect.dir,code==='ar'?'rtl':'ltr');
    assert.deepEqual(inspect.links,['privacy-policy.html','terms-and-conditions.html']);
    for(const info of [false,true]) for(const marketing of [false,true]) {
     const before=messages.length;
     await evaluate(`(() => { const f=document.querySelector(${JSON.stringify(selector)}).querySelector('form'); f.elements.name.value='SMS Test'; f.elements.email.value='sms@example.com'; if(f.elements.phone) f.elements.phone.value='+1 949 555 1234'; if(f.elements.message) f.elements.message.value='Consent test message'; f.elements.smsInformationalConsent.checked=${info}; f.elements.smsMarketingConsent.checked=${marketing}; [...f.querySelectorAll("input, textarea")].forEach(c=>c.dispatchEvent(new Event("input",{bubbles:true}))); f.requestSubmit(); })()`);
     for(let i=0;i<100 && messages.length===before;i++) await pause(30);
     assert.equal(messages.length,before+1, JSON.stringify({selector,code,info,marketing,errors,payloads}));
     await until(`!document.querySelector(${JSON.stringify(selector)}).querySelector('[type=submit]').disabled`);
     const payload=payloads.at(-1), email=messages.at(-1);
     assert.equal(payload.smsInformationalConsent,info); assert.equal(payload.smsMarketingConsent,marketing);
     assert.ok(email.text.includes('Informational / Transactional SMS: '+(info?'YES':'NO')));
     assert.ok(email.text.includes('Promotional / Marketing SMS: '+(marketing?'YES':'NO')));
     assert.ok(email.text.includes('SMS Test')); assert.ok(email.text.includes('sms@example.com'));
     assert.ok(email.text.includes(selector.includes('callback')?'+1 949 555 1234':'Consent test message'));
     submissions++;
    }
    // Native keyboard toggling stays independent; focus scrolls controls into view.
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('[name=smsInformationalConsent]').focus()`);
    const checked=await evaluate(`document.activeElement.checked`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate(`document.activeElement.checked`),!checked);
    assert.equal(await evaluate(`(() => {const d=document.querySelector(${JSON.stringify(selector)});const b=d.querySelector('[type=submit]');b.focus();b.scrollIntoView({block:'end'});const r=b.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && d.scrollWidth<=d.clientWidth+1;})()`),true);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('.turkluxx-callback-close').click()`);
    await until('!document.querySelector('+JSON.stringify(selector)+').open');
   }
  }
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS: '+submissions+' submissions; both forms, all six languages, desktop/mobile, independent keyboard toggling, RTL and visible Submit. Email binding mocked; no live email sent.');
} finally {
 ws.close(); server.closeAllConnections(); server.close();
 await fetch('http://127.0.0.1:9227/json/close/'+target.id).catch(()=>{});
}
