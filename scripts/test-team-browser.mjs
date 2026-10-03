// Verify the team page and its navigation against dist, or use --source.
// Requires the local Chrome CDP endpoint at port 9227; sends no leads or analytics.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const workspace = resolve(import.meta.dirname, '..');
const root = process.argv.includes('--source') ? workspace : resolve(workspace, 'dist');
const origin = 'http://127.0.0.1:8808';
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
await new Promise(resolve => server.listen(8808, '127.0.0.1', resolve));
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
    const directory = resolve(workspace, 'build/team');
    await mkdir(directory, { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(directory, name + '.png'), Buffer.from(result.data, 'base64'));
};
try {
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com/*', '*google-analytics.com/*', '*connect.facebook.net/*', '*facebook.com/tr*'] });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    const names = ['Ahmad Hussein', 'Almagul Jukenova', 'Muhamed Al Ramah', 'Vladimir Andreev'];
    for (const width of [1440, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
        for (const code of codes) {
            await send('Page.navigate', { url: `${origin}/meet-our-team.html?lang=${code}&ref=VLAD&sub=Team%20check` });
            await until(`document.readyState==='complete' && window.TurkLuxxI18n?.language==='${code}'`);
            await evaluate('TurkLuxxI18n.setLanguage(TurkLuxxI18n.language)');
            await pause(200);
            assert.equal(await evaluate('document.documentElement.dir'), code === 'ar' ? 'rtl' : 'ltr');
            assert.equal(await evaluate('document.title'), catalogs[code]['team.pageTitle']);
            const text = await evaluate(`[...document.querySelectorAll('.team-main [data-i18n]')].map(e=>({key:e.dataset.i18n,text:e.textContent}))`);
            assert.equal(text.length, 29, 'Complete introduction, placeholders and biographies');
            for (const item of text) assert.equal(item.text, catalogs[code][item.key], item.key);
            assert.deepEqual(await evaluate(`[...document.querySelectorAll('.team-biography h2')].map(e=>e.textContent)`), names);
            assert.deepEqual(await evaluate(`[...document.querySelectorAll('.team-portrait')].map(e=>e.getAttribute('aria-label'))`), Array(4).fill(catalogs[code]['team.portrait']));
            assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'No page overflow');
            assert.equal(await evaluate(`/\\bVlad\\b/.test(document.querySelector('[aria-labelledby="team-vlad-name"]').textContent)`), false, 'Use Vladimir throughout the profile');
            const spacing = await evaluate(`(()=>{const section=document.querySelector('[aria-labelledby="team-vlad-name"]'),r=section.getBoundingClientRect(),children=[...section.children].map(e=>e.getBoundingClientRect()),footer=document.querySelector('#rengi-footer').getBoundingClientRect();return {top:Math.min(...children.map(r=>r.top))-r.top,bottom:footer.top-Math.max(...children.map(r=>r.bottom))}})()`);
            assert.ok(Math.abs(spacing.top-spacing.bottom)<=1, 'Symmetrical final profile spacing');
            const geometry = await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width}};return [...document.querySelectorAll('.team-member')].map(e=>({photo:rect(e.querySelector('.team-portrait')),bio:rect(e.querySelector('.team-biography')),font:parseFloat(getComputedStyle(e.querySelector('.team-body')).fontSize)}))})()`);
            for (const [i, member] of geometry.entries()) {
                assert.equal(member.font, 16, 'Body type retains readable size');
                assert.ok(member.photo.x>=0 && member.photo.right<=width);
                assert.ok(member.bio.x>=0 && member.bio.right<=width);
                if (width < 768) assert.ok(member.photo.bottom<=member.bio.y, 'Mobile photo first');
                else {
                    assert.equal(member.photo.y, member.bio.y, 'Editorial columns align');
                    const photoOnLeft = (i%2===0) !== (code==='ar');
                    assert.equal(member.photo.x<member.bio.x, photoOnLeft, 'Alternating RTL-aware desktop composition');
                }
            }
            if (['en', 'ar'].includes(code)) {
                const directory=resolve(workspace,'build/team'); await mkdir(directory,{recursive:true});
                const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:await evaluate('document.documentElement.scrollHeight'),scale:1}});
                await writeFile(resolve(directory,`team-${width}-${code}.png`),Buffer.from(shot.data,'base64'));
            }
            const attribution = await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())');
            const url = await evaluate('location.href');
            await click('.turkluxx-sales-nav .turkluxx-roi-trigger');
            await until(roi+'?.open');
            assert.equal(await evaluate(`${roi}.querySelector('#turkluxx-roi-title').textContent`), catalogs[code]['home.roi.title']);
            assert.equal(await evaluate('document.querySelectorAll("#turkluxx-roi").length'),1);
            assert.equal(await evaluate('dataLayer.filter(e=>e.event==="roi_popup_open").length'),1);
            await click('#turkluxx-roi .turkluxx-callback-close'); await until('!'+roi+'.open'); await pause(200);
            if (width < 768) await click('.turkluxx-mobile-callback-trigger');
            else await evaluate('document.querySelector(".turkluxx-mobile-callback-trigger").click()');
            await until('document.querySelector("#turkluxx-callback").open');
            assert.equal(await evaluate('document.querySelector("#turkluxx-callback-title").textContent'),catalogs[code]['common.let_s_talk']);
            const payload=await evaluate('buildTurkLuxxLeadPayload(document.querySelector("#turkluxx-callback-form"))');
            assert.equal(payload.referral,'VLAD'); assert.equal(payload.page,url); assert.equal(payload.project,null);
            await click('#turkluxx-callback .turkluxx-callback-close');
            await until('!document.querySelector("#turkluxx-callback").open'); await pause(200);
            await click('.rengi-desktop-contact'); await pause(1050);
            assert.equal(await evaluate('location.hash'),'#rengi-footer');
            assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'),attribution);
            // Return link goes to the homepage project choice, never an explorer.
            await evaluate('window.scrollTo({top:0,behavior:"instant"})'); await pause(100);
            const projects='.turkluxx-sales-nav a:first-child';
            assert.equal(await evaluate(`document.querySelector('${projects}').textContent`),catalogs[code]['team.projectsNav']);
            assert.equal(await evaluate(`getComputedStyle(document.querySelector('${projects}')).textTransform`),'none','Navigation retains mixed capitalization');
            await click(projects);
            await until('location.pathname==="/" && location.hash==="#turkluxx-project-heading" && document.readyState==="complete"');
            await evaluate('TurkLuxxI18n.setLanguage(TurkLuxxI18n.language)');
            assert.equal(await evaluate('TurkLuxxI18n.language'),code,'Language persists through navigation');
            assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'),attribution);
            assert.equal(await evaluate('!!document.querySelector("#turkluxx-antalya-heading")'),true,'Both project choices present');
            for (const project of ['rengi-istanbul.html','rengi-antalya.html']) {
                await send('Page.navigate',{url:`${origin}/${project}`});
                await until('document.readyState==="complete" && !!window.TurkLuxxI18n');
                await evaluate('TurkLuxxI18n.setLanguage(TurkLuxxI18n.language)');
                assert.equal(await evaluate(`document.querySelector('.turkluxx-sales-nav a:first-child').textContent`),catalogs[code]['team.nav']);
                await click('.turkluxx-sales-nav a:first-child');
                await until('location.pathname==="/meet-our-team.html" && document.readyState==="complete"');
                await evaluate('TurkLuxxI18n.setLanguage(TurkLuxxI18n.language)');
                assert.equal(await evaluate('TurkLuxxI18n.language'),code);
                assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'),attribution);
            }
            console.log(`${width}px ${code}: full copy, unchanged names, placeholders, layout, RTL, both project links, homepage projects, language/referral persistence, ROI, analytics and callback passed`);
        }
    }
    assert.deepEqual(errors,[],'No JavaScript exceptions or console errors');
    assert.deepEqual(leadRequests,[],'No live lead submissions');
    console.log(`Team checks passed against ${root===workspace?'sources':'production build'}.`);
} catch(error) {
    await screenshot('team-failure'); throw error;
} finally {
    await send('Page.close'); ws.close(); server.close();
}
