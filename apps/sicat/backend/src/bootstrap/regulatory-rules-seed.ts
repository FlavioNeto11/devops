/**
 * Seed do catálogo regulatório da vertical TRANSPORTE (PR-A1 do programa "SICAT Transporte").
 *
 * Molde: `bootstrap/access-control-seed.ts` (fase 4.5) — mesmas regras de ouro:
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────────────────────────
 * Chave = UNIQUE NATURAL, JAMAIS a PK (`createPrefixedId` é randômico — `on conflict (id)`
 * duplicaria o catálogo a cada boot). As chaves naturais da migration 021:
 * `regulatory_sources.reference`, `regulatory_rules.code`,
 * `regulatory_rule_versions (rule_id, version_label)`.
 *
 * O seed pode rodar em DOIS pods ao mesmo tempo (api e worker sobem juntos com `AUTO_SEED=true`).
 * Todo statement é UM SÓ, com `on conflict`; a ordem alfabética fixa transforma a corrida em
 * espera de índice em vez de deadlock. Uma única transação: "morreu no meio" não existe como estado.
 *
 * ── PROPRIEDADE POR COLUNA ──────────────────────────────────────────────────────────────────────
 * O seed é dono da DEFINIÇÃO (título, base legal, summary, severidade, gate, ordem); o OPERADOR é
 * dono da DECISÃO (`implementation_state`, `blocking`, `reviewed_by`, `reviewed_at` nas versões;
 * `monitoring_status`, `review_status`, `reviewed_*`, `notes`, `effective_until` nas fontes).
 * Por isso os campos de decisão ficam FORA de todo `do update`: se o seed reescrevesse
 * `implementation_state`, um REVOKED aplicado pelo operador seria desfeito no próximo boot, sem
 * aviso. O seed declara PISO, nunca TETO: só insere, nunca apaga, nunca rebaixa decisão humana.
 *
 * ── REGRA DE OURO DO PROGRAMA ───────────────────────────────────────────────────────────────────
 * TODA versão nasce `blocking = false` — o insert grava o literal `false`, a estrutura declarativa
 * nem carrega o campo. Promoção a bloqueante é ato do operador e é travada em DDL pelo
 * `chk_regrulev_blocking_reviewed` (ACTIVE + blocking exige reviewed_by/reviewed_at).
 *
 * ── TESTABILIDADE ───────────────────────────────────────────────────────────────────────────────
 * `buildRegulatoryCatalogSeed()` (estrutura declarativa) e
 * `buildRegulatoryCatalogSeedStatements()` (SQL + params) são funções PURAS: o teste unitário
 * afirma sobre o SQL que realmente vai ao banco (nenhum `delete`, todo insert com `on conflict`,
 * campos de decisão fora de todo `do update`) sem precisar de banco.
 */

import type { PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';
import { resolveVersionFromList } from '../lib/transport/regulatory-temporal.js';
import {
  RULE_CODES,
  type ComplianceGate,
  type RegulatoryDomain,
  type RegulatorySourceIssuer,
  type RegulatorySourceType,
  type RuleImplementationState,
  type RuleSeverity
} from '../lib/transport/regulatory-types.js';

export type RegulatoryCatalogSeedStatement = {
  /** Rótulo estável — usado no resultado e nas asserções de teste. */
  name: string;
  sql: string;
  params: unknown[];
};

export type RegulatorySourceSeed = {
  /** Chave natural (`regulatory_sources.reference`). */
  reference: string;
  sourceType: RegulatorySourceType;
  issuer: RegulatorySourceIssuer;
  title: string;
  publishedAt?: string | null;
  effectiveFrom?: string | null;
};

export type RegulatoryRuleVersionSeed = {
  /** Chave natural junto com o code da regra (`(rule_id, version_label)`). */
  versionLabel: string;
  legalBasis: Array<{ reference: string }>;
  summary: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  /** Estado INICIAL — inserido uma vez, depois pertence ao operador (fora do `do update`). */
  implementationState: RuleImplementationState;
  severity: RuleSeverity;
};

export type RegulatoryRuleSeed = {
  /** Chave natural (`regulatory_rules.code`). */
  code: string;
  title: string;
  domain: RegulatoryDomain;
  defaultGate: ComplianceGate;
  displayOrder: number;
  versions: RegulatoryRuleVersionSeed[];
};

export type RegulatoryCatalogSeed = {
  sources: RegulatorySourceSeed[];
  rules: RegulatoryRuleSeed[];
};

export type RegulatoryCatalogSeedResult = {
  sourcesReconciled: number;
  rulesReconciled: number;
  ruleVersionsReconciled: number;
};

/**
 * Colunas de CONTEÚDO reconciliadas no `on conflict do update` — a lista é exportada para o
 * teste unitário afirmar que nenhum campo de decisão do operador aparece aqui. `updated_at`
 * NÃO entra: o trigger `increment_version` cuida de `version`/`updated_at` quando (e somente
 * quando) o conteúdo realmente muda — reboot sem mudança é no-op de verdade.
 */
export const SOURCE_UPDATE_COLUMNS = [
  'source_type',
  'title',
  'issuer',
  'published_at',
  'effective_from'
] as const;

export const RULE_UPDATE_COLUMNS = [
  'title',
  'description',
  'default_gate',
  'display_order'
] as const;

export const RULE_VERSION_UPDATE_COLUMNS = [
  'legal_basis',
  'summary',
  'severity'
] as const;

/** Campos de decisão do OPERADOR — jamais podem aparecer em nenhum `do update`. */
export const OPERATOR_OWNED_COLUMNS = [
  'implementation_state',
  'blocking',
  'reviewed_by',
  'reviewed_at',
  'review_status',
  'monitoring_status',
  'notes',
  'effective_until'
] as const;

/**
 * Referências de base legal SEM fonte semeada (ajustes SINIEF/MOC fiscais — entram como fonte
 * própria quando a Fase E importar XML). A asserção de integridade usa esta lista para não
 * gritar falso positivo, mas qualquer referência fora dela E fora das fontes é typo e falha alto.
 */
export const KNOWN_EXTERNAL_REFERENCES = [
  'Ajustes SINIEF / MOC NF-e',
  'Ajustes SINIEF / MOC CT-e',
  'Ajustes SINIEF / MOC MDF-e'
] as const;

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Fontes normativas (13). Todas nascem `review_status = pending_review` e
// `monitoring_status = monitored` (defaults da migration 021) — revisão é ato do operador.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const SEEDED_SOURCES: RegulatorySourceSeed[] = [
  {
    reference: 'Lei 11.442/2007',
    sourceType: 'law',
    issuer: 'CONGRESSO',
    title: 'Lei do Transporte Rodoviário de Cargas (TRC) — transportadores e RNTRC'
  },
  {
    reference: 'Lei 13.703/2018',
    sourceType: 'law',
    issuer: 'CONGRESSO',
    title: 'Política Nacional de Pisos Mínimos do Transporte Rodoviário de Cargas'
  },
  {
    reference: 'Lei 10.209/2001',
    sourceType: 'law',
    issuer: 'CONGRESSO',
    title: 'Vale-Pedágio Obrigatório (VPO) no transporte rodoviário de carga'
  },
  {
    reference: 'Lei 14.599/2023',
    sourceType: 'law',
    issuer: 'CONGRESSO',
    title: 'Seguros obrigatórios do TRC (RCTR-C, RC-DC, RC-V) e PGR'
  },
  {
    reference: 'Lei 15.485/2026',
    sourceType: 'law',
    issuer: 'CONGRESSO',
    title: 'Conversão da MP 1.343/2026 — modernização do TRC (CIOT, pagamento, RNTRC)',
    publishedAt: '2026-08-06',
    effectiveFrom: '2026-08-06'
  },
  {
    reference: 'Res. ANTT 5.862/2019',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'CIOT — Código Identificador da Operação de Transporte (TAC e equiparados)'
  },
  {
    reference: 'Res. ANTT 5.867/2020',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'Pisos mínimos de frete — metodologia e tabelas A/B/C/D'
  },
  {
    reference: 'Res. ANTT 6.076/2026',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'Altera a metodologia de cálculo dos pisos mínimos de frete (Res. ANTT 5.867/2020)',
    publishedAt: '2026-01-19',
    effectiveFrom: '2026-01-19'
  },
  {
    reference: 'Res. ANTT 6.084/2026',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'Atualiza as tabelas de coeficientes do piso mínimo de frete (PR-B1: Tabela A carregada'
      + ' como pending_review — pendência P3 do guia)',
    publishedAt: '2026-07-17',
    effectiveFrom: '2026-07-17'
  },
  {
    reference: 'Res. ANTT 5.982/2022',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'RNTRC — Registro Nacional de Transportadores Rodoviários de Cargas'
  },
  {
    reference: 'Res. ANTT 6.024/2023',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'Vale-Pedágio Obrigatório — regulamentação e meios de pagamento'
  },
  {
    reference: 'Res. ANTT 6.078/2026',
    sourceType: 'antt_resolution',
    issuer: 'ANTT',
    title: 'CIOT universal para toda operação de transporte remunerada',
    effectiveFrom: '2026-05-24'
  },
  {
    reference: 'Portaria SUROC 6/2026',
    sourceType: 'antt_portaria',
    issuer: 'ANTT',
    title: 'Procedimentos operacionais do CIOT universal (Res. ANTT 6.078/2026)'
  },
  {
    reference: 'Veto 43/2026',
    sourceType: 'veto',
    issuer: 'PRESIDENCIA',
    title: 'Veto parcial à Lei 15.485/2026 (ex.: antecipação de 70% do frete) — pendência P1'
  },
  {
    reference: 'NT MDF-e 2026.001',
    sourceType: 'technical_note',
    issuer: 'CONFAZ',
    title: 'Nota Técnica MDF-e 2026.001 — campos de CIOT/VPO no MDF-e'
  }
];

// ───────────────────────────────────────────────────────────────────────────────────────────────
// As 27 regras TR-* do catálogo: 26 da baseline (guia do programa, matriz de rastreabilidade)
// + TR-SEG-004 (limite de garantia por viagem — PR-I2 do Módulo Transportadora, REQ-SICAT-0028
// rev.2). Uma versão 'v2026-08-baseline' por regra, EXCETO TR-CIOT-001 (duas versões: a virada
// do CIOT universal em 24/05/2026 é a primeira fronteira temporal real do catálogo).
// ───────────────────────────────────────────────────────────────────────────────────────────────

const BASELINE_LABEL = 'v2026-08-baseline';

const LEGAL_RNTRC = [{ reference: 'Lei 11.442/2007' }, { reference: 'Res. ANTT 5.982/2022' }];
const LEGAL_PMF = [
  { reference: 'Lei 13.703/2018' },
  { reference: 'Res. ANTT 5.867/2020' },
  { reference: 'Lei 15.485/2026' }
];
/**
 * TR-PMF-002/003/004 (não TR-PMF-001, que só classifica aplicabilidade) citam também as normas
 * que sustentam o CÁLCULO efetivo entregue no PR-B1: Res. ANTT 6.076/2026 (nova metodologia,
 * 19/01/2026) e Res. ANTT 6.084/2026 (tabelas de coeficientes atualizadas, vigência 17/07/2026 —
 * a mesma tabela carregada por `npm run load:freight-floor` como `pending_review`).
 */
const LEGAL_PMF_FLOOR_TABLES = [
  ...LEGAL_PMF,
  { reference: 'Res. ANTT 6.076/2026' },
  { reference: 'Res. ANTT 6.084/2026' }
];
const LEGAL_CIOT = [
  { reference: 'Res. ANTT 5.862/2019' },
  { reference: 'Res. ANTT 6.078/2026' },
  { reference: 'Lei 15.485/2026' },
  { reference: 'Portaria SUROC 6/2026' }
];
const LEGAL_VPO = [{ reference: 'Lei 10.209/2001' }, { reference: 'Res. ANTT 6.024/2023' }];
const LEGAL_SEG = [{ reference: 'Lei 14.599/2023' }];

function baselineVersion(input: {
  legalBasis: Array<{ reference: string }>;
  summary: string;
  effectiveFrom: string;
  implementationState: RuleImplementationState;
  severity: RuleSeverity;
}): RegulatoryRuleVersionSeed {
  return { versionLabel: BASELINE_LABEL, ...input };
}

const SEEDED_RULES: RegulatoryRuleSeed[] = [
  {
    code: 'TR-RNTRC-001',
    title: 'RNTRC regular para a operação',
    domain: 'RNTRC',
    defaultGate: 'GATE_CONTRACT',
    displayOrder: 10,
    versions: [baselineVersion({
      legalBasis: LEGAL_RNTRC,
      summary: 'Transportador com RNTRC ativo e regular para operar transporte remunerado.',
      effectiveFrom: '2007-01-05',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-RNTRC-002',
    title: 'Veículo compatível com transportador/operação',
    domain: 'RNTRC',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 20,
    versions: [baselineVersion({
      legalBasis: LEGAL_RNTRC,
      summary: 'Veículo vinculado/compatível com o registro do transportador e com a operação.',
      effectiveFrom: '2022-01-01',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-RNTRC-003',
    title: 'Revalidação anual quando exigível',
    domain: 'RNTRC',
    defaultGate: 'GATE_CONTRACT',
    displayOrder: 30,
    versions: [baselineVersion({
      legalBasis: [...LEGAL_RNTRC, { reference: 'Lei 15.485/2026' }],
      summary: 'Revalidação anual do RNTRC prevista na Lei 15.485/2026 — aguardando '
        + 'regulamentação ANTT complementar (pendência P2 do guia).',
      effectiveFrom: '2026-08-06',
      implementationState: 'AWAITING_REGULATION',
      severity: 'info'
    })]
  },
  {
    code: 'TR-PMF-001',
    title: 'Determinar aplicabilidade do piso',
    domain: 'PMF',
    defaultGate: 'GATE_PROPOSAL',
    displayOrder: 40,
    versions: [baselineVersion({
      legalBasis: LEGAL_PMF,
      summary: 'Toda operação classifica a aplicabilidade do piso mínimo de frete (aplicável, '
        + 'não aplicável com justificativa).',
      effectiveFrom: '2018-08-09',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-PMF-002',
    title: 'Não permitir oferta/publicação abaixo do piso',
    domain: 'PMF',
    defaultGate: 'GATE_PROPOSAL',
    displayOrder: 50,
    versions: [baselineVersion({
      legalBasis: LEGAL_PMF_FLOOR_TABLES,
      summary: 'Oferta/publicação de frete não pode ficar abaixo do piso vigente quando aplicável.',
      effectiveFrom: '2018-08-09',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-PMF-003',
    title: 'Não permitir contratação abaixo do piso',
    domain: 'PMF',
    defaultGate: 'GATE_CONTRACT',
    displayOrder: 60,
    versions: [baselineVersion({
      legalBasis: LEGAL_PMF_FLOOR_TABLES,
      summary: 'Contratação de frete não pode ficar abaixo do piso vigente quando aplicável.',
      effectiveFrom: '2018-08-09',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-PMF-004',
    title: 'Usar versão do piso vigente na data',
    domain: 'PMF',
    defaultGate: 'GATE_PROPOSAL',
    displayOrder: 70,
    versions: [baselineVersion({
      legalBasis: LEGAL_PMF_FLOOR_TABLES,
      summary: 'Cálculo do piso usa a versão da tabela vigente na data da operação '
        + '(freight_floor_versions), nunca coeficiente hardcoded.',
      effectiveFrom: '2018-08-09',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-CIOT-001',
    title: 'Obrigatoriedade do CIOT',
    domain: 'CIOT',
    defaultGate: 'GATE_CIOT',
    displayOrder: 80,
    versions: [
      {
        versionLabel: 'v2019-baseline',
        legalBasis: [{ reference: 'Res. ANTT 5.862/2019' }],
        summary: 'Obrigatoriedade restrita a TAC/equiparados.',
        effectiveFrom: '2019-01-28',
        effectiveUntil: '2026-05-23',
        implementationState: 'SUPERSEDED',
        severity: 'warning'
      },
      {
        versionLabel: 'v2026-05-universal',
        legalBasis: LEGAL_CIOT,
        summary: 'CIOT universal para toda operação remunerada (Res. 6.078/2026).',
        effectiveFrom: '2026-05-24',
        implementationState: 'ACTIVE',
        severity: 'critical'
      }
    ]
  },
  {
    code: 'TR-CIOT-002',
    title: 'CIOT antes do início da operação',
    domain: 'CIOT',
    defaultGate: 'GATE_RELEASE',
    displayOrder: 90,
    versions: [baselineVersion({
      legalBasis: LEGAL_CIOT,
      summary: 'CIOT registrado ANTES da liberação/início da operação.',
      effectiveFrom: '2026-05-24',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-CIOT-003',
    title: 'Responsável pelo CIOT conforme enquadramento',
    domain: 'CIOT',
    defaultGate: 'GATE_CIOT',
    displayOrder: 100,
    versions: [baselineVersion({
      legalBasis: LEGAL_CIOT,
      summary: 'A responsabilidade pela declaração do CIOT segue o enquadramento da operação '
        + '(Lei 15.485/2026).',
      effectiveFrom: '2026-08-06',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-CIOT-004',
    title: 'Dados obrigatórios do CIOT completos',
    domain: 'CIOT',
    defaultGate: 'GATE_CIOT',
    displayOrder: 110,
    versions: [baselineVersion({
      legalBasis: LEGAL_CIOT,
      summary: 'Conjunto mínimo de dados do CIOT completo e consistente (validação local de '
        + 'completude).',
      effectiveFrom: '2026-08-06',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-CIOT-005',
    title: 'CIOT vinculado ao MDF-e quando aplicável',
    domain: 'CIOT',
    defaultGate: 'GATE_FISCAL',
    displayOrder: 120,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'Lei 15.485/2026' }, { reference: 'NT MDF-e 2026.001' }],
      summary: 'CIOT referenciado no MDF-e quando exigido — cronograma da NT MDF-e 2026.001 '
        + 'em revisão (pendência P7 do guia).',
      effectiveFrom: '2026-08-06',
      implementationState: 'UNDER_REVIEW',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-PAY-001',
    title: 'Prazo/forma de pagamento conforme norma vigente',
    domain: 'PAY',
    defaultGate: 'GATE_CONTRACT',
    displayOrder: 130,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'Lei 15.485/2026' }],
      summary: 'Prazo e forma de pagamento do frete conforme a norma vigente (Lei 15.485/2026: '
        + '30 dias úteis).',
      effectiveFrom: '2026-08-06',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-VPO-001',
    title: 'Determinar aplicabilidade do VPO',
    domain: 'VPO',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 140,
    versions: [baselineVersion({
      legalBasis: LEGAL_VPO,
      summary: 'VPO não é checkbox universal: aplicabilidade determinada por operação, com '
        + 'NOT_APPLICABLE justificado.',
      effectiveFrom: '2001-03-23',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-VPO-002',
    title: 'VPO antecipado antes do embarque quando aplicável',
    domain: 'VPO',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 150,
    versions: [baselineVersion({
      legalBasis: LEGAL_VPO,
      summary: 'Vale-pedágio antecipado ao transportador antes do início da viagem quando '
        + 'aplicável.',
      effectiveFrom: '2001-03-23',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-VPO-003',
    title: 'Valor do VPO separado do frete',
    domain: 'VPO',
    defaultGate: 'GATE_CONTRACT',
    displayOrder: 160,
    versions: [baselineVersion({
      legalBasis: LEGAL_VPO,
      summary: 'O valor do vale-pedágio não integra o valor do frete (destaque separado).',
      effectiveFrom: '2001-03-23',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-VPO-004',
    title: 'Referência do VPO no MDF-e quando exigida',
    domain: 'VPO',
    defaultGate: 'GATE_FISCAL',
    displayOrder: 170,
    versions: [baselineVersion({
      legalBasis: [...LEGAL_VPO, { reference: 'NT MDF-e 2026.001' }],
      summary: 'Referência do vale-pedágio no MDF-e quando exigida — regras fiscais em revisão.',
      effectiveFrom: '2023-01-01',
      implementationState: 'UNDER_REVIEW',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-NFE-001',
    title: 'NF-e autorizada e compatível',
    domain: 'NFE',
    defaultGate: 'GATE_FISCAL',
    displayOrder: 180,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'Ajustes SINIEF / MOC NF-e' }],
      summary: 'NF-e autorizada na SEFAZ e compatível com a carga/operação.',
      effectiveFrom: '2018-01-01',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-CTE-001',
    title: 'CT-e autorizado e compatível',
    domain: 'CTE',
    defaultGate: 'GATE_FISCAL',
    displayOrder: 190,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'Ajustes SINIEF / MOC CT-e' }],
      summary: 'CT-e autorizado na SEFAZ e compatível com a operação de transporte.',
      effectiveFrom: '2018-01-01',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-MDFE-001',
    title: 'MDF-e autorizado e compatível',
    domain: 'MDFE',
    defaultGate: 'GATE_FISCAL',
    displayOrder: 200,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'Ajustes SINIEF / MOC MDF-e' }],
      summary: 'MDF-e autorizado na SEFAZ e compatível com a viagem (veículo, condutor, docs).',
      effectiveFrom: '2018-01-01',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-MDFE-002',
    title: 'CIOT presente no MDF-e quando obrigatório',
    domain: 'MDFE',
    defaultGate: 'GATE_FISCAL',
    displayOrder: 210,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'NT MDF-e 2026.001' }],
      summary: 'Campo de CIOT preenchido no MDF-e quando obrigatório — cronograma da NT '
        + 'MDF-e 2026.001 em revisão.',
      effectiveFrom: '2026-08-06',
      implementationState: 'UNDER_REVIEW',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-SEG-001',
    title: 'RCTR-C vigente',
    domain: 'SEG',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 220,
    versions: [baselineVersion({
      legalBasis: LEGAL_SEG,
      summary: 'Seguro RCTR-C (responsabilidade civil do transportador — carga) vigente.',
      effectiveFrom: '2023-06-20',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-SEG-002',
    title: 'RC-DC vigente',
    domain: 'SEG',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 230,
    versions: [baselineVersion({
      legalBasis: LEGAL_SEG,
      summary: 'Seguro RC-DC (desaparecimento de carga) vigente.',
      effectiveFrom: '2023-06-20',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-SEG-003',
    title: 'RC-V vigente',
    domain: 'SEG',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 240,
    versions: [baselineVersion({
      legalBasis: LEGAL_SEG,
      summary: 'Seguro RC-V (responsabilidade civil do veículo) vigente.',
      effectiveFrom: '2023-06-20',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-SEG-004',
    title: 'Limite de garantia por viagem respeitado',
    domain: 'SEG',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 245,
    versions: [baselineVersion({
      legalBasis: LEGAL_SEG,
      // A soma dos valores declarados da carga da operação não pode ultrapassar o limite de
      // garantia POR VIAGEM configurado na apólice (per_trip_limit_amount, migration 035) —
      // acima dele a carga viaja parcialmente descoberta (circuito Irmãos PADILHA,
      // REQ-SICAT-0028 rev.2). Nasce blocking=false como toda regra (regra de ouro do programa):
      // o block bruto do evaluator é rebaixado a warn pelo clamp advisory até promoção do operador.
      summary: 'Soma dos valores declarados da carga dentro do limite de garantia por viagem '
        + 'da apólice vigente (per_trip_limit_amount).',
      effectiveFrom: '2023-06-20',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  },
  {
    code: 'TR-PGR-001',
    title: 'PGR vigente quando requerido',
    domain: 'PGR',
    defaultGate: 'GATE_PRE_BOARDING',
    displayOrder: 250,
    versions: [baselineVersion({
      legalBasis: LEGAL_SEG,
      summary: 'Plano de Gerenciamento de Riscos vigente quando requerido pela apólice/operação.',
      effectiveFrom: '2023-06-20',
      implementationState: 'ACTIVE',
      severity: 'warning'
    })]
  },
  {
    code: 'TR-COMP-001',
    title: 'Conjunto mínimo para liberação aprovado',
    domain: 'COMP',
    defaultGate: 'GATE_RELEASE',
    displayOrder: 260,
    versions: [baselineVersion({
      legalBasis: [{ reference: 'Lei 15.485/2026' }],
      summary: 'Regra agregadora: o conjunto mínimo de requisitos regulatórios da operação '
        + 'está aprovado antes da liberação.',
      effectiveFrom: '2026-08-06',
      implementationState: 'ACTIVE',
      severity: 'critical'
    })]
  }
];

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Asserções de integridade — falham ALTO, antes de qualquer SQL ir ao banco.
// ───────────────────────────────────────────────────────────────────────────────────────────────

function assertCatalogIsWellFormed(seed: RegulatoryCatalogSeed): void {
  const codes = seed.rules.map((rule) => rule.code);
  const duplicatedCodes = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicatedCodes.length > 0) {
    throw new Error(
      `[regulatory-catalog-seed] code duplicado no catalogo: ${[...new Set(duplicatedCodes)].join(', ')}`
    );
  }

  const expectedCodes = [...RULE_CODES];
  if (codes.length !== expectedCodes.length || codes.some((code, index) => code !== expectedCodes[index])) {
    throw new Error(
      '[regulatory-catalog-seed] a lista de regras do seed diverge de RULE_CODES '
        + '(lib/transport/regulatory-types.ts) — as duas listas andam juntas no mesmo PR.'
    );
  }

  const references = seed.sources.map((source) => source.reference);
  const duplicatedReferences = references.filter((ref, index) => references.indexOf(ref) !== index);
  if (duplicatedReferences.length > 0) {
    throw new Error(
      `[regulatory-catalog-seed] reference duplicada nas fontes: ${[...new Set(duplicatedReferences)].join(', ')}`
    );
  }

  const knownReferences = new Set<string>([...references, ...KNOWN_EXTERNAL_REFERENCES]);

  for (const rule of seed.rules) {
    if (rule.versions.length === 0) {
      throw new Error(`[regulatory-catalog-seed] regra ${rule.code} sem nenhuma versao.`);
    }

    const labels = rule.versions.map((version) => version.versionLabel);
    const duplicatedLabels = labels.filter((label, index) => labels.indexOf(label) !== index);
    if (duplicatedLabels.length > 0) {
      throw new Error(
        `[regulatory-catalog-seed] version_label duplicado em ${rule.code}: ${duplicatedLabels.join(', ')}`
      );
    }

    for (const version of rule.versions) {
      if (version.legalBasis.length === 0) {
        throw new Error(
          `[regulatory-catalog-seed] ${rule.code}/${version.versionLabel} sem base legal.`
        );
      }
      for (const basis of version.legalBasis) {
        if (!knownReferences.has(basis.reference)) {
          throw new Error(
            `[regulatory-catalog-seed] ${rule.code}/${version.versionLabel} cita base legal `
              + `desconhecida: '${basis.reference}' (nem fonte semeada, nem referencia externa conhecida).`
          );
        }
      }
      if (version.effectiveUntil != null && version.effectiveUntil < version.effectiveFrom) {
        throw new Error(
          `[regulatory-catalog-seed] ${rule.code}/${version.versionLabel} com vigencia invertida.`
        );
      }
    }

    // Espelho puro da exclusion constraint da migration 021: nenhuma data pode resolver para
    // duas versões da mesma regra. Testa cada fronteira de janela contra as demais janelas.
    for (const version of rule.versions) {
      const others = rule.versions.filter((candidate) => candidate !== version);
      const boundaryDates = [version.effectiveFrom, version.effectiveUntil].filter(
        (value): value is string => value != null
      );
      for (const date of boundaryDates) {
        if (resolveVersionFromList(others, date) !== null) {
          throw new Error(
            `[regulatory-catalog-seed] ${rule.code} tem versoes com vigencias sobrepostas em ${date} `
              + '— a exclusion constraint do banco rejeitaria este seed.'
          );
        }
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Builders PUROS
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Estrutura declarativa do catálogo (fontes + regras + versões). Função PURA e determinística. */
export function buildRegulatoryCatalogSeed(): RegulatoryCatalogSeed {
  const seed: RegulatoryCatalogSeed = { sources: SEEDED_SOURCES, rules: SEEDED_RULES };
  assertCatalogIsWellFormed(seed);
  return seed;
}

function buildUpdateSetClause(columns: readonly string[]): string {
  return columns.map((column) => `${column} = excluded.${column}`).join(',\n                  ');
}

/**
 * Statements do seed, em ordem de execução: fontes → regras → versões, cada grupo em ordem
 * alfabética determinística (com api e worker semeando ao mesmo tempo, a ordem fixa faz a
 * segunda transação ESPERAR no índice em vez de cruzar locks com a primeira). Função PURA.
 */
export function buildRegulatoryCatalogSeedStatements(): RegulatoryCatalogSeedStatement[] {
  const seed = buildRegulatoryCatalogSeed();
  const statements: RegulatoryCatalogSeedStatement[] = [];

  const orderedSources = [...seed.sources]
    .sort((left, right) => left.reference.localeCompare(right.reference));

  for (const source of orderedSources) {
    statements.push({
      name: `source:${source.reference}`,
      // `monitoring_status`/`review_status`/`reviewed_*`/`notes`/`effective_until` ficam nos
      // defaults do DDL e FORA do `do update`: pertencem ao operador (regulatory watch/revisão).
      sql: `insert into regulatory_sources (
              id, source_type, reference, title, issuer, published_at, effective_from
            ) values ($1, $2, $3, $4, $5, $6::date, $7::date)
            on conflict (reference) do update
              set ${buildUpdateSetClause(SOURCE_UPDATE_COLUMNS)}`,
      params: [
        createPrefixedId('regsrc'),
        source.sourceType,
        source.reference,
        source.title,
        source.issuer,
        source.publishedAt ?? null,
        source.effectiveFrom ?? null
      ]
    });
  }

  const orderedRules = [...seed.rules]
    .sort((left, right) => left.code.localeCompare(right.code));

  for (const rule of orderedRules) {
    statements.push({
      name: `rule:${rule.code}`,
      // `domain` é identitário (mudar domínio = regra nova), por isso só no `values`.
      sql: `insert into regulatory_rules (
              id, code, domain, title, description, default_gate, display_order
            ) values ($1, $2, $3, $4, '', $5, $6)
            on conflict (code) do update
              set ${buildUpdateSetClause(RULE_UPDATE_COLUMNS)}`,
      params: [
        createPrefixedId('regrule'),
        rule.code,
        rule.domain,
        rule.title,
        rule.defaultGate,
        rule.displayOrder
      ]
    });
  }

  for (const rule of orderedRules) {
    const orderedVersions = [...rule.versions]
      .sort((left, right) => left.versionLabel.localeCompare(right.versionLabel));

    for (const version of orderedVersions) {
      statements.push({
        name: `rule-version:${rule.code}:${version.versionLabel}`,
        // `blocking` entra como LITERAL false (toda versão nasce não-bloqueante — regra de ouro).
        // `implementation_state` é inserido UMA vez e nunca reescrito; `reviewed_by`/`reviewed_at`
        // nem aparecem no insert. Vigência (`effective_from`/`effective_until`) também fica fora
        // do `do update`: mudança de vigência é VERSÃO NOVA, nunca edição da existente.
        sql: `insert into regulatory_rule_versions (
                id, rule_id, version_label, legal_basis, summary,
                effective_from, effective_until, implementation_state, blocking, severity
              )
              select $1, r.id, $2, $3::jsonb, $4, $5::date, $6::date, $7, false, $8
                from regulatory_rules r
               where r.code = $9
              on conflict (rule_id, version_label) do update
                set ${buildUpdateSetClause(RULE_VERSION_UPDATE_COLUMNS)}`,
        params: [
          createPrefixedId('regrulev'),
          version.versionLabel,
          JSON.stringify(version.legalBasis),
          version.summary,
          version.effectiveFrom,
          version.effectiveUntil ?? null,
          version.implementationState,
          version.severity,
          rule.code
        ]
      });
    }
  }

  return statements;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Aplicação
// ───────────────────────────────────────────────────────────────────────────────────────────────

async function runSeedStatements(client: PoolClient): Promise<RegulatoryCatalogSeedResult> {
  const result: RegulatoryCatalogSeedResult = {
    sourcesReconciled: 0,
    rulesReconciled: 0,
    ruleVersionsReconciled: 0
  };

  for (const statement of buildRegulatoryCatalogSeedStatements()) {
    const executed = await client.query(statement.sql, statement.params);
    const rowCount = executed.rowCount ?? 0;

    // O upsert de versão é `insert ... select` amarrado ao code da regra: 0 linhas significa que
    // a regra-mãe não existe — estado impossível dentro desta transação, então falha ALTO em vez
    // de deixar o catálogo silenciosamente incompleto.
    if (rowCount === 0 && statement.name.startsWith('rule-version:')) {
      throw new Error(
        `[regulatory-catalog-seed] upsert de versao nao encontrou a regra-mae: ${statement.name}`
      );
    }

    if (statement.name.startsWith('source:')) result.sourcesReconciled += rowCount;
    else if (statement.name.startsWith('rule:')) result.rulesReconciled += rowCount;
    else result.ruleVersionsReconciled += rowCount;
  }

  return result;
}

/**
 * Reconcilia o catálogo inteiro numa ÚNICA transação. NÃO engole exceção: quem decide o que
 * fazer com a falha é o chamador (`bootstrap/startup.ts` degrada com erro alto no log — a
 * vertical Transporte ainda não tem superfície HTTP, derrubar api+worker por causa dela seria
 * desproporcional; mesmo racional do seed RBAC em `base-data.ts`).
 */
export async function ensureRegulatoryCatalogSeeded(): Promise<RegulatoryCatalogSeedResult> {
  return withTransaction(runSeedStatements);
}
