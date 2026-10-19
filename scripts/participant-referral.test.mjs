import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateLead, createLeadEmail } from '../worker/index.mjs';

const source = ['referral-registry', 'referral'].map(name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8')).join('\n');
const registry = globalThis.TurkLuxxReferralRegistry;
function visit(query, session = new Map(), blocked = false, navigator = {}) {
  const storage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error('blocked'); session.set(key, value); } };
  const window = { location: new URL(query, 'https://turkluxx.com') };
  runInNewContext(source, { window, navigator, URLSearchParams, Date, sessionStorage: storage, localStorage: { getItem: () => null } });
  return window.getTurkLuxxReferralAttribution();
}
for (const [language, clients] of Object.entries(registry.AHMAD)) {
  for (const client of clients) test(`${client}: ${language} link, persistence and lead validation`, () => {
    const session = new Map();
    const attribution = visit(`/?ref=ahmad&client=${client.toLowerCase()}&lang=${language}`, session);
    assert.equal(attribution.referral, 'AHMAD');
    assert.equal(attribution.client, client);
    for (const path of ['/', '/rengi-istanbul.html', '/rengi-antalya.html', '/meet-our-team.html', '/privacy-policy.html', '/?ref=AHMAD&client=MUNTHER&lang=en', '/?client=UNKNOWN', '/?lang=en']) {
      const result = visit(path, session);
      assert.equal(result.client, client);
    }
    const fields = { ...attribution, name: 'Test', phone: '123', email: 'test@example.com' };
    for (const lead of [validateLead(fields), validateLead({ ...fields, source: 'general-contact', language, message: 'Enquiry' })]) {
      assert.equal(lead.client, client);
      assert.match(createLeadEmail(lead, 'test', 'test').text, new RegExp(`Participant: ${client}`));
    }
    assert.equal(visit('/', new Map()).referral, 'DIRECT', 'A new session has no participant attribution');
  });
}
test('Invalid, duplicate, mismatched and malicious links are harmless', () => {
  for (const query of ['ref=AHMAD&client=UNKNOWN&lang=en', 'ref=VLAD&client=MUNTHER&lang=ar', 'client=MUNTHER&lang=ar', 'ref=AHMAD&client=MUNTHER', 'ref=AHMAD&client=MUNTHER&lang=xx', 'ref=AHMAD&client=MUNTHER&lang=en&lang=ar', 'ref=AHMAD&client=MUNTHER&client=SAFA&lang=ar', 'ref=AHMAD&client=MUNTHER&subref=LAITH&lang=ar', 'ref=AHMAD&client=%3Cscript%3E&lang=en']) {
    const session = new Map();
    assert.equal(visit('/?' + query, session).referral, query.startsWith('client=') ? 'DIRECT' : 'VLAD');
    assert.equal(session.size, 0);
  }
  for (const fields of [{ referral: 'VLAD', client: 'MUNTHER' }, { referral: 'AHMAD', client: 'UNKNOWN' }, { referral: 'AHMAD', client: 'MUNTHER', subref: 'LAITH' }]) {
    assert.throws(() => validateLead({ ...fields, name: 'Test', phone: '123', email: 'test@example.com' }), /Invalid referral client/);
  }
  assert.equal(visit('/?ref=AHMAD&client=MUNTHER&lang=ar', new Map(), true).client, 'MUNTHER');
  assert.equal(visit('/?ref=AHMAD&client=Eric%20Sauer&lang=en').client, 'ERIC_SAUER');
  assert.equal(visit('/', new Map([['turkluxx_participant_referral', '{broken']])).referral, 'DIRECT');
});

test('Privacy opt-out keeps participant attribution on the current page only', () => {
  for (const navigator of [{ globalPrivacyControl: true }, { doNotTrack: '1' }]) {
    const session = new Map();
    assert.equal(visit('/?ref=AHMAD&client=MUNTHER&lang=ar', session, false, navigator).client, 'MUNTHER');
    assert.equal(session.size, 0);
    assert.equal(visit('/', session, false, navigator).referral, 'DIRECT');
  }
});
