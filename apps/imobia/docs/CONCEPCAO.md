# imobia — Concepção (fonte da verdade dos requisitos)

> Origem: documento anexado pelo usuário (`Criar um aplicativo usando múltiplos modelos de
> linguagem.docx`) — uma **conversa real de concepção** — + um **diagrama desenhado à mão**.
> Este arquivo consolida o escopo para o Claude e para a esteira. Não repete a arquitetura de
> implementação (ver [`../CLAUDE.md`](../CLAUDE.md)).

## Ideia central

Um **ecossistema de negócios imobiliário + fintech** (não um CRM simples): um módulo alimenta o outro
— o cliente que não compra vira cliente de **recuperação de crédito**; o imóvel captado gera receita na
intermediação e na **avaliação (PTAM)**. O **WhatsApp é o coração** que conecta tudo. **Múltiplas IAs**
atuam como funcionários especializados.

## Divisão de trabalho das IAs (fiel ao documento)

| IA | Papel | Onde atua |
|---|---|---|
| **Cortex** | Triagem rápida, barata, automação diária, busca semântica | Classifica canal/intenção do WhatsApp; categoria de despesa; busca de imóveis por embeddings. É o **roteador** do grafo. |
| **GPT** | Lógica, function-calling, automação de banco de dados | Qualifica leads (lead scoring); categoriza PJ/PF; NL→agendamento; média m² da ACM; simula parcelas do Corbam. |
| **Claude** | Redação e análise avançada | Laudo **PTAM** (ABNT NBR 14653); laudo de vistoria; relatório de fluxo de caixa; cartas de contestação/acordo; lembretes gentis. |
| **Gemini** | Documentos e visão (janela de contexto grande + multimodal) | Valida RG/CNH/holerite/certidões; lê Serasa/Boa Vista e extratos; analisa fotos de vistoria (fissuras/manchas). |

## Módulos (do diagrama + conversa)

1. **Captação (Vende/Locação)** — cadastra proprietário + imóvel; GPT qualifica; Gemini lê
   contratos/escrituras em PDF.
2. **Clientes/Leads** — coleta de clientes específicos (compra/locação); lead scoring (GPT); perfil
   financeiro; validação de documentos (Gemini).
3. **Financeiro PJ/PF** — separa gasto empresarial × pessoal (GPT via function-calling a partir de
   extratos/PIX/recibos); relatório e conselhos de fluxo de caixa (Claude).
4. **Agenda e Eventos** — texto livre ("agendei visita com João amanhã 15h") → tarefa estruturada
   (GPT); lembretes (Claude); geração de imagem de marketing ("Imóvel Disponível").
5. **WhatsApp multi-instância** — vários números por segmento (captação/vendas/finanças); webhook
   centralizador; Cortex faz a triagem inicial. (Baileys/Evolution/Z-API.)
6. **ACM (Análise de Mercado Comparativa)** — varredura de portais (ZAP/VivaReal/OLX) → Cortex limpa
   e deduplica → GPT calcula média do m² → relatório preliminar.
7. **PTAM (Parecer Técnico de Avaliação Mercadológica)** — documento oficial ABNT NBR 14653; Claude
   redige a fundamentação técnica/jurídica → PDF com papel timbrado.
8. **Corbam/COBAN (correspondente bancário)** — recuperação de crédito: **limpa nome**, aumento de
   **score**, **rating comercial**. Gemini lê Serasa/extrato; GPT simula parcelas; Claude redige
   contestações/acordos. Lead reprovado no banco entra nesta esteira (mantém no funil).
9. **Vistoria de Imóveis e Laudos** — vistoriador sobe fotos; Gemini descreve o estado físico; Claude
   escreve o laudo oficial (anexável ao contrato).
10. **Documentos de cada etapa** — Gemini valida RG/CNH/holerites/certidões/contratos sociais enviados
    pelo chat (válido / ilegível / vencido). **Trilha de auditoria** registra cada etapa e **qual IA**
    a produziu.

## Fluxo consolidado (do desenho)

WhatsApp (eixo) → Cortex (triagem: qual canal/intenção) → GPT (automação de dados: alimenta Financeiro
PJ/PF, atualiza Agenda, salva no banco) · Claude (redação: relatórios, contestações do Corbam,
fundamentação do PTAM, laudos) · Gemini (documentos/fotos). "Se aprovado → busca de imóveis; se
reprovado → oferece limpa nome/score (Corbam)."

## Fora de escopo / notas

- Não é aconselhamento jurídico; PTAM/laudos são artefatos a serem assinados por profissional (CRECI/CNAI).
- Integrações externas (WhatsApp, scraping de portais, geração de imagem, chaves de IA) são **fail-soft**
  e **dormentes** até serem configuradas com credenciais.
- Cache de scraping (evitar buscar o mesmo imóvel várias vezes/dia) e fila de mensagens (Redis/BullMQ)
  são requisitos de escalabilidade citados no documento.
