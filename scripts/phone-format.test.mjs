import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone, normalizePhone } from './phone-format.mjs';
import worker, { validateLead } from '../worker/index.mjs';

const examples = [
  ['+19495551234', '+1 949 555 1234'],
  ['+31612345678', '+31 6 1234 5678'],
  ['+447911123456', '+44 7911 123456'],
  ['+905321234567', '+90 532 123 45 67']
];
test('International formatting and normalization support US, Dutch, UK and Turkish numbers', () => {
  for (const [number, display] of examples) {
    assert.equal(formatPhone(number), display);
    assert.equal(normalizePhone(display), number);
    const pasted = display.replaceAll(' ', '-').replace(/-(\d+)-/, ' ($1) ');
    assert.equal(normalizePhone(pasted), number);
    // Incomplete input keeps every digit, including its explicit calling prefix.
    for (let i = 1; i <= number.length; i++) {
      assert.equal(formatPhone(number.slice(0, i)).replace(/\D/g, ''), number.slice(0, i).replace(/\D/g, ''));
    }
  }
});
test('Ambiguous numbers, invalid numbers and extensions are preserved without guessing', () => {
  for (const entered of ['0612345678', '07911 123456', '+999 123-456', '+1 123', '+44 20 1234 5678 ext. 12', 'Call +1 949 555 1234']) {
    assert.equal(normalizePhone(entered), entered);
  }
});
test('Existing inquiry emails use E.164 when valid, retain fallback input, omit Country and preserve consent', async () => {
  for (const source of ['callback', 'general-contact']) {
    for (const smsConsent of [false, true]) {
      for (const phone of [...examples.map(([, display]) => display), '0612345678', '+90 (212) 555-0100 ext. 12']) {
        const data = { referral: 'DIRECT', name: 'Phone Test', email: 'phone@example.com', phone,
          smsConsent, country: 'obsolete value',
          ...(source === 'general-contact' ? { source, message: 'International inquiry', language: 'ar' } : {}) };
        assert.equal(Object.hasOwn(validateLead(data), 'country'), false);
        let email;
        const response = await worker.fetch(new Request('https://turkluxx.com/api/lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        }), { LEAD_EMAIL: { send: async value => { email = value; } } });
        assert.equal(response.status, 200);
        assert.ok(email.text.includes(`Phone: ${normalizePhone(phone)}`));
        assert.ok(!email.text.includes('Country:'));
        assert.ok(email.text.includes(`Transactional / Informational + Promotional / Marketing SMS: ${smsConsent ? 'YES' : 'NO'}`));
        assert.equal(email.to, 'turkluxx101@gmail.com');
      }
    }
  }
});
