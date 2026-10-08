import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateLead, createLeadEmail } from '../worker/index.mjs';

const source = readFileSync(new URL('../js/referral.js', import.meta.url), 'utf8');
function visit(path = '/', storage = new Map(), blocked = false) {
  const elements = [];
  const window = { location: new URL(path, 'https://turkluxx.com') };
  const document = {
    head: { append: element => elements.push(element) },
    body: { classList: { add() {} }, append: element => elements.push(element) },
    createElement: tag => ({ tag, setAttribute() {}, querySelector: () => ({ focus() {} }) })
  };
  const localStorage = {
    getItem: key => { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw Error('blocked'); storage.set(key, value); }
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
    for (const code of ['VLAD', 'ALMA', 'MUHAMED', 'AHMAD', 'ahmad', 'LAITH', 'FAOZI']) {
      const result = visit(`${path}?ref=${code}`);
      assert.equal(result.window.getTurkLuxxReferral(), code.toUpperCase());
      assert.equal(result.elements.length, 0);
      assert.equal(result.window.getTurkLuxxReferralAttribution().landingPage, `https://turkluxx.com${path}?ref=${code}`);
    }
    for (const code of ['SHIT', 'UNKNOWN', 'MUHHAMED', '123', '', 'DIRECT']) {
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
for (const code of ['VLAD', 'ALMA', 'MUHAMED', 'AHMAD', 'LAITH', 'FAOZI']) {
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
    for (const original of ['ALMA', 'MUHAMED', 'VLAD', 'AHMAD']) {
      const first = visit(`/?ref=${original}`);
      const later = visit(`/?ref=${code}&lang=ar`, first.storage);
      assert.equal(later.window.getTurkLuxxReferral(), original);
      assert.equal(later.window.getTurkLuxxReferralAttribution().parentConsultant, undefined);
    }
  });
}
