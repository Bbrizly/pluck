# Pin Copy

Copy a Pinterest feed image to the clipboard without opening the Pin.

Hover a still image, click **Copy**, paste it into Messages, Slack, Figma, ChatGPT, or anything else that accepts PNG from the clipboard. No account, no server, no analytics.

**v0.8.0** — Safari on macOS is the working target. The repo also builds Chromium and Firefox packages from the same source; those still need live browser testing before I'd call them supported.

## Why I built this

Pinterest's default flow for grabbing a reference image is:

```text
open pin → copy or save → back to feed → repeat
```

I wanted:

```text
hover → copy → paste
```

## What works today

- A small **Copy** button on still images in the home feed, search results, and boards
- Carousel pins copy the slide that's actually visible
- Video pins are skipped
- PNG on the system clipboard
- Optional higher-res fetch from `i.pinimg.com` when the page exposes a larger URL (off by default)
- Fallback to the loaded `<img>`, then a cropped visible-tab screenshot if canvas extraction is blocked
- Screenshot path strips Pinterest hover UI — Save button, dark scrim, **Last visited** chip — before capture
- Diagnostics mode to see which stage of the pipeline succeeded or failed

## What it avoids on purpose

Pinterest's feed is a constantly mutating masonry grid. Pin Copy does not:

- observe the whole document subtree;
- rescan the page on a timer;
- prefetch images before you click Copy;
- read the clipboard;
- talk to a backend.

Pointer movement only stores coordinates. Image detection runs when the pointer enters a new element. The overlay hides while you're scrolling and does one debounced check after scroll settles.

## Copy pipeline

Safari will reject `navigator.clipboard.write()` if it isn't tied to the original physical click. That's why the extension uses a MAIN-world bridge: the click opens the clipboard write synchronously, and the extension resolves the PNG bytes afterward.

```text
trusted click on Copy button
        │
        ▼
MAIN-world bridge starts clipboard.write(PNG promise)
        │
        ▼
optional: fetch largest exposed i.pinimg.com URL
        │ fail
        ▼
draw the loaded <img> to canvas
        │ tainted / blocked
        ▼
hide Pin Copy UI, strip Pinterest overlays
        │
        ▼
capture visible tab → crop to image bounds → PNG
        │
        ▼
resolve clipboard promise
```

The weird-looking reliability code exists because each of those stages broke in Safari at least once. See [`docs/ENGINEERING_HISTORY.md`](docs/ENGINEERING_HISTORY.md) before "simplifying" anything.

## Repository layout

```text
extension/          WebExtension source (shared across browsers)
  manifest.json     Safari-first MV3
  content.js        detection, overlay, copy pipeline
  page-clipboard.js MAIN-world clipboard bridge
  background.js     fetch, tab capture, bridge injection
  shared.js         URL validation, srcset ranking
  popup.html/js     settings and optional CDN permission
tests/              Node regression tests (48 at v0.8.0)
scripts/            validate, build, package, Safari wrapper
docs/               architecture, porting, CI, debugging
.github/workflows/  CI on push/PR; release on version tags
```

File-by-file detail: [`docs/CODEBASE_DEEP_DIVE.md`](docs/CODEBASE_DEEP_DIVE.md).

## Safari setup (macOS)

You need macOS, Safari, Xcode, and Node 20+.

```bash
npm run ci
chmod +x scripts/package-safari.sh
BUNDLE_ID="com.yourname.pincopy.dev" ./scripts/package-safari.sh
```

Then in Xcode: sign both targets for local development, select **My Mac**, **⌘R**. Enable the extension under **Safari → Settings → Extensions**, allow Pinterest access, reload Pinterest.

Step-by-step: [`docs/SAFARI_INSTALLATION.md`](docs/SAFARI_INSTALLATION.md).

## Developer commands

```bash
npm test             # unit and regression tests
npm run validate     # manifest, permissions, syntax, required docs
npm run build        # dist/safari, dist/chromium, dist/firefox
npm run package:all  # ZIPs under releases/
npm run ci           # validate + test + build (same as GitHub Actions core)
npm run clean        # remove dist/ and releases/
```

## Other browsers

One codebase, three generated packages. Don't fork six separate apps.

| Browser | Load from | Notes |
|---|---|---|
| Safari | `dist/safari` + Xcode wrapper | proven target |
| Chrome, Edge, Brave | `dist/chromium` | same package; separate store listings |
| Firefox | `dist/firefox` | different background manifest; needs signing |

```bash
npm run build
```

Porting checklist and test matrix: [`docs/BROWSER_PORTING.md`](docs/BROWSER_PORTING.md).

Suggested rollout order: Safari → Chrome → Edge/Brave → Firefox → Opera.

## Privacy and security

Pin Copy only touches Pinterest domains (plus optional `i.pinimg.com` for higher-quality mode). The background worker accepts exactly one validated image URL per fetch message — no general proxy, no `<all_urls>`, no credentials on fetch, no clipboard read.

Persistent settings are local booleans (enabled, diagnostics, higher-quality). Nothing is uploaded.

- [`PRIVACY.md`](PRIVACY.md)
- [`SECURITY.md`](SECURITY.md)

## CI

Push and PR runs validate, 48 tests, and builds all three browser targets. Packages upload as workflow artifacts.

Tag `v0.8.0` (must match `package.json`) triggers a GitHub Release with Safari, Chromium, and Firefox ZIPs plus checksums. Store submission is still manual — each platform wants its own screenshots, privacy answers, and review.

Details: [`docs/CI_CD.md`](docs/CI_CD.md).

## Documentation

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | worlds, messages, state, security boundaries |
| [CODEBASE_DEEP_DIVE.md](docs/CODEBASE_DEEP_DIVE.md) | every file, safe-change rules |
| [BROWSER_PORTING.md](docs/BROWSER_PORTING.md) | Chrome, Edge, Brave, Opera, Firefox |
| [SAFARI_INSTALLATION.md](docs/SAFARI_INSTALLATION.md) | local Xcode workflow |
| [DEBUGGING.md](docs/DEBUGGING.md) | tracing a failed copy |
| [PERFORMANCE.md](docs/PERFORMANCE.md) | scroll and detection model |
| [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | pre-ship manual matrix |
| [ENGINEERING_HISTORY.md](docs/ENGINEERING_HISTORY.md) | v0.1–v0.8 breakage log |
| [STORE_ASSETS.md](docs/STORE_ASSETS.md) | icons and listing assets |

## Known limits

- Screenshot fallback only captures the visible portion of a partially off-screen pin.
- Screenshot path is more fragile to Pinterest UI changes than direct byte extraction.
- A dirty clipboard image is worse than a clean failure — if an overlay can't be removed, the extension should fail rather than paste junk.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) — keep changes narrow, preserve the trusted-click sequence, add a regression test for every reproduced bug.

## License

No public license yet. Pick one deliberately before making the repo public.
