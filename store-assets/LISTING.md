# Pluck Pins — Store Listing Copy

Paste-ready text for Chrome Web Store, Edge Add-ons, Firefox AMO, and the Apple App Store.
Privacy policy URL (required by every store): **https://bbrizly.github.io/pluck/privacy.html**

---

## Name
Pluck Pins

## Category
Productivity

## Short description (≤132 chars — Chrome/Edge)
Copy the Pinterest image under your pointer without opening the Pin. Hover, click Copy, paste a clean PNG anywhere.

## Summary (one line — AMO/Apple)
Hover a pin, click Copy, paste a clean PNG anywhere. No account, no server, no analytics.

## Long description
Pluck copies a Pinterest feed image straight to your clipboard without ever opening the Pin.

Hover a still image, click Copy, and paste a clean PNG into Messages, Slack, Figma, ChatGPT, or anything else that reads images from the clipboard. You stay in the feed instead of taking the open-Pin, copy, go-back detour.

What it does:
- Adds a small Copy button to still images in the home feed, search results, and boards.
- Carousel pins copy the slide that is actually visible. Video pins are skipped.
- Optional higher-quality mode fetches a larger image when the page exposes one (off by default).
- Strips Pinterest hover UI before capture, so you never paste junk.

What it never does:
- No account, no server, no analytics, no telemetry.
- Never reads your clipboard.
- Runs only on Pinterest domains.

---

## Single purpose (Chrome "single purpose" field)
Copy a Pinterest feed image to the clipboard.

## Permission justifications (Chrome/Edge ask per permission)

| Permission | Justification |
|---|---|
| `clipboardWrite` | Write the copied image to the clipboard when the user clicks Copy. |
| `activeTab` | Access the current Pinterest tab only when the user clicks Copy. |
| `scripting` | Inject the clipboard bridge to capture the image under the pointer. |
| `storage` | Save local on/off, diagnostics, and higher-quality toggles on the user's device. |
| Host: `*.pinterest.com`, `*.pinterest.ca` | The extension runs only on Pinterest, where the feed images live. |
| Optional host: `i.pinimg.com` | Fetch a higher-resolution version of the selected image, only when the user enables higher-quality mode. |

## Data collection disclosure
Does NOT collect any user data. No accounts, no analytics, no telemetry, no clipboard reads, no developer-controlled network requests. The only network call is an optional image fetch from i.pinimg.com when the user turns on higher-quality mode (no credentials, no referrer, not stored).

Apple App Privacy questionnaire: answer "Data Not Collected" for every category.

---

## Screenshots needed
- Chrome/Edge: 1280×800 or 640×400 PNG. 3–4 shots: Copy button on a feed pin, the popup toggles, a paste result.
- Firefox: same shots, any reasonable size.
- Apple macOS: 1280×800 or larger. iOS: per device size if publishing the iOS app.

## Support / homepage URL
https://bbrizly.github.io/pluck/

## Source repository
https://github.com/Bbrizly/pluck
