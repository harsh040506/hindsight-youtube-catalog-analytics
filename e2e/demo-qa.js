const { chromium } = require('playwright');
const B = 'http://localhost:3111';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  await p.goto(B + '/', { waitUntil: 'networkidle' });
  ok(await p.locator('text=Connect with Google').count() > 0, 'landing shows single sign-in CTA');
  ok((await p.locator('a:has-text("Connect with Google")').getAttribute('href')) === '/api/auth/google', 'CTA goes to OAuth start');

  await p.goto(B + '/dashboard/demo', { waitUntil: 'networkidle' });
  // channel menu: keyboard
  const sw = p.locator('button[aria-label="Switch channel"]');
  await sw.focus(); await p.keyboard.press('ArrowDown');
  ok(await p.locator('.menu[role=menu]').count() === 1, 'menu opens with ArrowDown');
  await p.keyboard.press('Escape');
  ok(await p.locator('.menu[role=menu]').count() === 0, 'menu closes with Escape');
  ok(await sw.evaluate(e => document.activeElement === e), 'focus returns to trigger');
  // theme
  await p.locator('button[aria-label="Theme"]').click();
  await p.locator('.menu-item:has-text("Dark")').click();
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme switches to dark');
  await p.reload({ waitUntil: 'networkidle' });
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme persists across reload');
  await p.locator('button[aria-label="Theme"]').click();
  await p.locator('.menu-item:has-text("Light")').click();

  // skip link: from a fresh load (the theme menu above correctly returned focus to its trigger,
  // and Chromium keeps that as the tab starting point even after blur)
  await p.reload({ waitUntil: 'networkidle' });
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement?.className) === 'skip', 'skip link is first tab stop');

  // videos
  await p.goto(B + '/dashboard/demo/videos', { waitUntil: 'networkidle' });
  await p.fill('input[aria-label="Search titles"]', 'zzzzqqq');
  ok(await p.locator('text=No videos match').count() === 1, 'search empty state');
  await p.click('text=Clear search');
  ok(await p.locator('tbody tr').count() > 10, 'clear search restores rows');
  await p.click('button[aria-label="Choose columns"]'); await p.click('.menu-item:has-text("Likes")');
  ok(await p.locator('th:has-text("Likes")').count() === 1, 'column chooser adds Likes');
  await p.locator('th button:has-text("Views")').click();
  ok(await p.locator('th[aria-sort="descending"]').count() === 1, 'sort by views (aria-sort)');
  const csv = await p.request.get(B + '/api/export/demo/videos');
  const txt = await csv.text();
  ok(csv.status() === 200 && (csv.headers()['content-type'] || '').includes('text/csv') && txt.split('\r\n').length > 900, 'videos CSV export (' + txt.split('\r\n').length + ' lines)');
  const f = await p.request.get(B + '/api/export/demo/findings');
  ok(f.status() === 200 && (await f.text()).includes('Publish hour'), 'findings CSV export');
  ok((await p.request.get(B + '/api/export/demo/nope')).status() === 404, 'unknown export kind 404');
  ok((await p.request.get(B + '/api/export/..%2Fx/videos')).status() === 404, 'bad channel id 404');

  // settings save + toast
  await p.goto(B + '/dashboard/demo/settings', { waitUntil: 'networkidle' });
  await p.click('button.picker'); await p.fill('.menu-filter', 'tokyo'); await p.keyboard.press('Enter');
  ok((await p.locator('button.picker span').innerText()).includes('Tokyo'), 'time zone picker (keyboard) selects Tokyo');
  await p.click('button:has-text("Save and re-analyse")');
  await p.waitForSelector('.toast.is-in', { timeout: 5000 });
  ok((await p.locator('.toast').first().innerText()).includes('Settings saved'), 'save shows success toast');

  // not found / unauthorised
  const r1 = await p.goto(B + '/dashboard/not-a-channel'); ok(r1.status() === 404, 'invalid channel id is 404');
  await p.goto(B + '/dashboard/UC' + 'a'.repeat(22), { waitUntil: 'networkidle' });
  ok(p.url().includes('/?error=not-connected') && await p.locator('.notice').count() > 0, 'unconnected channel redirects home with message');
  await p.goto(B + '/setup', { waitUntil: 'networkidle' });
  ok(await p.locator('text=Authorized redirect URI').count() > 0 && (await p.locator('input[aria-label="Authorized redirect URI"]').inputValue()).endsWith('/api/auth/callback'), 'setup page shows redirect URI');
  // regression: a preconnect hint injected into <head> used to break hydration of the next page (and drop the theme)
  await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  ok(!!(await p.evaluate(() => document.documentElement.dataset.theme)), 'theme survives hydration after /setup');
  await p.goto(B + '/dashboard/demo/experiments', { waitUntil: 'networkidle' });
  ok(await p.locator('text=Start tracking').count() === 0, 'demo has no start-tracking button');
  ok((await p.request.post(B + '/api/auth/logout', { headers: { origin: 'https://evil.example' } })).status() === 403, 'cross-site logout refused');
  const hdr = (await p.request.get(B + '/')).headers();
  ok(!!hdr['content-security-policy'] && !!hdr['strict-transport-security'] && hdr['x-frame-options'] === 'DENY', 'security headers present');
  ok((await (await p.request.get(B + '/robots.txt')).text()).includes('Disallow: /dashboard/'), 'robots.txt');

  // mobile nav
  const m = await b.newContext({ viewport: { width: 390, height: 844 } }); const mp = await m.newPage();
  mp.on('console', x => { if (x.type() === 'error') errs.push('mobile ' + x.text()); });
  await mp.goto(B + '/dashboard/demo', { waitUntil: 'networkidle' });
  await mp.click('button[aria-label="Sections"]'); await mp.click('.menu-item:has-text("Findings")'); await mp.waitForURL('**/findings');
  ok(true, 'mobile section menu navigates');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal overflow on mobile');
  for (const path of ['/dashboard/demo/levers', '/dashboard/demo/videos', '/dashboard/demo/experiments', '/dashboard/demo/settings']) {
    await mp.goto(B + path, { waitUntil: 'networkidle' });
    const over = await mp.evaluate(() => document.querySelector('.scroller').scrollWidth > window.innerWidth + 1);
    ok(!over, 'mobile no overflow ' + path);
  }
  console.log('console errors:', errs.length, errs.slice(0, 5));
  ok(!errs.some(e => e.includes('#418') || e.includes('Hydration')), 'no hydration errors');
  ok(!errs.some(e => e.startsWith('PAGEERROR')), 'no uncaught page errors');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
