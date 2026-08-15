/* Gera os 2 decks de vendas do SICAT (pptx) a partir da fonte única premissas.json.
 * Uso:  node gen_decks.js
 * Saída: ../deck-vendas-sicat.pptx  e  ../deck-parceria-embedded-sicat.pptx
 * Identidade: paleta monocromática slate + verde-petróleo (tokens do app SICAT). */
"use strict";
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const P = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "tools", "premissas.json"), "utf-8")
);

// ---------------------------------------------------------------- identidade
const C = {
  primary: "0E6E5C", primaryDark: "0A5547", ink: "182226", muted: "5C6E76",
  bg: "F5F7F8", bgAccent: "EDF1F2", subtle: "F0F3F4", surface: "FFFFFF",
  border: "E1E7EA", borderStrong: "C5D0D6",
  success: "1F7E58", warning: "B06A14", info: "1F758A",
  darkBg: "0C1114", darkSurface: "162025", darkText: "EDF2F4", darkMuted: "93A6AE",
};
const FONT = "Calibri";
const W = 13.33, H = 7.5, M = 0.6;
const brl = (v, dec = 0) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ---------------------------------------------------------------- helpers
function logoMark(s, x, y, size) {
  const k = size / 64;
  s.addShape("roundRect", { x, y, w: size, h: size, fill: { color: C.primary }, rectRadius: 0.12 * size, line: { type: "none" } });
  s.addShape("rect", { x: x + 16 * k, y: y + 22 * k, w: 32 * k, h: 6 * k, fill: { color: "FFFFFF" }, line: { type: "none" } });
  s.addShape("rect", { x: x + 16 * k, y: y + 36 * k, w: 24 * k, h: 6 * k, fill: { color: "FFFFFF" }, line: { type: "none" } });
  s.addShape("ellipse", { x: x + 38 * k, y: y + 31 * k, w: 16 * k, h: 16 * k, fill: { color: "FFFFFF" }, line: { type: "none" } });
  s.addShape("ellipse", { x: x + 42 * k, y: y + 35 * k, w: 8 * k, h: 8 * k, fill: { color: C.primary }, line: { type: "none" } });
}

function header(s, kicker, title, opts = {}) {
  const dark = !!opts.dark;
  s.addText(kicker.toUpperCase(), {
    x: M, y: 0.42, w: W - 2 * M, h: 0.3, fontFace: FONT, fontSize: 11, bold: true,
    color: dark ? "6FC7B4" : C.primary, charSpacing: 2, margin: 0,
  });
  s.addText(title, {
    x: M, y: 0.68, w: W - 2 * M, h: 0.75, fontFace: FONT, fontSize: 30, bold: true,
    color: dark ? C.darkText : C.ink, margin: 0,
  });
}

function footer(s, page, total, opts = {}) {
  const dark = !!opts.dark;
  s.addText(opts.label || "SICAT · Material comercial · 2026 — preços de tabela sujeitos a proposta", {
    x: M, y: H - 0.42, w: 9.5, h: 0.3, fontFace: FONT, fontSize: 9,
    color: dark ? C.darkMuted : C.muted, margin: 0,
  });
  s.addText(`${page} / ${total}`, {
    x: W - M - 1.0, y: H - 0.42, w: 1.0, h: 0.3, align: "right",
    fontFace: FONT, fontSize: 9, color: dark ? C.darkMuted : C.muted, margin: 0,
  });
}

function card(s, x, y, w, h, opts = {}) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: opts.fill || C.subtle },
    line: opts.lineColor ? { color: opts.lineColor, width: 1 } : { color: C.border, width: 1 },
    shadow: opts.shadow ? { type: "outer", color: "10181C", opacity: 0.10, blur: 8, offset: 2, angle: 90 } : undefined,
  });
}

function chip(s, x, y, d, txt, opts = {}) {
  s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: opts.fill || C.primary }, line: { type: "none" } });
  s.addText(txt, {
    x, y: y - 0.015, w: d, h: d, align: "center", valign: "middle",
    fontFace: FONT, fontSize: opts.fontSize || 13, bold: true, color: opts.color || "FFFFFF", margin: 0,
  });
}

function bullets(s, items, x, y, w, h, opts = {}) {
  const arr = items.map((t, i) => ({
    text: typeof t === "string" ? t : t.text,
    options: {
      bullet: { code: "2022", indent: 12 },
      color: (typeof t === "object" && t.color) || opts.color || C.ink,
      bold: typeof t === "object" ? !!t.bold : false,
      breakLine: true,
      paraSpaceAfter: opts.gap == null ? 8 : opts.gap,
    },
  }));
  s.addText(arr, {
    x, y, w, h, fontFace: FONT, fontSize: opts.fontSize || 13.5, valign: "top", margin: 0,
    color: opts.color || C.ink,
  });
}

function stat(s, x, y, w, big, label, opts = {}) {
  s.addText(big, {
    x, y, w, h: 0.85, fontFace: FONT, fontSize: opts.big || 34, bold: true,
    color: opts.color || C.primary, margin: 0, align: opts.align || "left",
  });
  s.addText(label, {
    x, y: y + 0.82, w, h: 0.85, fontFace: FONT, fontSize: 12, color: C.muted, margin: 0,
    align: opts.align || "left",
  });
}

// pequenas "telas" ilustrativas (motivo visual: cartões com chips de status)
function statusRow(s, x, y, w, label, statusTxt, fg, bg) {
  s.addShape("roundRect", { x, y, w, h: 0.42, rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { color: C.border, width: 0.75 } });
  s.addText(label, { x: x + 0.15, y: y + 0.02, w: w - 1.75, h: 0.38, fontFace: FONT, fontSize: 10.5, color: C.ink, valign: "middle", margin: 0 });
  s.addShape("roundRect", { x: x + w - 1.5, y: y + 0.07, w: 1.35, h: 0.28, rectRadius: 0.14, fill: { color: bg }, line: { type: "none" } });
  s.addText(statusTxt, { x: x + w - 1.5, y: y + 0.055, w: 1.35, h: 0.28, align: "center", valign: "middle", fontFace: FONT, fontSize: 9, bold: true, color: fg, margin: 0 });
}

// ================================================================ DECK 1 — VENDAS DIRETAS
function deckVendas() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "SICAT / NovaIT";
  pres.title = "SICAT — Apresentação comercial";
  const TOTAL = 12;
  const planos = P.planos;
  const [ess, prof, oper, ent] = planos;

  // ---- S1 capa (dark)
  let s = pres.addSlide();
  s.background = { color: C.darkBg };
  s.addShape("ellipse", { x: 9.4, y: -2.2, w: 7.5, h: 7.5, fill: { color: C.primaryDark, transparency: 62 }, line: { type: "none" } });
  s.addShape("ellipse", { x: 11.2, y: 4.9, w: 4.6, h: 4.6, fill: { color: C.primary, transparency: 74 }, line: { type: "none" } });
  logoMark(s, M, 1.15, 0.85);
  s.addText("SICAT", { x: M - 0.03, y: 2.15, w: 9, h: 1.15, fontFace: FONT, fontSize: 60, bold: true, color: C.darkText, margin: 0 });
  s.addText("Automação de MTR, CDF e preparação de DMR sobre a CETESB-SP — com IA que opera por você.", {
    x: M, y: 3.35, w: 8.6, h: 1.0, fontFace: FONT, fontSize: 20, color: "BFD6D0", margin: 0,
  });
  s.addText("Emita em lote, receba e dê baixa, audite tudo — sem viver dentro do portal.", {
    x: M, y: 4.35, w: 8.4, h: 0.6, fontFace: FONT, fontSize: 14, color: C.darkMuted, margin: 0,
  });
  s.addText("Apresentação comercial · 2026 · confidencial", { x: M, y: 6.6, w: 7, h: 0.35, fontFace: FONT, fontSize: 11, color: C.darkMuted, margin: 0 });

  // ---- S2 a dor
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "O problema", "Operar resíduos no portal é trabalho manual que não escala");
  const dorY = 1.75, dorH = 2.5, dorW = (W - 2 * M - 0.6) / 3;
  const dores = [
    { big: "4–6 min", label: "por MTR emitido manualmente no portal — login, preenchimento, impressão, um a um." },
    { big: "20–30 h/mês", label: "para uma operação de 300 MTRs — R$ 700–1.000 de mão de obra administrativa, todo mês." },
    { big: "DD 024/2022/P", label: "a CETESB afere o que você declara. Inconsistência entre emitido, recebido e destinado vira autuação." },
  ];
  dores.forEach((d, i) => {
    const x = M + i * (dorW + 0.3);
    card(s, x, dorY, dorW, dorH, { fill: C.subtle });
    s.addText(d.big, { x: x + 0.25, y: dorY + 0.3, w: dorW - 0.5, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: C.primary, margin: 0 });
    s.addText(d.label, { x: x + 0.25, y: dorY + 1.05, w: dorW - 0.5, h: dorH - 1.3, fontFace: FONT, fontSize: 12.5, color: C.ink, margin: 0 });
  });
  s.addText([
    { text: "E o portal é gratuito — mas o seu tempo não é. ", options: { bold: true, color: C.ink, breakLine: false } },
    { text: "Quando o SIGOR oscila, o retrabalho é seu; quando falta um documento, o risco também.", options: { color: C.muted } },
  ], { x: M, y: 4.65, w: W - 2 * M, h: 0.6, fontFace: FONT, fontSize: 15, margin: 0 });
  const provaW = W - 2 * M;
  card(s, M, 5.45, provaW, 1.1, { fill: C.bgAccent });
  s.addText([
    { text: "Base legal que garante a demanda: ", options: { bold: true, color: C.ink, breakLine: false } },
    { text: "MTR é obrigatório no Brasil (Portaria MMA 280/2020) e em SP (Resolução SIMA 27/2021 + Decreto 60.520/2014). São 4,08 milhões de MTRs/ano no sistema nacional (2023) — e ~2,2 milhões/ano só no SIGOR-SP.", options: { color: C.ink } },
  ], { x: M + 0.3, y: 5.62, w: provaW - 0.6, h: 0.8, fontFace: FONT, fontSize: 12.5, margin: 0 });
  footer(s, 2, TOTAL);

  // ---- S3 o que é
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "O produto", "Uma camada de operação por cima do portal — integração real, não robô de tela");
  bullets(s, [
    { text: "Emissão de MTR individual e em LOTE (planilha → dezenas de manifestos)", bold: true },
    "Recebimento e baixa para destinadores + geração de CDF",
    "MTR provisório para emergências e relatórios com export CSV",
    "Multi-empresa: um usuário opera N contas CETESB, com papéis e permissões",
    "Fila resiliente: se a CETESB cair, seus comandos ficam guardados e são reprocessados sozinhos",
    "Auditoria fim-a-fim: cada operação com trilha completa — sua defesa na fiscalização",
  ], M, 1.85, 6.6, 3.6, { fontSize: 14, gap: 10 });
  // pipeline visual à direita
  const px = 7.7, pw = 5.0;
  card(s, px, 1.85, pw, 4.3, { fill: C.subtle });
  s.addText("COMO FLUI", { x: px + 0.3, y: 2.05, w: pw - 0.6, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.muted, charSpacing: 2, margin: 0 });
  const boxes = [
    { t: "Sua operação", d: "planilha, tela ou IA", fill: "FFFFFF", fg: C.ink },
    { t: "SICAT — fila resiliente", d: "valida antes, enfileira, tenta de novo, audita", fill: C.primary, fg: "FFFFFF" },
    { t: "CETESB / SIGOR", d: "API real do portal (não é robô de tela)", fill: "FFFFFF", fg: C.ink },
  ];
  boxes.forEach((b, i) => {
    const by = 2.45 + i * 1.25;
    s.addShape("roundRect", { x: px + 0.35, y: by, w: pw - 0.7, h: 0.95, rectRadius: 0.09, fill: { color: b.fill }, line: { color: b.fill === "FFFFFF" ? C.borderStrong : b.fill, width: 1 } });
    s.addText(b.t, { x: px + 0.6, y: by + 0.12, w: pw - 1.2, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: b.fg, margin: 0 });
    s.addText(b.d, { x: px + 0.6, y: by + 0.47, w: pw - 1.2, h: 0.35, fontFace: FONT, fontSize: 10.5, color: b.fill === "FFFFFF" ? C.muted : "D8EAE5", margin: 0 });
    if (i < 2) s.addText("▼", { x: px + pw / 2 - 0.15, y: by + 0.97, w: 0.3, h: 0.26, align: "center", fontFace: FONT, fontSize: 11, color: C.borderStrong, margin: 0 });
  });
  s.addText("O que é 1 DO (Documento Operado): MTR emitido, recebido/baixado, provisório ou CDF gerado. Consultas, impressões e reprocessamentos automáticos não contam.", {
    x: M, y: 6.15, w: W - 2 * M, h: 0.65, fontFace: FONT, fontSize: 11.5, italic: true, color: C.muted, margin: 0,
  });
  footer(s, 3, TOTAL);

  // ---- S4 IA
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "O diferencial", "Uma IA que não conversa sobre o trabalho — ela faz o trabalho");
  // chat mock
  const cx = M, cw = 5.9;
  card(s, cx, 1.8, cw, 4.5, { fill: C.subtle });
  const msgs = [
    { who: "user", t: "Emita os MTRs da planilha em anexo para a unidade Osasco." },
    { who: "bot", t: "Planilha lida: 23 cargas válidas. Confirma a emissão em lote pela conta CETESB da unidade Osasco?" },
    { who: "user", t: "Confirmo." },
    { who: "bot", t: "23 MTRs enfileirados · 23 emitidos com sucesso. Trilha de auditoria e PDFs disponíveis." },
  ];
  let my = 2.05;
  msgs.forEach((m) => {
    const isUser = m.who === "user";
    const bw = cw - 1.5;
    const bx = isUser ? cx + cw - bw - 0.3 : cx + 0.3;
    const bh = m.t.length > 70 ? 0.85 : 0.6;
    s.addShape("roundRect", { x: bx, y: my, w: bw, h: bh, rectRadius: 0.09, fill: { color: isUser ? C.primary : "FFFFFF" }, line: { color: isUser ? C.primary : C.border, width: 0.75 } });
    s.addText(m.t, { x: bx + 0.15, y: my + 0.04, w: bw - 0.3, h: bh - 0.08, fontFace: FONT, fontSize: 10.5, color: isUser ? "FFFFFF" : C.ink, valign: "middle", margin: 0 });
    my += bh + 0.16;
  });
  bullets(s, [
    { text: "20 ferramentas de ação: emitir, cancelar, imprimir, dar baixa, consultar jobs e auditoria", bold: true },
    "Aceita anexos: planilhas, PDFs e fotos viram operação (até 20 arquivos por conversa)",
    "Ações em lote sempre pedem confirmação — guardrails de fábrica, nada roda sozinho",
    "Responde sobre a SUA operação: status, pendências, quem emitiu o quê e quando",
    "Cota mensal inclusa em todos os planos (100 a 5.000 interações)",
  ], 6.95, 1.95, W - 6.95 - M, 4.2, { fontSize: 14, gap: 10 });
  footer(s, 4, TOTAL);

  // ---- S5 personas
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Para quem", "Três operações diferentes, um produto — o plano segue o seu volume");
  const pers = [
    { t: "Geradores", d: "Indústria, redes de varejo, clínicas, oficinas — quem produz o resíduo.", g: ["Emissão em lote por unidade/CNPJ", "Padroniza a operação de N filiais em um lugar"], f: "Enquadram do Essencial ao Enterprise pelo nº de MTRs e unidades." },
    { t: "Transportadoras", d: "Quem leva a carga — e muitas vezes emite pelo gerador.", g: ["Opera N contas CETESB de clientes num painel só", "Alto volume: excedente por DO cai conforme cresce"], f: "Já nascem no Profissional/Operacional pelo nº de contas CETESB que operam." },
    { t: "Destinos finais", d: "Aterros, recicladoras, tratadores — quem recebe e dá o destino.", g: ["Recebimento e baixa em escala + CDF no mesmo fluxo", "Trilha de auditoria pronta para a fiscalização"], f: "Volume de baixas + equipe definem o plano." },
  ];
  const pW = (W - 2 * M - 0.6) / 3;
  pers.forEach((p2, i) => {
    const x = M + i * (pW + 0.3);
    card(s, x, 1.8, pW, 4.55, { fill: C.subtle });
    chip(s, x + 0.28, 2.06, 0.42, String(i + 1), { fontSize: 14 });
    s.addText(p2.t, { x: x + 0.85, y: 2.06, w: pW - 1.1, h: 0.45, fontFace: FONT, fontSize: 17, bold: true, color: C.ink, valign: "middle", margin: 0 });
    s.addText(p2.d, { x: x + 0.28, y: 2.66, w: pW - 0.56, h: 0.75, fontFace: FONT, fontSize: 11.5, color: C.muted, margin: 0 });
    bullets(s, p2.g, x + 0.28, 3.45, pW - 0.56, 1.7, { fontSize: 11.5, gap: 6 });
    s.addText(p2.f, { x: x + 0.28, y: 5.35, w: pW - 0.56, h: 0.85, fontFace: FONT, fontSize: 10.5, italic: true, color: C.primaryDark, margin: 0 });
  });
  footer(s, 5, TOTAL);

  // ---- S6 números que vendem
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "A conta que fecha", "O plano se paga no tempo que a sua equipe para de gastar no portal");
  card(s, M, 1.85, 5.9, 3.5, { fill: C.subtle });
  s.addText("HOJE — NA MÃO", { x: M + 0.3, y: 2.05, w: 5.3, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.muted, charSpacing: 2, margin: 0 });
  stat(s, M + 0.3, 2.45, 5.3, "R$ 700–1.000/mês", "de mão de obra para ~300 MTRs manuais (20–30 h), sem contar retrabalho quando o portal oscila.", { big: 27, color: C.ink });
  s.addText("+ risco de autuação por inconsistência (a CETESB afere).", { x: M + 0.3, y: 4.35, w: 5.3, h: 0.7, fontFace: FONT, fontSize: 12, color: C.muted, margin: 0 });
  card(s, 6.85, 1.85, 5.9, 3.5, { fill: C.primary, lineColor: C.primary });
  s.addText("COM O SICAT", { x: 7.15, y: 2.05, w: 5.3, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: "BFE3DA", charSpacing: 2, margin: 0 });
  s.addText(brl(prof.mensalidade_brl.partida) + "/mês", { x: 7.15, y: 2.45, w: 5.3, h: 0.75, fontFace: FONT, fontSize: 27, bold: true, color: "FFFFFF", margin: 0 });
  s.addText(`Plano ${prof.nome}: ${prof.franquia_dos_mes} DOs/mês inclusos — a mesma operação de 300 MTRs, em lote, com fila resiliente, auditoria e IA.`, {
    x: 7.15, y: 3.27, w: 5.3, h: 1.0, fontFace: FONT, fontSize: 12.5, color: "EAF4F1", margin: 0 });
  s.addText("Paga-se sozinho — e devolve tempo para a operação.", { x: 7.15, y: 4.45, w: 5.3, h: 0.5, fontFace: FONT, fontSize: 12.5, bold: true, color: "FFFFFF", margin: 0 });
  s.addText([
    { text: "Transparência rara no setor: ", options: { bold: true, color: C.ink, breakLine: false } },
    { text: "nossos concorrentes vendem “sob consulta”. O SICAT publica preço de tabela — você compara, decide e testa 14 dias sem cartão.", options: { color: C.muted } },
  ], { x: M, y: 5.75, w: W - 2 * M, h: 0.75, fontFace: FONT, fontSize: 13.5, margin: 0 });
  footer(s, 6, TOTAL);

  // ---- S7 planos (cards)
  s = pres.addSlide(); s.background = { color: C.bg };
  header(s, "Planos e preços", "Assinatura + franquia de DOs + excedente — o preço por documento cai conforme você cresce");
  const cW2 = (W - 2 * M - 0.75) / 4;
  planos.forEach((pl, i) => {
    const x = M + i * (cW2 + 0.25);
    const hl = pl.id === "profissional";
    card(s, x, 1.9, cW2, 4.55, { fill: hl ? C.primary : "FFFFFF", lineColor: hl ? C.primary : C.border, shadow: true });
    const fg = hl ? "FFFFFF" : C.ink, sub = hl ? "CFE8E1" : C.muted;
    if (hl) {
      s.addShape("roundRect", { x: x + cW2 / 2 - 0.75, y: 1.73, w: 1.5, h: 0.32, rectRadius: 0.16, fill: { color: C.warning }, line: { type: "none" } });
      s.addText("RECOMENDADO", { x: x + cW2 / 2 - 0.75, y: 1.71, w: 1.5, h: 0.32, align: "center", valign: "middle", fontFace: FONT, fontSize: 8.5, bold: true, color: "FFFFFF", margin: 0 });
    }
    s.addText(pl.nome, { x: x + 0.22, y: 2.12, w: cW2 - 0.44, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: fg, margin: 0 });
    s.addText(pl.porte, { x: x + 0.22, y: 2.5, w: cW2 - 0.44, h: 0.3, fontFace: FONT, fontSize: 9.5, color: sub, margin: 0 });
    const preco = pl.id === "enterprise" ? "a partir de " + brl(pl.mensalidade_brl.partida) : brl(pl.mensalidade_brl.partida);
    s.addText([
      { text: preco, options: { fontSize: pl.id === "enterprise" ? 17 : 24, bold: true, color: fg, breakLine: false } },
      { text: " /mês", options: { fontSize: 11, color: sub } },
    ], { x: x + 0.22, y: 2.86, w: cW2 - 0.44, h: 0.55, fontFace: FONT, margin: 0 });
    const linhas = [
      `${pl.franquia_dos_mes.toLocaleString("pt-BR")} DOs/mês inclusos`,
      `Excedente ${brl(pl.excedente_por_do_brl, 2)}/DO`,
      `${pl.contas_cetesb < 0 ? "Contas CETESB ilimitadas*" : pl.contas_cetesb + (pl.contas_cetesb === 1 ? " conta CETESB" : " contas CETESB")} · ${pl.usuarios < 0 ? "usuários ilimitados*" : pl.usuarios + " usuários"}`,
      `IA: ${pl.ia_interacoes_mes.toLocaleString("pt-BR")} interações + ${pl.ia_ingestoes_mes} arquivos/mês`,
      (pl.sso ? "SSO corporativo · " : "") + `auditoria ${pl.retencao_auditoria_meses} meses`,
      `Suporte: ${pl.suporte}`,
    ];
    s.addText(linhas.map((t, j) => ({
      text: t, options: { bullet: { code: "2022", indent: 10 }, breakLine: true, paraSpaceAfter: 6, color: j === 0 ? fg : (hl ? "E3F1ED" : C.ink), bold: j === 0 },
    })), { x: x + 0.22, y: 3.5, w: cW2 - 0.4, h: 2.8, fontFace: FONT, fontSize: 10, valign: "top", margin: 0 });
  });
  s.addText("* ilimitado comercial com fair use contratual. Anual = 2 meses grátis. Trial de 14 dias sem cartão. Valores de tabela 2026 — enquadramento pelo maior critério atingido (DOs, contas ou usuários).", {
    x: M, y: 6.55, w: W - 2 * M, h: 0.55, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0 });
  footer(s, 7, TOTAL);

  // ---- S8 incluído em todos + upsell
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "O que está incluído", "Todo plano leva o produto inteiro — os planos mudam volume, cotas e governança");
  const inc = [
    ["Emissão em lote", "planilha vira dezenas de MTRs de uma vez"],
    ["Recebimento + CDF", "baixa em escala e certificado no mesmo fluxo"],
    ["MTR provisório", "emergência coberta, sem improviso"],
    ["Fila resiliente", "CETESB caiu? Reprocessamos sozinhos"],
    ["Auditoria completa", "trilha por operação — defesa na fiscalização"],
    ["IA operacional", "cota mensal em todos os planos"],
  ];
  const gW = (W - 2 * M - 0.6) / 3;
  inc.forEach((it, i) => {
    const x = M + (i % 3) * (gW + 0.3), y = 1.85 + Math.floor(i / 3) * 1.35;
    card(s, x, y, gW, 1.15, { fill: C.subtle });
    chip(s, x + 0.22, y + 0.24, 0.34, "✓", { fontSize: 12 });
    s.addText(it[0], { x: x + 0.7, y: y + 0.12, w: gW - 0.9, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.ink, margin: 0 });
    s.addText(it[1], { x: x + 0.7, y: y + 0.47, w: gW - 0.9, h: 0.6, fontFace: FONT, fontSize: 10.5, color: C.muted, margin: 0 });
  });
  card(s, M, 4.85, W - 2 * M, 1.55, { fill: C.bgAccent });
  s.addText("O que faz um cliente subir de plano (e pagar feliz):", { x: M + 0.3, y: 5.0, w: W - 2 * M - 0.6, h: 0.35, fontFace: FONT, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
  s.addText("Mais DOs por mês · mais contas CETESB (transportadoras e consultorias) · mais usuários · SSO corporativo · retenção de auditoria mais longa. Alertas em 80/100/120% da franquia avisarão antes de qualquer excedente (chegam junto com o medidor de consumo — em desenvolvimento).", {
    x: M + 0.3, y: 5.38, w: W - 2 * M - 0.6, h: 0.9, fontFace: FONT, fontSize: 12, color: C.ink, margin: 0 });
  footer(s, 8, TOTAL);

  // ---- S9 add-on fiscal (roadmap)
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Roadmap — add-on fiscal", "CT-e + MDF-e no mesmo fluxo do MTR — em desenvolvimento, com vagas de design partner");
  s.addShape("roundRect", { x: M, y: 1.68, w: 3.1, h: 0.34, rectRadius: 0.17, fill: { color: C.warning }, line: { type: "none" } });
  s.addText("EM DESENVOLVIMENTO — NÃO DISPONÍVEL HOJE", { x: M, y: 1.66, w: 3.1, h: 0.34, align: "center", valign: "middle", fontFace: FONT, fontSize: 8.5, bold: true, color: "FFFFFF", margin: 0 });
  bullets(s, [
    { text: "Seríamos os primeiros do mercado a amarrar MTR ↔ CT-e ↔ MDF-e da mesma viagem", bold: true },
    "Bundle CT-e + MDF-e (o MDF-e é obrigatório para a carga rodar — não vendemos separado)",
    "Credenciamento SEFAZ-SP assistido, certificado A1, CFOPs 5.351/6.351 e homologação inclusos no setup",
    "Depois: NFS-e (coletas na cidade) e CTR eletrônico da capital (SP Regula)",
  ], M, 2.3, 6.7, 2.6, { fontSize: 13.5, gap: 9 });
  const f = P.addon_fiscal;
  card(s, 7.6, 2.2, W - 7.6 - M, 3.4, { fill: C.subtle });
  s.addText("PREÇO DE PRÉ-VENDA (TABELA-ALVO)", { x: 7.9, y: 2.4, w: 4.6, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.muted, charSpacing: 1.5, margin: 0 });
  s.addText([
    { text: `Setup por CNPJ: ${brl(f.setup_por_cnpj_brl.min)}–${brl(f.setup_por_cnpj_brl.max)} (única vez)`, options: { bullet: { code: "2022", indent: 10 }, breakLine: true, paraSpaceAfter: 7, color: C.ink } },
    { text: `Mensalidade CT-e+MDF-e: ${brl(f.mensalidade_cte_mdfe_por_cnpj_brl.min)}–${brl(f.mensalidade_cte_mdfe_por_cnpj_brl.max)}/CNPJ`, options: { bullet: { code: "2022", indent: 10 }, breakLine: true, paraSpaceAfter: 7, color: C.ink } },
    { text: `Por documento: ${brl(f.por_documento_brl.faixa_1_ate_200, 2)} → ${brl(f.por_documento_brl.faixa_3_acima, 2)} (degressivo)`, options: { bullet: { code: "2022", indent: 10 }, breakLine: true, paraSpaceAfter: 7, color: C.ink } },
    { text: "Design partners: setup grátis + 50% de desconto por 6 meses", options: { bullet: { code: "2022", indent: 10 }, color: C.primaryDark, bold: true } },
  ], { x: 7.9, y: 2.78, w: W - 7.9 - M - 0.3, h: 2.6, fontFace: FONT, fontSize: 12, valign: "top", margin: 0 });
  s.addText("Compromisso com você: o fiscal só é contratável como design partnership — contrato específico de roadmap, nunca embutido no contrato padrão.", {
    x: M, y: 6.0, w: W - 2 * M, h: 0.6, fontFace: FONT, fontSize: 11.5, italic: true, color: C.warning, margin: 0 });
  footer(s, 9, TOTAL);

  // ---- S10 contrato e pagamento
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Contrato e recebimento", "Fechar é simples: sem fidelidade no mensal, desconto no anual, faturamento no Enterprise");
  const cr = P.contrato_recebimento;
  card(s, M, 1.85, 5.9, 4.3, { fill: C.subtle });
  s.addText("FORMAS DE CONTRATO", { x: M + 0.3, y: 2.05, w: 5.3, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: C.muted, charSpacing: 2, margin: 0 });
  cr.contrato.forEach((c2, i) => {
    const y = 2.5 + i * 1.2;
    s.addText(c2.modalidade, { x: M + 0.3, y, w: 5.3, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: C.primaryDark, margin: 0 });
    s.addText(c2.condicao, { x: M + 0.3, y: y + 0.36, w: 5.3, h: 0.7, fontFace: FONT, fontSize: 11.5, color: C.ink, margin: 0 });
  });
  card(s, 6.85, 1.85, 5.9, 4.3, { fill: C.subtle });
  s.addText("FORMAS DE RECEBIMENTO", { x: 7.15, y: 2.05, w: 5.3, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: C.muted, charSpacing: 2, margin: 0 });
  cr.recebimento.forEach((r2, i) => {
    const y = 2.5 + i * 0.92;
    chip(s, 7.15, y + 0.02, 0.3, "✓", { fontSize: 10 });
    s.addText(r2.forma, { x: 7.58, y, w: 4.9, h: 0.34, fontFace: FONT, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
    s.addText(r2.aplicacao, { x: 7.58, y: y + 0.33, w: 4.9, h: 0.5, fontFace: FONT, fontSize: 10.5, color: C.muted, margin: 0 });
  });
  s.addText(`Excedente: ${cr.excedente_faturamento}. Sem surpresa: acima do teto, a conversa é upgrade — não fatura.`, {
    x: M, y: 6.35, w: W - 2 * M, h: 0.5, fontFace: FONT, fontSize: 11.5, italic: true, color: C.muted, margin: 0 });
  footer(s, 10, TOTAL);

  // ---- S11 garantias honestas
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Compromissos", "Prometemos o que controlamos — e escrevemos isso em contrato");
  const gar = [
    ["O que garantimos", ["99,5% de disponibilidade da plataforma SICAT", "Reprocessamento automático: comando aceito não se perde — quando a CETESB volta, ele executa", "Trilha de auditoria de toda operação", "LGPD: credenciais criptografadas, acesso segregado por papel (DPA no contrato)"], C.success],
    ["O que NÃO vendemos", ["“Uptime do portal CETESB” — o portal é do governo; quando ele cai, nossa fila protege seu trabalho", "DMR completa hoje: entregamos a preparação; a transmissão está a caminho (será upgrade grátis)", "Módulo fiscal como pronto — é roadmap com pré-venda transparente"], C.warning],
  ];
  gar.forEach((g, i) => {
    const x = M + i * ((W - 2 * M) / 2 + 0.0) + (i === 1 ? 0.3 : 0);
    const w2 = (W - 2 * M - 0.3) / 2;
    card(s, M + i * (w2 + 0.3), 1.85, w2, 4.35, { fill: C.subtle });
    s.addText(g[0], { x: M + i * (w2 + 0.3) + 0.3, y: 2.05, w: w2 - 0.6, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: g[2], margin: 0 });
    bullets(s, g[1], M + i * (w2 + 0.3) + 0.3, 2.6, w2 - 0.6, 3.4, { fontSize: 12, gap: 9 });
  });
  s.addText("Essa honestidade é argumento de venda: o cliente que já sofreu com promessa de robô mágico reconhece a diferença.", {
    x: M, y: 6.35, w: W - 2 * M, h: 0.5, fontFace: FONT, fontSize: 11.5, italic: true, color: C.muted, margin: 0 });
  footer(s, 11, TOTAL);

  // ---- S12 fechamento (dark)
  s = pres.addSlide(); s.background = { color: C.darkBg };
  s.addShape("ellipse", { x: -2.5, y: 3.8, w: 7, h: 7, fill: { color: C.primaryDark, transparency: 66 }, line: { type: "none" } });
  logoMark(s, M, 0.95, 0.62);
  s.addText("Próximo passo: 14 dias de teste, sem cartão", { x: M, y: 1.95, w: W - 2 * M, h: 0.8, fontFace: FONT, fontSize: 32, bold: true, color: C.darkText, margin: 0 });
  const passos = [
    ["1", "Trial guiado", "conta criada em 1 dia útil; 20 DOs + IA para testar com a SUA operação"],
    ["2", "Piloto", "2–4 semanas com onboarding assistido no plano escolhido"],
    ["3", "Contrato", "mensal sem fidelidade ou anual com 2 meses grátis"],
  ];
  passos.forEach((p3, i) => {
    const x = M + i * ((W - 2 * M - 0.6) / 3 + 0.3), w2 = (W - 2 * M - 0.6) / 3;
    s.addShape("roundRect", { x, y: 3.1, w: w2, h: 1.9, rectRadius: 0.1, fill: { color: C.darkSurface }, line: { color: "223038", width: 1 } });
    chip(s, x + 0.25, 3.35, 0.4, p3[0], { fontSize: 14 });
    s.addText(p3[1], { x: x + 0.8, y: 3.33, w: w2 - 1.0, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: C.darkText, valign: "middle", margin: 0 });
    s.addText(p3[2], { x: x + 0.25, y: 3.9, w: w2 - 0.5, h: 1.0, fontFace: FONT, fontSize: 11.5, color: C.darkMuted, margin: 0 });
  });
  s.addText("[CONTATO DO VENDEDOR — nome · e-mail · WhatsApp]      [ENDEREÇO DO TRIAL — editar]", {
    x: M, y: 5.65, w: W - 2 * M, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: "6FC7B4", margin: 0 });
  s.addText("SICAT · NovaIT — automação de documentos ambientais · material comercial 2026", { x: M, y: 6.75, w: W - 2 * M, h: 0.35, fontFace: FONT, fontSize: 10, color: C.darkMuted, margin: 0 });

  return pres.writeFile({ fileName: path.join(__dirname, "..", "deck-vendas-sicat.pptx") });
}

// ================================================================ DECK 2 — PARCERIA / EMBEDDED
function deckParceria() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "SICAT / NovaIT";
  pres.title = "SICAT Embedded — parcerias";
  const TOTAL = 11;
  const cp = P.canal_parceria;

  // ---- S1 capa
  let s = pres.addSlide();
  s.background = { color: C.darkBg };
  s.addShape("ellipse", { x: 9.0, y: -2.6, w: 8.2, h: 8.2, fill: { color: C.primaryDark, transparency: 60 }, line: { type: "none" } });
  logoMark(s, M, 1.1, 0.85);
  s.addText("SICAT Embedded", { x: M - 0.02, y: 2.15, w: 10.5, h: 1.1, fontFace: FONT, fontSize: 52, bold: true, color: C.darkText, margin: 0 });
  s.addText("Conformidade de resíduos como componente do seu produto.", {
    x: M, y: 3.35, w: 9.2, h: 0.7, fontFace: FONT, fontSize: 20, color: "BFD6D0", margin: 0 });
  s.addText("Seguro de transporte, TMS, ERP, marketplace: embarque emissão, validação e monitoramento de documentos — e cobre por documento, na sua marca.", {
    x: M, y: 4.2, w: 9.4, h: 0.9, fontFace: FONT, fontSize: 14, color: C.darkMuted, margin: 0 });
  s.addText("Proposta de parceria · 2026 · confidencial", { x: M, y: 6.6, w: 7, h: 0.35, fontFace: FONT, fontSize: 11, color: C.darkMuted, margin: 0 });

  // ---- S2 oportunidade
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "A oportunidade", "Todo transporte de resíduo no Brasil gera documento obrigatório — por lei");
  const stats = [
    ["4,08 mi", "MTRs por ano no sistema nacional (SINIR, 2023)"],
    ["~2,2 mi", "MTRs por ano só no SIGOR-SP — mercado adicional"],
    ["577 mil", "empresas cadastradas nos 3 perfis (geradores, transportadores, destinadores)"],
  ];
  const stW = (W - 2 * M - 0.6) / 3;
  stats.forEach((st, i) => {
    const x = M + i * (stW + 0.3);
    card(s, x, 1.9, stW, 2.1, { fill: C.subtle });
    s.addText(st[0], { x: x + 0.25, y: 2.12, w: stW - 0.5, h: 0.75, fontFace: FONT, fontSize: 34, bold: true, color: C.primary, margin: 0 });
    s.addText(st[1], { x: x + 0.25, y: 2.95, w: stW - 0.5, h: 0.9, fontFace: FONT, fontSize: 11.5, color: C.ink, margin: 0 });
  });
  bullets(s, [
    { text: "Obrigatório e fiscalizado: Portaria MMA 280/2020 (nacional) + Resolução SIMA 27/2021 (SP) + aferição CETESB (DD 024/2022/P)", bold: true },
    "Quem embute conformidade no próprio produto captura valor em cada transação do cliente — sem virar empresa de software ambiental",
    "Não identificamos player de “conformidade embarcada” neste mercado: o espaço de parceria está aberto",
  ], M, 4.35, W - 2 * M, 1.9, { fontSize: 13.5, gap: 9 });
  footer(s, 2, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S3 conceito
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "O conceito", "Seu produto na frente, o SICAT por trás — cobrando por documento conforme");
  const flow = [
    { t: "SEU PRODUTO", d: "apólice, embarque, pedido, contrato — a transação do seu cliente", fill: "FFFFFF", fg: C.ink },
    { t: "SICAT (INVISÍVEL)", d: "emite, valida e monitora o documento ambiental da transação — via API, com trilha de auditoria", fill: C.primary, fg: "FFFFFF" },
    { t: "CETESB / SIGOR-SP", d: "portal oficial de SP — integração real, fila resiliente, reprocessamento (SINIR e demais estados: roadmap)", fill: "FFFFFF", fg: C.ink },
  ];
  flow.forEach((b, i) => {
    const bw = 3.7, bx = M + i * (bw + 0.45);
    s.addShape("roundRect", { x: bx, y: 2.2, w: bw, h: 1.7, rectRadius: 0.1, fill: { color: b.fill }, line: { color: b.fill === "FFFFFF" ? C.borderStrong : b.fill, width: 1.25 } });
    s.addText(b.t, { x: bx + 0.22, y: 2.4, w: bw - 0.44, h: 0.35, fontFace: FONT, fontSize: 12.5, bold: true, color: b.fg, margin: 0 });
    s.addText(b.d, { x: bx + 0.22, y: 2.78, w: bw - 0.44, h: 1.0, fontFace: FONT, fontSize: 10.5, color: b.fill === "FFFFFF" ? C.muted : "D8EAE5", margin: 0 });
    if (i < 2) s.addText("→", { x: bx + bw + 0.05, y: 2.85, w: 0.35, h: 0.4, align: "center", fontFace: FONT, fontSize: 18, bold: true, color: C.borderStrong, margin: 0 });
  });
  const modos = [
    ["White-label", "o painel e os PDFs saem com a SUA marca — o cliente nem sabe que existe SICAT"],
    ["API-first", "seu sistema chama a nossa API; nós devolvemos documento emitido, status e trilha"],
    ["Por documento", "você paga por Documento Conforme processado — sem licença por usuário"],
  ];
  modos.forEach((m2, i) => {
    const w2 = (W - 2 * M - 0.6) / 3, x = M + i * (w2 + 0.3);
    card(s, x, 4.35, w2, 1.75, { fill: C.subtle });
    s.addText(m2[0], { x: x + 0.25, y: 4.55, w: w2 - 0.5, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.primaryDark, margin: 0 });
    s.addText(m2[1], { x: x + 0.25, y: 4.98, w: w2 - 0.5, h: 1.0, fontFace: FONT, fontSize: 11.5, color: C.ink, margin: 0 });
  });
  footer(s, 3, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S4 exemplo âncora — seguro
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Exemplo âncora", "Seguro de transporte de resíduos com conformidade embarcada");
  const ex = cp.exemplo_seguradora;
  const steps = [
    ["1", "Apólice emitida", "cada carga segurada exige documentação ambiental válida — cláusula da apólice"],
    ["2", "Carga programada", "o sistema da seguradora chama a API do SICAT: MTR emitido/validado na hora"],
    ["3", "Viagem monitorada", "status do documento acompanhado até a baixa no destino — alertas de pendência"],
    ["4", "Sinistro auditável", "trilha completa: o que foi emitido, quando, por quem — regulação de sinistro sem disputa"],
  ];
  steps.forEach((st, i) => {
    const w2 = (W - 2 * M - 0.9) / 4, x = M + i * (w2 + 0.3);
    card(s, x, 1.9, w2, 2.3, { fill: C.subtle });
    chip(s, x + 0.22, 2.1, 0.38, st[0], { fontSize: 13 });
    s.addText(st[1], { x: x + 0.22, y: 2.58, w: w2 - 0.44, h: 0.4, fontFace: FONT, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
    s.addText(st[2], { x: x + 0.22, y: 3.0, w: w2 - 0.44, h: 1.1, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0 });
  });
  card(s, M, 4.6, W - 2 * M, 1.75, { fill: C.primary, lineColor: C.primary });
  s.addText("A CONTA DO PARCEIRO (EXEMPLO ILUSTRATIVO)", { x: M + 0.3, y: 4.78, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: "BFE3DA", charSpacing: 1.5, margin: 0 });
  s.addText([
    { text: `${ex.cargas_mes.toLocaleString("pt-BR")} cargas/mês  ·  custo SICAT ${brl(ex.custo_sicat_por_doc, 2)}/doc  ·  cobrado no pacote ${brl(ex.preco_no_pacote_por_doc, 2)}/doc  →  `, options: { color: "EAF4F1", breakLine: false } },
    { text: `${brl((ex.preco_no_pacote_por_doc - ex.custo_sicat_por_doc) * ex.cargas_mes)} /mês de margem no componente documental`, options: { bold: true, color: "FFFFFF" } },
  ], { x: M + 0.3, y: 5.12, w: W - 2 * M - 0.6, h: 0.55, fontFace: FONT, fontSize: 14, margin: 0 });
  s.addText("— além do produto principal. O seguro fica mais vendável: “apólice que já sai conforme”.", {
    x: M + 0.3, y: 5.7, w: W - 2 * M - 0.6, h: 0.4, fontFace: FONT, fontSize: 11.5, italic: true, color: "D8EAE5", margin: 0 });
  footer(s, 4, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S5 outros encaixes
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Onde mais encaixa", "Quatro categorias de parceiro, o mesmo motor por documento");
  const fits = [
    ["Seguradoras e corretoras", "conformidade embarcada na apólice de transporte; sinistro com trilha auditável"],
    ["TMS / ERP de logística", "todo embarque de resíduo sai com MTR emitido de dentro do sistema que a operação já usa"],
    ["Marketplaces e recicladoras", "cada negociação fecha com a documentação da retirada resolvida na própria plataforma"],
    ["Bancos, ESG e crédito verde", "evidência documental de destinação correta para relatórios, garantias e taxas verdes"],
  ];
  fits.forEach((f2, i) => {
    const w2 = (W - 2 * M - 0.3) / 2, x = M + (i % 2) * (w2 + 0.3), y = 1.9 + Math.floor(i / 2) * 2.15;
    card(s, x, y, w2, 1.95, { fill: C.subtle });
    chip(s, x + 0.28, y + 0.28, 0.42, String(i + 1), { fontSize: 14 });
    s.addText(f2[0], { x: x + 0.85, y: y + 0.28, w: w2 - 1.1, h: 0.42, fontFace: FONT, fontSize: 15, bold: true, color: C.ink, valign: "middle", margin: 0 });
    s.addText(f2[1], { x: x + 0.28, y: y + 0.85, w: w2 - 0.56, h: 0.95, fontFace: FONT, fontSize: 12, color: C.muted, margin: 0 });
  });
  s.addText("Em todos os casos o parceiro é dono do cliente e do preço final; o SICAT é o motor de conformidade por trás.", {
    x: M, y: 6.35, w: W - 2 * M, h: 0.45, fontFace: FONT, fontSize: 12, italic: true, color: C.muted, margin: 0 });
  footer(s, 5, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S6 integração
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Integração em tempo real", "O que já existe em produção — e o que ligamos junto com o primeiro parceiro");
  const w2 = (W - 2 * M - 0.3) / 2;
  card(s, M, 1.85, w2, 4.4, { fill: C.subtle });
  s.addText("DISPONÍVEL HOJE (EM PRODUÇÃO)", { x: M + 0.3, y: 2.03, w: w2 - 0.6, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: C.success, charSpacing: 1.5, margin: 0 });
  bullets(s, cp.disponivel_hoje, M + 0.3, 2.45, w2 - 0.6, 3.6, { fontSize: 11.5, gap: 8 });
  card(s, M + w2 + 0.3, 1.85, w2, 4.4, { fill: C.subtle });
  s.addText("LIGAMOS COM O PARCEIRO (ROADMAP CURTO)", { x: M + w2 + 0.6, y: 2.03, w: w2 - 0.6, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: C.warning, charSpacing: 1.5, margin: 0 });
  bullets(s, cp.roadmap_integracao.map((r2) => `${r2.item} — ${r2.prazo_semanas} semanas`), M + w2 + 0.6, 2.45, w2 - 0.6, 3.0, { fontSize: 11.5, gap: 8 });
  s.addText(`Sandbox dedicado, gratuito por ${cp.sandbox_dias_gratis} dias, entra no ar na semana 1 da parceria.`, {
    x: M + w2 + 0.6, y: 5.55, w: w2 - 0.6, h: 0.6, fontFace: FONT, fontSize: 11.5, bold: true, color: C.primaryDark, margin: 0 });
  footer(s, 6, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S7 monitoramento
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Monitoramento", "Cada documento com status vivo — visibilidade que vira produto para o SEU cliente");
  card(s, M, 1.85, 6.2, 4.4, { fill: C.subtle });
  s.addText("PAINEL OPERACIONAL (ilustrativo)", { x: M + 0.3, y: 2.03, w: 5.6, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.muted, charSpacing: 1.5, margin: 0 });
  const rows = [
    ["MTR 4501-8821 · Carga 2231 · Osasco → Paulínia", "EMITIDO", "15616B", "E2F0F2"],
    ["MTR 4501-8822 · Carga 2232 · Barueri → Caieiras", "RECEBIDO", "1A5E3D", "E2F2E9"],
    ["MTR 4501-8823 · Carga 2233 · Santos → Cubatão", "BAIXADO", "1A5E3D", "E2F2E9"],
    ["MTR 4501-8824 · Carga 2240 · Sorocaba → Iperó", "REPROCESSADO", "8A540F", "F8EEDD"],
    ["CDF 1102-441 · Lote 88 · destinação certificada", "CDF GERADO", "1A5E3D", "E2F2E9"],
  ];
  rows.forEach((r2, i) => statusRow(s, M + 0.3, 2.45 + i * 0.6, 5.6, r2[0], r2[1], r2[2], r2[3]));
  s.addText("Reprocessamentos automáticos aparecem como evento — nunca como documento perdido.", {
    x: M + 0.3, y: 5.6, w: 5.6, h: 0.55, fontFace: FONT, fontSize: 10.5, italic: true, color: C.muted, margin: 0 });
  bullets(s, [
    { text: "Eventos de status por documento: emitido, recebido, baixado, falhou, reprocessado", bold: true },
    "Health de contas e sessões CETESB — o parceiro enxerga risco antes do cliente",
    "Trilha de auditoria exportável por correlationId (regulação de sinistro, compliance, ESG)",
    "Relatórios CSV e, no roadmap, webhooks em tempo real + painel white-label",
  ], 7.15, 2.1, W - 7.15 - M, 3.9, { fontSize: 13, gap: 10 });
  footer(s, 7, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S8 modelo comercial
  s = pres.addSlide(); s.background = { color: C.bg };
  header(s, "Modelo comercial", "Pague por Documento Conforme — o preço cai com o volume");
  const tRows = [
    [{ text: "Volume mensal", options: { bold: true, color: "FFFFFF", fill: { color: C.primary } } },
     { text: "Preço por documento", options: { bold: true, color: "FFFFFF", fill: { color: C.primary } } }],
    ...cp.por_documento_brl.map((fx) => [
      { text: fx.faixa, options: { color: C.ink } },
      { text: brl(fx.preco, 2), options: { bold: true, color: C.primaryDark } },
    ]),
  ];
  s.addTable(tRows, {
    x: M, y: 2.0, w: 6.1, rowH: 0.52, fontFace: FONT, fontSize: 13,
    border: { type: "solid", color: C.border, pt: 0.75 }, fill: { color: "FFFFFF" },
    valign: "middle", margin: 0.08,
  });
  bullets(s, [
    { text: `Mínimo mensal: ${brl(cp.minimo_mensal_brl)} (garante prioridade de suporte e capacidade)`, bold: true },
    `Setup de integração: ${brl(cp.setup_integracao_brl.min)}–${brl(cp.setup_integracao_brl.max)} — onboarding técnico, sandbox, homologação e go-live assistido`,
    `White-label: +${brl(cp.white_label_mes_brl)}/mês por marca`,
    `Alternativa revenue-share: ${Math.round(cp.rev_share_alternativo.min * 100)}–${Math.round(cp.rev_share_alternativo.max * 100)}% do componente documental do seu produto`,
    `Sandbox gratuito por ${cp.sandbox_dias_gratis} dias — a parceria começa sem custo`,
  ], 7.15, 2.05, W - 7.15 - M, 3.8, { fontSize: 12.5, gap: 10 });
  s.addText("Valores de tabela 2026 para proposta de parceria; contrato final por volume comprometido. Documento Conforme = documento emitido/validado via API com trilha de auditoria.", {
    x: M, y: 6.35, w: W - 2 * M, h: 0.55, fontFace: FONT, fontSize: 10.5, color: C.muted, margin: 0 });
  footer(s, 8, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S9 SLA + segurança
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "SLA honesto e segurança", "Grandes marcas exigem clareza — nosso contrato entrega");
  const w3 = (W - 2 * M - 0.3) / 2;
  card(s, M, 1.85, w3, 4.3, { fill: C.subtle });
  s.addText("SLA EM DUAS CAMADAS", { x: M + 0.3, y: 2.03, w: w3 - 0.6, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: C.primaryDark, charSpacing: 1.5, margin: 0 });
  bullets(s, [
    { text: "99,5% de disponibilidade da plataforma SICAT", bold: true },
    "Garantia de reprocessamento: comando aceito nunca se perde — a fila segura e executa quando o portal volta",
    "Exclusão explícita: indisponibilidade/mudança do portal CETESB (governo) — com compromisso de adequação em dias úteis",
    "Nunca vendemos “uptime de emissão” — e explicamos o porquê no contrato",
  ], M + 0.3, 2.45, w3 - 0.6, 3.5, { fontSize: 12, gap: 9 });
  card(s, M + w3 + 0.3, 1.85, w3, 4.3, { fill: C.subtle });
  s.addText("SEGURANÇA E LGPD", { x: M + w3 + 0.6, y: 2.03, w: w3 - 0.6, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: C.primaryDark, charSpacing: 1.5, margin: 0 });
  bullets(s, [
    "Credenciais CETESB criptografadas e segregadas por cliente do parceiro (multi-conta + RBAC)",
    "Trilha de auditoria imutável por operação",
    "DPA (acordo de tratamento de dados) anexo ao contrato de parceria",
    "SSO corporativo (OIDC) para os times do parceiro",
  ], M + w3 + 0.6, 2.45, w3 - 0.6, 3.5, { fontSize: 12, gap: 9 });
  footer(s, 9, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S10 como começa
  s = pres.addSlide(); s.background = { color: C.surface };
  header(s, "Como começa", "Do aperto de mão ao documento em produção em 4–8 semanas");
  const tl = [
    ["Semana 1", "Sandbox no ar", "chaves de teste, dados fictícios, workshop técnico com seu time"],
    ["Semanas 2–5", "Integração", "seu sistema chama a API; homologação conjunta caso a caso"],
    ["Semanas 4–8", "Piloto real", "um produto, um recorte de clientes, documentos de verdade monitorados"],
    ["Go-live", "Escala", "contrato por volume, white-label opcional, roadmap conjunto"],
  ];
  tl.forEach((t2, i) => {
    const w4 = (W - 2 * M - 0.9) / 4, x = M + i * (w4 + 0.3);
    s.addShape("roundRect", { x, y: 2.3, w: w4, h: 2.6, rectRadius: 0.1, fill: { color: i === 3 ? C.primary : C.subtle }, line: { color: i === 3 ? C.primary : C.border, width: 1 } });
    s.addText(t2[0], { x: x + 0.22, y: 2.5, w: w4 - 0.44, h: 0.3, fontFace: FONT, fontSize: 10.5, bold: true, color: i === 3 ? "BFE3DA" : C.muted, charSpacing: 1, margin: 0 });
    s.addText(t2[1], { x: x + 0.22, y: 2.85, w: w4 - 0.44, h: 0.45, fontFace: FONT, fontSize: 15, bold: true, color: i === 3 ? "FFFFFF" : C.ink, margin: 0 });
    s.addText(t2[2], { x: x + 0.22, y: 3.35, w: w4 - 0.44, h: 1.4, fontFace: FONT, fontSize: 10.5, color: i === 3 ? "E3F1ED" : C.muted, margin: 0 });
    if (i < 3) s.addText("→", { x: x + w4 + 0.02, y: 3.3, w: 0.3, h: 0.4, align: "center", fontFace: FONT, fontSize: 16, bold: true, color: C.borderStrong, margin: 0 });
  });
  s.addText("Investimento para começar: só o setup de integração — o sandbox é por nossa conta. O mínimo mensal só corre a partir do go-live.", {
    x: M, y: 5.35, w: W - 2 * M, h: 0.5, fontFace: FONT, fontSize: 12.5, bold: true, color: C.primaryDark, margin: 0 });
  s.addText("Nota de transparência: o SICAT opera hoje sobre a integração real do portal CETESB-SP; a API pública de parceiro, webhooks e painel white-label são ativados junto com o primeiro parceiro (4–8 semanas, cronograma acima).", {
    x: M, y: 5.95, w: W - 2 * M, h: 0.6, fontFace: FONT, fontSize: 10.5, italic: true, color: C.muted, margin: 0 });
  footer(s, 10, TOTAL, { label: "SICAT Embedded · Material de parceria · 2026" });

  // ---- S11 fechamento
  s = pres.addSlide(); s.background = { color: C.darkBg };
  s.addShape("ellipse", { x: -2.2, y: 3.6, w: 7.4, h: 7.4, fill: { color: C.primaryDark, transparency: 64 }, line: { type: "none" } });
  logoMark(s, M, 1.0, 0.62);
  s.addText("Vamos desenhar o piloto juntos?", { x: M, y: 2.0, w: W - 2 * M, h: 0.8, fontFace: FONT, fontSize: 34, bold: true, color: C.darkText, margin: 0 });
  s.addText("Escolha um produto, um recorte de clientes e um mês no calendário.\nNós levamos o sandbox, a API e o time técnico.", {
    x: M, y: 2.95, w: 9.6, h: 1.0, fontFace: FONT, fontSize: 16, color: "BFD6D0", margin: 0 });
  card(s, M, 4.3, 7.6, 1.5, { fill: C.darkSurface, lineColor: "223038" });
  s.addText([
    { text: "Primeiro parceiro por vertical leva condição de fundador: ", options: { bold: true, color: C.darkText, breakLine: false } },
    { text: "50% de desconto no setup + exclusividade de vertical por 12 meses (condição promocional de lançamento — negociável).", options: { color: C.darkMuted } },
  ], { x: M + 0.3, y: 4.55, w: 7.0, h: 1.0, fontFace: FONT, fontSize: 13, margin: 0 });
  s.addText("[CONTATO — nome · e-mail · WhatsApp]", { x: M, y: 6.1, w: 8, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: "6FC7B4", margin: 0 });
  s.addText("SICAT Embedded · NovaIT · material de parceria 2026", { x: M, y: 6.8, w: 8, h: 0.35, fontFace: FONT, fontSize: 10, color: C.darkMuted, margin: 0 });

  return pres.writeFile({ fileName: path.join(__dirname, "..", "deck-parceria-embedded-sicat.pptx") });
}

// ---------------------------------------------------------------- main
(async () => {
  await deckVendas();
  console.log("OK: deck-vendas-sicat.pptx");
  await deckParceria();
  console.log("OK: deck-parceria-embedded-sicat.pptx");
})().catch((e) => { console.error(e); process.exit(1); });
