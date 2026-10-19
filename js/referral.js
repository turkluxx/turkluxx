(() => {
    'use strict';

    const registry = globalThis.TurkLuxxReferralRegistry;
    const normalize = globalThis.normalizeTurkLuxxReferral;
    let fallbackAttribution = null;

    const keys = {
        referral: 'turkluxx_referral',
        pair: 'turkluxx_referral_pair',
        createdAt: 'turkluxx_referral_created_at',
        landingPage: 'turkluxx_referral_landing_page',
        fallback: 'turkluxx_referral_fallback'
    };

    const parents = Object.fromEntries(Object.entries(registry)
        .filter(([, record]) => record.parentConsultant).map(([code, record]) => [code, record.parentConsultant]));
    const validPair = (referral, subref) => Object.hasOwn(parents, subref) && parents[subref] === referral;

    const validStoredPath = pair => {
        if (!Array.isArray(pair.referralPath) || pair.referralPath.length < 3 || !pair.referralPath.every(code => typeof code === 'string' && normalize(code) === code)) return false;
        const parsed = globalThis.resolveTurkLuxxReferralURL(new URLSearchParams({ ref: pair.referralPath.join('=') }));
        return !parsed.fallback && parsed.referral === pair.referral && parsed.subref === pair.subref;
    };

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
        if (fallbackAttribution) return fallbackAttribution;
        try {
            const saved = JSON.parse(localStorage.getItem(keys.fallback));
            if (saved?.referral === 'VLAD') return { referral: 'VLAD', createdAt: saved.createdAt, landingPage: saved.landingPage };
        } catch { /* Optional persistence. */ }
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
            if (pair && (pair.referralPath ? validStoredPath(pair) : validPair(pair.referral, pair.subref))) {
                return { referral: pair.referral, subref: pair.subref, directReferrer: pair.subref,
                    parentConsultant: pair.referralPath ? pair.referralPath.at(-2) : pair.referral,
                    ...(pair.referralPath ? { referralPath: pair.referralPath } : {}), createdAt: pair.createdAt, landingPage: pair.landingPage };
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
        const phoneKey = 'turkluxx_phone_referral';
        let referral;
        try { referral = normalize(localStorage.getItem(phoneKey)); } catch { /* URL still works. */ }
        if (incoming) {
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
    const resolved = globalThis.resolveTurkLuxxReferralURL(params);
    const incoming = resolved.referral;
    const subref = resolved.subref;
    const hasSubref = !!subref;
    const client = resolved.client;
    const hasClient = !!client;
    if (resolved.fallback) {
        // Explicit invalid entry takes precedence over every saved first-touch record.
        fallbackAttribution = { referral: 'VLAD', createdAt: new Date().toISOString(), landingPage: window.location.href };
        try {
            const saved = JSON.parse(localStorage.getItem(keys.fallback));
            if (saved?.referral === 'VLAD' && saved.landingPage === window.location.href) fallbackAttribution.createdAt = saved.createdAt;
        } catch { /* Optional persistence. */ }
        try { localStorage.setItem(keys.fallback, JSON.stringify(fallbackAttribution)); } catch { /* Current page still works. */ }
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
                ...(resolved.referralPath ? { referralPath: resolved.referralPath } : {}),
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
