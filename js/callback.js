(() => {
  const dialog = document.querySelector('#turkluxx-callback');
  const triggers = document.querySelectorAll('.turkluxx-callback-trigger');
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[role="status"]');

  // Context exists only in memory for the current form opening. Resolvers read
  // the selected item from each page's existing data model at click time.
  const leadResolvers = new WeakMap();
  let leadContext = null;
  let pending = false;
  let opening = 0;
  const submitButton = form.querySelector('[type="submit"]');
  window.registerTurkLuxxLeadContext = (trigger, resolveContext) => {
    leadResolvers.set(trigger, resolveContext);
  };
  // Citizenship enquiries use the same contextual lead fields and delivery flow.
  triggers.forEach(trigger => {
    if (trigger.dataset.enquiryInterest) {
      window.registerTurkLuxxLeadContext(trigger, () => ({ property: trigger.dataset.enquiryInterest }));
    }
  });
  window.buildTurkLuxxLeadPayload = sourceForm => {
    const fields = new FormData(sourceForm);
    const value = key => String(fields.get(key) || '').trim();
    const context = sourceForm === form ? leadContext : null;
    return {
      referral: window.getTurkLuxxReferral(),
      name: value('name'),
      phone: value('phone'),
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
  const informationModals = new Map(
    [...document.querySelectorAll('.turkluxx-roi-modal, .turkluxx-info-modal')]
      .map(modal => [modal, modalController(modal)])
  );
  triggers.forEach(button => button.addEventListener('click', () => {
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
  }));
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
  for (const input of form.querySelectorAll('input:not([type="hidden"])')) {
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
