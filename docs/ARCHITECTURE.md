# Architecture

This document explains the runtime architecture and the boundaries that must remain stable as Pluck evolves.

## Design goals

Pluck has one job: copy one visible Pinterest still image after one explicit user click.

The architecture is optimized for:

- trusted clipboard activation;
- low impact on Pinterest scrolling;
- strict host and message validation;
- graceful fallback when browser security blocks direct image access;
- one shared WebExtension codebase;
- browser-specific packaging rather than browser-specific feature forks.

## Runtime components

```text
┌────────────────────────────────────────────────────────────┐
│ Pinterest page                                             │
│                                                            │
│  MAIN world                                                │
│  page-clipboard.js                                         │
│  └─ captures original trusted click                        │
│  └─ starts navigator.clipboard.write() immediately         │
│                                                            │
│  ISOLATED extension world                                  │
│  shared.js + content.js                                    │
│  └─ finds eligible image                                   │
│  └─ renders one overlay button                             │
│  └─ prepares PNG using one of three paths                  │
│  └─ resolves the MAIN-world clipboard promise              │
└───────────────────────┬────────────────────────────────────┘
                        │ runtime messages
                        ▼
┌────────────────────────────────────────────────────────────┐
│ Extension background context                               │
│ background.js                                              │
│ └─ validates messages                                      │
│ └─ injects page bridge when needed                         │
│ └─ fetches exact i.pinimg.com image                        │
│ └─ captures visible tab for final fallback                 │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ Toolbar popup                                              │
│ popup.html + popup.js                                      │
│ └─ enabled                                                 │
│ └─ diagnostics                                             │
│ └─ higher-quality preference and optional host request     │
└────────────────────────────────────────────────────────────┘
```

## Why two JavaScript worlds exist

A normal extension content script runs in an isolated JavaScript world. It shares the page DOM but not the page's global scope. Safari may reject clipboard work that is no longer tied to the original trusted user gesture or that originates from the wrong execution context.

`page-clipboard.js` therefore runs in the page's `MAIN` world at `document_start`.

Its only responsibility is to:

1. observe the original physical click on the Pluck overlay;
2. create a promise for an `image/png` Blob;
3. call `navigator.clipboard.write()` synchronously inside that click;
4. wait for `content.js` to resolve or reject the Blob promise.

It does not inspect Pinterest data, fetch images, or use privileged extension APIs.

## Trusted clipboard sequence

```text
Physical click
   │
   ├─ MAIN world capture listener sees trusted event
   │      └─ creates ClipboardItem({ "image/png": blobPromise })
   │      └─ calls navigator.clipboard.write([item])
   │
   └─ isolated content handler starts image preparation
          ├─ direct CDN fetch, when enabled
          ├─ loaded-image canvas path
          └─ sanitized visible-tab capture

Prepared PNG ArrayBuffer
   │
   └─ window.postMessage() to MAIN world
          └─ resolve Blob promise
                 └─ clipboard write completes
```

The order is not optional. Fetching first and calling the clipboard later can lose the browser's transient user activation.

## Copy-path decision tree

```text
Is higher-quality mode enabled?
        │
        ├─ yes → fetch selected i.pinimg.com candidate
        │           ├─ success → normalize to PNG
        │           └─ failure → continue
        │
        ▼
Draw the already-loaded <img> into canvas
        │
        ├─ success → export PNG
        └─ blocked/tainted → continue

Sanitize visible Pinterest card
        │
        ├─ hide Pluck UI
        ├─ hide Pinterest controls and persistent overlays
        ├─ clear scrims and filters
        ├─ move real :hover state off the card
        ├─ wait for transitions
        └─ verify persistent overlays are hidden
        │
        ▼
Capture visible tab → crop image rectangle → PNG
```

The direct byte paths are preferable. The screen path exists because browser cross-origin rules can block canvas export even when the image is visibly loaded.

## Hot-path performance design

Pinterest is an infinite, animated masonry feed. The following rules are mandatory:

- No full-page polling.
- No full-subtree `MutationObserver`.
- No network requests on hover.
- No permanent button per Pin.
- No `elementsFromPoint()` on every pointer-move frame.
- No fixed-element backdrop blur.
- No continuous overlay repositioning during scroll.

Current event flow:

```text
pointermove → record x/y only
pointerover → inspect only the entered element
scroll      → hide overlay immediately
scroll idle → one hit test after 110 ms
resize      → one requestAnimationFrame update
```

One overlay host is reused for all Pins.

## State model

```text
HIDDEN
  └─ eligible image entered → IDLE

IDLE
  ├─ click → COPYING
  └─ pointer leaves → HIDDEN

COPYING
  ├─ clipboard succeeds → SUCCESS
  └─ any path fails → FAILURE

SUCCESS
  ├─ 1.5 seconds → IDLE if target remains
  └─ pointer leaves → HIDDEN

FAILURE
  ├─ click Try again → COPYING
  ├─ new image entered → IDLE
  └─ pointer leaves → HIDDEN
```

The bridge readiness state can temporarily render `Starting…` instead of `Copy`.

## Security model

### Page access

The manifest matches only configured Pinterest domains.

### Image access

Optional host access is restricted to:

```text
https://i.pinimg.com/*
```

### Background message contracts

The privileged fetch path accepts exactly:

```js
{
  type: "FETCH_SELECTED_IMAGE",
  url: "https://i.pinimg.com/..."
}
```

It rejects:

- additional keys;
- arrays or batch inputs;
- arbitrary methods or headers;
- off-domain URLs;
- HTTP URLs;
- URLs containing credentials;
- redirects outside the allowlist.

The capture path accepts exactly:

```js
{ type: "CAPTURE_VISIBLE_PIN" }
```

The sender must be a Pinterest page.

### Fetch behavior

- `credentials: "omit"`
- `referrerPolicy: "no-referrer"`
- allowed image MIME types only
- 25 MB compressed response limit
- 8 second fetch timeout
- 60 megapixel decoded image limit

## Storage model

All storage is local extension storage.

| Key | Meaning |
|---|---|
| `enabled` | Whether page UI is active |
| `debugEnabled` | Whether the diagnostic panel is visible |
| `highQualityEnabled` | Whether CDN fetch is attempted first |
| `imageAccessRequestAccepted` | Diagnostic record of optional permission response |
| `imageAccessVerified` | Whether a real CDN fetch succeeded before |
| timestamp/error keys | Diagnostic-only permission/fetch state |

No copied image, image URL, Pinterest account data, or browsing history is persisted.

## Browser portability boundary

Shared behavior should remain in:

- `content.js`
- `shared.js`
- `page-clipboard.js`
- popup UI

Browser-specific differences should be expressed through:

- generated manifests;
- background environment configuration;
- tiny adapters only when live testing proves a real difference.

Do not fork the Pinterest detector or capture sanitizer per browser unless the DOM behavior truly differs.

## Known architectural debt

`content.js` is large because several Safari-specific reliability fixes accumulated during live debugging. It currently has strong locality: the entire copy pipeline can be traced in one file, and the working behavior is proven.

Do not split it merely to make files look cleaner. Split it only when:

1. Chromium and Firefox behavior has been validated;
2. stable interfaces between detector, UI, clipboard, and capture paths are known;
3. tests can protect the split from changing timing or trusted-click behavior.

Premature refactoring here can break the exact Safari event ordering that made the extension work.
