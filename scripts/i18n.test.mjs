import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const codes = ['en', 'ru', 'es', 'ar', 'tr', 'nl'];
const catalogs = Object.fromEntries(codes.map(code => [code, JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf8'))]));
const source = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const placeholders = s => [...s.matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1]).sort();
test('Six catalogs cover every English key with valid strings and matching parameters', () => {
    assert.equal(Object.keys(catalogs.en).length, 423);
    for (const key of ['istanbul.master_plan_186', 'istanbul.villa_types_188', 'antalya.explore_the_projects_199']) assert.ok(key in catalogs.en);
    for (const code of codes) {
        const bytes = readFileSync(new URL(`../locales/${code}.json`, import.meta.url));
        assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes), `${code}: UTF-8`);
        assert.deepEqual(Object.keys(catalogs[code]).sort(), Object.keys(catalogs.en).sort());
        for (const [key, value] of Object.entries(catalogs[code])) {
            assert.equal(typeof value, 'string', `${code} ${key}`);
            assert.ok(value.trim());
            assert.ok(!/\?{2,}|\uFFFD/u.test(value), `${code} ${key}: invalid encoding`);
            assert.deepEqual(placeholders(value), placeholders(catalogs.en[key]), `${code} ${key}`);
            assert.ok(!/<\/?(?:script|iframe|img|div|span)\b/i.test(value));
            const numbers = s => (s.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g) || []).sort();
            assert.deepEqual(numbers(value), numbers(catalogs.en[key]), `${code} ${key}: figures`);
            for (const name of ['TurkLuxx', 'Rengi Istanbul', 'Rengi Antalya', 'Karaarslan Group']) {
                if (catalogs.en[key].includes(name)) assert.ok(value.includes(name), `${code} ${key}: ${name}`);
            }
        }
    }
});
test('Explicit dynamic translation bindings reference existing source keys', () => {
    for (const file of ['callback.js', 'rengi-villa-explorer.js', 'rengi-antalya.js', 'rengi-istanbul.js']) {
        const script = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
        for (const match of script.matchAll(/(?:\.t\(|bind\([^,]+,\s*)'([^']+)'/g)) {
            assert.ok(catalogs.en[match[1]], `${file}: ${match[1]}`);
        }
    }
});
test('Identical English values are limited to proper names and shared vocabulary', () => {
    const properNames = ['home.karaarslan_i_n_aat', 'istanbul.rengi_istanbul_turkluxx', 'antalya.rengi_antalya_turkluxx', 'antalya.facts.lara_lara_turizm_caddesi', ...Object.keys(catalogs.en).filter(key => key.startsWith('villa.names.'))];
    const shared = {
        ru: [], ar: [], es: ['istanbul.hospital', 'common.total'], tr: ['istanbul.plan'],
        nl: ['common.contact', 'mobile.nav.roi', 'mobile.nav.primary_roi', 'mobile.nav.contact', 'home.in_istanbul', 'home.privacy', 'istanbul.school', 'rooms.garage', 'rooms.vestibule', 'antalya.facts.status', 'antalya.apartments.1_1_type_1', 'antalya.apartments.1_1_type_2']
    };
    for (const code of codes.filter(code => code !== 'en')) {
        for (const [key, english] of Object.entries(catalogs.en)) {
            if (catalogs[code][key].trim() === english.trim()) {
                assert.ok([...properNames, ...shared[code]].includes(key), `${code} ${key}: unexpected English`);
            }
        }
    }
});
test('Translated descriptions retain all figures, villa names and 4+1/5+1/6+1 configurations', () => {
    for (const code of codes) for (const [key, english] of Object.entries(catalogs.en)) {
        if (!key.includes('.description')) continue;
        const numbers = s => (s.match(/\d+(?:[,\.]\d+)*(?:\+\d+)?/g) || []).sort();
        assert.deepEqual(numbers(catalogs[code][key]), numbers(english), `${code} ${key}`);
    }
});
test('Property data stores description keys; catalogs do not duplicate images or measurements', () => {
    for (const [file, variable] of [['rengi-villa-data.js', 'villaData'], ['rengi-antalya-data.js', 'antalyaProjects']]) {
        const data = runInNewContext(`${readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8')}; ${variable}`);
        const groups = variable === 'villaData' ? Object.values(data) : [data];
        for (const group of groups) for (const item of Object.values(group)) {
            assert.ok(!Object.hasOwn(item, 'description'));
            assert.ok(item.descriptionKeys.length);
            for (const key of item.descriptionKeys) assert.ok(catalogs.en[key]);
        }
    }
    for (const catalog of Object.values(catalogs)) {
        assert.ok(!Object.keys(catalog).some(key => /(?:imagePath|mapPath|grossArea|netArea|landShare)$/.test(key)));
    }
});
function runtime({ search = '', stored = null, blocked = false, remote = {}, browserLanguages = ['en-US'], browserLanguage = 'en-US' } = {}) {
    class Element { querySelectorAll() { return []; } closest() { return null; } getAttribute() { return null; } }
    const document = { documentElement: new Element(), querySelectorAll: () => [], createTreeWalker: () => ({ nextNode: () => false }) };
    const storage = new Map(stored ? [['turkluxx_language', stored]] : []);
    const location = new URL('https://turkluxx.com/rengi-istanbul.html' + search);
    const window = { dispatchEvent() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
    const urls = [];
    runInNewContext(source, {
        window, document, location, URL, URLSearchParams, Element,
        navigator: { languages: browserLanguages, language: browserLanguage },
        NodeFilter: { SHOW_TEXT: 4 }, MutationObserver: class { observe() {} disconnect() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        queueMicrotask,
        history: { replaceState: (_, __, url) => { urls.push(String(url)); } },
        localStorage: { getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key); }, setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); } },
        fetch: async url => {
            const code = url.match(/([a-z]+)\.json$/)[1];
            if (remote[code] instanceof Error) throw remote[code];
            return { ok: true, json: async () => remote[code] ?? catalogs[code] };
        }
    });
    return { api: window.TurkLuxxI18n, document, storage, urls };
}

test('Villa product names follow the active language in labels and dynamic references', async () => {
    const data = runInNewContext(`${readFileSync(new URL('../js/rengi-villa-data.js', import.meta.url), 'utf8')}; villaData`);
    const villas = Object.values(data).flatMap(Object.values);
    assert.deepEqual(villas.map(villa => villa.name).sort(), ['Jade', 'Crystal', 'Coral', 'Emerald', 'Mother of Pearl', 'Pearl', 'Ruby', 'Sapphire', 'Silver', 'Gold', 'Diamond'].sort());
    const { api } = runtime();
    await api.ready;
    // Switch in both directions to catch translated names retained from a previous locale.
    for (const code of ['en', 'ru', 'es', 'ar', 'nl', 'tr', 'en', 'tr', 'ru']) {
        await api.setLanguage(code);
        for (const villa of villas) {
            const expected = code === 'tr' ? villa.turkishName : villa.name;
            assert.equal(api.text(villa.name), expected, `${code}: ${villa.name}`);
            for (const key of ['villa.cta', 'callback.villaTitle', 'media.map', 'media.plan', 'media.villaView', 'villa.selected']) {
                const rendered = api.t(key, { name: villa.name, floor: 'Ground Floor', number: 1, category: villa.category, count: 2 });
                assert.ok(rendered.includes(expected), `${code} ${key}: ${expected}`);
                assert.ok(!rendered.includes(`${villa.turkishName} (${villa.name})`));
            }
            for (const key of villa.descriptionKeys) {
                if (catalogs.en[key].includes(villa.name)) assert.ok(api.t(key).includes(expected), `${code} ${key}`);
                if (code === 'tr') assert.ok(!api.t(key).includes(villa.name), `${key}: English product name`);
            }
        }
    }
});

test('Browser regional languages select all six locales, Arabic RTL, and unsupported languages fall back', async () => {
    for (const [browserLanguage, expected] of [['en-US', 'en'], ['ru-RU', 'ru'], ['es-MX', 'es'], ['ar-SA', 'ar'], ['tr-TR', 'tr'], ['nl-NL', 'nl'], ['de-DE', 'en']]) {
        const { api, document, urls } = runtime({ browserLanguages: [browserLanguage], browserLanguage, search: '?ref=VLAD&sub=campaign%20one' });
        await api.ready; await new Promise(resolve => setImmediate(resolve));
        assert.equal(api.language, expected);
        assert.equal(document.documentElement.dir, expected === 'ar' ? 'rtl' : 'ltr');
        assert.deepEqual(urls, [], 'Automatic detection leaves referral URL unchanged');
    }
    assert.equal(runtime({ browserLanguages: ['de-DE', 'tr-TR', 'ru-RU'] }).api.language, 'tr');
    assert.equal(runtime({ browserLanguages: [], browserLanguage: 'nl-NL' }).api.language, 'nl');
    assert.equal(runtime({ browserLanguages: ['es-ES'], blocked: true }).api.language, 'es');
});

test('URL then saved preference take priority over browser; manual selection persists', async () => {
    assert.equal(runtime({ search: '?lang=ar&ref=VLAD&sub=partner', stored: 'nl', browserLanguages: ['ru-RU'] }).api.language, 'ar');
    assert.equal(runtime({ stored: 'nl', browserLanguages: ['ru-RU'] }).api.language, 'nl');
    const { api, storage, urls } = runtime({ browserLanguages: ['ru-RU'], search: '?ref=VLAD&sub=partner' });
    await api.setLanguage('es');
    assert.equal(storage.get('turkluxx_language'), 'es');
    assert.deepEqual(urls, []);
    assert.equal(runtime({ stored: storage.get('turkluxx_language'), browserLanguages: ['ru-RU'] }).api.language, 'es');
    const explicit = runtime({ search: '?lang=ar&ref=VLAD&sub=campaign%20one', browserLanguages: ['ru-RU'] });
    await explicit.api.ready; await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(explicit.urls, [], 'Matching explicit language does not reserialize referral parameters');
});
test('Missing, empty and invalid translation values fall back to exact English', async () => {
    const { api } = runtime({ remote: { nl: { 'common.name': null, 'common.phone': '', 'common.email': {} } } });
    await api.setLanguage('nl');
    for (const key of ['common.name', 'common.phone', 'common.email', 'callback.success']) assert.equal(api.t(key), catalogs.en[key]);
    assert.equal(api.t('missing.key'), '');
    assert.equal(api.t('missing.key', {}, 'Readable fallback'), 'Readable fallback');
});
test('Failed locale fetch uses English and invalid language selection safely chooses English', async () => {
    const { api } = runtime({ remote: { ru: Error('offline') } });
    await api.setLanguage('ru');
    assert.equal(api.t('common.request_a_callback'), catalogs.en['common.request_a_callback']);
    await api.setLanguage('xx'); assert.equal(api.language, 'en');
});
test('URL hints work with blocked storage; changing language preserves referral/sub parameters', async () => {
    const result = runtime({ search: '?ref=AHMAD&sub=JOHN&lang=ar', blocked: true });
    await result.api.ready; await result.api.setLanguage('ar');
    assert.equal(result.document.documentElement.lang, 'ar');
    assert.equal(result.document.documentElement.dir, 'rtl');
    await result.api.setLanguage('nl');
    assert.equal(result.document.documentElement.dir, 'ltr');
    const url = new URL(result.urls.at(-1));
    assert.equal(url.searchParams.get('ref'), 'AHMAD');
    assert.equal(url.searchParams.get('sub'), 'JOHN');
    assert.equal(url.searchParams.get('lang'), 'nl');
    assert.equal(result.storage.size, 0);
});
test('Only language storage is written and the most recent switch wins', async () => {
    const result = runtime({ stored: 'tr' });
    await result.api.ready;
    await Promise.all([result.api.setLanguage('ar'), result.api.setLanguage('es'), result.api.setLanguage('nl')]);
    assert.equal(result.api.language, 'nl');
    assert.deepEqual([...result.storage], [['turkluxx_language', 'nl']]);
    assert.equal(result.api.text('I want Jade villa'), catalogs.nl['villa.cta'].replace('{name}', 'Jade'));
    assert.equal(result.api.text('View Gold Upper Floor plan fullscreen'), result.api.t('media.planFullscreen', { name: 'Gold', floor: 'Upper Floor' }));
});
test('Arabic isolates configurations and measurements without changing their values', async () => {
    const { api } = runtime();
    await api.setLanguage('ar');
    const description = api.t('istanbul.villas.jade.description2');
    assert.ok(description.includes('\u2066294 m²\u2069'));
    assert.ok(api.t('istanbul.villas.jade.description4').includes('\u20664+1\u2069'));
    assert.equal(description.replace(/[\u2066-\u2069]/g, ''), catalogs.ar['istanbul.villas.jade.description2']);
    await api.setLanguage('en');
    assert.equal(api.t('istanbul.villas.jade.description2'), catalogs.en['istanbul.villas.jade.description2']);
});
