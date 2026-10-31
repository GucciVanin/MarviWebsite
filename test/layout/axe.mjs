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
  employee: { email: 'funcionario@demo.marvi.test', password: 'Demo-Func-1!', routes: ['/employee', '/employee#widget', '/employee#order', '/employee/historico', '/employee/historico#history-orders', '/employee/clientes/C-000001', '/employee/clientes/C-999999'] },
  cliente: { email: 'cliente@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal', '/portal#address-add', '/portal#address-edit', '/portal#delivery-coverage', '/portal#delivery-change'] },
  mercado: { email: 'mercado@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
  pendente: { email: 'pendente@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
  suspenso: { email: 'suspenso@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
  pessoa: { email: 'pessoa@demo.marvi.test', password: 'Demo-Cliente-1!', routes: ['/portal'] },
};
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  ACCOUNTS.admin = {
    email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
    routes: ['/admin', '/admin/visao-geral', '/admin/catalogo', '/admin/precos', '/admin/operacao', '/admin/clientes', '/admin/clientes#address-fix', '/admin/clientes#registration', '/admin/clientes#registration-personal', '/admin/clientes#reveal', '/admin/importacao', '/admin/auditoria'],
  };
}

// The registration page is public (no account): its two account types are audited signed out (MRV-9.4).
ACCOUNTS.visitante = { routes: ['/register#business', '/register#personal'] };

const browser = await chromium.launch();
let failures = 0, checked = 0, skipped = 0;
for (const [role, account] of Object.entries(ACCOUNTS)) {
  let token = null;
  if (account.email) {
    const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
    if (!res.ok) { console.log(`${role}\tSKIPPED sign-in failed (${res.status})`); skipped++; continue; }
    token = (await res.json()).token;
  }
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 900 }, locale: 'pt-BR', reducedMotion: 'reduce', bypassCSP: true });
    await ctx.addInitScript(([tk, tv, pk]) => { try { if (tv) localStorage.setItem(tk, tv); localStorage.setItem(pk, '1'); } catch { /* no storage */ } }, [TOKEN_KEY, token, PRIVACY_KEY]);
    for (const route of account.routes) {
      if (ONLY && !ONLY.test(`${role} ${route}`)) continue;
      const page = await ctx.newPage();
      // `/path#step`: audited with the customer lookup widget (MRV-9.2) or an address form (MRV-9.3) open; nothing is submitted.
      const [address, step] = route.split('#');
      await page.goto(BASE + address, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !document.querySelector('.skeleton, [aria-busy="true"]'), null, { timeout: 8000 }).catch(() => {});
      if (step === 'widget') {
        await page.locator('button[aria-haspopup="dialog"]').first().click();
        await page.waitForSelector('[role="dialog"][data-popover] [data-testid="lookup-facts"]', { timeout: 8000 });
      }
      if (step === 'business') {
        await page.locator('#register-type-business').click();
        await page.locator('#register-cnpj').fill('12abc34501de35');
      } else if (step === 'personal') {
        await page.locator('#register-type-personal').click();
        await page.locator('#register-cpf').fill('11144477735');
        await page.locator('#register-birth').fill('2020-01-01');
      } else if (step === 'registration' || step === 'registration-personal' || step === 'reveal') {
        const type = step === 'registration' ? 'Empresa' : 'Pessoa física';
        await page.locator('[data-testid="customer"]', { hasText: type }).first().getByRole('button', { name: 'Editar' }).click();
        await page.waitForSelector('#admin-registration-name', { timeout: 8000 });
        if (step === 'reveal') {
          await page.getByRole('button', { name: 'Mostrar CPF' }).click();
          await page.waitForSelector('#admin-reveal-reason', { timeout: 8000 });
        }
      } else if (step === 'address-add') {
        await page.getByRole('button', { name: 'Adicionar endereço' }).click();
        await page.waitForSelector('#address-new-cep', { timeout: 8000 });
      } else if (step === 'address-edit') {
        await page.locator('[data-testid="address"]').first().getByRole('button', { name: 'Editar' }).click();
        await page.waitForSelector('#address-edit-cep', { timeout: 8000 });
      } else if (step === 'delivery-coverage') {
        await page.getByRole('button', { name: 'Verificar cobertura' }).first().click();
        await page.waitForSelector('[data-testid="delivery-coverage-failed"], [data-testid="delivery-coverage-result"]:not(:empty)', { timeout: 15000 });
      } else if (step === 'delivery-change') {
        await page.getByRole('button', { name: 'Alterar endereço de entrega' }).first().click();
        await page.waitForSelector('[data-testid="quote-change-address"] [data-testid="delivery-select"]', { timeout: 8000 });
      } else if (step === 'order') {
        await page.locator('button[aria-haspopup="dialog"]').first().click();
        await page.waitForSelector('[role="dialog"][data-popover] [data-testid="lookup-facts"]', { timeout: 8000 });
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid="order-delivery"] [data-testid="delivery-select"]', { timeout: 8000 });
      } else if (step === 'history-orders') {
        await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
        await page.waitForSelector('[data-testid="history-item"] [data-testid="delivery-to"]', { timeout: 8000 });
      } else if (step === 'address-fix') {
        await page.locator('[data-testid="customer"]').first().getByRole('button', { name: 'Editar' }).click();
        await page.waitForSelector('[data-testid="customer-addresses"] li', { timeout: 8000 });
        await page.locator('[data-testid="customer-addresses"] li').first().getByRole('button', { name: 'Corrigir endereço' }).click();
        await page.waitForSelector('#admin-address-cep', { timeout: 8000 });
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
