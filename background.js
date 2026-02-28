// Focus Friction — Background Service Worker
//
// All session timing and friction effects are now managed entirely by
// content.js on a per-page-load basis. This service worker exists to
// satisfy the MV3 requirement and holds no runtime state.
//
// The friction site list lives in chrome.storage.sync and is read
// directly by content.js and popup.js.
