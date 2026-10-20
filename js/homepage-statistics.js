(() => {
    'use strict';
    const initialize = () => {
    const section = document.querySelector('.turkluxx-statistics');
    if (!section || section.dataset.statisticsState) return;
    section.dataset.statisticsState = 'ready';
    const bar = section.querySelector('.turkluxx-statistics-grid');
    const cards = [...section.querySelectorAll('.turkluxx-statistics-card')];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const format = value => `${value.toLocaleString('en-US')}+`;
    const seen = new WeakSet();
    const frames = new Set();
    const animations = new Set();
    let revealed = false;
    let observer;
    const finish = () => {
        observer?.disconnect();
        frames.forEach(cancelAnimationFrame);
        frames.clear();
        animations.forEach(animation => animation.cancel());
        animations.clear();
        section.querySelectorAll('[data-count]').forEach(counter => {
            counter.textContent = format(Number(counter.dataset.count));
        });
        section.dataset.statisticsState = 'complete';
    };
    section.dataset.statisticsMotion = motion.matches ? 'reduced' : 'normal';
    if (!('IntersectionObserver' in window)) {
        finish();
        return;
    }
    const schedule = callback => {
        const frame = requestAnimationFrame(now => {
            frames.delete(frame);
            callback(now);
        });
        frames.add(frame);
    };
    observer = new IntersectionObserver(entries => {
        // Each mobile row starts only when its cards are actually visible.
        const entering = entries.filter(entry => entry.isIntersecting && !seen.has(entry.target))
            .sort((a, b) => cards.indexOf(a.target) - cards.indexOf(b.target));
        if (entering.length && !revealed) {
            revealed = true;
            section.dataset.statisticsState = 'animating';
            // Animate the shared surface so internal dividers stay joined.
            if (!motion.matches && typeof bar.animate === 'function') {
                const animation = bar.animate([
                    { opacity: 0, transform: 'translateY(24px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], { duration: 800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
                animations.add(animation);
                animation.onfinish = () => animations.delete(animation);
            }
        }
        entering.forEach((entry, index) => {
            const card = entry.target;
            seen.add(card);
            observer.unobserve(card);
            const delay = index * 120;
            const counter = card.querySelector('[data-count]');
            if (!counter) return;
            counter.textContent = '0+';
            const start = performance.now() + delay;
            const tick = now => {
                const progress = Math.max(0, Math.min((now - start) / 2000, 1));
                const eased = 1 - Math.pow(1 - progress, 3);
                counter.textContent = format(Math.floor(Number(counter.dataset.count) * eased));
                if (progress < 1) schedule(tick);
                else {
                    counter.dataset.countComplete = '';
                    if (section.querySelectorAll('[data-count-complete]').length === 2) {
                        section.dataset.statisticsState = 'complete';
                    }
                }
            };
            schedule(tick);
        });
    }, { threshold: 0.1 });
    // Final HTML values cover no-JS; counters animate for both motion preferences.
    section.querySelectorAll('[data-count]').forEach(counter => { counter.textContent = '0+'; });
    cards.forEach(card => observer.observe(card));
    motion.addEventListener('change', event => {
        section.dataset.statisticsMotion = event.matches ? 'reduced' : 'normal';
        if (event.matches) {
            animations.forEach(animation => animation.cancel());
            animations.clear();
        }
    });
    };
    // Work with defer, late injection, and scripts placed before the section.
    const start = () => {
        // Arabic landing pages remain hidden while their locale is loading.
        // Do not consume their entrance/count-up before the page is revealed.
        if (getComputedStyle(document.documentElement).visibility === 'hidden') {
            const visibility = new MutationObserver(() => {
                if (getComputedStyle(document.documentElement).visibility !== 'hidden') {
                    visibility.disconnect();
                    initialize();
                }
            });
            visibility.observe(document.documentElement, {attributes:true, attributeFilter:['style','class']});
        } else initialize();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
    else start();
})();
