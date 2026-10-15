import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

const generic = { referral: 'DIRECT', name: 'Sarah Williams', phone: '+44 20 1234 5678', email: 'sarah@example.com', project: null, property: null, propertyCode: null, page: 'https://turkluxx.com/' };
test('General contact sends multiline message and language without requiring a phone', async () => {
  for (const language of ['en', 'nl', 'es', 'ru', 'tr', 'ar']) {
    const env = environment();
    const lead = { ...generic, phone: undefined, source: 'general-contact', language, message: 'Interested in your services.\nPlease contact me.', property: 'ignored' };
    assert.equal((await worker.fetch(request(lead), env)).status, 200);
    assert.ok(env.messages[0].subject.endsWith('Contact Us'));
    assert.ok(env.messages[0].text.includes(lead.message));
    assert.ok(env.messages[0].text.includes(`Language: ${language}`));
    assert.ok(env.messages[0].text.includes('Source: general-contact'));
    assert.ok(!env.messages[0].text.includes('Property:'));
  }
});
test('General contact rejects missing message, unsupported language and excessive message length', async () => {
  for (const patch of [{ message: '' }, { message: '  ' }, { message: null }, { message: 42 }, { message: 'x'.repeat(2001) }, { language: 'de' }]) {
    const env = environment();
    assert.equal((await worker.fetch(request({ ...generic, source: 'general-contact', language: 'en', message: 'Hello', ...patch }), env)).status, 400);
    assert.equal(env.messages.length, 0);
  }
});
function request(data = generic, options = {}) {
  return new Request('https://turkluxx.com/api/lead', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://turkluxx.com' },
    body: JSON.stringify(data), ...options
  });
}
function environment() {
  const messages = [];
  return { messages, LEAD_EMAIL: { async send(message) { messages.push(message); } }, ASSETS: { fetch: async () => new Response('asset') } };
}
for (const [label, fields, subject] of [
  ['A/I DIRECT generic and null optionals', {}, 'General Enquiry'],
  ['Citizenship information enquiry', { property: 'Turkish Citizenship Through Real Estate Investment' }, 'Turkish Citizenship Through Real Estate Investment'],
  ['B ALMA Istanbul', { referral: 'ALMA', project: 'Rengi Istanbul', property: 'Zümrüt (Emerald)', propertyCode: 'B3-AG' }, 'Zümrüt (Emerald)'],
  ['C MOHAMED Antalya', { referral: 'MOHAMED', project: 'Rengi Antalya', property: 'GreenLife' }, 'GreenLife'],
  ['D VLAD Istanbul', { referral: 'VLAD', project: 'Rengi Istanbul', property: 'Elmas (Diamond)', propertyCode: 'A1-ÜG' }, 'Elmas (Diamond)'],
  ['AHMAD generic', { referral: 'AHMAD' }, 'General Enquiry']
]) {
  test(label, async () => {
    const env = environment();
    const response = await worker.fetch(request({ ...generic, ...fields, leadId: 'FORGED', submittedAt: 'yesterday', to: 'attacker@example.com' }), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.leadId, /^TL-\d{8}-[A-F0-9]{32}$/);
    assert.equal(new Date(data.submittedAt).toISOString(), data.submittedAt);
    const msg = env.messages[0];
    assert.equal(msg.to, 'turkluxx101@gmail.com');
    assert.deepEqual(msg.from, { name: 'TurkLuxx Leads', email: 'leads@turkluxx.com' });
    assert.equal(msg.replyTo, generic.email);
    assert.equal(msg.subject, `[${fields.referral || 'DIRECT'}] New TurkLuxx Lead — ${subject}`);
    assert.ok(msg.text.includes(data.leadId));
    assert.ok(msg.text.includes(`Referral: ${fields.referral || 'DIRECT'}`));
    assert.ok(!msg.text.includes('null') && !msg.text.includes('FORGED'));
    if (!fields.project) assert.ok(!msg.text.includes('Project:'));
  });
}
test('E/F/G invalid referral, required values and email rejected without sending', async () => {
  for (const patch of [{ referral: 'WALT01' }, { referral: 'alma' }, { referral: null }, { name: '' }, { name: '   ' }, { phone: null }, { email: 'not-an-email' }, { name: 42 }, { email: 'x@example.com\r\nBcc: victim@example.com' }]) {
    const env = environment();
    assert.equal((await worker.fetch(request({ ...generic, ...patch }), env)).status, 400);
    assert.equal(env.messages.length, 0);
  }
});
test('H POST only; JSON only; invalid JSON; invalid field types/lengths/header controls', async () => {
  const env = environment();
  for (const method of ['GET', 'PUT', 'OPTIONS']) {
    const r = await worker.fetch(new Request('https://turkluxx.com/api/lead', { method }), env);
    assert.equal(r.status, 405); assert.equal(r.headers.get('Allow'), 'POST');
  }
  assert.equal((await worker.fetch(request(generic, { headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  assert.equal((await worker.fetch(request(generic, { body: '{' }), env)).status, 400);
  for (const value of [null, [], 'text', { ...generic, property: 'villa\nBcc: x@y.com' }, { ...generic, name: 'x'.repeat(121) }, { ...generic, page: 'javascript:alert(1)' }, { ...generic, propertyCode: {} }]) {
    assert.equal((await worker.fetch(request(value), env)).status, 400);
  }
  assert.equal(env.messages.length, 0);
});
test('Rejects oversized bodies with and without Content-Length, including streamed requests', async () => {
  for (const headers of [{ 'Content-Type': 'application/json' }, { 'Content-Type': 'application/json', 'Content-Length': '9000' }]) {
    const env = environment();
    assert.equal((await worker.fetch(request({ ...generic, name: 'x'.repeat(9000) }, { headers }), env)).status, 413);
    assert.equal(env.messages.length, 0);
  }
});
test('Origin restriction and asset fallback', async () => {
  const env = environment();
  assert.equal((await worker.fetch(request(generic, { headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' } }), env)).status, 403);
  assert.equal(await (await worker.fetch(new Request('https://turkluxx.com/'), env)).text(), 'asset');
  assert.equal((await worker.fetch(new Request('https://turkluxx.com/api/missing'), env)).status, 404);
});
test('Server waits for email binding; failure returns sanitized 502 without success', async () => {
  let finish;
  const env = { LEAD_EMAIL: { send: () => new Promise(resolve => { finish = resolve; }) } };
  let done = false;
  const pending = worker.fetch(request(), env).then(r => { done = true; return r; });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(done, false); finish(); assert.equal((await pending).status, 200);
  const oldError = console.error; console.error = () => {};
  try {
    const response = await worker.fetch(request(), { LEAD_EMAIL: { send: async () => { throw new Error('secret internal failure'); } } });
    assert.equal(response.status, 502);
    const text = await response.text(); assert.ok(!text.includes('secret')); assert.equal(JSON.parse(text).ok, false);
  } finally { console.error = oldError; }
});
test('IDs differ; international names/phones remain allowed; project-only subject', async () => {
  const env = environment(); const ids = new Set();
  for (let i = 0; i < 10; i++) {
    const r = await worker.fetch(request({ ...generic, name: 'İpek O’Connor 李', phone: '+90 (212) 555-0100 ext. 12', project: 'Rengi Istanbul' }), env);
    ids.add((await r.json()).leadId);
  }
  assert.equal(ids.size, 10); assert.ok(env.messages[0].subject.endsWith('Rengi Istanbul'));
});
