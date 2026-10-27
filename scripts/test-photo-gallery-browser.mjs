// Run with Chrome listening on --remote-debugging-port=9228.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const server = http.createServer(async (req, res) => {
    try {
        const path = new URL(req.url, 'http://localhost').pathname;
        const file = resolve(root, '.' + (path === '/videos' ? '/videos.html' : path));
        if (!file.startsWith(root + sep)) throw Error('Invalid path');
        const data = await readFile(file);
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(8801, '127.0.0.1', done));
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
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*facebook.net*', '*facebook.com*', '*drive.google.com*'] });
    const wait = expression => evaluate(`new Promise((resolve, reject) => { let attempts = 0; const tick = () => { if (${expression}) resolve(true); else if (++attempts > 150) reject(Error('Timed out')); else setTimeout(tick, 100); }; tick(); })`);
    for (const code of ['en', 'nl', 'es', 'ru', 'tr', 'ar']) {
        await send('Page.navigate', { url: `http://127.0.0.1:8801/videos?lang=${code}` });
        await wait(`document.documentElement.lang === '${code}' && document.querySelectorAll('.photo-thumbnail').length === 10`);
        const catalog = JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'));
        assert.equal(await evaluate('document.title'), catalog['videos.pageTitle']);
        assert.equal(await evaluate("document.querySelector('h1').textContent"), catalog['videos.heading']);
        assert.equal(await evaluate("document.querySelector('.photo-close').getAttribute('aria-label')"), catalog['photos.close']);
        assert.equal(await evaluate("document.querySelector('#videos-empty iframe').getAttribute('src')"), 'https://drive.google.com/file/d/1YKYxx2zbyk9ky92dLavOF-rv9Mr6X_Lw/preview');
        for (const [width, height, columns] of [[1440, 900, 4], [820, 1000, 3], [390, 844, 2], [844, 390, 3]]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            assert.equal(await evaluate("getComputedStyle(document.querySelector('.photos-grid')).gridTemplateColumns.split(' ').length"), columns);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            await evaluate("document.querySelectorAll('.photo-thumbnail')[2].click()");
            await wait("document.querySelector('.photo-original').naturalWidth > 0");
            assert.equal(await evaluate("document.querySelector('.photo-counter').textContent"), '3 / 10');
            assert.equal(await evaluate("document.querySelector('.photo-original').getAttribute('src')"), 'img/gallery/photo3.jpeg');
            assert.equal(await evaluate("getComputedStyle(document.documentElement).overflow"), 'hidden');
            assert.equal(await evaluate("(()=>{const r=document.querySelector('.photo-original').getBoundingClientRect();return r.width>0 && r.height>0 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight})()"), true);
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' });
            assert.equal(await evaluate("document.querySelector('.photo-counter').textContent"), '4 / 10');
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft' });
            await evaluate("document.querySelector('.photo-previous').click()");
            assert.equal(await evaluate("document.querySelector('.photo-counter').textContent"), '2 / 10');
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await wait("!document.querySelector('#photo-lightbox').open && getComputedStyle(document.documentElement).overflow !== 'hidden'");
            await evaluate("document.querySelector('.photo-thumbnail').click(); document.querySelector('.photo-previous').click()");
            assert.equal(await evaluate("document.querySelector('.photo-counter').textContent"), '10 / 10');
            await evaluate("document.querySelector('.photo-next').click(); document.querySelector('.photo-close').click()");
            await wait("!document.querySelector('#photo-lightbox').open");
            await evaluate("document.querySelector('.photo-thumbnail').click(); document.querySelector('.photo-stage').click()");
            await wait("!document.querySelector('#photo-lightbox').open");
        }
        if (code === 'ar') assert.equal(await evaluate('document.documentElement.dir'), 'rtl');
        console.log(`${code}: responsive grid, title, controls, keyboard, image sizing, scroll restoration passed`);
    }
    await evaluate("document.querySelector('.photo-thumbnail').click(); document.querySelector('.photo-original').src = 'img/gallery/missing.jpeg'");
    await wait("!document.querySelector('.photo-error').hidden");
    await evaluate("document.querySelector('.photo-next').click()");
    await wait("document.querySelector('.photo-original').naturalWidth > 0 && document.querySelector('.photo-error').hidden");
    await evaluate(`(() => {
        const dialog = document.querySelector('#photo-lightbox');
        dialog.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: dialog, clientX: 200, clientY: 150 })] }));
        dialog.dispatchEvent(new TouchEvent('touchend', { changedTouches: [new Touch({ identifier: 1, target: dialog, clientX: 100, clientY: 150 })] }));
    })()`);
    assert.equal(await evaluate("document.querySelector('.photo-counter').textContent"), '3 / 10');
    await evaluate("document.querySelector('.photo-close').click(); document.querySelectorAll('.photo-thumbnail img').forEach(img => img.loading = 'eager')");
    await wait("[...document.querySelectorAll('.photo-thumbnail img')].every(img => img.naturalWidth > 0)");
    assert.deepEqual(errors, []);
    console.log('All 10 photographs load; missing-image recovery passes; no JavaScript exceptions.');
} finally { ws?.close(); server.closeAllConnections(); server.close(); }
