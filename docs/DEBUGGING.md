# Debugging Guide

Pluck has a staged pipeline. Debug the first stage that fails; do not randomly alter permissions, clipboard code, and DOM selectors at the same time.

## Stage map

```text
1. Content script loaded
2. Clipboard bridge ready
3. Hover target found
4. Target accepted
5. Copy overlay shown
6. Trusted click captured
7. PNG prepared
8. Clipboard promise resolved
9. Clipboard write completed
```

## Diagnostic panel

Enable **Show diagnostics** from the toolbar popup.

Expected baseline:

```text
Script      Loaded v0.8.0
Instances   1 active controller
Extension   Enabled
Copy        Clipboard bridge ready
```

Turn diagnostics off after debugging.

## No panel appears

Likely causes:

- content script was not injected;
- Pinterest host permission is missing;
- tab was open before the extension was enabled;
- wrong local extension build is active;
- multiple builds are conflicting.

Actions:

1. disable every old Pluck extension;
2. quit Safari;
3. reopen Safari;
4. enable one build;
5. reload Pinterest.

## Panel appears, no button

Read `Hover` and `Detection`.

Common reasons:

- pointer is over caption or controls rather than the image;
- image is too small;
- image host is not approved;
- video exists in the card;
- Pinterest markup changed and Pin context was not found.

Inspect the target in Web Inspector and prefer semantic attributes such as `data-test-id`, roles, and `/pin/` links over generated class names.

## `PAGE_CLIPBOARD_BRIDGE_NOT_READY`

The MAIN-world bridge did not initialize in the current tab.

Reload after enabling the current build. Inspect:

```js
document.documentElement.getAttribute("data-pluck-bridge")
```

Expected value starts with:

```text
ready-v80
```

## Clipboard request opens, then image preparation fails

The trusted-click problem is solved. Follow the image path error.

### High-quality errors

Examples:

- `IMAGE_ACCESS_BLOCKED`
- `FETCH_TIMEOUT`
- `HTTP_ERROR`
- `MIME_REJECTED`
- `RESPONSE_TOO_LARGE`
- `IMAGE_BYTES_MISSING`

Higher-quality failure must continue to the loaded-image and capture paths.

### Loaded-image errors

A cross-origin canvas may become tainted. This is expected and should continue to the capture fallback.

### Capture errors

Examples:

- `CAPTURE_SENDER_REJECTED`
- `CAPTURE_API_UNAVAILABLE`
- `CAPTURE_FAILED`
- `CAPTURE_RESULT_INVALID`
- `CAPTURE_PERSISTENT_OVERLAY_REMAINED`

A persistent-overlay error is safer than copying a dirty image.

## Clipboard succeeds but pasted image is dirty

Use Preview → File → New from Clipboard to inspect the exact clipboard image.

Identify whether the contamination is:

- Pluck UI;
- Pinterest hover UI;
- persistent Pinterest UI such as **Last visited**;
- a CSS pseudo-element scrim;
- an image brightness/filter change.

Inspect the Pin card DOM and add a semantic sanitizer rule plus a regression test.

Known persistent selectors include:

```css
[data-test-id="pin-card-last-visited-overlay"]
[data-test-id="contentLayer"]
[data-test-id*="last-visited" i]
[aria-label="Last visited"]
```

## Duplicate diagnostics or buttons

Check enabled extensions first. Different local bundle IDs are separate installed extensions.

The current page should have one active controller and two v0.8 roots.

In the page console:

```js
[...document.querySelectorAll(
  '[data-pluck-ui-root], [data-pluck-ui-version], #pluck-extension-root, #pluck-diagnostics-root'
)].map((node) => ({ id: node.id, version: node.getAttribute('data-pluck-ui-version') }));
```

Disable old builds and reload the page.

## Capture cleanup verification

After a copy attempt:

```js
document.querySelectorAll(
  '[data-pluck-capture-shield], [data-pluck-capture-path], [data-pluck-capture-image], #pluck-v80-capture-sanitizer'
).length
```

Expected:

```text
0
```

## Background inspection

Use the browser's extension/background inspection tools to look for:

- rejected sender URLs;
- permission errors;
- fetch failures;
- response MIME and size failures;
- capture API failures.

Do not log image bytes or user data.

## Useful bug report contents

- browser and version;
- macOS/OS version;
- Pluck version;
- Pinterest URL surface: Home, search, or board;
- higher-quality setting;
- diagnostics screenshot;
- exact error code;
- raw clipboard screenshot from Preview;
- whether old Pluck versions were disabled;
- reproducible Pin DOM excerpt when an overlay is involved;
- performance Timeline when the issue is scrolling.
