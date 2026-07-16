# -*- coding: utf-8 -*-
"""Gera o one-pager executivo (A4, 1 página) do plano comercial do SICAT.

Lê premissas.json e usa esperado() de verify_xlsx.py => PDF = planilha por construção.
Uso:  python gen_pdf.py
"""
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from verify_xlsx import esperado

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "one-pager-plano-comercial-sicat.pdf"

INK = colors.HexColor("#1a2332")
ACCENT = colors.HexColor("#0e7466")
MUTED = colors.HexColor("#5a6572")
LINE = colors.HexColor("#d5dbe0")

S_TITLE = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=INK, spaceAfter=3)
S_SUB = ParagraphStyle("s", fontName="Helvetica", fontSize=8.5, textColor=MUTED, spaceAfter=4)
S_H = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=9.5, textColor=ACCENT, spaceBefore=5, spaceAfter=2)
S_BODY = ParagraphStyle("b", fontName="Helvetica", fontSize=8, textColor=INK, leading=10.5)
S_CELL = ParagraphStyle("c", fontName="Helvetica", fontSize=7.2, textColor=INK, leading=8.6)
S_CELL_B = ParagraphStyle("cb", fontName="Helvetica-Bold", fontSize=7.2, textColor=INK, leading=8.6)
S_FOOT = ParagraphStyle("f", fontName="Helvetica-Oblique", fontSize=6.6, textColor=MUTED, leading=8)


def brl(v, dec=0):
    s = f"{v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def main():
    p = json.loads((HERE / "premissas.json").read_text(encoding="utf-8"))
    calc = esperado(p)

    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=13 * mm, bottomMargin=11 * mm,
        title="SICAT — Plano comercial (one-pager)", author="NovaIT",
    )
    story = []

    story.append(Paragraph("SICAT — Plano comercial: planos e preços", S_TITLE))
    story.append(Paragraph(
        f"Automação de MTR/CDF/DMR da CETESB-SP para geradores, transportadoras e destinos finais · "
        f"proposta {p['meta']['updated']} · valores de partida a validar com pilotos", S_SUB))

    story.append(Paragraph("Onde estamos", S_H))
    story.append(Paragraph(
        "O SICAT automatiza hoje, sobre a API real da CETESB-SP: emissão de MTR individual e em lote, "
        "recebimento/baixa, cancelamento, impressão, CDF, MTR provisório e preparação de DMR — com fila resiliente "
        "(retry/DLQ), multi-conta CETESB por usuário, auditoria fim-a-fim e assistente de IA que opera o produto. "
        "<b>Não emite documentos fiscais</b> (CT-e, MDF-e, CTR municipal, NFS-e): isso entra como add-on de roadmap. "
        "O concorrente real é fazer na mão no portal gratuito — 300 MTRs/mês manuais custam R$ 700–1.000 de mão de obra.", S_BODY))

    story.append(Paragraph("O modelo: assinatura + franquia de Documentos Operados (DO) + excedente", S_H))
    story.append(Paragraph(
        "1 DO = MTR emitido (cada item do lote), MTR provisório, MTR recebido/baixado ou CDF gerado. Consultas, "
        "impressões, cancelamentos e retries automáticos da fila não contam. As cercas de contas CETESB e usuários "
        "segmentam transportadoras e operações multiunidade sem tabela separada por persona. IA inclusa com cota.", S_BODY))

    head = ["", "Essencial (Micro)", "Profissional (PME)", "Operacional (Pro)", "Enterprise"]
    rows = [
        ["Mensalidade", *[brl(pl["mensalidade_brl"]["partida"]) for pl in p["planos"]]],
        ["Franquia DOs/mês", *[f"{pl['franquia_dos_mes']:,}".replace(",", ".") for pl in p["planos"]]],
        ["Excedente por DO", *[brl(pl["excedente_por_do_brl"], 2) for pl in p["planos"]]],
        ["Contas CETESB / usuários", *[
            ("ilimitado*" if pl["contas_cetesb"] < 0 else f"{pl['contas_cetesb']} / {pl['usuarios']}")
            for pl in p["planos"]]],
        ["IA (interações + arquivos/mês)", *[f"{pl['ia_interacoes_mes']} + {pl['ia_ingestoes_mes']}" for pl in p["planos"]]],
        ["SSO / retenção auditoria", *[
            f"{'SSO' if pl['sso'] else '—'} · {pl['retencao_auditoria_meses']}m" for pl in p["planos"]]],
    ]
    data = [[Paragraph(h, S_CELL_B) for h in head]] + [
        [Paragraph(r[0], S_CELL_B)] + [Paragraph(c, S_CELL) for c in r[1:]] for r in rows
    ]
    t = Table(data, colWidths=[38 * mm, 35 * mm, 35 * mm, 35 * mm, 35 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef4f2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    story.append(Paragraph(
        "Regras: anual = 2 meses grátis · trial 14 dias sem cartão · sem plano gratuito (o grátis já existe: o portal) · "
        "excedente capado em 2× a mensalidade · upgrade imediato pro-rata. * fair use contratual.", S_FOOT))

    story.append(Paragraph("Add-on fiscal (roadmap — ainda não construído)", S_H))
    f = p["addon_fiscal"]
    story.append(Paragraph(
        f"CT-e + MDF-e em bundle, a partir do plano Profissional: setup {brl(f['setup_por_cnpj_brl']['min'])}–"
        f"{brl(f['setup_por_cnpj_brl']['max'])} por CNPJ (credenciamento SEFAZ-SP assistido, certificado A1, CFOPs 5.351/6.351) "
        f"+ {brl(f['mensalidade_cte_mdfe_por_cnpj_brl']['min'])}–{brl(f['mensalidade_cte_mdfe_por_cnpj_brl']['max'])}/CNPJ·mês "
        f"+ por documento degressivo ({brl(f['por_documento_brl']['faixa_1_ate_200'], 2)} → "
        f"{brl(f['por_documento_brl']['faixa_3_acima'], 2)}). Fase 1 via API fiscal parceira "
        f"({f['dev_fase1_api_parceira']['semanas_min']}–{f['dev_fase1_api_parceira']['semanas_max']} semanas de dev); "
        "NFS-e e CTR/SP Regula nas fases 2–3. Diferencial único: vínculo MTR ↔ CT-e ↔ MDF-e da mesma viagem.", S_BODY))

    story.append(Paragraph("Cenários no mês 12 (saem da calculadora — planilha anexa)", S_H))
    cen_head = ["", "Conservador", "Base", "Otimista"]
    cens = ["conservador", "base", "otimista"]
    clientes = {c: sum(p["cenarios_mes12"][c][pl["id"]] for pl in p["planos"]) for c in cens}
    cen_rows = [
        ["Clientes", *[str(clientes[c]) for c in cens]],
        ["MRR total", *[brl(calc["cenarios"][c]["mrr_total"]) for c in cens]],
        ["Resultado (sem folha)", *[brl(calc["cenarios"][c]["resultado"]) for c in cens]],
        ["Resultado (com folha core)", *[brl(calc["cenarios"][c]["resultado_folha"]) for c in cens]],
        ["Margem bruta", *[f"{calc['cenarios'][c]['margem']:.0%}" for c in cens]],
    ]
    data2 = [[Paragraph(h, S_CELL_B) for h in cen_head]] + [
        [Paragraph(r[0], S_CELL_B)] + [Paragraph(c, S_CELL) for c in r[1:]] for r in cen_rows
    ]
    t2 = Table(data2, colWidths=[48 * mm, 43 * mm, 43 * mm, 43 * mm])
    t2.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef4f2")),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t2)
    ticket_base = calc["cenarios"]["base"]["mrr_total"] / max(clientes["base"], 1)
    be_clientes = calc["be_sem_folha"] / ticket_base
    story.append(Paragraph(
        f"Break-even: MRR ≈ {brl(calc['be_sem_folha'])} sem folha (≈ {be_clientes:.0f} clientes no mix base) · "
        f"{brl(calc['be_com_folha'])} com folha core. Custo de IA por conversa ≈ {brl(calc['ia_turno'], 2)} "
        "(classe Haiku, com prompt caching) — cotas por plano protegem a margem.", S_BODY))

    story.append(Paragraph("Sequência recomendada", S_H))
    story.append(Paragraph(
        "1) Implementar o metering de DOs (1–2 semanas — único dev obrigatório antes de cobrar) · "
        "2) 3–5 pilotos pagantes com desconto de fundador para validar disposição a pagar e medir custo real de IA · "
        "3) congelar a tabela e publicar · 4) só então construir o add-on fiscal com design partners. "
        "Não vender DMR como completo (transmissão à CETESB pendente) e vender SLA honesto: garantia de "
        "reprocessamento pela fila, nunca “uptime de emissão” (a API da CETESB não é oficial).", S_BODY))

    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Documento de planejamento — não é proposta comercial. Valores [PREMISSA] a calibrar com benchmark e pilotos. "
        "Detalhe: apps/sicat/docs/20-comercial/00-plano-comercial-pricing.md + planilha calculadora.", S_FOOT))

    doc.build(story)
    print(f"OK: {OUT}")


if __name__ == "__main__":
    main()
