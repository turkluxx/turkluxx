(() => {
    'use strict';

    const validCodes = new Set(['ALMA', 'AHMAD', 'MUHAMED', 'VLAD', 'LAITH', 'FAOZI']);

    const keys = {
        referral: 'turkluxx_referral',
        createdAt: 'turkluxx_referral_created_at',
        landingPage: 'turkluxx_referral_landing_page'
    };

    const normalize = value => {
        const code = (value || '').trim().toUpperCase();
        return validCodes.has(code) ? code : null;
    };

    // Always read storage so navigation and other tabs see the same attribution.
    window.getTurkLuxxReferralAttribution = () => {
        try {
            const referral = normalize(localStorage.getItem(keys.referral));
            if (referral) {
                return {
                    referral,
                    ...(['LAITH', 'FAOZI'].includes(referral) ? { parentConsultant: 'AHMAD' } : {}),
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

    const params = new URLSearchParams(window.location.search);
    const incoming = normalize(params.get('ref'));
    if (params.has('ref') && !incoming) {
        // Reject the URL without touching any existing first-touch attribution.
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
            <p data-i18n="referral.explanation">Please check the link you received or continue to TurkLuxx without referral attribution.</p>
            <a href="/" data-i18n="referral.continue">CONTINUE TO TURKLUXX</a>`;
        document.body.classList.add('turkluxx-invalid-referral');
        document.body.append(screen);
        document.title = 'Invalid referral link — TurkLuxx';
        screen.querySelector('h1').focus();
        return;
    }
    if (!incoming) return;

    try {
        if (normalize(localStorage.getItem(keys.referral))) return;
        // Write the valid code last; incomplete metadata alone is not attribution.
        localStorage.setItem(keys.createdAt, new Date().toISOString());
        localStorage.setItem(keys.landingPage, window.location.href);
        localStorage.setItem(keys.referral, incoming);
    } catch {
        // No cookies, redirects, or UI fallback when localStorage is unavailable.
    }
})();
