# Contributing

Pluck is small, but the browser behavior is not simple. Changes must preserve the trusted-click sequence, security boundaries, and host-page performance.

## Setup

Requirements:

- Node.js 20+
- npm
- macOS + Xcode for Safari testing

Run:

```bash
npm run ci
```

## Development principles

- Keep one shared WebExtension codebase.
- Prefer semantic Pinterest selectors over generated class names.
- Do not add full-page polling or subtree observers.
- Do not add network activity before the user clicks Copy.
- Do not broaden host permissions casually.
- Treat the MAIN-world clipboard call as timing-critical.
- Prefer a clean failure over a contaminated clipboard image.
- Add a regression test for every reproduced bug.
- Keep diagnostics off and cheap in normal use.

## Pull requests

A pull request should explain:

1. the user-visible problem;
2. the exact runtime stage affected;
3. why the chosen fix is smaller and safer than alternatives;
4. tests added;
5. browsers tested live;
6. performance impact;
7. permission/privacy impact.

## Required checks

```bash
npm run validate
npm test
npm run build
```

For runtime changes, also complete the relevant manual browser matrix in `docs/RELEASE_CHECKLIST.md`.

## Pinterest DOM changes

When adding a selector:

- prefer `data-test-id`, role, aria label, stable link path, or structural relationship;
- do not depend only on generated classes;
- scope the selector to the selected Pin card;
- verify it does not hide the actual image;
- restore all temporary changes;
- include a fixture or source-level regression test.

## Performance changes

Any change to pointer, scroll, resize, MutationObserver, diagnostics, or overlay rendering requires a browser performance trace and review of `tests/performance.test.cjs`.

## Cross-browser work

Use `npm run build` to generate candidates. Do not claim a browser is supported until the live matrix in `docs/BROWSER_PORTING.md` passes.

Browser-specific code should be isolated only after a reproducible difference is proven.

## Commit style

Use clear imperative commit messages, for example:

```text
fix: remove persistent last-visited overlay before capture
perf: avoid document-wide mutation observation
ci: package browser targets on tagged releases
```
