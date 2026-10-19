// Shared browser/lead-endpoint configuration. Identifiers, not personal profiles.
globalThis.TurkLuxxReferralRegistry = Object.freeze({
    ALMA: Object.freeze({}),
    AHMAD: Object.freeze({
        ar: Object.freeze(['RAWASHDEH_MOHD', 'MUNTHER', 'YUSUF_R', 'GAYTH', 'SAFA', 'BAHA', 'NAYZAR', 'OMAR_GABBA', 'MUHAMMAD_SALAH']),
        en: Object.freeze(['ERIC_SAUER', 'HAMID_FARES', 'RADWAN', 'SAMI_HARB', 'ABBAS_SULTANI', 'SAFWAN_RWASHD', 'MUHAMED_HUSS', 'SAIFE_HUSS', 'HAMZAH_HUSS', 'ERICK_WHITESIDE', 'SID_PARTOW', 'PARTOW_HAMID', 'SAMI_CHALFOUH', 'OMAR_SHAKERCHI'])
    }),
    MOHAMED: Object.freeze({}),
    VLAD: Object.freeze({}),
    TIM_BOND: Object.freeze({ parentConsultant: 'VLAD' }),
    LAITH: Object.freeze({ parentConsultant: 'AHMAD' }),
    FAOZI: Object.freeze({ parentConsultant: 'AHMAD' }),
    MOHAMED_ABDO: Object.freeze({ parentConsultant: 'MOHAMED' })
});

// Preserve the established incoming-link alias; stored misspellings are migrated separately.
globalThis.normalizeTurkLuxxReferral = value => {
    if (typeof value !== 'string') return null;
    const raw = value.trim().toUpperCase();
    const code = raw === 'MUHAMED' ? 'MOHAMED' : raw;
    return Object.hasOwn(globalThis.TurkLuxxReferralRegistry, code) ? code : null;
};

globalThis.TurkLuxxReferralRoots = Object.freeze(['VLAD', 'ALMA', 'MOHAMED', 'AHMAD']);

// Shared by language selection, browser attribution and the lead endpoint.
// URLSearchParams decodes percent-encoded '=' before path validation.
globalThis.resolveTurkLuxxReferralURL = params => {
    if (!params.has('ref')) return { present: false, fallback: false, referral: null };
    const fallback = () => ({ present: true, fallback: true, referral: 'VLAD' });
    if (['ref', 'subref', 'client', 'lang'].some(key => params.getAll(key).length > 1)) return fallback();
    const normalize = globalThis.normalizeTurkLuxxReferral;
    const registry = globalThis.TurkLuxxReferralRegistry;
    const path = params.get('ref').split('=').map(normalize);
    if (params.has('subref')) {
        if (path.length !== 1) return fallback();
        path.push(normalize(params.get('subref')));
    }
    if (!globalThis.TurkLuxxReferralRoots.includes(path[0]) || path.some(code => !code || !registry[code] || typeof registry[code] !== 'object') ||
        new Set(path).size !== path.length ||
        path.some((code, i) => i === 0 ? Object.hasOwn(registry[code], 'parentConsultant') : registry[code].parentConsultant !== path[i - 1])) return fallback();
    const result = { present: true, fallback: false, referral: path[0] };
    if (path.length > 1) Object.assign(result, {
        subref: path.at(-1), directReferrer: path.at(-1), parentConsultant: path.at(-2),
        ...(path.length > 2 ? { referralPath: path } : {})
    });
    if (params.has('client')) {
        const client = params.get('client').trim().toUpperCase().replace(/\s+/g, '_');
        if (path.length !== 1 || !['ar', 'en'].includes(params.get('lang')) ||
            ![registry[path[0]].ar, registry[path[0]].en].some(ids => Array.isArray(ids) && ids.includes(client))) return fallback();
        result.client = client;
    }
    return result;
};
