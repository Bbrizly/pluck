# Store Asset Checklist

The repository intentionally does not fabricate final branding. Before public distribution, create and review assets for every store.

## Extension package icons

Prepare a neutral, non-Pinterest-branded icon set. Do not use Pinterest's logo or imply affiliation.

Common sizes to prepare:

```text
16×16
19×19
32×32
38×38
48×48
64×64
96×96
128×128
256×256
512×512
1024×1024
```

Use only the sizes required by each browser and store in the final manifest/package.

## Listing screenshots

Capture real product behavior:

1. Pinterest feed before hover.
2. Copy button on a still image.
3. `Copied` success state.
4. Toolbar settings.
5. Clean pasted image in Preview or a design app.

Do not show diagnostics in public marketing screenshots.

## Listing copy

The listing must accurately state:

- Pinterest-only scope;
- Safari/browser support;
- one-click clipboard behavior;
- video exclusion;
- optional higher-quality mode;
- local-only processing;
- no affiliation with Pinterest.

Avoid claiming guaranteed original resolution.

## Reviewer notes

Explain:

- why Pinterest page access is needed;
- why `i.pinimg.com` is optional;
- why `activeTab` is used for visible-tab fallback;
- why `scripting` is used for the trusted clipboard bridge;
- that no data is sent to the developer;
- how to reproduce the feature on Home/search/boards.

## Legal/product decisions before public release

- [ ] Choose repository license.
- [ ] Choose final product name.
- [ ] Complete trademark review.
- [ ] Add non-affiliation statement.
- [ ] Review Pinterest's current terms and policies.
- [ ] Review each extension store's current policies.
- [ ] Decide support email and website.
- [ ] Publish privacy policy.
