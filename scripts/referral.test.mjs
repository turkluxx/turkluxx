import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateLead, createLeadEmail } from '../worker/index.mjs';
const registrySource = readFileSync(new URL('../js/referral-registry.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../js/referral.js', import.meta.url), 'utf8');
function visit(path = '/', storage = new Map(), blocked = false, writeBlocked = false) {
  const elements = [];
  const window = { location: new URL(path, 'https://turkluxx.com') };
  const document = {
    head: { append: element => elements.push(element) },
    body: { classList: { add() {} }, append: element => elements.push(element) },
    createElement: tag => ({ tag, setAttribute() {}, querySelector: () => ({ focus() {} }) })
  };
  const localStorage = {
    getItem: key => { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (blocked || writeBlocked) throw Error('blocked'); storage.set(key, value); }
  };
  runInNewContext(registrySource + source, { window, document, localStorage, sessionStorage: localStorage, URLSearchParams, Date });
  return { window, elements, storage };
}
const fields = { name: 'Test', phone: '123', email: 'test@example.com' };
const cases = [
  ['?ref=VLAD', 'VLAD'], ['?ref=ALMA', 'ALMA'], ['?ref=MOHAMED', 'MOHAMED'], ['?ref=AHMAD', 'AHMAD'],
  ['?ref=VLAD=TIM_BOND&lang=nl', 'VLAD', 'TIM_BOND'], ['?ref=TIM_BOND&lang=nl', 'VLAD'],
  ['?ref=MOHAMED=MOHAMED_ABDO', 'MOHAMED', 'MOHAMED_ABDO'], ['?ref=MOHAMED_ABDO', 'VLAD'],
  ['?ref=UNKNOWN', 'VLAD'], ['?ref=ALMA=UNKNOWN', 'VLAD'], ['?ref=', 'VLAD'], ['', 'DIRECT']
];
for (const [query, root, child] of cases) test(`${query || 'missing ref'}: effective attribution, navigation and both lead types`, () => {
  const entry = visit('/' + query);
  const attribution = entry.window.getTurkLuxxReferralAttribution();
  assert.equal(entry.elements.length, 0, 'Normal page, no error screen');
  assert.equal(attribution.referral, root);
  assert.equal(attribution.subref, child);
  assert.equal(attribution.directReferrer, child);
  assert.equal(attribution.parentConsultant, child ? root : undefined);
  for (const path of ['/', '/videos?lang=es', '/' + query]) {
    assert.equal(JSON.stringify(visit(path, entry.storage).window.getTurkLuxxReferralAttribution()), JSON.stringify(attribution));
  }
  for (const source of ['callback', 'general-contact']) {
    const lead = validateLead({ ...attribution, ...fields, source, language: 'nl', message: 'Test enquiry', page: 'https://turkluxx.com/' + query });
    assert.equal(lead.referral, root);
    assert.equal(lead.subref, child);
    assert.equal(lead.parentConsultant, child ? root : undefined);
    assert.match(createLeadEmail(lead, 'id', 'time').text, new RegExp(`Referral: ${root}`));
  }
});

test('Only four roots; all registered children require their complete registry path', () => {
  const registry = globalThis.TurkLuxxReferralRegistry;
  assert.deepEqual(Object.keys(registry).filter(code => !registry[code].parentConsultant).sort(), ['AHMAD', 'ALMA', 'MOHAMED', 'VLAD']);
  assert.equal(registry.TIM_BOND.parentConsultant, 'VLAD');
  assert.equal(registry.MOHAMED_ABDO.parentConsultant, 'MOHAMED');
  for (const [code, record] of Object.entries(registry)) {
    if (!record.parentConsultant) continue;
    const path = `${record.parentConsultant}=${code}`;
    const incoming = visit('/?ref=' + path).window.getTurkLuxxReferralAttribution();
    assert.equal(incoming.subref, code);
    assert.equal(visit('/?ref=' + code).window.getTurkLuxxReferral(), 'VLAD');
    const oldPair = visit(`/?ref=${record.parentConsultant}&subref=${code}`).window.getTurkLuxxReferralAttribution();
    assert.equal(oldPair.subref, code);
  }
});

test('Invalid entry overrides saved roots, children and participants and survives clean navigation', () => {
  for (const previous of ['?ref=ALMA', '?ref=MOHAMED=MOHAMED_ABDO', '?ref=AHMAD&client=MUNTHER&lang=ar']) {
    for (const query of ['?ref=UNKNOWN', '?ref=', '?ref=TIM_BOND', '?ref=AHMAD=TIM_BOND', '?ref=VLAD=TIM_BOND=UNKNOWN', '?ref=VLAD&ref=ALMA', '?ref=VLAD==TIM_BOND', '?ref=VLAD=TIM_BOND&subref=TIM_BOND']) {
      const saved = visit('/' + previous);
      const entry = visit('/' + query, saved.storage);
      assert.equal(entry.window.getTurkLuxxReferral(), 'VLAD');
      assert.equal(entry.window.getTurkLuxxReferralAttribution().subref, undefined);
      assert.equal(entry.window.getTurkLuxxReferralAttribution().client, undefined);
      assert.equal(visit('/', entry.storage).window.getTurkLuxxReferral(), 'VLAD');
      assert.equal(visit('/' + query, new Map(), true).window.getTurkLuxxReferral(), 'VLAD');
    }
  }
});

test('Server independently replaces invalid URL attribution, including forged child/client fields', () => {
  for (const query of ['?ref=UNKNOWN', '?ref=', '?ref=TIM_BOND', '?ref=ALMA=UNKNOWN', '?ref=AHMAD&subref=TIM_BOND']) {
    const lead = validateLead({ ...fields, referral: 'UNKNOWN', subref: 'TIM_BOND', client: 'MUNTHER', parentConsultant: 'ALMA', page: 'https://turkluxx.com/' + query });
    assert.equal(lead.referral, 'VLAD');
    assert.equal(lead.subref, undefined);
    assert.equal(lead.client, undefined);
    assert.equal(lead.parentConsultant, undefined);
  }
  assert.throws(() => validateLead({ ...fields, referral: 'UNKNOWN' }), /Invalid referral/);
  assert.throws(() => validateLead({ ...fields, referral: 'AHMAD', subref: 'TIM_BOND' }), /Invalid referral pair/);
});

test('Valid first-touch, aliases and legacy stored migrations remain supported without incoming invalid refs', () => {
  for (const raw of ['MUHAMED', 'mohamed', ' MOHAMED ']) assert.equal(visit('/?ref=' + encodeURIComponent(raw)).window.getTurkLuxxReferral(), 'MOHAMED');
  const saved = visit('/?ref=MOHAMED=MOHAMED_ABDO');
  assert.equal(visit('/?ref=VLAD', saved.storage).window.getTurkLuxxReferralAttribution().subref, 'MOHAMED_ABDO');
  for (const raw of ['MUHAMED', 'MUHHAMED']) {
    const stored = new Map([['turkluxx_referral', raw]]);
    assert.equal(visit('/', stored).window.getTurkLuxxReferral(), 'MOHAMED');
  }
  const pair = new Map([['turkluxx_referral_pair', JSON.stringify({referral:'MUHAMED',subref:'ABDO'})]]);
  assert.equal(visit('/', pair).window.getTurkLuxxReferralAttribution().subref, 'MOHAMED_ABDO');
});

test('Missing ref never creates VLAD fallback or discards an existing attribution', () => {
  for (const query of ['', '?lang=nl', '?client=UNKNOWN', '?subref=TIM_BOND']) {
    assert.equal(visit('/' + query).window.getTurkLuxxReferral(), 'DIRECT');
    const saved = visit('/?ref=ALMA');
    assert.equal(visit('/' + query, saved.storage).window.getTurkLuxxReferral(), 'ALMA');
  }
});
