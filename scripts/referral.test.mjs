import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateLead, createLeadEmail } from '../worker/index.mjs';

const source = readFileSync(new URL('../js/referral.js', import.meta.url), 'utf8');

test('Mohamed canonical ID and Abdo attribution survives navigation and reaches both lead forms', () => {
  const mohamed = visit('/?ref=MOHAMED&lang=ar');
  assert.equal(mohamed.elements.length, 0);
  assert.equal(mohamed.window.getTurkLuxxReferral(), 'MOHAMED');
  const abdoUrl = '/?ref=MOHAMED&subref=MOHAMED_ABDO&lang=ar';
  const abdo = visit(abdoUrl);
  assert.equal(abdo.elements.length, 0);
  assert.equal(abdo.storage.size, 1);
  const attribution = abdo.window.getTurkLuxxReferralAttribution();
  assert.equal(attribution.referral, 'MOHAMED');
  assert.equal(attribution.subref, 'MOHAMED_ABDO');
  assert.equal(attribution.directReferrer, 'MOHAMED_ABDO');
  assert.equal(attribution.parentConsultant, 'MOHAMED');
  for (const path of ['/', '/meet-our-team.html', '/?ref=AHMAD&subref=LAITH']) {
    assert.equal(JSON.stringify(visit(path, abdo.storage).window.getTurkLuxxReferralAttribution()), JSON.stringify(attribution));
  }
  for (const extra of [{}, { source: 'general-contact', language: 'ar', message: 'Test' }]) {
    const lead = validateLead({ ...attribution, ...extra, parentConsultant: 'AHMAD', directReferrer: 'VLAD', name: 'Test', phone: '123', email: 'test@example.com' });
    assert.equal(lead.parentConsultant, 'MOHAMED');
    assert.equal(lead.directReferrer, 'MOHAMED_ABDO');
    const email = createLeadEmail(lead, 'test-id', 'test-time');
    assert.match(email.text, /Sub-referrer: MOHAMED_ABDO/);
    assert.match(email.text, /Parent Consultant: MOHAMED/);
  }
  assert.ok(visit('/?ref=MOHAMED_ABDO').elements.length);
  assert.throws(() => validateLead({ referral: 'MOHAMED_ABDO', name: 'Test', phone: '123', email: 'test@example.com' }), /Invalid referral pair/);
  for (const code of ['MOHAMED', 'AHMAD', 'VLAD']) {
    const first = visit(`/?ref=${code}`);
    assert.equal(visit(abdoUrl, first.storage).window.getTurkLuxxReferral(), code);
  }
  for (const [parent, child] of [['AHMAD', 'MOHAMED_ABDO'], ['MOHAMED', 'LAITH'], ['MOHAMED', 'FAOZI'], ['MOHAMED_ABDO', 'MOHAMED'], ['MOHAMED', 'toString']]) {
    assert.ok(visit(`/?ref=${parent}&subref=${child}`).elements.length);
    assert.throws(() => validateLead({ referral: parent, subref: child, name: 'Test', phone: '123', email: 'test@example.com' }), /Invalid referral pair/);
  }
  assert.equal(visit(abdoUrl, new Map(), true).window.getTurkLuxxReferral(), 'DIRECT');
  const team = readFileSync(new URL('../meet-our-team.html', import.meta.url), 'utf8');
  assert.match(team, />Mohamed Salem<\/h2>/);
  assert.doesNotMatch(team, /Muhamed Al Ramah/);
});
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
  runInNewContext(source, { window, document, localStorage, URLSearchParams, Date });
  return { window, elements, storage };
}
for (const path of ['/', '/rengi-istanbul.html', '/rengi-antalya.html', '/meet-our-team.html']) {
  test(`${path}: direct, valid, lowercase and invalid URLs`, () => {
    const direct = visit(path);
    assert.equal(direct.window.getTurkLuxxReferral(), 'DIRECT');
    assert.equal(direct.storage.size, 0);
    assert.equal(direct.elements.length, 0);
    for (const code of ['VLAD', 'ALMA', 'MOHAMED', 'AHMAD', 'ahmad', 'LAITH', 'FAOZI']) {
      const result = visit(`${path}?ref=${code}`);
      assert.equal(result.window.getTurkLuxxReferral(), code.toUpperCase());
      assert.equal(result.elements.length, 0);
      assert.equal(result.window.getTurkLuxxReferralAttribution().landingPage, `https://turkluxx.com${path}?ref=${code}`);
    }
    for (const code of ['SHIT', 'UNKNOWN', 'MUHHAMED', 'muhhamed', '123', '', 'DIRECT']) {
      const result = visit(`${path}?ref=${code}`);
      assert.equal(result.storage.size, 0);
      const screen = result.elements.find(element => element.id === 'turkluxx-referral-error');
      assert.ok(screen);
      assert.match(screen.innerHTML, /Invalid referral link/);
      assert.match(screen.innerHTML, /href="\/"/);
      assert.equal(new URL('/', result.window.location).href, 'https://turkluxx.com/');
    }
  });
}
for (const code of ['VLAD', 'ALMA', 'MOHAMED', 'AHMAD', 'LAITH', 'FAOZI']) {
  test(`${code}: preserves all first-touch data through invalid, valid and clean visits`, () => {
    const { storage } = visit(`/?ref=${code}`);
    const original = [...storage];
    for (const path of ['/?ref=SHIT', '/rengi-istanbul.html?ref=', '/?ref=ALMA', '/']) {
      const result = visit(path, storage);
      assert.equal(result.window.getTurkLuxxReferral(), code);
      assert.deepEqual([...storage], original);
    }
  });
}
test('Blocked storage does not prevent direct visits or invalid screen', () => {
  assert.equal(visit('/', new Map(), true).window.getTurkLuxxReferral(), 'DIRECT');
  assert.equal(visit('/?ref=SHIT', new Map(), true).elements.length, 2);
  assert.equal(visit('/?ref=AHMAD', new Map(), true).elements.length, 0);
});
test('AHMAD client attribution reaches validated lead email', () => {
  const { window } = visit('/?ref=ahmad');
  const lead = validateLead({ referral: window.getTurkLuxxReferral(), name: 'Test', phone: '+90 555', email: 'test@example.com' });
  assert.match(createLeadEmail(lead, 'test-id', 'test-time').text, /Referral: AHMAD/);
});
test('All public landing pages load the shared referral guard', () => {
  for (const page of ['index.html', 'rengi-istanbul.html', 'rengi-antalya.html', 'meet-our-team.html']) {
    assert.match(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), /<script src="js\/referral.js" defer><\/script>/);
  }
});

for (const code of ['LAITH', 'FAOZI']) {
  test(`${code}: direct attribution and permanent parent reach validated lead email`, () => {
    const { window, storage } = visit(`/?ref=${code}&lang=ar`);
    assert.equal(window.getTurkLuxxReferral(), code);
    assert.equal(window.getTurkLuxxReferralAttribution().parentConsultant, 'AHMAD');
    const next = visit('/rengi-istanbul.html?ref=ALMA&lang=en', storage);
    assert.equal(next.window.getTurkLuxxReferral(), code);
    assert.equal(next.window.getTurkLuxxReferralAttribution().parentConsultant, 'AHMAD');
    for (const parentConsultant of [undefined, 'VLAD', 'AHMAD']) {
      const lead = validateLead({ referral: code, parentConsultant, name: 'Test', phone: '+90 555', email: 'test@example.com' });
      assert.equal(lead.referral, code);
      assert.equal(lead.parentConsultant, 'AHMAD');
      const email = createLeadEmail(lead, 'test-id', 'test-time');
      assert.match(email.text, new RegExp(`Referral: ${code}`));
      assert.match(email.text, /Parent Consultant: AHMAD/);
      assert.ok(email.subject.startsWith(`[${code}]`));
    }
    for (const original of ['ALMA', 'MOHAMED', 'VLAD', 'AHMAD']) {
      const first = visit(`/?ref=${original}`);
      const later = visit(`/?ref=${code}&lang=ar`, first.storage);
      assert.equal(later.window.getTurkLuxxReferral(), original);
      assert.equal(later.window.getTurkLuxxReferralAttribution().parentConsultant, undefined);
    }
  });
}

for (const subref of ['LAITH', 'FAOZI']) {
  test(`${subref}: complete pair is atomic, persistent and included in validated leads`, () => {
    const first = visit(`/?ref=ahmad&subref=${subref.toLowerCase()}&lang=ar`);
    const original = JSON.stringify(first.window.getTurkLuxxReferralAttribution());
    assert.equal(first.storage.size, 1, 'Both levels and metadata use one storage record');
    const attribution = first.window.getTurkLuxxReferralAttribution();
    assert.equal(attribution.referral, 'AHMAD');
    assert.equal(attribution.subref, subref);
    assert.equal(attribution.directReferrer, subref);
    assert.equal(attribution.parentConsultant, 'AHMAD');
    for (const path of ['/', '/rengi-istanbul.html', '/?ref=AHMAD', '/?ref=AHMAD&subref=FAOZI', '/?ref=VLAD', '/?ref=VLAD&subref=LAITH', '/?subref=FAOZI']) {
      const later = visit(path, first.storage);
      assert.equal(JSON.stringify(later.window.getTurkLuxxReferralAttribution()), original);
    }
    const lead = validateLead({ ...attribution, directReferrer: 'VLAD', parentConsultant: 'ALMA', name: 'Test', phone: '123', email: 'test@example.com' });
    assert.equal(lead.referral, 'AHMAD');
    assert.equal(lead.subref, subref);
    assert.equal(lead.directReferrer, subref);
    assert.equal(lead.parentConsultant, 'AHMAD');
    const email = createLeadEmail(lead, 'test-id', 'test-time');
    assert.match(email.text, /Referral: AHMAD/);
    assert.match(email.text, new RegExp(`Sub-referrer: ${subref}`));
    assert.match(email.text, /Parent Consultant: AHMAD/);
    for (const code of ['AHMAD', 'ALMA', 'MOHAMED', 'VLAD', 'LAITH', 'FAOZI']) {
      const legacy = visit(`/?ref=${code}`);
      const saved = [...legacy.storage];
      const later = visit(`/?ref=AHMAD&subref=${subref}`, legacy.storage);
      assert.equal(later.window.getTurkLuxxReferral(), code);
      assert.equal(later.window.getTurkLuxxReferralAttribution().subref, undefined);
      assert.deepEqual([...legacy.storage], saved);
    }
  });
}
test('Reject invalid pairs and duplicate parameters without partial attribution', () => {
  for (const query of ['subref=LAITH', 'ref=ALMA&subref=LAITH', 'ref=VLAD&subref=FAOZI', 'ref=AHMAD&subref=UNKNOWN', 'ref=AHMAD&subref=', 'ref=LAITH&subref=FAOZI', 'ref=AHMAD&subref=AHMAD', 'ref=AHMAD&subref=LAITH&subref=FAOZI', 'ref=AHMAD&ref=VLAD&subref=LAITH']) {
    const result = visit('/?' + query);
    assert.equal(result.storage.size, 0);
    assert.ok(result.elements.some(element => element.id === 'turkluxx-referral-error'));
  }
  for (const [referral, subref] of [['AHMAD', 'UNKNOWN'], ['AHMAD', ''], ['AHMAD', null], ['AHMAD', 1], ['AHMAD', 'laith'], ['ALMA', 'LAITH'], ['LAITH', 'FAOZI'], ['DIRECT', 'LAITH']]) {
    assert.throws(() => validateLead({ referral, subref, name: 'Test', phone: '123', email: 'test@example.com' }), /Invalid referral pair/);
  }
  assert.equal(visit('/?ref=AHMAD&subref=LAITH', new Map(), true).window.getTurkLuxxReferral(), 'DIRECT');
});
test('Malformed pair storage does not break legacy attribution', () => {
  const first = visit('/?ref=ALMA');
  first.storage.set('turkluxx_referral_pair', '{broken');
  assert.equal(visit('/', first.storage).window.getTurkLuxxReferral(), 'ALMA');
  first.storage.set('turkluxx_referral_pair', JSON.stringify({referral:'VLAD',subref:'LAITH'}));
  assert.equal(visit('/', first.storage).window.getTurkLuxxReferral(), 'ALMA');
});

test('Saved Muhamed misspelling migrates without losing first-touch metadata', () => {
  for (const path of ['/', '/?ref=MOHAMED', '/?ref=MUHHAMED', '/?ref=ALMA', '/?ref=AHMAD&subref=LAITH']) {
    const storage = new Map([
      ['turkluxx_referral', 'MUHHAMED'],
      ['turkluxx_referral_created_at', '2026-01-01T12:00:00.000Z'],
      ['turkluxx_referral_landing_page', 'https://turkluxx.com/?ref=MUHHAMED&lang=ar']
    ]);
    const result = visit(path, storage);
    assert.equal(storage.get('turkluxx_referral'), 'MOHAMED');
    assert.equal(storage.size, 3);
    const attribution = result.window.getTurkLuxxReferralAttribution();
    assert.equal(attribution.referral, 'MOHAMED');
    assert.equal(attribution.createdAt, '2026-01-01T12:00:00.000Z');
    assert.equal(attribution.landingPage, 'https://turkluxx.com/?ref=MUHHAMED&lang=ar');
    assert.equal(attribution.subref, undefined);
    const next = visit('/?ref=AHMAD&subref=FAOZI', storage);
    assert.equal(next.window.getTurkLuxxReferral(), 'MOHAMED');
    const lead = validateLead({ referral: attribution.referral, name: 'Test', phone: '123', email: 'test@example.com' });
    assert.match(createLeadEmail(lead, 'test-id', 'test-time').text, /Referral: MOHAMED/);
    assert.ok(!createLeadEmail(lead, 'test-id', 'test-time').text.includes('MUHHAMED'));
  }
});
test('Read-only storage keeps migrated attribution usable without overwriting first touch', () => {
  const storage = new Map([['turkluxx_referral', 'MUHHAMED'], ['turkluxx_referral_created_at', 'original-time'], ['turkluxx_referral_landing_page', 'original-page']]);
  const result = visit('/?ref=AHMAD&subref=LAITH', storage, false, true);
  assert.equal(result.window.getTurkLuxxReferral(), 'MOHAMED');
  assert.equal(result.window.getTurkLuxxReferralAttribution().createdAt, 'original-time');
  assert.equal(result.window.getTurkLuxxReferralAttribution().landingPage, 'original-page');
  assert.equal(storage.size, 3);
});
test('Lead endpoint accepts only the canonical Muhamed ID', () => {
  const fields = { name: 'Test', phone: '123', email: 'test@example.com' };
  assert.equal(validateLead({ ...fields, referral: 'MOHAMED' }).referral, 'MOHAMED');
  assert.throws(() => validateLead({ ...fields, referral: 'MUHHAMED' }), /Invalid referral/);
});


test('Legacy Mohamed records normalize without losing first-touch metadata', () => {
  for (const blocked of [false, true]) {
    const storage = new Map([['turkluxx_referral', 'MUHAMED'], ['turkluxx_referral_created_at', 'original-time'], ['turkluxx_referral_landing_page', 'original-page']]);
    const attribution = visit('/?ref=VLAD', storage, false, blocked).window.getTurkLuxxReferralAttribution();
    assert.equal(attribution.referral, 'MOHAMED');
    assert.equal(attribution.createdAt, 'original-time');
    assert.equal(attribution.landingPage, 'original-page');
    const pairStorage = new Map([['turkluxx_referral_pair', JSON.stringify({referral:'MUHAMED',subref:'ABDO',createdAt:'original-time',landingPage:'original-page'})]]);
    const pair = visit('/', pairStorage, false, blocked).window.getTurkLuxxReferralAttribution();
    assert.equal(pair.referral, 'MOHAMED');
    assert.equal(pair.subref, 'MOHAMED_ABDO');
    assert.equal(pair.parentConsultant, 'MOHAMED');
    assert.equal(pair.createdAt, 'original-time');
  }
  assert.equal(visit('/?ref=MUHAMED').window.getTurkLuxxReferral(), 'MOHAMED');
  assert.equal(validateLead({referral:'MUHAMED',name:'Test',phone:'123',email:'test@example.com'}).referral, 'MOHAMED');
  assert.ok(visit('/?ref=ABDO').elements.length);
});
