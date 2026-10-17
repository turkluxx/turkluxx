import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/referral.js', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../js/referral-registry.js', import.meta.url), 'utf8');
function visit(search, storage = new Map(), blocked = false) {
    const handlers = new Map();
    const links = ['https://wa.me/12137322002', 'tel:+12137322002', 'tel:+18184347266', 'https://example.com/', 'tel:+442012345678']
        .map(href => ({ href, getAttribute() { return this.href; }, setAttribute(_, value) { this.href = value; } }));
    const nodes = ['+1 (213) 732-2002', '\n  +1 818 434 7266\n ', 'Call +1 (213) 732-2002 today', '+44 20 1234 5678']
        .map(nodeValue => ({ nodeValue, parentElement: { closest() { return null; } } }));
    const window = { location: new URL(search, 'https://turkluxx.com'), addEventListener(name, fn) { handlers.set(name, fn); } };
    const document = {
        body: {}, querySelectorAll: () => links,
        addEventListener(name, fn) { handlers.set(name, fn); },
        createTreeWalker() { let i = -1; return { nextNode() { return ++i < nodes.length; }, get currentNode() { return nodes[i]; } }; }
    };
    const localStorage = {
        getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); }
    };
    runInNewContext(registry + source, { window, document, localStorage, sessionStorage: localStorage, URLSearchParams, NodeFilter: { SHOW_TEXT: 4 } });
    handlers.get('DOMContentLoaded')();
    return { window, links, nodes, storage, refresh: () => handlers.get('turkluxx:language-change')() };
}

for (const ref of ['VLAD', 'ALMA']) {
    test(`${ref}: all contact numbers dial the override and retain attribution across clean URLs and language changes`, () => {
        const entry = visit(`/?ref=${ref}`);
        const attribution = JSON.stringify(entry.window.getTurkLuxxReferralAttribution());
        for (const path of ['/', '/videos', '/rengi-istanbul.html', '/rengi-antalya.html', '/meet-our-team.html?lang=ar']) {
            const page = visit(path, entry.storage);
            page.refresh(); page.refresh();
            assert.deepEqual(page.links.slice(0, 3).map(link => link.href), Array(3).fill('tel:+19493314195'));
            assert.deepEqual(page.nodes.slice(0, 3).map(node => node.nodeValue), ['+1 (949) 331-4195', '\n  +1 (949) 331-4195\n ', 'Call +1 (949) 331-4195 today']);
            assert.equal(page.links[3].href, 'https://example.com/');
            assert.equal(page.links[4].href, 'tel:+442012345678');
            assert.equal(page.nodes[3].nodeValue, '+44 20 1234 5678');
            assert.equal(JSON.stringify(page.window.getTurkLuxxReferralAttribution()), attribution);
        }
        for (const code of [ref, ref.toLowerCase()]) {
            assert.equal(visit(`/?ref=${code}`, new Map(), true).links[0].href, 'tel:+19493314195');
        }
        const subref = visit('/?ref=MOHAMED&subref=MOHAMED_ABDO', entry.storage);
        assert.equal(subref.links[0].href, 'https://wa.me/12137322002');
        assert.equal(JSON.stringify(subref.window.getTurkLuxxReferralAttribution()), attribution);
    });
}

test('Other referrals, participants, sub-referrals and direct visitors keep their existing contact behavior', () => {
    for (const path of ['/', '/?ref=AHMAD', '/?ref=MOHAMED', '/?ref=LAITH', '/?ref=FAOZI',
        '/?ref=AHMAD&client=MUNTHER&lang=ar', '/?ref=AHMAD&subref=LAITH',
        '/?ref=MOHAMED&subref=MOHAMED_ABDO', '/?ref=MOHAMED_ABDO', '/?ref=VLAD_OTHER',
        '/?ref=VLAD&subref=LAITH', '/?ref=ALMA&client=UNKNOWN', '/?ref=VLAD&ref=ALMA']) {
        const page = visit(path);
        assert.equal(page.links[0].href, 'https://wa.me/12137322002', path);
        assert.equal(page.nodes[0].nodeValue, '+1 (213) 732-2002', path);
        for (const other of ['VLAD', 'ALMA']) {
            if (page.window.getTurkLuxxReferral() === 'DIRECT') continue;
            const next = visit(`/?ref=${other}`, page.storage);
            assert.equal(next.links[0].href, 'tel:+19493314195', path);
            assert.equal(JSON.stringify(next.window.getTurkLuxxReferralAttribution()), JSON.stringify(page.window.getTurkLuxxReferralAttribution()));
        }
    }
});

test('Existing first-touch records do not mask a new contact context, and explicit other referrals reset it', () => {
    for (const first of ['AHMAD', 'MOHAMED', 'VLAD', 'ALMA']) {
        const entry = visit(`/?ref=${first}`);
        const attribution = JSON.stringify(entry.window.getTurkLuxxReferralAttribution());
        for (const ref of ['alma', 'vlad', 'AHMAD', 'MOHAMED', 'ALMA', 'VLAD']) {
            const override = ['alma', 'vlad', 'ALMA', 'VLAD'].includes(ref);
            const expectedHref = override ? 'tel:+19493314195' : 'https://wa.me/12137322002';
            for (const path of [`/?ref=${ref}`, '/videos', '/videos']) {
                const page = visit(path, entry.storage);
                assert.equal(page.links[0].href, expectedHref, `${first} -> ${ref} ${path}`);
                assert.equal(page.nodes[0].nodeValue, override ? '+1 (949) 331-4195' : '+1 (213) 732-2002');
                assert.equal(JSON.stringify(page.window.getTurkLuxxReferralAttribution()), attribution);
            }
        }
    }
});
