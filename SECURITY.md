# Security policy

Hindsight handles Google OAuth grants, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Instead, report it privately through GitHub: **Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and the impact you expect. You should get a reply within a few days. Once a fix is released, you'll be credited if you'd like to be.

## Scope

In scope:

- The application code in this repository
- The hosted instance at `hindsight-youtube-catalog-analytics.vercel.app`

Out of scope:

- Self-hosted deployments run by other people (report those to their operator)
- Denial-of-service and volumetric attacks
- Vulnerabilities in Google, YouTube or Vercel themselves

## How Hindsight protects your data

- Read-only YouTube scope (`youtube.readonly`).
- Refresh tokens are sealed with AES-256-GCM in `httpOnly` cookies. They're never stored server-side, sent to the browser in readable form, or logged.
- Every data request re-checks that the channel belongs to the caller's session.
- Per-IP rate limits, cross-site request refusal, strict CSP, and formula-safe CSV exports.
