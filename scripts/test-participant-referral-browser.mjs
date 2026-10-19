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
const arabic = JSON.parse(await readFile(resolve(root, 'locales/ar.json'), 'utf8'));
async function check(code, first, pair = false, client, lang = 'ar', mobile = false) {
    const { browserContextId } = await browser.send('Target.createBrowserContext');
    let page;
    try {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const targets = await fetch('http://127.0.0.1:9227/json/list').then(r => r.json());
        page = await connection(targets.find(t => t.id === targetId).webSocketDebuggerUrl);
        const evaluate = async expression => {
            const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await page.send('Page.enable');
        await page.send('Network.enable');
        await page.send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*google-analytics.com*', '*connect.facebook.net*'] });
        await page.send('Emulation.setDeviceMetricsOverride', {width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            Object.defineProperties(navigator,{languages:{get:()=>['en-US']},language:{get:()=> 'en-US'}});
            // Delay translation so the initial hidden Arabic state can be inspected.
            const originalFetch=window.fetch;
            window.fetch=async (...args)=>{if(String(args[0]).endsWith('/ar.json')) await new Promise(r=>setTimeout(r,300)); return originalFetch(...args);};
            document.addEventListener('DOMContentLoaded',()=>window.initialArabicState={lang:document.documentElement.lang,dir:document.documentElement.dir,visibility:document.documentElement.style.visibility});
        ` });
        const wait = async expression => {
            for(let i=0;i<400;i++) { if(await evaluate(expression)) return; await new Promise(r=>setTimeout(r,25)); }
            throw Error('Timed out: '+expression);
        };
        const navigate = async (path, lang) => {
            await page.send('Page.navigate', { url: origin + path });
            await wait(`location.pathname+location.search===${JSON.stringify(path)}&&document.documentElement?.lang===${JSON.stringify(lang)}&&!!window.getTurkLuxxReferral&&!!window.TurkLuxxI18n&&!!document.querySelector('.turkluxx-language-toggle')&&document.documentElement.style.visibility!== 'hidden'&&document.documentElement.dir===${JSON.stringify(lang==='ar'?'rtl':'ltr')}`);
        };
        if(first) await navigate('/?ref='+first, 'en');
        await navigate(`/?ref=${client ? 'AHMAD&client=' + client : pair ? 'AHMAD&subref=' + code : code}&lang=${lang}`, lang);
        if(lang==='ar') assert.deepEqual(await evaluate('window.initialArabicState'),{lang:'ar',dir:'rtl',visibility:'hidden'});
        assert.equal(await evaluate('document.documentElement.dir'), lang==='ar'?'rtl':'ltr');
        if(lang==='ar') assert.equal(await evaluate(`document.querySelector('[data-i18n="home.turkish"]').textContent`),arabic['home.turkish']);
        assert.equal(await evaluate('getComputedStyle(document.body).direction'), lang==='ar'?'rtl':'ltr');
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Arabic has no horizontal overflow');
        const expected=first||((pair||client)?'AHMAD':code);
        const expectedSubref=pair&&!first?code:undefined;
        assert.equal(await evaluate('getTurkLuxxReferralAttribution().subref'),expectedSubref);
        assert.equal(await evaluate('getTurkLuxxReferral()'), expected);
        assert.equal(await evaluate('getTurkLuxxReferralAttribution().parentConsultant'),first||client?undefined:'AHMAD');
        const original=await evaluate('getTurkLuxxReferralAttribution()');
        const payload=await evaluate(`(()=>{const f=document.querySelector('#turkluxx-callback form'); for(const [key,value] of Object.entries({name:'Test',phone:'+90 555',email:'test@example.com'}))f.elements.namedItem(key).value=value;return buildTurkLuxxLeadPayload(f);})()`);
        assert.equal(payload.referral,expected);
        assert.equal(payload.client,client);
        assert.equal(payload.subref,expectedSubref);
        if(expectedSubref)assert.equal(payload.directReferrer,code);
        assert.equal(payload.parentConsultant, first||client?undefined:'AHMAD');
        let contactPayload;
        await page.send('Fetch.enable', { patterns: [{urlPattern:'*/api/lead',requestStage:'Request'}] });
        page.socket.addEventListener('message', event => {
            const message=JSON.parse(event.data);
            if(message.method==='Fetch.requestPaused') {
                contactPayload=JSON.parse(message.params.request.postData);
                page.send('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:btoa(JSON.stringify({ok:true,leadId:'test',submittedAt:'test'}))});
            }
        });
        await evaluate(`(()=>{const f=document.querySelector('#turkluxx-contact form');for(const [key,value] of Object.entries({name:'Test',email:'test@example.com',message:'Test enquiry'}))f.elements.namedItem(key).value=value;f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
        for(let i=0;i<100&&!contactPayload;i++)await new Promise(r=>setTimeout(r,20));
        assert.equal(contactPayload.referral,expected);
        assert.equal(contactPayload.client,client);
        assert.equal(contactPayload.subref,expectedSubref);
        if(expectedSubref)assert.equal(contactPayload.directReferrer,code);
        assert.equal(contactPayload.parentConsultant,first||client?undefined:'AHMAD');
        assert.equal(contactPayload.language,lang);
        const switched = lang === 'ar' ? 'en' : 'ar';
        await evaluate(`document.querySelector('.turkluxx-sales-language .turkluxx-language-toggle').click();document.querySelector('.turkluxx-sales-language [data-language="${switched}"]').click()`);
        await wait(`document.documentElement.lang===${JSON.stringify(switched)}`);
        const changed=new URL(await evaluate('location.href'));
        assert.equal(changed.searchParams.get('ref'),pair||client?'AHMAD':code);
        assert.equal(changed.searchParams.get('client'),client||null);
        assert.equal(changed.searchParams.get('subref'),pair?code:null);
        assert.equal(changed.searchParams.get('lang'),switched);
        assert.equal(await evaluate('document.documentElement.dir'),switched==='ar'?'rtl':'ltr');
        assert.deepEqual(await evaluate('getTurkLuxxReferralAttribution()'),original);
        for(const path of ['/rengi-istanbul.html','/rengi-antalya.html','/meet-our-team.html','/']) {
            await navigate(path,switched);
            assert.deepEqual(await evaluate('getTurkLuxxReferralAttribution()'),original);
        }
        await navigate('/?ref=AHMAD&subref=FAOZI',switched);
        assert.deepEqual(await evaluate('getTurkLuxxReferralAttribution()'),original);
        await navigate('/?ref=ALMA','en');
        assert.deepEqual(await evaluate('getTurkLuxxReferralAttribution()'),original);
        await navigate('/?ref=AHMAD&client=UNKNOWN','en');
        assert.equal(await evaluate('getTurkLuxxReferral()'),'VLAD');
        assert.equal(await evaluate('getTurkLuxxReferralAttribution().client'),undefined);
        assert.equal(await evaluate("document.querySelector('#turkluxx-referral-error')===null && getComputedStyle(document.querySelector('.turkluxx-sales-hero')).display!=='none'"),true);
        console.log(`${mobile?'mobile':'desktop'} ${client} ${lang}: language, layout, forms, navigation and first-touch passed`);
    } finally {page?.socket.close();await browser.send('Target.disposeBrowserContext',{browserContextId});}
}
try {
    await import('../js/referral-registry.js');
    for(const mobile of [false,true]) for(const [lang,clients] of Object.entries(globalThis.TurkLuxxReferralRegistry.AHMAD)) for(const client of clients) await check('AHMAD',undefined,false,client,lang,mobile);
} finally {browser.socket.close();server.close();}
