#!/usr/bin/env bash
# End-to-end test against a mock Google OAuth + YouTube API, using Playwright's Chromium.
# Usage: npm run build && npm run e2e   (first time: npx playwright install chromium)
set -uo pipefail
cd "$(dirname "$0")/.."
export GOOGLE_CLIENT_ID=test.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=x SESSION_SECRET=$(openssl rand -base64 32)
export HINDSIGHT_MOCK=1 MOCK_AUTH_URL=http://localhost:4111/auth MOCK_TOKEN_URL=http://localhost:4111/token MOCK_REVOKE_URL=http://localhost:4111/revoke MOCK_YT_URL=http://localhost:4111/youtube/v3
# A shared store from the developer's shell would make limits persist between runs.
unset UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN KV_REST_API_URL KV_REST_API_TOKEN

# A leftover server on either port would answer instead, and the suites would test a stale build.
for port in 3111 4111; do
  if curl -s -o /dev/null --max-time 2 "http://localhost:$port/"; then echo "port $port is already in use; stop that server first"; exit 1; fi
done

node e2e/mock-google.js data/demo.json & MOCK=$!
# Run next directly, not through npx: on Windows killing the npx wrapper leaves the server orphaned.
node node_modules/next/dist/bin/next start -p 3111 & APP=$!
trap 'kill $MOCK $APP 2>/dev/null || true' EXIT

# Wait for both servers instead of guessing a delay.
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:3111/api/health && curl -s -o /dev/null http://localhost:4111/__state && break
  sleep 1
done
curl -sf -o /dev/null http://localhost:3111/api/health || { echo "app did not start"; exit 1; }

# Run every suite even if one fails, then report the combined result.
status=0
node e2e/demo-qa.js || status=1
node e2e/signed-in.js || status=1
exit $status
