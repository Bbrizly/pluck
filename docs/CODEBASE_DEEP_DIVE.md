# Codebase Deep Dive

This is the detailed maintainer guide for Pluck. It explains what each file does, why the unusual pieces exist, how data moves through the extension, and where changes are most likely to break working behavior.

## Start with the mental model

Pluck is not “a button that downloads an image.” It coordinates four browser security contexts:

1. **Pinterest DOM** — where images and overlays exist.
2. **Extension content-script world** — where Pluck can safely inspect and modify the DOM.
3. **Pinterest MAIN JavaScript world** — where Safari accepts the original trusted click for clipboard access.
4. **Extension background context** — where privileged cross-origin image fetch and visible-tab capture happen.

The extension works because each context has a narrow responsibility.

```text
Pinterest DOM
    ▲          \
    │ inspect   \ overlay UI
    │            ▼
content.js ────────────────┐
    │                      │
    │ runtime message      │ postMessage PNG bytes
    ▼                      ▼
background.js        page-clipboard.js
    │                      │
    ├─ CDN fetch           └─ clipboard promise
    └─ visible tab capture
```

## `extension/manifest.json`

The manifest declares the runtime graph.

### Permissions

```json
"permissions": [
  "storage",
  "clipboardWrite",
  "scripting",
  "activeTab"
]
```

- `storage`: local booleans and diagnostic permission state.
- `clipboardWrite`: declares clipboard intent where supported.
- `scripting`: fallback injection of the MAIN-world bridge.
- `activeTab`: supports visible-tab capture after the user interacts.

### Host permissions

Pinterest page access is limited to configured Pinterest domains.

The image CDN is an **optional** host permission:

```json
"optional_host_permissions": [
  "https://i.pinimg.com/*"
]
```

This keeps higher-quality mode optional and lets the rest of the product work without that permission.

### Content-script order

The bridge loads first:

```json
{
  "js": ["page-clipboard.js"],
  "run_at": "document_start",
  "world": "MAIN"
}
```

The detector and UI load later in the isolated extension world:

```json
{
  "js": ["shared.js", "content.js"],
  "run_at": "document_idle"
}
```

This order is deliberate. The MAIN-world click listener should already exist before the user can see or click the overlay.

## `extension/shared.js`

`shared.js` is a universal module that works in both browser globals and Node tests.

It uses a small UMD-style wrapper:

```js
(function attachPluckShared(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PluckShared = api;
})(globalThis, function createPluckShared() {
  // ...
});
```

This avoids a bundler and lets the same validation code run in:

- content scripts;
- service workers;
- Firefox background pages;
- Node tests.

### URL normalization

`normalizeImageUrl()` is the central security boundary.

It accepts only:

- strings;
- at most 4096 characters;
- HTTPS;
- exact hostname `i.pinimg.com`;
- no embedded username or password.

It strips fragments and returns a normalized absolute URL.

Any future image host expansion must happen here first and must be justified. Do not add broad suffix matching such as `endsWith("pinimg.com")` without checking subdomain risk.

### `srcset` parsing

`parseSrcset()` supports:

- width descriptors, such as `736w`;
- density descriptors, such as `3x`.

It discards malformed and off-domain entries before ranking.

### Candidate selection

`chooseBestImageUrl()` receives only data already attached to the selected image:

- `currentSrc`;
- `src`;
- the image's `srcset`;
- parent `<picture><source>` srcsets;
- rendered width.

Candidates are deduplicated in a `Map` and ranked by declared width or density × rendered width.

It does not:

- open the Pin;
- parse hidden application state;
- inspect nearby Pins;
- call Pinterest APIs;
- rewrite CDN paths.

### Message validation

`isFetchMessage()` and `isCaptureMessage()` verify exact object shapes.

This is intentional. The background worker must not become a general proxy or screenshot service.

A valid fetch message has exactly two keys:

```js
{
  type: "FETCH_SELECTED_IMAGE",
  url: "https://i.pinimg.com/..."
}
```

A valid capture message has exactly one key:

```js
{ type: "CAPTURE_VISIBLE_PIN" }
```

## `extension/background.js`

The background file owns privileged browser operations.

At startup it loads shared validation when running as a service worker:

```js
if (typeof importScripts === "function" && !globalThis.PluckShared) {
  importScripts("shared.js");
}
```

In Firefox's background-document mode, `shared.js` is loaded first by the generated manifest, so `importScripts` is not needed.

### Message router

The router recognizes only three operations:

1. initialize the page bridge;
2. capture the visible Pinterest tab;
3. fetch the selected image.

Unknown messages return `undefined` and trigger no privileged work.

### Page-bridge injection

`installPageClipboardBridge()` validates that the sender is a Pinterest page and then uses `scripting.executeScript()` with `world: "MAIN"`.

This exists as a fallback because browser support for static MAIN-world manifest injection has differed across Safari versions.

### Visible-tab capture

`captureVisiblePinterestTab()` checks:

- sender has a real tab and window ID;
- sender URL is Pinterest;
- `captureVisibleTab` exists;
- returned data is a PNG data URL.

It returns the screenshot to `content.js`, which crops it to the selected image rectangle.

### High-quality image fetch

`fetchSelectedImage()`:

1. normalizes the requested URL;
2. creates an 8-second abort timeout;
3. sends one GET request;
4. omits credentials and referrer;
5. follows redirects but validates the final URL;
6. validates HTTP status;
7. validates MIME type;
8. validates declared and actual size;
9. returns base64 bytes.

Why base64 instead of `ArrayBuffer`?

Safari WebExtension messaging was observed returning some `ArrayBuffer` payloads as empty objects. Base64 costs extra memory and CPU, but it survives the message boundary consistently. The content script still accepts several buffer shapes for future browser compatibility.

### Diagnostic permission state

The worker stores whether a real CDN fetch has succeeded. This is not used as a hard gate. Earlier versions trusted the browser permission-status API and got stuck in a false “Allow access” loop. The actual fetch is now the source of truth.

## `extension/page-clipboard.js`

This is the most timing-sensitive file.

### Why it exists

Safari rejected clipboard calls made after asynchronous extension work, even when the work began from a user click. The solution is a promise-backed clipboard item started during the original trusted click.

### Installation guard

`INSTALL_FLAG` prevents duplicate listeners when the manifest, scripting API, and fallback injection all load the same file.

Duplicate injection does not create duplicate clipboard writes.

### Ready/probe handshake

The bridge writes a readiness marker to `document.documentElement` and emits an event.

`content.js` probes because the bridge may have loaded before the isolated content script registered its listener.

### Original click capture

The bridge listens in capture phase:

```js
window.addEventListener("click", handler, true);
```

It requires:

- `event.isTrusted === true`;
- a click inside the visible Pluck overlay;
- the overlay to be armed with `data-pluck-action="copy"`;
- a unique request ID.

### Promise-backed clipboard item

The critical section is synchronous:

```js
const item = new ClipboardItem({ "image/png": blobPromise });
navigator.clipboard.write([item]);
```

`blobPromise` is resolved later when `content.js` posts the PNG buffer.

### Closed Shadow DOM handling

Safari may omit closed-shadow descendants from the MAIN-world `composedPath()`. The bridge therefore also checks whether click coordinates fall inside the overlay host rectangle.

### Message channel

The isolated content script resolves the pending request through `window.postMessage()`.

The bridge validates:

- `event.source === window`;
- a fixed channel string;
- a known pending request ID;
- a non-empty `ArrayBuffer`.

The page can observe the channel because MAIN-world code is not secret. Security does not depend on secrecy. The request ID must already be pending from a trusted physical click.

## `extension/content.js`

This file owns Pinterest interaction and the end-to-end copy pipeline.

It is large because it contains the exact timing and recovery behavior proven during Safari debugging. Treat it as several logical modules even though they currently live in one file.

## 1. Version and singleton control

The versioned root IDs prevent old local builds from fighting with the current UI:

```text
pluck-v80-overlay-root
pluck-v80-diagnostics-root
```

The page root stores the content-script version. If the same version is already active with a valid overlay, a duplicate instance exits.

`removeExistingPluckUi()` clears known stale roots at startup.

`startUiDeduplicationGuard()` observes only direct children of `<html>`. Pluck roots are inserted there, so there is no reason to watch Pinterest's full dynamic subtree.

This was a major performance fix. A previous full-subtree observer made scrolling sluggish.

## 2. Initialization and settings

`initialize()` reads:

- enabled;
- diagnostics;
- higher-quality mode.

It subscribes to storage changes, so the toolbar popup updates live pages without a reload.

It then installs a small event set:

- `pointermove`: coordinates only;
- `pointerover`: target transition detection;
- `pointerout` / `pointerleave`: hide scheduling;
- `scroll`: hide immediately, one idle recheck;
- `resize`: one animation-frame update.

## 3. Overlay UI

`createOverlay()` creates one fixed host with closed Shadow DOM.

The button is not inserted into each Pin. The host moves to the active image.

Important style choices:

- no `backdrop-filter`;
- `contain: layout style paint`;
- transform-based positioning;
- writes only when transform or state changes;
- reduced-motion support;
- accessible label and live region.

The button is armed only after the clipboard bridge is ready.

## 4. Diagnostics

`createDiagnosticsPanel()` creates a fixed development panel.

`updateDiagnostics()` stores state every time, but exits before DOM writes and console logs when diagnostics are disabled.

This distinction matters. Keeping diagnostics “hidden” while still updating its Shadow DOM would continue to cost work during hover and scroll.

## 5. Pointer and target detection

The detector does not scan the feed.

`trackPointer()` stores the latest coordinates only.

`onPointerOver()` examines the newly entered element. The detector finds an image from the event target and then calls `inspectTarget()`.

Eligibility includes:

- real `<img>` element;
- minimum rendered dimensions;
- approved `i.pinimg.com` URL candidate;
- semantic Pin context;
- no visible video in the card;
- visible viewport intersection.

Pin context uses stable semantic hints where possible:

- `data-test-id="pin"`;
- `data-test-id="pinWrapper"`;
- links whose path contains `/pin/`;
- Pin card image wrappers.

Generated Pinterest class names are not trusted as primary selectors.

## 6. Scroll behavior

`onViewportScroll()` does almost nothing:

1. hide the overlay;
2. reset one 110 ms timer;
3. after idle, inspect the element under the last pointer position once.

There is no geometry work inside the scroll event.

## 7. Copy click orchestration

`onCopyClick()`:

1. blocks duplicate clicks;
2. revalidates the active image;
3. confirms the MAIN-world bridge is ready;
4. retrieves the request ID already armed on the overlay;
5. waits for the page clipboard result;
6. prepares a PNG;
7. resolves the MAIN-world Blob promise;
8. displays success or retry state.

The image is re-inspected at click time because Pinterest may recycle or replace nodes in its virtualized feed.

## 8. High-quality path

When enabled, `fetchHighQualityImageToPng()` sends the exact selected URL to the background worker.

The response is decoded from base64 or supported buffer shapes, wrapped as a Blob using the returned MIME type, then normalized to PNG.

Any failure is caught and recorded. It never blocks the lower paths.

## 9. Loaded-image path

The extension tries to draw the existing Pinterest `<img>` into a canvas.

This is fast and produces a clean result when allowed. It can fail because cross-origin images may taint the canvas even though they are visibly rendered.

A tainted-canvas failure is expected and triggers the screen fallback.

## 10. Sanitized screen fallback

This is the most complicated fallback because it must capture the visual page without capturing UI.

The sanitizer:

- hides all Pluck UI roots;
- identifies the outer Pin card and image path;
- marks path nodes so pseudo-elements can be disabled;
- hides Pinterest buttons, menus, and overlay-positioned siblings over the image;
- explicitly hides `pin-card-last-visited-overlay` and `contentLayer`;
- removes pseudo-element scrims;
- forces image/path opacity and filter back to normal;
- adds a transparent full-window shield so the pointer's real `:hover` state moves away;
- waits two animation frames plus 420 ms for Pinterest transitions;
- verifies persistent overlays are no longer visible;
- asks the background worker for a visible-tab PNG;
- crops the screenshot to the selected image rectangle;
- restores every modified style and attribute in `finally`-style cleanup.

The explicit **Last visited** rule exists because that overlay is persistent and has `pointer-events: none`; generic hit-testing can miss it completely.

If a persistent overlay remains visible, the fallback throws rather than knowingly copy a contaminated image.

## 11. PNG normalization

All successful paths end as PNG.

`convertBlobToPng()` prefers `createImageBitmap()`, then falls back to a local object URL and `HTMLImageElement`.

It validates:

- non-zero width and height;
- maximum pixel count;
- canvas availability;
- PNG encoder success.

Resources are released:

- image bitmaps are closed;
- object URLs are revoked.

## `extension/popup.html` and `popup.js`

The popup exposes three controls:

1. enabled;
2. diagnostics;
3. prefer higher-quality image first.

The higher-quality handler stores the preference immediately before awaiting Safari's permission UI. Safari can close the popup when presenting a permission sheet, so storing after the prompt was unreliable.

Permission results are displayed as advisory state only. Copying always has automatic fallbacks.

## Tests

### `tests/shared.test.cjs`

Protects:

- exact image-host allowlist;
- HTTPS requirement;
- candidate ranking;
- off-domain rejection;
- fail-closed message shapes.

### `tests/compliance.test.cjs`

Protects runtime boundaries such as:

- no broad permissions;
- no page-side direct fetch;
- credentials omitted;
- redirect validation;
- no clipboard reading;
- screenshot sender validation;
- persistent overlay rules.

### `tests/page-clipboard.test.cjs`

Uses Node VM contexts to exercise:

- bridge installation;
- duplicate injection;
- trusted-click requirement;
- overlay matching;
- clipboard promise resolution;
- invalid byte rejection.

### `tests/performance.test.cjs`

Guards against regression to known slow patterns:

- full-subtree observation;
- DOM hit-testing on every pointer move;
- geometry work inside scroll events;
- hidden diagnostics DOM writes;
- backdrop filters;
- repeated ancestor geometry loops.

These source-structure tests are intentionally blunt. They prevent a “small cleanup” from accidentally restoring the exact patterns that slowed Pinterest.

## Build scripts

### `scripts/validate.mjs`

Checks:

- package and manifest versions match;
- Manifest V3 remains enabled;
- `<all_urls>` has not appeared;
- image permission remains exact;
- every extension JavaScript file parses;
- shell scripts pass `bash -n`;
- required documentation exists.

### `scripts/build-browsers.mjs`

Generates:

- `dist/safari`;
- `dist/chromium`;
- `dist/firefox`.

Firefox receives both `background.scripts` and `background.service_worker`. Firefox can use a background document while Chromium uses the service worker.

The generated packages are port candidates, not proof of browser support.

### `scripts/package-release.sh`

Builds all targets and creates ZIP archives with `manifest.json` at the ZIP root, as browser stores expect.

### `scripts/package-safari.sh`

Uses Apple's Safari Web Extension packaging tool to create an Xcode wrapper for local development.

Set `NO_OPEN=1` in CI or scripted environments to prevent Xcode from opening automatically.

## Safe change checklist

Before changing the runtime, ask:

1. Does this add work to pointermove, scroll, resize, or a full-page observer?
2. Does this delay the MAIN-world clipboard call beyond the original click?
3. Does this broaden a host permission or background message shape?
4. Does this introduce a new way to copy UI overlays into the fallback?
5. Does cleanup run when capture, crop, conversion, or clipboard fails?
6. Does the change work with multiple locally installed versions?
7. Is there a regression test for the exact bug?

If any answer is unclear, stop and add diagnostics or a focused test before changing behavior.

## Refactoring guidance

The first sensible extraction, after multi-browser validation, would be:

```text
content/
├── detector.js
├── overlay.js
├── clipboard-client.js
├── image-pipeline.js
├── capture-sanitizer.js
└── diagnostics.js
```

Do not do that split merely for aesthetics. The interfaces should be derived from proven browser behavior, not invented in advance. The current large file is less dangerous than a “clean” abstraction that breaks trusted-click timing or cleanup order.
