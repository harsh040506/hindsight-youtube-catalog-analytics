# Self-hosting Hindsight

This guide takes you from a fork to a public site anyone can sign in to. None of the steps change code; they're Google Cloud and Vercel settings. Your deployment's `/setup` page shows your exact URLs and which variables are set, and `/api/health` reports the result.

| Step | Time | Needed for |
|---|---|---|
| [1. Google Cloud project and OAuth client](#1-google-cloud-project-and-oauth-client) | 15 min | any sign-in |
| [2. Run it locally](#2-run-it-locally) | 5 min | checking sign-in before you deploy |
| [3. Deploy to Vercel](#3-deploy-to-vercel) | 10 min | a public URL |
| [4. Custom domain](#4-custom-domain-recommended) | 15 min + DNS | Google verification |
| [5. Shared store (optional)](#5-shared-store-optional) | 5 min | rate limits across instances |
| [6. Open sign-in to everyone](#6-open-sign-in-to-everyone) | days to weeks (Google's review) | the public |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID, ends in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret |
| `SESSION_SECRET` | yes | Encrypts session cookies. At least 32 characters: `openssl rand -base64 32` |
| `SESSION_SECRET_PREVIOUS` | no | The old secret while you rotate, so nobody is signed out |
| `APP_URL` | no | Pins the OAuth redirect to a custom domain, e.g. `https://hindsight.example.com` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | no | Shared rate limits and outage flags (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) |

Set these in your host's dashboard (Vercel → **Settings → Environment Variables**) for production, and in `.env.local` for local development. Never commit real values. The CI workflow needs no secrets, because the browser tests run against a mock Google server.

## 1. Google Cloud project and OAuth client

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → Library**: enable **YouTube Data API v3**.
3. **OAuth consent screen** (called *Google Auth Platform* in newer consoles):
   - User type: **External**.
   - App name, support email and developer contact email.
   - **Data access / Scopes:** add `.../auth/youtube.readonly`. Email and profile are added automatically.
   - **Audience / Test users:** add your own Google account and anyone testing before launch (up to 100).
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback` for now. You'll add the production one in step 3.
   - Copy the client ID and secret.

## 2. Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the three required variables
npm run dev
```

Open http://localhost:3000 and press **Connect with Google** with a test-user account. http://localhost:3000/api/health should report `"signIn":"ready"`.

If Google shows `redirect_uri_mismatch`, the URI in the Cloud console doesn't match exactly. Check `http` vs `https`, the port, and that there's no trailing slash.

## 3. Deploy to Vercel

1. Fork this repository, then import it at [vercel.com/new](https://vercel.com/new). The included `vercel.json` sets the framework to Next.js, so the build settings can stay at their defaults.
2. **Settings → Environment Variables (Production):** add the three required variables. Generate a new `SESSION_SECRET` rather than reusing your local one.
3. **Deployments → Redeploy** so the variables take effect.
4. In Google Cloud **Credentials**, add `https://<your-project>.vercel.app/api/auth/callback`. Your site's `/setup` page shows the exact value with a copy button.
5. Open `https://<your-project>.vercel.app/api/health` and check for `"ok":true,"signIn":"ready"` with no `warnings`.

**If every page returns Vercel's `404: NOT_FOUND`** even though the build succeeded, the project's Framework Preset is set to "Other". Set it to **Next.js** under **Settings → Build and Deployment**, turn off any Output Directory override, and redeploy.

**Vercel plan:** the free Hobby plan is for personal, non-commercial use. Use Pro if Hindsight is part of a business. Requests are capped at 60 seconds, which fits either plan.

## 4. Custom domain (recommended)

Google's verification (step 6) asks you to prove you own the app's domain through Google Search Console. That's straightforward for your own domain and awkward for a shared `vercel.app` address.

1. **Vercel → Settings → Domains → Add**, then set the DNS records it shows.
2. Set `APP_URL=https://yourdomain.com` and redeploy.
3. Add `https://yourdomain.com/api/auth/callback` as a redirect URI in Google Cloud.
4. Verify the domain in [Google Search Console](https://search.google.com/search-console) with a DNS TXT record, using the Google account that owns the Cloud project.
5. On the consent screen's **Branding** page, set the homepage `https://yourdomain.com` and privacy policy `https://yourdomain.com/privacy`, and add `yourdomain.com` under **Authorized domains**.

## 5. Shared store (optional)

Without it, each server instance keeps its own rate-limit counters and outage flags, which is fine for a small audience. To share them, add **Upstash for Redis** from the Vercel Marketplace (the free tier is enough) and connect it to the project, then redeploy. `/api/health` should now report `"limits":"shared"`.

The store holds only short-lived counters under hashed keys, never channel data or tokens. If it's unreachable, the app falls back to per-instance limits automatically.

## 6. Open sign-in to everyone

While the consent screen is in **Testing**, only listed test users can sign in, and Google expires their access after 7 days.

`youtube.readonly` is a sensitive scope, so a public app needs Google's review:

1. **Audience → Publish app.** Anyone can now sign in, but they'll see an "unverified app" warning, and Google caps unverified apps at 100 users.
2. **Submit for verification** with:
   - the verified domain, homepage and privacy policy from step 4;
   - a justification for the scope, for example: *"Reads the signed-in user's own channel and uploaded-video list (titles, durations, tags, publish times, public view/like/comment counts) to analyse which upload choices correlated with performance. Read-only; no data is stored server-side."*
   - an unlisted YouTube demo video showing the homepage, **Connect with Google**, the consent screen with the address bar visible, and the dashboard using the data.
3. Answer Google's follow-up emails promptly. Reviews take from a few days to a few weeks.

## API quota

The free YouTube quota is 10,000 units a day per Google Cloud project. A full scan of a 1,000-video channel costs about 45 units, so you get roughly 200 scans a day, and results are cached for 20 minutes. If you need more, apply through the *YouTube API Services audit and quota extension form*.

## Operations

- **Logs:** Vercel → Project → Logs. Entries are JSON with a `level` field, so filter on `"level":"error"`. Tokens and emails are redacted.
- **Rotating `SESSION_SECRET`:** move the old value to `SESSION_SECRET_PREVIOUS`, set a new one, and redeploy. Remove the old one after a month or so.
- **Cold start:** the first visit to the demo on a fresh instance runs the analysis (1.5 to 5 seconds). Later visits are instant.
