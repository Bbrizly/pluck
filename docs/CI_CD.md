# CI/CD and Release Engineering

Pin Copy's automation has two jobs:

1. prove the repository is internally consistent;
2. produce reviewable browser packages without silently publishing them.

Automatic store publication is intentionally not enabled yet. Browser stores require credentials, policy declarations, screenshots, reviewer notes, staged rollout decisions, and sometimes manual approval. The repository creates deterministic artifacts and a GitHub Release; store submission remains an explicit release decision.

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
        ├─ verify tag matches package + manifest version
        ├─ run full CI
        ├─ create browser ZIPs
        └─ create GitHub Release with artifacts
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
releases/pin-copy-safari-<version>.zip
releases/pin-copy-chromium-<version>.zip
releases/pin-copy-firefox-<version>.zip
```

Each archive has `manifest.json` at its root.

The Safari ZIP is the WebExtension source package. Local Xcode development still uses `scripts/package-safari.sh`. Public Safari distribution can use Apple's current WebExtension packaging/App Store Connect flow.

## Versioning

Pin Copy uses semantic versioning:

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
git tag -a v0.8.0 -m "Pin Copy v0.8.0"
git push origin main --tags
```

7. GitHub Actions validates the tag and creates the release.

If the tag version does not equal `package.json`, the release workflow fails.

## Store publication strategy

## Chrome Web Store

Chrome accepts a ZIP containing the extension files with `manifest.json` at the root. The Chrome Web Store API can later automate upload and publication.

Recommended rollout:

1. upload `pin-copy-chromium-<version>.zip`;
2. use private/trusted testers;
3. move to unlisted;
4. move to public after telemetry-free manual validation and support readiness.

Do not automatically publish every Git tag to the public store. Package creation and public rollout should be separate controls.

## Microsoft Edge Add-ons

Use the Chromium ZIP. Edge documents Chrome extension porting as mostly compatible, but submit it as a separate store item and validate browser behavior first.

Initial releases should be manual. Add automation only after the Edge product ID and credentials are stable.

## Brave

Brave users can install Chromium-compatible extensions from the Chrome Web Store. Test the Chrome listing directly in Brave. A separate Brave store deployment is not required.

## Firefox / AMO

Firefox release and beta builds require signed add-ons. Mozilla supports public AMO listings and signed self-distribution.

Before automated signing:

- set a permanent `FIREFOX_EXTENSION_ID`;
- validate the generated Firefox manifest;
- test the background-document environment;
- decide public listing versus self-distribution;
- create AMO API credentials.

Do not rotate the Firefox extension ID after release; it identifies the installed add-on and its update path.

## Safari / App Store Connect

Safari requires Apple distribution setup. The current local path uses Xcode packaging and signing.

A future production pipeline may use:

- App Store Connect WebExtension ZIP packaging;
- Xcode archive upload;
- TestFlight for staged validation;
- App Store release after review.

Apple signing credentials and App Store Connect keys must live in repository secrets, never in source.

## Opera

Use the Chromium candidate as the starting package. Opera has its own add-on review and acceptance criteria. Keep submission manual until the value of maintaining a separate listing is proven.

## Secrets policy

Never commit:

- Chrome Web Store OAuth refresh tokens;
- AMO JWT issuer/secret;
- App Store Connect API keys;
- Apple signing certificates or provisioning profiles;
- store product IDs that are meant to remain private;
- private keys or `.p12` files.

Use GitHub Environments to separate:

```text
staging
production
```

Require manual approval for the production environment.

## Recommended future deployment jobs

Only add these after the relevant browser port is certified:

```text
publish-chrome
  needs: release
  environment: production
  input: explicit workflow_dispatch approval

sign-firefox
  needs: release
  environment: production
  output: signed XPI

upload-safari-testflight
  needs: release
  runs-on: macos
  environment: production
```

Each job should upload first and publish/release only through a separate explicit action.

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
