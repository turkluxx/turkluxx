(() => {
    'use strict';
    const languages = { en: 'English', ru: 'Русский', es: 'Español', ar: 'العربية', tr: 'Türkçe', nl: 'Nederlands' };
    const storageKey = 'turkluxx_language';
    const referralLanguageKey = 'turkluxx_referral_language';
    const referralDefaults = { AHMAD: 'en', ALMA: 'en', VLAD: 'en', MOHAMED: 'en', TIM_BOND: 'nl' };
    let referralLanguage = { active: null, choices: {} };
    const catalogs = new Map();
    const originals = new WeakMap();
    const attributes = new WeakMap();
    const bindings = new WeakMap();
    const phraseOrders = new WeakMap();
    const selectorQuery = '.turkluxx-sales-language select, .turkluxx-language-select';
    const normalize = text => text.replace(/\s+/gu, ' ').trim();
    let language = 'en', english = {}, sourceKeys = new Map(), templates = [], requestId = 0;
    try {
        const requested = new URLSearchParams(location.search).get('lang');
        let stored;
        try { stored = localStorage.getItem(storageKey); } catch { /* URL hints still work. */ }
        const browserLanguages = [...(navigator.languages || []), navigator.language];
        const detected = browserLanguages.map(value => typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : '')
            .find(code => Object.hasOwn(languages, code));
        language = Object.hasOwn(languages, requested) ? requested : Object.hasOwn(languages, stored) ? stored : detected || 'en';
        const params = new URLSearchParams(location.search);
        try {
            const saved = JSON.parse(localStorage.getItem(referralLanguageKey));
            if (saved && (saved.active === null || Object.hasOwn(referralDefaults, saved.active)) && saved.choices && typeof saved.choices === 'object') {
                referralLanguage = saved;
            }
        } catch { /* A fresh referral entry still works without storage. */ }
        const resolved = globalThis.resolveTurkLuxxReferralURL?.(params);
        const rawReferral = params.get('ref');
        const timBondPair = resolved && !resolved.fallback && resolved.subref === 'TIM_BOND' && resolved.parentConsultant === 'VLAD';
        const entryReferral = resolved?.fallback ? 'VLAD' : timBondPair ? 'TIM_BOND' : rawReferral;
        const exactReferral = resolved?.fallback || (resolved?.present && !resolved.fallback && !resolved.client &&
            (timBondPair || (!resolved.subref && Object.hasOwn(referralDefaults, rawReferral))));
        if (exactReferral) {
            referralLanguage.active = entryReferral;
            const choice = referralLanguage.choices[referralLanguage.active];
            language = resolved.fallback && Object.hasOwn(languages, requested) ? requested
                : Object.hasOwn(languages, choice) ? choice : referralDefaults[entryReferral];
            try {
                localStorage.setItem(storageKey, language);
                localStorage.setItem(referralLanguageKey, JSON.stringify(referralLanguage));
            } catch { /* Current-page language selection remains available. */ }
        } else if (params.has('ref') && referralLanguage.active) {
            referralLanguage.active = null;
            try { localStorage.setItem(referralLanguageKey, JSON.stringify(referralLanguage)); } catch { /* Optional state. */ }
        }
    } catch { /* English works even when storage is unavailable. */ }

    async function catalog(code) {
        if (!catalogs.has(code)) {
            const promise = fetch(`/locales/${code}.json`, { credentials: 'same-origin' })
                .then(response => { if (!response.ok) throw new Error('Locale unavailable'); return response.json(); })
                .then(data => {
                    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid locale');
                    catalogs.set(code, data); return data;
                }).catch(() => { catalogs.delete(code); return {}; });
            catalogs.set(code, promise);
        }
        return await catalogs.get(code);
    }
    function t(key, values = {}, fallback = '') {
        const translated = catalogs.get(language)?.[key];
        const source = english[key];
        const template = typeof translated === 'string' && translated ? translated
            : typeof source === 'string' ? source : fallback;
        const rendered = template.replace(/\{([a-zA-Z]+)\}/g, (match, name) => values[name] == null ? '' : text(String(values[name])));
        // Keep 4+1, measurements, ranges and phone numbers in their original visual order in Arabic.
        return language === 'ar' ? rendered.replace(/[\u2066-\u2069]/g, '').replace(
            /\+\d(?:[\d ]*\d)?|\d+(?:[.,]\d+)*(?:\+\d+)*(?:\s?(?:m²|km)|%)?(?:[–-]\d+(?:[.,]\d+)*(?:\s?(?:m²|km)|%)?)?/gu,
            number => `\u2066${number}\u2069`) : rendered;
    }
    function text(source) {
        const key = sourceKeys.get(normalize(source));
        if (key) return language === 'en' ? source : t(key, {}, source);
        for (const { key, regex, names } of templates) {
            const match = source.match(regex);
            if (match) return language === 'en' ? source : t(key, Object.fromEntries(names.map((name, i) => [name, match[i + 1]])), source);
        }
        return source;
    }
    function bind(element, key, values = {}, attribute = null) {
        const records = bindings.get(element) || new Map();
        const record = { key, values, attribute };
        records.set(attribute, record);
        bindings.set(element, records);
        element.dataset.i18nBound = '';
        if (!attribute) element.dataset.i18nText = '';
        applyBinding(element, record);
    }
    function setTranslatedText(element, value) {
        // Preserve semantic emphasis within the complete translated sentence.
        if (element.dataset.i18nEmphasis) {
            const phrase = t(element.dataset.i18nEmphasis);
            const position = phrase ? value.indexOf(phrase) : -1;
            if (position !== -1) {
                if (element.textContent === value && element.querySelector('strong')?.textContent === phrase) return;
                const emphasis = document.createElement('strong');
                emphasis.textContent = phrase;
                element.replaceChildren(value.slice(0, position), emphasis, value.slice(position + phrase.length));
                return;
            }
        }
        // Keep the full section heading, but treat its range as one unit.
        if (element.id === 'rengi-roi-title') {
            if (element.textContent === value && element.querySelector('.rengi-roi-percentage')) return;
            const range = value.match(/\([\u2066-\u2069]*(?:30–70|70–30)%[\u2066-\u2069]*\)/u);
            if (range) {
                const percentage = document.createElement('span');
                percentage.className = 'rengi-roi-percentage';
                percentage.dir = 'ltr';
                percentage.textContent = range[0];
                const prefix = value.slice(0, range.index);
                const lastWord = prefix.match(/\S+\s*$/u);
                const ending = document.createElement('span');
                ending.className = 'rengi-roi-ending';
                ending.append(lastWord ? lastWord[0] : '', percentage);
                element.replaceChildren(lastWord ? prefix.slice(0, lastWord.index) : prefix, ending, value.slice(range.index + range[0].length));
                return;
            }
        }
        // Keep the ROI range together when prose wraps, including in RTL text.
        const roiRange = value.match(/[\u2066-\u2069]*(?:30–70|70–30)%[\u2066-\u2069]*/u);
        if (roiRange) {
            if (element.textContent === value && element.querySelector('.turkluxx-roi-range')) return;
            const range = document.createElement('span');
            range.className = 'turkluxx-roi-range';
            range.dir = 'ltr';
            range.textContent = roiRange[0];
            element.replaceChildren(value.slice(0, roiRange.index), range, value.slice(roiRange.index + roiRange[0].length));
            return;
        }
        if (element.textContent !== value) element.textContent = value;
    }
    function applyBinding(element, record) {
        const value = t(record.key, typeof record.values === 'function' ? record.values() : record.values);
        if (record.attribute) {
            if (element.getAttribute(record.attribute) !== value) element.setAttribute(record.attribute, value);
        } else setTranslatedText(element, value);
        record.output = value;
    }
    const ignored = node => node.parentElement?.closest('script, style, noscript, svg, select, [data-i18n-ignore], [data-i18n-text]');
    function translate(root = document.documentElement) {
        observer.disconnect();
        try {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (ignored(node)) continue;
                const current = node.nodeValue;
                let record = originals.get(node);
                if (!record || record.output !== current) record = { source: current };
                const source = record.source;
                const translated = text(normalize(source));
                if (translated === normalize(source) && !record.output) continue;
                const value = language === 'en' ? source : source.replace(/\S[\s\S]*\S|\S/u, () => translated);
                if (node.nodeValue !== value) node.nodeValue = value;
                originals.set(node, { source, output: value });
            }
            for (const element of [root, ...root.querySelectorAll('[aria-label], [alt], [placeholder], [title]')]) {
                if (!(element instanceof Element) || element.closest('script, style, noscript, svg, [data-i18n-ignore]')) continue;
                const records = attributes.get(element) || {};
                for (const name of ['aria-label', 'alt', 'placeholder', 'title']) {
                    if (bindings.get(element)?.has(name)) continue;
                    const current = element.getAttribute(name);
                    if (!current) continue;
                    let record = records[name];
                    if (!record || record.output !== current) record = { source: current };
                    const value = text(record.source);
                    if (value !== current) element.setAttribute(name, value);
                    records[name] = { source: record.source, output: value };
                }
                attributes.set(element, records);
            }
            for (const element of root.querySelectorAll('[data-i18n]')) {
                const value = t(element.dataset.i18n);
                if (value) setTranslatedText(element, value);
            }
            for (const element of [root, ...root.querySelectorAll('[data-i18n-bound]')]) {
                for (const [attribute, record] of bindings.get(element) || []) {
                    const current = attribute ? element.getAttribute(attribute) : element.textContent;
                    // Renderers may clear a status or replace content outside this binding.
                    if (current !== record.output) bindings.get(element).delete(attribute);
                    else applyBinding(element, record);
                }
                if (bindings.get(element)?.size === 0) {
                    bindings.delete(element);
                    element.removeAttribute('data-i18n-bound');
                    element.removeAttribute('data-i18n-text');
                }
            }
        } finally {
            observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
                attributes: true, attributeFilter: ['aria-label', 'alt', 'placeholder', 'title'] });
        }
    }
    // Bind immutable English text nodes, including nodes added by existing renderers.
    // No innerHTML replacement: markup, event listeners and property values survive.
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; translate(); });
    });
    function selectors() {
        // SVG flags also render on Windows, where national-flag emoji become letter pairs.
        const flagSvg = {
            ru: '<path fill="#fff" d="M0 0h24v16H0z"/><path fill="#0039a6" d="M0 5.33h24v5.34H0z"/><path fill="#d52b1e" d="M0 10.67h24V16H0z"/>',
            es: '<path fill="#aa151b" d="M0 0h24v16H0z"/><path fill="#f1bf00" d="M0 4h24v8H0z"/>',
            ar: '<path fill="#006c35" d="M0 0h24v16H0z"/><text x="12" y="7.8" text-anchor="middle" fill="#fff" font-size="3.1" font-family="serif">لا إله إلا الله محمد رسول الله</text><path stroke="#fff" stroke-width=".8" d="M5 11.4h14m-1 0v1"/>',
            tr: '<path fill="#e30a17" d="M0 0h24v16H0z"/><circle fill="#fff" cx="9" cy="8" r="4"/><circle fill="#e30a17" cx="10.2" cy="8" r="3.2"/><path fill="#fff" d="m14.8 5.2.7 2.1h2.2l-1.8 1.3.7 2.1-1.8-1.3-1.8 1.3.7-2.1-1.8-1.3h2.2z"/>',
            nl: '<path fill="#ae1c28" d="M0 0h24v16H0z"/><path fill="#fff" d="M0 5.33h24v5.34H0z"/><path fill="#21468b" d="M0 10.67h24V16H0z"/>'
        };
        const flagImage = code => {
            const image = document.createElement('img');
            image.alt = '';
            image.src = code === 'en' ? 'assets/us-flag.svg'
                : 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16">${flagSvg[code]}</svg>`);
            return image;
        };
        const controls = [];
        document.querySelectorAll(selectorQuery).forEach(select => {
            select.replaceChildren(...Object.entries(languages).map(([code, name]) => {
                const option = document.createElement('option'); option.value = code; option.lang = code;
                option.textContent = name; return option;
            }));
            select.value = language;
            select.addEventListener('change', () => setLanguage(select.value));
            const container = select.parentElement;
            container.classList.add('is-language-dropdown');
            select.hidden = true;
            select.tabIndex = -1;
            select.setAttribute('aria-hidden', 'true');
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'turkluxx-language-toggle';
            toggle.setAttribute('aria-haspopup', 'listbox');
            toggle.setAttribute('aria-expanded', 'false');
            const flag = document.createElement('span');
            flag.className = 'turkluxx-language-flag';
            flag.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.dataset.i18nIgnore = '';
            const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            chevron.setAttribute('viewBox', '0 0 16 10');
            chevron.setAttribute('aria-hidden', 'true');
            chevron.classList.add('turkluxx-language-chevron');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'm2 2 6 6 6-6');
            chevron.append(path);
            toggle.append(flag, label, chevron);
            const menu = document.createElement('div');
            menu.id = `turkluxx-language-menu-${controls.length}`;
            menu.className = 'turkluxx-language-menu';
            menu.dataset.i18nIgnore = '';
            menu.setAttribute('role', 'listbox');
            menu.hidden = true;
            toggle.setAttribute('aria-controls', menu.id);
            const options = Object.entries(languages).map(([code, name]) => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'turkluxx-language-option';
                option.setAttribute('role', 'option');
                option.dataset.language = code;
                option.tabIndex = -1;
                const icon = flagImage(code);
                icon.setAttribute('aria-hidden', 'true');
                const nameLabel = document.createElement('span');
                nameLabel.lang = code;
                nameLabel.dir = code === 'ar' ? 'rtl' : 'ltr';
                nameLabel.textContent = name;
                option.append(icon, nameLabel);
                option.addEventListener('click', () => {
                    close(true);
                    select.value = code;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                });
                return option;
            });
            menu.append(...options);
            container.append(toggle, menu);
            function close(focus = false) {
                menu.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
                if (focus) toggle.focus();
            }
            function open(index = options.findIndex(option => option.dataset.language === language)) {
                controls.forEach(control => control.close());
                menu.hidden = false;
                toggle.setAttribute('aria-expanded', 'true');
                options[Math.max(0, index)].focus();
            }
            function update() {
                label.textContent = language.toUpperCase();
                flag.replaceChildren(flagImage(language));
                toggle.setAttribute('aria-label', `${t('common.language', {}, 'Language')}: ${languages[language]}`);
                menu.setAttribute('aria-label', t('common.language', {}, 'Language'));
                options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.language === language)));
            }
            toggle.addEventListener('click', () => menu.hidden ? open() : close());
            toggle.addEventListener('keydown', event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault(); open(event.key === 'ArrowDown' ? 0 : options.length - 1);
                }
            });
            menu.addEventListener('keydown', event => {
                const index = options.indexOf(document.activeElement);
                const next = { ArrowDown: (index + 1) % options.length, ArrowUp: (index + options.length - 1) % options.length,
                    Home: 0, End: options.length - 1 }[event.key];
                if (next !== undefined) { event.preventDefault(); options[next].focus(); }
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); options[index]?.click(); }
                if (event.key === 'Escape') { event.preventDefault(); close(true); }
                if (event.key === 'Tab') close();
            });
            container.addEventListener('focusout', event => { if (!container.contains(event.relatedTarget)) close(); });
            controls.push({ container, close });
            window.addEventListener('turkluxx:language-change', update);
            update();
        });
        if (controls.length) document.addEventListener('pointerdown', event => {
            controls.forEach(control => { if (!control.container.contains(event.target)) control.close(); });
        });
    }
    async function setLanguage(code, persist = true, manual = true) {
        if (!Object.hasOwn(languages, code)) code = 'en';
        const version = ++requestId;
        await ready;
        if (code !== 'en') await catalog(code);
        if (version !== requestId) return;
        language = code;
        if (persist) {
            try { localStorage.setItem(storageKey, code); } catch { /* Current page remains translated. */ }
            if (manual && Object.hasOwn(referralDefaults, referralLanguage.active)) {
                referralLanguage.choices[referralLanguage.active] = code;
                try { localStorage.setItem(referralLanguageKey, JSON.stringify(referralLanguage)); } catch { /* Optional state. */ }
            }
            const url = new URL(location.href);
            // An explicit language hint must agree with subsequent user selection.
            if (url.searchParams.has('lang') && url.searchParams.get('lang') !== code) { url.searchParams.set('lang', code); history.replaceState(null, '', url); }
        }
        document.querySelectorAll('a[data-i18n="nav.videos"]').forEach(link => {
            link.setAttribute('href', `/videos?lang=${code}`);
        });
        document.documentElement.lang = code;
        document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
        // Keep split headline phrases in the reading order required by each language.
        document.querySelectorAll('[data-i18n-order]').forEach(element => {
            if (!phraseOrders.has(element)) phraseOrders.set(element, [...element.childNodes]);
            const nodes = phraseOrders.get(element);
            const ordered = element.dataset.i18nOrder.split(' ').includes(code) ? [...nodes].reverse() : nodes;
            if (element.firstChild !== ordered[0]) element.replaceChildren(...ordered);
        });
        document.querySelectorAll(selectorQuery).forEach(select => { select.value = code; });
        window.dispatchEvent(new CustomEvent('turkluxx:language-change', { detail: { language: code } }));
        translate();
    }
    const ready = catalog('en').then(data => {
        english = data;
        sourceKeys = new Map(Object.entries(data).filter(([key, value]) => !key.startsWith('mobile.nav.') && !key.startsWith('nav.') && typeof value === 'string' && !value.includes('{'))
            .map(([key, value]) => [normalize(value), key]));
        templates = Object.entries(data).filter(([, value]) => typeof value === 'string' && value.includes('{')).map(([key, value]) => {
            const names = [];
            const escaped = value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
            const pattern = escaped.replace(/\{([a-zA-Z]+)\}/g, (_, name) => { names.push(name); return '(.+?)'; });
            return { key, names, regex: new RegExp(`^${pattern}$`, 'u') };
        }).sort((a, b) => english[b.key].replace(/\{[^}]+\}/g, '').length - english[a.key].replace(/\{[^}]+\}/g, '').length);
    });
    window.TurkLuxxI18n = { t, text, bind, setLanguage, get language() { return language; }, ready };
    selectors();
    setLanguage(language, true, false).finally(() => window.turkLuxxRevealLanguage?.());
})();
