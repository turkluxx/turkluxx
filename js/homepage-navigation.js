(() => {
    'use strict';
    const isHomepage = document.body.classList.contains('turkluxx-homepage');
    if (!isHomepage && !document.body.classList.contains('rengi-page')) return;

    const desktop = window.matchMedia('(min-width: 1200px)');
    const mobile = window.matchMedia('(max-width: 767px)');
    const social = document.querySelector('.turkluxx-social');
    const socialParent = social.parentNode;
    const socialNext = social.nextSibling;
    const legal = document.querySelector('.turkluxx-footer-legal');

    function positionSocial() {
        if (!isHomepage) return;
        if (mobile.matches || desktop.matches) legal.before(social);
        else socialParent.insertBefore(social, socialNext);
    }
    positionSocial();
    mobile.addEventListener('change', positionSocial);
    desktop.addEventListener('change', positionSocial);
    const header = document.querySelector('.turkluxx-sales-header');
    const hero = document.querySelector('.turkluxx-sales-hero');
    const backToTop = document.querySelector('.turkluxx-back-to-top');
    const duration = 900;
    let frame = 0;

    // This homepage animation intentionally runs for 900ms under reduced motion too.
    // Desktop and mobile navigation share this animation; tablet interactions stay unchanged.
    const easeInOutCubic = progress => progress < .5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    function headerOffset() {
        const style = getComputedStyle(header);
        if (style.position !== 'fixed' && style.position !== 'sticky') return 0;
        return header.getBoundingClientRect().height + (parseFloat(style.top) || 0);
    }
    const pageTop = element => element.getBoundingClientRect().top + window.scrollY;
    const viewportHeight = () => document.documentElement.clientHeight;
    const maximumScroll = () => Math.max(0, document.documentElement.scrollHeight - viewportHeight());

    function propertyDestination() {
        const projects = [...document.querySelectorAll('.turkluxx-desktop-sections > .turkluxx-project')];
        const offset = headerOffset();
        const available = viewportHeight() - offset;
        const start = pageTop(projects[0]);
        const last = projects[projects.length - 1];
        const end = pageTop(last) + last.getBoundingClientRect().height;
        if (end - start <= available) return start - offset - (available - (end - start)) / 2;

        // Both complete blocks cannot fit in shorter viewports; keep both headings visible.
        const firstHeading = projects[0].querySelector('h2');
        const lastHeading = last.querySelector('h2');
        const headingEnd = pageTop(lastHeading) + lastHeading.getBoundingClientRect().height;
        return Math.max(start - offset, Math.min(pageTop(firstHeading) - offset - 24, headingEnd - viewportHeight() + 24));
    }

    function cancelAnimation() {
        cancelAnimationFrame(frame);
        frame = 0;
    }

    function focusDestination(element) {
        const hadTabindex = element.hasAttribute('tabindex');
        if (!hadTabindex) element.setAttribute('tabindex', '-1');
        element.focus({ preventScroll: true });
        if (!hadTabindex) element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
    }

    function animateTo(destination, target, hash) {
        cancelAnimation();
        const start = window.scrollY;
        const finish = Math.max(0, Math.min(maximumScroll(), destination));
        let startedAt;
        if (hash !== undefined && location.hash !== hash) {
            history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
        }
        function step(now) {
            if (startedAt === undefined) startedAt = now;
            const progress = Math.min(1, (now - startedAt) / duration);
            window.scrollTo({ top: start + (finish - start) * easeInOutCubic(progress), behavior: 'instant' });
            if (progress < 1) frame = requestAnimationFrame(step);
            else {
                frame = 0;
                focusDestination(target);
            }
        }
        frame = requestAnimationFrame(step);
    }

    document.querySelectorAll('[data-home-scroll]').forEach(link => {
        link.addEventListener('click', event => {
            if (link.dataset.homeScroll === 'contact') return;
            if ((!desktop.matches && !mobile.matches && link.dataset.homeScroll !== 'master-villas') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = document.querySelector(link.hash);
            if (!target) return;
            event.preventDefault();
            let destination = pageTop(target) - headerOffset() - 24;
            if (mobile.matches || !isHomepage) {
                // Start at the existing section, including property imagery above its heading.
                destination = pageTop(target.closest('section, footer') || target) - headerOffset();
            } else {
                if (link.dataset.homeScroll === 'properties') destination = propertyDestination();
                if (link.dataset.homeScroll === 'contact') destination = maximumScroll();
            }
            animateTo(destination, target, link.hash);
        });
    });

    function updateBackToTop() {
        if (!backToTop) return;
        // Show on desktop and mobile after the hero has scrolled out of view.
        const supportedViewport = desktop.matches || mobile.matches;

        backToTop.hidden =
            !supportedViewport ||
            window.scrollY < hero.offsetHeight;
    }

    backToTop?.addEventListener('click', () => {
        if (desktop.matches || mobile.matches) {
            animateTo(
                0,
                document.querySelector('.turkluxx-sales-logo'),
                ''
            );
        }
    });

    window.addEventListener('scroll', updateBackToTop, { passive: true });
    window.addEventListener('resize', () => { cancelAnimation(); updateBackToTop(); });
    window.addEventListener('wheel', cancelAnimation, { passive: true });
    window.addEventListener('touchstart', cancelAnimation, { passive: true });
    window.addEventListener('pointerdown', cancelAnimation, { passive: true });
    window.addEventListener('keydown', event => {
        if (['Escape', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelAnimation();
    });
    updateBackToTop();
})();
