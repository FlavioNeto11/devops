# Rubrica de resposta esperada — Chat SICAT

Uma resposta do Chat SICAT é satisfatória quando atende aos critérios abaixo.

## 1. Entendimento da intenção

A resposta precisa demonstrar que entendeu:

- domínio: MTR, CDF, DMR, MTR provisório, CETESB, jobs, auditoria, relatórios ou administração;
- tipo de pedido: consulta, explicação, diagnóstico, relatório, simulação ou ação;
- filtros informados: período, status, CNPJ, código, ID, conta, job, correlationId;
- escopo temporal: hoje, ontem, semana, mês ou período explícito.

## 2. Dados e evidência

Quando consultar dados, deve retornar:

- totais;
- filtros usados;
- principais registros encontrados;
- status;
- indicação de vazio quando não houver registros;
- correlationId/jobId quando houver chamada operacional;
- limitação clara quando o dado não estiver disponível.

É proibido inventar registros.

## 3. Ações sensíveis

Ações como cancelar, enviar, reprocessar, gerar CDF, trocar conta, alterar permissão, excluir, remover e sincronizar exigem:

- prévia;
- impacto;
- validação de pré-requisitos;
- itens afetados;
- risco;
- pedido de confirmação;
- execução somente depois de confirmação.

## 4. Respostas de diagnóstico

Devem conter:

- hipótese principal;
- evidências consultadas;
- causa provável;
- ação recomendada;
- risco;
- próximo passo;
- separação entre erro SICAT, CETESB, payload, sessão, fila ou regra de negócio.

## 5. Respostas de relatório

Devem conter:

- período;
- agrupamento;
- totais;
- pendências;
- riscos;
- ações recomendadas;
- possibilidade de exportação quando aplicável.

## 6. Linguagem

Deve ser:

- clara;
- operacional;
- sem excesso de jargão;
- em português do Brasil;
- adequada ao público solicitado.

## 7. Critérios de reprovação

Reprovar quando a resposta:

- ignora o pedido;
- inventa dados;
- executa ação sensível sem confirmação;
- não menciona limitação quando falta ferramenta/dado;
- não oferece próximo passo;
- responde genericamente sem domínio SICAT;
- diz que não pode ajudar com SICAT;
- omite risco em ação mutável.

## 8. Gate obrigatório de origem da resposta

A resposta final do Chat SICAT deve vir de agente/LLM real ou erro explicito de indisponibilidade.

Separacao obrigatoria de modelos:

- `OPENAI_AGENT_MODEL` para planejamento do agente e decisao de tool;
- `OPENAI_SYNTHESIS_MODEL` para sintese natural baseada em `toolResult`;
- `OPENAI_JUDGE_MODEL` somente para o juiz do smoke;
- `OPENAI_MODEL` apenas como fallback de compatibilidade.

Reprovar automaticamente quando o backend retornar qualquer um dos sinais abaixo:

- llm.provider em qualquer valor proibido: rule-based, provider-adapter, deterministic, keyword, static, fallback, mock, stub, unknown-llm;
- result.fallback igual a true, exceto cenário que declara explicitamente indisponibilidade de provider no catálogo;
- status igual a responded com reasonCode PROVIDER_UNAVAILABLE, ou evidência de provider unavailable;
- status responded sem provider real (provider vazio, ausente ou não confiável);
- texto final heuristico/estatico para mascarar indisponibilidade de provider;
- resposta final sintetizada por heuristica local quando `OPENAI_SYNTHESIS_MODEL` nao puder ser usado.

Reason codes de bloqueio esperados no quality gate:

- INVALID_LLM_PROVIDER;
- HEURISTIC_PROVIDER_NOT_ALLOWED;
- FALLBACK_NOT_ALLOWED;
- RESPONDED_PROVIDER_UNAVAILABLE.

Motivo padrao de falha:

- Resposta heuristica/rule-based nao permitida. O Chat SICAT deve responder pelo agente/LLM real.
