# Hindsight

**Your channel already ran the experiment. Nobody read the results.**

Connect your YouTube channel(s) with Google and Hindsight reads your back catalog, works out which upload
choices (length, tags, title, publish hour, weekday) genuinely moved performance, flags the levers you've
never varied, and designs the next experiment. Free to host on Vercel. No database.

- **Try it without signing in:** open `/dashboard/demo`. A bundled, anonymised 949-video catalog reproduces the headline result: publishing at 01:00 costs ~14 percentile points, at 12:00 gains ~13.5.
- **Multiple channels:** connect as many as you own (Google account or brand channel each time you press *Add channel*).
- **Read-only:** only the `youtube.readonly` scope. It cannot upload, edit or delete anything.

## For visitors: nothing to set up

Open the site → **Connect with Google** → pick the account (or brand channel) → you land on your dashboard.
Your time zone is detected automatically. Add more channels any time from the channel menu.
No sign-up, no API keys, nothing to install.

## For the site owner: one-time setup (~10 min, free)

The running site walks you through this at **`/setup`**, with your exact redirect URI ready to copy and a live check of which variables are set. For the full path to public launch (custom domain, Google verification, quota), follow **[LAUNCH.md](LAUNCH.md)**.

1. **Deploy:** [vercel.com/new](https://vercel.com/new) → import this repository (Next.js is auto-detected).
2. **Google Cloud:** create a project, enable **YouTube Data API v3**, configure the OAuth consent screen (External; scope `youtube.readonly`; privacy policy `https://<your-url>/privacy`), then create an **OAuth client ID → Web application** with the redirect URI `https://<your-url>/api/auth/callback`.
3. **Vercel → Settings → Environment Variables:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (`openssl rand -base64 32`). Optional `APP_URL` for a custom domain. Redeploy.
4. `/api/health` returns `{"ok":true,"signIn":"ready"}` when everything is set, plus any configuration `warnings`.
5. *Optional:* add an Upstash Redis / Vercel KV store (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or the `KV_REST_API_*` pair Vercel sets) so rate limits and outage protection are shared across instances. `/api/health` then reports `"limits":"shared"`.

Rotating `SESSION_SECRET`: set the old value as `SESSION_SECRET_PREVIOUS` alongside the new one, so existing sessions keep working.

### Who can sign in?
`youtube.readonly` is a *sensitive* scope. While the consent screen is in **Testing**, only the test users you list (up to 100) can sign in. Click **Publish app** and submit for verification so anyone can; until Google approves, visitors see an "unverified app" screen they can click through. The sample channel at `/dashboard/demo` needs no sign-in.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in the three values
npm run dev                  # http://localhost:3000
npm test                     # statistics, security helpers and the demo-catalog regression
npx playwright install chromium   # once, for the browser tests
npm run build && npm run e2e # browser tests against a mock Google/YouTube (also run in CI)
```

## How it works
- `src/lib/analytics/cohort.ts`: scores each video as a percentile against the 25 videos before and after it, so channel size, season and age cancel.
- `src/lib/analytics/features.ts`: ~30 levers (length, tags, title shape, keywords, publish hour/weekday/daypart in your time zone).
- `src/lib/analytics/analyze.ts`: permutation tests + bootstrap CIs, **one Benjamini-Hochberg correction across every comparison**, split-half replication, and the *tested / never varied / too lopsided* distinction.
- `src/lib/analytics/experiment.ts`: power-sized experiment plans, balanced-block upload schedule, and a readout that tells you not to peek.
- `src/lib/google.ts`, `session.ts`, `crypto.ts`: Google OAuth (PKCE) with each channel's refresh token sealed in its own AES-256-GCM httpOnly cookie. There is no server-side storage of channel data; video data is cached in memory for ~20 minutes.
- UI: the Claude-inspired design system (`src/styles/tokens.css`, `ui.css` verbatim) with DM Sans / Newsreader / JetBrains Mono and custom menus, dialogs and tooltips.

### Limits
- The YouTube Data API exposes public counters only: views, likes, comments. Retention and impressions need the YouTube Analytics API (a possible future scope).
- Up to 5,000 most recent uploads per channel. The free API quota (10,000 units/day) allows well over a hundred full scans a day.
- Findings are observational. The Experiments page is how you confirm them.

## Production hardening

- **Auth:** OAuth code flow with PKCE and a signed `state`; each channel's refresh token sealed with AES-256-GCM in its own `httpOnly`, `SameSite=Lax`, `Secure` cookie, so concurrent sign-ins in two tabs can't overwrite each other; decrypted cookies are re-validated; secret rotation via `SESSION_SECRET_PREVIOUS`. Tokens never logged or sent to the browser. Disconnecting revokes the grant at Google.
- **Authorisation:** every data request re-checks that the channel is in the caller's own session before the shared cache is touched (regression-tested end to end).
- **Abuse protection:** per-IP rate limits on sign-in, callback, logout, export and refresh (shared across instances when a store is configured, with hashed keys); cross-site POST refusal via Fetch Metadata and Origin; validated Host headers; strict channel-id validation; every cookie and API response validated as untrusted input.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies; dashboards are `noindex`.
- **Resilience:** timeouts and jittered retries for Google/YouTube calls; a circuit breaker that fails fast during an outage; a time budget that analyses the most recent uploads if YouTube is slow; concurrent requests coalesced into one upstream load; last good data served if YouTube is down; malformed API items skipped rather than crashing the analysis; friendly messages for quota, permission, configuration and revoked-access errors with one-click reconnect.
- **Exports:** CSV for videos, findings and levers, with spreadsheet-formula injection neutralised.
- **Accessibility:** skip link, keyboard-operable menus/dialogs (focus trap, Escape, focus return), `aria-sort`, labelled charts with text alternatives, reduced-motion support.
- **Observability:** structured JSON logs with automatic redaction of token/secret/email fields, analysis timings, and `/api/health` with configuration warnings.
