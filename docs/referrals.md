# Referral landing preferences

`TIM_BOND` is a standalone child of `VLAD`, following the same registry/lead relationship as `MOHAMED_ABDO`. Its production link is `https://turkluxx.com/?ref=TIM_BOND&lang=nl`. Initial standalone entry defaults to Dutch ahead of browser, saved general preference, and URL language hints. Manual choices are remembered for this referral using the existing language preference mechanism, including navigation, reloads, and later QR visits. Case-normalized `tim_bond` entries receive the same default. Existing first-valid-attribution rules still apply: a previously established referral is not overwritten by this link.

`TIM_BOND` inherits VLAD's tree phone policy: it displays `+1 (949) 331-4195`; telephone links dial `tel:+19493314195`. Its existing WhatsApp destination remains `https://wa.me/12137322002`. The standalone deliverable is `generated/qr_codes/QR_TIM_BOND_STATIC.png` (1000×1000 PNG, high error correction, decoded after saving). It is Git-ignored and excluded from website assets, manifests, builds, tests, and deployment requirements. The manual generator now produces this Dutch QR alongside the four English QRs below.

Exact top-level links for `AHMAD`, `ALMA`, `VLAD`, and `MOHAMED` start in English, overriding browser, saved, and URL language hints on the initial entry. A manual language choice is remembered for that referrer, including clean internal navigation, reloads, and later QR visits. Other referrals, `subref` links, and registered `client` links retain the ordinary language rules. This preference state is separate from attribution; the existing first valid attribution still wins.

The latest valid referral link selects the contact context, separately from first-touch lead attribution. The phone policy follows `parentConsultant` relationships in the shared referral registry to the root ancestor. Every referral rooted at `VLAD` or `ALMA`, at any depth, displays `+1 (949) 331-4195`; governed telephone links use `tel:+19493314195`. Existing WhatsApp destinations are preserved independently of displayed phone text. Unknown parent references or circular relationships do not establish an override. No child identifiers or prefixes are matched. The separate `turkluxx_phone_referral` preference stores the selected referral and preserves this context on clean internal navigation and reloads; manual language changes reapply the same tree policy. Other referral trees retain their existing contact behavior. Without storage, the incoming link still selects the correct number on the current page, but clean-URL navigation cannot retain that context.

Standalone QR deliverables (not website assets):

| Referral URL | File |
| --- | --- |
| `https://turkluxx.com/?ref=AHMAD&lang=en` | `generated/qr_codes/QR_AHMAD_STATIC.png` |
| `https://turkluxx.com/?ref=ALMA&lang=en` | `generated/qr_codes/QR_ALMA_STATIC.png` |
| `https://turkluxx.com/?ref=VLAD&lang=en` | `generated/qr_codes/QR_VLAD_STATIC.png` |
| `https://turkluxx.com/?ref=MOHAMED&lang=en` | `generated/qr_codes/QR_MOHAMED_STATIC.png` |
| `https://turkluxx.com/?ref=TIM_BOND&lang=nl` | `generated/qr_codes/QR_TIM_BOND_STATIC.png` |

Run `python scripts/generate-referral-qr.py` manually to generate these five external images with the existing 1000px, centered-logo, high-error-correction design. It decodes every saved file before succeeding. Optional utility dependencies: Pillow, qrcode, zxing-cpp. Output lives under `generated/qr_codes/`, is Git-ignored, and is never copied into `dist/`. The website build, core tests, and deployment work with no QR files or output directory. Run `python scripts/test-referral-qr.py` separately to test the utility using disposable temporary output; no existing deliverables are required. Browser integration: `node scripts/test-referral-policy-browser.mjs --dist` with headless Chrome's CDP endpoint on port 9227; omit `--dist` to check source pages.

# Referral validation

Hierarchical phone-policy correction verification (2026-10-19): 82 focused referral/phone/language/participant tests passed; full unit suite had 115 passes and the same pre-existing Videos/Team header equality failure. The production-browser suite passed 660 rendered-page checks on desktop/mobile, including Dutch TIM_BOND entry, language switching, phone presentation, unchanged WhatsApp destinations, attribution, mocked lead delivery, navigation/reloads, and invalid-link recovery. Test-only registry fixtures cover nested descendants of TIM_BOND and ALMA, a 2,000-level chain, unrelated trees, missing parents, self-cycles and multi-node cycles; these fixtures are not registered production referrals. Production build passed, with zero QR images in `dist/`. No deployment or push was performed.

TIM_BOND verification (2026-10-19): production build passed before QR generation with no generated directory; zero QR artifacts in `dist/`. Unit suite: 112 passed, one pre-existing Videos/Team header equality failure (also present in committed source). Production-browser policy suite: 612 rendered-page checks passed across desktop/mobile, including TIM_BOND Dutch defaults, conflicting hints, manual switching, navigation/reloads, parent attribution, mocked lead delivery, existing referrals, and invalid-link rejection/recovery. Standalone QR utility: both tests passed and the saved TIM_BOND PNG decoded to the exact production URL. No deployment or push was performed; production-domain behavior awaits deployment of these changes.

`js/referral-registry.js` defines all registered consultants and sub-referrers, their permanent `parentConsultant` relationships, and participant lists. Browser and lead endpoint both use these records. The established `MUHAMED` incoming alias normalizes to `MOHAMED`; arbitrary unknown IDs do not. Standalone `MOHAMED_ABDO` and `ref=MOHAMED&subref=MOHAMED_ABDO` are both valid and retain Mohamed as parent.

An explicitly unknown/empty referral, duplicate parameters, or invalid parent/client combination displays the existing translated invalid-link screen. Current-page attribution is marked invalid rather than falling back to saved data, and form submissions are blocked. Previously established attribution stays stored and is usable after explicitly continuing to a clean URL. The lead API independently validates registered referral records, relationships, and any explicit referral in the submitted page URL.

Opening the regular domain does not clear `turkluxx_referral`, its pair/metadata, or the separate `turkluxx_phone_referral` contact preference. A remembered VLAD/ALMA contact context therefore still displays the 949 number on clean URLs. This is stored preference/attribution behavior, not a cookie or cache rule.

# Participant referrals

Example: `https://turkluxx.com/?ref=AHMAD&client=RAWASHDEH_MOHD&lang=ar`.

`js/referral-registry.js` is the single allowlist used by the browser and the existing Worker lead endpoint. Add an uppercase identifier to its partner's `ar` or `en` array, using underscores for spaces. Both requested languages are permitted for every registered participant; the grouping describes the suggested link language, not a language restriction. Rebuild and deploy the static assets and Worker together. No dependencies were added.

URL partner/client identifiers are case insensitive; surrounding whitespace is removed and participant spaces become underscores. Unknown partners, unknown clients, mismatched pairs, missing/unsupported languages, duplicate parameters, and mixed `client`/`subref` links are rejected with the invalid-link screen and never overwrite stored attribution. Language URL hints continue using the existing i18n mechanism independently of attribution, with its existing six-language support and preference priority.

## Persistence and privacy

New participant links store only `{referral, client}` atomically under `turkluxx_participant_referral` in first-party `sessionStorage`. The first valid attribution wins. An already established legacy partner or `subref` attribution also blocks a new participant link. Later links cannot add a client to an earlier partner-only attribution. Existing legacy localStorage behavior and migrations remain supported for backwards compatibility.

Same-origin navigation, reloads, and language changes retain the session record without appending identifiers to internal links. A fresh independent tab/session starts without participant attribution (browsers can copy sessionStorage when duplicating a tab and restore sessions). There is no cross-device identity. Global Privacy Control or Do Not Track opt-out signals disable reading/writing the new participant session record. Blocked storage or a privacy opt-out retains attribution only in memory on the current page; navigation persistence cannot be guaranteed. Malformed saved records are ignored. No full landing URL, timestamp, buyer details, or language preference is added to the participant session record.

The existing enquiry page URL field remains part of form submissions and may include referral query parameters. Both callback and contact forms send `referral` and `client`; the Worker checks allowlisted membership again and includes `Participant` in the existing lead email. These are untrusted attribution labels, not authentication or proof of ownership. This feature makes no automatic network request to record a visit. Existing form handling and spam/delivery limits remain applicable.

The site's privacy and cookie notices describe this session storage. Session storage alone does not establish a legal exemption from consent. No consent manager exists in this checkout; an operator must determine whether referral retention needs consent in the deployment's jurisdictions. If required, gate the session write on the site's consent integration and keep current-page attribution in memory until permission is granted. No analytics/advertising cookies or third-party tracking were introduced.

## Tracking limits and separate smallest proposal

Implemented: remember a validated referral label in the browser session and associate that label with an enquiry submitted through the existing lead endpoint/email delivery. Not implemented: click counts, unique visitors, buyer identification, sale verification, conversion attribution, CRM integration, or a new tracking backend.

For click statistics, a separate minimal implementation would add a POST endpoint to the existing Worker and a small D1 aggregate table keyed by date/partner/client. Validate membership, apply rate limiting and bot filtering, record one landing event per session after any required consent, and provide an authenticated report endpoint. Decide retention and counting rules before rollout. Aggregate events still count accepted requests rather than verified people or sales; reliable sales statistics require confirmed sales records and an explicit attribution policy. None of this infrastructure is created here.

## Modified files

- `js/referral-registry.js`, `js/referral.js`: allowlist, parsing, session attribution, graceful invalid links.
- `js/callback.js`, `worker/index.mjs`: both forms' participant payload and endpoint/email validation.
- Eight HTML pages: load the registry before referrals; privacy/cookie notices describe retention.
- `scripts/build.mjs`, `scripts/public-files.json`: include the registry in the existing shared bundle.
- `scripts/referral.test.mjs`, `scripts/participant-referral.test.mjs`, `scripts/test-participant-referral-browser.mjs`: legacy, all participant links, browser/form coverage.
- `README.md`, this document: behavior and maintenance instructions.

## Verification

Run `npm.cmd test`, `npm.cmd run build`, then `node scripts/test-participant-referral-browser.mjs` with headless Chrome debugging on port 9227. The browser suite uses the actual production bundle at desktop 1440×1000 and mobile 390×844 and checks all 23 links, translations/direction, overflow, callback payloads, intercepted contact submissions, language switching, clean navigation, and first-touch retention. Intercepted submissions send no email. Unit tests cover invalid parameters, wrong partners, blocked/malformed storage, new sessions, and server validation/email content. Existing unit suites cover build, lead handling, and language behavior.


## Recorded results

- Existing unit suites plus participant coverage: 90 passed, 0 failed.
- Production build: passed.
- Existing legacy referral browser suite: all 10 scenarios passed.
- Participant browser coverage: all 23 links at both desktop and mobile sizes (46 cases) passed; both form integrations were checked with synthetic data.
- Additional existing browser scripts: `test-contact-browser.mjs` stops on a null address selector at line 98; `test-production-browser.mjs` matches the home page in all six languages, then reports a source/dist height mismatch on the Istanbul page. These broader scripts did not complete successfully; full-site regression verification is therefore limited. No unrelated content/style changes were made to resolve their assertions.

## Registered URLs

- https://turkluxx.com/?ref=AHMAD&client=RAWASHDEH_MOHD&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=MUNTHER&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=YUSUF_R&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=GAYTH&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=SAFA&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=BAHA&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=NAYZAR&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=OMAR_GABBA&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=MUHAMMAD_SALAH&lang=ar
- https://turkluxx.com/?ref=AHMAD&client=ERIC_SAUER&lang=en
- https://turkluxx.com/?ref=AHMAD&client=HAMID_FARES&lang=en
- https://turkluxx.com/?ref=AHMAD&client=RADWAN&lang=en
- https://turkluxx.com/?ref=AHMAD&client=SAMI_HARB&lang=en
- https://turkluxx.com/?ref=AHMAD&client=ABBAS_SULTANI&lang=en
- https://turkluxx.com/?ref=AHMAD&client=SAFWAN_RWASHD&lang=en
- https://turkluxx.com/?ref=AHMAD&client=MUHAMED_HUSS&lang=en
- https://turkluxx.com/?ref=AHMAD&client=SAIFE_HUSS&lang=en
- https://turkluxx.com/?ref=AHMAD&client=HAMZAH_HUSS&lang=en
- https://turkluxx.com/?ref=AHMAD&client=ERICK_WHITESIDE&lang=en
- https://turkluxx.com/?ref=AHMAD&client=SID_PARTOW&lang=en
- https://turkluxx.com/?ref=AHMAD&client=PARTOW_HAMID&lang=en
- https://turkluxx.com/?ref=AHMAD&client=SAMI_CHALFOUH&lang=en
- https://turkluxx.com/?ref=AHMAD&client=OMAR_SHAKERCHI&lang=en
