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
