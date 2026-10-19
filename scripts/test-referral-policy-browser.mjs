// Source or --dist integration checks using headless Chrome on CDP port 9227.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import worker, { validateLead } from '../worker/index.mjs';

const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.TURKLUXX_REFERRAL_TEST_PORT || 8806);
const origin = `http://127.0.0.1:${port}`;
let mockEmailCount = 0;
let lastValidatedLead;
let lastDeliveredMessage;
const serverAttributionEvidence = [];
const server = http.createServer(async (req, res) => {
    try {
        let path = new URL(req.url, origin).pathname;
        if (path === '/api/lead') {
            let body = ''; for await (const chunk of req) body += chunk;
            try { lastValidatedLead = validateLead(JSON.parse(body)); } catch { lastValidatedLead = null; }
            const result = await worker.fetch(new Request(origin + path, { method: req.method,
                headers: { 'Content-Type': req.headers['content-type'] || '', Origin: origin }, body }),
                { LEAD_EMAIL: { send: async message => { mockEmailCount++; lastDeliveredMessage = message; } } });
            res.writeHead(result.status, { 'Content-Type': 'application/json' }); res.end(await result.text()); return;
        }
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
async function scenario({ query, expectedLanguage, expectedRef, override = false, mobile, targeted = false, subref, previousRef }) {
    const { browserContextId } = await browser.send('Target.createBrowserContext');
    let page;
    try {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const targets = await fetch('http://127.0.0.1:9227/json/list').then(response => response.json());
        page = await connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
        const exceptions = [];
        page.socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
        });
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
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Network.enable');
        await page.send('Network.setBlockedURLs', { urls: ['*googletagmanager.com*', '*google-analytics.com*', '*connect.facebook.net*'] });
        await page.send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: 900, deviceScaleFactor: 1, mobile });
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            Object.defineProperty(navigator, 'languages', {get:()=>['ru-RU']});
            Object.defineProperty(navigator, 'language', {get:()=>'ru-RU'});
        ` });
        await page.send('Page.navigate', { url: origin + '/__seed' });
        await until(`location.pathname==='/__seed' && document.readyState!=='loading'`);
        await evaluate(`localStorage.setItem('turkluxx_language',${JSON.stringify(expectedRef === 'TIM_BOND' || subref === 'TIM_BOND' ? 'ar' : 'nl')})`);
        if (previousRef === 'MOHAMED_ABDO') {
            await evaluate(`localStorage.setItem('turkluxx_referral_pair',JSON.stringify({referral:'MOHAMED',subref:'MOHAMED_ABDO',createdAt:'original-time',landingPage:'original-page'}))`);
        } else if (previousRef) {
            await evaluate(`localStorage.setItem('turkluxx_referral',${JSON.stringify(previousRef)});localStorage.setItem('turkluxx_referral_created_at','original-time');localStorage.setItem('turkluxx_referral_landing_page','original-page')`);
        }
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
            const expectedParent = subref ? expectedRef : globalThis.TurkLuxxReferralRegistry[expectedRef]?.parentConsultant;
            assert.equal(result.attribution.parentConsultant, expectedParent);
            if (attribution) assert.deepEqual(result.attribution, attribution);
            assert.ok(result.phones.length >= 2);
            for (const phone of result.phones) {
                if (override) assert.deepEqual(phone, { href: 'https://wa.me/12137322002', text: '+1 (949) 331-4195' });
                else { assert.equal(phone.href, 'https://wa.me/12137322002'); assert.equal(phone.text, '+1 (213) 732-2002'); }
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
        const submitForm = async (selector, values) => {
            let listener, timer;
            const sent = new Promise((resolve, reject) => {
                let requestId, payload;
                listener = event => {
                    const message = JSON.parse(event.data);
                    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.endsWith('/api/lead') && message.params.request.postData) {
                        requestId = message.params.requestId;
                        payload = JSON.parse(message.params.request.postData);
                    }
                    if (message.method === 'Network.responseReceived' && message.params.requestId === requestId && payload) {
                        resolve({ payload, status: message.params.response.status });
                    }
                };
                page.socket.addEventListener('message', listener);
                timer = setTimeout(() => reject(Error('Form did not submit: ' + selector)), 10000);
            });
            try {
                await evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements.namedItem(key).value=value;f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
                const response = await sent;
                assert.equal(response.status, 200, 'Actual form reaches the Worker and mocked email delivery');
                assert.equal(response.payload.referral, expectedRef);
                assert.equal(response.payload.subref, subref);
                assert.ok(lastDeliveredMessage.subject.startsWith(`[${expectedRef}] `));
                assert.ok(lastDeliveredMessage.text.split('\n').includes(`Referral: ${expectedRef}`));
                if (process.argv.includes('--server-fallback-only')) {
                    assert.equal(lastValidatedLead.referral, 'VLAD');
                    assert.equal(new URL(lastValidatedLead.page).searchParams.get('ref'), 'VLAD');
                    assert.equal(lastValidatedLead.diagnostics.originalPage, origin + '/' + query);
                    for (const key of ['subref', 'directReferrer', 'parentConsultant', 'client', 'referralPath']) assert.equal(lastValidatedLead[key], undefined);
                    assert.doesNotMatch(lastDeliveredMessage.text, /^(?:Sub-referrer|Direct Referrer|Parent Consultant|Participant):/m);
                    serverAttributionEvidence.push({
                        viewport: mobile ? 'mobile' : 'desktop', form: selector, previousRef: previousRef || null,
                        requestedURL: origin + '/' + query, submittedReferral: response.payload.referral,
                        serverLead: lastValidatedLead, deliveredNotification: lastDeliveredMessage
                    });
                }
                return response.payload;
            } finally { clearTimeout(timer); page.socket.removeEventListener('message', listener); }
        };
        await submitForm('#turkluxx-callback form', { name:'Browser Test', phone:'123', email:'browser@example.com' });
        if (expectedRef === 'TIM_BOND' || subref === 'TIM_BOND') {
            assert.equal(lastValidatedLead.referral, expectedRef);
            assert.equal(lastValidatedLead.subref, subref);
            assert.equal(lastValidatedLead.parentConsultant, 'VLAD');
            const contact = await snapshot();
            console.log('TIM_BOND EVIDENCE ' + JSON.stringify({
                registry: { VLAD: globalThis.TurkLuxxReferralRegistry.VLAD, TIM_BOND: globalThis.TurkLuxxReferralRegistry.TIM_BOND },
                browser: attribution, lead: { referral: lastValidatedLead.referral, subref: lastValidatedLead.subref, directReferrer: lastValidatedLead.directReferrer, parentConsultant: lastValidatedLead.parentConsultant },
                language: contact.language, phones: contact.phones
            }));
        }
        const contactPayload = await submitForm('#turkluxx-contact form', { name:'Browser Test', email:'browser@example.com', message:'Test enquiry' });
        const contactLead = validateLead(contactPayload);
        assert.equal(contactLead.referral, expectedRef);
        assert.equal(contactLead.subref, subref);
        assert.equal(await evaluate("document.querySelector('#turkluxx-referral-error') === null && getComputedStyle(document.querySelector('.turkluxx-sales-hero')).display !== 'none'"), true);
        // Exercise the actual language menu handlers rather than assigning language state.
        await evaluate(`document.querySelector('.turkluxx-sales-language .turkluxx-language-toggle').click();document.querySelector('.turkluxx-sales-language [data-language="es"]').click()`);
        await until(`TurkLuxxI18n.language==='es'`);
        await verify('es', attribution);
        const pages = override ? ['/', '/rengi-istanbul.html', '/rengi-antalya.html', '/meet-our-team.html', '/videos', '/privacy-policy.html', '/cookie-policy.html', '/terms-and-conditions.html', '/disclaimer.html'] : ['/videos'];
        for (const path of pages) {
            if (path === '/videos') {
                // Follow the site's actual internal link with its existing language hint.
                await evaluate(`document.querySelector('.turkluxx-sales-header a[data-i18n="nav.videos"]').click()`);
                await until(`location.pathname==='/videos' && document.readyState!=='loading' && window.TurkLuxxI18n?.language==='es' && !!window.getTurkLuxxReferral && document.documentElement.dir==='ltr'`);
            } else await navigate(path, 'es');
            await verify('es', attribution);
        }
        if (targeted) {
            await navigate('/' + query, 'es'); await verify('es', attribution);
        }
        const previousDocument = await evaluate('performance.timeOrigin');
        await page.send('Page.reload');
        await until(`performance.timeOrigin!==${previousDocument} && document.readyState!=='loading' && window.TurkLuxxI18n?.language==='es' && document.documentElement.dir==='ltr' && !!document.querySelector('.turkluxx-language-toggle') && !!window.getTurkLuxxReferral`);
        await verify('es', attribution);
        await evaluate(`TurkLuxxI18n.setLanguage('ar')`);
        await verify('ar', attribution);
        assert.deepEqual(exceptions, [], 'No uncaught JavaScript errors in rendered production pages');
        console.log(`PASS ${mobile ? 'mobile' : 'desktop'} ${query || 'direct'}${previousRef ? ' after saved ' + previousRef : ''}: ${override ? '+1 (949) 331-4195 (existing WhatsApp link)' : '+1 (213) 732-2002 (existing WhatsApp link)'}; switching, attribution, navigation and reload`);
    } finally {
        page?.socket.close(); await browser.send('Target.disposeBrowserContext', { browserContextId });
    }
}

async function invalidScenario(query, previousRef, mobile, path = '/') {
    const hint = new URLSearchParams(query).get('lang');
    const expectedLanguage = ['en','nl','ar','es','ru','tr'].includes(hint) ? hint : 'en';
    await scenario({ query, previousRef, expectedLanguage, expectedRef: 'VLAD', override: true, mobile });
}

try {
    if (process.argv.includes('--server-fallback-only')) {
        for (const mobile of [false, true]) {
            for (const previousRef of [undefined, 'ALMA']) {
                for (const query of ['?ref=TIM_BOND&lang=nl', '?ref=UNKNOWN']) {
                    await scenario({ query, previousRef, expectedRef: 'VLAD', expectedLanguage: query.includes('lang=nl') ? 'nl' : 'en', override: true, mobile });
                }
            }
        }
        const output = resolve(import.meta.dirname, '../build/server-referral-attribution.json');
        await mkdir(resolve(import.meta.dirname, '../build'), { recursive: true });
        await writeFile(output, JSON.stringify(serverAttributionEvidence, null, 2) + '\n');
        console.log(`Verified ${serverAttributionEvidence.length} actual submissions and delivered mock notifications; evidence: ${output}`);
    } else if (process.argv.includes('--fallback-only')) {
        for (const mobile of [false, true]) {
            for (const [query, expectedRef, expectedLanguage, subref, override] of [
                ['?ref=VLAD','VLAD','en',undefined,true], ['?ref=ALMA','ALMA','en',undefined,true],
                ['?ref=MOHAMED','MOHAMED','en'], ['?ref=AHMAD','AHMAD','en'],
                ['?ref=VLAD=TIM_BOND&lang=nl','VLAD','nl','TIM_BOND',true],
                ['?ref=TIM_BOND&lang=nl','VLAD','nl',undefined,true],
                ['?ref=MOHAMED=MOHAMED_ABDO','MOHAMED','nl','MOHAMED_ABDO'],
                ['?ref=MOHAMED_ABDO','VLAD','en',undefined,true],
                ['?ref=UNKNOWN','VLAD','en',undefined,true], ['?ref=ALMA=UNKNOWN','VLAD','en',undefined,true],
                ['?ref=','VLAD','en',undefined,true], ['', 'DIRECT','nl'],
                ['?ref=VLAD&subref=TIM_BOND&lang=nl','VLAD','nl','TIM_BOND',true],
                ['?ref=MOHAMED&subref=MOHAMED_ABDO&lang=ar','MOHAMED','ar','MOHAMED_ABDO']
            ]) await scenario({ query, expectedRef, expectedLanguage, subref, override, mobile });
            for (const previousRef of ['ALMA','MOHAMED_ABDO','AHMAD']) {
                await scenario({ query: '?ref=UNKNOWN&lang=ar', expectedRef:'VLAD', expectedLanguage:'ar', previousRef, override:true, mobile });
            }
        }
    } else if (process.argv.includes('--tim-bond-only')) {
        const decodedURL = process.env.TURKLUXX_DECODED_QR_URL || 'https://turkluxx.com/?ref=VLAD&subref=TIM_BOND&lang=nl';
        const decoded = new URL(decodedURL);
        assert.equal(decoded.href, 'https://turkluxx.com/?ref=VLAD&subref=TIM_BOND&lang=nl');
        for (const mobile of [false, true]) {
            await scenario({ query: decoded.search, expectedLanguage: 'nl', expectedRef: 'VLAD', subref: 'TIM_BOND', override: true, targeted: true, mobile });
            await invalidScenario('?ref=AHMAD&subref=TIM_BOND&lang=en', undefined, mobile);
        }
    } else {
    for (const mobile of [false, true]) {
        for (const ref of ['AHMAD', 'ALMA', 'VLAD', 'MOHAMED']) {
            for (const hint of ['', '&lang=en', '&lang=ar']) await scenario({ query: `?ref=${ref}${hint}`, expectedLanguage: 'en', expectedRef: ref, override: ['VLAD', 'ALMA'].includes(ref), targeted: true, mobile });
        }
        for (const [query, expectedRef, expectedLanguage, subref] of [
            ['?ref=VLAD=TIM_BOND&lang=nl', 'VLAD', 'nl', 'TIM_BOND'],
            ['?ref=VLAD=TIM_BOND&lang=ar', 'VLAD', 'nl', 'TIM_BOND'],
            ['?ref=vlad=tim_bond', 'VLAD', 'nl', 'TIM_BOND'],
            ['', 'DIRECT', 'nl'], ['?ref=AHMAD=LAITH', 'AHMAD', 'nl', 'LAITH'], ['?ref=AHMAD=FAOZI&lang=ar', 'AHMAD', 'ar', 'FAOZI'],
            ['?ref=MOHAMED&subref=MOHAMED_ABDO&lang=ar', 'MOHAMED', 'ar', 'MOHAMED_ABDO'],
            ['?ref=AHMAD&subref=LAITH&lang=ar', 'AHMAD', 'ar', 'LAITH'],
            ['?ref=AHMAD&client=MUNTHER&lang=ar', 'AHMAD', 'ar'],
            ['?ref=MOHAMED=MOHAMED_ABDO', 'MOHAMED', 'nl', 'MOHAMED_ABDO']
        ]) await scenario({ query, expectedRef, expectedLanguage, subref, override: subref === 'TIM_BOND', mobile });
        for (const ref of ['alma', 'vlad']) {
            await scenario({ query: `?ref=${ref}`, expectedLanguage: 'nl', expectedRef: ref.toUpperCase(), override: true, mobile });
        }
        for (const [ref, previousRef] of [['ALMA', 'AHMAD'], ['VLAD', 'MOHAMED'], ['alma', 'MOHAMED_ABDO'], ['vlad', 'AHMAD']]) {
            await scenario({ query: `?ref=${ref}`, previousRef, expectedLanguage: ref === ref.toUpperCase() ? 'en' : 'nl',
                expectedRef: previousRef === 'MOHAMED_ABDO' ? 'MOHAMED' : previousRef,
                subref: previousRef === 'MOHAMED_ABDO' ? 'MOHAMED_ABDO' : undefined, override: true, mobile });
        }
        for (const [query, expectedLanguage, previousRef] of [['?ref=AHMAD', 'en', 'ALMA'], ['?ref=MOHAMED', 'en', 'VLAD']]) {
            await scenario({ query, expectedLanguage, previousRef, expectedRef: previousRef, mobile });
        }
        for (const previousRef of [undefined, 'VLAD', 'ALMA', 'AHMAD']) {
            for (const query of ['?ref=ABRACADABRA', '?ref=']) {
                for (const path of ['/', '/videos']) await invalidScenario(query, previousRef, mobile, path);
            }
        }
    }
    }
    console.log(`Passed ${checks} rendered-page checks.`);
} finally { browser.socket.close(); server.close(); }
