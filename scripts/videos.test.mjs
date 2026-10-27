import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('Drive URLs accept only HTTPS Drive files and retain resource keys', () => {
    const window = { TurkLuxxI18n: { ready: new Promise(() => {}) } };
    runInNewContext(read('js/videos.js'), { window, URL });
    const { driveUrls, selectVideos } = window.TurkLuxxVideoGallery;
    assert.equal(driveUrls('https://drive.google.com/file/d/test_id/view?usp=sharing').preview, 'https://drive.google.com/file/d/test_id/preview');
    assert.equal(driveUrls('https://drive.google.com/open?id=test_id&resourcekey=key').preview, 'https://drive.google.com/file/d/test_id/preview?resourcekey=key');
    for (const url of ['javascript:alert(1)', 'http://drive.google.com/file/d/id/view', 'https://drive.google.com.evil.example/file/d/id/view', 'https://user:secret@drive.google.com/file/d/id/view', 'https://drive.google.com/drive/folders/id', 'invalid input']) assert.equal(driveUrls(url), null);
    const entries = [{ language: 'tr', provider: 'google-drive' }, { language: 'en', provider: 'youtube' }];
    assert.equal(selectVideos(entries).length, 1);
    assert.equal(selectVideos(entries, 'tr')[0], entries[0]);
});
test('Videos source reuses the existing shell and starts without fictional entries', () => {
    const page = read('videos.html'); const team = read('meet-our-team.html');
    assert.equal(page.match(/<header\b[\s\S]*?<\/header>/)[0], team.match(/<header\b[\s\S]*?<\/header>/)[0].replace(/            <a href="\/videos"[^>]*>[^<]*<\/a>\r?\n/, ''));
    assert.equal(page.match(/<footer\b[\s\S]*?<\/footer>/)[0], team.match(/<footer\b[\s\S]*?<\/footer>/)[0]);
    assert.match(page, /href="https:\/\/turkluxx.com\/videos"/);
    assert.match(page, /https:\/\/drive.google.com\/file\/d\/1YKYxx2zbyk9ky92dLavOF-rv9Mr6X_Lw\/preview/);
    const window = {}; runInNewContext(read('js/videos-data.js'), { window });
    assert.equal(window.TurkLuxxVideos.length, 0);
    for (const code of ['en','ru','es','ar','tr','nl']) {
        const catalog = JSON.parse(read(`locales/${code}.json`));
        for (const key of ['heading','subtitle','empty','pageTitle','play','fallback','open','unavailable']) assert.ok(catalog[`videos.${key}`]);
    }
});
test('Players load only on activation, preserve orientation and retain an error fallback', () => {
    class Node {
        children = []; dataset = {}; events = {};
        append(...nodes) { this.children.push(...nodes); }
        replaceChildren(...nodes) { this.children = nodes; }
        setAttribute(name, value) { this[name] = value; }
        addEventListener(type, callback) { this.events[type] = callback; }
        focus() { this.focused = true; }
        remove() { this.removed = true; }
    }
    const created = [];
    const document = { createElement(tag) { const node = new Node(); node.tag = tag; created.push(node); return node; } };
    const window = { TurkLuxxI18n: { ready: new Promise(() => {}), bind(node, key, values, attribute) { node[attribute || 'textContent'] = key; } } };
    runInNewContext(read('js/videos.js'), { window, document, URL, location: new URL('https://turkluxx.com/videos') });
    const card = window.TurkLuxxVideoGallery.createVideoCard({ title: 'Test fixture', description: '', language: 'tr', provider: 'google-drive', orientation: 'vertical', url: 'https://drive.google.com/file/d/test/view', thumbnail: 'http://[' });
    assert.match(card.children[0].className, /is-vertical/);
    assert.equal(created.filter(node => node.tag === 'iframe').length, 0);
    created.find(node => node.tag === 'button').events.click();
    const iframe = created.find(node => node.tag === 'iframe');
    assert.equal(iframe.src, 'https://drive.google.com/file/d/test/preview');
    assert.equal(iframe.title, 'Test fixture');
    assert.equal(iframe.focused, true);
    iframe.events.error();
    assert.equal(iframe.removed, true);
    assert.ok(created.some(node => node.textContent === 'videos.unavailable'));
    assert.ok(created.some(node => node.tag === 'a' && node.href.endsWith('/view')));
    const start = created.length;
    const youtubeCard = window.TurkLuxxVideoGallery.createVideoCard({ title: 'YouTube test fixture', description: '', language: 'en', provider: 'youtube', videoId: 'abcdefghijk' });
    assert.equal(youtubeCard.children[0].className, 'video-media');
    assert.equal(created.slice(start).some(node => node.tag === 'iframe'), false);
    created.slice(start).find(node => node.tag === 'button').events.click();
    const youtubeFrame = created.slice(start).find(node => node.tag === 'iframe');
    assert.equal(youtubeFrame.src, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
    assert.equal(youtubeFrame.loading, 'lazy');
    assert.equal(youtubeFrame.allowFullscreen, true);
    assert.equal(youtubeFrame.referrerPolicy, 'strict-origin-when-cross-origin');
    assert.ok(!youtubeFrame.src.includes('autoplay'));
});
test('EN and NL share English YouTube records; other languages require their own Drive records', () => {
    const window = { TurkLuxxI18n: { ready: new Promise(() => {}) } };
    runInNewContext(read('js/videos.js'), { window, URL });
    const { selectVideos, youtubeUrls, driveUrls } = window.TurkLuxxVideoGallery;
    const english = { id: 'english', language: 'en', provider: 'youtube', order: 2 };
    const earlier = { id: 'earlier', language: 'en', provider: 'youtube', order: 1 };
    const entries = [english, earlier, { language: 'nl', provider: 'google-drive' }, { language: 'en', provider: 'google-drive' }];
    for (const code of ['es', 'ru', 'tr', 'ar']) entries.push({ id: code, language: code, provider: 'google-drive' }, { language: code, provider: 'youtube' });
    for (const code of ['en', 'nl']) {
        const selected = selectVideos(entries, code);
        assert.equal(selected.length, 2); assert.equal(selected[0], earlier); assert.equal(selected[1], english);
    }
    for (const code of ['es', 'ru', 'tr', 'ar']) {
        assert.equal(selectVideos(entries, code).length, 1);
        assert.equal(selectVideos(entries, code)[0].id, code);
        assert.equal(selectVideos([english], code).length, 0);
    }
    assert.equal(selectVideos(entries, 'unknown').length, 0);
    // Synthetic identifiers are confined to tests, never shipped as content.
    for (const value of ['abcdefghijk', 'https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk&autoplay=1', 'https://www.youtube.com/shorts/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk']) {
        assert.equal(youtubeUrls(value).preview, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
    }
    for (const value of ['short', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'http://youtu.be/abcdefghijk', 'https://user:pass@youtube.com/watch?v=abcdefghijk', 'javascript:alert(1)']) assert.equal(youtubeUrls(value), null);
    assert.equal(driveUrls('test_id').preview, 'https://drive.google.com/file/d/test_id/preview');
});
test('Language changes rerender the collection, remove active players, and show empty states', async () => {
    const listeners = {};
    const gallery = { children: [], replaceChildren(...nodes) { this.children = nodes; } };
    const empty = { hidden: false };
    const document = { querySelector: () => null, getElementById: id => id === 'videos-gallery' ? gallery : empty };
    const window = { TurkLuxxVideos: [], TurkLuxxI18n: { ready: Promise.resolve(), language: 'nl' }, addEventListener(type, handler) { listeners[type] = handler; } };
    runInNewContext(read('js/videos.js'), { window, document, URL });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof listeners['turkluxx:language-change'], 'function');
    assert.equal(empty.hidden, false);
    gallery.children = ['active player'];
    window.TurkLuxxI18n.language = 'ar'; listeners['turkluxx:language-change']();
    assert.equal(gallery.children.length, 0); assert.equal(empty.hidden, false);
    for (const code of ['en','nl','es','ru','tr','ar']) {
        const catalog = JSON.parse(read(`locales/${code}.json`));
        assert.match(catalog['videos.fallback'], /\{provider\}/);
        assert.match(catalog['videos.open'], /\{provider\}/);
    }
});
