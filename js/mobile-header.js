(() => {
    'use strict';
    const header = document.querySelector('.turkluxx-sales-header');
    if (!header) return;
    const mobile = matchMedia('(max-width: 767px)');
    const source = header.querySelector('.turkluxx-home-desktop-nav') || header.querySelector('.turkluxx-sales-nav');
    const controls = document.createElement('div');
    controls.className = 'turkluxx-mobile-menu-control';
    const wrapper = document.createElement('div');
    wrapper.className = 'turkluxx-mobile-menu-wrapper';
    const surface = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    surface.classList.add('turkluxx-mobile-menu-surface');
    surface.setAttribute('aria-hidden', 'true');
    surface.setAttribute('focusable', 'false');
    const outline = document.createElementNS(surface.namespaceURI, 'path');
    surface.append(outline);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'turkluxx-mobile-menu-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'turkluxx-mobile-menu');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    const menu = document.createElement('nav');
    menu.id = 'turkluxx-mobile-menu';
    menu.className = 'turkluxx-mobile-menu';
    menu.setAttribute('aria-label', 'Main navigation');
    menu.hidden = true;
    const primary = document.createElement('nav');
    primary.className = 'turkluxx-mobile-primary-nav';
    primary.setAttribute('aria-label', 'Main navigation');
    const actions = new WeakMap();

    function link(original, href, key) {
        const item = original ? original.cloneNode(true) : document.createElement('a');
        if (href) item.setAttribute('href', href);
        item.removeAttribute('data-i18n-mobile');
        if (key) {
            item.dataset.i18n = key;
            item.textContent = '';
        }
        if (item.getAttribute('aria-disabled') === 'true') {
            item.addEventListener('click', event => event.preventDefault());
        } else if (original) {
            const action = actions.get(original) || original;
            actions.set(item, action);
            // cloneNode does not copy listeners. Activate the original action,
            // so this remains correct even when handlers were bound earlier.
            item.addEventListener('click', event => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
                // Finish pointer focus/layout changes before starting the
                // original scroll animation or opening its existing modal.
                requestAnimationFrame(() => action.click());
            });
        }
        return item;
    }
    const roi = link(source.querySelector('.turkluxx-roi-trigger'), null, 'mobile.nav.primary_roi');
    const propertySource = source.querySelector('[data-home-scroll="properties"], [href="./#turkluxx-project-heading"]');
    const explorer = document.querySelector('#rengi-explorer, #antalya-explorer');
    const properties = link(propertySource, propertySource ? null : explorer ? '#' + explorer.id : './#turkluxx-project-heading', 'mobile.nav.primary_properties');
    properties.dataset.homeScroll = 'properties';
    primary.append(roi, properties);
    // The four dropdown actions intentionally duplicate the two quick links.
    menu.append(
        link(source.querySelector('[href="meet-our-team.html"]'), 'meet-our-team.html', 'mobile.nav.team'),
        link(roi, null, 'mobile.nav.primary_roi'),
        link(properties, null, 'mobile.nav.primary_properties'),
        link(source.querySelector('[data-home-scroll="contact"]'), null, 'mobile.nav.contact')
    );
    wrapper.append(surface, toggle, menu);
    controls.append(wrapper);
    header.append(controls, primary);
    // A real two-row header keeps its own compact gap without changing hero gaps.
    const ctas = header.querySelector('.turkluxx-mobile-primary-ctas');
    const ctasNext = ctas?.nextSibling;
    function positionHeaderActions() {
        if (!ctas) return;
        if (mobile.matches) header.after(ctas);
        else header.insertBefore(ctas, ctasNext);
    }
    positionHeaderActions();
    function label() {
        const i18n = window.TurkLuxxI18n;
        if (i18n) i18n.bind(toggle, menu.hidden ? 'mobile.nav.open' : 'mobile.nav.close', {}, 'aria-label');
    }
    function close(restoreFocus = false) {
        menu.hidden = true;
        controls.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        label();
        if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        controls.classList.toggle('is-open', !menu.hidden);
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) drawSurface();
        label();
    });
    function drawSurface() {
        if (menu.hidden) return;
        const width = menu.getBoundingClientRect().width;
        const height = 48 + menu.getBoundingClientRect().height;
        const shoulder = width - 48;
        surface.setAttribute('viewBox', `0 0 ${width} ${height}`);
        surface.style.width = `${width}px`;
        surface.style.height = `${height}px`;
        outline.setAttribute('d', `M${shoulder + 12} .5 H${width - 12} Q${width - .5} .5 ${width - .5} 12 V${height - 12} Q${width - .5} ${height - .5} ${width - 12} ${height - .5} H12 Q.5 ${height - .5} .5 ${height - 12} V60 Q.5 48 12 48 H${shoulder - 8} Q${shoulder} 48 ${shoulder} 40 V12 Q${shoulder} .5 ${shoulder + 12} .5 Z`);
        surface.style.clipPath = `path("${outline.getAttribute('d')}")`;
    }
    new ResizeObserver(drawSurface).observe(menu);
    menu.addEventListener('click', event => { if (event.target.closest('a')) close(true); });
    document.addEventListener('click', event => { if (!menu.hidden && !controls.contains(event.target)) close(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close(true); }
    });
    controls.addEventListener('focusout', event => {
        // A phone pointer can blur the toggle to BODY before the link's click.
        // Only dismiss for a real focus transfer outside; outside clicks and
        // Escape already have their own dismissal handlers.
        if (event.relatedTarget && !controls.contains(event.relatedTarget)) close();
    });
    mobile.addEventListener('change', () => { close(); positionHeaderActions(); });
    window.addEventListener('turkluxx:language-change', () => close());
    window.TurkLuxxI18n?.ready.then(label);
})();
