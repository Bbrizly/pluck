# CI/CD and Release Engineering

Pluck's automation has three jobs:

1. prove the repository is internally consistent;
2. produce reviewable browser packages and a GitHub Release, always, for free;
3. submit that release to each browser store automatically, but only once you've done that store's one-time manual setup and added its credentials as a repo secret.

Store publication (job 3) is opt-in per store: every step in `publish-stores` checks for its own secrets first and logs a skip message instead of failing if they're absent. See [`docs/STORE_PUBLISHING.md`](STORE_PUBLISHING.md) for the setup each store needs before its step does anything. Safari is not part of this automation — it needs a paid Apple Developer account and stays a manual release for now.

## Workflow overview

```text
Push / Pull Request
        │
        ▼
.github/workflows/ci.yml
        ├─ validate manifest, versions, permissions and syntax
        ├─ run all tests
        ├─ build Safari, Chromium and Firefox candidates
        ├─ package ZIP archives
        └─ upload CI artifacts

Tag vX.Y.Z
        │
        ▼
.github/workflows/release.yml
  job: release
        ├─ verify tag matches package + manifest version
        ├─ run full CI
        ├─ create browser ZIPs
        ├─ create GitHub Release with artifacts
        └─ upload ZIPs as a workflow artifact for the next job
  job: publish-stores (needs: release)
        ├─ Chrome Web Store  — skips unless CHROME_* secrets are set
        ├─ Edge Add-ons      — skips unless EDGE_* secrets are set
        └─ Firefox AMO       — skips unless FIREFOX_API_* secrets are set
```

## Local CI parity

Before pushing:

```bash
npm run ci
npm run package:all
```

`npm run ci` runs:

1. `npm run validate`
2. `npm test`
3. `npm run build`

The release package command rebuilds all targets before zipping them.

## Validation responsibilities

`scripts/validate.mjs` checks:

- `package.json` and `extension/manifest.json` versions match;
- Manifest V3 remains enabled;
- `<all_urls>` is absent;
- optional image permission is still exactly `https://i.pinimg.com/*`;
- all extension JavaScript parses with `node --check`;
- all shell scripts parse with `bash -n`;
- required maintainer documentation exists.

The validator is deliberately simple and dependency-free. If a more advanced linter is added later, keep this baseline because it catches broken release metadata without downloading tooling.

## Test responsibilities

The Node test suite protects:

- URL allowlisting;
- `srcset` ranking;
- fail-closed message contracts;
- clipboard bridge behavior;
- trusted-click requirements;
- background fetch restrictions;
- overlay sanitation rules;
- known scrolling-performance regressions.

No CI test can fully prove Safari's real clipboard, permission sheet, Retina screenshot scale, or live Pinterest DOM. The manual release checklist remains mandatory.

## Generated artifacts

`npm run package:all` produces:

```text
releases/pluck-safari-<version>.zip
releases/pluck-chromium-<version>.zip
releases/pluck-firefox-<version>.zip
```

Each archive has `manifest.json` at its root.

The Safari ZIP is the WebExtension source package. Local Xcode development still uses `scripts/package-safari.sh`. Public Safari distribution can use Apple's current WebExtension packaging/App Store Connect flow.

## Versioning

Pluck uses semantic versioning:

- **Patch**: bug fix, Pinterest selector adjustment, performance fix, diagnostics improvement.
- **Minor**: new supported Pinterest surface, meaningful user feature, newly certified browser.
- **Major**: permission model, copy interaction, or architectural compatibility break.

The version must match in:

```text
package.json
extension/manifest.json
```

Runtime version strings inside `content.js` and `page-clipboard.js` should also be updated when the extension package changes. They are used for duplicate-instance isolation and diagnostics, so treat them as functional state rather than cosmetic text.

## Cutting a GitHub release

1. Update versions and runtime version markers.
2. Update `CHANGELOG.md`.
3. Run the full manual test matrix.
4. Run:

```bash
npm run ci
npm run package:all
```

5. Commit the release changes.
6. Tag:

```bash
git tag -a v0.8.0 -m "Pluck v0.8.0"
git push origin main --tags
```

7. GitHub Actions validates the tag and creates the release.

If the tag version does not equal `package.json`, the release workflow fails.

## Store publication strategy

`publish-stores` (see the workflow diagram above) submits Chrome, Edge, and Firefox automatically once each store's one-time manual setup is done and its credentials are added as GitHub secrets. Full setup steps, exact secret names, and costs per store live in [`docs/STORE_PUBLISHING.md`](STORE_PUBLISHING.md) — this section only covers what isn't already there.

Before turning Chrome/Edge on for real users, use their private/trusted-tester and unlisted rollout stages manually at least once — `publish-stores` always publishes to whatever visibility the listing is currently set to; it does not manage staged rollout for you.

## Brave and Opera

Both install Chromium-compatible extensions from the Chrome Web Store (Brave) or their own review channel (Opera). Test the Chrome listing directly in Brave; submit to Opera Add-ons separately if that listing is worth maintaining. Neither has its own automation — they ride on the Chrome Web Store publish or stay manual.

## Safari / App Store Connect

Not part of `publish-stores` — Safari needs a paid Apple Developer account first. The current local path uses Xcode packaging and signing (`scripts/package-safari.sh`). Once that account exists, the natural next job is:

```text
upload-safari-testflight
  needs: release
  runs-on: macos
  environment: production
  requires: Apple Developer Program membership, App Store Connect API key
```

It should upload and validate first, and publish/release only through a separate explicit action — Safari review and staged rollout are slower and less reversible than the Chromium/Firefox stores. Apple signing credentials and App Store Connect keys must live in repository secrets, never in source.

## Secrets policy

Never commit:

- Chrome Web Store OAuth client secret or refresh token (`CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`);
- Edge Add-ons client secret (`EDGE_CLIENT_SECRET`);
- AMO API secret (`FIREFOX_API_SECRET`);
- App Store Connect API keys;
- Apple signing certificates or provisioning profiles;
- store product/item IDs that are meant to remain private;
- private keys or `.p12` files.

All of the above belong in GitHub repo secrets (**Settings → Secrets and variables → Actions**) — see [`docs/STORE_PUBLISHING.md`](STORE_PUBLISHING.md) for exactly which names each store needs. If rollout ever needs a manual-approval gate before a store step runs, move that step into a GitHub Environment with required reviewers; none of the current stores are set up with one, so every secret that's present fires automatically on tag push.

## Rollback

A browser extension rollback is not identical to a server rollback. Stores generally distribute the highest accepted version.

Preferred response to a bad release:

1. stop staged rollout where supported;
2. mark the listing unavailable if the bug is severe;
3. fix forward with a higher patch version;
4. preserve the failed artifact and incident notes;
5. add a regression test.

Never reuse an already published version number.

## Release evidence

Attach or archive:

- CI run URL;
- test output;
- browser package checksums;
- manual test checklist;
- screenshots from clipboard verification;
- performance trace for changed hot-path code;
- reviewer notes and permission explanations.

The build being green is necessary, not sufficient. Live browser evidence is part of the release.
