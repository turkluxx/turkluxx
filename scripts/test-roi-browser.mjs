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
    const viewport = await evaluate('({x:visualViewport.offsetLeft,y:visualViewport.offsetTop})');
    await clickAt(point.x - viewport.x, point.y - viewport.y);
};
const roi = 'document.querySelector("#turkluxx-roi")';
const screenshot = async name => {
    const directory = resolve(workspace, 'build/i18n');
    await mkdir(directory, { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(directory, name + '.png'), Buffer.from(result.data, 'base64'));
};
try {
    await send('Runtime.enable'); await send('Network.enable');
    // Keep interaction tests from sending events to the live GTM container.
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com/*', '*google-analytics.com/*'] });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 640]]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
        await send('Page.navigate', { url: origin + '/?ref=VLAD&sub=ROI%20check&lang=en' });
        await until('document.readyState === "complete" && !!window.TurkLuxxI18n && !!window.getTurkLuxxReferralAttribution');
        await evaluate('TurkLuxxI18n.ready'); await pause(100);
        const attribution = await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())');
        const trigger = width < 768 ? '.turkluxx-mobile-primary-nav .turkluxx-roi-trigger' : width >= 1200 ? '.turkluxx-home-desktop-nav .turkluxx-roi-trigger' : '.turkluxx-home-narrow-nav .turkluxx-roi-trigger';
        for (const code of codes) {
            await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
            await evaluate('window.scrollTo({top:0,behavior:"instant"})');
            await pause(150);
            const url = await evaluate('location.href');
            const originalStyle = await evaluate('document.body.getAttribute("style") || ""');
            const eventCount = await evaluate('dataLayer.filter(e=>e.event==="roi_popup_open").length');
            await click(trigger);
            await until(roi + '.open'); await pause(200);
            assert.equal(await evaluate('location.href'), url, 'No hash navigation');
            assert.equal(await evaluate('document.body.style.position'), 'fixed');
            assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
            assert.equal(await evaluate('dataLayer.filter(e=>e.event==="roi_popup_open").length'), eventCount + 1);
            assert.equal(await evaluate('document.activeElement.id'), 'turkluxx-roi-title', 'Initial focus');
            const fontSizes = await evaluate(`(()=>{const size=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);return {title:size('#turkluxx-roi-title'),opportunity:size('#turkluxx-roi-opportunity-title'),roi:size('.turkluxx-roi-return')}})()`);
            assert.equal(fontSizes.opportunity, fontSizes.title, 'ROI headings have identical font sizes');
            assert.ok(Math.abs(fontSizes.roi - Math.min(32, Math.max(22, width * .03)) / 1.5) < .01, 'Potential ROI font reduced by 1.5');
            const content = await evaluate(`${roi}.querySelectorAll('[data-i18n]') && [...${roi}.querySelectorAll('[data-i18n]')].map(e=>({key:e.dataset.i18n,text:e.textContent.replace(/[\u2066-\u2069]/g,'')}))`);
            assert.equal(content.filter(item => item.key.startsWith('home.roi.')).length, 14);
            for (const item of content) assert.equal(item.text, catalogs[code][item.key], code + ': ' + item.key);
            assert.equal(await evaluate(`getComputedStyle(${roi}).direction`), code === 'ar' ? 'rtl' : 'ltr');
            const bounds = await evaluate(`(()=>{const d=${roi},r=d.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:d.scrollHeight> d.clientHeight,overflow:d.scrollWidth>d.clientWidth}})()`);
            assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.width < width && bounds.height <= height * (width < 768 ? .9 : .85) + 1);
            assert.ok(bounds.scroll, 'Internal vertical scrolling'); assert.equal(bounds.overflow, false, 'No horizontal overflow');
            if (width >= 1200) assert.equal(Math.round(bounds.width), 960);
            if (width < 768) assert.equal(Math.round(bounds.width), width - 24);
            if (['en', 'ar'].includes(code) && [1440, 390].includes(width)) await screenshot(`roi-${width}-${code}`);
            for (let n = 0; n < 4; n++) {
                await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
                await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
                // Native dialog focus may cycle through browser chrome (activeElement=body),
                // but must never reach a background link or form control.
                assert.equal(await evaluate(`${roi}.contains(document.activeElement) || document.activeElement === document.body`), true, 'Background controls remain inert');
            }
            await evaluate(`${roi}.scrollTop=${roi}.scrollHeight`);
            if (code === 'en' && [1440, 390].includes(width)) await screenshot(`roi-${width}-closing`);
            assert.equal(await evaluate(`(()=>{const r=${roi}.querySelector('.turkluxx-callback-close').getBoundingClientRect();return r.y>=0 && r.bottom<=innerHeight})()`), true, 'Close remains reachable after scrolling');
            await click('#turkluxx-roi .turkluxx-callback-close');
            await until('!' + roi + '.open'); await pause(20);
            assert.equal(await evaluate('document.body.getAttribute("style") || ""'), originalStyle);
            assert.equal(await evaluate(`document.activeElement === document.querySelector('${trigger}')`), true, 'Focus restored');
            assert.equal(await evaluate('scrollY'), 0, 'Scroll restored without navigation');
            // Reopening from a scrolled page must not jump the page or retain modal scroll.
            await evaluate('window.scrollTo({top:500,behavior:"instant"})');
            const pageScroll = await evaluate('scrollY');
            await evaluate(`document.querySelector('${trigger}').click()`);
            await until(roi + '.open'); await pause(200);
            assert.equal(await evaluate(roi + '.scrollTop'), 0);
            const lockedTop = await evaluate('document.body.style.top');
            await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 2, y: height / 2, deltaX: 0, deltaY: 300 });
            assert.equal(await evaluate('document.body.style.top'), lockedTop);
            await clickAt(2, height / 2);
            await until('!' + roi + '.open'); await pause(20);
            assert.equal(await evaluate('scrollY'), pageScroll, 'Backdrop restores scroll');
            await evaluate(`document.querySelector('${trigger}').click()`);
            await until(roi + '.open'); await pause(200);
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await until('!' + roi + '.open'); await pause(20);
            assert.equal(await evaluate('scrollY'), pageScroll, 'Escape restores scroll');
            assert.equal(await evaluate('document.body.getAttribute("style") || ""'), originalStyle);
            assert.equal(await evaluate('location.href'), url);
            assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'), attribution);
            // The separate callback flow still opens, validates and dismisses normally.
            await evaluate('document.querySelector(".turkluxx-callback-trigger").click()');
            await until('document.querySelector("#turkluxx-callback").open');
            assert.equal(await evaluate(roi + '.open'), false);
            assert.equal(await evaluate('document.body.style.position'), 'fixed');
            const payload = await evaluate('buildTurkLuxxLeadPayload(document.querySelector("#turkluxx-callback-form"))');
            assert.equal(payload.referral, 'VLAD'); assert.equal(payload.project, null); assert.equal(payload.property, null);
            assert.equal(await evaluate('document.querySelector("#turkluxx-callback-title").textContent'), catalogs[code]['common.let_s_talk']);
            await evaluate('document.querySelector("#turkluxx-callback .turkluxx-callback-close").click()');
            await until('!document.querySelector("#turkluxx-callback").open'); await pause(20);
            assert.equal(await evaluate('document.body.getAttribute("style") || ""'), originalStyle);
            assert.equal(await evaluate('scrollY'), pageScroll);
            console.log(`${width}px ${code}: trigger, copy, RTL, focus, X/backdrop/Escape, scroll lock/restoration, reopening, analytics, callback and referral passed`);
        }
    }
    for (const page of ['rengi-istanbul.html', 'rengi-antalya.html']) {
        for (const width of [1440, 390]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
            await send('Page.navigate', { url: `${origin}/${page}?lang=en` });
            await until('document.readyState === "complete" && !!window.TurkLuxxI18n');
            await evaluate('TurkLuxxI18n.ready');
            for (const code of codes) {
                await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
                assert.equal(await evaluate('document.querySelector(".rengi-roi-learn [data-i18n]").textContent'), catalogs[code]['home.learn_more']);
                const buttons = await evaluate(`(()=>{const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,width:r.width,background:getComputedStyle(e).backgroundColor}};return {learn:box('.rengi-roi-learn'),consult:box('.rengi-roi-actions .turkluxx-callback-trigger'),note:box('.rengi-roi-note')}})()`);
                assert.equal(buttons.learn.background, buttons.consult.background, 'Matching button backgrounds');
                assert.ok(buttons.note.y >= Math.max(buttons.learn.bottom, buttons.consult.bottom), 'Disclaimer below both buttons');
                if (width >= 768) {
                    assert.equal(buttons.learn.y, buttons.consult.y, 'Buttons aligned in one row');
                    assert.equal(buttons.learn.height, buttons.consult.height, 'Equal button heights');
                    assert.ok(buttons.learn.right < buttons.consult.x, 'Learn More on the left');
                } else assert.ok(buttons.learn.bottom < buttons.consult.y, 'Mobile buttons stack');
                for (const trigger of [width < 768 ? '.turkluxx-mobile-primary-nav .turkluxx-roi-trigger' : '.turkluxx-sales-nav .turkluxx-roi-trigger', '.rengi-roi-learn']) {
                    await evaluate(`document.querySelector('${trigger}').scrollIntoView({block:'center',behavior:'instant'})`);
                    await pause(150);
                    await click(trigger);
                    await until(roi + '?.open');
                    assert.equal(await evaluate('document.querySelectorAll("#turkluxx-roi").length'), 1, 'One shared ROI dialog');
                    if (!await evaluate('!!window.roiTestInstance')) await evaluate(`window.roiTestInstance=${roi}`);
                    assert.equal(await evaluate(`window.roiTestInstance===${roi}`), true, 'Both triggers reuse the same instance');
                    assert.equal(await evaluate(`${roi}.querySelector('#turkluxx-roi-title').textContent`), catalogs[code]['home.roi.title']);
                    const sizes = await evaluate(`['#turkluxx-roi-title','#turkluxx-roi-opportunity-title'].map(s=>getComputedStyle(document.querySelector(s)).fontSize)`);
                    assert.equal(sizes[0], sizes[1]);
                    await click('#turkluxx-roi .turkluxx-callback-close');
                    await until('!' + roi + '.open');
                    await pause(200);
                    assert.equal(await evaluate(`document.activeElement===document.querySelector('${trigger}')`), true);
                }
                await evaluate('document.querySelector(".rengi-roi-actions .turkluxx-callback-trigger").click()');
                await until('document.querySelector("#turkluxx-callback").open');
                assert.equal(await evaluate(roi + '.open'), false);
                await evaluate('document.querySelector("#turkluxx-callback .turkluxx-callback-close").click()');
                await until('!document.querySelector("#turkluxx-callback").open');
                await pause(200);
                console.log(`${page} ${width}px ${code}: both triggers reuse ROI, translated CTA, matching headings and consultation passed`);
            }
        }
    }
    assert.deepEqual(errors, [], 'No JavaScript console errors or exceptions');
    assert.deepEqual(leadRequests, [], 'No lead submissions');
    console.log(`ROI checks passed against ${root === workspace ? 'development sources' : 'production build'}.`);
} catch (error) {
    await screenshot('roi-failure');
    throw error;
} finally {
    await send('Page.close'); ws.close(); server.close();
}
