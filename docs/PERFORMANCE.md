# Performance Engineering

Pinterest is a worst-case environment for a careless DOM extension: an infinite masonry feed, image lazy-loading, virtualized cards, transforms, hover controls, and constant DOM mutation.

Pluck must be invisible to scrolling performance when idle.

## Performance budget

Normal browsing with diagnostics off should meet these design goals:

- no network work before Copy is clicked;
- no document-wide query on pointer movement or scrolling;
- no page-wide subtree observer;
- no permanent per-Pin controls;
- no geometry reads inside the scroll handler;
- no fixed-element blur;
- no hidden diagnostics DOM writes;
- one delayed target check after scroll settles.

## Hot paths

## Pointer movement

`pointermove` records only coordinates.

It must not call:

- `elementsFromPoint()`;
- `getBoundingClientRect()`;
- `getComputedStyle()`;
- `querySelectorAll()`;
- `requestAnimationFrame()` per movement.

Eligibility work is triggered by `pointerover`, which represents an element transition rather than every pixel of movement.

## Scrolling

The scroll handler:

1. hides the overlay;
2. clears the previous idle timer;
3. schedules one target check 110 ms after the latest scroll event.

It does not reposition the overlay while the page is moving.

## DOM mutation

The duplicate-build guard observes only direct `<html>` child additions because Pluck's own roots are direct children of `<html>`.

Never restore:

```js
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
```

Pinterest can generate thousands of descendant mutations during scrolling.

## Diagnostics

Diagnostics state may be updated in memory, but when disabled there must be:

- no Shadow DOM text updates;
- no console logging;
- no panel layout or paint.

## Overlay rendering

The Copy button uses:

- one fixed host;
- transform positioning;
- write-if-changed logic;
- `contain: layout style paint`;
- no `backdrop-filter`.

## Copy-time work

Expensive work is allowed after the user clicks because it is not in the scrolling hot path. It must still have bounds:

- 8-second fetch timeout;
- 25 MB response limit;
- 60-megapixel decoded image limit;
- cleanup of bitmaps, object URLs, styles, and temporary DOM nodes.

## Regression tests

`tests/performance.test.cjs` asserts source-level invariants for known failures.

These tests do not measure frames per second. They prevent the exact architectural mistakes that caused the v0.7 scrolling regression.

## Manual profiling

In Safari Web Inspector:

1. turn diagnostics off;
2. open a dense Pinterest search feed;
3. begin a Timeline recording;
4. scroll continuously for 10–15 seconds;
5. stop recording;
6. inspect scripting, layout, and paint spikes.

Compare:

- Pluck disabled;
- Pluck enabled, diagnostics off;
- Pluck enabled, diagnostics on.

A meaningful regression is one that is visible in both the trace and the scrolling experience.

## Performance change checklist

Before merging a runtime change:

- [ ] No new global polling.
- [ ] No full-subtree observer.
- [ ] No network work on hover.
- [ ] No per-Pin injected controls.
- [ ] No geometry reads in scroll handler.
- [ ] No console logs while diagnostics are off.
- [ ] No blur on fixed UI.
- [ ] Temporary capture DOM is always removed.
- [ ] Older local extension versions are disabled during comparison.
- [ ] `npm test` passes.
- [ ] Safari Timeline was checked for hot-path changes.
