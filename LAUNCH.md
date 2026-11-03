# Launch checklist

How to take Hindsight from "the code is done" to "anyone can sign in". None of these steps change code;
they are accounts, settings and a review by Google. Work through them in order. The site's own `/setup`
page shows your exact URLs and which variables are set, and `/api/health` reports the result.

| Step | Time | Needed for |
|---|---|---|
| 1. Google Cloud project and OAuth client | 15 min | any sign-in |
| 2. Try sign-in locally | 5 min | confidence before deploying |
| 3. Deploy to Vercel | 10 min | a public URL |
| 4. Custom domain (recommended) | 15 min + DNS | Google verification |
| 5. Shared store (optional) | 5 min | rate limits across instances |
| 6. Open sign-in to everyone | a few days to a few weeks (Google's review) | the public |

---

## 1. Google Cloud project and OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (e.g. "Hindsight").
2. **APIs & Services → Library →** search **YouTube Data API v3 → Enable**.
3. **APIs & Services → OAuth consent screen** (called *Google Auth Platform* in newer consoles):
   - User type: **External**.
   - App name, support email, developer contact email.
   - **Data access / Scopes:** add `.../auth/youtube.readonly`. (Email and profile are added automatically and are not sensitive.)
   - **Audience / Test users:** add your own Google account and anyone who will test before launch (up to 100).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs:** add `http://localhost:3000/api/auth/callback` now. You'll add the production one in step 3.
   - Copy the **Client ID** and **Client secret**.

## 2. Try sign-in locally

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
GOOGLE_CLIENT_ID=<the client id, ends in .apps.googleusercontent.com>
GOOGLE_CLIENT_SECRET=<the client secret>
SESSION_SECRET=<output of: openssl rand -base64 32>
```

Then `npm run dev`, open http://localhost:3000 and press **Connect with Google** with a test-user account.
http://localhost:3000/api/health should say `"signIn":"ready"`.

If Google shows `redirect_uri_mismatch`, the URI in the Cloud console doesn't match exactly (check `http`, the port, no trailing slash).

`.env.local` is git-ignored; never commit it.

## 3. Deploy to Vercel

1. Push this repository to GitHub (`harsh040506/hindsight-youtube-catalog-analytics`).
2. [vercel.com/new](https://vercel.com/new) → **Import** the repository. Next.js is detected; leave build settings at their defaults.
3. **Project → Settings → Environment Variables** (Production): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a **new** `SESSION_SECRET` (don't reuse the local one).
4. **Deployments → Redeploy** so the variables take effect.
5. Back in Google Cloud **Credentials**, add the production redirect URI: `https://<your-project>.vercel.app/api/auth/callback`. (Your site's `/setup` page shows the exact value with a copy button.)
6. Open `https://<your-project>.vercel.app/api/health` and expect `"ok":true,"signIn":"ready"` with no `warnings`.

The production branch is `main` (**Settings → Git**). Every push to `main` deploys; other branches get preview URLs.

**Vercel plan:** the free Hobby plan is for personal, non-commercial use. If Hindsight is part of a business or you charge for it, use Pro. The app needs no database and fits within either plan's function limits (requests are capped at 60 s).

## 4. Custom domain (recommended before step 6)

Google's verification (step 6) asks you to prove you own the domain the app runs on, via Google Search Console. That is straightforward for a domain you own and awkward for a shared `vercel.app` address, so get a domain now if you want public sign-in.

1. Buy a domain (any registrar, or through Vercel).
2. **Vercel → Project → Settings → Domains → Add**, and set the DNS records it shows.
3. Add the environment variable `APP_URL=https://yourdomain.com` and redeploy. This pins the OAuth redirect to that host.
4. Google Cloud **Credentials:** add `https://yourdomain.com/api/auth/callback` as a redirect URI.
5. [Google Search Console](https://search.google.com/search-console): add the domain and verify it with the DNS TXT record, **using the same Google account that owns the Cloud project**.
6. Consent screen **Branding:** set the homepage `https://yourdomain.com`, privacy policy `https://yourdomain.com/privacy`, and add `yourdomain.com` under **Authorized domains**.

## 5. Shared store (optional)

Without it, each Vercel instance keeps its own rate-limit counters and outage flags. That's fine for a small audience. To share them:

1. **Vercel → Storage / Marketplace → Upstash for Redis** (free tier) → connect it to the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` yourself).
2. Redeploy. `/api/health` should now say `"limits":"shared"` with no warnings.

If the store is unreachable the app falls back to per-instance limits automatically. Check the Vercel logs for `shared store unavailable` warnings once after enabling it; this path has only been tested against a mock so far.

## 6. Open sign-in to everyone

While the consent screen's publishing status is **Testing**:

- only the test users you listed can sign in, and
- **Google expires their grants after 7 days**, so testers have to reconnect weekly. This is a Testing-mode rule, not a bug.

`youtube.readonly` is a *sensitive* scope, so making the app public needs Google's review:

1. Consent screen → **Audience → Publish app**. Anyone can now sign in, but they see an "unverified app" warning they must click through, and Google caps unverified apps at 100 users in total.
2. Click **Prepare for verification / Submit for verification** and provide:
   - the verified domain, homepage and privacy policy from step 4. The homepage already links the privacy policy and YouTube's Terms, which reviewers check for;
   - a **justification** for `youtube.readonly`, e.g. *"Reads the signed-in user's own channel and uploaded-video list (titles, durations, tags, publish times, public view/like/comment counts) to analyse which upload choices correlated with performance. Read-only; no data is stored server-side."*
   - a **demo video** (unlisted YouTube link) showing: the homepage, pressing *Connect with Google*, the consent screen with the browser's address bar visible (the URL contains your client ID), and the dashboard using the data.
3. Answer Google's follow-up emails promptly. Reviews usually take from a few days to a few weeks.

Once approved, the warning disappears and the 100-user cap is lifted.

**API quota:** the free YouTube quota is 10,000 units a day per project. A full scan of a 1,000-video channel costs about 45 units, so roughly 200 scans a day. Results are cached for 20 minutes. If you outgrow that, request more through the *YouTube API Services audit and quota extension form*.

---

## Keeping it healthy

- **CI:** every push runs type checks, unit tests, the build and the browser tests (GitHub → Actions). Keep it green before merging.
- **Logs:** Vercel → Project → Logs. Entries are JSON with a `level`; filter on `"level":"error"`. Tokens and emails are redacted automatically.
- **Rotating `SESSION_SECRET`:** put the old value in `SESSION_SECRET_PREVIOUS`, set the new one, redeploy. Remove the old one after a month or so.
- **Known nicety, not a blocker:** the first visit to the demo on a freshly started instance runs the analysis (about 1.5 to 5 s). Later visits are instant.
