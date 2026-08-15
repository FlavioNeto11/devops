# -*- coding: utf-8 -*-
"""Gera os PDFs do kit de vendas do SICAT a partir da fonte única premissas.json:
  - battlecard-vendas-sicat.pdf  (USO INTERNO do vendedor, 2 páginas A4)
  - one-pager-parceria-sicat.pdf (externo, 1 página A4 — SICAT Embedded)
Uso:  python gen_pdfs_vendas.py
"""
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
P = json.loads((HERE.parent.parent / "tools" / "premissas.json").read_text(encoding="utf-8"))

INK = colors.HexColor("#182226")
MUTED = colors.HexColor("#5C6E76")
PRIMARY = colors.HexColor("#0E6E5C")
PRIMARY_DARK = colors.HexColor("#0A5547")
WARNING = colors.HexColor("#B06A14")
LINE = colors.HexColor("#E1E7EA")
SUBTLE = colors.HexColor("#F0F3F4")

S_TITLE = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=INK, spaceAfter=2)
S_KICK = ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=PRIMARY, spaceAfter=2)
S_H = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=PRIMARY_DARK, spaceBefore=7, spaceAfter=2)
S_BODY = ParagraphStyle("b", fontName="Helvetica", fontSize=8.6, leading=11.4, textColor=INK)
S_CELL = ParagraphStyle("c", fontName="Helvetica", fontSize=7.6, leading=9.2, textColor=INK)
S_CELL_B = ParagraphStyle("cb", fontName="Helvetica-Bold", fontSize=7.6, leading=9.2, textColor=INK)
S_CELL_W = ParagraphStyle("cw", fontName="Helvetica-Bold", fontSize=7.8, leading=9.4, textColor=colors.white)
S_FOOT = ParagraphStyle("f", fontName="Helvetica-Oblique", fontSize=6.8, leading=8.6, textColor=MUTED)


def brl(v, dec=0):
    s = f"{v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def tbl(data, widths, header_fill=PRIMARY):
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), header_fill),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SUBTLE]),
    ]))
    return t


# ================================================================ battlecard
def battlecard():
    doc = SimpleDocTemplate(
        str(OUT / "battlecard-vendas-sicat.pdf"), pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=10 * mm,
        title="SICAT — Battlecard do vendedor (uso interno)", author="SICAT / NovaIT",
    )
    el = []
    el.append(Paragraph("USO INTERNO — NÃO ENTREGAR AO CLIENTE",
                        ParagraphStyle("warn", fontName="Helvetica-Bold", fontSize=8.5, textColor=WARNING)))
    el.append(Paragraph("SICAT — Battlecard do vendedor", S_TITLE))
    el.append(Paragraph("Tabela 2026 · fonte única: docs/20-comercial/tools/premissas.json · dúvida de preço = consulte aqui, não invente", S_FOOT))
    el.append(Spacer(1, 3 * mm))

    # ---- tabela completa de planos
    el.append(Paragraph("1 · Tabela completa de planos (faixas para negociação)", S_H))
    head = ["", *[pl["nome"] for pl in P["planos"]]]
    rows = [
        ["Mensalidade (faixa)", *[f"{brl(pl['mensalidade_brl']['min'])}–{brl(pl['mensalidade_brl']['max'])}" for pl in P["planos"]]],
        ["Preço de tabela (partida)", *[brl(pl["mensalidade_brl"]["partida"]) for pl in P["planos"]]],
        ["Franquia DOs/mês", *[f"{pl['franquia_dos_mes']:,}".replace(",", ".") for pl in P["planos"]]],
        ["Excedente por DO", *[brl(pl["excedente_por_do_brl"], 2) for pl in P["planos"]]],
        ["Contas CETESB", *[("ilimitado*" if pl["contas_cetesb"] < 0 else str(pl["contas_cetesb"])) for pl in P["planos"]]],
        ["Usuários", *[("ilimitado*" if pl["usuarios"] < 0 else str(pl["usuarios"])) for pl in P["planos"]]],
        ["IA (interações + arquivos/mês)", *[f"{pl['ia_interacoes_mes']:,}".replace(",", ".") + f" + {pl['ia_ingestoes_mes']}" for pl in P["planos"]]],
        ["SSO / RBAC custom", *[("SSO + RBAC" if pl["sso"] else ("— / RBAC" if pl["rbac_custom"] else "— / básico")) for pl in P["planos"]]],
        ["Retenção auditoria / docs (meses)", *[f"{pl['retencao_auditoria_meses']} / {'contratual' if pl['retencao_documentos_meses'] < 0 else pl['retencao_documentos_meses']}" for pl in P["planos"]]],
        ["Suporte / onboarding", *[f"{pl['suporte']} / {pl['onboarding_horas']}h" for pl in P["planos"]]],
    ]
    data = [[Paragraph(h, S_CELL_W) for h in head]] + [
        [Paragraph(r[0], S_CELL_B)] + [Paragraph(str(c), S_CELL) for c in r[1:]] for r in rows
    ]
    el.append(tbl(data, [44 * mm, 34 * mm, 34 * mm, 34 * mm, 36 * mm]))
    el.append(Paragraph("* fair use contratual. Enquadramento pelo MAIOR critério atingido (DOs, contas ou usuários) — quem estoura qualquer coluna sobe de plano.", S_FOOT))

    # ---- regras rápidas
    rc = P["regras_comerciais"]
    tr = rc["trial"]
    el.append(Paragraph("2 · Regras rápidas (decore estas oito)", S_H))
    regras = [
        f"Anual = 2 meses grátis (12 pelo preço de 10). Enterprise: 12–24 meses + IPCA.",
        f"Trial: {tr['dias']} dias sem cartão — {tr['dos']} DOs + {tr['ia_interacoes']} interações de IA + {tr['ia_ingestoes']} arquivos + {tr['contas_cetesb']} conta CETESB.",
        "Excedente: medido no mês, faturado no seguinte; TETO de 2× a mensalidade — acima disso a conversa é upgrade, não fatura.",
        f"IA Escala (outlier de IA): +{brl(rc['ia_escala_bloco_brl']['valor'])}/mês por bloco de {rc['ia_escala_bloco_brl']['inclui']}.",
        "Alertas de franquia em 80/100/120% — entregues junto com o metering (não prometa data).",
        "Upgrade: imediato, pro-rata, franquia nova vale o mês inteiro. Downgrade: só na virada do ciclo.",
        f"Canal (consultorias/transportadoras com carteira): comissão recorrente de {int(rc['comissao_canal']['min']*100)}–{int(rc['comissao_canal']['max']*100)}%.",
        "Desconto permitido SEM aprovação: o anual (2 meses) e piloto-fundador (−50% por 6 meses, máx. 5 clientes). Qualquer outro = aprovação do fundador.",
    ]
    for r in regras:
        el.append(Paragraph("•  " + r, S_BODY))

    # ---- qualificação
    el.append(Paragraph("3 · Qualificação em 5 perguntas (descoberta)", S_H))
    qs = [
        "Quantos MTRs a operação emite ou recebe por mês? (→ define o plano pela franquia)",
        "Quantos CNPJs / contas CETESB vocês operam? (→ limite de contas por plano; transportadora quase sempre é Profissional+)",
        "Quem faz isso hoje e quantas horas gasta por semana? (→ monta a conta do slide 6: R$ 700–1.000/mês em mão de obra)",
        "Já levaram apontamento ou fiscalização da CETESB? (→ auditoria/trilha vira urgência, não conveniência)",
        "Precisam de CT-e/MDF-e? (→ NÃO é produto disponível: ofereça design partnership do roadmap fiscal)",
    ]
    for i, q in enumerate(qs, 1):
        el.append(Paragraph(f"{i}.  {q}", S_BODY))

    el.append(PageBreak())

    # ---- página 2: objeções
    el.append(Paragraph("USO INTERNO — NÃO ENTREGAR AO CLIENTE",
                        ParagraphStyle("warn2", fontName="Helvetica-Bold", fontSize=8.5, textColor=WARNING)))
    el.append(Paragraph("4 · Objeções e respostas", S_H))
    objs = [
        ("“O portal da CETESB é grátis.”",
         "É — e continua sendo; a emissão nunca é cobrada por ninguém. O que o cliente paga é o tempo: 4–6 min por MTR × volume mensal. Faça a conta na frente dele (pergunta 3) e compare com a mensalidade. Grátis com 25 h/mês de digitação não é grátis."),
        ("“E se a CETESB mudar o portal? Vocês quebram?”",
         "Monitoramos o contrato do portal continuamente e a fila segura os comandos aceitos até a normalização — nada se perde. O contrato exclui indisponibilidade do portal (é do governo) e assume compromisso de adequação em dias úteis. NUNCA prometa ‘uptime de emissão’."),
        ("“Vocês emitem CT-e/MDF-e?”",
         "Ainda não — é roadmap com tabela-alvo publicada e vagas de design partner (setup grátis + 50% por 6 meses). Se CT-e é condição para fechar HOJE, o SICAT não é a venda deste trimestre: registre o lead para o lançamento."),
        ("“Preciso da DMR completa.”",
         "Hoje entregamos a preparação da DMR (consolidação pronta); a transmissão à CETESB está em desenvolvimento e será upgrade GRATUITO. Não prometa data; venda MTR/CDF pelo valor que já existe."),
        ("“O concorrente X faz mais barato.”",
         "Peça a proposta dele por escrito — o mercado inteiro vende ‘sob consulta’. Referências reais: meuResíduo R$ 160/mês + R$ 1.500 de setup (15 saídas/mês); BPO humano R$ 650–1.980/mês por ATÉ 10 MTRs. Nosso Essencial: R$ 129 sem setup, 30 DOs."),
        ("“IA mexendo na minha conta CETESB? Perigoso.”",
         "A IA propõe, o humano confirma: toda ação em lote exige confirmação explícita, e cada operação sai com trilha de auditoria (quem pediu, quando, o que aconteceu). É mais rastreável do que o estagiário no portal."),
    ]
    for q, a in objs:
        el.append(Paragraph(q, ParagraphStyle("q", parent=S_BODY, fontName="Helvetica-Bold", spaceBefore=4)))
        el.append(Paragraph(a, S_BODY))

    el.append(Paragraph("5 · O que NUNCA prometer (quebra de contrato interno)", S_H))
    nuncas = [
        "DMR completa ou data de entrega da transmissão.",
        "“Uptime de emissão” ou qualquer SLA sobre o portal CETESB.",
        "Módulo fiscal (CT-e/MDF-e/NFS-e/CTR) como disponível.",
        "Integração com SINIR/outros estados (hoje é CETESB-SP).",
        "Cobrança automática/self-service (a fatura é emitida manualmente por enquanto — se perguntarem, é ‘fatura mensal com NFS-e’).",
        "Desconto fora da alçada (regra 8 da página 1).",
    ]
    for n in nuncas:
        el.append(Paragraph("✗  " + n, ParagraphStyle("n", parent=S_BODY, textColor=WARNING)))

    el.append(Paragraph("6 · Concorrência em 30 segundos", S_H))
    conc = [[Paragraph(x, S_CELL_W) for x in ["Quem", "Preço", "Como usar na venda"]]]
    for alvo, preco, uso in [
        ("Portal SIGOR/SINIR (grátis)", "R$ 0", "É o concorrente real. Venda tempo, resiliência e auditoria — nunca ‘acesso ao MTR’."),
        ("meuResíduo (Gerador Light)", "R$ 160/mês + R$ 1.500 setup", "Único preço público do setor; limitado a 15 saídas/mês. Essencial ganha em preço e sem setup."),
        ("G Solution (BPO humano)", "R$ 650–1.980/mês", "Até 10 MTRs/mês inclusos. Profissional entrega 30× mais DOs por pouco mais da metade do plano de entrada deles."),
        ("Vertown, Ambipar, Trashin, InfoHand etc.", "sob consulta", "Sem preço público. Nossa tabela publicada é diferencial: ‘compare e decida’."),
    ]:
        conc.append([Paragraph(alvo, S_CELL_B), Paragraph(preco, S_CELL), Paragraph(uso, S_CELL)])
    el.append(tbl(conc, [42 * mm, 40 * mm, 100 * mm]))

    el.append(Paragraph("7 · Processo comercial", S_H))
    el.append(Paragraph(
        "Lead → qualificação (5 perguntas) → trial 14 dias (conta em 1 dia útil) → piloto 2–4 semanas com onboarding → contrato "
        "(mensal sem fidelidade / anual −2 meses / Enterprise faturado). Recebimento: Pix/boleto com NFS-e; cartão recorrente no Essencial/Profissional; "
        "PO/empenho no Enterprise. Meta de resposta a lead: 1 dia útil.", S_BODY))
    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph(
        "Este battlecard é gerado de docs/20-comercial/tools/premissas.json — se o preço mudou lá, regenere aqui (vendas/tools/README). "
        "Detalhe completo do plano comercial: 00-plano-comercial-pricing.md.", S_FOOT))
    doc.build(el)
    print(f"OK: {OUT / 'battlecard-vendas-sicat.pdf'}")


# ================================================================ one-pager parceria
def onepager_parceria():
    cp = P["canal_parceria"]
    ex = cp["exemplo_seguradora"]
    doc = SimpleDocTemplate(
        str(OUT / "one-pager-parceria-sicat.pdf"), pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm, topMargin=12 * mm, bottomMargin=10 * mm,
        title="SICAT Embedded — one-pager de parceria", author="SICAT / NovaIT",
    )
    el = []
    el.append(Paragraph("SICAT EMBEDDED", S_KICK))
    el.append(Paragraph("Conformidade de resíduos como componente do seu produto", S_TITLE))
    el.append(Paragraph(
        "Todo transporte de resíduo no Brasil gera documento obrigatório por lei (4,08 mi MTRs/ano no SINIR + ~2,2 mi/ano no SIGOR-SP). "
        "O SICAT embarca emissão, validação e monitoramento desses documentos dentro do seu produto — seguro de transporte, TMS/ERP, "
        "marketplace, ESG — via API, na sua marca, cobrando por documento. <b>Escopo atual: CETESB-SP (SIGOR); SINIR e demais estados "
        "são roadmap.</b>", S_BODY))
    el.append(Spacer(1, 2.5 * mm))

    cargas = f"{ex['cargas_mes']:,}".replace(",", ".")
    el.append(Paragraph("O exemplo que explica tudo: seguro de transporte de resíduos", S_H))
    el.append(Paragraph(
        "A apólice exige documentação ambiental válida por carga. O sistema da seguradora chama a API do SICAT: o MTR nasce válido, a viagem é "
        f"monitorada até a baixa e o sinistro sai com trilha auditável. Na conta ilustrativa: {cargas} cargas/mês, custo SICAT "
        f"{brl(ex['custo_sicat_por_doc'], 2)}/doc, cobrado no pacote {brl(ex['preco_no_pacote_por_doc'], 2)}/doc → "
        f"<b>{brl((ex['preco_no_pacote_por_doc'] - ex['custo_sicat_por_doc']) * ex['cargas_mes'])}/mês de margem</b> no componente documental — "
        "além de uma apólice mais vendável.", S_BODY))
    el.append(Spacer(1, 2.5 * mm))

    el.append(Paragraph("Modelo comercial — por Documento Conforme (tabela 2026)", S_H))
    t1 = [[Paragraph(x, S_CELL_W) for x in ["Volume mensal", "Preço/doc"]]]
    for fx in cp["por_documento_brl"]:
        t1.append([Paragraph(fx["faixa"], S_CELL), Paragraph(brl(fx["preco"], 2), S_CELL_B)])
    left = tbl(t1, [52 * mm, 26 * mm])
    cond = [
        f"Mínimo mensal: {brl(cp['minimo_mensal_brl'])} (a partir do go-live)",
        f"Setup de integração: {brl(cp['setup_integracao_brl']['min'])}–{brl(cp['setup_integracao_brl']['max'])} (sandbox, homologação, go-live assistido)",
        f"White-label: +{brl(cp['white_label_mes_brl'])}/mês por marca",
        f"Alternativa: revenue-share de {int(cp['rev_share_alternativo']['min']*100)}–{int(cp['rev_share_alternativo']['max']*100)}% do componente documental",
        f"Sandbox gratuito por {cp['sandbox_dias_gratis']} dias",
    ]
    right = Table([[Paragraph("•  " + c, S_CELL)] for c in cond], colWidths=[96 * mm])
    right.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    wrap = Table([[left, right]], colWidths=[82 * mm, 98 * mm])
    wrap.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    el.append(wrap)
    el.append(Spacer(1, 2.5 * mm))

    el.append(Paragraph("Integração e monitoramento", S_H))
    t2 = [[Paragraph("DISPONÍVEL HOJE (em produção)", S_CELL_W), Paragraph("LIGAMOS COM O PARCEIRO (roadmap curto)", S_CELL_W)]]
    hoje = "<br/>".join("•  " + d for d in cp["disponivel_hoje"])
    rmap = "<br/>".join(f"•  {r['item']} — {r['prazo_semanas']} sem." for r in cp["roadmap_integracao"])
    t2.append([Paragraph(hoje, S_CELL), Paragraph(rmap, S_CELL)])
    el.append(tbl(t2, [90 * mm, 90 * mm]))
    el.append(Spacer(1, 2.5 * mm))

    el.append(Paragraph("SLA honesto e segurança", S_H))
    el.append(Paragraph(
        f"{cp['sla']}. Credenciais criptografadas e segregadas por cliente do parceiro (multi-conta + RBAC), trilha de auditoria imutável, "
        "DPA anexo ao contrato, SSO corporativo (OIDC).", S_BODY))
    el.append(Spacer(1, 2.5 * mm))

    el.append(Paragraph("Como começa (4–8 semanas até produção)", S_H))
    el.append(Paragraph(
        "Semana 1: sandbox no ar + workshop técnico · Semanas 2–5: integração e homologação · Semanas 4–8: piloto com clientes reais · "
        "Go-live: contrato por volume, white-label opcional. Primeiro parceiro por vertical: 50% de desconto no setup + exclusividade de "
        "vertical por 12 meses (condição promocional de lançamento — negociável).", S_BODY))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph("[CONTATO — nome · e-mail · WhatsApp]",
                        ParagraphStyle("ct", fontName="Helvetica-Bold", fontSize=10, textColor=PRIMARY)))
    el.append(Spacer(1, 1.5 * mm))
    el.append(Paragraph(
        "Documento de proposta de parceria — não é oferta pública. Valores de tabela 2026 sujeitos a contrato; itens de roadmap identificados como tal. "
        "SICAT · NovaIT · 2026.", S_FOOT))
    doc.build(el)
    print(f"OK: {OUT / 'one-pager-parceria-sicat.pdf'}")


if __name__ == "__main__":
    battlecard()
    onepager_parceria()
