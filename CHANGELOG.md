# Changelog

All notable changes are documented here.

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
