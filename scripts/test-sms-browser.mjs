// Local Chrome CDP checks. Start Chrome with --remote-debugging-port=9227.
// node scripts/test-sms-browser.mjs [--dist]
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
const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/api/lead') {
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
    await evaluate(`TurkLuxxI18n.ready`); await pause(250);
}
const catalogs = Object.fromEntries(await Promise.all(['en', 'ru', 'es', 'ar', 'tr', 'nl'].map(async code => [code, JSON.parse(await readFile(resolve(root, `locales/${code}.json`), 'utf8'))])));

try {
 let submissions = 0;
 const phones = [
   ['+19495551234', '+1 949 555 1234'], ['+31612345678', '+31 6 1234 5678'],
   ['+447911123456', '+44 7911 123456'], ['+905321234567', '+90 532 123 45 67']
 ];
 for (const width of [1440, 320, 375, 390]) {
  await send('Emulation.setDeviceMetricsOverride', {width,height:700,deviceScaleFactor:1,mobile:width<768});
  for (const code of Object.keys(catalogs)) {
   await navigate('/?lang='+code);
   let sharedDesign;
   for (const selector of ['#turkluxx-callback', '#turkluxx-contact']) {
    await evaluate(selector === '#turkluxx-contact' ? "document.querySelector('.turkluxx-footer-legal [data-home-scroll=contact]').click()" : "document.querySelector('.turkluxx-callback-trigger').click()");
    await until('document.querySelector('+JSON.stringify(selector)+').open');
    const inspect = await evaluate(`(() => { const d=document.querySelector(${JSON.stringify(selector)}); return { controls: [...d.querySelectorAll('[type=checkbox]')].map(c=>({checked:c.checked,required:c.required,label:c.closest('label').innerText})), dir:getComputedStyle(d).direction, links:[...d.querySelectorAll('.turkluxx-sms-consent a')].map(a=>a.getAttribute('href')) }; })()`);
    assert.equal(inspect.controls.length,2);
    inspect.controls.forEach(c=>{assert.equal(c.checked,false);assert.equal(c.required,false);});
    assert.equal(inspect.controls[0].label,catalogs[code]['sms.transactionalConsent']);
    assert.equal(inspect.controls[1].label,catalogs[code]['sms.marketingConsent']);
    assert.equal(inspect.dir,code==='ar'?'rtl':'ltr');
    assert.deepEqual(inspect.links,[]);
    const structure = await evaluate(`(() => {const d=document.querySelector(${JSON.stringify(selector)}),f=d.querySelector('form'),s=getComputedStyle(d);return {fields:[...f.elements].filter(e=>e.name && e.type!=="hidden").map(e=>({name:e.name,required:e.required,type:e.type,rows:e.rows,maxLength:e.maxLength,label:e.labels[0]?.textContent})),design:{padding:s.padding,border:s.border,background:s.background,width:d.getBoundingClientRect().width,fields:[...f.querySelectorAll('.turkluxx-callback-field')].map(field=>{const e=field.querySelector('input,textarea'),s=getComputedStyle(e),l=getComputedStyle(field.querySelector('label'));return {width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,font:s.font,padding:s.padding,border:s.border,labelFont:l.font,spacing:getComputedStyle(field).marginBottom}})}};})()`);
    assert.deepEqual(structure.fields.map(f=>f.name),['name','phone','email','message','smsTransactionalConsent','smsMarketingConsent']);
    assert.deepEqual(structure.fields.map(f=>f.required),[true,false,true,false,false,false]);
    assert.equal(structure.fields[3].type,'textarea');assert.equal(structure.fields[3].rows,4);assert.equal(structure.fields[3].maxLength,2000);
    assert.deepEqual(structure.fields.slice(0,4).map(f=>f.label),['contact.name','contact.phone','contact.email','contact.message'].map(key=>catalogs[code][key]));
    if(sharedDesign)assert.deepEqual(structure.design,sharedDesign,'Both forms have identical field and modal styling');else sharedDesign=structure.design;
    const phoneSettings = await evaluate(`(() => {const f=document.querySelector(${JSON.stringify(selector)}).querySelector('form'), p=f.elements.phone;return {type:p.type, autocomplete:p.autocomplete, inputmode:p.inputMode, dir:getComputedStyle(p).direction, placeholder:p.placeholder, hasCountry:!!f.elements.country};})()`);
    assert.deepEqual(phoneSettings,{type:'tel',autocomplete:'tel',inputmode:'tel',dir:'ltr',placeholder:'+1 949 555 1234',hasCountry:false});
    // Scroll the full disclaimer into view and verify it is neither hidden nor clipped.
    for (const consentIndex of [0,1]) {
    const visible = await evaluate(`(() => { const d=document.querySelector(${JSON.stringify(selector)}), text=d.querySelectorAll('.turkluxx-sms-consent span')[${consentIndex}]; text.scrollIntoView({block:'center'}); const r=text.getBoundingClientRect(), box=d.getBoundingClientRect(), s=getComputedStyle(text); return { font:parseFloat(s.fontSize), visible: s.display!=='none' && s.visibility==='visible' && r.height>0 && r.top>=Math.max(box.top,0) && r.bottom<=Math.min(box.bottom,innerHeight), overflow:d.scrollWidth>d.clientWidth+1 }; })()`);
    assert.equal(visible.visible,true,JSON.stringify({width,code,selector,visible}));
    assert.equal(visible.overflow,false);
    assert.equal(visible.font,width===1440?11.5:12);
    }
    if (selector === '#turkluxx-contact') {
      const details = await evaluate(`(() => {const f=document.querySelector('#turkluxx-contact form');return {phoneType:f.elements.phone.type, phoneLabel:f.elements.phone.labels[0].innerText, hasCountry:!!f.elements.country};})()`);
      assert.equal(details.phoneType,'tel');
      assert.equal(details.phoneLabel,catalogs[code]['contact.phone']);
      assert.equal(details.hasCountry,false);
    }
    if (width===320 && ['en','ar'].includes(code)) {
      await mkdir(resolve(root,'build/separate-consent'),{recursive:true});
      const shot=await send('Page.captureScreenshot',{format:'png'});
      await writeFile(resolve(root,`build/separate-consent/${code}-${selector.slice(1)}.png`),Buffer.from(shot.data,'base64'));
    }
    // Exercise actual browser typing, deletion, middle edits, and paste events.
    if ((code==='en' && [1440,390].includes(width)) || (code==='ar' && width===320)) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('[name=phone]').focus()`);
      await evaluate(`import('./js/phone-format.js').then(m => m.attachPhoneInput(document.querySelector(${JSON.stringify(selector)}).querySelector('[name=phone]')))`);
      for (const [number, display] of phones) {
        await evaluate(`document.activeElement.value='';`);
        for (const digit of number) await send('Input.insertText',{text:digit});
        assert.equal(await evaluate('document.activeElement.value'),display);
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
        assert.equal(await evaluate('document.activeElement.value'),display.slice(0,-1));
        await send('Input.insertText',{text:number.at(-1)});
        assert.equal(await evaluate('document.activeElement.value'),display);
        await evaluate('document.activeElement.setSelectionRange(2,3)');
        await send('Input.insertText',{text:'9'});
        assert.equal(await evaluate('document.activeElement.selectionStart'),3);
        await evaluate(`document.activeElement.value='';`);
        const pasted=display.replaceAll(' ','-');
        // insertFromPaste is a native input event type; clipboard input must keep all digits.
        await evaluate(`(() => {const p=document.activeElement;p.value=${JSON.stringify(pasted)};p.setSelectionRange(p.value.length,p.value.length);p.dispatchEvent(new InputEvent('input',{inputType:'insertFromPaste',bubbles:true}));})()`);
        assert.equal(await evaluate('document.activeElement.value'),display);
      }
      const national='0612345678';
      await evaluate(`document.activeElement.value='';`);
      await send('Input.insertText',{text:national});
      assert.equal(await evaluate('document.activeElement.value'),national);
    }
    const [phoneNumber,phoneDisplay] = phones[Object.keys(catalogs).indexOf(code)%phones.length];
    for(const includePhone of [false,true]) for(const consent of [false,true]) for(const marketingConsent of [false,true]) for(const messageText of ['', 'Consent test message\nPlease call me.']) {
     const before=messages.length;
     await evaluate(`(() => { const f=document.querySelector(${JSON.stringify(selector)}).querySelector('form'); f.elements.name.value='SMS Test'; f.elements.email.value='sms@example.com'; f.elements.phone.value=${JSON.stringify(includePhone ? phoneDisplay : '')}; f.elements.message.value=${JSON.stringify(messageText)}; f.elements.smsTransactionalConsent.checked=${consent}; f.elements.smsMarketingConsent.checked=${marketingConsent}; [...f.querySelectorAll("input, textarea")].forEach(c=>c.dispatchEvent(new Event("input",{bubbles:true}))); f.requestSubmit(); })()`);
     for(let i=0;i<100 && messages.length===before;i++) await pause(30);
     assert.equal(messages.length,before+1, JSON.stringify({selector,code,consent,errors,payloads}));
     await until(`!document.querySelector(${JSON.stringify(selector)}).querySelector('[type=submit]').disabled`);
     const payload=payloads.at(-1), email=messages.at(-1);
     assert.equal(payload.smsTransactionalConsent,consent);
     assert.equal(payload.smsMarketingConsent,marketingConsent);
     assert.ok(email.text.includes('Transactional / Informational SMS Consent: '+(consent?'YES':'NO')));
     assert.ok(email.text.includes('Promotional / Marketing SMS Consent: '+(marketingConsent?'YES':'NO')));
     assert.equal(payload.phone,includePhone ? phoneNumber : '');
     assert.ok(email.text.includes('Phone: '+(includePhone ? phoneNumber : 'Not provided')));
     assert.equal(Object.hasOwn(payload,'country'),false);
     assert.ok(!email.text.includes('Country:'));
     assert.ok(email.text.includes('SMS Test')); assert.ok(email.text.includes('sms@example.com'));
     assert.equal(payload.message,messageText);
     assert.ok(email.text.includes('Message:\n'+(messageText || 'Not provided')));
     assert.equal(payload.source,selector === '#turkluxx-contact'?'general-contact':'callback');
     assert.ok(email.text.includes('Form source: '+(selector === '#turkluxx-contact'?'Contact Us':'Request a Callback')));
     submissions++;
    }
    // Native keyboard toggling and focus scroll controls into view.
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('[name=smsTransactionalConsent]').focus()`);
    const checked=await evaluate(`document.activeElement.checked`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate(`document.activeElement.checked`),!checked);
    assert.equal(await evaluate(`(() => {const d=document.querySelector(${JSON.stringify(selector)});const b=d.querySelector('[type=submit]');b.focus();b.scrollIntoView({block:'end'});const r=b.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && d.scrollWidth<=d.clientWidth+1;})()`),true);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('.turkluxx-callback-close').click()`);
    await until('!document.querySelector('+JSON.stringify(selector)+').open');
   }
  }
 }
 // Every static page uses the same callback field template and Contact Us clone.
 let pageChecks=0;
 for(const path of ['/', '/rengi-istanbul.html', '/rengi-antalya.html', '/meet-our-team.html', '/videos.html', '/privacy-policy.html', '/terms-and-conditions.html', '/cookie-policy.html', '/disclaimer.html']) {
  for(const code of Object.keys(catalogs)) {
   await navigate(path+'?lang='+code);
   const forms=await evaluate(`['#turkluxx-callback','#turkluxx-contact'].map(selector=>{const d=document.querySelector(selector),f=d.querySelector('form');return {sharedStyle:d.classList.contains('turkluxx-inquiry'),names:[...f.elements].filter(e=>e.name && e.type!=="hidden").map(e=>e.name),required:[...f.elements].filter(e=>e.name && e.type!=="hidden").map(e=>e.required),labels:[...f.querySelectorAll('.turkluxx-callback-field label')].map(l=>l.textContent),idsValid:[...f.querySelectorAll('label[for]')].every(l=>l.control && f.contains(l.control))};})`);
   for(const form of forms){assert.equal(form.sharedStyle,true);assert.equal(form.idsValid,true);assert.deepEqual(form.names,['name','phone','email','message','smsTransactionalConsent','smsMarketingConsent']);assert.deepEqual(form.required,[true,false,true,false,false,false]);assert.deepEqual(form.labels,['contact.name','contact.phone','contact.email','contact.message'].map(key=>catalogs[code][key]));}
   if (path === '/privacy-policy.html') {
    const policy = await evaluate(`['heading','noSharing','providers','optIn'].map(key=>document.querySelector('[data-i18n="privacy.sms.'+key+'"]').textContent)`);
    assert.deepEqual(policy,['heading','noSharing','providers','optIn'].map(key=>catalogs[code]['privacy.sms.'+key]));
   }
   pageChecks++;
  }
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS: '+submissions+' submissions; both forms, all six languages, 1440/320/375/390px, full disclaimer visible, footer popup, normalized phone, no Country, keyboard toggling, RTL and visible Submit. Email binding mocked; no live email sent.');
 console.log('PASS: '+pageChecks+' page/language checks; identical field order, validation attributes, translations and accessible labels across all nine pages.');
} finally {
 ws.close(); server.closeAllConnections(); server.close();
 await fetch('http://127.0.0.1:9227/json/close/'+target.id).catch(()=>{});
}
