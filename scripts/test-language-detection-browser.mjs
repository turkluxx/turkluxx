// Fresh isolated Chrome contexts against the actual production build.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../dist'), origin = 'http://127.0.0.1:8805';
const server = http.createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, origin).pathname;
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) throw Error('Outside build');
        const content = await readFile(file);
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
        response.end(content);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(8805, '127.0.0.1', resolve));
async function connection(url) {
    const socket = new WebSocket(url);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let id = 0; const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const task = pending.get(message.id); pending.delete(message.id);
        message.error ? task.reject(message.error) : task.resolve(message.result);
    });
    return { socket, send: (method, params = {}) => new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    }) };
}
const browserUrl = await fetch('http://127.0.0.1:9227/json/version').then(response => response.json());
const browser = await connection(browserUrl.webSocketDebuggerUrl);
const codes = ['en', 'ru', 'es', 'ar', 'tr', 'nl'];
const suffix = '?ref=LAITH&sub=campaign%20one';
async function scenario({ code, preferred = [`${code}-${code.toUpperCase()}`], primary = preferred[0], stored, explicit, expected = code }) {
    const { browserContextId } = await browser.send('Target.createBrowserContext');
    let page;
    try {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const targets = await fetch('http://127.0.0.1:9227/json/list').then(response => response.json());
        page = await connection(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
        const evaluate = async expression => {
            const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
        await page.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            Object.defineProperties(navigator, {languages:{get:()=>${JSON.stringify(preferred)}},language:{get:()=>${JSON.stringify(primary)}}});
            window.initialStorageCount=localStorage.length;window.initialCookies=document.cookie;
            if(!sessionStorage.getItem('testSeeded')){${stored ? `localStorage.setItem('turkluxx_language',${JSON.stringify(stored)});` : ''}sessionStorage.setItem('testSeeded','true');}
        ` });
        async function navigate(path, selected) {
            await page.send('Page.navigate', { url: origin + path });
            let ready = false;
            for (let attempt = 0; attempt < 120; attempt++) {
                if (await evaluate(`location.pathname+location.search===${JSON.stringify(path)}&&window.TurkLuxxI18n?.language===${JSON.stringify(selected)}&&document.documentElement.lang===${JSON.stringify(selected)}&&document.documentElement.dir===${JSON.stringify(selected === 'ar' ? 'rtl' : 'ltr')}&&!!document.querySelector('.turkluxx-language-toggle')`)) { ready = true; break; }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(ready, `Navigation did not select ${selected}: ${path}`);
            assert.equal(await evaluate('document.documentElement.dir'), selected === 'ar' ? 'rtl' : 'ltr');
            assert.equal(await evaluate('location.search'), path.slice(path.indexOf('?')));
        }
        const firstPath = '/' + suffix + (explicit ? `&lang=${explicit}` : '');
        await navigate(firstPath, expected);
        assert.equal(await evaluate('window.initialStorageCount'), 0, 'Fresh context has no saved preference');
        assert.equal(await evaluate('window.initialCookies'), '', 'Fresh context has no site cookies');
        assert.equal(await evaluate('getTurkLuxxReferral()'), 'LAITH');
        if (!explicit && !stored) {
            const manual = codes[(codes.indexOf(expected) + 1) % codes.length];
            await evaluate(`document.querySelector('.turkluxx-sales-language .turkluxx-language-toggle').click();document.querySelector('.turkluxx-sales-language [data-language="${manual}"]').click()`);
            for (let attempt = 0; attempt < 100 && await evaluate('TurkLuxxI18n.language') !== manual; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
            assert.equal(await evaluate('localStorage.getItem("turkluxx_language")'), manual);
            assert.equal(await evaluate('location.search'), suffix);
            await navigate('/' + suffix, manual);
            await navigate('/rengi-istanbul.html' + suffix, manual);
            await navigate('/rengi-antalya.html' + suffix, manual);
            assert.equal(await evaluate('getTurkLuxxReferral()'), 'LAITH');
        }
        console.log(`${primary} / ${preferred.join(',')}: ${expected}; fresh storage/cookies, RTL, URL and persistence passed${explicit ? '; explicit URL priority' : stored ? '; stored priority' : ''}`);
    } finally {
        page?.socket.close(); await browser.send('Target.disposeBrowserContext', { browserContextId });
    }
}
try {
    for (const code of codes) await scenario({ code });
    await scenario({ code: 'de', expected: 'en' });
    await scenario({ code: 'tr', preferred: ['de-DE', 'tr-TR', 'ru-RU'], primary: 'de-DE' });
    await scenario({ code: 'nl', preferred: [], primary: 'nl-NL' });
    for (let index = 0; index < codes.length; index++) {
        const code = codes[index], alternative = codes[(index + 1) % codes.length];
        await scenario({ code: alternative, stored: code, expected: code });
        await scenario({ code: alternative, stored: alternative, explicit: code, expected: code });
    }
} finally { browser.socket.close(); server.close(); }
