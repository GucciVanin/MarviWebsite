// axe-core accessibility pass over the portal routes (MRV-8.5). Run by test/layout/axe.sh inside the Playwright image.
// Signs in with the seeded demo accounts (deploy/seed-demo.mjs); the admin comes from ADMIN_EMAIL / ADMIN_PASSWORD. Read-only: nothing is submitted.
// Env: BASE_URL, ONLY (regex on "role route"), WIDTHS (default 375,1280). Prints one line per route and width; exit 1 on any violation.
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.BASE_URL;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const WIDTHS = (process.env.WIDTHS || '375,1280').split(',').map(Number);
const TOKEN_KEY = 'marvi_auth_token';
const PRIVACY_KEY = 'marvi.privacy-notice';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const ACCOUNTS = {
  employee: { email: 'funcionario@demo.marvi.test', password: 'Demo-Func-1!', routes: ['/employee', '/employee#widget', '/employee/historico', '/employee/clientes/C-000001', '/employee/clientes/C-999999'] },
  cliente: { email: 'cliente@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
  mercado: { email: 'mercado@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
  pendente: { email: 'pendente@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
  suspenso: { email: 'suspenso@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
};
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  ACCOUNTS.admin = {
    email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
    routes: ['/admin', '/admin/visao-geral', '/admin/catalogo', '/admin/precos', '/admin/operacao', '/admin/clientes', '/admin/importacao', '/admin/auditoria'],
  };
}

const browser = await chromium.launch();
let failures = 0, checked = 0, skipped = 0;
for (const [role, account] of Object.entries(ACCOUNTS)) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
  if (!res.ok) { console.log(`${role}\tSKIPPED sign-in failed (${res.status})`); skipped++; continue; }
  const token = (await res.json()).token;
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 900 }, locale: 'pt-BR', reducedMotion: 'reduce', bypassCSP: true });
    await ctx.addInitScript(([tk, tv, pk]) => { try { localStorage.setItem(tk, tv); localStorage.setItem(pk, '1'); } catch { /* no storage */ } }, [TOKEN_KEY, token, PRIVACY_KEY]);
    for (const route of account.routes) {
      if (ONLY && !ONLY.test(`${role} ${route}`)) continue;
      const page = await ctx.newPage();
      // `/path#widget`: audited with the customer lookup widget open (MRV-9.2).
      const [address, step] = route.split('#');
      await page.goto(BASE + address, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !document.querySelector('.skeleton, [aria-busy="true"]'), null, { timeout: 8000 }).catch(() => {});
      if (step === 'widget') {
        await page.locator('button[aria-haspopup="dialog"]').first().click();
        await page.waitForSelector('[role="dialog"][data-popover] [data-testid="lookup-facts"]', { timeout: 8000 });
      }
      await page.waitForTimeout(500);
      const landed = new URL(page.url()).pathname;
      await page.addScriptTag({ content: axeSrc });
      const result = await page.evaluate(async (tags) => {
        const r = await window.axe.run(document, { runOnly: tags });
        return r.violations.map((v) => `${v.id}[${v.impact}] x${v.nodes.length} ${v.nodes.map((n) => n.target.join('>')).join(',').slice(0, 160)}`);
      }, TAGS);
      checked++;
      if (landed !== address && !(route === '/admin' && landed.startsWith('/admin'))) { console.log(`${role}\t${route}\t${width}\tREDIRECTED to ${landed}`); failures++; }
      if (result.length) failures += result.length;
      console.log(`${role}\t${route}\t${width}\t${result.length ? result.join('; ') : 'none'}`);
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`SUMMARY {"checked":${checked},"violations":${failures},"skipped":${skipped}}`);
process.exit(failures || skipped ? 1 : 0);
