// Run against dist by default, or use --source for the development homepage.
// Requires the local Chrome CDP endpoint at port 9227; sends no leads or analytics.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const workspace = resolve(import.meta.dirname, '..');
const root = process.argv.includes('--source') ? workspace : resolve(workspace, 'dist');
const origin = 'http://127.0.0.1:8807';
const codes = ['en', 'ru', 'es', 'ar', 'tr', 'nl'];
const catalogs = Object.fromEntries(await Promise.all(codes.map(async code =>
    [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));
const server = http.createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, origin).pathname;
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) throw Error('Outside public directory');
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(file)] || 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(8807, '127.0.0.1', resolve));
const target = await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map(), errors = [], leadRequests = [];
ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params);
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/api/lead')) leadRequests.push(message.params.request.url);
    if (!message.id) return;
    const task = pending.get(message.id); pending.delete(message.id);
    message.error ? task.reject(message.error) : task.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id; pending.set(callId, { resolve, reject }); ws.send(JSON.stringify({ id: callId, method, params }));
});
const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async expression => {
    for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await pause(50); }
    throw Error('Timeout: ' + expression);
};
const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const click = async selector => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const hit = await evaluate(`document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,200)`);
    if (!await evaluate(`document.querySelector(${JSON.stringify(selector)}).contains(document.elementFromPoint(${point.x},${point.y}))`)) console.log('Click covered:', selector, point, hit);
    await clickAt(point.x, point.y);
};
const roi = 'document.querySelector("#turkluxx-roi")';
const screenshot = async name => {
    const directory = resolve(workspace, 'build/i18n/citizenship');
    await mkdir(directory, { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(directory, name + '.png'), Buffer.from(result.data, 'base64'));
};
try {
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com/*', '*google-analytics.com/*'] });
    for (const [width, height] of [[1440, 900], [390, 844], [320, 640]]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
        await send('Page.navigate', { url: origin + '/?lang=en' });
        await until('document.readyState === "complete" && !!window.TurkLuxxI18n');
        await evaluate('TurkLuxxI18n.ready');
        await evaluate('window.__originalFetch=window.fetch');
        for (const code of codes) {
            await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
            await evaluate(`document.querySelector('[aria-controls="turkluxx-citizenship-info"]').click()`);
            await until('document.querySelector("#turkluxx-citizenship-info").open'); await pause(200);
            const state = await evaluate(`(()=>{
                const d=document.querySelector('#turkluxx-citizenship-info'),r=d.getBoundingClientRect();
                return { text:d.innerText, points:d.querySelectorAll('dl,dt,dd').length,
                    direction:getComputedStyle(d).direction, x:r.x,y:r.y,width:r.width,height:r.height,
                    overflow:d.scrollWidth>d.clientWidth,
                    emphasis:[...d.querySelectorAll('.turkluxx-info-intro strong')].map(e=>({text:e.textContent,weight:parseInt(getComputedStyle(e).fontWeight)})),
                    introWeight:parseInt(getComputedStyle(d.querySelector('.turkluxx-info-intro')).fontWeight),
                    disclaimer:d.querySelector('.turkluxx-info-note').textContent,
                    translations:[...d.querySelectorAll('[data-i18n]')].map(e=>({key:e.dataset.i18n,text:e.textContent})),
                    source:{href:d.querySelector('a').href,target:d.querySelector('a').target},
                    focused:document.activeElement.id };
            })()`);
            assert.equal(state.points,0);
            assert.ok(!/400[,.]000|USD|3 YEARS|three years|spouse|children|OFFICIAL PROCEDURE/i.test(state.text));
            assert.equal(state.translations.length,6);
            assert.equal(state.emphasis.length,1,'Only the possibility phrase is emphasized');
            assert.equal(state.emphasis[0].text,catalogs[code]['home.citizenship_pathway_emphasis']);
            assert.ok(state.emphasis[0].weight>state.introWeight,'Phrase is visually bold');
            assert.ok(state.emphasis[0].text.endsWith('*'));
            assert.ok(state.disclaimer.startsWith('*'),'Matching disclaimer marker');
            for (const item of state.translations) assert.equal(item.text,catalogs[code][item.key],code+': '+item.key);
            assert.equal(state.direction,code==='ar'?'rtl':'ltr');
            assert.equal(state.source.href,'https://f.invest.gov.tr/en/investmentguide/pages/acquiring-property-and-citizenship.aspx');
            assert.equal(state.source.target,'_blank');
            assert.equal(state.focused,'turkluxx-citizenship-info-title');
            assert.ok(state.x>=0 && state.y>=0 && state.width<width && state.height<=height);
            assert.equal(state.overflow,false);
            if(width===1440) assert.ok(state.height<650,'Compact desktop card');
            await screenshot(`citizenship-${width}-${code}`);
            await click('#turkluxx-citizenship-info .turkluxx-callback-trigger');
            await until('document.querySelector("#turkluxx-callback").open');
            assert.equal(await evaluate('document.querySelector("#turkluxx-citizenship-info").open'),false);
            // Capture the actual submission locally; no request reaches the live service.
            await evaluate(`window.__citizenshipPayload=null;window.fetch=async(url,options)=>{
                if(url==='/api/lead'){window.__citizenshipPayload=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})};}
                throw Error('Unexpected request');
            };`);
            await evaluate(`(()=>{const f=document.querySelector('#turkluxx-callback-form');
                f.elements.name.value='Popup check';f.elements.phone.value='+31000000000';f.elements.email.value='popup@example.com';for(const input of f.querySelectorAll('input')) input.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();})()`);
            await until('!!window.__citizenshipPayload');
            const payload=await evaluate('window.__citizenshipPayload');
            assert.equal(payload.property,'Turkish Citizenship Through Real Estate Investment');
            assert.equal(payload.email,'popup@example.com');
            await evaluate(`document.querySelector('#turkluxx-callback .turkluxx-callback-close').click()`);
            await until('!document.querySelector("#turkluxx-callback").open');
            // Restore fetch before the next language catalog is loaded.
            await evaluate('window.fetch=window.__originalFetch');
            console.log(`${width}px ${code}: content, RTL, geometry, shared form and lead context passed (${Math.round(state.height)}px high)`);
        }
    }
    assert.equal(leadRequests.length,0,'No real leads sent');
    assert.equal(errors.length,0,'No runtime errors');
} finally {
    await fetch(`http://127.0.0.1:9227/json/close/${target.id}`);
    ws.close();server.close();
}

