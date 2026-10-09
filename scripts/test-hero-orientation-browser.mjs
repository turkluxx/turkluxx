// Homepage rotation, geometry and menu checks in all six languages.
// Start headless Chrome with --remote-debugging-port=9227, then run:
// node scripts/test-hero-orientation-browser.mjs [--dist]
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const publicRoot = process.argv.includes('--dist') ? resolve(root, 'dist') : root;
const port = Number(process.env.TURKLUXX_I18N_PORT || 8799);
const base = `http://127.0.0.1:${port}`;
const server = http.createServer(async (req, res) => {
    try {
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
async function click(selector) {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(50); }
    throw Error(`Timeout: ${expression}`);
}
async function navigate(path) {
    await send('Page.navigate', { url: base + path });
    await until(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState !== 'loading' && typeof TurkLuxxI18n !== 'undefined'`);
    await evaluate('TurkLuxxI18n.ready'); await pause(100);
    await until(`document.documentElement.lang === ${JSON.stringify(new URL(base + path).searchParams.get('lang'))}`);
}
const records=[];
try {
 for(const code of ['en','ru','es','ar','tr','nl']) {
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/?lang='+code); await evaluate('document.fonts.ready');
  for(const [width,height] of [[390,844],[667,375],[844,390],[852,393],[932,430],[375,667],[320,568],[768,1024],[1024,768],[1440,900],[1440,430]]){
   const landscape=width<1200&&height<=500&&width>height;
   const mobile=width<768||landscape;
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1200});await pause(250);
   const record=await evaluate(`(()=>{const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,display:c.display}};return {width:innerWidth,height:innerHeight,lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth,logo:box('.turkluxx-sales-logo'),tagline:box('.turkluxx-brand-tagline'),language:box('.turkluxx-sales-language'),heading:box('.turkluxx-sales-heading h1'),citizenship:box('.turkluxx-citizenship'),ctas:box('.turkluxx-mobile-primary-ctas'),full:document.querySelector('.turkluxx-sales-header').classList.contains('has-landscape-navigation'),nav:box(document.querySelector('.turkluxx-sales-header').classList.contains('has-landscape-navigation')?'.turkluxx-home-desktop-nav':'.turkluxx-mobile-primary-nav'),toggle:box('.turkluxx-mobile-menu-control'),ornament:box('.turkluxx-ornament')}})()`);
   records.push({viewport:[width,height],...record});
   assert.equal(record.width,width,'Viewport width');
   if(mobile){
    assert.equal(record.ornament.display,'none','Divider '+code+' '+width);
    assert.equal(record.overflow,false,'Overflow '+code+' '+width);
    for(const key of ['logo','tagline','language','heading','citizenship','ctas','nav']){const b=record[key];assert.ok(b.width>0&&b.left>=-1&&b.right<=width+1,key+' bounds '+code+' '+width+' '+JSON.stringify(b));}
    assert.ok(record.nav.top>=record.tagline.bottom-1,'Tagline/nav overlap');
    assert.ok(record.heading.top>=record.nav.bottom-1,'Nav/title overlap');
    assert.ok(record.ctas.top>=record.heading.bottom-1,'Title/CTA overlap');
    assert.ok(record.citizenship.top>=record.ctas.bottom-1,'CTA/citizenship overlap');
    await evaluate("document.querySelector('.turkluxx-language-toggle').click()");
    if(landscape)assert.equal(await evaluate("(()=>{const r=document.querySelector('.turkluxx-language-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),true,'Language menu bounds '+code+' '+width+' '+await evaluate("JSON.stringify({rect:document.querySelector('.turkluxx-language-menu').getBoundingClientRect(),dir:getComputedStyle(document.querySelector('.turkluxx-language-menu')).direction,headerDir:getComputedStyle(document.querySelector('.turkluxx-sales-header')).direction,scrollX,landscape:matchMedia('(orientation: landscape)').matches})"));
    await evaluate("document.querySelector('.turkluxx-language-toggle').click()");
    if (!record.full) {
    await evaluate("document.querySelector('.turkluxx-mobile-menu-toggle').click()");
    const menu=await evaluate("(()=>{const e=document.querySelector('.turkluxx-mobile-menu'),r=e.getBoundingClientRect();return {hidden:e.hidden,left:r.left,right:r.right,bottom:r.bottom,top:r.top,scroll:e.scrollHeight>e.clientHeight}})()");
    assert.equal(menu.hidden,false,code+" "+width+" "+JSON.stringify(record));assert.ok(menu.left>=0&&menu.right<=width,'Menu bounds');if(width>height)assert.ok(menu.bottom<=height+1,'Menu vertical bounds '+JSON.stringify(menu));
    await evaluate("document.querySelector('.turkluxx-mobile-menu-toggle').click()");
    }
    if(landscape){
     const ctaLayout=await evaluate("(()=>{const stage=document.querySelector('.turkluxx-mobile-hero-stage').getBoundingClientRect(),group=document.querySelector('.turkluxx-mobile-primary-ctas'),g=group.getBoundingClientRect(),heading=document.querySelector('.turkluxx-sales-heading').getBoundingClientRect();const buttons=[...group.children].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,font:parseFloat(s.fontSize),padding:parseFloat(s.paddingLeft)}});return {stageBottom:stage.bottom,group:g.toJSON(),headingBottom:heading.bottom,transform:getComputedStyle(group).transform,buttons}})()");
     assert.equal(ctaLayout.transform,'none','No transform');
     assert.ok(Math.abs(ctaLayout.stageBottom-ctaLayout.group.bottom-14)<1,'14px bottom spacing '+code+' '+width+' '+JSON.stringify(ctaLayout));
     assert.ok(ctaLayout.group.top>=ctaLayout.headingBottom+7,'Clear heading gap');
     assert.ok(Math.abs(ctaLayout.group.x+ctaLayout.group.width/2-width/2)<1,'Centered CTA group');
     assert.ok(Math.abs(ctaLayout.buttons[0].y-ctaLayout.buttons[1].y)<1,'Same CTA row');
     for(const b of ctaLayout.buttons){assert.equal(b.height,46,'18% height reduction');assert.equal(b.padding,16);assert.ok(b.x>=0&&b.right<=width&&b.bottom<=ctaLayout.stageBottom-12,'Complete button within hero');}
     assert.equal(ctaLayout.buttons[0].font,12);assert.equal(ctaLayout.buttons[1].font,14);
     if(code==='en')assert.ok(ctaLayout.group.bottom<=height-12,'Fully visible in initial landscape viewport');
     if(width>=844)assert.equal(record.full,true, "Full navigation "+code+" "+width);
     assert.equal(record.toggle.display,record.full?"none":"block");
     const photo=await evaluate("(()=>{const hero=document.querySelector('.turkluxx-sales-hero'),s=getComputedStyle(hero,'::before'),stage=document.querySelector('.turkluxx-mobile-hero-stage');return {width:parseFloat(s.width),height:parseFloat(s.height),size:s.backgroundSize,needed:stage.getBoundingClientRect().bottom-hero.getBoundingClientRect().top,stageHeight:getComputedStyle(stage).height,nav:[...document.querySelectorAll('.turkluxx-home-desktop-nav a')].map(e=>({href:e.getAttribute('href'),visible:e.getBoundingClientRect().width>0,style:getComputedStyle(e).backgroundColor}))}})()");
     assert.equal(photo.width,width);assert.ok(photo.size.includes("cover"));assert.ok(photo.height>=photo.needed-1);assert.equal(photo.nav.length,4);if(record.full)assert.ok(photo.nav.every(n=>n.visible&&n.style!=="rgba(0, 0, 0, 0)"));
     assert.deepEqual(photo.nav.map(n=>n.href),["meet-our-team.html","#turkluxx-roi","#turkluxx-project-heading","#turkluxx-home-footer"]);
     if(record.full){await click(".turkluxx-home-desktop-nav .turkluxx-roi-trigger");
     assert.equal(await evaluate("document.querySelector('#turkluxx-roi').open"),true);
     await evaluate("document.querySelector('#turkluxx-roi .turkluxx-callback-close').click()");await until("!document.querySelector('#turkluxx-roi').open && getComputedStyle(document.body).position !== 'fixed'");}
     if(width===852){
      await click('.turkluxx-mobile-callback-trigger');await until("document.querySelector('#turkluxx-callback').open");
      await evaluate("document.querySelector('#turkluxx-callback .turkluxx-callback-close').click()");await until("!document.querySelector('#turkluxx-callback').open && getComputedStyle(document.body).position !== 'fixed'");
      await click('.turkluxx-home-desktop-nav [data-home-scroll="contact"]');
      await until("document.querySelector('#turkluxx-contact').open");
      await evaluate("document.querySelector('#turkluxx-contact .turkluxx-callback-close').click()"); await until("!document.querySelector('#turkluxx-contact').open && getComputedStyle(document.body).position !== 'fixed'");
      await click('.turkluxx-home-desktop-nav [data-home-scroll="properties"]');
      await until("location.hash === '#turkluxx-project-heading' && scrollY > 0"); await pause(1000);
      await evaluate("scrollTo({top:0,behavior:'instant'})"); await pause(100);
      if(code==='en'){
       const original=await evaluate("document.querySelector('.turkluxx-home-desktop-nav a').textContent");
       await evaluate("document.querySelector('.turkluxx-home-desktop-nav a').textContent='Extra long navigation label '.repeat(10)");
       await until("!document.querySelector('.turkluxx-sales-header').classList.contains('has-landscape-navigation')");
       assert.equal(await evaluate("getComputedStyle(document.querySelector('.turkluxx-mobile-menu-control')).display"),'block');
       await evaluate(`document.querySelector('.turkluxx-home-desktop-nav a').textContent=${JSON.stringify(original)}`);
       await until("document.querySelector('.turkluxx-sales-header').classList.contains('has-landscape-navigation')");
      }
     }
     if(code==="en"&&width===852&&process.argv.includes("--screenshot")){const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile(resolve(root,".tmp-landscape.png"),Buffer.from(shot.data,"base64"));}
    }
   }else if(width>=1200){assert.equal(record.ctas.display,'none');assert.notEqual(record.ornament.display,'none');assert.equal(record.toggle.display,'none');}
  }
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('Passed '+records.length+' viewport/language checks, including rotation and mobile menus.');
}finally{await send('Page.close');ws.close();server.close();}
