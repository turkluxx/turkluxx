(() => {
    'use strict';

    const registry = globalThis.TurkLuxxReferralRegistry;
    const normalize = globalThis.normalizeTurkLuxxReferral;
    let invalidReferralLink = false;

    const keys = {
        referral: 'turkluxx_referral',
        pair: 'turkluxx_referral_pair',
        createdAt: 'turkluxx_referral_created_at',
        landingPage: 'turkluxx_referral_landing_page'
    };

    const parents = Object.fromEntries(Object.entries(registry)
        .filter(([, record]) => record.parentConsultant).map(([code, record]) => [code, record.parentConsultant]));
    const validPair = (referral, subref) => Object.hasOwn(parents, subref) && parents[subref] === referral;

    const sessionKey = 'turkluxx_participant_referral';
    let memoryAttribution = null;
    const privacyOptOut = typeof navigator !== 'undefined' &&
        (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1');
    const validClient = (referral, client) => typeof referral === 'string' && typeof client === 'string' &&
        Object.hasOwn(registry, referral || '') && [registry[referral].ar, registry[referral].en]
            .some(ids => Array.isArray(ids) && ids.includes(client));
    const readSession = () => {
        if (privacyOptOut) return memoryAttribution;
        try {
            const record = JSON.parse(sessionStorage.getItem(sessionKey));
            if (record && validClient(record.referral, record.client)) return record;
        } catch { /* Blocked or malformed storage is harmless. */ }
        return memoryAttribution;
    };

    // Read session attribution on navigation; retain established legacy attribution.
    window.getTurkLuxxReferralAttribution = () => {
        if (invalidReferralLink) return { referral: null, invalid: true, createdAt: null, landingPage: null };
        const participant = readSession();
        if (participant) return { referral: participant.referral, client: participant.client };
        try {
            let storedReferral = localStorage.getItem(keys.referral);
            // Preserve existing attribution while using the corrected canonical ID.
            if (['MUHAMED', 'MUHHAMED'].includes((storedReferral || '').trim().toUpperCase())) {
                storedReferral = 'MOHAMED';
                try { localStorage.setItem(keys.referral, storedReferral); } catch {
                    // Readable attribution remains canonical even if writes are blocked.
                }
            }
            let pair;
            try { pair = JSON.parse(localStorage.getItem(keys.pair)); } catch { /* Ignore malformed stored records. */ }
            if (pair && pair.referral === 'MUHAMED') {
                pair.referral = 'MOHAMED';
                if (pair.subref === 'ABDO') pair.subref = 'MOHAMED_ABDO';
                try { localStorage.setItem(keys.pair, JSON.stringify(pair)); } catch { /* Keep readable attribution. */ }
            }
            if (pair && validPair(pair.referral, pair.subref)) {
                return { referral: pair.referral, subref: pair.subref, directReferrer: pair.subref,
                    parentConsultant: pair.referral, createdAt: pair.createdAt, landingPage: pair.landingPage };
            }
            const referral = normalize(storedReferral);
            if (referral) {
                return {
                    referral,
                    ...(Object.hasOwn(parents, referral) ? { parentConsultant: parents[referral] } : {}),
                    createdAt: localStorage.getItem(keys.createdAt),
                    landingPage: localStorage.getItem(keys.landingPage)
                };
            }
        } catch {
            // Storage may be blocked. Attribution must never break the website.
        }
        return { referral: 'DIRECT', createdAt: null, landingPage: null };
    };
    window.getTurkLuxxReferral = () => window.getTurkLuxxReferralAttribution().referral;

    function showInvalidReferral() {
        if (typeof document === 'undefined' || !document.createElement) return;
        const style = document.createElement('style');
        style.textContent = `
            body.turkluxx-invalid-referral { margin: 0; background: #f9f7f2; }
            body.turkluxx-invalid-referral > :not(#turkluxx-referral-error) { display: none !important; }
            #turkluxx-referral-error { box-sizing: border-box; min-height: 100vh; min-height: 100svh;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                padding: 40px 24px; text-align: center; color: #212c6c; font-family: 'Manrope', sans-serif; }
            #turkluxx-referral-error .referral-brand { font-size: 44px; font-weight: 700; letter-spacing: -2px; }
            #turkluxx-referral-error h1 { font-family: 'Cormorant Garamond', serif;
                font-size: clamp(36px, 6vw, 64px); font-weight: 500; line-height: 1.1; margin: 40px 0 20px; }
            #turkluxx-referral-error p { max-width: 520px; font-size: 16px; line-height: 1.7; margin: 0 0 16px; }
            #turkluxx-referral-error a { box-sizing: border-box; max-width: 100%; margin-top: 16px;
                padding: 18px 24px; background: #212c6c; color: #fff; text-decoration: none;
                font-size: 13px; font-weight: 700; letter-spacing: 1px; }
            #turkluxx-referral-error a:focus-visible { outline: 3px solid #212c6c; outline-offset: 5px; }
        `;
        document.head.append(style);
        const screen = document.createElement('main');
        screen.id = 'turkluxx-referral-error';
        screen.setAttribute('aria-labelledby', 'turkluxx-referral-error-title');
        screen.innerHTML = `<div class="referral-brand">TurkLuxx</div>
            <h1 id="turkluxx-referral-error-title" data-i18n="referral.title" tabindex="-1">Invalid referral link</h1>
            <p data-i18n="referral.invalid">This referral link is not valid.</p>
            <a href="/" data-i18n="referral.continue">CONTINUE TO TURKLUXX</a>`;
        document.body.classList.add('turkluxx-invalid-referral');
        document.body.append(screen);
        document.title = 'Invalid referral link — TurkLuxx';
        screen.querySelector('h1').focus();
        document.addEventListener?.('submit', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    }

    function referralRoot(referral) {
        const visited = new Set();
        while (typeof referral === 'string' && Object.hasOwn(registry, referral) && !visited.has(referral)) {
            visited.add(referral);
            const record = registry[referral];
            if (!record || typeof record !== 'object') return null;
            if (!Object.hasOwn(record, 'parentConsultant')) return referral;
            referral = record.parentConsultant;
        }
        // Unknown parents and cycles do not establish a valid referral tree.
        return null;
    }

    function updateReferralPhone() {
        if (invalidReferralLink) return;
        const phoneKey = 'turkluxx_phone_referral';
        let referral;
        try { referral = normalize(localStorage.getItem(phoneKey)); } catch { /* URL still works. */ }
        if (!invalidLink && incoming) {
            // Contact presentation follows the current valid link, independently
            // of immutable first-touch lead attribution. Reuse its normalization
            // and pair/client validation rather than trusting raw URL strings.
            referral = hasSubref ? subref : incoming;
            try { localStorage.setItem(phoneKey, referral); } catch { /* Current page still works. */ }
        } else if (!referral) {
            const attribution = window.getTurkLuxxReferralAttribution();
            referral = attribution.client ? null : attribution.subref || attribution.referral;
        }
        if (!['VLAD', 'ALMA'].includes(referralRoot(referral))) return;
        const defaults = new Set(['12137322002', '18184347266']);
        for (const link of document.querySelectorAll('a[href]')) {
            const href = link.getAttribute('href');
            // WhatsApp destinations have their own existing behavior; only dial links change.
            if (/^tel:/.test(href) && defaults.has(href.replace(/\D/g, ''))) {
                link.setAttribute('href', 'tel:+19493314195');
            }
        }
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement?.closest('script, style, noscript, textarea')) continue;
            const value = node.nodeValue.replace(/\+1[\d\s()-]+/g, number =>
                defaults.has(number.replace(/\D/g, '')) ? number.replace(/\S[\s\S]*\S/, '+1 (949) 331-4195') : number);
            if (node.nodeValue !== value) node.nodeValue = value;
        }
    }
    // Defer until this script has accepted the incoming referral and the mobile
    // header has finished assembling its existing controls.
    if (typeof document !== 'undefined') document.addEventListener?.('DOMContentLoaded', updateReferralPhone);
    window.addEventListener?.('turkluxx:language-change', updateReferralPhone);

    // Run storage migration even on clean visits or rejected incoming links.
    window.getTurkLuxxReferralAttribution();

    const params = new URLSearchParams(window.location.search);
    const incoming = normalize(params.get('ref'));
    const hasSubref = params.has('subref');
    const subref = normalize(params.get('subref'));
    const invalidPair = hasSubref && !validPair(incoming, subref);
    const duplicate = params.getAll('ref').length > 1 || params.getAll('subref').length > 1;
    const hasClient = params.has('client');
    const client = (params.get('client') || '').trim().toUpperCase().replace(/\s+/g, '_');
    const language = params.get('lang');
    const invalidClient = hasClient && (!validClient(incoming, client) || hasSubref || !['ar', 'en'].includes(language));
    const invalidLink = (params.has('ref') && !incoming) || invalidPair || duplicate || invalidClient ||
        params.getAll('client').length > 1 || params.getAll('lang').length > 1;
    if (invalidLink) {
        invalidReferralLink = true;
        showInvalidReferral();
        return;
    }
    if (hasClient) {
        if (window.getTurkLuxxReferral() !== 'DIRECT') return;
        // First valid attribution wins; keep only registered identifiers for this tab session.
        memoryAttribution = { referral: incoming, client };
        try {
            if (!privacyOptOut) sessionStorage.setItem(sessionKey, JSON.stringify(memoryAttribution));
        } catch { /* Current page still works. */ }
        return;
    }
    if (!incoming) return;

    try {
        if (window.getTurkLuxxReferral() !== 'DIRECT') return;
        if (hasSubref) {
            // One atomic storage write establishes both levels and their metadata.
            localStorage.setItem(keys.pair, JSON.stringify({ referral: incoming, subref,
                createdAt: new Date().toISOString(), landingPage: window.location.href }));
            return;
        }
        // Write the valid code last; incomplete metadata alone is not attribution.
        localStorage.setItem(keys.createdAt, new Date().toISOString());
        localStorage.setItem(keys.landingPage, window.location.href);
        localStorage.setItem(keys.referral, incoming);
    } catch {
        // No cookies, redirects, or UI fallback when localStorage is unavailable.
    }
})();
