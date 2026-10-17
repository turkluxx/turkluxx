## Production build

Run `npm run build` after source changes or merges before packaging assets. The build reads the current source files, includes `js/referral.js` in `dist/js/turkluxx.min.js`, and rewrites production HTML to load that shared bundle. It clears stale output first. Uploading an older `dist/` directory will serve older logic even when the source checkout is current.

`dist/` is generated and intentionally ignored by Git; merging source commits does not update an already deployed bundle. Wrangler's configured build hook runs the same build command and uses `./dist` as its asset directory. For local production verification, run `node scripts/test-referral-policy-browser.mjs --dist` with Chrome's CDP endpoint on port 9227. This does not deploy anything.

## Lead email endpoint (implemented; not deployed)

Use Node.js 22+ and the pinned Wrangler installation:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8787/. Wrangler builds `dist/` automatically and serves
both assets and `POST /api/lead`. A Python/static-only server cannot execute
this endpoint. Local `send_email` is simulated by Wrangler: messages are logged
and written under ignored `.wrangler/tmp/email/`; no real email is delivered.
Use synthetic contact details for local tests. Do not use remote bindings for
these checks.

`worker/index.mjs` handles exactly `/api/lead`; other `/api/*` paths return JSON
404 and other requests fall back to `env.ASSETS.fetch`. API responses are not
cached. The binding `LEAD_EMAIL` is restricted to `turkluxx101@gmail.com`.
The fixed sender is `TurkLuxx Leads <leads@turkluxx.com>`; validated customer email
is Reply-To only. Neither recipient nor sender is client-controlled.

Validation requires JSON with non-empty name, phone and email, and an exact
ALMA/AHMAD/MUHAMED/VLAD/LAITH/FAOZI/DIRECT referral. Limits (characters): name 120, phone 80,
email 254, project 120, property 180, propertyCode 80, page 2048. Optional values
may be null or absent. Control characters are rejected; email format and
HTTP(S) page URLs are checked. Bodies over 8 KiB are rejected even without
Content-Length. Cross-origin browser submissions are rejected; no CORS is added.
Client leadId/submittedAt and unknown fields are ignored. Referral validation
checks its allowed value, not proof of referral ownership.

The Worker creates UTC `submittedAt` and `TL-YYYYMMDD-` plus an uppercase,
hyphen-free `crypto.randomUUID()` (122 random bits). It waits for the native
email binding before returning success. Binding errors return a generic 502;
server logs include the generated lead ID, not contact data or internal errors.
Success means Cloudflare accepted the send, not a guarantee of inbox delivery.

The existing callback submit handler builds the same payload and continues to
emit `turkluxx:lead-ready`. It alone sends the request. An in-memory pending flag
and disabled submit button prevent concurrent submissions; errors retain all
fields and permit retry. A modal-opening counter prevents a late response from
changing the status of a different enquiry. There is no database-backed
idempotency: a retry after an ambiguous network timeout could send another email.

Verification:

```sh
npm test
npm run build
# With npm run dev running; uses the existing local Python Playwright test tool:
python scripts/test-lead-browser.py
```

The Node suite tests validation, fixed addressing, email composition, server
metadata and binding failures with an in-memory stub. Browser checks exercise
A-D against the local Worker simulator, pending double-submit prevention,
failure/retry, first-touch context and modal reopening. No real email test has
been performed.

Given the confirmed Email Routing setup and verified destination in the same
Cloudflare account as this Worker, no additional dashboard change is required
for this restricted binding. Wrangler applies it when deployment is authorized.
No credentials or external email provider are required. Do not deploy or run a
real email test until explicitly authorized.

Cloudflare references:
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/email-service/configuration/send-bindings/
- https://developers.cloudflare.com/email-service/local-development/sending/

# TurkLuxx desktop hero

## Cloudflare deployment

Requires Node.js 22 or newer. Install the pinned deployment tooling with `npm ci`.

- Build: `npm run build`
- Deploy: `npm run deploy` (runs `wrangler deploy --config wrangler.json`)
- Check deployment safeguards: `npm test`

Wrangler's custom `build.command` runs `npm run build` before each deployment,
including direct `npx wrangler deploy` and preview version uploads. The build
removes old `dist/`, validates all required inputs, then copies the public files
without transforming their bytes or relative paths. A failure exits nonzero and
removes incomplete output, stopping deployment. `assets.directory` is `./dist`.
See Cloudflare's [custom build documentation](https://developers.cloudflare.com/workers/wrangler/custom-builds/).

`scripts/public-files.json` is the reviewed source allowlist: `index.html`,
`rengi-istanbul.html`, styles in `css/`, scripts in `js/`, every current villa
photo and floor plan in `img/`, and the public images in `assets/`.
`rengi-antalya.html` is also copied automatically if present.
When adding public assets, add their paths to the manifest; never edit or commit
`dist/`. The unreferenced source material in `materials/` is not published.
Repository files, documentation, local tools and unlisted files are not copied.
The builder rejects symlinks/junctions, metadata paths and assets over 25 MiB.

In Cloudflare Workers Builds, use the repository root as the **build working
directory**, `npm run build` as the build command, and `npm run deploy` as the
deploy command. The uploaded assets directory is exclusively `dist/`. Remove any
old CLI `--assets .` argument: explicit CLI overrides take precedence over Wrangler
configuration. For preview uploads use `npx wrangler versions upload --config
wrangler.json`. Do not bypass the custom build. The configured Worker name is
`turkluxx`; it must match the existing Cloudflare Worker. This checkout contained
no previous Wrangler configuration or Cloudflare CI workflow; account/dashboard
settings must be checked separately.

Current source blockers (preserved intentionally): the working tree has deleted
`assets/turkluxx-villa.png`, `assets/turkluxx-villa-2.png`,
`assets/turkluxx-villa-3.png`, `assets/turkluxx-villa-4.png`, and
`assets/rengi/master-plan.jpg`, although the pages still reference them. The build
fails until these required sources are available. An existing URL in
`css/rengi-istanbul.css` resolves to the absent
`css/assets/istanbul-family-hero.png`; this deployment change preserves that URL
and does not repair website content. Existing unfinished navigation routes are
also unchanged.

Open `index.html`, or run `python -m http.server 8765` and visit http://localhost:8765.

The reference-led hero uses semantic HTML and vanilla CSS. All custom classes use the `turkluxx-` prefix. At widths of 1200px and above, the complete hero and seven-item benefits strip occupy one viewport. The prior narrow-screen layout and sections below the hero are retained; no tablet/mobile redesign was performed.

Includes a gold wordmark, circular UK flag, citizenship card and passport, lifestyle message, climate card, and two telephone links to `tel:+18184347266`. Google Fonts provides Manrope, Cormorant Garamond and Oooh Baby (only for the lifestyle phrase).

Integration pending: connect the proposed navigation routes and `/contact?interest=citizenship` to published pages. English is the only configured language.

## Assets

- `assets/istanbul-family-hero.png`: AI-generated illustrative Istanbul villa scene, without website text or controls.
- `assets/turkish-passport.png`: AI-generated illustrative passport cover.
- `assets/uk-flag.svg`: circular vector flag.

Both raster assets were created with the built-in imagegen tool. Prompts are in `assets/image-prompts.md`. They are concept imagery, not photographs of a verified property. Existing assets remain in use by the prior layout and lower sections.

## Verification

Checked in headless Chrome at 1366x768, 1440x900 and 1920x1080. Hero height equals viewport height, the benefits strip ends at the viewport bottom, the flag is 36x36px, and the page has no horizontal overflow. Google Fonts loaded successfully. A 1440x900 preview is saved in `hero-desktop-preview.png`.

## Tilda

Upload the stylesheet and assets, update their URLs, include the font link and copy the `.turkluxx-sales-hero` section into an HTML block. The new styles are scoped to the desktop hero.

## Two-level referral attribution

- Laith Al Rawashdeh: https://turkluxx.com/?ref=AHMAD&subref=LAITH&lang=ar
- Faozi Al Khalaqi: https://turkluxx.com/?ref=AHMAD&subref=FAOZI&lang=ar

For these links, `referral: "AHMAD"` identifies the primary consultant and
`subref: "LAITH"` or `"FAOZI"` identifies the direct referrer. Attribution and
both existing forms also retain `directReferrer` and `parentConsultant` explicitly.
The existing Worker validates the complete pair, derives these labels from it,
and includes both levels in lead email content. Only AHMAD/LAITH and AHMAD/FAOZI
are authorized pairs. Unknown, empty, orphaned, mismatched or duplicated URL
parameters are ignored without changing storage or hiding the website.
The endpoint rejects invalid submitted pairs, including null or empty subref.

The complete pair, timestamp and original landing URL are established by one
atomic localStorage write to `turkluxx_referral_pair`. The existing first valid
touch wins: neither later pairs nor individual referral links replace it. Legacy
single-referral storage remains readable and blocks later pair attribution; a
saved AHMAD touch cannot acquire a sub-referrer on a later visit. Invalid links
never establish either level. Attribution survives clean internal navigation;
referral parameters need not be appended to every internal URL.

Existing single-level URLs (including `?ref=LAITH` and `?ref=FAOZI`) retain their
previous meaning and parent association. Muhamed's only valid ID is `MUHAMED`;
`MUHHAMED` is rejected in new links and lead submissions. Existing localStorage
attribution using the old misspelling is migrated to `MUHAMED` without changing
its first-touch timestamp or original landing URL. If storage writes are blocked,
readable saved attribution still uses the canonical ID for lead submission and
migration is retried on later reads. Single-level lead structures and email
subjects retain their behavior.

There is no server-side attribution database. The existing Worker sends lead
emails but does not persist attribution or leads. Clearing or blocking
localStorage loses attribution, and it does not follow visitors across browsers
or devices. No backend, CRM, dependencies or QR images were added.

The existing `lang=ar` hint selects Arabic and RTL independently of attribution.
The landing page waits for initial translation before revealing content (with a
five-second failure fallback). Manual language selection changes only `lang` in
the current URL, leaving `ref` and `subref` intact, and saves the existing language
preference. Clean subsequent navigation uses that preference. Revisiting an
explicit `lang=ar` URL selects Arabic again, consistent with existing priority.

Verification: `npm test`, `npm run build`, and
`node scripts/test-referral-browser.mjs` (Chrome debugging on port 9227).
The browser suite checks legacy and paired links, Arabic content/initial paint,
RTL, both form payloads, language changes, navigation and first-touch precedence.
Lead validation/email tests use synthetic data; browser API requests are stubbed
and send no email. No production deployment is performed.


## Participant referral links

See [implementation, privacy, URL list and verification](docs/referrals.md).
