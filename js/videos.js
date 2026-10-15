(() => {
    'use strict';
    function driveUrls(value) {
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
    // A pure selector keeps future language controls separate from rendering.
    const selectVideos = (entries, language = null) => entries.filter(entry => !language || entry.language === language);
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
        const urls = driveUrls(video.url);
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
        // Cross-origin Drive permission errors cannot be detected reliably. Always offer an exit.
        const fallback = document.createElement('p'); bind(fallback, 'videos.fallback');
        const link = document.createElement('a'); link.href = urls.view; link.target = '_blank'; link.rel = 'noopener noreferrer'; bind(link, 'videos.open');
        copy.append(fallback, link);
        button.addEventListener('click', () => {
            const iframe = document.createElement('iframe'); iframe.src = urls.preview; iframe.title = video.title; iframe.allowFullscreen = true; iframe.allow = 'fullscreen'; iframe.referrerPolicy = 'no-referrer';
            iframe.addEventListener('error', () => { iframe.remove(); const error = document.createElement('p'); bind(error, 'videos.unavailable'); media.append(error); });
            media.replaceChildren(iframe); iframe.focus();
        }, { once: true });
        return card;
    }
    window.TurkLuxxVideoGallery = { driveUrls, selectVideos, createVideoCard };
    async function init() {
        await window.TurkLuxxI18n.ready;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) bind(meta, 'videos.subtitle', {}, 'content');
        const gallery = document.getElementById('videos-gallery');
        if (!gallery) return;
        const videos = selectVideos(window.TurkLuxxVideos || []);
        gallery.replaceChildren(...videos.map(createVideoCard));
        document.getElementById('videos-empty').hidden = videos.length > 0;
    }
    init();
})();
