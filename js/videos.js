(() => {
    'use strict';
    function driveUrls(value) {
        if (typeof value === 'string' && /^[\w-]+$/.test(value)) value = `https://drive.google.com/file/d/${value}/view`;
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port) return null;
            const id = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/(?:view|preview))?\/?$/)?.[1]
                || (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
            if (!id || !/^[\w-]+$/.test(id)) return null;
            const base = `https://drive.google.com/file/d/${id}`;
            const resourceKey = url.searchParams.get('resourcekey');
            const suffix = resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}` : '';
            return { preview: `${base}/preview${suffix}`, view: `${base}/view${suffix}` };
        } catch { return null; }
    }
    function youtubeUrls(value) {
        let id = value;
        if (typeof value !== 'string') return null;
        if (!/^[\w-]{11}$/.test(value)) {
            try {
                const url = new URL(value);
                if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
                if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
                else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
                    id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)\/?$/)?.[1];
                } else return null;
            } catch { return null; }
        }
        if (!id || !/^[\w-]{11}$/.test(id)) return null;
        return { preview: `https://www.youtube-nocookie.com/embed/${id}`, view: `https://www.youtube.com/watch?v=${id}` };
    }
    const languageSources = Object.freeze({ en: { language: 'en', provider: 'youtube' }, nl: { language: 'en', provider: 'youtube' }, es: { language: 'es', provider: 'google-drive' }, ru: { language: 'ru', provider: 'google-drive' }, tr: { language: 'tr', provider: 'google-drive' }, ar: { language: 'ar', provider: 'google-drive' } });
    const selectVideos = (entries, language = 'en') => {
        const source = languageSources[language];
        if (!source) return [];
        return entries.filter(entry => entry.language === source.language && entry.provider === source.provider)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    };
    const bind = (node, key, values = {}, attribute = null) => window.TurkLuxxI18n.bind(node, key, values, attribute);
    function createVideoCard(video) {
        const card = document.createElement('article'); card.className = 'video-card';
        const media = document.createElement('div'); media.className = 'video-media' + (video.orientation === 'vertical' ? ' is-vertical' : '');
        const copy = document.createElement('div'); copy.className = 'video-copy';
        const language = document.createElement('span'); language.className = 'video-language';
        // Native language names describe the recording, even when the UI language changes.
        language.textContent = ({ en: 'English', ru: 'Русский', es: 'Español', ar: 'العربية', tr: 'Türkçe', nl: 'Nederlands' })[video.language] || video.language;
        language.lang = video.language; language.dir = 'auto'; language.dataset.i18nIgnore = '';
        const title = document.createElement('h2'); title.textContent = video.title; title.lang = video.language; title.dir = 'auto'; title.dataset.i18nIgnore = '';
        const description = document.createElement('p'); description.textContent = video.description; description.lang = video.language; description.dir = 'auto'; description.dataset.i18nIgnore = '';
        copy.append(language, title, description); card.append(media, copy);
        const isYouTube = video.provider === 'youtube';
        const urls = isYouTube ? youtubeUrls(video.videoId || video.url) : video.provider === 'google-drive' ? driveUrls(video.fileId || video.url) : null;
        if (!urls) { const error = document.createElement('p'); bind(error, 'videos.unavailable'); copy.append(error); return card; }
        if (video.thumbnail) {
            try {
                const url = new URL(video.thumbnail, location.href);
                if (url.origin === location.origin || url.protocol === 'https:') {
                    const image = document.createElement('img'); image.src = url.href; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; media.append(image);
                }
            } catch { /* An invalid optional thumbnail must not prevent playback. */ }
        }
        const button = document.createElement('button'); button.type = 'button'; button.className = 'video-play';
        bind(button, 'videos.play', { title: video.title }, 'aria-label');
        const icon = document.createElement('span'); icon.textContent = '▶'; icon.setAttribute('aria-hidden', 'true'); button.append(icon); media.append(button);
        // Cross-origin playback errors cannot be detected reliably. Always offer an exit.
        const provider = isYouTube ? 'YouTube' : 'Google Drive';
        const fallback = document.createElement('p'); bind(fallback, 'videos.fallback', { provider });
        const link = document.createElement('a'); link.href = urls.view; link.target = '_blank'; link.rel = 'noopener noreferrer'; bind(link, 'videos.open', { provider });
        copy.append(fallback, link);
        button.addEventListener('click', () => {
            const iframe = document.createElement('iframe'); iframe.src = urls.preview; iframe.title = video.title; iframe.allowFullscreen = true; iframe.loading = 'lazy'; iframe.allow = isYouTube ? 'fullscreen; encrypted-media; picture-in-picture' : 'fullscreen'; iframe.referrerPolicy = isYouTube ? 'strict-origin-when-cross-origin' : 'no-referrer';
            iframe.addEventListener('error', () => { iframe.remove(); const error = document.createElement('p'); bind(error, 'videos.unavailable'); media.append(error); });
            media.replaceChildren(iframe); iframe.focus();
        }, { once: true });
        return card;
    }
    function renderGallery() {
        const gallery = document.getElementById('videos-gallery');
        if (!gallery) return;
        const videos = selectVideos(window.TurkLuxxVideos || [], window.TurkLuxxI18n.language);
        // Replacing the gallery also stops and removes players from the previous language.
        gallery.replaceChildren(...videos.map(createVideoCard));
        document.getElementById('videos-empty').hidden = videos.length > 0;
    }
    window.TurkLuxxVideoGallery = { driveUrls, youtubeUrls, selectVideos, createVideoCard, renderGallery };
    function initPhotos() {
        const gallery = document.getElementById('photos-gallery');
        const dialog = document.getElementById('photo-lightbox');
        if (!gallery || !dialog || !dialog.querySelector) return;
        const image = dialog.querySelector('.photo-original');
        const error = dialog.querySelector('.photo-error');
        const counter = dialog.querySelector('.photo-counter');
        const close = dialog.querySelector('.photo-close');
        const previous = dialog.querySelector('.photo-previous');
        const next = dialog.querySelector('.photo-next');
        bind(dialog, 'photos.heading', {}, 'aria-label');
        for (const [node, key] of [[close, 'close'], [previous, 'previous'], [next, 'next']]) bind(node, 'photos.' + key, {}, 'aria-label');
        let index = 0, opener, touchStart;
        const path = number => 'img/gallery/photo' + number + '.jpeg';
        const show = number => {
            index = (number + 10) % 10;
            image.hidden = false; error.hidden = true;
            bind(image, 'photos.alt', { number: index + 1 }, 'alt');
            image.src = path(index + 1);
            counter.textContent = (index + 1) + ' / 10';
        };
        image.addEventListener('error', () => { image.hidden = true; error.hidden = false; });
        image.addEventListener('load', () => { image.hidden = false; error.hidden = true; });
        for (let number = 1; number <= 10; number++) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'photo-thumbnail';
            const thumbnail = document.createElement('img');
            thumbnail.loading = 'lazy'; thumbnail.decoding = 'async';
            thumbnail.width = 400; thumbnail.height = 300;
            bind(thumbnail, 'photos.alt', { number }, 'alt');
            bind(button, 'photos.alt', { number }, 'aria-label');
            thumbnail.addEventListener('error', () => { thumbnail.hidden = true; button.classList.add('is-unavailable'); });
            thumbnail.src = path(number);
            button.append(thumbnail); gallery.append(button);
            button.addEventListener('click', () => {
                opener = button; show(number - 1);
                dialog.showModal(); close.focus();
            });
        }
        close.addEventListener('click', () => dialog.close());
        previous.addEventListener('click', () => show(index - 1));
        next.addEventListener('click', () => show(index + 1));
        dialog.addEventListener('click', event => { if (event.target === dialog || event.target.classList.contains('photo-stage')) dialog.close(); });
        dialog.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1));
            }
        });
        dialog.addEventListener('touchstart', event => {
            touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
        }, { passive: true });
        dialog.addEventListener('touchend', event => {
            if (!touchStart || !event.changedTouches.length) return;
            const dx = event.changedTouches[0].clientX - touchStart.x;
            const dy = event.changedTouches[0].clientY - touchStart.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
            touchStart = null;
        }, { passive: true });
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            image.removeAttribute('src');
            opener?.focus({ preventScroll: true });
        });
    }
    async function init() {
        await window.TurkLuxxI18n.ready;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) bind(meta, 'videos.subtitle', {}, 'content');
        window.addEventListener('turkluxx:language-change', renderGallery);
        renderGallery();
        initPhotos();
    }
    init();
})();
