/**
 * MEDIÇÃO do lançador flutuante do Assistente (FAB) contra os controles das
 * telas de operação em viewports ESTREITAS (< 960px).
 *
 * Por que existe: o shell só reserva a calha lateral do FAB em
 * `@media (min-width: 960px)` (SicatAppShell). Abaixo disso valem apenas a
 * faixa inferior (`--assistant-launcher-space`) e o rodapé do shell — e a
 * pergunta "o FAB cobre ações de linha em telas estreitas?" precisa ser
 * respondida por MEDIÇÃO, não por impressão.
 *
 * Como mede (teste DIFERENCIAL — evita falso positivo):
 *   1. esconde o FAB (`visibility: hidden`, sai do hit-test) e verifica quais
 *      pontos de cada controle são de fato CLICÁVEIS. Isso descarta o que já
 *      está clipado pelo scroller interno do shell (`.sicat-shell__content`
 *      tem `overflow-y: auto`: elementos abaixo do corte continuam com
 *      `getBoundingClientRect` dentro da viewport, mas ninguém os clica);
 *   2. mostra o FAB de novo e refaz o hit-test só nesses pontos. Só conta como
 *      falha o ponto que ERA clicável e passou a devolver o FAB.
 *
 * Sem o passo 1 a medição acusa como "coberto" botão que estava apenas fora da
 * área visível do scroller.
 */
import { test, expect } from '@playwright/test';

const NARROW_VIEWPORTS = [
  { name: '375px (celular)', width: 375, height: 812 },
  { name: '768px (tablet retrato)', width: 768, height: 1024 },
  { name: '900px (tablet paisagem)', width: 900, height: 800 }
];

function buildAccount(accountType) {
  return {
    accountId: 'acc_test_01',
    partnerCode: 176163,
    partnerDocument: '31.913.781/0001-39',
    partnerName: 'Parceiro Teste',
    accountType,
    isActive: true
  };
}

const ACTIVE_SESSION_CONTEXT = {
  sessionContextId: 'ctx_test_01',
  id: 'ctx_test_01',
  integrationAccountId: 'acc_test_prod',
  status: 'active'
};

/**
 * Na persona `receiver` a linha ganha o botão "Receber" — justamente o controle
 * que a auditoria disse estar coberto. Ele só aparece com snapshot externo e
 * status elegível (`canReceiveOperationalManifest`).
 */
function buildManifests(total, accountType) {
  const isReceiver = accountType === 'receiver';
  return Array.from({ length: total }, (_, index) => ({
    id: `man_ui_${String(index + 1).padStart(3, '0')}`,
    manifestNumber: `2600100000${String(index + 1).padStart(2, '0')}`,
    status: isReceiver ? 'submitted' : 'draft',
    externalStatus: isReceiver ? 'em_transporte' : 'pending_submission',
    expeditionDate: '2026-03-10',
    createdAt: '2026-03-10T12:00:00.000Z',
    generator: { description: 'Empresa Teste LTDA' },
    carrier: { description: 'Transportadora Teste LTDA' },
    receiver: { description: 'Destinador Teste LTDA' },
    ...(isReceiver
      ? {
        externalReference: {
          manNumero: `2600100000${String(index + 1).padStart(2, '0')}`,
          manCodigo: 10000 + index,
          manHashCode: `hash-ui-${index + 1}`
        }
      }
      : {})
  }));
}

async function seedSession(page, accountType) {
  await page.addInitScript((account) => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    localStorage.setItem('sicat_session_access_token', 'test-token');
    localStorage.setItem('sicat_session_refresh_token', 'test-refresh-token');
    localStorage.setItem('sicat_session_expires_at', expiresAt);
    localStorage.setItem('sicat_session_user', JSON.stringify({ name: 'Usuário Teste', email: 'user@test.com', userId: 1 }));
    localStorage.setItem('sicat_active_cetesb_account', JSON.stringify(account));
    localStorage.setItem('sicat_active_session_context', JSON.stringify({
      sessionContextId: 'ctx_test_01',
      id: 'ctx_test_01',
      integrationAccountId: 'acc_test_prod',
      status: 'active'
    }));
    localStorage.setItem('sicat_active_integration_account_id', 'acc_test_prod');
    // O FAB é arrastável e persiste a posição: garante a posição PADRÃO (canto
    // inferior direito) para a medição não depender de estado anterior.
    localStorage.removeItem('sicat_copilot_launcher_pos');
  }, buildAccount(accountType));
}

async function mockApi(page, accountType) {
  const activeAccount = buildAccount(accountType);
  const items = buildManifests(30, accountType);

  // ATENÇÃO à ordem: no Playwright a rota registrada por ÚLTIMO tem
  // precedência. O curinga vem PRIMEIRO justamente para que os mocks
  // específicos abaixo continuem valendo — invertendo isso o `/v1/sicat/session`
  // cai no curinga, o app se considera deslogado, o shell nem monta e a medição
  // passaria "verde" sem ter medido nada.
  await page.route('**/v1/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0, items: [] })
  }));

  await page.route('**/v1/sicat/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: { userId: 'usr_test_ui_001', name: 'Usuário UI Teste', email: 'ui@test.com', roles: ['operator'] },
      activeAccount,
      sessionContext: ACTIVE_SESSION_CONTEXT
    })
  }));

  await page.route('**/v1/sicat/cetesb-accounts**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ activeAccountId: activeAccount.accountId, accounts: [activeAccount] })
  }));

  await page.route('**/v1/manifestos?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ page: 1, pageSize: 30, totalItems: items.length, totalPages: 1, items })
  }));

  await page.route('**/v1/catalogs/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ page: 1, pageSize: 50, totalItems: 0, totalPages: 0, items: [] })
  }));
}

/** Roda DENTRO da página: devolve os controles que o FAB rouba do operador. */
const COLLECT_BLOCKED = () => {
  const fab = document.querySelector('[data-testid="copilot-launcher-btn"]');
  if (!fab) return { fab: null, blocked: [], error: 'FAB ausente (o app montou deslogado?)' };

  const fabRect = fab.getBoundingClientRect();
  const selector = 'button, a[href], [role="button"], input, select, textarea, .v-checkbox-btn';
  const candidates = [...document.querySelectorAll(selector)].filter((el) => {
    if (el === fab || fab.contains(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
    if (r.right <= 0 || r.left >= window.innerWidth) return false;
    // só interessa quem divide área com o FAB
    const ox = Math.min(r.right, fabRect.right) - Math.max(r.left, fabRect.left);
    const oy = Math.min(r.bottom, fabRect.bottom) - Math.max(r.top, fabRect.top);
    return ox > 0 && oy > 0;
  });

  // Amostra pontos DENTRO da área que o FAB divide com o controle. Amostrar o
  // controle inteiro deixaria passar a cobertura PARCIAL (foi exatamente a
  // queixa da auditoria: "44x28px do botão Receber cobertos") — o centro segue
  // clicável enquanto a beirada some sob o FAB.
  const samplePoints = (r) => {
    const left = Math.max(r.left, fabRect.left);
    const right = Math.min(r.right, fabRect.right);
    const top = Math.max(r.top, fabRect.top);
    const bottom = Math.min(r.bottom, fabRect.bottom);
    if (right <= left || bottom <= top) return [];

    const ratios = [0.1, 0.3, 0.5, 0.7, 0.9];
    const points = [];
    for (const rx of ratios) {
      for (const ry of ratios) {
        const x = left + (right - left) * rx;
        const y = top + (bottom - top) * ry;
        if (x < 1 || y < 1 || x > window.innerWidth - 1 || y > window.innerHeight - 1) continue;
        points.push([x, y]);
      }
    }
    return points;
  };

  const hitsSelf = (el, x, y) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target && (target === el || el.contains(target) || target.contains(el)));
  };

  // Passo 1: sem o FAB no hit-test, quais pontos são realmente clicáveis?
  const previousVisibility = fab.style.visibility;
  fab.style.visibility = 'hidden';
  const reachable = candidates.map((el) => ({
    el,
    rect: el.getBoundingClientRect(),
    points: samplePoints(el.getBoundingClientRect()).filter(([x, y]) => hitsSelf(el, x, y))
  })).filter((entry) => entry.points.length > 0);
  fab.style.visibility = previousVisibility;

  // Passo 2: com o FAB de volta, quais desses pontos passam a cair no FAB?
  const blocked = [];
  for (const entry of reachable) {
    const stolen = entry.points.filter(([x, y]) => {
      const target = document.elementFromPoint(x, y);
      return Boolean(target && (target === fab || fab.contains(target)));
    });
    if (stolen.length === 0) continue;
    blocked.push({
      label: (entry.el.getAttribute('aria-label') || entry.el.textContent || entry.el.tagName)
        .trim().replace(/\s+/g, ' ').slice(0, 48),
      rect: {
        x: Math.round(entry.rect.left),
        y: Math.round(entry.rect.top),
        w: Math.round(entry.rect.width),
        h: Math.round(entry.rect.height)
      },
      pontosRoubados: `${stolen.length}/${entry.points.length}`
    });
  }

  const blockedElements = new Set(blocked.map((_, index) => index));
  const sobrepostos = candidates.map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName)
    .trim().replace(/\s+/g, ' ').slice(0, 32));

  return {
    fab: {
      x: Math.round(fabRect.left),
      y: Math.round(fabRect.top),
      w: Math.round(fabRect.width),
      h: Math.round(fabRect.height)
    },
    candidatosSobrepostos: candidates.length,
    sobrepostos,
    clicaveisSobrepostos: reachable.length,
    blockedCount: blockedElements.size,
    blocked
  };
};

/** Varre a rolagem do scroller interno do shell + a rolagem horizontal das tabelas. */
async function auditAtScrollPositions(page) {
  const report = [];
  const steps = [0, 0.25, 0.5, 0.75, 1];

  for (const ratio of steps) {
    const scrollTop = await page.evaluate((r) => {
      const scroller = document.querySelector('.sicat-shell__content') || document.scrollingElement;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.round(max * r);
      document.querySelectorAll('.v-table__wrapper, .manifests-table-shell').forEach((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      return { scrollTop: scroller.scrollTop, max };
    }, ratio);

    await page.waitForTimeout(120);
    const result = await page.evaluate(COLLECT_BLOCKED);
    report.push({ scroll: scrollTop, ...result });
  }

  return report;
}

async function auditRoute(page, viewport, path, accountType = 'generator') {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await seedSession(page, accountType);
  await mockApi(page, accountType);
  await page.goto(path);
  await expect(page.locator('[data-testid="copilot-launcher-btn"]')).toBeVisible();
  await page.waitForTimeout(500);

  const report = await auditAtScrollPositions(page);
  const blocked = report.flatMap((entry) => entry.blocked.map((hit) => ({ scrollTop: entry.scroll.scrollTop, ...hit })));

  // eslint-disable-next-line no-console
  console.log(`[${path} ${accountType} ${viewport.name}] fab=${JSON.stringify(report[0]?.fab)} scrollMax=${report[0]?.scroll?.max}`
    + ` sobrepostos=${report.map((e) => e.candidatosSobrepostos).join('/')}`
    + ` clicaveisSobrepostos=${report.map((e) => e.clicaveisSobrepostos).join('/')}`
    + ` rotulosSobrepostos=${JSON.stringify([...new Set(report.flatMap((e) => e.sobrepostos))])}`
    + ` bloqueados=${JSON.stringify(blocked)}`);

  return blocked;
}

test.describe('FAB do Assistente x controles em viewport estreita', () => {
  for (const viewport of NARROW_VIEWPORTS) {
    test(`/manifestos: nenhum controle clicável fica sob o FAB em ${viewport.name}`, async ({ page }) => {
      const blocked = await auditRoute(page, viewport, '/manifestos');
      expect(blocked, `Controles cobertos pelo FAB: ${JSON.stringify(blocked)}`).toEqual([]);
    });

    test(`/manifestos (persona destinador, botão Receber na linha): nada sob o FAB em ${viewport.name}`, async ({ page }) => {
      const blocked = await auditRoute(page, viewport, '/manifestos', 'receiver');
      expect(blocked, `Controles cobertos pelo FAB: ${JSON.stringify(blocked)}`).toEqual([]);
    });

    test(`/sessao: nenhum controle clicável fica sob o FAB em ${viewport.name}`, async ({ page }) => {
      const blocked = await auditRoute(page, viewport, '/sessao');
      expect(blocked, `Controles cobertos pelo FAB: ${JSON.stringify(blocked)}`).toEqual([]);
    });
  }

  /**
   * CONTROLE NEGATIVO do instrumento. Sem ele, "0 controles bloqueados" não
   * prova nada: podia ser o medidor cego (FAB não montado, seletor errado,
   * hit-test sempre devolvendo o elemento certo). Aqui o FAB é inflado de
   * propósito até cobrir a área útil — a medição TEM de acusar bloqueio.
   */
  test('controle negativo: FAB inflado é detectado como bloqueador', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await seedSession(page, 'generator');
    await mockApi(page, 'generator');
    await page.goto('/manifestos');
    await expect(page.locator('[data-testid="copilot-launcher-btn"]')).toBeVisible();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fab = document.querySelector('[data-testid="copilot-launcher-btn"]');
      fab.style.width = '600px';
      fab.style.height = '600px';
      fab.style.bottom = '120px';
      fab.style.right = '20px';
    });
    await page.waitForTimeout(120);

    const result = await page.evaluate(COLLECT_BLOCKED);
    // eslint-disable-next-line no-console
    console.log('[controle negativo] bloqueados=', JSON.stringify(result.blocked));
    expect(result.blocked.length, 'o medidor não detectou nem um FAB de 600x600 — instrumento cego').toBeGreaterThan(0);
  });
});
