// Source or --dist integration checks using headless Chrome on CDP port 9227.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.TURKLUXX_REFERRAL_TEST_PORT || 8806);
const origin = `http://127.0.0.1:${port}`;
const server = http.createServer(async (req, res) => {
    try {
        let path = new URL(req.url, origin).pathname;
        if (path === '/__seed') { res.end('<!doctype html><title>Test storage</title>'); return; }
        if (path === '/') path = '/index.html';
        else if (!extname(path)) path += '.html';
        const file = resolve(root, '.' + path);
        if (!file.startsWith(root + sep)) throw Error('Outside root');
        const data = await readFile(file);
        res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
async function connect(url) {
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
const browserInfo = await fetch('http://127.0.0.1:9227/json/version').then(response => response.json());
const browser = await connect(browserInfo.webSocketDebuggerUrl);
let checks = 0;
async function scenario({ query, expectedLanguage, expectedRef, override = false, mobile, targeted = false, subref }) {
    const { browserContextId } = await browser.send('Target.createBrowserContext');
    let page;
    try {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const targets = await fetch('http://127.0.0.1:9227/json/list').then(response => response.json());
        page = await connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
        const evaluate = async expression => {
            const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        const until = async expression => {
            for (let i = 0; i < 400; i++) {
                if (await evaluate(expression)) return;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw Error('Timed out: ' + expression);
        };
        await page.send('Network.enable');
        await page.send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*google-analytics.com*', '*connect.facebook.net*'] });
        await page.send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: 900, deviceScaleFactor: 1, mobile });
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            Object.defineProperty(navigator, 'languages', {get:()=>['ru-RU']});
            Object.defineProperty(navigator, 'language', {get:()=>'ru-RU'});
        ` });
        await page.send('Page.navigate', { url: origin + '/__seed' });
        await until(`location.pathname==='/__seed' && document.readyState!=='loading'`);
        await evaluate(`localStorage.setItem('turkluxx_language','nl')`);
        const navigate = async (path, language) => {
            await page.send('Page.navigate', { url: origin + path });
            await until(`location.pathname===${JSON.stringify(new URL(path, origin).pathname)} && document.readyState!=='loading' && window.TurkLuxxI18n?.language===${JSON.stringify(language)} && document.documentElement.dir===${JSON.stringify(language === 'ar' ? 'rtl' : 'ltr')} && !!document.querySelector('.turkluxx-language-toggle') && !!window.getTurkLuxxReferral && document.documentElement.style.visibility!=='hidden'`);
            await evaluate('TurkLuxxI18n.ready');
            await new Promise(resolve => setTimeout(resolve, 80));
        };
        const snapshot = async () => evaluate(`(()=>{
            const clean=s=>s.replace(/[\u2066-\u2069]/g,'').replace(/\\s+/g,' ').trim();
            const phones=[...document.querySelectorAll('a[href]')].filter(e=>/^(tel:|https:\\/\\/wa\\.me\\/)/.test(e.getAttribute('href')));
            return {language:TurkLuxxI18n.language,dir:document.documentElement.dir,attribution:getTurkLuxxReferralAttribution(),
                phones:phones.map(e=>({href:e.getAttribute('href'),text:clean(e.textContent)}))};
        })()`);
        const verify = async (language, attribution = null) => {
            const result = await snapshot();
            assert.equal(result.language, language);
            assert.equal(result.dir, language === 'ar' ? 'rtl' : 'ltr');
            assert.equal(result.attribution.referral, expectedRef);
            assert.equal(result.attribution.subref, subref);
            if (attribution) assert.deepEqual(result.attribution, attribution);
            assert.ok(result.phones.length >= 2);
            for (const phone of result.phones) {
                if (override) assert.deepEqual(phone, { href: 'tel:+19493314195', text: '+1 (949) 331-4195' });
                else { assert.equal(phone.href, 'https://wa.me/12137322002'); assert.ok(!phone.text.includes('949')); }
            }
            if (mobile) {
                await evaluate(`document.querySelector('.turkluxx-mobile-menu-toggle').click()`);
                assert.equal(await evaluate(`document.querySelector('.turkluxx-mobile-menu').hidden`), false);
                await evaluate(`document.querySelector('.turkluxx-mobile-menu-toggle').click()`);
            }
            checks++;
            return result.attribution;
        };
        await navigate('/' + query, expectedLanguage);
        const attribution = await verify(expectedLanguage);
        // Exercise the actual language menu handlers rather than assigning language state.
        await evaluate(`document.querySelector('.turkluxx-sales-language .turkluxx-language-toggle').click();document.querySelector('.turkluxx-sales-language [data-language="es"]').click()`);
        await until(`TurkLuxxI18n.language==='es'`);
        await verify('es', attribution);
        const pages = override ? ['/', '/rengi-istanbul.html', '/rengi-antalya.html', '/meet-our-team.html', '/videos', '/privacy-policy.html', '/cookie-policy.html', '/terms-and-conditions.html', '/disclaimer.html'] : ['/videos'];
        for (const path of pages) { await navigate(path, 'es'); await verify('es', attribution); }
        if (targeted) {
            await navigate('/' + query, 'es'); await verify('es', attribution);
            const previousDocument = await evaluate('performance.timeOrigin');
            await page.send('Page.reload');
            await until(`performance.timeOrigin!==${previousDocument} && document.readyState!=='loading' && window.TurkLuxxI18n?.language==='es' && document.documentElement.dir==='ltr' && !!document.querySelector('.turkluxx-language-toggle') && !!window.getTurkLuxxReferral`);
            await verify('es', attribution);
        }
        await evaluate(`TurkLuxxI18n.setLanguage('ar')`);
        await verify('ar', attribution);
        console.log(`PASS ${mobile ? 'mobile' : 'desktop'} ${query || 'direct'}: language, phone, manual switching, attribution and navigation`);
    } finally {
        page?.socket.close(); await browser.send('Target.disposeBrowserContext', { browserContextId });
    }
}
try {
    for (const mobile of [false, true]) {
        for (const ref of ['AHMAD', 'ALMA', 'VLAD', 'MOHAMED']) {
            for (const hint of ['', '&lang=en', '&lang=ar']) await scenario({ query: `?ref=${ref}${hint}`, expectedLanguage: 'en', expectedRef: ref, override: ['VLAD', 'ALMA'].includes(ref), targeted: true, mobile });
        }
        for (const [query, expectedRef, expectedLanguage, subref] of [
            ['', 'DIRECT', 'nl'], ['?ref=LAITH', 'LAITH', 'nl'], ['?ref=FAOZI&lang=ar', 'FAOZI', 'ar'],
            ['?ref=MOHAMED&subref=MOHAMED_ABDO&lang=ar', 'MOHAMED', 'ar', 'MOHAMED_ABDO'],
            ['?ref=AHMAD&subref=LAITH&lang=ar', 'AHMAD', 'ar', 'LAITH'],
            ['?ref=AHMAD&client=MUNTHER&lang=ar', 'AHMAD', 'ar']
        ]) await scenario({ query, expectedRef, expectedLanguage, subref, mobile });
    }
    console.log(`Passed ${checks} rendered-page checks.`);
} finally { browser.socket.close(); server.close(); }
