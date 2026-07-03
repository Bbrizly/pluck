# Store Publishing Playbook

How Pluck gets from a git tag to every browser's users, and what part is
automated versus what only you can do once per store.

## The two distribution channels

1. **GitHub Releases — automatic today, no accounts needed.** Pushing a tag
   like `v0.9.0` builds Safari, Chromium, and Firefox ZIPs and attaches them
   to a GitHub Release with checksums (`.github/workflows/release.yml`,
   `release` job). Anyone can download and sideload these immediately. This
   is the free, always-available fallback for every browser, including
   Safari, while store listings are pending or don't exist yet.
2. **Extension stores — automated after one-time manual setup per store.**
   The `publish-stores` job in the same workflow uploads the new version to
   Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons (AMO) on
   every tagged release, using API credentials stored as GitHub Actions
   secrets. Each step no-ops with a log message if its secrets aren't set, so
   you can turn stores on one at a time without breaking the others.

Safari is **not** in the automated store job. Public Safari distribution
requires a paid Apple Developer account ($99/year); `scripts/package-safari.sh`
and `dist/safari` stay ready for whenever that's worth it. Until then, Safari
users get the GitHub Release ZIP plus manual Xcode signing
([`docs/SAFARI_INSTALLATION.md`](SAFARI_INSTALLATION.md)).

## Cost per store

| Store | One-time/recurring cost | Automated here? |
|---|---|---|
| GitHub Releases | Free | Yes |
| Chrome Web Store | $5 one-time developer registration | Yes, after setup |
| Microsoft Edge Add-ons | Free | Yes, after setup |
| Firefox Add-ons (AMO) | Free | Yes, after setup |
| Safari (App Store or notarized) | $99/year Apple Developer Program | No — manual, later |

## Why the first submission to each store is always manual

Every store's API is designed for *updating an existing listing*, not
creating one from nothing. You must go through each store's web console once
to create the listing, upload the very first version, fill in the
description/icons/privacy answers, and (for Chrome and Edge) get back the
extension/product ID the automation needs. After that, the automation handles
every future version bump.

Use [`docs/STORE_ASSETS.md`](STORE_ASSETS.md) for icons/screenshots and
[`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) for the pre-submission
test matrix before any first listing.

---

## Chrome Web Store

1. Create/verify a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time).
2. `npm run build && npm run package:all`, then manually upload
   `releases/pluck-chromium-<version>.zip` as a new draft item and publish
   it once by hand. Note the **item ID** from its dashboard URL.
3. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project, enable the **Chrome Web Store API**, and create an OAuth 2.0
   Client ID of type **Desktop app**.
4. Generate a refresh token for that client once, locally:
   ```bash
   npx --yes chrome-webstore-upload-cli@3 --help
   ```
   Follow Google's standard OAuth "installed app" flow (visit the consent URL
   with your client ID and `https://www.googleapis.com/auth/chromewebstore`
   scope, approve, exchange the returned code for tokens) — the
   `chrome-webstore-upload-cli` README links a walkthrough. Save the
   `refresh_token` from that exchange.
5. Add these GitHub repo secrets (**Settings → Secrets and variables → Actions**):
   - `CHROME_EXTENSION_ID` — the item ID from step 2
   - `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` — from step 3
   - `CHROME_REFRESH_TOKEN` — from step 4

From the next tagged release onward, `publish-stores` uploads and publishes
automatically.

## Microsoft Edge Add-ons

1. Create/verify a [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge) developer account (free).
2. Manually create the listing and upload
   `releases/pluck-chromium-<version>.zip` once by hand (same package as
   Chrome — see [`docs/BROWSER_PORTING.md`](BROWSER_PORTING.md)). Note the
   **Product ID** from the listing.
3. In Partner Center, register an Azure AD application for API access under
   **Publisher settings → API access**; this gives you a client ID, client
   secret, and tenant-specific access-token URL.
4. Add these GitHub repo secrets:
   - `EDGE_PRODUCT_ID`
   - `EDGE_CLIENT_ID`, `EDGE_CLIENT_SECRET`
   - `EDGE_ACCESS_TOKEN_URL` (the `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token` URL Partner Center gives you)

`publish-stores` uploads the package via `scripts/publish-edge.mjs` and
submits it for review automatically on every tagged release. There's no
official Microsoft CLI for this, so that script talks to the
[Edge Add-ons submission API](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api)
directly.

## Firefox Add-ons (AMO)

1. Create/verify a [Firefox Add-on Developer account](https://addons.mozilla.org/developers/) (free).
2. Pick a stable extension ID you control, e.g. `pluck@yourdomain.example`,
   and keep it forever — see the warning in
   [`docs/BROWSER_PORTING.md`](BROWSER_PORTING.md#optional-extension-id).
3. Generate an API key/secret pair from **AMO Developer Hub → Manage API Keys**.
4. Add these GitHub repo secrets:
   - `FIREFOX_API_KEY`, `FIREFOX_API_SECRET` — from step 3
   - `FIREFOX_EXTENSION_ID` — the ID from step 2 (also embeds into the
     GitHub Release Firefox ZIP so it matches what AMO expects)

`publish-stores` runs Mozilla's own `web-ext sign --channel listed`, which
both signs and submits the listed (public) version to AMO on every tagged
release. The very first submission can go through this same command — AMO
does not require a manual first upload the way Chrome and Edge do — but you
still need the developer account and API keys from steps 1–3 first, and you
should do that first run locally so you can fill in the listing description,
screenshots, and privacy answers on addons.mozilla.org afterward.

---

## Rollout order

Match [`docs/BROWSER_PORTING.md`](BROWSER_PORTING.md#the-porting-sequence):
Chrome first, then Edge (same package), then Firefox, Safari whenever an
Apple Developer account exists. Don't set up all four stores' secrets in one
sitting — wire up one, ship a release, confirm `publish-stores` actually
published it, then move to the next.
