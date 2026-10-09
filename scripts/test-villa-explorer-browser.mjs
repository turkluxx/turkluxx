// Local CDP regression checks for every Istanbul villa and its continuous media sections. No submissions.
// Start Chrome with --remote-debugging-port=9227, then run this script (--source optional).
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const workspace = resolve(import.meta.dirname, '..');
const root = process.argv.includes('--source') ? workspace : resolve(workspace, 'dist');
const origin = 'http://127.0.0.1:8808';
const codes = ['en', 'nl', 'es', 'ru', 'tr', 'ar'];
const catalogs = Object.fromEntries(await Promise.all(codes.map(async code => [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));
const server = http.createServer(async (req, res) => {
    try {
        const pathname = new URL(req.url, origin).pathname;
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) throw Error('Outside public root');
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(8808, '127.0.0.1', r));
let ws, target;
const errors = [];
try {
    target = await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pending = new Map();
    ws.addEventListener('message', event => {
        const m = JSON.parse(event.data);
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
        if (!m.id) return;
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(m.error) : p.resolve(m.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
    });
    const evaluate = async expression => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
        const readable = v => typeof v === 'string' ? v.replace(/[\u2066-\u2069]/g,'') : Array.isArray(v) ? v.map(readable) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,value])=>[k,readable(value)])) : v;
        return readable(r.result.value);
    };
    const until = async expression => {
        for (let i = 0; i < 100; i++) {
            if (await evaluate(expression)) return;
            await new Promise(r => setTimeout(r, 50));
        }
        console.log(await evaluate('JSON.stringify({open:[...document.querySelectorAll("dialog[open]")].map(e=>e.id||e.className),style:document.body.getAttribute("style"),active:document.activeElement?.outerHTML,context:window.explorerTestContext})'));
        throw Error(`Timeout: ${expression}`);
    };
    const click = async selector => {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
        await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        await new Promise(r=>setTimeout(r,50));
        const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x:x-visualViewport.offsetLeft,y:y-visualViewport.offsetTop,hit:e.contains(document.elementFromPoint(x,y))}})()`);
        assert(point.hit, `Covered button: ${selector}`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    };
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', {cacheDisabled:true});
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager*', '*google-analytics*', '*facebook*', '*maps.google.com*'] });
    await mkdir(resolve(workspace, 'build/explorer'), { recursive: true });
    let caseCount = 0;
    for (const [width,height] of (process.argv.includes('--mobile-only')?[[390,844],[320,640]]:[[1440,900],[1024,768],[390,844],[320,640]])) {
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
        await send('Page.navigate',{url:origin+'/rengi-istanbul.html?lang=en&ref=VLAD'});
        await until(`document.readyState==='complete' && !!window.TurkLuxxI18n && document.querySelectorAll('.rengi-type-tabs button').length===3`);
        await evaluate('TurkLuxxI18n.ready');
        const categories = await evaluate('Object.keys(villaData)');
        for (const category of categories) {
            await click(`.rengi-type-tabs button[data-category="${category}"]`);
            assert.equal(await evaluate(`document.querySelector('.rengi-type-tabs [aria-selected=true]').dataset.category`),category);
            const variants=await evaluate(`Object.keys(villaData['${category}'])`);
            for (const variant of variants) {
                await click(`input[name=rengi-villa-variant][value="${variant}"]`);
                const villa=await evaluate(`villaData['${category}']['${variant}']`);
                for (const code of codes) {
                    await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
                    await evaluate('document.fonts.ready');
                    await evaluate('new Promise(r=>requestAnimationFrame(r))');
                    const content=await evaluate(`(()=>{
                        const box=e=>{const r=e.getBoundingClientRect();return {y:r.y,b:r.bottom,w:r.width,h:r.height}};
                        const sections=[...document.querySelectorAll('#rengi-villa-selection > .rengi-villa-content')];
                        const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
                        return {sections:sections.map(box),headings:sections.map(e=>e.querySelector('h3').textContent),
                            photos:[...document.querySelectorAll('.rengi-villa-thumbnail img')].map(e=>e.getAttribute('src')),
                            plans:[...document.querySelectorAll('.rengi-villa-plan-preview img')].map(e=>e.getAttribute('src')),
                            rooms:[...document.querySelectorAll('.rengi-floor-card')].map(e=>({code:e.querySelector('h4').childNodes[0].textContent,rooms:[...e.querySelectorAll('dl>div')].map(r=>({name:r.querySelector('dt').textContent,area:r.querySelector('dd').textContent})),total:e.querySelector('strong').textContent})),
                            map:document.querySelector('.rengi-villa-map').getAttribute('src'),mapCount:document.querySelectorAll('.rengi-villa-map').length,
                            specs:[...document.querySelectorAll('[data-villa-spec]')].map(e=>e.textContent),
                            paragraphs:[...document.querySelectorAll('.rengi-philosophy-body p')].map(e=>e.textContent),
                            selected:document.querySelector('input[name=rengi-villa-variant]:checked').value,
                            buttons:[...document.querySelectorAll('.rengi-type-tabs button')].map(e=>({...box(e),active:e.getAttribute('aria-selected'),border:getComputedStyle(e).borderTopStyle,bg:getComputedStyle(e).backgroundColor})),
                            overflow:document.documentElement.scrollWidth>innerWidth,duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),tabs:document.querySelectorAll('.rengi-view-tabs').length,
                            dir:document.documentElement.dir,descriptionCount:document.querySelectorAll('.rengi-villa-philosophy').length,mainLocation:!!document.querySelector('#rengi-location .rengi-master-preview')};
                    })()`);
                    assert.equal(content.selected,variant);
                    assert.deepEqual(content.photos,villa.photos);
                    assert.deepEqual(content.plans,villa.floors.map(f=>f.image));
                    assert.equal(content.map,villa.map); assert.equal(content.mapCount,1);
                    assert.deepEqual(content.specs,[villa.quickSpecs.grossArea,villa.quickSpecs.netArea,villa.quickSpecs.landShare]);
                    assert.deepEqual(content.paragraphs,villa.descriptionKeys.map(key=>catalogs[code][key]));
                    assert.equal(content.descriptionCount,1); assert(content.mainLocation); assert.equal(content.tabs,0); assert.deepEqual(content.duplicates,[]);
                    assert.deepEqual(content.headings,[catalogs[code]['common.photos'],catalogs[code]['common.floor_plans'],catalogs[code]['istanbul.location']]);
                    assert(!content.overflow,`${width} ${code} ${variant}: overflow`);
                    content.sections.forEach(s=>assert(s.w>0&&s.h>0));
                    assert(content.sections[1].y>=content.sections[0].b); assert(content.sections[2].y>=content.sections[1].b);
                    content.buttons.forEach(button=>{assert(button.h>=48);assert.equal(button.border,'solid');});
                    assert.equal(content.buttons.filter(b=>b.active==='true').length,1);
                    assert.notEqual(content.buttons.find(b=>b.active==='true').bg,content.buttons.find(b=>b.active==='false').bg);
                    if(code==='ar')assert.equal(content.dir,'rtl');
                    for(const [index,floor] of villa.floors.entries()) {
                        const expectedRooms=floor.rooms.map(room=>{
                            const key=Object.keys(catalogs.en).find(key=>catalogs.en[key].trim()===room.name.trim());
                            return {name:key?catalogs[code][key]:room.name,area:room.area};
                        });
                        assert.deepEqual(content.rooms[index],{code:floor.code,rooms:expectedRooms,total:floor.total});
                    }
                    for(const media of ['photos','plans','location']) {
                        await evaluate(`window.explorerTestContext='${width} ${variant} ${code} ${media}'`);
                        const selector=media==='photos'?'.rengi-villa-thumbnail':media==='plans'?'.rengi-villa-plan-preview':'.rengi-villa-map-preview';
                        // Verify every floor preview opens its own image; all media share the original dialog.
                        const images=media==='photos'?villa.photos:media==='plans'?villa.floors.map(f=>f.image):[villa.map];
                        const count=media==='plans'?images.length:1;
                        for(let i=0;i<count;i++) {
                            assert.equal(await evaluate('document.body.style.overflow'),'',`Before opening ${width} ${variant} ${code} ${media}`);
                            await evaluate(`document.querySelectorAll('${selector}')[${i}].click()`);
                            await until('document.querySelector(".rengi-villa-lightbox").open');
                            assert.equal(await evaluate('document.querySelector(".rengi-villa-full-image").getAttribute("src")'),images[i]);
                            assert.equal(await evaluate('document.querySelector(".rengi-villa-counter").textContent'),`${i+1} / ${images.length}`);
                            await evaluate(`document.querySelector('.rengi-villa-lightbox').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
                            assert.equal(await evaluate('document.querySelector(".rengi-villa-full-image").getAttribute("src")'),images[(i+1)%images.length]);
                            await evaluate(`document.querySelector('.rengi-villa-close').click()`);
                            await until('!document.querySelector(".rengi-villa-lightbox").open && document.body.style.overflow!=="hidden"');
                        }
                    }
                    if(code==='en') {
                        await evaluate(`document.querySelector('.rengi-villa-contact').click()`);
                        await until('document.querySelector("#turkluxx-callback").open');
                        assert.equal(await evaluate('document.querySelector("#callback-villa").value'),villa.name);
                        const context=await evaluate('getTurkLuxxReferralAttribution()'); assert.equal(context.referral,'VLAD');
                        await evaluate(`document.querySelector('#turkluxx-callback .turkluxx-callback-close').click()`);
                        await until('!document.querySelector("#turkluxx-callback").open && document.body.style.position!=="fixed"');
                        await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
                    }
                    caseCount++;
                    if(category==='4+1'&&variant==='jade'&&((width===1440&&code==='en')||(width===390&&code==='ar'))) {
                        for(const selector of ['#rengi-explorer','#rengi-villa-plans','#rengi-villa-location']) {
                            await evaluate(`document.querySelector('${selector}').scrollIntoView({behavior:'instant'})`);
                            const shot=await send('Page.captureScreenshot',{format:'png'});
                            await writeFile(resolve(workspace,`build/explorer/${selector.slice(1)}-${width}-${code}.png`),Buffer.from(shot.data,'base64'));
                        }
                    }
                }
                console.log(`PASS ${width}px ${category} ${variant}: six languages, all media/rooms and lightboxes`);
            }
        }
        await evaluate(`document.querySelector('.rengi-type-tabs button').focus();document.querySelector('.rengi-type-tabs button').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);
        assert.equal(await evaluate('document.querySelector(".rengi-type-tabs [aria-selected=true]").dataset.category'),'6+1');
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
        assert.equal(await evaluate('document.querySelector(".rengi-type-tabs [aria-selected=true]").dataset.category'),'4+1');
    }
    console.log(`${caseCount} villa/language/viewport cases passed`);
    assert.deepEqual(errors, []);
    await writeFile(resolve(workspace, 'build/explorer/results.json'), JSON.stringify({cases:caseCount,errors},null,2));
} finally {
    ws?.close(); server.closeAllConnections(); server.close();
    if (target) await fetch('http://127.0.0.1:9227/json/close/' + target.id).catch(()=>{});
}
