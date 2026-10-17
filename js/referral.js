(() => {
    'use strict';

    const validCodes = new Set(['ALMA', 'AHMAD', 'MOHAMED', 'VLAD', 'LAITH', 'FAOZI', 'MOHAMED_ABDO']);

    const keys = {
        referral: 'turkluxx_referral',
        pair: 'turkluxx_referral_pair',
        createdAt: 'turkluxx_referral_created_at',
        landingPage: 'turkluxx_referral_landing_page'
    };

    const normalize = value => {
        const raw = (value || '').trim().toUpperCase();
        const code = raw === 'MUHAMED' ? 'MOHAMED' : raw;
        return validCodes.has(code) ? code : null;
    };

    const parents = { LAITH: 'AHMAD', FAOZI: 'AHMAD', MOHAMED_ABDO: 'MOHAMED' };
    const validPair = (referral, subref) => Object.hasOwn(parents, subref) && parents[subref] === referral;

    const sessionKey = 'turkluxx_participant_referral';
    let memoryAttribution = null;
    const privacyOptOut = typeof navigator !== 'undefined' &&
        (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1');
    const registry = globalThis.TurkLuxxReferralRegistry || {};
    const validClient = (referral, client) => typeof referral === 'string' && typeof client === 'string' &&
        Object.hasOwn(registry, referral || '') && Object.values(registry[referral]).some(ids => ids.includes(client));
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

    function updateReferralPhone() {
        const attribution = window.getTurkLuxxReferralAttribution();
        const query = new URLSearchParams(window.location.search);
        // Stored first-touch attribution wins. The URL also works on this page
        // when storage is blocked, without changing attribution persistence.
        const referral = attribution.referral !== 'DIRECT' ? attribution.referral :
            query.getAll('ref').length === 1 && query.getAll('lang').length <= 1 &&
                !query.has('subref') && !query.has('client') ? query.get('ref') : null;
        if (!['VLAD', 'ALMA'].includes(referral) || attribution.subref || attribution.client) return;
        const defaults = new Set(['12137322002', '18184347266']);
        for (const link of document.querySelectorAll('a[href]')) {
            const href = link.getAttribute('href');
            if (/^(?:tel:|https:\/\/wa\.me\/)/.test(href) && defaults.has(href.replace(/\D/g, ''))) {
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
    const invalidPair = (hasSubref && !validPair(incoming, subref)) || (!hasSubref && incoming === 'MOHAMED_ABDO');
    const duplicate = params.getAll('ref').length > 1 || params.getAll('subref').length > 1;
    const hasClient = params.has('client');
    const client = (params.get('client') || '').trim().toUpperCase().replace(/\s+/g, '_');
    const language = params.get('lang');
    const invalidClient = hasClient && (!validClient(incoming, client) || hasSubref || !['ar', 'en'].includes(language));
    if ((params.has('ref') && !incoming) || invalidPair || duplicate || invalidClient ||
        params.getAll('client').length > 1 || params.getAll('lang').length > 1) return;
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
