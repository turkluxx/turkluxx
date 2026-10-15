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
    for (const url of ['javascript:alert(1)', 'http://drive.google.com/file/d/id/view', 'https://drive.google.com.evil.example/file/d/id/view', 'https://user:secret@drive.google.com/file/d/id/view', 'https://drive.google.com/drive/folders/id', 'invalid']) assert.equal(driveUrls(url), null);
    const entries = [{ language: 'tr' }, { language: 'en' }];
    assert.equal(selectVideos(entries).length, 2);
    assert.equal(selectVideos(entries, 'tr')[0], entries[0]);
});
test('Videos source reuses the existing shell and starts without fictional entries', () => {
    const page = read('videos.html'); const team = read('meet-our-team.html');
    assert.equal(page.match(/<header\b[\s\S]*?<\/header>/)[0], team.match(/<header\b[\s\S]*?<\/header>/)[0]);
    assert.equal(page.match(/<footer\b[\s\S]*?<\/footer>/)[0], team.match(/<footer\b[\s\S]*?<\/footer>/)[0]);
    assert.match(page, /href="https:\/\/turkluxx.com\/videos"/);
    assert.match(page, /Discover our video collection — coming soon\./);
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
    const card = window.TurkLuxxVideoGallery.createVideoCard({ title: 'Test fixture', description: '', language: 'tr', orientation: 'vertical', url: 'https://drive.google.com/file/d/test/view', thumbnail: 'http://[' });
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
});
