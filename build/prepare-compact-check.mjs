import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile('scripts/test-i18n-browser.mjs','utf8');const prefix=source.slice(0,source.indexOf('const catalogs =')).replace("resolve(import.meta.dirname, '..')","process.cwd()");
const tail=`
const results=[];const codes=['en','nl','ru','es','tr','ar'];
try{
for(const path of ['/', '/rengi-istanbul.html','/rengi-antalya.html','/meet-our-team.html']){
await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
await navigate(path+'?lang=en');
const hrefs=await evaluate("[...document.querySelectorAll('.turkluxx-home-desktop-nav a, .rengi-header-shell .turkluxx-sales-nav a')].map(e=>e.getAttribute('href'))");
for(const code of codes){
await evaluate('TurkLuxxI18n.setLanguage('+JSON.stringify(code)+')');await evaluate('document.fonts.ready');
const r=await evaluate(\`(() => {const nav=document.querySelector('.turkluxx-home-desktop-nav, .rengi-header-shell .turkluxx-sales-nav');return {height:nav.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,rows:[...nav.querySelectorAll('a')].map(e=>({text:e.textContent,key:e.dataset.i18nMobile,expected:e.dataset.i18nMobile?TurkLuxxI18n.t(e.dataset.i18nMobile):e.textContent,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight,display:getComputedStyle(e).display,dir:getComputedStyle(e).direction,icon:getComputedStyle(e,'::before').backgroundImage,href:e.getAttribute('href')}))}})()\`);
assert.equal(r.overflow,false,path+code);assert.deepEqual(r.rows.map(e=>e.href),hrefs);
for(const row of r.rows){assert.equal(row.text,row.expected);assert.equal(row.display,'grid');assert.equal(row.font,'15px');assert.equal(row.weight,'700');assert.ok(row.height>=44);assert.ok(row.icon.includes('svg'));assert.equal(row.dir,code==='ar'?'rtl':'ltr');}
assert.ok(r.height<=190,path+code+' height '+r.height);
await evaluate("document.querySelector('.turkluxx-home-desktop-nav .turkluxx-roi-trigger, .rengi-header-shell .turkluxx-roi-trigger').click()");
assert.equal(await evaluate("document.querySelector('#turkluxx-roi').open"),true);await evaluate("document.querySelector('#turkluxx-roi').close()");
const png=await send('Page.captureScreenshot',{format:'png'});await writeFile('build/compact-'+(path==='/'?'home':path.slice(1).replace('.html',''))+'-'+code+'.png',Buffer.from(png.data,'base64'));
results.push({path,code,height:r.height,labels:r.rows.map(e=>e.text)});
// Check full labels and undecorated desktop rows after crossing the breakpoint.
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await pause(80);
assert.equal(await evaluate("[...document.querySelectorAll('[data-i18n-mobile]')].every(e=>e.textContent===TurkLuxxI18n.t(e.dataset.i18n)&&getComputedStyle(e,'::before').backgroundImage==='none'&&getComputedStyle(e,'::after').content==='none')"),true,path+code+' desktop');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await pause(80);
assert.equal(await evaluate("[...document.querySelectorAll('[data-i18n-mobile]')].every(e=>e.textContent===TurkLuxxI18n.t(e.dataset.i18nMobile))"),true);
}
}
assert.equal(errors.length,0,JSON.stringify(errors));await writeFile('build/compact-menu-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await fetch('http://127.0.0.1:9227/json/close/'+target.id);ws.close();server.close();}
`;
await writeFile('build/check-compact-menu.mjs',prefix+tail);
