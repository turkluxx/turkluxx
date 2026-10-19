# Referral URL and fallback policy

Exactly four registry roots are supported: `VLAD`, `ALMA`, `MOHAMED`, and `AHMAD`. Every other identifier must have registry ancestry under one of them. `TIM_BOND: Object.freeze({ parentConsultant: 'VLAD' })` uses the same relationship mechanism as `MOHAMED_ABDO: Object.freeze({ parentConsultant: 'MOHAMED' })`. Commission rules and percentages are unchanged.

The shared `resolveTurkLuxxReferralURL` resolver in `js/referral-registry.js` is used by browser attribution, initial language selection, and the lead endpoint. It accepts full paths such as `?ref=VLAD=TIM_BOND&lang=nl` and `?ref=MOHAMED=MOHAMED_ABDO`, checking every adjacent registry relationship. Percent-encoded equals signs work too. Existing complete `?ref=VLAD&subref=TIM_BOND&lang=nl` and `?ref=MOHAMED&subref=MOHAMED_ABDO` links remain valid, including the current QR deliverables. Deeper registered paths are retained in `referralPath`; all nodes must be present, ordered, and distinct. Incomplete paths, unknown IDs, mismatched parents, duplicates, empty refs and bare children such as `?ref=TIM_BOND` fall back to VLAD. No identifiers are created and no child is inferred from an invalid path.

Missing `ref` means normal website behavior, including existing saved attribution; unrelated `client` or `subref` hints alone do not create VLAD fallback. A valid incoming link retains the established first-valid-attribution rule. An explicitly invalid incoming link overrides saved root, child and participant attribution with `{ referral: 'VLAD' }` and opens the normal website. Its fallback record is written atomically under `turkluxx_referral_fallback` in localStorage, ahead of legacy/session attribution when reading subsequent pages. Reloading the same invalid entry preserves the record's metadata. With blocked storage, fallback still works on the current page, but persistence across clean URLs cannot be guaranteed. The original landing URL remains metadata, never an active invalid referral. The Worker independently applies VLAD fallback when the submitted page URL has an invalid explicit ref, removing child, client, and path fields before validating/delivering either form. Unknown payload referrals without an invalid incoming URL still fail schema validation.

A valid TIM_BOND path resolves to `{ referral: 'VLAD', subref: 'TIM_BOND', directReferrer: 'TIM_BOND', parentConsultant: 'VLAD' }` in browser and lead records. A bare TIM_BOND code instead resolves to VLAD without child fields.

For invalid incoming URLs, the server's validated lead has `referral: 'VLAD'` with all child/client/path fields removed. Its `page` is normalized to a VLAD URL; the unmodified submitted URL is kept only in the server-generated `diagnostics.originalPage` field. Client-supplied diagnostics are ignored. Notifications use `[VLAD]` in the subject and `Referral: VLAD` in the body, with any original URL explicitly labeled `Original page (diagnostic only)`. This checkout has no persistent lead database, CRM integration, or commission calculation engine: the implemented final delivery is the email binding, fed only the validated lead. No commission rules are changed and no external CRM/database records are claimed.

# Language preferences

Complete `VLAD=TIM_BOND` paths and their existing parent/subref equivalent start in Dutch, ahead of browser/general saved/URL language hints, and remember manual language choices for later navigation and QR visits. Bare or malformed TIM_BOND URLs receive no child preference: fallback preserves an explicit supported `lang` and otherwise follows VLAD's remembered manual choice or English default. Switching languages updates existing URL language hints and continues working after fallback.

Existing exact top-level `AHMAD`, `ALMA`, `VLAD`, and `MOHAMED` entries retain their English initial preference and remembered manual choices. Other valid child/participant links retain ordinary language selection. The registry loads before i18n in source pages and in the production bundle so all initial choices use the same validated URL result.

# Phone policy

The latest effective incoming referral selects contact presentation independently of first-touch attribution. All referrals rooted at VLAD or ALMA display `+1 (949) 331-4195`, with governed telephone links set to `tel:+19493314195`. Invalid incoming refs select VLAD and therefore the same phone. Other trees and fresh visits without ref retain their existing contact numbers. The `turkluxx_phone_referral` preference preserves contact context across clean navigation/reloads; language changes reapply it. WhatsApp destinations remain unchanged. Root traversal is iterative, with missing-parent/cycle protection and no child-name matching.

# Standalone QR deliverables

| Referral URL | File |
| --- | --- |
| `https://turkluxx.com/?ref=AHMAD&lang=en` | `generated/qr_codes/QR_AHMAD_STATIC.png` |
| `https://turkluxx.com/?ref=ALMA&lang=en` | `generated/qr_codes/QR_ALMA_STATIC.png` |
| `https://turkluxx.com/?ref=VLAD&lang=en` | `generated/qr_codes/QR_VLAD_STATIC.png` |
| `https://turkluxx.com/?ref=MOHAMED&lang=en` | `generated/qr_codes/QR_MOHAMED_STATIC.png` |
| `https://turkluxx.com/?ref=VLAD&subref=TIM_BOND&lang=nl` | `generated/qr_codes/QR_TIM_BOND_VLAD_NL.png` |

The existing QR URLs remain valid. `python scripts/generate-referral-qr.py` is an optional manual utility requiring Pillow, qrcode and zxing-cpp. It generates/decode-verifies 1000px PNG files in Git-ignored `generated/qr_codes/`; no QR file is a website input or deployment requirement, and none enter `dist/`. Run `python scripts/test-referral-qr.py` independently using disposable temporary output. Website builds and core tests need no QR dependencies or images.

# Fallback verification

Run `npm.cmd test`, `npm.cmd run build`, and `node scripts/test-referral-policy-browser.mjs --dist --fallback-only` with headless Chrome CDP on port 9227. The browser matrix exercises all 12 requested URL cases on desktop/mobile, existing pair/QR links, saved root/child precedence, displayed phones, actual callback and contact form payloads, mocked Worker/email validation, manual switching, clean navigation and reloads. No real emails are sent. No deployment or push is performed.

Verified 2026-10-19: 362 rendered-page policy checks passed with both actual form submit handlers reaching the mocked Worker/email binding; 46 participant desktop/mobile scenarios passed; 21 browser-language scenarios and 10 existing AHMAD child scenarios passed. Unit suite: 109 passed, with the pre-existing Videos/Team header comparison as the sole failure. Production build passed, both standalone QR utility tests passed, and the generated TIM_BOND PNG decoded to its unchanged full parent/subref URL. No QR images were present in dist. No deployment or push.

Server-pipeline verification (2026-10-19): `node scripts/test-referral-policy-browser.mjs --dist --server-fallback-only` passed 104 rendered-page checks and 16 actual callback/contact submissions for `?ref=TIM_BOND&lang=nl` and `?ref=UNKNOWN`, on desktop/mobile both fresh and after saved ALMA attribution. Every submitted payload, validated server lead and final mocked email notification used VLAD. Local synthetic evidence is saved at `build/server-referral-attribution.json`, including separated original-URL diagnostics. Backend unit tests also submit forged referral/child/client/path/diagnostic fields and verify that neither invalid codes nor saved owners reach attribution or notification owner fields. Updated full unit suite: 110 passed, with the same pre-existing Videos/Team header comparison failure. Build passed. No real notifications, deployment or push.

# Participant referrals

Example: `https://turkluxx.com/?ref=AHMAD&client=RAWASHDEH_MOHD&lang=ar`.

`js/referral-registry.js` is the single allowlist used by the browser and the existing Worker lead endpoint. Add an uppercase identifier to its partner's `ar` or `en` array, using underscores for spaces. Both requested languages are permitted for every registered participant; the grouping describes the suggested link language, not a language restriction. Rebuild and deploy the static assets and Worker together. No dependencies were added.

URL partner/client identifiers are case insensitive; surrounding whitespace is removed and participant spaces become underscores. Unknown partners, unknown clients, mismatched pairs, missing/unsupported languages, duplicate parameters, and mixed `client`/`subref` links apply VLAD fallback when accompanied by an explicit ref, overriding saved attribution without retaining an invalid participant label. Language URL hints continue using the existing i18n mechanism independently of attribution, with its existing six-language support and preference priority.

## Persistence and privacy

New participant links store only `{referral, client}` atomically under `turkluxx_participant_referral` in first-party `sessionStorage`. The first valid attribution wins except that explicit invalid incoming refs establish the global VLAD fallback described above. An already established legacy partner or `subref` attribution also blocks a new participant link. Later links cannot add a client to an earlier partner-only attribution. Existing legacy localStorage behavior and migrations remain supported for backwards compatibility.

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


## Historical participant verification results (before global fallback policy)

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
