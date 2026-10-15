# Videos

`videos.html` is served at `/videos` by Cloudflare's existing HTML asset handling.
No navigation entry is added. The page reuses the Team page's header/footer shell.

Add approved entries to `js/videos-data.js` with these fields:

- `title`, `description`: actual content, displayed in the recording's language.
- `language`: spoken-content BCP 47 code, such as `tr` or `en`.
- `url`: public HTTPS Google Drive file sharing URL (`/file/d/FILE_ID/view`).
- `thumbnail`: optional approved local image path or HTTPS image URL.
- `orientation`: `vertical` (9:16) or `horizontal` (16:9, default).

The collection is deliberately empty. No thumbnails or players are requested in
the empty state. Players are created only after a visitor activates a play button.
Thumbnails use contain sizing; each player's frame follows its video orientation.
`TurkLuxxVideoGallery.selectVideos(entries, language)` supports future filtering
without tying the content language to the current interface language.

Use only videos approved for public viewing and test access while signed out.
Google Drive permissions, processing, and browser restrictions can prevent playback:
see [Google Drive video help](https://support.google.com/drive/answer/2423694).
The component builds `/file/d/FILE_ID/preview` URLs, retains sharing resource keys,
rejects other hosts/protocols, and never uses account credentials or a Drive API.
A direct Drive link remains available because cross-origin iframe permission
errors cannot reliably be detected by the containing website.

Interface copy lives in all six existing locale catalogs; SEO description follows
the active interface language using the existing translation binding API.
Run `npm.cmd test` and `npm.cmd run build`. No deployment is needed for this stage.
