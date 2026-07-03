# Release Checklist

## Source and version

- [ ] `package.json` version updated.
- [ ] `extension/manifest.json` version updated.
- [ ] `CONTENT_VERSION` and versioned root IDs reviewed.
- [ ] `page-clipboard.js` install/ready version markers reviewed.
- [ ] `CHANGELOG.md` updated.
- [ ] No accidental generated Xcode or `dist/` files staged.

## Automated validation

```bash
npm run ci
npm run package:all
```

- [ ] Validation passes.
- [ ] Tests pass.
- [ ] Safari target generated.
- [ ] Chromium target generated.
- [ ] Firefox target generated.
- [ ] ZIP archives contain `manifest.json` at root.

## Safari manual matrix

- [ ] Only current build enabled.
- [ ] Safari restarted after disabling old builds.
- [ ] Home feed works.
- [ ] Search results work.
- [ ] Boards work.
- [ ] Standard still image works.
- [ ] Video Pin has no Copy button.
- [ ] Carousel copies visible image.
- [ ] Higher-quality mode off works.
- [ ] Higher-quality mode on works or falls back.
- [ ] Denied CDN permission still falls back.
- [ ] **Last visited** overlay is not copied.
- [ ] Save controls are not copied.
- [ ] Pluck UI is not copied.
- [ ] Diagnostics are off by default.
- [ ] Preview opens the raw clipboard image.
- [ ] ChatGPT paste works.
- [ ] One design/document app paste works.
- [ ] Fast scrolling feels unchanged.
- [ ] Diagnostics show one active controller.
- [ ] Capture cleanup leaves no temporary nodes.

## Cross-browser matrix for certified targets

For every browser claimed in release notes:

- [ ] Load package locally.
- [ ] Clipboard bridge initializes.
- [ ] Optional permission request tested.
- [ ] Direct image fetch tested.
- [ ] Loaded-image fallback tested.
- [ ] Capture fallback tested.
- [ ] Retina/device-scale crop checked.
- [ ] Browser restart behavior checked.
- [ ] Store validator passes.

## Privacy and permissions

- [ ] No `<all_urls>`.
- [ ] Pinterest match patterns remain intentional.
- [ ] Optional image host remains exact.
- [ ] No new storage keys contain content or identifiers.
- [ ] No analytics or remote logging added.
- [ ] Privacy document still matches runtime behavior.
- [ ] Store privacy answers updated if behavior changed.

## Security

- [ ] Background messages remain fail-closed.
- [ ] Fetch omits credentials.
- [ ] Redirect destination is revalidated.
- [ ] MIME and response limits remain enforced.
- [ ] No remote code.
- [ ] No secrets in repository or artifacts.
- [ ] MAIN-world bridge accepts only pending trusted-click request IDs.

## Performance

- [ ] No full-subtree observer.
- [ ] No polling.
- [ ] No network request before click.
- [ ] No per-Pin permanent UI.
- [ ] No geometry work in scroll handler.
- [ ] Diagnostics disabled during normal profile.
- [ ] Safari/target-browser performance recording reviewed for hot-path changes.

## Packaging and release

- [ ] Store icons and screenshots are final.
- [ ] Listing copy matches actual behavior.
- [ ] Reviewer notes explain permissions and fallbacks.
- [ ] Testers receive the exact release candidate.
- [ ] Staged/private rollout chosen before public rollout.
- [ ] Git tag matches package version.
- [ ] GitHub release artifacts and checksums preserved.

## Post-release

- [ ] Install the store-delivered version on a clean browser profile.
- [ ] Re-run the copy matrix.
- [ ] Confirm update path from previous version.
- [ ] Monitor support reports for Pinterest DOM changes.
- [ ] Fix forward with a new patch version; never reuse a published version.
