// Layout audit (MRV-8.1; spec docs/specs/MRV-8.0-layout-box-model.md AC-1 to AC-6).
// Loads every public and portal route of the SPA in headless Chromium at fixed widths and reports each layout violation:
// overflow, overlap, wrapped single-line controls, misaligned form fields and cards, boxes outside their parent, box-sizing.
//
//   node audit.mjs              audit the running stack (BASE_URL, default http://host.docker.internal:4200)
//   node audit.mjs --fixtures   self-test: the rules must flag the deliberate violations in fixtures/ and pass fixtures/clean.html
//
// Run it through test/layout/run.sh (Docker, pinned Playwright image). Output: one TSV line per violation
// (group, route, width, rule, selector, detail), then one line `SUMMARY {json}`. Exit 1 when any violation was found
// (or, with --fixtures, when the self-test fails). Credentials come from the environment and are never printed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDom, RULES } from './rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL ?? 'http://host.docker.internal:4200').replace(/\/$/, '');
const WIDTHS = (process.env.WIDTHS ?? '320,375,414,768,1024,1280,1440,1920').split(',').map(Number);
const HEIGHT = 900; // fixed viewport height, DPR 1: the audit is geometry only
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // optional filter on "group route"
const OUT_FILE = process.env.OUT_FILE ?? null;
const FIXTURE_MODE = process.argv.includes('--fixtures');

const TOKEN_KEY = 'marvi_auth_token';
const PRIVACY_KEY = 'marvi.privacy-notice';

// Accounts: the seeded demo ones (deploy/seed-demo.mjs). The admin comes from the environment.
const ACCOUNTS = {
  admin: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  employee: { email: 'funcionario@demo.marvi.test', password: 'Demo-Func-1!' },
  cliente: { email: 'cliente@demo.marvi.test', password: 'Demo-Cliente-1!' },
  mercado: { email: 'mercado@demo.marvi.test', password: 'Demo-Cliente-1!' },
  pendente: { email: 'pendente@demo.marvi.test', password: 'Demo-Cliente-1!' },
  suspenso: { email: 'suspenso@demo.marvi.test', password: 'Demo-Cliente-1!' },
};

const PUBLIC = ['/', '/login', '/register', '/privacidade', '/contato', '/storefront'];
const ADMIN = ['/admin', '/admin/visao-geral', '/admin/catalogo', '/admin/precos', '/admin/operacao', '/admin/clientes', '/admin/importacao', '/admin/auditoria'];
// group = who is signed in and how the page is opened. `notice` leaves the privacy notice visible (fixed layer, AC-3/AC-9).
const GROUPS = [
  { name: 'public', account: null, notice: false, routes: PUBLIC },
  { name: 'public-notice', account: null, notice: true, routes: ['/', '/storefront', '/contato', '/register'] },
  { name: 'public-as-employee', account: 'employee', notice: false, routes: ['/', '/storefront', '/contato'] },
  { name: 'client-portal', account: 'cliente', notice: false, routes: ['/portal'] },
  { name: 'client-portal-wholesale', account: 'mercado', notice: false, routes: ['/portal'] },
  { name: 'client-portal-pending', account: 'pendente', notice: false, routes: ['/portal'] },
  { name: 'client-portal-suspended', account: 'suspenso', notice: false, routes: ['/portal'] },
  { name: 'employee-portal', account: 'employee', notice: false, routes: ['/employee', '/employee/historico'] },
  { name: 'admin-portal', account: 'admin', notice: false, routes: ADMIN },
];

async function loginToken(account) {
  const { email, password } = ACCOUNTS[account] ?? {};
  if (!email || !password) return { error: 'no credentials configured' };
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return { error: `login answered ${res.status}` };
  return { token: (await res.json()).token };
}

async function newContext(browser, width, { token, notice }) {
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await ctx.addInitScript(([tk, tv, pk, dismiss]) => {
    try {
      if (tv) localStorage.setItem(tk, tv);
      if (dismiss) localStorage.setItem(pk, '1');
    } catch { /* storage blocked: nothing to seed */ }
  }, [TOKEN_KEY, token ?? null, PRIVACY_KEY, !notice]);
  return ctx;
}

const NO_MOTION = '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; caret-color: transparent !important; }';

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Wait for the SPA to render something and for loading skeletons to go away (bounded: a stuck skeleton is itself recorded by the audit).
  await page.waitForFunction(() => document.querySelector('app-root')?.children.length > 0, null, { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.skeleton, [aria-busy="true"]'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function auditUrl(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: NO_MOTION });
  await settle(page);
  const landed = new URL(page.url());
  const violations = await page.evaluate(auditDom);
  return { landed: landed.pathname, violations };
}

const key = (v) => `${v.group}\t${v.route}\t${String(v.width).padStart(4, '0')}\t${v.rule}\t${v.selector}`;

function summarise(violations, pages, skipped) {
  const count = (fn) => {
    const m = {};
    for (const v of violations) m[fn(v)] = (m[fn(v)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  };
  return {
    total: violations.length,
    pages,
    widths: WIDTHS,
    byRule: count((v) => v.rule),
    byGroup: count((v) => v.group),
    byWidth: count((v) => v.width),
    byRoute: count((v) => `${v.group} ${v.route}`),
    byGroupRule: count((v) => `${v.group} / ${v.rule}`),
    skipped,
  };
}

function report(violations, summary) {
  const sorted = [...violations].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  for (const v of sorted) console.log([v.group, v.route, v.width, v.rule, v.selector, v.detail].join('\t'));
  console.log('SUMMARY ' + JSON.stringify(summary));
  if (OUT_FILE) writeFileSync(OUT_FILE, JSON.stringify({ summary, violations: sorted }, null, 2));
}

async function runSite() {
  const browser = await chromium.launch();
  const violations = [];
  const skipped = [];
  let pages = 0;
  const tokens = {};
  try {
    for (const group of GROUPS) {
      if (group.account && !(group.account in tokens)) tokens[group.account] = await loginToken(group.account);
      const auth = group.account ? tokens[group.account] : {};
      if (group.account && auth.error) {
        skipped.push({ group: group.name, reason: `${group.account}: ${auth.error}` });
        console.error(`SKIPPED ${group.name}: ${group.account} ${auth.error}`);
        continue;
      }
      for (const width of WIDTHS) {
        const ctx = await newContext(browser, width, { token: auth.token, notice: group.notice });
        const page = await ctx.newPage();
        for (const route of group.routes) {
          if (ONLY && !ONLY.test(`${group.name} ${route}`)) continue;
          pages++;
          try {
            const { landed, violations: found } = await auditUrl(page, BASE + route);
            if (landed !== route && !(route === '/admin' && landed.startsWith('/admin'))) {
              skipped.push({ group: group.name, route, width, reason: `landed on ${landed}` });
            }
            for (const v of found) violations.push({ group: group.name, route, width, ...v });
          } catch (e) {
            violations.push({ group: group.name, route, width, rule: 'audit-error', selector: '-', detail: String(e.message).split('\n')[0] });
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  // A guard redirect is reported once per route, not per width.
  const uniqueSkipped = [...new Map(skipped.map((s) => [`${s.group}|${s.route}|${s.reason}`, { group: s.group, route: s.route, reason: s.reason }])).values()];
  const summary = summarise(violations, pages, uniqueSkipped);
  report(violations, summary);
  // A group that could not sign in, or a route a guard redirected, means part of the site was NOT audited: that must not look like a pass.
  return violations.length === 0 && uniqueSkipped.length === 0 ? 0 : 1;
}

// ---- self-test over the fixtures ------------------------------------------------------------------------------------
async function runFixtures() {
  const dir = join(HERE, 'fixtures');
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '');
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(dir, name)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(4399, '127.0.0.1', r));
  const widths = (process.env.FIXTURE_WIDTHS ?? '375,1024').split(',').map(Number);
  const browser = await chromium.launch();
  let failed = 0;
  const lines = [];
  try {
    for (const file of files) {
      const html = readFileSync(join(dir, file), 'utf8');
      const expect = /<meta name="layout-expect" content="([^"]*)"/.exec(html)?.[1] ?? '';
      const expected = expect === 'none' ? [] : expect.split(',').map((s) => s.trim()).filter(Boolean);
      for (const r of expected) if (!RULES.includes(r)) throw new Error(`${file}: unknown rule ${r}`);
      const found = new Set();
      for (const width of widths) {
        const ctx = await newContext(browser, width, { token: null, notice: false });
        const page = await ctx.newPage();
        await page.goto(`http://127.0.0.1:4399/${file}`, { waitUntil: 'networkidle' });
        await page.addStyleTag({ content: NO_MOTION });
        await page.evaluate(() => document.fonts.ready);
        for (const v of await page.evaluate(auditDom)) found.add(v.rule);
        await ctx.close();
      }
      const ok = expected.length === 0 ? found.size === 0 : expected.every((r) => found.has(r));
      if (!ok) failed++;
      lines.push(`${ok ? 'PASS' : 'FAIL'}\t${file}\texpected [${expected.join(', ') || 'none'}]\tflagged [${[...found].sort().join(', ') || 'none'}]`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  // Every rule must be covered by at least one fixture.
  const covered = new Set(files.flatMap((f) => (/<meta name="layout-expect" content="([^"]*)"/.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? '').split(',').map((s) => s.trim())));
  const uncovered = RULES.filter((r) => !covered.has(r));
  for (const l of lines) console.log(l);
  if (uncovered.length) { console.log(`FAIL\t(coverage)\trules without a fixture: ${uncovered.join(', ')}`); failed++; }
  console.log(`SELFTEST ${JSON.stringify({ fixtures: files.length, failed, widths })}`);
  return failed === 0 ? 0 : 1;
}

process.exit(await (FIXTURE_MODE ? runFixtures() : runSite()));
