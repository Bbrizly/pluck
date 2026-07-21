# Changelog

All notable changes are documented here.

## 0.8.3

### Icon

- New icon: a white feather inside capture brackets on a purple circle. The old one borrowed Pinterest's mark, which is not ours to use. Apple rejected the Mac App Store build over it (guideline 4.1(b)).
- Icon source is `store-assets/icon-master.png`. Every size is generated from it, so edit that one file and regenerate.

### Colour

- The Copy button, the popup toggles, and the website now use the icon's purple instead of Pinterest's red. The button no longer looks like Pinterest's own Save button sitting next to it.

## 0.8.2

### Copy button

- Matched the hover Copy button to Pinterest's look: red pill, white bold label, darker red on hover.

## 0.8.1

### Reliability

- Answered Pinterest messages the way Chrome requires, so the higher-quality fetch and the screen-crop fallback work on Chrome, not just Firefox.
- Added a test that fails if the background script ever drops back to the Firefox-only reply style.

### Popup

- Moved Diagnostics to a button and only show the technical status line when it is on.
- Replaced the confusing help text with a caption that explains the higher-quality toggle.

## 0.8.0

### Performance

- Removed full Pinterest subtree observation.
- Moved target resolution from every pointer movement to pointer element transitions.
- Hid overlay during scroll and added one debounced idle check.
- Eliminated hidden diagnostics DOM writes and console logging.
- Removed fixed-element backdrop blur.
- Avoided continuous scroll-time overlay repositioning.
- Added performance regression tests.

### Reliability

- Preserved higher-quality, loaded-image, and sanitized capture paths.
- Preserved explicit **Last visited** overlay removal.
- Preserved duplicate-build isolation and cleanup.

## 0.7.1

- Explicitly removed persistent Pinterest **Last visited** overlays.
- Expanded capture sanitation to the outer Pin wrapper.
- Added post-settle persistent-overlay verification.
- Failed cleanly when a persistent overlay remained visible.

## 0.7.0

- Sanitized Pinterest hover UI before screenshot fallback.
- Added transparent hover shield and transition wait.
- Added versioned diagnostics and overlay roots.

## 0.6.0

- Added higher-quality mode toggle.
- Made higher-quality mode optional and fallback-safe.
- Switched background image-byte transport to base64 for Safari reliability.
- Added stale UI cleanup and singleton protection.

## 0.5.0

- Added loaded-image and visible-tab crop fallbacks.
- Stopped treating permission-status APIs as hard gates.

## 0.4.x

- Added deterministic MAIN-world bridge bootstrap and readiness handshake.
- Added optional image-host permission request flow.

## 0.3.x

- Added promise-backed MAIN-world clipboard bridge tied to the original physical click.

## 0.2.0

- Fixed overly strict Pinterest target detection.
- Added visible diagnostics.

## 0.1.0

- Initial Safari WebExtension implementation.
