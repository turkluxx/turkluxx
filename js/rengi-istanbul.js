(() => {
    'use strict';
    const roi = document.querySelector('.rengi-roi');
    if (roi) {
        const media = roi.querySelector('.rengi-roi-media');
        const image = media.querySelector('img');
        const actions = roi.querySelector('.rengi-roi-actions');
        const alignImage = () => {
            if (!image.naturalWidth) return;
            if (!window.matchMedia('(min-width: 768px)').matches) {
                media.style.removeProperty('--roi-original-height');
                media.style.removeProperty('--roi-image-height');
                return;
            }
            // Retain the natural image's footprint so its centered top never moves.
            const width = Math.min(media.clientWidth, 840);
            media.style.setProperty('--roi-original-height', `${width * image.naturalHeight / image.naturalWidth}px`);
            const height = actions.getBoundingClientRect().bottom - media.getBoundingClientRect().top;
            if (height > 0) media.style.setProperty('--roi-image-height', `${height}px`);
        };
        const observer = new ResizeObserver(alignImage);
        observer.observe(roi.querySelector('.rengi-roi-copy'));
        observer.observe(roi);
        image.addEventListener('load', alignImage);
        window.addEventListener('resize', alignImage);
        document.fonts.ready.then(alignImage);
        alignImage();
    }
    // Existing Master Plan viewer; villa selection is handled by rengi-villa-explorer.js.
    const masterPlan = { units: [], src: 'assets/rengi/master-plan.jpg' };
    const dialog = document.querySelector('#rengi-plan-lightbox');
    if (!dialog) return;
    const lightboxImage = dialog.querySelector('#rengi-lightbox-image');
    const scroll = dialog.querySelector('.rengi-lightbox-scroll');
    let zoom = 100;
    let baseWidth = 0;
    let previousOverflow = '';
    function setZoom(value) {
        zoom = Math.max(100, Math.min(300, value));
        lightboxImage.style.width = `${baseWidth * zoom / 100}px`;
        dialog.querySelector('#rengi-plan-zoom').textContent = `${zoom}%`;
        dialog.querySelector('#rengi-plan-zoom-out').disabled = zoom === 100;
        dialog.querySelector('#rengi-plan-zoom-in').disabled = zoom === 300;
    }
    function fitImage() {
        baseWidth = Math.min(scroll.clientWidth - 32, (scroll.clientHeight - 32) * lightboxImage.naturalWidth / lightboxImage.naturalHeight);
        setZoom(100);
    }
    function openPlan(src, alt, title) {
        lightboxImage.onload = fitImage;
        lightboxImage.src = src;
        lightboxImage.alt = alt;
        dialog.querySelector('#rengi-lightbox-title').textContent = title;
        previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        scroll.scrollTo(0, 0);
        if (lightboxImage.complete && lightboxImage.naturalWidth) fitImage();
    }
    function openMaster() {
        openPlan(masterPlan.src, document.querySelector('#rengi-master-image').alt, window.TurkLuxxI18n.t('istanbul.master_plan_186'));
        window.TurkLuxxI18n.bind(dialog.querySelector('#rengi-lightbox-title'), 'istanbul.master_plan_186');
        window.TurkLuxxI18n.bind(lightboxImage, 'istanbul.rengi_istanbul_overall_site_plan_from_the', {}, 'alt');
    }
    document.querySelector('.rengi-master-preview').addEventListener('click', openMaster);
    dialog.querySelector('#rengi-plan-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { document.body.style.overflow = previousOverflow; });
    dialog.querySelector('#rengi-plan-zoom-in').addEventListener('click', () => setZoom(zoom + 25));
    dialog.querySelector('#rengi-plan-zoom-out').addEventListener('click', () => setZoom(zoom - 25));
    window.addEventListener('resize', () => { if (dialog.open) fitImage(); });
})();
