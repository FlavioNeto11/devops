---
name: auditar-navegacao-cetesb-playwright
description: Navega com Playwright em sistema externo CETESB/SIGOR com CAPTCHA assistido, gates de mutação e auditoria de payloads.
agent: auditor-navegacao-externa-mtr
argument-hint: informe work_id, URL, credenciais de runtime e limites operacionais
---

# Auditar navegação externa CETESB/SIGOR com Playwright

PLAYWRIGHT_EXTERNAL_NAV_AUDIT.

Execute uma auditoria de navegação externa segura e documentada.

Use este work_id:

${input:work_id:Informe um work_id em slug curto e estavel; ex.: navegacao-externa-auditoria}

URL alvo:

${input:target_url:Informe a URL alvo; ex.: <https://mtr.cetesb.sp.gov.br/#/>}

Perfil operacional ou papel da sessão:

${input:operational_profile:Descreva o perfil operacional usado na auditoria}

Login ou email informado em runtime:

${input:login_email:Informe o login em runtime; não persistir valor completo no repositório}

Segredo ou senha informado em runtime:

${input:credential_secret:Informe o segredo apenas para a execução atual; não persistir}

Fluxos sensíveis estão permitidos?

${input:sensitive_flows_allowed:nao}

Deve parar antes de qualquer mutação?

${input:stop_before_mutation:sim}

Escopo de navegação permitido:

${input:navigation_scope:login, create, receive, download, register}

Escopo opcional de correlação com frontend SICAT:

${input:sicat_correlation_scope:frontend relevante, services, views e payloads quando aplicável}

Se o usuário disser que o CAPTCHA ou checkpoint humano equivalente já está liberado na sessão ativa, trate a retomada como `fast_path_resume`.

Regras obrigatórias:

1. Não persista credenciais, segredos, tokens ou amostras sensíveis em arquivos do repositório.
2. Ao chegar ao CAPTCHA, pare, peça apoio do usuário, mantenha a fase aberta com estado `awaiting_user_unblock_in_chat` e só prossiga após confirmação explícita.
3. Se o usuário confirmar que o checkpoint humano já foi liberado na sessão ativa, reuse imediatamente a página e a sessão atuais; não faça `refresh`, `reload`, nova navegação, retorno para home ou reinspeção ampla, salvo se o contexto estiver irrecoverável.
4. Em `fast_path_resume`, priorize apenas o mínimo necessário para a ação sensível pendente: preencher campos faltantes, confirmar seleções obrigatórias e clicar na ação preparada assim que o estado visível permitir.
5. Adie documentação detalhada, screenshots extras, varredura ampla de DOM, coleta extensa de rede e correlação com código até que o login ou passo crítico seja concluído ou até surgir novo bloqueio.
6. Em qualquer fluxo que crie, receba, registre, confirme, assine, transmita, baixe com efeito colateral ou altere estado, avance apenas até o ponto imediatamente anterior ao envio ou confirmação final, salvo autorização explícita do usuário durante a sessão.
7. Use somente `sim` ou `nao` nos parâmetros `sensitive_flows_allowed` e `stop_before_mutation`.
8. Se `stop_before_mutation=sim`, pare sempre antes de qualquer mutação, independentemente de `sensitive_flows_allowed`.
9. Se `stop_before_mutation=nao` e `sensitive_flows_allowed=sim`, pause e peça confirmação antes de qualquer ação irreversível ou que altere estado.
10. Se `sensitive_flows_allowed=nao`, não execute mutação; documente até o ponto anterior ao envio ou confirmação final.
11. Se a janela/browser for fechada, a sessão ativa se perder ou houver checkpoint humano pendente, não trate isso como fluxo concluído: mantenha o workstream aberto, responda no chat apenas com uma mensagem curta de espera por desbloqueio do usuário e registre como retomar a mesma fase.
12. Documente a navegação passo a passo em `docs/handoffs/<work_id>/01-source-validation.md`, no estilo de handoff operacional, com telas, ações, resultados visíveis, network calls e payloads relevantes, mas sem desperdiçar a janela sensível do `fast_path_resume`.
13. Ao pausar por desbloqueio humano, registre o estado `awaiting_user_unblock_in_chat`, o último passo válido e um prompt curto para retomada da mesma fase quando houver nova sessão ativa.
14. Correlacione requests e payloads observados com o frontend SICAT quando houver evidência suficiente em código.
15. O `fast_path_resume` não enfraquece nenhuma trava: não automatize CAPTCHA, não persista credenciais e não ultrapasse `stop_before_mutation` ou gates de confirmação.
16. Se a solicitação exigir depois correção de integração ou produto, encerre esta fase com `next_agent_required` apenas quando o próximo owner realmente mudar, em vez de implementar a próxima especialidade no mesmo fluxo.
