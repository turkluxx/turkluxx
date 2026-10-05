// Verify favicon assets and Chrome favicon selection on every production page.
// Requires the local Chrome CDP endpoint at port 9228 (non-headless, minimized/hidden); sends no leads or analytics.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const workspace = resolve(import.meta.dirname, '..');
const root = process.argv.includes('--source') ? workspace : resolve(workspace, 'dist');
const origin = 'http://127.0.0.1:8807';
const server = http.createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, origin).pathname;
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) throw Error('Outside public directory');
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(file)] || 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(8807, '127.0.0.1', resolve));
const target = await fetch('http://127.0.0.1:9228/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id); pending.delete(message.id);
    message.error ? task.reject(message.error) : task.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id; pending.set(callId, { resolve, reject }); ws.send(JSON.stringify({ id: callId, method, params }));
});
const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async expression => {
    for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await pause(50); }
    throw Error('Timeout: ' + expression);
};
try {
    await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*googletagmanager.com/*', '*google-analytics.com/*'] });
    const files=JSON.parse(await readFile(resolve(workspace,'scripts/public-files.json'),'utf8'));
    const pages=[...new Set([...files.filter(file=>file.endsWith('.html')),'rengi-antalya.html'])];
    const expected=['/favicon.ico','/img/favicon/favicon-16x16.png','/img/favicon/favicon-32x32.png','/img/favicon/apple-touch-icon.png','/site.webmanifest'];
    for(const file of pages){
        await send('Page.navigate',{url:origin+'/'+file});
        await until('document.readyState === "complete"'); await pause(500);
        const links=await evaluate(`[...document.head.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]')].map(e=>({rel:e.rel,url:e.getAttribute('href'),sizes:e.sizes.value}))`);
        assert.deepEqual(links.map(e=>e.url),expected,file+': shared head');
        for(const {url} of links){
            const response=await fetch(origin+url);assert.equal(response.status,200,file+': '+url);
            assert.ok((await response.arrayBuffer()).byteLength>0);
        }
        assert.equal(links.find(e=>e.rel==='apple-touch-icon').sizes,'180x180');
        const sizes=await evaluate(`Promise.all([...document.head.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')].map(e=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve({url:e.getAttribute('href'),width:i.naturalWidth,height:i.naturalHeight});i.onerror=reject;i.src=e.href;})))`);
        assert.ok(sizes.every(i=>i.width===i.height));
        assert.equal(sizes.find(i=>i.url.endsWith('16x16.png')).width,16);
        assert.equal(sizes.find(i=>i.url.endsWith('32x32.png')).width,32);
        assert.equal(sizes.find(i=>i.url.endsWith('apple-touch-icon.png')).width,180);
        const parsed=await send('Page.getAppManifest');
        assert.equal(parsed.errors.length,0,file+': Chrome parsed the manifest');
        assert.equal(JSON.parse(parsed.data).name,'TurkLuxx');
        const manifest=await fetch(origin+'/site.webmanifest').then(r=>r.json());
        for(const icon of manifest.icons){
            assert.equal((await fetch(origin+icon.src)).status,200);
        }
        console.log(file+': all favicon URLs 200, square icons decoded, Apple and Android configuration passed');
    }
    // Chrome's own favicon service returns the icon selected for its browser tab.
    await pause(500);
    await send('Page.navigate',{url:'chrome://favicon/size/32@1x/'+origin+'/index.html'});
    await until('document.readyState === "complete" && !!document.querySelector("img")?.complete');
    const tabIcon=await evaluate(`(()=>{const i=document.querySelector('img'),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return {width:c.width,height:c.height,pixels:[...ctx.getImageData(0,0,c.width,c.height).data]}})()`);
    // Compare the actual cached browser icon with the supplied 32px PNG pixels.
    await send('Page.navigate',{url:origin+`/img/favicon/favicon-${tabIcon.width}x${tabIcon.height}.png`});
    await until('document.readyState === "complete" && !!document.querySelector("img")?.complete');
    const expectedPixels=await evaluate(`(()=>{const i=document.querySelector('img'),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return [...ctx.getImageData(0,0,c.width,c.height).data]})()`);
    assert.ok([16,32].includes(tabIcon.width));assert.equal(tabIcon.height,tabIcon.width);
    assert.ok(JSON.stringify(tabIcon.pixels)===JSON.stringify(expectedPixels),'Chrome tab favicon matches the generated TL icon');
    console.log('Chrome browser-tab favicon matches the attached-image icon pixel for pixel.');
    // Inspect decoded alpha and compositing on both light and dark UI surfaces.
    await send('Page.navigate', { url: origin + '/index.html' });
    await until('document.readyState === "complete"');
    const assets = ['/img/favicon/favicon-16x16.png', '/img/favicon/favicon-32x32.png',
        '/img/favicon/apple-touch-icon.png', '/img/favicon/android-chrome-192x192.png',
        '/img/favicon/android-chrome-512x512.png', '/favicon.ico'];
    const alpha = await evaluate(`Promise.all(${JSON.stringify(assets)}.map(url=>new Promise((resolve,reject)=>{
        const image=new Image(); image.onload=()=>{
            const canvas=document.createElement('canvas'); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
            const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
            const corners=[[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]];
            const values=corners.map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);
            const backgrounds=['#ffffff','#071e34'].map(background=>{
                ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
                return corners.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);
            });resolve({url,values,backgrounds});
        };image.onerror=reject;image.src=url;
    })))`);
    for (const icon of alpha) {
        assert.deepEqual(icon.values, [0,0,0,0], icon.url + ': four transparent corners');
        for (const pixel of icon.backgrounds[0]) assert.deepEqual(pixel, [255,255,255,255]);
        for (const pixel of icon.backgrounds[1]) assert.deepEqual(pixel, [7,30,52,255]);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1040, height: 500, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(()=>{
        document.documentElement.lang='en';document.documentElement.dir='ltr';document.body.removeAttribute('style');
        document.head.insertAdjacentHTML('beforeend','<style>body{margin:0!important;padding:0!important;font:14px Arial!important;background:white!important}section{height:250px;box-sizing:border-box;padding:22px 30px}h2{margin:0 0 24px;font:bold 18px Arial} .icon-preview{display:flex;gap:24px;align-items:center}figure{margin:0;width:140px;text-align:center}figure img{display:block;margin:0 auto 14px;max-width:120px;max-height:120px}figcaption{font:12px Arial}.light{background:#fff;color:#071e34}.dark{background:#071e34;color:#f3d992}</style>');
        document.body.innerHTML=['light','dark'].map(theme=>'<section class="'+theme+'"><h2>'+theme.toUpperCase()+' UI BACKGROUND</h2><div class="icon-preview">'+${JSON.stringify(assets)}.map(url=>'<figure><img src="'+url+'"><figcaption>'+url.split('/').pop()+'</figcaption></figure>').join('')+'</div></section>').join('');
    })()`);
    await until('[...document.querySelectorAll("figure img")].every(image=>image.complete && image.naturalWidth>0)');
    const preview = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(workspace, 'build/favicon-transparency.png'), Buffer.from(preview.data, 'base64'));
    console.log('All PNG/ICO corners alpha=0; light/dark compositing passed. Preview: build/favicon-transparency.png');
} finally {
    await fetch(`http://127.0.0.1:9228/json/close/${target.id}`);
    ws.close();server.close();
}
