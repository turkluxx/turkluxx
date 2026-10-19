// Add only real, approved, publicly accessible videos.
// language is the spoken-content BCP 47 code, independent of the interface language.
// Store English YouTube entries once: EN and NL both select those same records.
// Fields: id, collectionId (optional), title, description, thumbnail (optional),
// language, provider ('youtube' or 'google-drive'), videoId or fileId (or url),
// order (optional), orientation ('horizontal' or 'vertical').
window.TurkLuxxVideos = Object.freeze([]);
