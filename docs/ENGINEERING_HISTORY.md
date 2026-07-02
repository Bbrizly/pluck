# Engineering History and Lessons

Pin Copy became reliable through live Safari debugging. This document records why unusual code exists so future maintainers do not “simplify” it back into a broken version.

## Initial design

The product was defined as:

```text
Pinterest only → Safari first → hover button → one click → PNG clipboard image
```

The first design was too large for the problem. It proposed many services and abstractions before the core Safari clipboard behavior had been proven.

Lesson: prove the hardest browser primitive before building the architecture around it.

## v0.1: source-complete, not browser-proven

The first implementation included detector, overlay, background fetch, popup, packaging, and tests.

It had not yet run against live Pinterest and Safari. Calling it finished would have been wrong; it was a complete first implementation.

## No hover UI

The first detector was too strict:

- it relied on Safari-fragile `instanceof HTMLImageElement` behavior;
- it required the image itself to sit inside a `/pin/` link.

Pinterest's card structure did not always match that assumption.

Fix:

- semantic image checks;
- broader Pin-context detection;
- visible diagnostics.

Lesson: DOM integrations need rejection reasons, not silent failure.

## Clipboard permission failure

Safari rejected `navigator.clipboard.write()` after asynchronous extension work.

Fix:

- MAIN-world bridge;
- capture the original trusted click;
- start a promise-backed PNG clipboard item synchronously;
- resolve image bytes later.

Lesson: transient user activation is an ordering constraint, not a permission checkbox.

## Bridge not ready

Dynamic `<script>` injection could be blocked or ignored.

Fix:

- manifest MAIN-world content script;
- `scripting.executeScript()` fallback;
- DOM injection only as final fallback;
- deterministic ready/probe handshake.

## Xcode module failures

A build produced Foundation, SafariServices, Objective-C, and Clang errors.

Root cause: the disk was full. Xcode could not write module caches.

Lesson: read the first concrete error. Downstream compiler failures were noise.

## `FETCH_FAILED` and permission loops

Safari CDN permission behavior was inconsistent. The extension incorrectly trusted `permissions.contains()` and kept showing “Allow access” after access was granted.

Fix:

- permission APIs became advisory;
- real fetch result became authoritative;
- lower copy paths always remained available.

Lesson: do not gate product behavior on a browser permission-status API when the actual operation can provide truth.

## `IMAGE_BYTES_MISSING`

Safari WebExtension messaging could serialize raw `ArrayBuffer` payloads incorrectly.

Fix: base64 transport for background-fetched image bytes.

Tradeoff: more memory and CPU, but a reliable boundary.

## Copy button and diagnostic panel appeared in output

The screen fallback captured UI before repaint or captured UI from another installed local build.

Fix:

- hide all known Pin Copy roots;
- wait for rendering;
- versioned roots and singleton guards;
- continuously remove stale roots from older builds.

Lesson: local bundle IDs create independent extensions. A new build cannot remove another extension's listeners.

## Pinterest hover UI appeared in output

Hiding Pin Copy UI was insufficient. Pinterest rendered its own dark scrim and Save controls when hovered.

Fix:

- sanitize the Pin card;
- hide overlay siblings and controls;
- remove pseudo-element scrims and filters;
- add a transparent full-window shield to move `:hover` away;
- wait for transitions before capture.

## **Last visited** overlay

The persistent overlay used:

```html
data-test-id="pin-card-last-visited-overlay"
```

It had `pointer-events: none`, so generic hit-testing missed it. It also lived higher in the card than the image's inner wrapper.

Fix:

- capture boundary expanded to the outer Pin wrapper;
- explicit persistent-overlay selectors;
- verification after the transition wait;
- fail rather than copy if the overlay remains visible.

Lesson: persistent overlays and hover overlays are different classes of problem.

## Scrolling slowdown

A page-wide `MutationObserver`, frequent pointer hit-testing, hidden diagnostic writes, fixed blur, and scroll-time repositioning made Pinterest feel slow.

Fix in v0.8:

- observe only direct `<html>` children;
- pointermove stores coordinates only;
- target inspection runs on pointerover transitions;
- overlay hides during scroll;
- one idle check after scroll;
- diagnostics perform no DOM work when disabled;
- no fixed backdrop blur;
- write-if-changed UI updates.

Lesson: browser extensions must treat host-page hot paths as production performance code.

## Current principles

1. One physical click, one visible image.
2. No feed scanning or prefetching.
3. MAIN-world clipboard call begins during the trusted click.
4. Direct image bytes are better than screen capture.
5. Screen capture is a last fallback and must be sanitized.
6. A clean failure is better than a dirty copied image.
7. Browser permissions are advisory; actual operations are truth.
8. Diagnostics must be cheap when disabled.
9. Old local builds must be disabled during testing.
10. Every real-world failure gets a regression test or explicit diagnostic state.
