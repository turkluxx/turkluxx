// Compare real browser rendering of development sources and generated dist.
// Requires Chrome's existing CDP endpoint at port 9227.
import http from 'node:http';
import { writeFileSync } from 'node:fs';
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
const scriptEvents = [];
socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Debugger.scriptParsed' && /homepage-statistics|rengi-home\.min/.test(message.params.url)) {
        scriptEvents.push(message.params.url);
    }
});
try {
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Debugger.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `
        history.scrollRestoration = 'manual';
        window.statisticsTrace = { intersections: [], updates: [] };
        const NativeObserver = window.IntersectionObserver;
        window.IntersectionObserver = class extends NativeObserver {
            constructor(callback, options) {
                super((entries, observer) => {
                    for (const entry of entries) if (entry.target.matches('.turkluxx-statistics-card')) {
                        statisticsTrace.intersections.push({visible:entry.isIntersecting,ratio:entry.intersectionRatio,scrollY,time:performance.now()});
                    }
                    callback(entries, observer);
                }, options);
            }
        };
        new MutationObserver(records => {
            for (const record of records) {
                const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
                if (element?.matches('[data-count]')) statisticsTrace.updates.push({target:element.dataset.count,value:element.textContent,time:performance.now()});
            }
        }).observe(document, {subtree:true,childList:true,characterData:true});
    `});
    for (const port of [8803,8804]) {
        await send('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
        await send('Page.navigate', {url:`http://127.0.0.1:${port}/?lang=en`});
        for (let i=0;i<100;i++) {
            if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('.turkluxx-statistics')?.dataset.statisticsState`)) break;
            await pause(50);
        }
        const before = await evaluate(`({motion:matchMedia('(prefers-reduced-motion: reduce)').matches,state:document.querySelector('.turkluxx-statistics').dataset.statisticsState,values:[...document.querySelectorAll('[data-count]')].map(e=>e.textContent),visibility:getComputedStyle(document.documentElement).visibility})`);
        await evaluate(`document.querySelector('.turkluxx-statistics').scrollIntoView({block:'center',behavior:'instant'})`);
        await pause(650);
        const intermediate = await evaluate(`[...document.querySelectorAll('[data-count]')].map(e=>e.textContent)`);
        if (port === 8804) {
            const clip = await evaluate(`(() => {const r=document.querySelector('.turkluxx-statistics').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
            const screenshot = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
            writeFileSync(resolve(root,'build/statistics-counter-intermediate.png'),Buffer.from(screenshot.data,'base64'));
        }
        await pause(2200);
        const after = await evaluate(`({state:document.querySelector('.turkluxx-statistics').dataset.statisticsState,values:[...document.querySelectorAll('[data-count]')].map(e=>e.textContent),trace:statisticsTrace})`);
        console.log(JSON.stringify({port,script:scriptEvents.filter(url=>url.includes(':'+port)),before,intermediate,after:{state:after.state,values:after.values,intersectionEvents:after.trace.intersections,updateCount:after.trace.updates.length,sampleUpdates:after.trace.updates.filter((e,i,a)=>i===0||i===a.length-1||i%30===0)}},null,2));
        if (process.argv.includes('--verify')) {
            assert.ok(scriptEvents.some(url=>url.includes(':'+port)));
            assert.ok(after.trace.intersections.some(e=>e.visible));
            for (const target of [27,10000]) assert.ok(after.trace.updates.some(e=>Number(e.target)===target && Number(e.value.replace(/\D/g,''))>0 && Number(e.value.replace(/\D/g,''))<target));
            assert.deepEqual(after.values,['27+','10,000+']);
            assert.notDeepEqual(intermediate,after.values);
        }
    }
} finally {
    await send('Page.close');socket.close();for (const server of servers) server.close();
}
