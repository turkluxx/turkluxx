// Start headless Chrome with --remote-debugging-port=9228 before running.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const origin = 'http://127.0.0.1:8802';
const server = http.createServer(async (req, res) => {
    try {
        let path = new URL(req.url, origin).pathname.replace(/^\/turkluxx(?=\/)/, '');
        if (path === '/') path = '/index.html';
        else if (!extname(path)) path += '.html';
        const file = resolve(root, '.' + path);
        if (!file.startsWith(root + sep)) throw Error('Invalid path');
        const data = await readFile(file);
        res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(8802, '127.0.0.1', done));
let ws;
try {
    const target = await fetch('http://127.0.0.1:9228/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(done => ws.addEventListener('open', done, { once: true }));
    let id = 0; const pending = new Map(), errors = [];
    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        if (!message.id) return;
        const task = pending.get(message.id); pending.delete(message.id);
        message.error ? task.reject(message.error) : task.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const wait = async expression => {
        for (let attempt = 0; attempt < 120; attempt++) {
            try { if (await evaluate(`Boolean(${expression})`)) return; }
            catch (error) { if (error.code !== -32000) throw error; }
            await new Promise(done => setTimeout(done, 50));
        }
        throw Error('Timed out: ' + expression);
    };
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*facebook.net*', '*facebook.com*', '*drive.google.com*'] });
    let checks = 0;
    for (const [path, destination] of [
        ['/turkluxx/index.html', '/turkluxx/videos.html'],
        ['/turkluxx/meet-our-team.html', '/turkluxx/videos.html'],
        ['/', '/videos'],
        ['/meet-our-team', '/videos']
    ]) for (const mobile of [false, true]) for (const code of ['en', 'nl', 'es', 'ru', 'tr', 'ar']) {
        await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: 900, deviceScaleFactor: 1, mobile });
        await send('Page.navigate', { url: `${origin}${path}?ref=VLAD&subref=TIM_BOND&lang=en` });
        await wait(`location.pathname === '${path}' && window.TurkLuxxI18n && document.querySelector('#turkluxx-mobile-menu a[data-i18n="nav.videos"]') && document.documentElement.dir && document.documentElement.lang === window.TurkLuxxI18n.language`);
        const otherLinks = await evaluate("[...document.querySelectorAll('a[href]:not([data-i18n=\"nav.videos\"])')].map(a=>a.getAttribute('href'))");
        await evaluate(`window.TurkLuxxI18n.setLanguage('${code}')`);
        assert.deepEqual(await evaluate("[...document.querySelectorAll('a[href]:not([data-i18n=\"nav.videos\"])')].map(a=>a.getAttribute('href'))"), otherLinks);
        const selector = mobile ? '#turkluxx-mobile-menu a[data-i18n="nav.videos"]' : '.turkluxx-sales-header a[data-i18n="nav.videos"]';
        const hrefs = await evaluate("[...document.querySelectorAll('a[data-i18n=\"nav.videos\"]')].map(a=>a.href)");
        for (const href of hrefs) {
            const url = new URL(href);
            assert.equal(url.pathname, destination);
            assert.equal(url.searchParams.get('lang'), code);
            assert.equal(url.searchParams.get('ref'), 'VLAD');
            assert.equal(url.searchParams.get('subref'), 'TIM_BOND');
        }
        if (mobile) await evaluate("document.querySelector('.turkluxx-mobile-menu-toggle').click()");
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await wait(`location.pathname === '${destination}' && document.querySelector('#photos-gallery .photo-thumbnail') && document.documentElement.lang === '${code}' && window.TurkLuxxI18n?.language === '${code}' && document.documentElement.dir === '${code === 'ar' ? 'rtl' : 'ltr'}'`);
        const params = new URL(await evaluate('location.href')).searchParams;
        assert.equal(params.get('lang'), code); assert.equal(params.get('ref'), 'VLAD'); assert.equal(params.get('subref'), 'TIM_BOND');
        assert.equal(await evaluate('document.documentElement.dir'), code === 'ar' ? 'rtl' : 'ltr');
        assert.equal(await evaluate('window.getTurkLuxxReferralAttribution().subref'), 'TIM_BOND');
        checks++;
    }
    assert.deepEqual(errors, []);
    console.log(`${checks} desktop/mobile navigation scenarios passed across all six languages, local subdirectory and clean routes; referral parameters, attribution, RTL and other links preserved.`);
} finally { ws?.close(); server.closeAllConnections(); server.close(); }
