// Verify the live coordinate iframe and translated external link in Chrome.
// Requires Chrome's existing CDP endpoint at port 9227.
import http from 'node:http';
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
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const coordinates='41.036278,28.614722';
const expectedEmbed='https://maps.google.com/maps?q=41.036278,28.614722&ll=41.036278,28.614722&z=13&hl=en&t=m&output=embed';
const {writeFileSync}=await import('node:fs');
try {
    await send('Page.enable');await send('Network.enable');
    for(const width of [1440,390]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
        for(const path of ['/', '/rengi-istanbul.html']) {
            await send('Page.navigate',{url:'http://127.0.0.1:8804'+path+'?lang=en'});
            for(let attempt=0;attempt<100;attempt++) {
                if(await evaluate(`!!window.TurkLuxxI18n && !!document.querySelector('.rengi-map-open')`))break;
                await pause(50);
            }
            await evaluate(`TurkLuxxI18n.ready`);
            for(const code of ['en','nl','tr','es','ru','ar']) {
                await evaluate(`TurkLuxxI18n.setLanguage('${code}')`);
                const link=await evaluate(`(()=>{const a=document.querySelector('.rengi-map-open'),r=a.getBoundingClientRect(),m=a.parentElement.getBoundingClientRect();return {href:a.href,target:a.target,rel:a.rel,text:a.textContent,translated:TurkLuxxI18n.t('istanbul.open_google_maps'),fits:r.left>=m.left&&r.right<=m.right&&r.top>=m.top&&r.bottom<=m.bottom,src:document.querySelector('.rengi-map iframe').src};})()`);
                assert.equal(link.src,expectedEmbed);assert.equal(new URL(link.href).searchParams.get('query'),coordinates);
                assert.equal(link.target,'_blank');assert.ok(link.rel.includes('noopener'));
                assert.equal(link.text,link.translated);assert.ok(link.fits,JSON.stringify({width,code,link}));
            }
            await evaluate(`TurkLuxxI18n.setLanguage('en')`);
            await evaluate(`document.querySelector('.rengi-map').scrollIntoView({block:'center',behavior:'instant'})`);
            await pause(4500);
            const screenshot=await send('Page.captureScreenshot',{format:'png'});
            writeFileSync(resolve(root,`build/maps-${width}-${path==='/'?'home':'project'}.png`),Buffer.from(screenshot.data,'base64'));
        }
    }
    const targets=await send('Target.getTargets');
    const map=targets.targetInfos.find(t=>t.type==='iframe'&&/google\.com\/maps/.test(t.url));
    assert.ok(map,'Google Maps iframe loaded');
    console.log('Loaded Google iframe:',map.url);
    const remote=(sessionId,method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}));});
    const iframeSession=await send('Target.attachToTarget',{targetId:map.targetId,flatten:true});
    const iframeBody=await remote(iframeSession.sessionId,'Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true});
    assert.ok(iframeBody.result.value.includes('Map data'),'Live map rendered, not a network error');
    const point=await evaluate(`(()=>{const r=document.querySelector('.rengi-map-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    await pause(6000);
    const opened=(await send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&/google\.com\/maps/.test(t.url));
    assert.ok(opened,'External Google Maps tab opened from link click');
    console.log('External Maps tab:',opened.url);
    const externalSession=await send('Target.attachToTarget',{targetId:opened.targetId,flatten:true});
    // Fresh European test profiles may encounter Google's consent page first.
    // Reject optional cookies in this isolated verification profile.
    await remote(externalSession.sessionId,'Runtime.evaluate',{expression:`Array.from(document.querySelectorAll('button')).find(e=>/Alles afwijzen|Reject all/i.test(e.innerText))?.click()`,userGesture:true});
    await pause(6500);
    const external=await remote(externalSession.sessionId,'Runtime.evaluate',{expression:'JSON.stringify({url:location.href,text:document.body.innerText.slice(0,5000)})',returnByValue:true});
    console.log('External map result:',external.result.value);
    const result=JSON.parse(external.result.value);
    assert.ok(new URL(result.url).hostname.endsWith('google.com') && new URL(result.url).pathname.startsWith('/maps'),'Google Maps opened after consent');
    assert.ok(decodeURIComponent(result.url).includes(coordinates),'External map retained exact coordinate query');
    const externalShot=await remote(externalSession.sessionId,'Page.captureScreenshot',{format:'png'});
    writeFileSync(resolve(root,'build/maps-external.png'),Buffer.from(externalShot.data,'base64'));
    await send('Target.closeTarget',{targetId:opened.targetId});
    console.log('PASS: unchanged iframe/coordinates/zoom, two pages, desktop/mobile, six translations and RTL, link bounds and real new-tab Google Maps navigation.');
} finally {await send('Page.close');socket.close();for(const server of servers)server.close();}
