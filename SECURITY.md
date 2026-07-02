# Security Policy

## Supported version

Security fixes are applied to the latest released version.

## Reporting a vulnerability

Do not publish an exploit or sensitive report in a public issue.

Before public release, configure a private security contact in the repository and extension-store listings. A useful report should include:

- affected version;
- browser and version;
- reproduction steps;
- impact;
- proof of concept that avoids exposing unrelated user data;
- recommended fix when known.

## Security boundaries

### Restricted hosts

Pinterest content scripts run only on configured Pinterest domains.

Optional image fetching is restricted to:

```text
https://i.pinimg.com/*
```

### Fail-closed privileged messages

The background fetch operation accepts one exact URL field and no method, headers, cookies, or batch inputs.

The visible-tab capture operation accepts no arbitrary URL or options and validates the sender is Pinterest.

### Network hardening

Image fetches:

- require HTTPS;
- reject embedded credentials;
- omit cookies and credentials;
- omit referrer;
- revalidate redirect destinations;
- allow only supported image MIME types;
- enforce response-size and timeout limits.

### Clipboard hardening

The MAIN-world bridge opens a clipboard request only after a trusted physical click inside an armed Pin Copy overlay.

The page cannot cause arbitrary writes merely by posting a message; a matching pending request ID must already exist.

### No remote code

Pin Copy does not download or execute remote JavaScript.

### No clipboard reading

Pin Copy requests write behavior only and never reads the existing clipboard.

## Threat model

Pin Copy assumes the Pinterest page may inspect or interfere with MAIN-world code. Security therefore relies on:

- exact message shapes;
- trusted-click gating;
- pending request IDs;
- host allowlists;
- background sender validation;
- no secrets in page-accessible code.

The MAIN-world bridge is not treated as a secret or trusted storage location.

## Maintainer requirements

Any change that broadens permissions, hosts, message shapes, stored data, or network destinations requires:

1. explicit security review;
2. updated tests;
3. updated privacy documentation;
4. updated store disclosures;
5. a clear user-facing reason.
