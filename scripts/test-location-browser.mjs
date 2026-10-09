// Local CDP checks for both reused Location/ROI instances. No form submissions.
// Start Chrome with --remote-debugging-port=9227, then run this script (--source optional).
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const workspace = resolve(import.meta.dirname, '..');
const root = process.argv.includes('--source') ? workspace : resolve(workspace, 'dist');
const origin = 'http://127.0.0.1:8808';
const codes = ['en', 'nl', 'es', 'ru', 'tr', 'ar'];
const catalogs = Object.fromEntries(await Promise.all(codes.map(async code => [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));
const server = http.createServer(async (req, res) => {
    try {
        const pathname = new URL(req.url, origin).pathname;
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) throw Error('Outside public root');
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8808, '127.0.0.1', r));
let ws, target;
const results = [], errors = [];
try {
    target = await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pending = new Map();
    ws.addEventListener('message', event => {
        const m = JSON.parse(event.data);
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
        if (!m.id) return;
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(m.error) : p.resolve(m.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
    });
    const evaluate = async expression => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
    };
    const until = async expression => {
        for (let i = 0; i < 100; i++) {
            if (await evaluate(expression)) return;
            await new Promise(r => setTimeout(r, 50));
        }
        throw Error(`Timeout: ${expression}`);
    };
    const click = async selector => {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
        await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        await new Promise(r=>setTimeout(r,50));
        const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x:x-visualViewport.offsetLeft,y:y-visualViewport.offsetTop,hit:e.contains(document.elementFromPoint(x,y))}})()`);
        assert(point.hit, `Covered button: ${selector}`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    };
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', {cacheDisabled:true});
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager*', '*google-analytics*', '*facebook*', '*maps.google.com*'] });
    await mkdir(resolve(workspace, 'build/location'), { recursive: true });
    for (const [width, height] of (process.argv.includes('--mobile-only') ? [[390,844],[360,640]] : [[1600,900], [1200,700], [1024,768], [768,1024], [390,844], [360,640]])) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
        for (const path of ['/', '/rengi-istanbul.html']) {
            await send('Page.navigate', { url: origin + path + '?lang=en&ref=VLAD' });
            await until(`location.pathname===${JSON.stringify(path)} && document.readyState==='complete' && !!window.TurkLuxxI18n`);
            await evaluate('TurkLuxxI18n.ready');
            for (const code of codes) {
                await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
                await evaluate('document.fonts.ready');
                const layout = await evaluate(`(()=>{
                    const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,b:r.bottom,w:r.width,h:r.height}};
                    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
                    return {duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),overflow:document.documentElement.scrollWidth>innerWidth,dir:document.documentElement.dir,
                        masterRemoved:!document.querySelector('#rengi-master-plan,#rengi-master-fullscreen,.rengi-location-copy'),images:document.querySelectorAll('#rengi-master-image').length,
                        location:box('#rengi-location'),heading:document.querySelector('#rengi-location-title').textContent,plan:box('.rengi-location .rengi-master-media'),map:box('.rengi-map'),landmarks:box('.rengi-landmarks'),roi:box('#rengi-roi'),learn:box('.rengi-roi-learn'),consult:box('.rengi-roi-actions .turkluxx-callback-trigger'),
                        mapSrc:document.querySelector('.rengi-map iframe').src,distances:[...document.querySelectorAll('.rengi-landmarks strong')].map(e=>e.textContent),footerExplore:!!document.querySelector('.turkluxx-footer-nav'),distanceDirection:getComputedStyle(document.querySelector('.rengi-landmarks strong')).direction,
                        order:document.querySelector('.turkluxx-project')?.nextElementSibling.id==='rengi-location' && document.querySelector('#rengi-location').nextElementSibling.id==='rengi-roi'};
                })()`);
                assert.deepEqual(layout.duplicates, []); assert(!layout.overflow, `${path} ${width} ${code}: overflow`);
                assert(layout.masterRemoved); assert.equal(layout.images, 1); assert.equal(layout.heading, catalogs[code]['istanbul.location']);
                assert.equal(layout.distances.length, 9); assert(layout.mapSrc.includes('41.036278')); assert(!layout.footerExplore);
                if (path === '/') assert(layout.order);
                if (code === 'ar') { assert.equal(layout.dir, 'rtl'); assert.equal(layout.distanceDirection, 'ltr'); }
                assert(layout.roi.y >= layout.location.b - 1);
                if (width >= 1200) {
                    assert(layout.plan.right <= layout.map.x && layout.map.right <= layout.landmarks.x);
                } else if (width >= 768) {
                    assert(layout.plan.right <= layout.map.x); assert(layout.landmarks.y >= Math.max(layout.plan.b, layout.map.b));
                } else {
                    assert(layout.map.y >= layout.plan.b); assert(layout.landmarks.y >= layout.map.b); assert(layout.consult.y >= layout.learn.b);
                }
                const overflowBefore = await evaluate('document.body.style.overflow');
                await click('.rengi-master-preview'); await until('document.querySelector("#rengi-plan-lightbox").open && document.querySelector("#rengi-lightbox-image").naturalWidth>0');
                assert.equal(await evaluate('document.querySelector("#rengi-lightbox-title").textContent'), catalogs[code]['istanbul.master_plan_186']);
                assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
                await click('#rengi-plan-zoom-in'); assert.equal(await evaluate('document.querySelector("#rengi-plan-zoom").textContent'), '125%');
                await click('#rengi-plan-zoom-out'); assert.equal(await evaluate('document.querySelector("#rengi-plan-zoom").textContent'), '100%');
                await send('Emulation.setDeviceMetricsOverride', { width, height: height - 20, deviceScaleFactor: 1, mobile: width < 768 });
                await until('document.querySelector("#rengi-lightbox-image").getBoundingClientRect().width>0');
                await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
                await click('#rengi-plan-close'); await until('!document.querySelector("#rengi-plan-lightbox").open'); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
                await until(`document.body.style.overflow===${JSON.stringify(overflowBefore)}`);
                await click('.rengi-master-preview'); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                await until('!document.querySelector("#rengi-plan-lightbox").open'); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
                await click('.rengi-roi-learn'); await until('document.querySelector("#turkluxx-roi")?.open');
                assert.equal(await evaluate('document.querySelectorAll("#turkluxx-roi").length'), 1);
                await click('#turkluxx-roi .turkluxx-callback-close'); await until('!document.querySelector("#turkluxx-roi").open && document.body.style.position!=="fixed"'); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
                await click('.rengi-roi-actions .turkluxx-callback-trigger'); await until('document.querySelector("#turkluxx-callback").open');
                await click('#turkluxx-callback .turkluxx-callback-close'); await until('!document.querySelector("#turkluxx-callback").open && document.body.style.position!=="fixed"'); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
                results.push({ path, width, height, code, ...layout }); console.log(`PASS ${path} ${width}x${height} ${code}`);
                if ((width===1600 && code==='en') || (width===390 && code==='ar')) {
                    for (const section of ['location','roi']) {
                        await evaluate(`document.querySelector('#rengi-${section}').scrollIntoView({behavior:'instant'})`);
                        const shot = await send('Page.captureScreenshot', { format: 'png' });
                        await writeFile(resolve(workspace, `build/location/${path==='/'?'home':'project'}-${section}-${width}-${code}.png`), Buffer.from(shot.data,'base64'));
                    }
                }
            }
        }
    }
    assert.deepEqual(errors, []);
    await writeFile(resolve(workspace, 'build/location/results.json'), JSON.stringify(results,null,2));
} finally {
    ws?.close(); server.closeAllConnections(); server.close();
    if (target) await fetch('http://127.0.0.1:9227/json/close/' + target.id).catch(()=>{});
}
