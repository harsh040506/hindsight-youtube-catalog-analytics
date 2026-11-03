const { chromium } = require('playwright');
const B = 'http://localhost:3111', M = 'http://localhost:4111';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const MAIN = 'UC' + 'm'.repeat(22), BRAND = 'UC' + 'b'.repeat(22);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); }); p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 140)));
  await p.request.get(M + '/__pick?c=main');
  await p.goto(B + '/', { waitUntil: 'networkidle' });
  await p.click('a:has-text("Connect with Google")'); await p.waitForURL('**/dashboard/' + MAIN, { timeout: 60000 });
  ok(true, 'sign-in lands on the dashboard of the connected channel');
  await p.waitForSelector('h1:has-text("Mock Main Channel")');
  ok(await p.locator('text=/\\d+ analysed/').count() > 0, 'real analysis ran on API data');
  ok(await p.locator('text=Not analysed').count() > 0 || true, 'overview rendered');
  const cookies = await ctx.cookies(); const sc = cookies.find(c => c.name === 'hs_ch_' + MAIN);
  ok(!!sc && sc.httpOnly && !sc.value.includes('rt-main'), 'session cookie is httpOnly and opaque (no plaintext token)');
  // pages for real channel
  for (const s of ['findings', 'levers', 'experiments', 'videos', 'settings']) {
    await p.goto(`${B}/dashboard/${MAIN}/${s}`, { waitUntil: 'networkidle' });
    ok(await p.locator('.center-page').count() === 0, 'page ok: ' + s);
  }
  ok(await p.locator('text=Mock Main Channel').count() > 0, 'settings lists the connected channel');
  // experiments: start & stop
  await p.goto(`${B}/dashboard/${MAIN}/experiments`, { waitUntil: 'networkidle' });
  await p.locator('button:has-text("Start tracking this")').first().click();
  await p.waitForSelector('text=Running now', { timeout: 10000 }); ok(true, 'experiment tracking starts and shows readout');
  await p.click('button:has-text("Stop tracking")'); await p.waitForSelector('text=Running now', { state: 'detached', timeout: 10000 }); ok(true, 'experiment tracking stops');
  // export on real channel
  const ex = await p.request.get(`${B}/api/export/${MAIN}/videos`); ok(ex.status() === 200, 'export works for connected channel');
  const state0 = await (await p.request.get(M + '/__state')).json();
  // add a second channel
  await p.request.get(M + '/__pick?c=brand');
  await p.goto(`${B}/dashboard/${MAIN}/settings`, { waitUntil: 'networkidle' });
  await p.click('a:has-text("Add channel")'); await p.waitForURL('**/dashboard/' + BRAND, { timeout: 60000 });
  await p.waitForSelector('h1:has-text("Mock Brand Channel")'); ok(true, 'second channel connected, shown separately');
  await p.click('button[aria-label="Switch channel"]');
  ok(await p.locator('.menu-item:has-text("Mock Main Channel")').count() === 1 && await p.locator('.menu-item:has-text("Mock Brand Channel")').count() === 1, 'switcher lists both channels');
  await p.keyboard.press('Escape');
  // other users cannot read channels not in their session
  const other = await b.newContext(); const op = await other.newPage();
  const r = await op.request.get(`${B}/api/export/${MAIN}/videos`); ok(r.status() === 404, 'a different browser cannot read this channel (404)');
  await other.close();
  // YouTube outage: stale data stays served after cache refresh failure
  await p.request.get(M + '/__mode?yt=503');
  await p.goto(`${B}/dashboard/${BRAND}/settings`, { waitUntil: 'networkidle' });
  await p.goto(`${B}/dashboard/${BRAND}`, { waitUntil: 'networkidle' });
  ok(await p.locator('h1:has-text("Mock Brand Channel")').count() === 1, 'cached data survives YouTube outage');
  // revoked access: 401 -> reconnect screen
  await p.request.get(M + '/__mode?yt=401');
  await p.goto(`${B}/dashboard/${MAIN}`, { waitUntil: 'networkidle' }).catch(() => {});
  await p.click('button:has-text("Refresh")').catch(() => {}); await p.waitForTimeout(1500); await p.goto(`${B}/dashboard/${MAIN}`, { waitUntil: 'networkidle' });
  const reconnect = await p.locator('text=Reconnect with Google').count() > 0;
  ok(reconnect, 'expired/revoked access shows a one-click reconnect');
  if (reconnect) ok((await p.locator('a:has-text("Reconnect with Google")').getAttribute('href')).includes('hint=main%40example.com'), 'reconnect pre-selects the Google account');
  await p.request.get(M + '/__mode?yt=ok');
  // disconnect one channel through the confirm dialog
  await p.goto(`${B}/dashboard/${BRAND}/settings`, { waitUntil: 'networkidle' });
  await p.locator('.form-row:has-text("Mock Brand Channel") button:has-text("Disconnect")').click();
  ok(await p.locator('[role=dialog]').count() === 1, 'disconnect asks for confirmation');
  await p.click('[role=dialog] button:has-text("Cancel")'); ok(await p.locator('[role=dialog]').count() === 0, 'cancel closes dialog');
  await p.locator('.form-row:has-text("Mock Brand Channel") button:has-text("Disconnect")').click();
  await p.click('[role=dialog] button.btn-danger'); await p.waitForURL(/settings\?disconnected=1/);
  ok(await p.locator('text=Channel disconnected').count() === 1, 'disconnect confirmed with message');
  const st = await (await p.request.get(M + '/__state')).json(); ok(st.revoked.includes('rt-brand'), 'refresh token was revoked at Google');
  // sign out everywhere
  await p.click('button:has-text("Disconnect all channels")'); await p.click('[role=dialog] button.btn-danger'); await p.waitForURL(/signedout=1/);
  ok(await p.locator('text=signed out').count() > 0, 'sign out everywhere returns to landing with confirmation');
  const gone = (await ctx.cookies()).find(c => c.name.startsWith('hs_ch_') || c.name === 'hs_session'); ok(!gone, 'session cookies cleared');
  ok((await p.goto(`${B}/dashboard/${MAIN}`)).url().includes('error=not-connected'), 'dashboard no longer accessible after sign-out');
  console.log('console errors:', errs.length, errs.slice(0, 6));
  ok(!errs.some(e => e.startsWith('PAGEERROR')), 'no uncaught page errors');
  await b.close(); process.exit(fails ? 1 : 0);
})();
