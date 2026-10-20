// Compare real browser rendering of development sources and generated dist.
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
    await send('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'no-preference'}] });
    await send('Page.addScriptToEvaluateOnNewDocument', {source: "history.scrollRestoration = 'manual';"});
    for (const width of [1440, 1024, 768, 390, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const language of ['en', 'ru', 'es', 'ar', 'tr', 'nl']) {
            await load(language);
            const result = await evaluate(`(() => {
                const section = document.querySelector('.turkluxx-statistics');
                const cards = [...section.querySelectorAll('article')];
                const grid = section.firstElementChild;
                return { previous: section.previousElementSibling.className, next: section.nextElementSibling.className,
                    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
                    overflow: cards.some(c => c.scrollWidth > c.clientWidth || c.scrollHeight > c.clientHeight),
                    heights: cards.map(c => c.getBoundingClientRect().height),
                    numbersLTR: [...section.querySelectorAll('[data-count]')].every(c => getComputedStyle(c).direction === 'ltr'),
                    translated: [...section.querySelectorAll('[data-i18n]')].every(e => e.textContent === TurkLuxxI18n.t(e.dataset.i18n)),
                    direction: getComputedStyle(grid).direction };
            })()`);
            assert.equal(result.previous, 'turkluxx-developer');
            assert.equal(result.next, 'turkluxx-project');
            assert.equal(result.columns, width >= 1024 ? 4 : 2);
            assert.equal(result.overflow, false, JSON.stringify({width,language,result}));
            assert.ok(Math.max(...result.heights) - Math.min(...result.heights) < 1);
            assert.ok(result.numbersLTR && result.translated);
            assert.equal(result.direction, language === 'ar' ? 'rtl' : 'ltr');
        }
    }
    for (const port of [8803, 8804]) {
    for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await load('en', port);
    await evaluate(`scrollTo({top:0,behavior:'instant'})`);
    assert.deepEqual(await values(), ['0+', '0+']);
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').dataset.statisticsState`), 'ready');
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getBoundingClientRect().top > innerHeight`), true);
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getAnimations({subtree:true}).length`), 0);
    await evaluate(`document.querySelector('.turkluxx-statistics').scrollIntoView({block:'center',behavior:'instant'})`);
    await pause(100);
    const entrance = await evaluate(`(() => {
        const cards = [...document.querySelectorAll('.turkluxx-statistics-card')];
        const bar = document.querySelector('.turkluxx-statistics-grid');
        return {count: bar.getAnimations().length,
            opacity: Number(getComputedStyle(bar).opacity),
            connected: getComputedStyle(bar).gap === '0px' && cards.every(c => getComputedStyle(c).backgroundColor === 'rgba(0, 0, 0, 0)'),
            navy: getComputedStyle(bar).backgroundColor === getComputedStyle(document.querySelector('.turkluxx-team-cta')).backgroundColor,
            white: cards.every(c => getComputedStyle(c).color === 'rgb(255, 255, 255)'),
            sans: cards.every(c => getComputedStyle(c.querySelector('p')).fontFamily.includes('Manrope'))};
    })()`);
    assert.equal(entrance.count, 1);
    assert.ok(entrance.opacity < 1);
    assert.ok(entrance.connected && entrance.navy && entrance.white && entrance.sans);
    await pause(300);
    const mid = await values();
    assert.ok(Number(mid[0].replace(/\D/g,'')) > 0 && Number(mid[0].replace(/\D/g,'')) < 27);
    assert.ok(Number(mid[1].replace(/\D/g,'')) < 10000);
    await pause(2200);
    assert.deepEqual(await values(), ['27+', '10,000+']);
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getAnimations({subtree:true}).length`), 0);
    await evaluate(`scrollTo({top:0,behavior:'instant'})`); await pause(100);
    await evaluate(`document.querySelector('.turkluxx-statistics').scrollIntoView({block:'center',behavior:'instant'})`);
    await pause(200);
    assert.deepEqual(await values(), ['27+', '10,000+']);
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getAnimations({subtree:true}).length`), 0);
    }
    }
    // Restore a landing position at the cards as the document becomes ready.
    await send('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const probe = await send('Page.addScriptToEvaluateOnNewDocument', {source: `
        window.statisticsSamples = [];
        document.addEventListener('DOMContentLoaded', () => {
            const counter = document.querySelector('[data-count="10000"]');
            new MutationObserver(() => statisticsSamples.push(counter.textContent))
                .observe(counter, {childList:true,subtree:true,characterData:true});
            document.querySelector('.turkluxx-statistics').scrollIntoView({block:'center',behavior:'instant'});
        });
    `});
    await load('en');
    await pause(2700);
    assert.equal(await evaluate(`statisticsSamples.includes('0+') && statisticsSamples.some(value => { const n=Number(value.replace(/\\D/g,'')); return n>0 && n<10000; })`), true);
    assert.deepEqual(await values(), ['27+', '10,000+']);
    await send('Page.removeScriptToEvaluateOnNewDocument', {identifier:probe.identifier});
    await send('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
    await load('ar');
    await evaluate(`document.querySelector('.turkluxx-statistics').scrollIntoView({block:'center',behavior:'instant'})`);
    await pause(200);
    assert.deepEqual(await values(), ['27+', '10,000+']);
    assert.equal(await evaluate(`document.querySelector('.turkluxx-statistics').getAnimations({subtree:true}).length`), 0);
    await send('Emulation.setScriptExecutionDisabled', {value:true});
    await send('Page.navigate', {url:'http://127.0.0.1:8804/'}); await pause(500);
    assert.deepEqual(await values(), ['27+', '10,000+']);
    console.log('PASS: 30 viewport/language combinations; source and production desktop/mobile scroll reveal and intermediate counter values; unified surface, placement, columns, overflow, equal heights, translations, RTL, initial landing, once-only, reduced motion and no JavaScript.');
} finally {
    await send('Emulation.setScriptExecutionDisabled', {value:false});
    await send('Page.close'); socket.close();
    for (const server of servers) server.close();
}
