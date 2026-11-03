// Mock Google OAuth + YouTube Data API for end-to-end tests.
const http = require('http'), fs = require('fs');
const demo = JSON.parse(fs.readFileSync(process.argv[2] || 'data/demo.json', 'utf8'));
const CH = {
  main: { id: 'UC' + 'm'.repeat(22), title: 'Mock Main Channel', email: 'main@example.com', n: 400 },
  brand: { id: 'UC' + 'b'.repeat(22), title: 'Mock Brand Channel', email: 'main@example.com', n: 150 },
};
const state = { revoked: [], yt: 'ok', log: [], validRt: new Set() };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
const vids = (c) => demo.videos.slice(0, c.n);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let body = '';
  req.on('data', d => body += d); req.on('end', () => {
    state.log.push(req.method + ' ' + u.pathname);
    if (u.pathname === '/auth') { // auto-consent: which channel comes from ?pick= set via /__pick
      const ru = new URL(u.searchParams.get('redirect_uri'));
      ru.searchParams.set('code', 'code-' + state.pick); ru.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { location: ru.toString() }); return res.end();
    }
    if (u.pathname === '/__pick') { state.pick = u.searchParams.get('c'); return json(res, 200, {}); }
    if (u.pathname === '/__mode') { state.yt = u.searchParams.get('yt'); return json(res, 200, state); }
    if (u.pathname === '/__state') return json(res, 200, state);
    if (u.pathname === '/token') {
      const f = new URLSearchParams(body);
      if (f.get('grant_type') === 'authorization_code') {
        const key = f.get('code').replace('code-', ''); const c = CH[key]; if (!c) return json(res, 400, { error: 'invalid_grant' });
        if (!f.get('code_verifier')) return json(res, 400, { error: 'invalid_request' });
        const rt = 'rt-' + key; state.validRt.add(rt);
        return json(res, 200, { access_token: 'at-' + key, refresh_token: rt, expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/youtube.readonly', id_token: 'h.' + b64({ email: c.email }) + '.s' });
      }
      const rt = f.get('refresh_token'); if (!state.validRt.has(rt)) return json(res, 400, { error: 'invalid_grant' });
      return json(res, 200, { access_token: 'at-' + rt.replace('rt-', ''), expires_in: 3600 });
    }
    if (u.pathname === '/revoke') { state.revoked.push(new URLSearchParams(body).get('token')); state.validRt.delete(new URLSearchParams(body).get('token')); return json(res, 200, {}); }
    if (u.pathname.startsWith('/youtube/v3/')) {
      if (state.yt === '401') return json(res, 401, { error: { message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } });
      if (state.yt === '503') return json(res, 503, { error: { message: 'backend' } });
      const key = (req.headers.authorization || '').replace('Bearer at-', ''); const c = CH[key]; if (!c) return json(res, 401, { error: { message: 'bad token' } });
      const path = u.pathname.replace('/youtube/v3/', '');
      if (path === 'channels') return json(res, 200, { items: [{ id: c.id, snippet: { title: c.title, customUrl: '@' + key, thumbnails: {} }, statistics: { subscriberCount: '1234', viewCount: '99999', videoCount: String(c.n) }, contentDetails: { relatedPlaylists: { uploads: 'UU' + key } } }] });
      if (path === 'playlistItems') { const all = vids(c); const start = Number(u.searchParams.get('pageToken') || 0); const items = all.slice(start, start + 50).map(v => ({ contentDetails: { videoId: v.id } })); return json(res, 200, { items, nextPageToken: start + 50 < all.length ? String(start + 50) : undefined }); }
      if (path === 'videos') { const ids = u.searchParams.get('id').split(','); const by = new Map(demo.videos.map(v => [v.id, v]));
        return json(res, 200, { items: ids.map(id => by.get(id)).filter(Boolean).map(v => ({ id: v.id, snippet: { title: v.t, description: v.cta ? 'comment below ' + 'x'.repeat(v.dl) : 'x'.repeat(v.dl), publishedAt: v.p, tags: v.g }, contentDetails: { duration: 'PT' + v.d + 'S' }, statistics: { viewCount: String(v.v), likeCount: String(v.l), commentCount: String(v.c) }, status: { privacyStatus: v.pv } })) }); }
    }
    json(res, 404, { error: 'nf' });
  });
}).listen(4111, () => console.log('mock on 4111'));
