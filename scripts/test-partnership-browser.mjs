// Verify the copper/navy partnership in the production build at six widths and six locales.
// Requires Chrome's existing CDP endpoint at port 9227.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const servers = [];
for (const [directory, port] of [[root, 8803], [resolve(root, 'dist'), 8804]]) {
    const server = http.createServer(async (request, response) => {
        try {
            const pathname = new URL(request.url, 'http://localhost').pathname;
            const path = resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
            if (!path.startsWith(directory + sep)) throw Error('Outside public directory');
            const data = await readFile(path);
            response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(path)] || 'application/octet-stream');
            response.end(data);
        } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    servers.push(server);
}
const target = await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' }).then(response => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map(), failures = new Set(), externalFailures = new Set(), requests = new Map();
socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
        const task = pending.get(message.id); pending.delete(message.id);
        message.error ? task.reject(message.error) : task.resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent') requests.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
        const url = message.params.response.url;
        if (url.includes(':8804/') && !url.endsWith('/favicon.ico')) failures.add(url);
    }
    if (message.method === 'Network.loadingFailed') {
        const url = requests.get(message.params.requestId);
        if (url?.includes('fonts.gstatic.com') || url?.includes('fonts.googleapis.com') || message.params.corsErrorStatus) failures.add(`${url}: ${message.params.errorText}`);
        else if (url && !url.includes('127.0.0.1')) externalFailures.add(`${url.split('?')[0]}: ${message.params.errorText}`);
    }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const values = () => evaluate(`Array.from(document.querySelectorAll('.turkluxx-statistics-counter'), e => e.textContent)`);
async function load(language, port = 8804) {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/?lang=${language}` });
    for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.readyState === 'complete' && window.TurkLuxxI18n?.language === '${language}'`)) break;
        await pause(50);
    }
    await evaluate(`TurkLuxxI18n.ready`);
}
try {
    await send('Page.enable');
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await send('Page.addScriptToEvaluateOnNewDocument', {source: "history.scrollRestoration = 'manual';"});
    for (const width of (process.argv.includes('--counters-only') ? [] : [1920, 1440, 1024, 768, 390, 320])) {
      await send('Emulation.setDeviceMetricsOverride', {width, height:900, deviceScaleFactor:1, mobile:false});
      for (const language of ['en','nl','es','ru','tr','ar']) {
        await load(language);
        await evaluate(`document.querySelector('.turkluxx-statistics-grid').scrollIntoView({block:'start',behavior:'instant'})`); await pause(200);
        await evaluate(`Promise.all([...document.querySelectorAll('.turkluxx-partnership-brand img')].map(img=>{img.loading='eager';return img.decode()}))`);
        const result = await evaluate(`(() => {
          const s=document.querySelector('.turkluxx-statistics'), cards=[...s.querySelectorAll('article')], brands=[...s.querySelectorAll('.turkluxx-partnership-brand')];
          return { translated:[...s.querySelectorAll('[data-i18n]')].every(e=>e.textContent===TurkLuxxI18n.t(e.dataset.i18n)),
            count:cards.length, overflow:s.scrollWidth>s.clientWidth || cards.some(c=>c.scrollWidth>c.clientWidth || c.scrollHeight>c.clientHeight),
            logos:brands.every(b=>b.querySelector('.turkluxx-partnership-wordmark') || (b.querySelector('img').complete && b.querySelector('img').naturalWidth>0)),
            positions:cards.map(c=>({x:c.getBoundingClientRect().x,y:c.getBoundingClientRect().y})),
            wordmark:s.querySelector('.turkluxx-partnership-wordmark')?.textContent, motifs:s.querySelectorAll('svg.turkluxx-statistics-motif').length,
            intro:s.querySelector('h2').textContent,
            rtl:cards.every(c=>getComputedStyle(c).direction===('${language}'==='ar'?'rtl':'ltr'))};
        })()`);
        assert.equal(result.translated,true); assert.equal(result.count,4); assert.equal(result.overflow,false); assert.equal(result.logos,true); assert.equal(result.rtl,true);
        assert.ok(!result.intro.includes('?')); assert.equal(result.wordmark,'TurkLuxxExclusive'); assert.equal(result.motifs,5);
        if(width>=1024) { assert.ok(result.positions.every(p=>p.y===result.positions[0].y)); assert.ok(result.positions.every((p,i)=>i===0 || p.x>result.positions[i-1].x)); }
        else if(width>=600) { assert.ok(result.positions[0].x<result.positions[1].x); assert.equal(result.positions[0].y,result.positions[1].y); assert.equal(result.positions[2].y,result.positions[3].y); }
        else { assert.ok(result.positions[0].y<result.positions[2].y && result.positions[2].y<result.positions[1].y && result.positions[1].y<result.positions[3].y); }
        for(const selector of ['[data-count="27"]','[data-count="10000"]']) {
          await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center',behavior:'instant'})`);
          await pause(20);
        }
        assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-count]'),e=>e.dataset.count)`),['27','10000']);
        if ((width===1920 || width===1440 || width===390) && (language==='en' || language==='ar')) {
          await evaluate(`document.querySelector('.turkluxx-statistics').scrollIntoView({block:'start',behavior:'instant'})`);
          await pause(2400);
          const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:await evaluate(`(()=>{const r=document.querySelector('.turkluxx-statistics').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`)});
          const {mkdir,writeFile}=await import('node:fs/promises'); await mkdir(resolve(root,'build/partnership'),{recursive:true}); await writeFile(resolve(root,`build/partnership/${language}-${width}.png`),Buffer.from(shot.data,'base64'));
        }
      }
    }
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await load('en');
    assert.deepEqual(await values(),['0+','0+']);
    await evaluate(`document.querySelector('[data-count="27"]').scrollIntoView({block:'center',behavior:'instant'})`); await pause(350);
    const mid=await values(); assert.ok(Number(mid[0].replace(/\D/g,''))>0 && Number(mid[0].replace(/\D/g,''))<27);
    await pause(2200); assert.deepEqual(await values(),['27+','10,000+']);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});
    await load('en');
    for (const selector of ['[data-count="27"]','[data-count="10000"]']) {
      await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'end',behavior:'instant'})`); await pause(350);
      const mid=await evaluate(`document.querySelector('${selector}').textContent`); assert.ok(Number(mid.replace(/\D/g,''))>0);
      await pause(2200);
    }
    assert.deepEqual(await values(),['27+','10,000+']);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}); await load('ar');
    assert.deepEqual(await values(),['0+','0+']);
    for (const selector of ['[data-count="27"]','[data-count="10000"]']) {
      await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'end',behavior:'instant'})`); await pause(350);
      const mid=await evaluate(`document.querySelector('${selector}').textContent`);
      assert.ok(Number(mid.replace(/\D/g,''))>0 && Number(mid.replace(/\D/g,''))<Number(selector.includes('10000')?10000:27));
      assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getAnimations({subtree:true}).length`),0); await pause(2200);
    }
    assert.deepEqual(await values(),['27+','10,000+']);
    await evaluate(`scrollTo({top:0,behavior:'instant'})`);
    await evaluate(`document.querySelector('.turkluxx-statistics').scrollIntoView({block:'end',behavior:'instant'})`); await pause(200);
    assert.deepEqual(await values(),['27+','10,000+']);
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getAnimations({subtree:true}).length`),0);
    await send('Emulation.setScriptExecutionDisabled',{value:true}); await send('Page.navigate',{url:'http://127.0.0.1:8804/'}); await pause(500); assert.deepEqual(await values(),['27+','10,000+']);
    console.log(process.argv.includes('--counters-only') ? 'PASS: desktop/mobile counters, intermediate/final values, once-only, reduced motion and no-JS.' : 'PASS: 36 desktop/mobile and language combinations; translations, RTL associations, four framed cards, logos, no section overflow, animated intermediate/final counts, reduced motion and no-JS. Screenshots: build/partnership.');
} finally {
 await send('Emulation.setScriptExecutionDisabled',{value:false}); await send('Page.close'); socket.close(); for(const server of servers) server.close();
}
