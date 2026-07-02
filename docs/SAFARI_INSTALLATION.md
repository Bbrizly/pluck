# Safari Installation and Local Development

This is the exact local-development path for macOS Safari.

## Requirements

- macOS
- Safari
- Xcode with command-line components installed
- Node.js 20 or newer for tests and build scripts
- at least 15–20 GB of free disk space recommended for Xcode

## 1. Validate the repository

From the repository root:

```bash
npm run ci
```

This validates source syntax, manifest permissions, versions, documentation, tests, and generated browser targets.

## 2. Generate the Safari Xcode wrapper

Use a stable local bundle identifier you control:

```bash
chmod +x scripts/package-safari.sh
BUNDLE_ID="com.yourname.pincopy.dev" ./scripts/package-safari.sh
```

The script:

1. locates Apple's current Safari Web Extension packager or older converter;
2. converts `extension/` into a native Xcode wrapper;
3. writes it to `safari-app/`;
4. opens the generated Xcode project.

For non-interactive use:

```bash
NO_OPEN=1 BUNDLE_ID="com.yourname.pincopy.dev" ./scripts/package-safari.sh
```

## 3. Configure Xcode

For both the main app target and extension target:

```text
Team: None
Signing Certificate: Sign to Run Locally
```

When local signing is unavailable, add your Apple Account in Xcode and use your Personal Team for both targets.

Select:

```text
Scheme: Pin Copy
Destination: My Mac
```

Press **Command + R**.

## 4. Enable Safari developer options

In Safari:

```text
Safari → Settings → Advanced → Show features for web developers
```

For unsigned local builds, enable **Allow Unsigned Extensions** in Safari's developer settings/menu when your Safari version exposes it.

## 5. Enable Pin Copy

Open:

```text
Safari → Settings → Extensions
```

Enable the new Pin Copy extension and allow access to Pinterest.

Disable every older local Pin Copy build. Multiple local bundle IDs can leave multiple content scripts running and produce duplicate buttons, diagnostics, or performance regressions.

Quit and reopen Safari after removing old builds, then reload Pinterest.

## 6. Test

Use Pinterest Home, search results, or a board.

1. Hover a still image.
2. Click **Copy**.
3. Open Preview.
4. Choose **File → New from Clipboard**.

Preview is the cleanest way to inspect the raw clipboard image.

Test both modes:

### Reliable mode

Leave **Prefer higher-quality image first** off.

Expected success source:

- already-loaded Pinterest image; or
- sanitized visible screen crop.

### Higher-quality mode

Enable **Prefer higher-quality image first** in the toolbar popup.

Safari may request access to `i.pinimg.com`. If the request fails or Safari misreports it, the extension must fall back automatically.

## Diagnostics

Enable **Show diagnostics** temporarily.

The panel should show:

```text
Pin Copy diagnostics v0.8.0
Instances  1 active controller
```

Key stages include:

```text
Clipboard bridge ready
Eligible image detected
Main-page clipboard request opened
Image fetched / loaded image attempted / capture sanitized
PNG encoded
Success: PNG is on clipboard
```

Turn diagnostics off for normal performance testing.

## Common problems

## Xcode says “No space left on device”

This is not a Pin Copy source error. Clear generated Xcode and simulator data after closing Xcode and Simulator:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/*
xcrun simctl shutdown all
xcrun simctl delete unavailable
```

Inspect simulator storage:

```bash
du -sh ~/Library/Developer/CoreSimulator
```

Do not delete simulator data you need without understanding the impact.

## Extension appears but no Copy button

Check:

- only one Pin Copy build is enabled;
- Pinterest access is allowed;
- you are on Home, search, or a board;
- the target is a still image, not video;
- the image is at least 120 px in both rendered dimensions;
- Pin Copy is enabled in its popup;
- the Pinterest tab was reloaded after enabling the extension.

Enable diagnostics to see the rejection reason.

## Copy says the clipboard bridge is not ready

Reload Pinterest after the new extension build is enabled. The bridge loads at `document_start`, so an already-open tab may still be running an older page context.

## Higher-quality fetch fails

That path is optional. Confirm the fallback still works.

The popup permission request is advisory; the real fetch result is authoritative. The extension must never remain stuck in an “Allow access” loop.

## Copied output contains Pinterest UI

Confirm you are running v0.8.0 only. Test in Preview.

If the screenshot fallback contains UI:

- capture a screenshot of the dirty clipboard result;
- inspect the Pin card DOM;
- identify the overlay with a semantic attribute such as `data-test-id`;
- add it to the persistent-overlay sanitizer;
- add a regression test.

Do not add generated Pinterest class names as the only selector.

## Scrolling feels slow

Disable diagnostics and every older extension build, quit Safari, reopen it, and reload the page.

A content script from an older enabled extension continues running even if its visible UI is removed. Pin Copy v0.8 cannot unregister another extension's listeners.

If the problem remains, record a Safari Web Inspector Timeline while scrolling and inspect:

- scripting time;
- style recalculation;
- layout;
- paint/compositing;
- MutationObserver callbacks.

## Clean rebuild

```bash
npm run clean
npm run ci
BUNDLE_ID="com.yourname.pincopy.dev" ./scripts/package-safari.sh
```

If Safari caches a damaged local build, use a new development bundle identifier once, disable the old extension, and restart Safari.
