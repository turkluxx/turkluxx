(() => {
    'use strict';
    const viewer = document.querySelector('.rengi-explorer');
    if (!viewer) return;
    const categories = Object.keys(villaData);
    const tablist = viewer.querySelector('.rengi-type-tabs');
    const panel = viewer.querySelector('#rengi-villa-selection');
    const options = viewer.querySelector('.rengi-variant-options');
    const gallery = viewer.querySelector('.rengi-villa-grid');
    const dialog = viewer.querySelector('.rengi-villa-lightbox');
    const fullImage = dialog.querySelector('img');
    let origin;
    let previousOverflow;
    let suppressClick = false;
    const status = viewer.querySelector('#rengi-viewer-status');
    let category = categories[0];
    let variant = Object.keys(villaData[category])[0];
    let slideIndex = 0;
    let lightboxMode = 'photos';
    const floorList = viewer.querySelector('.rengi-floor-list');
    const villaCtas = [...viewer.querySelectorAll('.rengi-villa-contact')];
    const mapImage = viewer.querySelector('.rengi-villa-map');
    const mapPreview = viewer.querySelector('.rengi-villa-map-preview');
    const villaContext = document.querySelector('#callback-villa');
    const callback = document.querySelector('#turkluxx-callback');
    const callbackTitle = callback.querySelector('#turkluxx-callback-title');
    // Keep the English source name; i18n resolves product names for every display.
    const displayName = villa => villa.name;
    const bind = (...args) => window.TurkLuxxI18n.bind(...args);
    const translated = source => window.TurkLuxxI18n.text(source);

    villaCtas.forEach(cta => window.registerTurkLuxxLeadContext(cta, () => {
        const villa = villaData[category][variant];
        return {
            project: 'Rengi Istanbul',
            property: translated(displayName(villa)),
            propertyCode: villa.floors?.[0]?.code || null
        };
    }));

    function resetCallbackTitle() {
        bind(callbackTitle, 'common.let_s_talk');
        callbackTitle.style.removeProperty('font-size');
        callbackTitle.style.removeProperty('line-height');
        callbackTitle.style.removeProperty('white-space');
    }

    function fitCallbackTitle() {
        resetCallbackTitle();
        if (!callback.open || !villaContext.value) return;
        if (window.TurkLuxxI18n?.language !== 'en') {
            bind(callbackTitle, 'callback.villaTitle', { name: villaContext.value });
            return;
        }
        const style = getComputedStyle(callbackTitle);
        const originalSize = parseFloat(style.fontSize);
        // Keep the original heading's line box, so the form and dialog never grow.
        const originalHeight = parseFloat(style.height);
        callbackTitle.style.lineHeight = `${originalHeight}px`;
        callbackTitle.style.whiteSpace = 'nowrap';
        bind(callbackTitle, 'callback.villaTitle', () => ({ name: villaContext.value }));
        let size = originalSize;
        while (callbackTitle.scrollWidth > callbackTitle.clientWidth && size > 1) {
            size -= 0.5;
            callbackTitle.style.fontSize = `${size}px`;
        }
    }

    document.querySelectorAll('.turkluxx-callback-trigger').forEach(button => {
        button.addEventListener('click', () => {
            villaContext.value = villaCtas.includes(button) ? villaData[category][variant].name : '';
            fitCallbackTitle();
        });
    });
    callback.addEventListener('close', () => {
        villaContext.value = '';
        resetCallbackTitle();
    });
    window.addEventListener('turkluxx:language-change', () => { if (callback.open) fitCallbackTitle(); });
    window.addEventListener('resize', () => {
        if (callback.open) fitCallbackTitle();
    });

    function renderFloors(villa) {
        floorList.replaceChildren(...(villa.floors || []).map((floor, index) => {
            const row = element('article', undefined, 'rengi-villa-plan-layout');
            const preview = element('button', undefined, 'rengi-villa-plan-preview');
            preview.type = 'button';
            preview.setAttribute('aria-haspopup', 'dialog');
            const image = element('img');
            image.src = floor.image;
            image.loading = 'lazy';
            const planValues = () => ({ name: villa.name, floor: translated(floor.name || floor.code) });
            bind(image, 'media.plan', planValues, 'alt');
            bind(preview, 'media.planFullscreen', planValues, 'aria-label');
            preview.append(image);
            preview.addEventListener('click', () => openLightbox(index, preview, 'plans'));
            const card = element('div', undefined, 'rengi-floor-card');
            const header = element('header');
            const heading = element('h4', floor.code);
            if (floor.name) heading.append(element('span', floor.name));
            const total = element('p');
            const totalLabel = element('span');
            bind(totalLabel, 'common.total');
            total.append(totalLabel, element('strong', floor.total));
            header.append(heading, total);
            const rooms = element('dl');
            rooms.append(...floor.rooms.map(room => detailRow(room.name, room.area)));
            card.append(header, rooms);
            const details = element('div', undefined, 'rengi-floor-details');
            const cta = viewer.querySelector('#rengi-floor-contact-template').content.firstElementChild.cloneNode(true);
            bind(cta.querySelector('span'), 'villa.cta', { name: villa.name });
            window.registerTurkLuxxLeadContext(cta, () => ({
                project: 'Rengi Istanbul',
                property: translated(displayName(villa)),
                propertyCode: floor.code || null
            }));
            cta.addEventListener('click', () => {
                villaContext.value = villa.name;
                fitCallbackTitle();
            });
            details.append(card, cta);
            row.append(preview, details);
            return row;
        }));
    }

    mapPreview.addEventListener('click', () => openLightbox(0, mapPreview, 'location'));
    let gesture;

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function detailRow(label, value) {
        const row = element('div');
        row.append(element('dt', label), element('dd', value));
        return row;
    }

    function showSlide(next) {
        const villa = villaData[category][variant];
        const images = lightboxMode === 'location' ? [villa.map]
            : lightboxMode === 'plans' ? villa.floors.map(floor => floor.image) : villa.photos;
        if (!images.length) return;
        slideIndex = (next + images.length) % images.length;
        fullImage.src = images[slideIndex];
        bind(fullImage, lightboxMode === 'location' ? 'media.map' : lightboxMode === 'plans' ? 'media.plan' : 'media.villaView', () => ({
            name: lightboxMode === 'location' ? displayName(villa) : villa.name,
            floor: translated(villa.floors?.[slideIndex]?.name || villa.floors?.[slideIndex]?.code || ''), number: slideIndex + 1
        }), 'alt');
        dialog.querySelector('.rengi-villa-counter').textContent = `${slideIndex + 1} / ${images.length}`;
        dialog.querySelectorAll('.rengi-villa-previous, .rengi-villa-next').forEach(button => {
            button.hidden = images.length < 2;
        });
    }

    function openLightbox(index, thumbnail, media = 'photos') {
        origin = thumbnail;
        lightboxMode = media;
        showSlide(index);
        bind(dialog, 'media.viewer', { name: villaData[category][variant].name }, 'aria-label');
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
    }

    function renderVilla(announce = true) {
        if (dialog.open) dialog.close();
        gesture = null;
        slideIndex = 0;
        const villa = villaData[category][variant];
        const specs = villa.quickSpecs || {};
        const grossSpec = viewer.querySelector('[data-villa-spec="gross"]');
        const netSpec = viewer.querySelector('[data-villa-spec="net"]');
        const landSpec = viewer.querySelector('[data-villa-spec="land"]');

        if (grossSpec) grossSpec.textContent = specs.grossArea || '—';
        if (netSpec) netSpec.textContent = specs.netArea || '—';
        if (landSpec) landSpec.textContent = specs.landShare || '—';

        options.querySelectorAll('input').forEach(input => { input.checked = input.value === variant; });
        bind(gallery, 'media.images', { name: villa.name }, 'aria-label');
        gallery.replaceChildren(...villa.photos.map((src, i) => {
            const button = element('button', undefined, 'rengi-villa-thumbnail');
            button.type = 'button';
            bind(button, 'media.imageFullscreen', { name: villa.name, number: i + 1, count: villa.photos.length }, 'aria-label');
            button.setAttribute('aria-haspopup', 'dialog');
            const image = element('img');
            image.src = src;
            bind(image, 'media.villaView', { name: villa.name, number: i + 1 }, 'alt');
            image.loading = 'lazy';
            image.decoding = 'async';
            button.append(image);
            button.addEventListener('click', () => openLightbox(i, button));
            return button;
        }));
        viewer.querySelector('.rengi-villa-philosophy').hidden = !villa.descriptionKeys.length;
        viewer.querySelector('#rengi-philosophy-title').textContent = displayName(villa);
        villaCtas.forEach(cta => bind(cta.querySelector('span'), 'villa.cta', { name: villa.name }));
        mapImage.src = villa.map;
        bind(mapImage, 'media.map', { name: displayName(villa) }, 'alt');
        bind(mapPreview, 'media.mapFullscreen', { name: displayName(villa) }, 'aria-label');
        viewer.querySelector('.rengi-philosophy-body').replaceChildren(
            ...villa.descriptionKeys.map((key, index) => {
                const p = element('p');
                p.dataset.i18n = key;

                if (index === 0) {
                    p.classList.add('rengi-philosophy-lead');
                }

                return p;
            })
        );
        renderFloors(villa);
        if (announce) bind(status, 'villa.selected', { category: villa.category.replace('+', ' + '), name: villa.name, count: villa.photos.length });
    }

    function selectCategory(next, announce = true) {
        category = next;
        variant = Object.keys(villaData[category])[0];
        [...tablist.children].forEach(tab => {
            const active = tab.dataset.category === category;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active) panel.setAttribute('aria-labelledby', tab.id);
        });
        const displayOrder = {
            '4+1': ['jade', 'crystal', 'coral'],
            '5+1': ['silver', 'pearl', 'emerald', 'sapphire', 'motherOfPearl', 'ruby'],
            '6+1': ['gold', 'diamond']
        };
        options.replaceChildren(...displayOrder[category].map(key => {
            const villa = villaData[category][key];
            const label = document.createElement('label');
            label.className = 'rengi-variant-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'rengi-villa-variant';
            input.value = key;
            input.addEventListener('change', () => { if (input.checked) { variant = key; renderVilla(); } });
            label.append(input, document.createTextNode(displayName(villa)));
            return label;
        }));
        renderVilla(announce);
    }

    categories.forEach((key, i) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.id = `rengi-category-${i}`;
        tab.dataset.category = key;
        const layoutLabel = element('bdi', key.replace('+', ' + '));
        layoutLabel.dir = 'ltr';
        layoutLabel.setAttribute('data-i18n-ignore', '');
        tab.append(layoutLabel);
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panel.id);
        tab.addEventListener('click', () => selectCategory(key));
        tab.addEventListener('keydown', event => {
            const next = { ArrowRight: (i + 1) % categories.length, ArrowLeft: (i + categories.length - 1) % categories.length,
                Home: 0, End: categories.length - 1 }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            tablist.children[next].focus({ preventScroll: true });
            selectCategory(categories[next]);
        });
        tablist.append(tab);
    });

    function updateLayoutLabels() {
        const arabic = window.TurkLuxxI18n.language === 'ar';
        for (const tab of tablist.children) {
            const numbers = tab.dataset.category.split('+');
            tab.querySelector('bdi').textContent = (arabic ? numbers.reverse() : numbers).join(' + ');
        }
    }
    window.addEventListener('turkluxx:language-change', updateLayoutLabels);
    updateLayoutLabels();

    // Horizontal gestures navigate only the open viewer; vertical gestures never change images.
    dialog.addEventListener('pointerdown', event => {
        gesture = event.isPrimary && event.pointerType !== 'mouse' && !event.target.closest('button')
            ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    });
    dialog.addEventListener('pointermove', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - gesture.x);
        const dy = Math.abs(event.clientY - gesture.y);
        if (dy > 10 && dy >= dx) gesture = null;
    });
    dialog.addEventListener('pointerup', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        gesture = null;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            suppressClick = true;
            showSlide(slideIndex + (dx < 0 ? 1 : -1));
            setTimeout(() => { suppressClick = false; }, 0);
        }
    });
    dialog.addEventListener('pointercancel', () => { gesture = null; });
    dialog.querySelector('.rengi-villa-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('.rengi-villa-previous').addEventListener('click', () => showSlide(slideIndex - 1));
    dialog.querySelector('.rengi-villa-next').addEventListener('click', () => showSlide(slideIndex + 1));
    dialog.addEventListener('click', event => {
        if (event.target === dialog && !suppressClick) dialog.close();
    });
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        showSlide(slideIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    dialog.addEventListener('close', () => {
        document.body.style.overflow = previousOverflow;
        gesture = null;
        const target = origin?.isConnected && origin.getClientRects().length ? origin : options.querySelector('input:checked');
        target?.focus({ preventScroll: true });
    });
    selectCategory(category, false);
})();
