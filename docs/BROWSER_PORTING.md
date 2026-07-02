# Porting Pin Copy to Every Major Browser

Pin Copy should remain **one product with one shared codebase**, not six browser forks.

The correct model is:

```text
Shared extension source
        │
        ├─ Safari manifest/package
        ├─ Chromium manifest/package
        └─ Firefox manifest/package

Chromium package
        ├─ Chrome Web Store
        ├─ Microsoft Edge Add-ons
        ├─ Brave via Chrome Web Store
        └─ Opera Add-ons / Chromium sideload
```

## Current repository support

Run:

```bash
npm run build
```

This creates:

```text
dist/safari/
dist/chromium/
dist/firefox/
```

Run:

```bash
npm run package:all
```

This creates ZIPs under `releases/`.

These are **port candidates**. A generated package is not automatically a supported browser release. Each target must pass the live test matrix described below.

## What is already cross-browser

The following code intentionally uses standard WebExtension and Web APIs:

- Pinterest DOM inspection;
- one reusable overlay;
- Shadow DOM UI;
- local extension storage;
- runtime messaging;
- `scripting.executeScript()`;
- `tabs.captureVisibleTab()`;
- optional host permissions;
- canvas and PNG encoding;
- `ClipboardItem` and async clipboard;
- `browser ?? chrome` API selection.

The WebExtensions model is designed for substantial cross-browser reuse, but API support and Manifest V3 background behavior still differ. Official references:

- Chrome Extensions: https://developer.chrome.com/docs/extensions/
- Firefox WebExtensions: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- Safari Web Extensions: https://developer.apple.com/documentation/safariservices/safari-web-extensions
- Edge extensions: https://learn.microsoft.com/en-us/microsoft-edge/extensions/
- Opera extensions: https://help.opera.com/en/extensions/

## The browser families

## 1. Safari

### Package

Use `dist/safari` or the working `extension/` directory.

For local development:

```bash
BUNDLE_ID="com.yourname.pincopy.dev" ./scripts/package-safari.sh
```

For public distribution, Safari Web Extensions are packaged and distributed through Apple's tooling and App Store Connect.

### Safari-specific risk areas

- trusted image clipboard activation;
- MAIN-world script injection;
- optional host permission behavior;
- cross-context binary message serialization;
- Xcode signing and host-app packaging.

The current code contains Safari-driven reliability work, especially the promise-backed MAIN-world clipboard bridge and base64 background response.

## 2. Chromium: Chrome, Edge, Brave, Opera

`dist/chromium` is the shared package candidate.

### Why one Chromium package

Microsoft documents Chrome-to-Edge extension porting as requiring minimal changes for supported APIs and manifest keys. Brave supports nearly all Chromium-compatible extensions and installs them from the Chrome Web Store. Opera has its own add-on review channel but is also Chromium-based.

Do not maintain separate Chrome, Edge, Brave, and Opera source directories unless live testing proves a real browser difference.

### Local loading

#### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `dist/chromium`.

#### Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `dist/chromium`.

#### Brave

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `dist/chromium`.

For public users, the normal route is the Chrome Web Store because Brave supports Chromium extensions from that store.

#### Opera

1. Open `opera://extensions`.
2. Enable developer mode.
3. Load the unpacked `dist/chromium` directory.
4. Validate separately before submitting to Opera Add-ons.

### Chromium validation targets

The current code should be close, but test these explicitly:

1. Does static `content_scripts.world: "MAIN"` load `page-clipboard.js`?
2. Does the scripting fallback inject with `world: "MAIN"`?
3. Does `ClipboardItem({ "image/png": Promise<Blob> })` remain tied to the original click?
4. Does `window.postMessage()` transfer the PNG `ArrayBuffer` correctly?
5. Does the background service worker wake reliably for fetch and capture messages?
6. Does `permissions.request()` for `i.pinimg.com` work from the popup?
7. Does `captureVisibleTab()` return the correct active tab and scale?
8. Does Pinterest DOM behavior match Safari?
9. Does the screen sanitizer restore every style after success and failure?
10. Is scrolling unaffected with diagnostics off?

### Expected simplifications

Chromium may not need every Safari fallback. Do not remove them from shared code until tests show they cause harm. A fallback that is unused is cheaper than a browser fork.

## 3. Firefox

Firefox uses WebExtensions but has a key Manifest V3 difference: the background environment may be a non-persistent background document rather than the Chromium-style extension service worker.

The generated Firefox manifest includes both:

```json
"background": {
  "scripts": ["shared.js", "background.js"],
  "service_worker": "background.js"
}
```

Each browser selects the environment it supports.

`background.js` conditionally calls `importScripts()` only when it is actually running as a worker. In a Firefox background document, `shared.js` is loaded first by the manifest.

### Local loading

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `dist/firefox/manifest.json`.

Temporary add-ons disappear when Firefox restarts. Public or self-distributed release builds must be signed through Mozilla's add-on infrastructure.

### Optional extension ID

For a signed Firefox build, provide an ID while building:

```bash
FIREFOX_EXTENSION_ID="pin-copy@yourdomain.example" npm run build
```

The build script adds `browser_specific_settings.gecko.id` only when the environment variable is set.

Do not publish the placeholder domain. Use an ID you control and keep it stable forever after release.

### Firefox validation targets

1. Does `content_scripts.world: "MAIN"` run the bridge at `document_start`?
2. Does the generated background page register message listeners correctly?
3. Does `scripting.executeScript()` fallback work in the MAIN world?
4. Does promise-backed PNG clipboard writing work from a trusted click?
5. Does binary `window.postMessage()` use structured clone as expected?
6. Do optional host permissions behave as expected?
7. Does `captureVisibleTab()` require any different permission or user-action timing?
8. Does Firefox scale screenshots differently on Retina displays?
9. Does Firefox require a different clipboard fallback?
10. Does AMO validation accept every manifest key?

## Browser-support matrix

| Capability | Safari | Chromium | Firefox |
|---|---:|---:|---:|
| Isolated content script | Working | Expected | Expected |
| MAIN-world bridge | Working | Must validate | Must validate |
| MV3 service worker | Working | Native model | Generated fallback manifest |
| Background document | Not used | Not used | Candidate |
| Optional CDN host permission | Working with quirks/fallback | Must validate | Must validate |
| PNG ClipboardItem promise | Working | Must validate | Must validate |
| Visible-tab capture | Working | Must validate | Must validate |
| Store package generated | Yes | Yes | Yes |
| Public store release | Not automated | Not automated | Not automated |

## The porting sequence

Do not attempt every store at once.

### Phase 1: Chrome

Chrome is the best next target because:

- its extension platform is the baseline for Chromium browsers;
- Edge and Brave reuse most of the result;
- Chrome Web Store distribution covers Chrome and many Brave users.

Exit criteria:

- full manual copy matrix passes;
- no browser-specific runtime errors;
- performance is equivalent to Safari;
- all permissions are understood;
- store ZIP validates.

### Phase 2: Edge and Brave

Use the exact Chromium artifact first.

- Edge: test and submit the same package to Microsoft Edge Add-ons.
- Brave: test the Chrome Web Store version directly in Brave.

Create a browser-specific patch only when a reproducible browser difference exists.

### Phase 3: Firefox

Validate the background-document manifest and clipboard sequence.

Firefox is the target most likely to need a small platform adapter because its MV3 background environment differs.

### Phase 4: Opera

Test the Chromium artifact and submit separately if an Opera listing is worth maintaining.

Opera should not block the main multi-browser launch.

## Store distribution map

| Browser | Distribution |
|---|---|
| Safari | App Store / App Store Connect |
| Chrome | Chrome Web Store |
| Edge | Microsoft Edge Add-ons |
| Brave | Chrome Web Store package |
| Firefox | addons.mozilla.org or signed self-distribution |
| Opera | Opera Add-ons or supported Chromium installation route |

## What must not diverge

Keep these shared across every browser:

- Pin eligibility rules;
- button appearance and states;
- higher-quality setting semantics;
- image candidate selection;
- persistent overlay removal;
- no analytics/backend promise;
- security allowlist;
- error-code meanings;
- test fixtures.

## What may diverge

Only isolate these when required:

- background manifest shape;
- clipboard bridge implementation;
- permission request UX;
- visible-tab capture adapter;
- store metadata and package signing.

A reasonable future structure after live ports prove the boundaries:

```text
extension/
├── core/
│   ├── detector.js
│   ├── image-pipeline.js
│   ├── capture-sanitizer.js
│   └── state-machine.js
├── platform/
│   ├── safari.js
│   ├── chromium.js
│   └── firefox.js
└── ui/
```

Do not perform this refactor before browser behavior is known. The working Safari implementation is the reference behavior.

## Public-release checklist per browser

For each browser:

- [ ] Load unpacked/temporary package.
- [ ] Test Home, search, and boards.
- [ ] Test higher-quality on and off.
- [ ] Test denied optional permission.
- [ ] Test video exclusion.
- [ ] Test Last Visited overlay.
- [ ] Test partial viewport image.
- [ ] Paste into at least Preview/native image viewer, ChatGPT, and a design app.
- [ ] Record a performance trace during fast scrolling.
- [ ] Verify no copy UI is included in output.
- [ ] Verify diagnostics are off by default.
- [ ] Validate store package.
- [ ] Prepare browser-specific privacy answers and screenshots.
- [ ] Roll out privately/unlisted before public release.
