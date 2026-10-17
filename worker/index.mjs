import '../js/referral-registry.js';
const registry = globalThis.TurkLuxxReferralRegistry;
const normalizeReferral = globalThis.normalizeTurkLuxxReferral;
const parents = Object.fromEntries(Object.entries(registry)
  .filter(([, record]) => record.parentConsultant).map(([code, record]) => [code, record.parentConsultant]));
const MAX_BYTES = 8192;
const RECIPIENT = 'turkluxx101@gmail.com';

class InputError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers }
});

async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new InputError(415, 'Please submit JSON.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new InputError(413, 'Request too large.');
  if (!request.body) throw new InputError(400, 'Missing request body.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new InputError(413, 'Request too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InputError(400, 'Invalid JSON.'); }
}

export function validateLead(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InputError(400, 'Invalid lead.');
  const field = (key, max, required = false) => {
    const value = data[key];
    if (value == null && !required) return null;
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(value)) {
      throw new InputError(400, `Invalid ${key}.`);
    }
    const trimmed = value.trim();
    if (!trimmed && required) throw new InputError(400, `Missing ${key}.`);
    return trimmed || null;
  };
  // Attribution is an untrusted label: accept only exact allowlisted values.
  const referral = data.referral === 'DIRECT' ? 'DIRECT' : normalizeReferral(data.referral);
  if (!referral || data.referral !== data.referral.trim().toUpperCase()) throw new InputError(400, 'Invalid referral.');
  const hasSubref = Object.hasOwn(data, 'subref');
  if (hasSubref && !(typeof data.subref === 'string' && Object.hasOwn(parents, data.subref) && parents[data.subref] === referral)) {
    throw new InputError(400, 'Invalid referral pair.');
  }
  const hasClient = Object.hasOwn(data, 'client');
  if (hasClient && (hasSubref || typeof data.client !== 'string' ||
      !Object.hasOwn(registry, referral) ||
      ![registry[referral].ar, registry[referral].en].some(ids => Array.isArray(ids) && ids.includes(data.client)))) {
    throw new InputError(400, 'Invalid referral client.');
  }
  const generalContact = data.source === 'general-contact';
  const lead = {
    referral,
    ...(hasClient ? { client: data.client } : {}),
    ...(hasSubref ? { subref: data.subref, directReferrer: data.subref, parentConsultant: referral } : {}),
    ...(Object.hasOwn(parents, referral) ? { parentConsultant: parents[referral] } : {}),
    name: field('name', 120, true), phone: field('phone', 80, !generalContact), email: field('email', 254, true),
    project: field('project', 120), property: field('property', 180), propertyCode: field('propertyCode', 80),
    page: field('page', 2048)
  };
  if (generalContact) {
    if (!['en', 'nl', 'es', 'ru', 'tr', 'ar'].includes(data.language)) throw new InputError(400, 'Invalid language.');
    if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(data.message)) {
      throw new InputError(400, 'Invalid message.');
    }
    Object.assign(lead, { source: 'general-contact', language: data.language, message: data.message.trim(), project: null, property: null, propertyCode: null });
  }
  if (!/^[^\s<>(),;:"\\@]+@[^\s<>(),;:"\\@]+\.[^\s<>(),;:"\\@]+$/u.test(lead.email)) {
    throw new InputError(400, 'Invalid email.');
  }
  if (lead.page) {
    let url;
    try {
      url = new URL(lead.page);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { throw new InputError(400, 'Invalid page.'); }
    const params = url.searchParams;
    const incoming = normalizeReferral(params.get('ref'));
    if (params.has('ref') && (params.getAll('ref').length !== 1 || !incoming)) {
      throw new InputError(400, 'Invalid referral.');
    }
    const subref = normalizeReferral(params.get('subref'));
    if (params.has('subref') && (params.getAll('subref').length !== 1 || !subref || parents[subref] !== incoming)) {
      throw new InputError(400, 'Invalid referral pair.');
    }
  }
  // Client-supplied leadId/submittedAt/from/to and other unknown keys are ignored.
  return lead;
}

export function createLeadEmail(lead, leadId, submittedAt) {
  const context = lead.source === 'general-contact' ? 'Contact Us' : lead.property || lead.project || 'General Enquiry';
  const lines = [
    'NEW TURKLUXX LEAD', '', `Lead ID: ${leadId}`, `Referral: ${lead.referral}`, ...(lead.client ? [`Participant: ${lead.client}`] : []), ...(lead.subref ? [`Sub-referrer: ${lead.subref}`, `Direct Referrer: ${lead.directReferrer}`] : []), ...(lead.parentConsultant ? [`Parent Consultant: ${lead.parentConsultant}`] : []), '',
    `Name: ${lead.name}`, ...(lead.phone ? [`Phone: ${lead.phone}`] : []), `Email: ${lead.email}`, ''
  ];
  for (const [key, label] of [['project', 'Project'], ['property', 'Property'], ['propertyCode', 'Property Code'], ['page', 'Page']]) {
    if (lead[key]) lines.push(`${label}: ${lead[key]}`);
  }
  lines.push(`Submitted: ${submittedAt}`);
  if (lead.source === 'general-contact') lines.push(`Source: ${lead.source}`, `Language: ${lead.language}`, '', 'Message:', lead.message);
  return {
    to: RECIPIENT,
    from: { name: 'TurkLuxx Leads', email: 'leads@turkluxx.com' },
    replyTo: lead.email,
    subject: `[${lead.referral}] New TurkLuxx Lead — ${context}`,
    text: lines.join('\n')
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/lead') {
      if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'Not found.' }, 404);
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return json({ ok: false, error: 'Request origin not allowed.' }, 403);
    }
    let lead;
    try { lead = validateLead(await readJson(request)); }
    catch (error) {
      return json({ ok: false, error: error instanceof InputError ? error.message : 'Invalid request.' }, error instanceof InputError ? error.status : 400);
    }
    const submittedAt = new Date().toISOString();
    const leadId = `TL-${submittedAt.slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
    try {
      await env.LEAD_EMAIL.send(createLeadEmail(lead, leadId, submittedAt));
      return json({ ok: true, leadId, submittedAt });
    } catch {
      // Correlation only: do not log contact data, email contents or binding errors.
      console.error('[TurkLuxx lead] Email binding failed', { leadId });
      return json({ ok: false, error: 'Unable to send your enquiry. Please try again.' }, 502);
    }
  }
};
