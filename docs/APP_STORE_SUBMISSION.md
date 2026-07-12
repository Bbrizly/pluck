# Pluck: Mac App Store submission runbook

First-time submission, written 2026-07-11 for the new Apple Individual account.
Everything scripted is done. The Apple-side steps below are yours, ~30-45 min.

## Decisions locked here

- **macOS only for v1.** The converter can also emit an iOS app, but Pluck's
  core interaction is hover, which does not exist on touch. Ship Mac first.
  iOS is a later product change (tap-to-reveal), not a packaging flag.
- **Bundle id: `com.bbrizly.pluck`.** App target gets it, the extension
  target gets `com.bbrizly.pluck.extension` (the converter appends it).
- **App name on the store: "Pluck".** Do not put "Pinterest" in the app
  name or subtitle. Third-party trademarks in the name field are a common
  first-submission rejection. Compatibility wording ("works on Pinterest")
  belongs in the description and is fine there.
- **Price: free.**

## Known converter warning, safe to ignore

`manifest.json` declares a `"world": "MAIN"` content script. Safari does not
support `world` in the manifest (only via the scripting API), so the
converter or Xcode may warn about it. This is fine: the code self-heals.
`content.js` probes for the bridge and, when it is missing, background.js
injects `page-clipboard.js` with `scripting.executeScript({world: "MAIN"})`,
which Safari supports (16.4+). Test step 6 proves it.

## Steps

1. Validate and generate the Xcode project:

   ```bash
   npm run ci
   NO_OPEN=1 BUNDLE_ID="com.bbrizly.pluck" ./scripts/package-safari.sh
   open safari-app/*/*.xcodeproj
   ```

2. In Xcode, for BOTH targets (Pluck app + Pluck Extension):
   - Signing & Capabilities: Team = your name (Individual), Automatically
     manage signing ON.
   - General: Version `0.8.2` (must match manifest), Build `1`.
   - App target only: App Category = Utilities.

3. Run once locally (Cmd+R), enable in Safari Settings > Extensions, and do
   the smoke test from `docs/SAFARI_INSTALLATION.md` step 6 (hover, Copy,
   paste in Preview). Do not archive a build you have not run.

4. Product > Archive. In Organizer: Distribute App > App Store Connect >
   Upload. Accept defaults.

5. appstoreconnect.apple.com > My Apps > "+" > New App:
   - Platform macOS, Name `Pluck`, Language English (Canada),
     Bundle ID `com.bbrizly.pluck`, SKU `pluck`.
   - Paste metadata from the block below.
   - Screenshots: reuse the store set from `docs/STORE_ASSETS.md`. Mac
     accepted sizes: 1280x800, 1440x900, 2560x1600, or 2880x1800. Retake at
     one of those exact sizes if the Chrome set is a different resolution.
   - Privacy: Data Not Collected (matches PRIVACY.md). Privacy policy URL:
     the live privacy page on the Pluck site.
   - Pricing: Free, all territories.

6. Select the uploaded build, add the review notes below, Submit for Review.

## Paste-ready metadata

**Subtitle** (30 chars max): `Copy any image on hover`

**Description:**

Pluck puts a Copy button on every image as you browse Pinterest in Safari.
Hover, click, and the full image is on your clipboard as a clean PNG. No
opening pins, no drag-and-drop, no screenshots with UI baked in.

- One hover, one click, image copied
- Clean PNG output, Pinterest overlay UI stripped
- Optional higher-quality mode fetches the full-size original
- No account, no tracking, no data collection
- Everything runs locally in your browser

Pluck is an independent project and is not affiliated with or endorsed by
Pinterest.

**Keywords:** `pinterest,image,copy,clipboard,hover,save,png,safari,extension`

**Review notes:**

This is a Safari Web Extension. To test: enable Pluck in Safari Settings >
Extensions, allow access on pinterest.com, open pinterest.com (no account
needed for public search results), hover any still image, click the Copy
button, then paste into Preview (File > New from Clipboard). The extension
collects no data; see the bundled privacy policy.

## After approval

- Add the App Store badge/link to `index.html` beside the Chrome and
  Firefox links.
- `docs/STORE_PUBLISHING.md`: move Safari out of the "later" row.
- Future versions: bump manifest+package version, re-run the converter is
  NOT needed; update the `safari-app` project's resources by re-copying
  `extension/` (or re-run converter with `--rebuild-project`), archive,
  upload. First one manual, like every other store here.
