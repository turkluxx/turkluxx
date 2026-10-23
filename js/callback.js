(() => {
  const dialog = document.querySelector('#turkluxx-callback');
  const triggers = document.querySelectorAll('.turkluxx-callback-trigger');
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[role="status"]');

  // Context exists only in memory for the current form opening. Resolvers read
  // the selected item from each page's existing data model at click time.
  const leadResolvers = new WeakMap();
  const registeredTriggers = new WeakSet(triggers);
  let leadContext = null;
  let pending = false;
  let opening = 0;
  const submitButton = form.querySelector('[type="submit"]');
  window.registerTurkLuxxLeadContext = (trigger, resolveContext) => {
    leadResolvers.set(trigger, resolveContext);
    if (!registeredTriggers.has(trigger)) {
      trigger.addEventListener('click', openCallbackFromTrigger);
      registeredTriggers.add(trigger);
    }
  };
  // Citizenship enquiries use the same contextual lead fields and delivery flow.
  triggers.forEach(trigger => {
    if (trigger.dataset.enquiryInterest) {
      window.registerTurkLuxxLeadContext(trigger, () => ({ property: trigger.dataset.enquiryInterest }));
    }
  });
  const referralFields = () => {
    const { referral, client, subref, directReferrer, parentConsultant, referralPath } = window.getTurkLuxxReferralAttribution();
    return { referral, ...(client ? { client } : {}), ...(subref ? { subref, directReferrer } : {}), ...(parentConsultant ? { parentConsultant } : {}), ...(referralPath ? { referralPath } : {}) };
  };
  window.buildTurkLuxxLeadPayload = sourceForm => {
    const fields = new FormData(sourceForm);
    const value = key => String(fields.get(key) || '').trim();
    const context = sourceForm === form ? leadContext : null;
    return {
      ...referralFields(),
      name: value('name'),
      phone: value('phone'),
      ...smsConsentFields(fields),
      email: value('email'),
      project: context?.project || null,
      property: context?.property || null,
      propertyCode: context?.propertyCode || null,
      page: window.location.href
    };
  };
  dialog.addEventListener('close', () => { leadContext = null; opening += 1; });

  // All dialogs share dismissal, scroll restoration and focus handling.
  function modalController(modal) {
    let trigger;
    let scrollY = 0;
    let bodyStyle;
    let closing = false;
    let startedOutside = false;

    function open(opener) {
      if (modal.open || closing) return;
      trigger = opener;
      scrollY = window.scrollY;
      bodyStyle = document.body.getAttribute('style');
      Object.assign(document.body.style, {
        position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden'
      });
      modal.showModal();
      modal.scrollTop = 0;
      if (modal.id === 'turkluxx-roi' && Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: 'roi_popup_open' });
      }
    }

    function close(afterClose) {
      if (closing || !modal.open) return;
      closing = true;
      modal.classList.add('is-closing');
      window.setTimeout(() => {
        modal.close();
        modal.classList.remove('is-closing');
        if (bodyStyle === null) document.body.removeAttribute('style');
        else document.body.setAttribute('style', bodyStyle);
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        trigger?.focus({ preventScroll: true });
        closing = false;
        if (afterClose) afterClose(trigger);
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
    }

    modal.querySelector('.turkluxx-callback-close').addEventListener('click', () => close());
    modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
    const outside = event => {
      const box = modal.getBoundingClientRect();
      return event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom;
    };
    modal.addEventListener('pointerdown', event => { startedOutside = outside(event); });
    modal.addEventListener('click', event => {
      if (event.target === modal && startedOutside && outside(event)) close();
      startedOutside = false;
    });
    return { open, close };
  }

  const callback = modalController(dialog);
  // One general contact form shares the existing enquiry modal controller.
  const contactDialog = document.createElement('dialog');
  contactDialog.id = 'turkluxx-contact';
  contactDialog.className = 'turkluxx-callback turkluxx-contact';
  contactDialog.setAttribute('aria-labelledby', 'turkluxx-contact-title');
  contactDialog.innerHTML = `
    <button class="turkluxx-callback-close" type="button" aria-label="Close contact form">&times;</button>
    <h2 id="turkluxx-contact-title" data-i18n="contact.title">Contact Us</h2>
    <form>
      <div class="turkluxx-callback-field"><label for="contact-name" data-i18n="contact.name">Name</label><input id="contact-name" name="name" autocomplete="name" maxlength="120" required autofocus></div>
      <div class="turkluxx-callback-field"><label for="contact-email" data-i18n="contact.email">Email</label><input id="contact-email" name="email" type="email" dir="ltr" autocomplete="email" maxlength="254" required></div>
      <div class="turkluxx-callback-field"><label for="contact-message" data-i18n="contact.message">Message</label><textarea id="contact-message" name="message" rows="4" maxlength="2000" required></textarea></div>
      <button class="turkluxx-callback-submit" type="submit" data-i18n="contact.submit">SEND MESSAGE</button>
      <p class="turkluxx-callback-status" role="status" aria-live="polite"></p>
    </form>`;
  document.body.append(contactDialog);
  const contact = modalController(contactDialog);
  const contactForm = contactDialog.querySelector('form');
  // Native optional controls share one markup and payload mapping across both forms.
  const smsConsentFields = fields => ({
    smsInformationalConsent: fields.get('smsInformationalConsent') === 'on',
    smsMarketingConsent: fields.get('smsMarketingConsent') === 'on'
  });
  function addSmsConsent(targetForm) {
    const section = document.createElement('div');
    section.className = 'turkluxx-sms-consent';
    section.innerHTML = `
      <label><input type="checkbox" name="smsInformationalConsent"><span data-i18n="sms.informational">By checking this box, you agree to receive transactional and informational SMS messages from TurkLuxx regarding your inquiry, appointments, and customer care. Message frequency may vary. Message and data rates may apply. Reply HELP for help or STOP to opt out.</span></label>
      <label><input type="checkbox" name="smsMarketingConsent"><span data-i18n="sms.marketing">By checking this box, you agree to receive promotional and marketing SMS messages from TurkLuxx, including property offers, updates, and related services. Message frequency may vary. Message and data rates may apply. Reply HELP for help or STOP to opt out.</span></label>
      <p><a href="privacy-policy.html" data-i18n="common.privacy_policy">Privacy Policy</a> &middot; <a href="terms-and-conditions.html" data-i18n="common.terms_conditions">Terms &amp; Conditions</a></p>`;
    targetForm.querySelector('[type="submit"]').before(section);
    window.TurkLuxxI18n.ready.then(() => {
      section.querySelectorAll('[data-i18n]').forEach(element => window.TurkLuxxI18n.bind(element, element.dataset.i18n));
    });
  }
  addSmsConsent(form);
  addSmsConsent(contactForm);
  const contactStatus = contactDialog.querySelector('[role="status"]');
  const contactSubmit = contactForm.querySelector('[type="submit"]');
  let contactPending = false;
  let contactOpening = 0;
  contactDialog.addEventListener('close', () => { contactOpening += 1; });
  window.TurkLuxxI18n.ready.then(() => {
    contactDialog.querySelectorAll('[data-i18n]').forEach(element => window.TurkLuxxI18n.bind(element, element.dataset.i18n));
    window.TurkLuxxI18n.bind(contactDialog.querySelector('.turkluxx-callback-close'), 'contact.close', {}, 'aria-label');
  });
  document.querySelectorAll('[data-home-scroll="contact"]').forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      contactOpening += 1;
      window.TurkLuxxI18n.bind(contactStatus, contactPending ? 'contact.sending' : '');
      const opener = trigger.getClientRects().length ? trigger : document.querySelector('.turkluxx-mobile-menu-toggle') || trigger;
      contact.open(opener);
    });
  });
  const contactValidators = [...contactForm.querySelectorAll('input:not([type="checkbox"]), textarea')].map(input => {
    const validate = () => {
      const key = !input.value.trim() ? { name: 'requiredName', email: 'requiredEmail', message: 'requiredMessage' }[input.name]
        : input.type === 'email' && (input.validity.typeMismatch || !/^[^\s<>(),;:"\\@]+@[^\s<>(),;:"\\@]+\.[^\s<>(),;:"\\@]+$/u.test(input.value.trim())) ? 'invalidEmail' : null;
      input.setCustomValidity(key ? window.TurkLuxxI18n.t(`contact.${key}`) : '');
    };
    input.addEventListener('input', validate);
    input.addEventListener('invalid', validate);
    return validate;
  });
  window.addEventListener('turkluxx:language-change', () => contactValidators.forEach(validate => validate()));
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (contactPending) return;
    contactValidators.forEach(validate => validate());
    if (!contactForm.reportValidity()) return;
    const fields = new FormData(contactForm);
    const payload = {
      ...referralFields(),
      ...smsConsentFields(fields),
      name: fields.get('name').trim(), email: fields.get('email').trim(),
      message: fields.get('message').trim(), language: window.TurkLuxxI18n.language,
      source: 'general-contact', page: window.location.href
    };
    const submittedOpening = contactOpening;
    contactPending = true;
    contactSubmit.disabled = true;
    contactForm.setAttribute('aria-busy', 'true');
    window.TurkLuxxI18n.bind(contactStatus, 'contact.sending');
    try {
      contactForm.dispatchEvent(new CustomEvent('turkluxx:lead-ready', { detail: payload, bubbles: true }));
      const response = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error('Contact request failed');
      if (contactOpening === submittedOpening && contactDialog.open) {
        contactForm.reset();
        contactValidators.forEach(validate => validate());
        window.TurkLuxxI18n.bind(contactStatus, 'contact.success');
      }
    } catch {
      if (contactOpening === submittedOpening && contactDialog.open) window.TurkLuxxI18n.bind(contactStatus, 'contact.error');
    } finally {
      contactPending = false;
      contactSubmit.disabled = false;
      contactForm.removeAttribute('aria-busy');
    }
  });
  const informationModals = new Map(
    [...document.querySelectorAll('.turkluxx-roi-modal, .turkluxx-info-modal')]
      .map(modal => [modal, modalController(modal)])
  );
  function openCallbackFromTrigger(event) {
    const button = event.currentTarget;
    opening += 1;
    const context = leadResolvers.get(button)?.();
    leadContext = context ? {
      project: context.project || null,
      property: context.property || null,
      propertyCode: context.propertyCode || null
    } : null;
    status.textContent = '';
    // Close the information dialog before opening the existing form. Restore
    // focus to its original trigger when the consultation flow finishes.
    const active = [...informationModals].find(([modal]) => modal.open);
    if (active) active[1].close(opener => callback.open(opener));
    else callback.open(button);
  }
  triggers.forEach(button => button.addEventListener('click', openCallbackFromTrigger));
  // Project pages use the homepage's single ROI markup source and controller.
  let roiLoading;
  async function informationFor(button) {
    const id = button.getAttribute('aria-controls');
    if (id === 'turkluxx-roi' && !document.getElementById(id)) {
      if (!roiLoading) roiLoading = (async () => {
        const response = await fetch('./', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('ROI information unavailable');
        const source = new DOMParser().parseFromString(await response.text(), 'text/html');
        const modal = source.getElementById(id);
        if (!modal) throw new Error('ROI information missing');
        document.body.append(document.importNode(modal, true));
        const sharedModal = document.getElementById(id);
        informationModals.set(sharedModal, modalController(sharedModal));
        await window.TurkLuxxI18n.ready;
        sharedModal.querySelectorAll('[data-i18n]').forEach(element => {
          window.TurkLuxxI18n.bind(element, element.dataset.i18n);
        });
      })().catch(error => { roiLoading = null; throw error; });
      await roiLoading;
    }
    return informationModals.get(document.getElementById(id));
  }
  document.querySelectorAll('.turkluxx-roi-trigger, .turkluxx-info-trigger').forEach(button => {
    button.addEventListener('click', async event => {
      event.preventDefault();
      try {
        const information = await informationFor(button);
        information?.open(button);
      } catch (error) { console.error(error); }
    });
    button.addEventListener('keydown', event => {
      if (event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });
  });

  const validators = [];
  for (const input of form.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])')) {
    const validate = () => {
      const missing = !input.value.trim();
      const invalidEmail = input.type === 'email' && input.validity.typeMismatch;
      const key = missing ? { name: 'callback.requiredName', phone: 'callback.requiredPhone', email: 'callback.requiredEmail' }[input.name]
        : invalidEmail ? 'callback.invalidEmail' : null;
      input.setCustomValidity(key ? window.TurkLuxxI18n.t(key) : '');
    };
    validators.push(validate);
    input.addEventListener('input', () => { validate(); status.textContent = ''; });
    input.addEventListener('change', validate);
    input.addEventListener('invalid', validate);
  }
  window.addEventListener('turkluxx:language-change', () => {
    validators.forEach(validate => validate());
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    validators.forEach(validate => validate());
    if (!form.reportValidity()) return;
    const payload = window.buildTurkLuxxLeadPayload(form);
    const submittedOpening = opening;
    pending = true;
    submitButton.disabled = true;
    form.setAttribute('aria-busy', 'true');
    window.TurkLuxxI18n.bind(status, 'callback.sending');
    try {
      // Preserve the existing local event. This handler alone performs the send.
      form.dispatchEvent(new CustomEvent('turkluxx:lead-ready', { detail: payload, bubbles: true }));
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        console.error('[TurkLuxx lead] Submission failed', { status: response.status });
        throw new Error('Lead request failed');
      }
      if (opening === submittedOpening && dialog.open) {
        window.TurkLuxxI18n.bind(status, 'callback.success');
      }
    } catch (error) {
      console.error('[TurkLuxx lead] Request did not complete', { type: error.name });
      if (opening === submittedOpening && dialog.open) {
        window.TurkLuxxI18n.bind(status, 'callback.error');
      }
    } finally {
      pending = false;
      submitButton.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
