// Local Chrome CDP checks. Start Chrome with --remote-debugging-port=9227.
// node scripts/test-i18n-browser.mjs [--english-only]
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = process.argv.includes('--dist') ? resolve(root, 'dist') : root;
const port = Number(process.env.TURKLUXX_I18N_PORT || 8799);
const base = `http://127.0.0.1:${port}`;
const messages = [], payloads = [];
let failNextLead = false;
const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/api/lead') {
            if (failNextLead) {
                failNextLead = false;
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false })); return;
            }
            let body = ''; for await (const chunk of req) body += chunk;
            payloads.push(JSON.parse(body));
            const result = await worker.fetch(new Request(`${base}/api/lead`, { method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: base }, body }),
                { LEAD_EMAIL: { send: async message => { messages.push(message); } } });
            res.writeHead(result.status, { 'Content-Type': 'application/json' }); res.end(await result.text()); return;
        }
        const pathname = new URL(req.url, base).pathname;
        const file = resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(publicRoot + sep)) throw Error('outside public root');
        const data = await readFile(file);
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(file)] || 'application/octet-stream');
        res.end(data);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const target = await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    if (!msg.id) return;
    const task = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? task.reject(msg.error) : task.resolve(msg.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id; pending.set(callId, { resolve, reject }); ws.send(JSON.stringify({ id: callId, method, params }));
});
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    // Ignore invisible bidi isolation marks when comparing rendered content to catalog text.
    const readable = value => typeof value === 'string' ? value.replace(/[\u2066-\u2069]/g, '')
        : Array.isArray(value) ? value.map(readable)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, readable(item)])) : value;
    return readable(r.result.value);
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(50); }
    throw Error(`Timeout: ${expression}`);
}
async function navigate(path) {
    await send('Page.navigate', { url: base + path });
    await until(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState !== 'loading' && typeof TurkLuxxI18n !== 'undefined'`);
    await evaluate('TurkLuxxI18n.ready'); await pause(100);
}
async function dismissCallback() {
    await evaluate(`new Promise(resolve => {
        const dialog = document.querySelector('#turkluxx-callback');
        if (!dialog.open) return resolve();
        dialog.addEventListener('close', () => queueMicrotask(resolve), {once:true});
        dialog.querySelector('.turkluxx-callback-close').click();
    })`);
}
const catalogs = Object.fromEntries(await Promise.all(['en', 'ru', 'es', 'ar', 'tr', 'nl'].map(async code => [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));
async function noOverflow(context) {
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, `${context}: horizontal overflow`);
}
async function noEnglishFallback(code) {
    if (code === 'en') return;
    const source = Object.fromEntries(Object.entries(catalogs.en).filter(([key, value]) => value.trim() !== catalogs[code][key].trim()));
    const leftovers = await evaluate(`(() => {
        const normalize = s => s.replace(/[\\u2066-\\u2069]/g, '').replace(/\\s+/gu, ' ').trim();
        const english = new Set(Object.values(${JSON.stringify(source)}).map(normalize));
        const remaining = [], walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement.closest('script,style,noscript,svg,select,[data-i18n-ignore]')) continue;
            if (english.has(normalize(node.nodeValue))) remaining.push(normalize(node.nodeValue));
        }
        for (const node of document.querySelectorAll('[aria-label],[alt],[placeholder],[title]')) {
            for (const name of ['aria-label','alt','placeholder','title']) {
                const value = node.getAttribute(name);
                if (value && english.has(normalize(value))) remaining.push(value);
            }
        }
        return [...new Set(remaining)];
    })()`);
    assert.deepEqual(leftovers, [], `${code}: untranslated English source strings`);
}
try {
    const codes = process.argv.includes('--english-only') ? ['en'] : Object.keys(catalogs);
    for (const width of [1440, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
        for (const path of ['/', '/rengi-istanbul.html', '/rengi-antalya.html']) {
            await navigate(path); await evaluate('localStorage.clear()'); await navigate(path + '?ref=AHMAD&sub=JOHN');
            const attribution = await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())');
            for (const code of codes) {
                await navigate(path + '?ref=AHMAD&sub=JOHN');
                await evaluate(`{const select=document.querySelector('.turkluxx-sales-language select');select.value='${code}';select.dispatchEvent(new Event('change',{bubbles:true}));}`);
                await until(`document.documentElement.lang === '${code}'`); await pause(50);
                assert.equal(await evaluate('document.documentElement.lang'), code);
                assert.equal(await evaluate('document.documentElement.dir'), code === 'ar' ? 'rtl' : 'ltr');
                assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'), attribution);
                assert.equal(await evaluate('new URL(location.href).searchParams.get("sub")'), 'JOHN');
                assert.equal(await evaluate('document.querySelector(".turkluxx-sales-language select").options.length'), 6);
                const phoneBefore = await evaluate('(()=>{const box=document.querySelector(".turkluxx-call-top").getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height}})()');
                assert.equal(await evaluate('getComputedStyle(document.querySelector(".turkluxx-sales-language select")).display'), 'none');
                await evaluate('document.querySelector(".turkluxx-sales-language .turkluxx-language-toggle").click()');
                assert.equal(await evaluate('document.querySelector(".turkluxx-sales-language .turkluxx-language-toggle").getAttribute("aria-expanded")'), 'true');
                assert.equal(await evaluate('document.querySelectorAll(".turkluxx-sales-language [role=option]").length'), 6);
                assert.equal(await evaluate('(()=>{const box=document.querySelector(".turkluxx-sales-language [role=listbox]").getBoundingClientRect();return box.left>=0 && box.right<=innerWidth})()'), true, 'Dropdown stays within viewport');
                await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
                assert.equal(await evaluate('document.querySelector(".turkluxx-sales-language [role=listbox]").hidden'), true);
                assert.equal(await evaluate('document.activeElement.classList.contains("turkluxx-language-toggle")'), true);
                await send('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
                assert.equal(await evaluate('document.activeElement.getAttribute("role")'), 'option');
                await send('Input.dispatchKeyEvent', {type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
                assert.equal(await evaluate('document.activeElement.dataset.language'), 'nl');
                await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
                await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
                await until("document.documentElement.lang === 'nl'");
                await evaluate('document.querySelector(".turkluxx-sales-language .turkluxx-language-toggle").click()');
                await evaluate(`document.querySelector('.turkluxx-sales-language [data-language="${code}"]').click()`);
                await until(`document.documentElement.lang === '${code}'`);
                assert.equal(await evaluate('document.querySelector(".turkluxx-sales-language [role=listbox]").hidden'), true);
                assert.equal(await evaluate(`document.querySelector('.turkluxx-sales-language [data-language="${code}"]').getAttribute('aria-selected')`), 'true');
                await evaluate('document.querySelector(".turkluxx-sales-language .turkluxx-language-toggle").click()');
                await send('Input.dispatchMouseEvent', {type:'mousePressed',x:4,y:4,button:'left',clickCount:1});
                await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:4,y:4,button:'left',clickCount:1});
                assert.equal(await evaluate('document.querySelector(".turkluxx-sales-language [role=listbox]").hidden'), true);
                const phoneAfter = await evaluate('(()=>{const box=document.querySelector(".turkluxx-call-top").getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height}})()');
                assert.deepEqual(phoneAfter, phoneBefore, 'Opening the dropdown does not move the phone button');
                if (code === 'en' && width === 1440) assert.equal(await evaluate('getComputedStyle([...document.querySelectorAll(".turkluxx-sales-nav a")].find(link => link.getClientRects().length)).fontWeight'), '600');
                if (path === '/') {
                    assert.equal(await evaluate('document.querySelector(".turkluxx-language-select").options.length'), 6);
                    await evaluate(`{const select=document.querySelector('.turkluxx-language-select');select.value='${code === 'en' ? 'nl' : 'en'}';select.dispatchEvent(new Event('change',{bubbles:true}));}`);
                    await until(`document.documentElement.lang === '${code === 'en' ? 'nl' : 'en'}'`);
                    await evaluate(`{const select=document.querySelector('.turkluxx-language-select');select.value='${code}';select.dispatchEvent(new Event('change',{bubbles:true}));}`);
                    await until(`document.documentElement.lang === '${code}'`);
                    assert.equal(await evaluate('document.querySelector(".turkluxx-sales-language select").value'), code);
                    const order = await evaluate('[...document.querySelector("#turkluxx-citizenship-title [data-i18n-order]").querySelectorAll("[data-i18n]")].map(e=>e.dataset.i18n)');
                    assert.deepEqual(order, ['ar','es'].includes(code) ? ['home.citizenship','home.turkish'] : ['home.turkish','home.citizenship']);
                }
                assert.equal(await evaluate('document.querySelector(".turkluxx-mobile-callback-trigger span").textContent'), catalogs[code]['common.request_a_callback']);
                const trackingBefore = await evaluate('[...document.scripts].map(s=>s.src).filter(Boolean)');
                await evaluate(`TurkLuxxI18n.setLanguage(${JSON.stringify(code)})`);
                assert.deepEqual(await evaluate('[...document.scripts].map(s=>s.src).filter(Boolean)'), trackingBefore);
                const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth + 1');
                if (overflow) console.log('OVERFLOW', width, path, code, await evaluate('[...document.querySelectorAll("body *")].filter(e=>e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1).slice(0,8).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))'));
                assert.equal(overflow, false, `${width} ${path} ${code} overflow`);
                assert.equal(await evaluate('document.body.innerText.includes("undefined") || document.body.innerText.includes("[object Object]")'), false);
                await noEnglishFallback(code);
                assert.ok(await evaluate('document.querySelector(".turkluxx-footer").textContent.includes(TurkLuxxI18n.t("common.2026_turkluxx_all_rights_reserved"))'));
                assert.ok(await evaluate('[...document.querySelectorAll("a")].some(a=>a.href === "mailto:info@turkluxx.com")'));
                assert.ok(await evaluate('[...document.querySelectorAll("a")].some(a=>a.href.startsWith("https://wa.me/"))'));
                await evaluate('document.querySelector(".turkluxx-callback-trigger").click()');
                await until('document.querySelector("#turkluxx-callback").open');
                await evaluate("document.querySelector('#callback-name').value=''; document.querySelector('#callback-name').dispatchEvent(new Event('input'))");
                assert.equal(await evaluate('document.querySelector("#callback-name").validationMessage'), catalogs[code]['callback.requiredName']);
                assert.ok(await evaluate("document.querySelector('#turkluxx-callback-title').scrollWidth <= document.querySelector('#turkluxx-callback-title').clientWidth + 1"), 'Callback heading fits');
                for (const [field, key] of [['name','callback.requiredName'],['phone','callback.requiredPhone'],['email','callback.requiredEmail']]) {
                    await evaluate(`{const input=document.querySelector('#callback-${field}');input.value=' ';input.dispatchEvent(new Event('input',{bubbles:true}));}`);
                    assert.equal(await evaluate(`document.querySelector('#callback-${field}').validationMessage`), catalogs[code][key]);
                }
                await evaluate("{const input=document.querySelector('#callback-email');input.value='invalid';input.dispatchEvent(new Event('input',{bubbles:true}));}");
                assert.equal(await evaluate("document.querySelector('#callback-email').validationMessage"), catalogs[code]['callback.invalidEmail']);
                await evaluate("for (const [name,value] of Object.entries({name:'Test Visitor',phone:'+90 555 0100',email:'test@example.com'})) { const input = document.querySelector('#callback-'+name); input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); } document.querySelector('#turkluxx-callback-form').requestSubmit()");
                await until(`document.querySelector('#turkluxx-callback [role=status]').textContent === ${JSON.stringify(catalogs[code]['callback.success'])}`);
                assert.equal(payloads.at(-1).referral, 'AHMAD');
                assert.match(messages.at(-1).text, /Referral: AHMAD/);
                failNextLead = true;
                await evaluate("document.querySelector('#turkluxx-callback-form').requestSubmit()");
                await until(`document.querySelector('#turkluxx-callback [role=status]').textContent === TurkLuxxI18n.t('callback.error')`);
                const alternate = code === 'en' ? 'ar' : 'en';
                await evaluate(`TurkLuxxI18n.setLanguage('${alternate}')`);
                assert.equal(await evaluate("document.querySelector('#turkluxx-callback [role=status]').textContent"), catalogs[alternate]['callback.error']);
                await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
                await noOverflow(`${width} ${path} ${code} callback`);
                await dismissCallback();
                // Native dismissal restores the existing page controller on its next opening.
                await evaluate('window.__i18nReloadMarker = true');
                await send('Page.reload');
                await until(`!window.__i18nReloadMarker && document.readyState !== 'loading' && typeof TurkLuxxI18n !== 'undefined' && document.documentElement.lang === '${code}'`);
                await evaluate('TurkLuxxI18n.ready');
                assert.equal(await evaluate('TurkLuxxI18n.language'), code);
                assert.equal(await evaluate('getTurkLuxxReferral()'), 'AHMAD');
                await navigate(path === '/rengi-istanbul.html' ? '/rengi-antalya.html' : '/rengi-istanbul.html');
                assert.equal(await evaluate('TurkLuxxI18n.language'), code);
                assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'), attribution);
                console.log(`${width}px ${path} ${code}: content, persistence, RTL, referral, form and email passed`);
            }
        }
        if (process.argv.includes('--header-only')) continue;
        await navigate('/rengi-istanbul.html?ref=VLAD');
        const selectedAttribution = await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())');
        for (const category of ['4+1', '5+1', '6+1']) {
            await evaluate(`document.querySelector('[data-category="${category}"]').click()`);
            const variants = await evaluate('[...document.querySelectorAll("input[name=rengi-villa-variant]")].map(i=>i.value)');
            for (const variant of variants) {
                await evaluate(`{ const input=document.querySelector('input[name=rengi-villa-variant][value="${variant}"]'); input.checked=true; input.dispatchEvent(new Event('change')); }`);
                for (const code of codes) {
                    await evaluate(`TurkLuxxI18n.setLanguage('${code}')`); await pause(20);
                    assert.equal(await evaluate('document.querySelector("input[name=rengi-villa-variant]:checked").value'), variant);
                    const name = await evaluate(`villaData['${category}']['${variant}'][${JSON.stringify(code === 'tr' ? 'turkishName' : 'name')}]`);
                    assert.equal(await evaluate('document.querySelector("input[name=rengi-villa-variant]:checked").parentElement.textContent.trim()'), name);
                    assert.equal(await evaluate('document.querySelector("#rengi-philosophy-title").textContent'), name);
                    assert.equal(await evaluate('document.querySelector(".rengi-villa-contact span").textContent'), catalogs[code]['villa.cta'].replace('{name}', name));
                    const paragraphs = await evaluate('[...document.querySelectorAll(".rengi-philosophy-body p")].map(p=>({key:p.dataset.i18n,text:p.textContent,lead:p.classList.contains("rengi-philosophy-lead")}))');
                    assert.equal(paragraphs.length, 4);
                    paragraphs.forEach((p, i) => { assert.equal(p.text, catalogs[code][p.key]); assert.equal(p.lead, i === 0); });
                    await noOverflow(`${width} ${code} ${variant}`);
                    for (const mode of ['photos', 'plans', 'location']) {
                        await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
                        assert.equal(await evaluate('document.querySelectorAll(".rengi-view-tabs").length'), 0);
                        if (mode === 'plans') {
                            const floorIndices = await evaluate('[...document.querySelectorAll(".rengi-floor-card")].map((card,index)=>index)');
                            for (const floorIndex of floorIndices) {
                                await pause(20);
                                const roomNames = await evaluate(`villaData['${category}']['${variant}'].floors[${floorIndex}].rooms.map(room=>room.name)`);
                                const expected = roomNames.map(label => {
                                    const key = Object.keys(catalogs.en).find(key => catalogs.en[key].trim() === label.trim());
                                    assert.ok(key, `Room label cataloged: ${label}`);
                                    return catalogs[code][key];
                                });
                                assert.deepEqual(await evaluate(`[...document.querySelectorAll(".rengi-floor-card")[${floorIndex}].querySelectorAll("dt")].map(node=>node.textContent)`), expected);
                                await noOverflow(`${width} ${code} ${variant} floor ${floorIndex}`);
                            }
                        }
                        await noOverflow(`${width} ${code} ${variant} ${mode}`);
                        const opener = mode === 'photos' ? '.rengi-villa-thumbnail' : mode === 'plans' ? '.rengi-villa-plan-preview' : '.rengi-villa-map-preview';
                        await evaluate(`document.querySelector('${opener}').click()`);
                        assert.ok(await evaluate('document.querySelector(".rengi-villa-lightbox").open'));
                        const imageLabel = await evaluate('document.querySelector(".rengi-villa-lightbox img").alt');
                        assert.ok(imageLabel.includes(name));
                        await noEnglishFallback(code);
                        assert.equal(await evaluate('[...document.querySelectorAll(".rengi-villa-grid img,.rengi-villa-map,.rengi-villa-plan-preview img")].every(img=>getComputedStyle(img).transform === "none")'), true, 'Images are never mirrored');
                        await evaluate('document.querySelector(".rengi-villa-lightbox").close()');
                    }
                    // Visitor-facing translated CTAs must keep the canonical lead context.
                    await evaluate('document.querySelector(".rengi-villa-contact").click()');
                    await until('document.querySelector("#turkluxx-callback").open');
                    assert.equal(await evaluate('document.querySelector("#turkluxx-callback-title").textContent'), catalogs[code]['callback.villaTitle'].replace('{name}', name));
                    assert.ok(await evaluate("document.querySelector('#turkluxx-callback-title').scrollWidth <= document.querySelector('#turkluxx-callback-title').clientWidth + 1"), `${width} ${code} ${name} title fits`);
                    const expectedLead = await evaluate(`({property:TurkLuxxI18n.text(villaData['${category}']['${variant}'].name),propertyCode:villaData['${category}']['${variant}'].floors[0].code})`);
                    const actualLead = await evaluate('buildTurkLuxxLeadPayload(document.querySelector("#turkluxx-callback-form"))');
                    assert.equal(actualLead.project, 'Rengi Istanbul');
                    assert.equal(actualLead.property, expectedLead.property);
                    assert.equal(actualLead.propertyCode, expectedLead.propertyCode);
                    await dismissCallback();
                    assert.equal(await evaluate('JSON.stringify(getTurkLuxxReferralAttribution())'), selectedAttribution);
                }
            }
        }
        console.log(`${width}px: all 11 villas × ${codes.length} languages × photos/plans/maps passed; selection and lead paragraph preserved`);
        await navigate('/rengi-antalya.html');
        const projects = await evaluate('[...document.querySelectorAll("[data-project]")].map(t=>t.dataset.project)');
        for (const project of projects) {
            await evaluate(`document.querySelector('[data-project="${project}"]').click()`);
            for (const code of codes) {
                await evaluate(`TurkLuxxI18n.setLanguage('${code}')`); await pause(20);
                assert.equal(await evaluate('document.querySelector("[data-project][aria-selected=true]").dataset.project'), project);
                const paragraph = await evaluate('({key:document.querySelector(".rengi-philosophy-body p").dataset.i18n,text:document.querySelector(".rengi-philosophy-body p").textContent})');
                assert.equal(paragraph.text, catalogs[code][paragraph.key]);
                const name = await evaluate(`antalyaProjects['${project}'].name`);
                assert.equal(await evaluate('document.querySelector(".rengi-villa-contact span").textContent'), catalogs[code]['project.cta'].replace('{name}', name));
                await noEnglishFallback(code);
                await noOverflow(`${width} ${code} ${project}`);
                await evaluate("document.querySelector('.rengi-villa-contact').click()");
                await until('document.querySelector("#turkluxx-callback").open');
                assert.equal(await evaluate("document.querySelector('#turkluxx-callback-title').textContent"), catalogs[code]['callback.projectTitle'].replace('{name}', code === 'en' ? name.toUpperCase() : name));
                assert.equal(await evaluate('buildTurkLuxxLeadPayload(document.querySelector("#turkluxx-callback-form")).project'), 'Rengi Antalya', `${width} ${project} ${code}: canonical lead project`);
                assert.equal(await evaluate('buildTurkLuxxLeadPayload(document.querySelector("#turkluxx-callback-form")).property'), await evaluate('document.querySelector("#antalya-project-name").textContent'));
                await dismissCallback();
            }
        }
        console.log(`${width}px: all Antalya projects × ${codes.length} languages passed`);
        for (const code of codes) {
            for (const path of ['/', '/rengi-istanbul.html', '/rengi-antalya.html']) {
                await navigate(`${path}?lang=${code}&ref=SHIT`);
                await until(`document.documentElement.lang === '${code}'`);
                assert.equal(await evaluate('document.querySelector("#turkluxx-referral-error h1").textContent'), catalogs[code]['referral.title']);
                assert.equal(await evaluate('document.title'), catalogs[code]['referral.documentTitle']);
                await noEnglishFallback(code);
                await noOverflow(`${width} ${code} invalid referral`);
                assert.equal(await evaluate('getTurkLuxxReferral()'), 'AHMAD');
                await evaluate('document.querySelector("#turkluxx-referral-error a").click()');
                await until("location.pathname === '/' && location.search === '' && !document.querySelector('#turkluxx-referral-error') && document.readyState !== 'loading'");
                await pause(100);
                assert.equal(await evaluate('TurkLuxxI18n.language'), code);
            }
        }
        await navigate('/rengi-istanbul.html');
        await evaluate('localStorage.clear()');
        await navigate('/');
        assert.equal(await evaluate('getTurkLuxxReferral()'), 'DIRECT');
        await evaluate("TurkLuxxI18n.setLanguage('nl')");
        assert.equal(await evaluate('localStorage.getItem("turkluxx_referral")'), null);
        await navigate('/rengi-istanbul.html?ref=VLAD');
        await evaluate("TurkLuxxI18n.setLanguage('ar')");
        assert.equal(await evaluate('getTurkLuxxReferral()'), 'VLAD');
        await evaluate('document.querySelector(".rengi-master-preview").click()');
        await until('document.querySelector("#rengi-plan-lightbox").open');
        assert.equal(await evaluate('document.querySelector("#rengi-lightbox-title").textContent'), catalogs.ar['istanbul.master_plan_186']);
        for (const code of codes) {
            await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
            assert.equal(await evaluate('document.querySelector("#rengi-lightbox-title").textContent'), catalogs[code]['istanbul.master_plan_186']);
            assert.equal(await evaluate('document.querySelector("#rengi-lightbox-image").alt'), catalogs[code]['istanbul.rengi_istanbul_overall_site_plan_from_the']);
            assert.equal(await evaluate('document.querySelector("#rengi-plan-lightbox").open'), true);
        }
        await evaluate('document.querySelector("#rengi-plan-lightbox").close()');
        if (!process.argv.includes('--english-only')) {
            await mkdir(resolve(root, 'build/i18n'), { recursive: true });
            for (const [name, path] of [['home','/'], ['istanbul','/rengi-istanbul.html'], ['antalya','/rengi-antalya.html']]) {
                await navigate(path); await evaluate("TurkLuxxI18n.setLanguage('ar')"); await pause(100);
                if (name === 'istanbul') await evaluate("document.querySelector('.rengi-villa-philosophy').scrollIntoView()");
                const screenshot = await send('Page.captureScreenshot', { format: 'png' });
                await writeFile(resolve(root, `build/i18n/${name}-ar-${width}.png`), Buffer.from(screenshot.data, 'base64'));
            }
        }
    }
    assert.equal(errors.length, 0, JSON.stringify(errors));
} finally {
    await fetch(`http://127.0.0.1:9227/json/close/${target.id}`);
    ws.close(); server.close();
}
