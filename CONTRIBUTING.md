# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Getting started

You need Node.js 22 or newer.

```bash
npm install
npm run dev        # the sample channel at /dashboard/demo works without any Google setup
```

To test sign-in, set up a Google OAuth client as described in the [self-hosting guide](docs/self-hosting.md#1-google-cloud-project-and-oauth-client).

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build && npm run e2e   # first time: npx playwright install chromium
```

CI runs the same checks on every push.

## Guidelines

- **Keep the analysis engine pure.** Code in `src/lib/analytics/` takes plain data and returns plain data, with no framework imports and no network calls. That keeps it testable and deterministic.
- **Statistics changes need a test.** If you change how findings are computed, add or update a case in `tests/analytics.test.ts`. The sample-catalog regression (01:00 and 12:00 findings) should keep passing unless the change is meant to alter it; if so, explain why in the pull request.
- **Treat every input as untrusted.** That includes cookies, YouTube API responses and form fields. Follow the existing validators in `session.ts`, `prefs.ts` and `youtube.ts`.
- **Never log secrets.** Use `log()` from `src/lib/log.ts`, which redacts token, secret and email fields.
- **Small, focused pull requests** are easier to review. Describe what changed and how you tested it.

## Good first contributions

- New levers in `src/lib/analytics/features.ts` (for example chapters, Shorts vs long-form, or hashtag count)
- Clearer wording in the UI or docs
- Accessibility fixes

## Reporting a security problem

Please don't open a public issue. See [SECURITY.md](SECURITY.md).
