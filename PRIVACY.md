# Privacy

Pin Copy is designed to work locally.

## Data Pin Copy does not collect

Pin Copy does not collect, transmit, sell, or store:

- Pinterest account information;
- Pin URLs;
- image URLs as history;
- copied images;
- clipboard contents;
- browsing history;
- search queries;
- board names;
- user identifiers;
- device identifiers;
- analytics or telemetry;
- crash reports sent to the developer.

## Local settings

Pin Copy stores a small number of settings in the browser's local extension storage:

- whether the extension is enabled;
- whether diagnostics are visible;
- whether higher-quality mode is enabled;
- diagnostic records of whether an optional image-host request or fetch succeeded.

These values remain on the user's device unless the browser itself synchronizes extension storage. Pin Copy does not operate a server that receives them.

## Network requests

Pin Copy makes no developer-controlled network requests.

When the user explicitly clicks Copy and higher-quality mode is enabled, the extension may request the selected image from:

```text
https://i.pinimg.com/
```

The request:

- is initiated only for the selected image;
- omits credentials;
- omits the page referrer;
- is not stored by Pin Copy after the copy operation.

When this path is unavailable, Pin Copy uses the already-loaded image or a local visible-tab capture fallback.

## Clipboard

Pin Copy writes a PNG image to the clipboard after a user click.

It does not read existing clipboard contents.

## Diagnostics

Diagnostics are off by default. When enabled, the panel displays local runtime stages and error codes. Diagnostic output is not transmitted to the developer.

## Changes

If future versions add analytics, remote logging, accounts, cloud processing, or any developer-controlled network service, this document and store disclosures must be updated before release.
