# Videos

`videos.html` is served at `/videos` by Cloudflare's existing HTML asset handling.
No navigation entry is added. The page reuses the Team page's header/footer shell.

Add approved entries to `js/videos-data.js` with these fields:

- `title`, `description`: actual content, displayed in the recording's language.
- `language`: spoken-content BCP 47 code, such as `tr` or `en`.
- `id`: unique record identifier; `collectionId`: optional property/collection identifier.
- `provider`: `youtube` for English, `google-drive` for ES, RU, TR and AR.
- `videoId` (YouTube) or `fileId` (Drive), or a supported public HTTPS `url`.
- `order`: optional numeric display order, ascending (default zero).
- `thumbnail`: optional approved local image path or HTTPS image URL.
- `orientation`: `vertical` (9:16) or `horizontal` (16:9, default).

The collection is deliberately empty. No thumbnails or players are requested in
the empty state. Players are created only after a visitor activates a play button.
Thumbnails use contain sizing; each player's frame follows its video orientation.
EN and NL both select the same English YouTube records. Do not add Dutch copies.
ES, RU, TR and AR select only their own Google Drive records. Missing collections
show the translated empty state; there is no automatic content fallback.
The existing `turkluxx:language-change` event replaces the gallery and removes any
active players. Interface translations remain independent of recording language,
so Dutch visitors see Dutch controls around the shared English content.

Use only videos approved for public viewing and test access while signed out.
Google Drive permissions, processing, and browser restrictions can prevent playback:
see [Google Drive video help](https://support.google.com/drive/answer/2423694).
The component builds `/file/d/FILE_ID/preview` URLs, retains sharing resource keys,
rejects other hosts/protocols, and never uses account credentials or a Drive API.
A direct Drive link remains available because cross-origin iframe permission
errors cannot reliably be detected by the containing website.

YouTube accepts eleven-character IDs or HTTPS watch, shorts, embed and youtu.be
links. Players use youtube-nocookie.com, load only on click, and never autoplay.
The iframe sends its origin with `strict-origin-when-cross-origin`, following
[YouTube embedded player identity requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity).
Drive accepts file IDs and file/open/uc sharing links, retaining resource keys.
Both providers have translated fallback text and links. No API keys are required.

Interface copy lives in all six existing locale catalogs; SEO description follows
the active interface language using the existing translation binding API.
Run `npm.cmd test` and `npm.cmd run build`. No deployment is needed for this stage.
