# Plataforma de Levantamento BESC Tokenização — Escopo Funcional

**Versão:** 1.0 (escopo) · **Status:** rascunho para validação · **Natureza:** levantamento / checklist — **não executa tokenização** · **Autenticação:** sem login

> **Aviso legal.** Este documento e o sistema descrito são **ferramentas de organização e levantamento documental**. Não constituem aconselhamento jurídico, parecer, oferta ou distribuição de valores mobiliários, nem recomendação de investimento. Toda conclusão jurídica, regulatória, contábil ou de valuation é de responsabilidade dos profissionais habilitados que utilizarem o material. Itens marcados como "requer validação jurídica/regulatória" dependem de análise externa por advogado/assessor.

## Sumário

1. Visão geral, objetivo e princípios
2. Modelo de dados (entidades e enums)
3. Telas (parte I): principal, detalhe e cadastros
4. Telas (parte II): checklists, caução e pendências
5. Checklist documental completo
6. Checklist jurídico e regulatório
7. Checklist técnico de tokenização e lógica de caução
8. Pendências, status e matriz de risco
9. Relatórios (tela + modelos + modelo final)
10. MVP, arquitetura e roadmap

---

## 1. Visão geral, objetivo e princípios

### 1.1 Propósito e objetivo

A **Plataforma de Levantamento BESC Tokenização** é um sistema web simples de **organização documental e levantamento** cujo objetivo único é reunir, num só lugar, os casos e processos ligados a ações do antigo **BESC** (Banco do Estado de Santa Catarina, incorporado pelo Banco do Brasil) — cadastrando cada caso, organizando seus documentos, levantando pendências, validando as informações essenciais (classe da ação, cadeia de titularidade, tipo de direito, status de liquidez), classificando riscos e gerando **checklists** e um **escopo estruturado** do que ainda falta para que terceiros qualificados possam depois avaliar (a) a viabilidade de uma futura **tokenização** dos direitos e (b) o uso desses direitos como **caução/garantia processual** — sempre capturando a fonte/evidência de cada afirmação e um grau de confiança por informação, nunca apresentando titularidade, valor ou desfecho como certos sem lastro documental.

### 1.2 Princípios de produto

| # | Princípio | O que significa na prática |
|---|-----------|----------------------------|
| P1 | **Simples e direto** | Uma única finalidade: cadastrar, organizar, levantar pendências e gerar escopo/checklists. Sem funcionalidades acessórias que fujam disso. |
| P2 | **Sem login (no auth)** | Nenhuma autenticação, cadastro de usuário ou controle de acesso. Ferramenta de trabalho de mesa, operada por quem digita os dados. |
| P3 | **Sem pagamento (no payment)** | Não processa, cobra nem calcula valores a pagar/receber. Não há gateway, carrinho ou cobrança. |
| P4 | **Sem blockchain (no blockchain)** | Nenhuma integração on-chain, carteira, contrato inteligente ou emissão de token. |
| P5 | **Não tokeniza de verdade (no real tokenization)** | O sistema **prepara e organiza** o levantamento para uma eventual tokenização futura; ele **não** cria, emite ou negocia nenhum ativo/token. |
| P6 | **Foco em levantamento e evidência** | Cada afirmação relevante carrega fonte, documento e data; campos têm **status de verificação** (ex.: `verified` (Verificado), `to_verify` (A verificar), `missing` (Faltante)). |
| P7 | **Saída acionável** | O produto do sistema são **checklists**, **pendências** e um **escopo do que falta** — insumos para os profissionais decidirem os próximos passos. |
| P8 | **Não conclui juridicamente** | Onde algo depende de avaliação jurídica/regulatória, o sistema **pergunta e registra** o item marcado como *requer validação jurídica* — nunca afirma conclusão de mérito. |

### 1.3 Público-alvo e personas

| Persona (technical id) | Rótulo pt-BR | Quem é | Necessidade principal |
|------------------------|--------------|--------|-----------------------|
| `lawyer` | Advogado(a) | Profissional que analisa a viabilidade jurídica dos direitos e do uso como garantia | Ver, por caso, o tipo de direito, a fase processual, os documentos anexados e as pendências que *requerem validação jurídica*; usar o checklist de caução/garantia como roteiro |
| `consultant` | Consultor(a) | Analista de negócio/financeiro que avalia o conjunto de casos | Visão consolidada de status, classificação de risco e liquidez; identificar quais casos estão maduros e quais têm lacunas |
| `tokenizer` | Tokenizador(a) | Especialista que estruturaria uma futura tokenização | Entender o lastro documental, a natureza econômica do direito e o escopo regulatório a levantar (é valor mobiliário? qual trilho?) antes de qualquer estruturação |
| `partner` | Parceiro(a) | Investidor/estruturador que avalia o projeto de forma agregada | Panorama de quantos casos existem, em que estágio estão e o tamanho das pendências — sem entrar no detalhe operacional |
| `internal_operator` | Operador(a) interno(a) | Pessoa que efetivamente digita e cadastra os casos e documentos | Formulários claros, campos guiados, forma simples de registrar fonte/pendência e marcar o que falta, sem depender de conhecimento jurídico profundo |

### 1.4 Escopo — incluído x fora de escopo

#### Incluído no escopo

- Cadastro de **casos/processos** ligados a ações do antigo BESC (dados do titular, classe da ação, cadeia de titularidade, tipo de direito, status de liquidez, processo de origem/destino).
- **Organização de documentos** por caso (anexos, tipo de documento, data, fonte/origem).
- **Levantamento de pendências** e campos com **status de verificação** por informação.
- **Validação de informações essenciais** (presença/ausência de dados-chave; sinalização do que falta) — validação de completude, não de mérito jurídico.
- **Classificação de risco e de liquidez** do direito (remanescente/líquido, ilíquido/condicional, litigioso).
- Geração de **checklists** (incl. checklist de caução/garantia e de pré-requisitos de tokenização).
- Geração de **escopo do que falta** para (a) estruturar futura tokenização e (b) avaliar uso como caução/garantia processual.
- Marcação sistemática de itens *requer validação jurídica* / *verificar*.

#### Fora de escopo (não faz)

- **Tokenizar de verdade** — não emite, cria, custodia nem negocia tokens ou ativos (fora de escopo).
- **Consulta automática a tribunais** — não integra com sistemas de tribunais nem faz *scraping* de andamentos processuais; andamento é campo digitado (fora de escopo).
- **Integração blockchain** — sem carteira, contrato inteligente, on-chain ou VASP (fora de escopo).
- **Login/autenticação** — sem contas de usuário, senha ou SSO (fora de escopo).
- **Pagamentos** — sem cobrança, gateway ou processamento financeiro (fora de escopo).
- **Aconselhamento jurídico/parecer** — não emite conclusão de mérito, valuation oficial nem oferta de valores mobiliários (fora de escopo).
- **Cálculo oficial de valores** (relação de troca, correção monetária, deságio) — pode haver campos para registrar valores informados/estimados, mas o sistema **não** os apura como número oficial (fora de escopo).

### 1.5 Premissas e restrições

| Tipo | Item |
|------|------|
| Premissa | Os dados são **inseridos manualmente** por um operador; a qualidade depende da fonte documental fornecida. |
| Premissa | O universo factual (histórico do BESC, relação de troca, classes de ação, prazos) contém itens marcados *verificar* que dependem de fonte primária (atas, Diário Oficial, autos) — o sistema **não** os assume como certos. |
| Premissa | O público que consome as saídas é qualificado (advogado/consultor/tokenizador) e fará a avaliação final. |
| Restrição | Sem login, o sistema **não** oferece confidencialidade por usuário nem trilha de auditoria por identidade — deve ser usado em ambiente controlado. |
| Restrição | Sem integrações externas (tribunais, blockchain, pagamento); toda informação externa é **campo digitado**. |
| Restrição | Toda classificação regulatória/jurídica é **registrada como pergunta/campo**, nunca decidida pelo sistema. |
| Restrição | Números de lei, artigos, percentuais, datas e valores são tratados como **conteúdo a verificar** e nunca gerados/afirmados pelo sistema. |

### 1.6 Aviso legal

> **AVISO LEGAL — leia com atenção.**
> Esta plataforma é uma **ferramenta organizacional e de levantamento documental**. Ela **não** presta aconselhamento jurídico, contábil, tributário ou financeiro, **não** emite parecer, **não** realiza avaliação (*valuation*) oficial e **não** constitui oferta, promessa ou distribuição de valores mobiliários, tokens ou qualquer investimento.
> As informações registradas dependem das fontes fornecidas pelo operador e podem estar **incompletas ou não verificadas**. Classificações de risco, liquidez, titularidade e enquadramento são **indicativas** e servem apenas para organizar o trabalho.
> **Toda conclusão jurídica ou regulatória é de responsabilidade exclusiva dos profissionais habilitados** que utilizarem estas informações. Itens marcados como *requer validação jurídica* ou *verificar* **devem** ser confirmados com advogado/assessor competente antes de qualquer decisão ou uso concreto (inclusive oferta de garantia ou estruturação de tokenização).

### 1.7 Glossário

| Termo | Explicação curta |
|-------|------------------|
| **Ações ON (ordinárias)** | Ações com direito a voto na companhia. Classe relevante porque relação de troca e direitos podem diferir por classe. |
| **Ações PNA (preferenciais classe A)** | Ações preferenciais de uma classe específica, tipicamente com preferências próprias (ex.: prioridade em dividendos); características exatas *verificar* no estatuto da época. |
| **Ações PNB (preferenciais classe B)** | Outra classe de ações preferenciais, com preferências distintas da PNA; condições exatas *verificar*. |
| **Escriturador** | Instituição que mantinha o registro escritural das ações (livro/agente); fonte primária de titularidade e posição. |
| **Espólio** | Conjunto de bens e direitos de pessoa falecida, ainda não partilhado; direitos do titular falecido integram o espólio e transferem-se por inventário/partilha. |
| **Cessionário** | Terceiro que adquiriu o direito por cessão; a titularidade atual pode divergir do titular original. |
| **Direito acionário** | Posição societária remanescente (ações resultantes da conversão, dividendos/proventos não recebidos, frações). |
| **Direito creditório** | Pretensão de receber diferença em dinheiro (ex.: complemento de conversão, indenização); crédito ainda não reconhecido de forma definitiva. |
| **Direito litigioso** | Crédito/pretensão em discussão judicial; existência e valor dependem do desfecho do processo. |
| **Lastro** | Base real (documento/direito subjacente) que sustenta uma afirmação de titularidade ou, futuramente, um eventual token. |
| **Custodiante documental** | Papel de guarda organizada dos documentos de suporte (evidências) de cada caso, off-chain; distinto do custodiante financeiro de um FIDC. |
| **Caução / garantia processual** | Bem ou direito vinculado para garantir um juízo (ex.: para recorrer/embargar); direitos ilíquidos tendem a ser recusados — *requer validação jurídica*. |
| **Tokenização** | Representação de um direito/ativo em token digital para eventual circulação; aqui apenas **objeto de futuro levantamento**, não executada pelo sistema. |
| **Valor mobiliário** | Instrumento de investimento sujeito à regulação da CVM; se o direito/token for enquadrado como tal, incidem regras de oferta/registro — *requer validação jurídica*. |
| **KYC (know your customer)** | Processo de identificação/onboarding de clientes; relevante numa eventual tokenização futura (trata dados pessoais sob LGPD), fora do escopo deste sistema. |
| **Whitelist (lista de endereços autorizados)** | Lista de carteiras/pessoas autorizadas a participar de uma emissão tokenizada; conceito de tokenização futura, não implementado aqui. |
| **FIDC (fundo de investimento em direitos creditórios)** | Veículo típico para estruturar direitos creditórios (recebíveis); referência para a hipótese de estruturar o lastro creditório numa tokenização futura — *requer validação jurídica*. |

---

## 2. Modelo de dados (entidades e enums)

> **Convenção de nomenclatura (contrato).** Os nomes de entidade e os **enums de §2.11** são a fonte canônica para implementação; a **máquina de status** é normativa em **§8.2**. Seções específicas podem usar mnemônicos locais para ilustrar telas/relatórios — em caso de divergência, valem §2.11 e §8.2.

### 2.1 Visão geral e relacionamentos

O modelo gira em torno da entidade **Case** (Caso), que agrega todo o levantamento de um conjunto de direitos ligados a ações do antigo BESC. Cada `Case` pode ter zero ou mais `JudicialProcess` (Processo judicial), uma coleção de `Document` (itens do checklist documental), respostas de `LegalChecklistItem` e `TokenizationChecklistItem`, uma ou mais `CollateralAssessment` (avaliações de uso como caução), `Pendency` (pendências geradas automaticamente), `StatusHistory` (histórico de status) e `Report` (relatórios gerados).

| Relacionamento | Cardinalidade | Observação |
|---|---|---|
| Case → JudicialProcess | 1 : 0..N | Um caso pode não ter processo, ou ter vários (por tese/instância/comarca). |
| Case → Document | 1 : 0..N | Itens do checklist documental; alguns esperados, outros anexados. |
| Case → LegalChecklistItem | 1 : 0..N | Uma resposta por pergunta do checklist jurídico. |
| Case → TokenizationChecklistItem | 1 : 0..N | Uma resposta por pergunta do checklist de tokenização. |
| Case → CollateralAssessment | 1 : 0..N | Uma avaliação por hipótese de uso como caução/garantia. |
| Case → Pendency | 1 : 0..N | Geradas por regras a partir de campos faltantes/inconsistentes. |
| Case → StatusHistory | 1 : 0..N | Trilha imutável de transições de `case_status`. |
| Case → Report | 1 : 0..N | Snapshots gerados (escopo, checklists, pendências). |
| CollateralAssessment → JudicialProcess | 0..N : 0..1 | Processo de destino onde a garantia seria usada (opcional). |
| Document → LegalChecklistItem / TokenizationChecklistItem | 0..N : 0..N | Evidência que sustenta uma resposta (referência opcional). |

> Princípio transversal (do domínio): toda afirmação relevante (titularidade, classe, valor, tese) deve poder apontar **fonte/evidência** (documento, data) e carregar um **grau de confiança**. Por isso vários campos referenciam `Document` e usam o enum `checklist_answer` / `document_status` em vez de valores livres.

---

### 2.2 Case (Caso)

Entidade-raiz do levantamento. Agrega titular, posição societária alegada, tipo de direito e status geral.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único do caso. |
| case_code | string (curto, legível) | sim | Código humano do caso (ex.: sequencial/ano); único. |
| title | string | sim | Rótulo curto do caso (rótulo pt-BR "Título do caso"). |
| holder_name | string | sim | Nome do titular atual alegado (pessoa/empresa/espólio). |
| holder_type | enum `holder_type` | sim | Tipo de titular (ver enums). |
| holder_document_id | string | não | Documento do titular (CPF/CNPJ); mascarar/minimizar (LGPD). "verificar" formato. |
| original_holder_name | string | não | Titular original das ações, se diferente do atual (cessão/sucessão). |
| chain_of_title_notes | text | não | Notas sobre a cadeia de titularidade (falecimentos, inventário, cessões). |
| share_class | enum `share_class` | não | Classe de ação alegada (ON/PNA/PNB/desconhecida). |
| shares_quantity_claimed | decimal | não | Quantidade de ações alegada (antes/depois da conversão); "verificar". |
| right_types | array de enum `right_type` | não | Tipos de direito alegados (podem coexistir: acionário/creditório/litigioso). |
| liquidity_status | enum `liquidity_status` | não | Situação de liquidez do direito (remanescente/ilíquido/litigioso). |
| dispute_thesis | array de enum `dispute_thesis` | não | Tese(s) que sustentam o direito alegado (relação de troca, expurgos, etc.). |
| escriturador_name | string | não | Escriturador/custodiante que mantinha o registro escritural. |
| estimated_value_note | text | não | Nota sobre valor estimado e premissas; nunca apresentar como certo. "verificar". |
| legal_risk | enum `legal_risk` | não | Classificação de risco jurídico consolidada (derivada + ajuste manual). |
| case_status | enum `case_status` | sim | Status geral do caso no fluxo de levantamento. |
| confidence_level | enum `confidence_level` | não | Grau de confiança geral do levantamento (lastro documental). |
| assigned_to | string | não | Responsável pelo levantamento (nome/e-mail); sem login, é apenas rótulo. |
| tags | array de string | não | Marcadores livres (ex.: "prioridade", "espólio complexo"). |
| requires_legal_review | boolean | sim | Sinaliza itens que dependem de validação jurídica (default: true). |
| created_at | datetime | sim | Data/hora de criação. |
| updated_at | datetime | sim | Data/hora da última alteração. |

---

### 2.3 JudicialProcess (Processo judicial)

Processo associado a um caso. Pode ser o processo **de origem** do direito (onde a tese é discutida) ou apenas referência de destino para caução (ver `CollateralAssessment`).

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| process_number | string | não | Número do processo (formato CNJ); não inventar — "verificar" quando ausente. |
| court_or_instance | string | não | Órgão/vara/instância (rótulo livre). |
| jurisdiction | string | não | Comarca/UF/esfera (ex.: estadual/federal/trabalhista). |
| process_role | enum `process_role` | sim | Papel do processo no caso (origem do direito / destino de garantia). |
| procedural_phase | enum `procedural_phase` | não | Fase processual do crédito (inicial/sentença/trânsito em julgado). |
| has_res_judicata | boolean | não | Há trânsito em julgado? (impacta certeza/exigibilidade). |
| third_party_debtor | string | não | Terceiro devedor identificado (para penhora de crédito), se houver. |
| claimed_amount_note | text | não | Nota sobre valor discutido/determinável; não afirmar valor certo. "verificar". |
| notes | text | não | Observações livres. |
| source_document_id | UUID (FK → Document) | não | Documento que evidencia o processo. |
| created_at | datetime | sim | Data/hora de criação. |
| updated_at | datetime | sim | Data/hora da última alteração. |

---

### 2.4 Document (Item do checklist documental)

Representa um documento **esperado** e/ou **anexado**. Serve tanto de checklist (o que falta) quanto de repositório de evidência.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| doc_type | enum `document_type` | sim | Tipo de documento esperado (ver enums). |
| label | string | sim | Rótulo do item (rótulo pt-BR "Documento"). |
| document_status | enum `document_status` | sim | Situação do item no fluxo documental. |
| is_required | boolean | sim | Se o documento é essencial para o caso (alimenta pendências). |
| file_ref | string | não | Referência/ponteiro ao arquivo (path/hash off-chain); não gravar PII on-chain. |
| issue_date | date | não | Data do documento, quando aplicável; "verificar" se ilegível. |
| reference_date | date | não | Data-base relevante (ex.: posição acionária). |
| validated_by | string | não | Quem validou o documento (rótulo; sem login). |
| validation_note | text | não | Observação de validação/motivo de rejeição ou de "necessita complementação". |
| confidence_level | enum `confidence_level` | não | Confiança na evidência que este documento fornece. |
| created_at | datetime | sim | Data/hora de criação. |
| updated_at | datetime | sim | Data/hora da última alteração. |

---

### 2.5 LegalChecklistItem (Checklist jurídico)

Uma pergunta do levantamento jurídico e sua resposta. As perguntas cobrem natureza do direito, qualidade do crédito (certeza/liquidez/exigibilidade), titularidade e mitigadores. **Nenhuma resposta afirma mérito** — registra o que foi levantado.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| item_key | string | sim | Chave estável da pergunta (ex.: "credit_certainty"); mapeia ao catálogo. |
| category | enum `legal_checklist_category` | sim | Bloco do checklist (natureza/qualidade/titularidade/mitigadores). |
| question | string | sim | Texto da pergunta (rótulo pt-BR). |
| answer | enum `checklist_answer` | sim | Resposta (sim/não/parcial/não avaliado/não se aplica). |
| answer_note | text | não | Justificativa/observação da resposta. |
| evidence_document_id | UUID (FK → Document) | não | Documento que sustenta a resposta. |
| requires_legal_review | boolean | sim | Marca o item como dependente de validação jurídica (default: true). |
| item_risk | enum `legal_risk` | não | Contribuição de risco deste item ao risco consolidado do caso. |
| created_at | datetime | sim | Data/hora de criação. |
| updated_at | datetime | sim | Data/hora da última alteração. |

---

### 2.6 TokenizationChecklistItem (Checklist de tokenização)

Pergunta do levantamento de **pré-requisitos para uma futura tokenização** (o sistema não tokeniza). Cobre enquadramento regulatório (valor mobiliário? CVM vs BCB), trilho de oferta, lastro, LGPD, PLD/FT e riscos do direito litigioso.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| item_key | string | sim | Chave estável da pergunta (ex.: "is_security_cvm"); mapeia ao catálogo. |
| category | enum `tokenization_checklist_category` | sim | Bloco (enquadramento/trilho de oferta/lastro/LGPD/PLD-FT/risco). |
| question | string | sim | Texto da pergunta (rótulo pt-BR). |
| answer | enum `checklist_answer` | sim | Resposta (sim/não/parcial/não avaliado/não se aplica). |
| answer_note | text | não | Observação; incluir marcações "verificar com assessor CVM/jurídico". |
| regulatory_ref_note | text | não | Referência normativa genérica citada (sem afirmar número/artigo exato). |
| evidence_document_id | UUID (FK → Document) | não | Documento que sustenta a resposta. |
| requires_legal_review | boolean | sim | Depende de validação jurídica/regulatória (default: true). |
| blocking | boolean | não | Se um "não/parcial" bloqueia o avanço para estruturar tokenização. |
| created_at | datetime | sim | Data/hora de criação. |
| updated_at | datetime | sim | Data/hora da última alteração. |

---

### 2.7 CollateralAssessment (Uso como caução)

Avaliação de uma **hipótese** de uso dos direitos como caução/garantia em processo de terceiro. Uma por combinação de processo de destino + modalidade. Sempre com sinalização "requer validação jurídica".

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| target_process_type | enum `collateral_process_type` | sim | Tipo de processo de destino (execução cível/fiscal/trabalhista/etc.). |
| target_process_id | UUID (FK → JudicialProcess) | não | Processo de destino específico, se cadastrado. |
| guarantee_modality | enum `guarantee_modality` | não | Modalidade oferecida (caução real/depósito/seguro-garantia/etc.). |
| requires_full_court_guarantee | boolean | não | Se o juízo exige garantia integral do juízo. |
| target_value_note | text | não | Nota sobre valor-alvo da garantia; "verificar". |
| credit_certainty | enum `checklist_answer` | não | Há certeza (título/decisão)? |
| credit_liquidity | enum `checklist_answer` | não | Valor determinado/determinável? |
| credit_enforceability | enum `checklist_answer` | não | Há condição/termo/recurso pendente? (exigibilidade). |
| acceptance_likelihood | enum `collateral_acceptance` | não | Probabilidade estimada de aceitação (baixa/média/alta/indeterminada). |
| proposed_haircut_pct | decimal | não | Deságio proposto (%); a verificar com jurídico. |
| complementary_reinforcement_note | text | não | Reforço complementar (dinheiro/seguro) para cobrir deságio. |
| risk_bearer_note | text | não | Quem assume o risco se a garantia for recusada. |
| mitigators_note | text | não | Mitigadores anexados (laudo, sentença, parecer, cessão formalizada). |
| requires_legal_review | boolean | sim | Sempre dependente de validação jurídica (default: true). |
| created_at | datetime | sim | Data/hora de criação. |
| updated_at | datetime | sim | Data/hora da última alteração. |

---

### 2.8 Pendency (Pendência automática)

Item gerado por **regras** a partir de campos faltantes/inconsistentes (ex.: documento essencial `pending`, titularidade sem evidência, resposta de checklist `nao_avaliado`). Alimenta o escopo do que falta.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| pendency_type | enum `pendency_type` | sim | Categoria da pendência (documental/titularidade/legal/tokenização/caução). |
| severity | enum `pendency_severity` | sim | Severidade (informativa/importante/bloqueante). |
| message | string | sim | Descrição legível da pendência (rótulo pt-BR). |
| rule_key | string | não | Chave da regra que gerou a pendência (rastreabilidade). |
| related_entity_type | enum `related_entity_type` | não | Entidade relacionada (documento/checklist/processo/caução). |
| related_entity_id | UUID | não | Id do registro relacionado. |
| status | enum `pendency_status` | sim | Situação (aberta/resolvida/ignorada). |
| resolution_note | text | não | Como foi resolvida ou por que foi ignorada. |
| auto_generated | boolean | sim | Se foi gerada por regra (true) ou manual (false). |
| created_at | datetime | sim | Data/hora de criação. |
| resolved_at | datetime | não | Data/hora de resolução, quando aplicável. |

---

### 2.9 StatusHistory (Histórico de status)

Trilha **imutável** de transições de `case_status` (auditoria). Um registro por transição.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| from_status | enum `case_status` | não | Status anterior (nulo na criação). |
| to_status | enum `case_status` | sim | Novo status. |
| changed_by | string | não | Quem alterou (rótulo; sem login). |
| change_note | text | não | Motivo/observação da transição. |
| changed_at | datetime | sim | Data/hora da transição. |

---

### 2.10 Report (Relatório gerado)

**Snapshot** de saída do sistema (escopo do que falta, checklists consolidados, pendências, resumo de risco). Congela o estado no momento da geração.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| id | UUID | sim | Identificador único. |
| case_id | UUID (FK → Case) | sim | Caso ao qual pertence. |
| report_type | enum `report_type` | sim | Tipo (escopo/checklist jurídico/checklist tokenização/caução/consolidado). |
| generated_at | datetime | sim | Data/hora de geração. |
| generated_by | string | não | Quem gerou (rótulo; sem login). |
| format | enum `report_format` | não | Formato de saída (pdf/html/markdown). |
| file_ref | string | não | Referência ao artefato gerado (path/hash). |
| snapshot_json | json | não | Payload congelado do estado (campos/respostas/pendências no momento). |
| summary_note | text | não | Resumo textual do relatório (inclui avisos "requer validação jurídica"). |
| created_at | datetime | sim | Data/hora de criação do registro. |

---

### 2.11 Enumerações (enums)

Todos os enums usam **chave em inglês** + **rótulo pt-BR**. Chaves são estáveis (contrato); rótulos são de tela.

#### case_status (Status do caso)

> **Fonte canônica do fluxo:** a máquina de estados completa (critérios de entrada e transições) está em **§8.2**. Estes são os 9 valores oficiais do enum.

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| new | Novo |
| docs_incomplete | Documentação incompleta |
| legal_review | Em análise jurídica |
| awaiting_calculation | Aguardando cálculo |
| awaiting_opinion | Aguardando parecer |
| ready_for_structuring | Apto para estruturação |
| ready_with_caveats | Apto com ressalvas |
| not_eligible | Não apto |
| archived | Arquivado |

#### holder_type (Tipo de titular)

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| pessoa_fisica | Pessoa física |
| empresa | Empresa |
| espolio | Espólio |
| herdeiro | Herdeiro |
| cessionario | Cessionário |

#### share_class (Classe de ação)

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| ON | Ordinária (ON) |
| PNA | Preferencial classe A (PNA) |
| PNB | Preferencial classe B (PNB) |
| unknown | Desconhecida |

#### document_status (Status do documento)

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| pending | Pendente |
| received | Recebido |
| in_review | Em análise |
| validated | Validado |
| rejected | Rejeitado |
| needs_completion | Necessita complementação |

#### legal_risk (Risco jurídico)

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| low | Baixo |
| medium | Médio |
| high | Alto |
| undetermined | Indeterminado — requer validação jurídica |

#### checklist_answer (Resposta de checklist)

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| sim | Sim |
| nao | Não |
| parcial | Parcial |
| nao_avaliado | Não avaliado |
| nao_se_aplica | Não se aplica |

#### collateral_process_type (Tipo de processo de destino da caução)

| Chave (en) | Rótulo (pt-BR) |
|---|---|
| execucao_civel | Execução cível |
| execucao_fiscal | Execução fiscal (LEF) |
| trabalhista | Reclamação trabalhista |
| cautelar_recursal | Caução cautelar/recursal |
| acordo_homologado | Acordo homologado |
| outro | Outro (verificar) |

---

#### Enums de apoio (derivados do domínio)

> Complementam as entidades acima; mesma convenção chave-en + rótulo pt-BR.

**right_type (Tipo de direito)** — `acionario_remanescente` (Direito acionário remanescente) · `creditorio_indenizatorio` (Direito creditório/indenizatório) · `litigioso` (Direito litigioso).

**liquidity_status (Situação de liquidez)** — `remanescente_liquido` (Remanescente/líquido) · `iliquido_condicional` (Ilíquido/condicional) · `litigioso` (Litigioso) · `indeterminado` (Indeterminado — verificar).

**dispute_thesis (Tese da disputa)** — `relacao_de_troca` (Relação de troca/conversão) · `criterio_de_valor` (Critério de valor da ação) · `subscricao_diluicao` (Subscrição/diluição) · `expurgos_inflacionarios` (Expurgos inflacionários) · `outra` (Outra — verificar).

**confidence_level (Grau de confiança)** — `alto` (Alto) · `medio` (Médio) · `baixo` (Baixo) · `sem_lastro` (Sem lastro documental).

**process_role (Papel do processo)** — `origem_do_direito` (Origem do direito) · `destino_garantia` (Destino de garantia) · `relacionado` (Relacionado).

**procedural_phase (Fase processual)** — `inicial` (Fase inicial) · `sentenca` (Com sentença) · `transito_em_julgado` (Trânsito em julgado) · `desconhecida` (Desconhecida — verificar).

**document_type (Tipo de documento)** — `share_registry_extract` (Extrato do registro escritural) · `broker_statement` (Extrato de custódia/corretora) · `identity_doc` (Documento de identidade do titular) · `succession_doc` (Documento sucessório/inventário) · `assignment_instrument` (Instrumento de cessão) · `court_decision` (Decisão/sentença judicial) · `expert_report` (Laudo de avaliação) · `legal_opinion` (Parecer jurídico) · `other` (Outro).

**legal_checklist_category (Bloco do checklist jurídico)** — `right_nature` (Natureza do direito) · `credit_quality` (Qualidade do crédito) · `title_chain` (Titularidade) · `mitigators` (Mitigadores) · `risk_responsibility` (Risco/responsabilidade).

**tokenization_checklist_category (Bloco do checklist de tokenização)** — `securities_framing` (Enquadramento como valor mobiliário) · `offer_track` (Trilho de oferta) · `backing_structure` (Lastro/estrutura) · `lgpd` (LGPD/dados pessoais) · `pld_ft` (PLD-FT/COAF) · `litigious_risk` (Risco de direito litigioso).

**guarantee_modality (Modalidade de garantia)** — `caucao_real` (Caução real) · `caucao_fidejussoria` (Caução fidejussória) · `deposito` (Depósito) · `seguro_garantia` (Seguro-garantia) · `fianca_bancaria` (Fiança bancária) · `outra` (Outra — verificar).

**collateral_acceptance (Probabilidade de aceitação)** — `baixa` (Baixa) · `media` (Média) · `alta` (Alta) · `indeterminada` (Indeterminada).

**pendency_type (Tipo de pendência)** — `documental` (Documental) · `titularidade` (Titularidade) · `legal` (Jurídica) · `tokenizacao` (Tokenização) · `caucao` (Caução).

**pendency_severity (Severidade da pendência)** — `informativa` (Informativa) · `importante` (Importante) · `bloqueante` (Bloqueante).

**pendency_status (Status da pendência)** — `open` (Aberta) · `resolved` (Resolvida) · `ignored` (Ignorada).

**related_entity_type (Entidade relacionada)** — `document` (Documento) · `legal_checklist_item` (Checklist jurídico) · `tokenization_checklist_item` (Checklist tokenização) · `judicial_process` (Processo judicial) · `collateral_assessment` (Caução).

**report_type (Tipo de relatório)** — `scope` (Escopo do que falta) · `legal_checklist` (Checklist jurídico) · `tokenization_checklist` (Checklist de tokenização) · `collateral` (Caução) · `consolidated` (Consolidado).

**report_format (Formato do relatório)** — `pdf` (PDF) · `html` (HTML) · `markdown` (Markdown).

---

## 3. Telas (parte I): principal, detalhe e cadastros

### 1. Mapa de navegação

#### 1.1 Árvore de telas

O sistema é single-user, sem login. A navegação parte do Dashboard e desce ao caso individual; cadastros e checklists penduram do caso.

```
/ (Dashboard — lista de casos)
├── [busca + filtros + contadores por status]
├── [novo caso] ──────────────► /cases/new                 (Cadastro do caso)
├── [abrir detalhes] ─────────► /cases/:caseId             (Detalhe do caso — visão 360)
│      ├── aba "Dados do caso" ─────► /cases/:caseId/edit  (Cadastro do caso, modo edição)
│      ├── aba "Processos"
│      │     ├── [novo processo] ───► /cases/:caseId/lawsuits/new   (Cadastro do processo)
│      │     └── [abrir processo] ──► /cases/:caseId/lawsuits/:lawsuitId (edição)
│      ├── aba "Checklist documental"   (parte II)
│      ├── aba "Checklist jurídico"     (parte II) — requer validação jurídica
│      ├── aba "Checklist de tokenização" (parte II) — requer validação regulatória
│      ├── aba "Caução / garantia"      (parte II) — requer validação jurídica
│      ├── aba "Pendências"             (parte II)
│      └── aba "Relatórios"
│            └── [gerar relatório] ──► /cases/:caseId/report (Relatório do caso)
└── [gerar relatório] (na linha do caso) ► /cases/:caseId/report
```

#### 1.2 Telas do sistema (inventário)

| # | Tela (rótulo pt-BR) | Rota | Entidade principal | Parte |
|---|---|---|---|---|
| 1 | Painel principal (Dashboard) | `/` | `case` (lista) | I (esta seção) |
| 2 | Detalhe do caso (visão 360) | `/cases/:caseId` | `case` | I |
| 3 | Cadastro do caso (Novo / Editar) | `/cases/new`, `/cases/:caseId/edit` | `case` | I |
| 4 | Cadastro do processo judicial | `/cases/:caseId/lawsuits/new`, `.../:lawsuitId` | `lawsuit` | I |
| 5 | Checklist documental | aba em `/cases/:caseId` | `document_item` | II |
| 6 | Checklist jurídico | aba em `/cases/:caseId` | `legal_check` | II |
| 7 | Checklist de tokenização | aba em `/cases/:caseId` | `tokenization_check` | II |
| 8 | Caução / garantia | aba em `/cases/:caseId` | `collateral_assessment` | II |
| 9 | Pendências | aba em `/cases/:caseId` | `pending_item` | II |
| 10 | Relatório do caso | `/cases/:caseId/report` | `report` | II |

> Telas 5–10 são detalhadas na parte II. Nesta seção detalhamos 1–4.

#### 1.3 Enums transversais (usados em várias telas)

Definidos aqui uma vez e referenciados adiante.

| Enum (chave técnica) | Valores (chave → rótulo pt-BR) |
|---|---|
| `case_status` (Status do caso) | Enum canônico em **§2.11**, fluxo em **§8.2**: `new` (Novo) · `docs_incomplete` (Documentação incompleta) · `legal_review` (Em análise jurídica) · `awaiting_calculation` (Aguardando cálculo) · `awaiting_opinion` (Aguardando parecer) · `ready_for_structuring` (Apto para estruturação) · `ready_with_caveats` (Apto com ressalvas) · `not_eligible` (Não apto) · `archived` (Arquivado) |
| `legal_risk` (Risco jurídico) | `low` (Baixo) · `medium` (Médio) · `high` (Alto) · `undetermined` (Indeterminado) — requer validação jurídica |
| `confidence_level` (Grau de confiança) | `alto` (Alto) · `medio` (Médio) · `baixo` (Baixo) · `sem_lastro` (Sem lastro documental) — ver §2.11 |

### 2. Tela 1 — Painel principal (Dashboard)

#### 2.1 Propósito

Ponto de entrada e visão de carteira. Lista todos os casos de ex-acionistas/titulares de direitos do antigo BESC com indicadores rápidos (documentação, pendências, valor estimado, risco jurídico), permite filtrar/buscar e abrir cada caso ou disparar seu relatório. Nenhuma conclusão de valor ou de titularidade é apresentada como certa — os indicadores refletem o grau de levantamento, não uma afirmação definitiva.

#### 2.2 Layout textual

- **Cabeçalho**: título "Levantamento BESC — Painel de casos" + botão primário **"Novo caso"** (leva a `/cases/new`).
- **Faixa de contadores por status** (cards clicáveis que atuam como filtro rápido): um contador por valor de `case_status` (ex.: "Em triagem 4", "Documentação incompleta 7", "Em análise 3"…), mais um card "Todos".
- **Barra de busca e filtros**:
  - Campo de busca textual (titular, CPF/CNPJ, nº de processo, título do caso).
  - Filtros: status, risco jurídico, classe de ação, faixa de % de documentação, faixa de valor estimado, "tem processo?" (sim/não).
- **Tabela de casos** (uma linha por caso), colunas:

| Coluna (rótulo pt-BR) | Conteúdo | Observação |
|---|---|---|
| Titular | nome do titular + tipo (PF/PJ/espólio/cessionário) | |
| Status | badge com `case_status` | cor por status |
| Documentação | barra de progresso "% documentação concluída" | derivado do checklist documental (parte II) |
| Pendências | contador de `pending_item` em aberto | badge vermelho se > 0 |
| Valor estimado | valor em R$ + rótulo do grau de confiança | sempre acompanhado de "estimativa — verificar"; nunca apresentado como valor certo |
| Risco jurídico | badge com `legal_risk` | "Indeterminado" quando não avaliado — requer validação jurídica |
| Ações | botão **"Abrir detalhes"** + botão **"Gerar relatório"** | |

- **Rodapé da tabela**: paginação + total de casos + aviso fixo: "Valores e titularidades são estimativas de levantamento e requerem validação documental/jurídica."
- **Estado vazio**: quando não há casos, cartão central com texto explicativo + botão "Novo caso".

#### 2.3 Tabela de campos (filtros e busca)

| Campo (rótulo pt-BR) | Tipo de controle | Obrigatório | Validação / enum |
|---|---|---|---|
| Busca (`search`) | campo de texto livre | Não | casa por titular, CPF/CNPJ, título do caso, nº CNJ de processo |
| Filtro status (`filter_status`) | multi-seleção | Não | valores de `case_status` |
| Filtro risco jurídico (`filter_legal_risk`) | multi-seleção | Não | valores de `legal_risk` |
| Filtro classe da ação (`filter_share_class`) | multi-seleção | Não | `ON` · `PNA` · `PNB` · `unknown` (Desconhecida) |
| Faixa de documentação (`filter_doc_pct`) | slider de faixa (0–100) | Não | inteiro 0–100; min ≤ max |
| Faixa de valor estimado (`filter_value_range`) | dois campos numéricos (min/max) | Não | valor ≥ 0; min ≤ max; moeda R$ |
| Tem processo? (`filter_has_lawsuit`) | seleção única | Não | `any` (Qualquer) · `yes` (Sim) · `no` (Não) |
| Ordenação (`sort_by`) | seleção única | Não | `titular` · `status` · `doc_pct` · `pending_count` · `estimated_value` · `legal_risk` · `updated_at` |

> Os cards de contador por status são atalhos de filtro: clicar aplica `filter_status` = aquele valor.

### 3. Tela 2 — Detalhe do caso (visão 360)

#### 3.1 Propósito

Concentra tudo sobre um caso num único lugar: dados cadastrais, processos vinculados, os quatro checklists (documental, jurídico, tokenização, caução), pendências e relatórios. É a tela de trabalho principal do analista. Mostra o quanto o caso está levantado (barra de progresso global) e o status atual, sempre deixando claro o que ainda é hipótese "a verificar".

#### 3.2 Layout textual

- **Cabeçalho do caso**: título do caso + nome do titular + badge de `case_status` (editável via ação "Mudar status") + badge de `legal_risk`.
- **Barra de progresso global**: % consolidado de levantamento (média ponderada dos checklists; a fórmula é detalhada na parte II). Ao lado: "X pendências em aberto", "Valor estimado: R$ … (estimativa — verificar)".
- **Barra de ações**: **"Editar dados"** (→ `/cases/:caseId/edit`), **"Novo processo"**, **"Gerar relatório"** (→ report), "Mudar status", "Arquivar caso".
- **Abas / seções** (navegação interna):

| Aba (rótulo pt-BR) | Chave técnica | Conteúdo resumido |
|---|---|---|
| Dados do caso | `case_data` | espelho somente-leitura dos campos do cadastro + botão editar |
| Processos | `lawsuits` | tabela de processos (0..N) + botão "Novo processo"; por linha: nº CNJ, tribunal, fase, risco, valor estimado |
| Checklist documental | `document_checklist` | itens de documento com status/anexo/confiança (parte II) |
| Checklist jurídico | `legal_checklist` | perguntas de qualidade do direito — requer validação jurídica (parte II) |
| Checklist de tokenização | `tokenization_checklist` | perguntas de enquadramento regulatório — requer validação regulatória (parte II) |
| Caução / garantia | `collateral` | avaliação de uso como garantia processual — requer validação jurídica (parte II) |
| Pendências | `pending_items` | lista consolidada do que falta, com responsável/prazo (parte II) |
| Relatórios | `reports` | histórico de relatórios gerados + botão "Gerar relatório" |

- **Painel lateral (resumo do caso)**: titular, tipo, classe(s) de ação, quantidade de ações, origem, banco/escriturador, grau de confiança geral, data de criação/atualização.
- **Aviso fixo no rodapé**: "Este sistema organiza o levantamento documental. Não constitui parecer jurídico. Itens marcados 'requer validação jurídica/regulatória' dependem de avaliação profissional."

#### 3.3 Tabela de campos (ações e cabeçalho — a maioria dos campos é somente-leitura, refletindo o cadastro)

| Campo (rótulo pt-BR) | Tipo de controle | Obrigatório | Validação / enum |
|---|---|---|---|
| Mudar status (`status_change`) | seleção única (ação) | Não | valores de `case_status`; registra data/hora da mudança |
| Barra de progresso global (`overall_progress`) | indicador (somente leitura) | — | 0–100, derivado dos checklists |
| Valor estimado consolidado (`estimated_value_display`) | indicador (somente leitura) | — | R$; sempre com rótulo "estimativa — verificar" e grau de confiança |
| Arquivar caso (`archive_case`) | ação (botão + confirmação) | Não | seta `case_status` = `archived`; reversível |

> Nesta tela não há novos campos de dados — os dados são criados/editados no Cadastro do caso (Tela 3) e no Cadastro do processo (Tela 4). As sub-abas de checklist têm seus próprios campos, descritos na parte II.

### 4. Tela 3 — Cadastro do caso (Novo / Editar)

#### 4.1 Propósito

Criar ou editar o registro central do caso: quem é o titular, qual a posição acionária alegada no antigo BESC, sua origem e observações. Todos os dados de posição (quantidade, classe, certificados) são declarados como **alegados/a verificar** até confrontar com registro escritural — o formulário reforça isso com o campo de grau de confiança e não trata nenhum valor como definitivo.

#### 4.2 Layout textual

- **Formulário em seções** (fieldset/legend): "Identificação do titular", "Contato", "Posição acionária no BESC", "Origem e aquisição", "Observações".
- Campos com máscara sinalizados (CPF/CNPJ, datas).
- Rodapé com **"Salvar"** e **"Cancelar"**; em modo edição, também "Salvar e voltar ao caso".
- Nota no topo da seção de posição: "Dados de posição são declarados pelo titular/levantamento e precisam ser confirmados no registro escritural (verificar)."

#### 4.3 Tabela de campos

| Campo (rótulo pt-BR) | Chave técnica | Tipo de controle | Obrigatório | Validação / enum |
|---|---|---|---|---|
| Nome / razão social do titular | `holder_name` | texto | **Sim** | 2–200 caracteres |
| Tipo de titular | `holder_type` | seleção única | **Sim** | `individual` (Pessoa física) · `company` (Pessoa jurídica) · `estate` (Espólio) · `assignee` (Cessionário) · `heir` (Herdeiro) |
| CPF / CNPJ | `holder_tax_id` | texto com máscara | Não* | **máscara/validação CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)**; dígito verificador; *obrigatório quando `holder_type` ∈ {individual, company}; para espólio/cessão, marcar "a verificar" |
| Telefone / e-mail de contato | `holder_contact` | texto (telefone com máscara + e-mail) | Não | telefone `(00) 00000-0000`; e-mail formato válido |
| Resumo do caso | `case_summary` | texto longo (textarea) | **Sim** | 0–2000 caracteres; descrição livre do que se alega |
| Origem das ações / direitos | `shares_origin` | seleção única + texto complementar | **Sim** | `original_subscription` (Subscrição original) · `inheritance` (Herança/sucessão) · `assignment` (Cessão de direitos) · `purchase` (Compra) · `unknown` (Desconhecida) — requer validação documental |
| Data aproximada de aquisição | `acquisition_date_approx` | data (mês/ano) ou "aproximada" | Não | **máscara de data**; permite só ano ou "aproximada"; não permite data futura; marcar confiança |
| Quantidade de ações | `shares_quantity` | numérico inteiro | Não | inteiro ≥ 0; "desconhecida" permitido (checkbox); valor alegado — verificar |
| Classe das ações | `share_class` | seleção única (ou múltipla se houver mais de uma classe) | **Sim** | `ON` (Ordinária) · `PNA` (Preferencial classe A) · `PNB` (Preferencial classe B) · `unknown` (Desconhecida) |
| Nº de certificados (se houver) | `certificate_numbers` | texto / lista de tags | Não | livre; cada certificado como tag; opcional |
| Banco / escriturador envolvido | `registrar_bank` | seleção única + texto | Não | ex.: `banco_do_brasil` (Banco do Brasil — incorporador) · `besc_legacy` (BESC — registro histórico) · `other` (Outro, especificar) · `unknown` (Desconhecido) — verificar |
| Observações gerais | `general_notes` | texto longo (textarea) | Não | 0–2000 caracteres |
| Grau de confiança da posição | `position_confidence` | seleção única | **Sim** | valores de `confidence`; default `unverified` (Não verificado) |

\* Regra condicional de obrigatoriedade do CPF/CNPJ documentada na coluna de validação.

### 5. Tela 4 — Cadastro do processo judicial (0..N por caso)

#### 5.1 Propósito

Registrar cada processo judicial vinculado ao caso (um caso pode ter zero, um ou vários). Captura identificação processual (número único CNJ), localização (tribunal/vara/comarca), tipo de ação, partes, fase e marcos decisórios (sentença, recurso, trânsito em julgado), valores e uma avaliação de risco jurídico — sempre marcada como estimativa que **requer validação jurídica**. Nenhuma afirmação de mérito é feita pelo sistema.

#### 5.2 Layout textual

- **Formulário em seções**: "Identificação do processo", "Localização e competência", "Partes e representação", "Fase e decisões", "Valores e risco", "Próximos passos".
- Campo do número do processo com **máscara CNJ** (`NNNNNNN-DD.AAAA.J.TR.OOOO`) e validação de dígito verificador (módulo 97); avisa se o número não confere, mas permite salvar como "a verificar".
- Marcos decisórios (sentença/recurso/trânsito) como seleções com opção "não sei — verificar".
- Rodapé: **"Salvar processo"**, "Salvar e adicionar outro", "Cancelar".

#### 5.3 Tabela de campos

| Campo (rótulo pt-BR) | Chave técnica | Tipo de controle | Obrigatório | Validação / enum |
|---|---|---|---|---|
| Número do processo (CNJ) | `lawsuit_number` | texto com máscara | **Sim** | **máscara CNJ `NNNNNNN-DD.AAAA.J.TR.OOOO`; validação do dígito verificador (módulo 97)**; se não conferir, permite salvar marcado `to_check` |
| Tribunal | `court` | seleção única + texto | **Sim** | ex.: `tjsc` (TJSC) · `trf4` (TRF4) · `stj` (STJ) · `trt12` (TRT12) · `other` (Outro) — verificar |
| Vara | `court_division` | texto | Não | livre (ex.: "3ª Vara Cível") |
| Comarca | `district` | texto | Não | livre (ex.: "Florianópolis/SC") |
| Tipo de ação | `lawsuit_type` | seleção única + texto | **Sim** | `shareholder_dispute` (Ação de acionista/relação de troca) · `monetary_restatement` (Correção monetária/expurgos) · `subscription_dispute` (Subscrição/diluição) · `indemnity` (Indenizatória) · `estate_proceeding` (Inventário/sucessão) · `execution` (Execução) · `other` (Outro) — requer validação jurídica |
| Partes envolvidas | `parties` | lista de tags (autor/réu) | **Sim** | ao menos 1; cada parte com papel `plaintiff` (Autor) · `defendant` (Réu) · `third_party` (Terceiro) |
| Advogado responsável | `attorney` | texto (nome + OAB opcional) | Não | OAB formato `UF NNNNNN` opcional |
| Fase atual | `current_phase` | seleção única | **Sim** | `knowledge` (Conhecimento) · `sentence` (Sentenciado) · `appeal` (Recursal) · `final_judgment` (Trânsito em julgado) · `execution` (Execução/cumprimento) · `unknown` (Desconhecida) — verificar |
| Existe sentença? | `has_sentence` | seleção única | **Sim** | `yes` (Sim) · `no` (Não) · `unknown` (Não sei — verificar); se `yes`, sinaliza campo opcional "resultado (favorável/desfavorável/parcial) — verificar" |
| Existe recurso? | `has_appeal` | seleção única | **Sim** | `yes` (Sim) · `no` (Não) · `unknown` (Não sei — verificar) |
| Houve trânsito em julgado? | `has_final_judgment` | seleção única | **Sim** | `yes` (Sim) · `no` (Não) · `unknown` (Não sei — verificar); relevante para qualidade do crédito (caução) |
| Valor pedido | `claimed_value` | numérico (moeda) | Não | **máscara de moeda R$; ≥ 0**; permite "não informado" |
| Valor estimado atualizado | `estimated_value_current` | numérico (moeda) | Não | **máscara de moeda R$; ≥ 0**; sempre "estimativa — verificar" + grau de confiança |
| Risco jurídico | `legal_risk` | seleção única | **Sim** | valores de `legal_risk`; default `undetermined` (Indeterminado) — requer validação jurídica |
| Próximos passos | `next_steps` | texto longo (textarea) | Não | 0–1500 caracteres; ações a levantar/executar |
| Grau de confiança dos dados | `data_confidence` | seleção única | **Sim** | valores de `confidence`; default `unverified` |

> Observações transversais: (i) valores monetários usam máscara R$ com duas casas e não afirmam liquidez — a liquidez/exigibilidade do crédito é avaliada no checklist de caução (parte II); (ii) os marcos `has_sentence`/`has_appeal`/`has_final_judgment` alimentam diretamente a avaliação de "certeza, liquidez e exigibilidade" do direito como garantia (parte II), mas aqui apenas registram fatos processuais alegados, sem conclusão de mérito.

---

## 4. Telas (parte II): checklists, caução e pendências

Esta seção descreve a **experiência de uso** (UI e comportamento) das telas operacionais de trabalho: os três checklists, a área de avaliação de uso como caução/garantia e a central de pendências. O conteúdo de cada item (quais documentos, quais perguntas) é definido em outras seções; aqui o foco é **layout, controles, estados e fluxo**.

### Convenções comuns a todas as telas de checklist

Todas as telas de checklist (documental, jurídico, tokenização) compartilham a mesma casca de interação para reduzir carga cognitiva do usuário (advogado/consultor):

- **Contexto sempre visível**: cabeçalho fixo com o caso atual (título do caso, titular, tipo de direito) e um seletor para trocar de caso sem sair da tela.
- **Barra de progresso** por checklist e por grupo (percentual + fração `x/y`), recalculada ao vivo a cada mudança de estado.
- **Item expansível**: cada linha da lista é compacta (rótulo + estado + progresso) e expande para revelar controles (anexos, observação, estado, parecer).
- **Salvamento incremental**: toda alteração de estado/observação é persistida sozinha (autosave), com indicador "salvo"/"salvando"/"erro ao salvar" por item — nunca um único botão "salvar tudo".
- **Trilha de evidência**: cada mudança de estado registra autor implícito (sessão sem login → rótulo genérico "operador"), data/hora e, quando houver, o anexo/observação que a justificou. Isso alimenta a origem das pendências.
- **Marcação "requer validação jurídica"**: itens que dependem de avaliação jurídica ou regulatória exibem um selo persistente e **não podem** ser marcados como `validated` (Validado) sem que um campo de parecer/anexo seja preenchido — o sistema apenas registra a evidência, nunca conclui o mérito.

Os estados de item usados nesta seção (com rótulo pt-BR):

| Chave de estado (enum) | Rótulo pt-BR | Uso |
|---|---|---|
| `pending` | Pendente | ainda não iniciado / documento não recebido |
| `received` | Recebido | documento anexado, ainda não analisado |
| `in_review` | Em análise | sob avaliação do operador |
| `validated` | Validado | conferido e aceito (com evidência) |
| `rejected` | Rejeitado | recusado (documento ilegível, inválido, divergente) |
| `needs_completion` | Precisa completar | recebido porém incompleto/parcial |

---

### 4.1 Tela Checklist documental

**Propósito.** Organizar e acompanhar a coleta e conferência de todos os documentos necessários para o caso (titularidade, sucessão, cessão, posição acionária, comprovantes). É a tela onde o operador transforma "papéis soltos" em evidência rastreável por item.

**Layout.**
- **Coluna esquerda (índice de grupos)**: lista de grupos de documentos (ex.: "Titularidade", "Sucessão/espólio", "Cessão", "Posição acionária", "Processo judicial") com o progresso de cada grupo. Clicar rola/filtra para o grupo.
- **Área central (lista de itens)**: itens do checklist agrupados por seção. Cada item mostra rótulo, selo de estado, ícone de anexo (com contador), selo "condicional" quando aplicável e selo "requer validação jurídica" quando aplicável.
- **Cabeçalho da tela**: barra de progresso geral do checklist documental + filtros (por estado, "só pendentes", "só condicionais visíveis", "com anexo").
- **Item expandido**: painel com uploader de arquivos, lista de anexos existentes (nome, data, remover), campo de observação, seletor de estado e histórico da linha.

**Comportamento de documentos condicionais.** Itens condicionais **aparecem/desaparecem** conforme atributos do caso (tipo de titular, tipo de direito, tipo de processo). Exemplos: se `holder_type = estate` (Espólio), surgem itens de inventário/partilha e documento do inventariante; se `holder_type = assignee` (Cessionário), surge o instrumento de cessão e a prova de anuência; se há processo vinculado, surgem itens processuais. Itens ocultos por condição **não contam** no percentual. Uma nota discreta ("3 itens condicionais ocultos — dependem do tipo de titular") mantém a transparência.

**Comportamento de progresso e estados.** O percentual concluído considera concluído o item em `validated` (Validado); `received`/`in_review`/`needs_completion` contam como "em andamento" (peso parcial opcional, exibido separadamente); `rejected` e `pending` não contam. Marcar `validated` (Validado) num item "requer validação jurídica" exige anexo ou parecer preenchido, senão a ação é bloqueada com aviso inline.

**Tabela de campos/controles.**

| Campo / controle | Tipo | Chave técnica | Comportamento |
|---|---|---|---|
| Título do item | rótulo (somente leitura) | `item.label` | vem da definição do checklist |
| Estado | seletor (enum 6 estados) | `item.status` | autosave; muda selo e recálculo de % |
| Anexar documento | uploader (múltiplo) | `item.attachments[]` | aceita PDF/imagem; mostra nome, tamanho, data; permite remover |
| Observação | texto multilinha | `item.note` | autosave; livre |
| Selo "condicional" | indicador (somente leitura) | `item.isConditional` | visível só se o item foi revelado por condição |
| Selo "requer validação jurídica" | indicador (somente leitura) | `item.requiresLegalReview` | bloqueia `validated` sem evidência |
| Motivo da rejeição | texto (condicional) | `item.rejectionReason` | obrigatório quando estado = `rejected` (Rejeitado) |
| Progresso do item | indicador | `item.progress` | derivado do estado |
| Histórico do item | lista (somente leitura) | `item.history[]` | data/hora + estado + evidência |
| Filtro por estado | multiselect | (view) | filtra a lista |
| Progresso do grupo / geral | barra + fração | derivado | recálculo ao vivo |

---

### 4.2 Tela Checklist jurídico

**Propósito.** Levantar, por meio de **perguntas fechadas com evidência**, os pontos jurídicos essenciais do caso (natureza do direito, qualidade do crédito, prazos, cadeia de titularidade, prescrição). Não conclui mérito: registra resposta, dúvida e o que falta avaliar. Pontos sensíveis carregam o selo "requer validação jurídica".

**Layout.**
- **Agrupamento por tema**: perguntas organizadas em blocos temáticos (ex.: "Natureza do direito", "Certeza/liquidez/exigibilidade", "Titularidade e sucessão", "Prazos/prescrição", "Riscos e teses"). Cada bloco tem progresso próprio (perguntas respondidas ≠ `not_assessed`).
- **Linha de pergunta**: enunciado da pergunta + grupo de resposta (5 opções) + selo "requer validação jurídica" + ícone de anexo/parecer.
- **Expansão da pergunta**: campo de observação, uploader de anexo (ex.: sentença, contrato), campo de parecer (texto) e uma nota de ajuda contextual explicando o que a pergunta busca (sem afirmar conclusão).

**Comportamento.** A resposta é registrada como estado da pergunta; `partial` (Parcial) e `not_assessed` (Não avaliado) sinalizam trabalho pendente e alimentam a tela de Pendências. `not_applicable` (Não se aplica) remove a pergunta do denominador do progresso do bloco. Qualquer pergunta com selo "requer validação jurídica" exibe aviso permanente de que a resposta é **levantamento**, não decisão, e recomenda parecer — o campo de parecer registra a evidência da avaliação, sem que o software emita juízo.

**Tabela de campos/controles.**

| Campo / controle | Tipo | Chave técnica | Comportamento |
|---|---|---|---|
| Enunciado da pergunta | rótulo (somente leitura) | `question.label` | vem da definição do checklist |
| Resposta | seletor (enum 5 opções) | `question.answer` | valores: `yes` (Sim) / `no` (Não) / `partial` (Parcial) / `not_assessed` (Não avaliado) / `not_applicable` (Não se aplica) |
| Observação | texto multilinha | `question.note` | autosave |
| Anexo | uploader (múltiplo) | `question.attachments[]` | PDF/imagem (ex.: sentença, contrato) |
| Parecer | texto multilinha | `question.opinion` | evidência de avaliação; obrigatório se "requer validação jurídica" e resposta ≠ `not_assessed` |
| Selo "requer validação jurídica" | indicador (somente leitura) | `question.requiresLegalReview` | aviso permanente de "levantamento, não decisão" |
| Ajuda contextual | texto de apoio (somente leitura) | `question.help` | explica o que a pergunta busca |
| Progresso do tema | barra + fração | derivado | conta respondidas ≠ `not_assessed`, exclui `not_applicable` |

---

### 4.3 Tela Checklist de tokenização

**Propósito.** Levantar o que falta para **estruturar uma futura tokenização** dos direitos — sem tokenizar de verdade. Usa os mesmos controles do checklist jurídico (pergunta fechada + evidência), organizados pelas dimensões de decisão de uma estruturação. Toda pergunta de enquadramento regulatório carrega o selo "requer validação jurídica" (CVM/BCB/assessor).

**Layout.** Idêntico em mecânica ao 4.2, com **agrupamento por dimensão de estruturação**:

| Grupo (chave) | Rótulo pt-BR | O que levanta (resumo) |
|---|---|---|
| `what_tokenized` | O que será tokenizado | qual direito/ativo exato vira token; escopo |
| `backing` | Lastro | existência e verificabilidade do direito subjacente |
| `custody` | Custódia | quem guarda/registra o lastro; escriturador/custodiante |
| `validation` | Validação | quem confere lastro e titularidade; laudos |
| `value` | Valor | metodologia de valuation, premissas, liquidez |
| `tech_structure` | Estrutura técnica | veículo/trilho (ex.: cotas de fundo), arquitetura regulatória |

**Comportamento.** Mesma mecânica de resposta/observação/anexo/parecer e mesma barra de progresso por grupo do 4.2. Perguntas de enquadramento (é valor mobiliário? qual trilho de oferta? é VASP?) exibem selo "requer validação jurídica" e a resposta é sempre tratada como hipótese a confirmar — o software **registra a decisão de arquitetura regulatória como campo**, nunca como conclusão. Respostas `not_assessed` (Não avaliado) e `partial` (Parcial) geram pendências rotuladas por dimensão.

**Tabela de campos/controles.** Reaproveita integralmente a tabela do 4.2 (mesmo modelo de pergunta), com o acréscimo:

| Campo / controle | Tipo | Chave técnica | Comportamento |
|---|---|---|---|
| Dimensão de estruturação | agrupador (somente leitura) | `question.group` | um de: `what_tokenized` / `backing` / `custody` / `validation` / `value` / `tech_structure` |
| Selo "requer validação jurídica" (regulatório) | indicador | `question.requiresLegalReview` | padrão em perguntas de enquadramento CVM/BCB |

---

### 4.4 Tela Uso como caução/garantia

**Propósito.** Avaliar, como **levantamento estruturado**, a viabilidade de usar os direitos do caso como caução/garantia num processo de terceiro. Combina um **formulário de avaliação** (dados quantitativos e qualitativos do uso pretendido) com uma **lista de itens/checklist** de mitigadores e documentos. Todo item de mérito jurídico é PERGUNTA/CAMPO a levantar, com selo "requer validação jurídica" — o software não afirma se a garantia será aceita.

**Layout.**
- **Bloco 1 — Uso pretendido (formulário)**: campos do processo de destino e da economia da garantia (tipo de processo, valor da dívida, valor necessário de garantia, cobertura, prazo, remuneração).
- **Bloco 2 — Risco e responsabilidade**: risco de recusa judicial (levantado, não decidido), quem assume o risco, contrato necessário.
- **Bloco 3 — Documentos a apresentar ao juiz (checklist)**: lista de documentos/mitigadores (laudo, sentença/trânsito, parecer, instrumento de cessão, reforço complementar), cada um com estado e anexo — reaproveita os controles de checklist do 4.1.
- **Indicadores derivados** exibidos no topo: **percentual de cobertura** (calculado de valor de garantia ÷ valor da dívida) e um **selo de prontidão** ("faltam documentos" / "levantamento completo") — que reflete apenas completude do levantamento, nunca um veredito de aceitação.

**Comportamento.**
- **Percentual de cobertura** é calculado automaticamente quando há valor da dívida e valor de garantia; se o valor necessário de garantia diferir do valor da dívida (ex.: execução fiscal com acréscimos), a cobertura usa o valor necessário como base e sinaliza a diferença.
- **Risco de recusa judicial** é um campo de classificação assistida (baixo/médio/alto) **acompanhado de justificativa obrigatória** e do selo "requer validação jurídica" — apresentado como estimativa de levantamento, com nota de que a decisão é do juízo.
- Campos monetários usam máscara/validação numérica; prazos usam data ou duração; o formulário faz autosave por campo.
- O checklist de documentos do Bloco 3 alimenta a tela de Pendências como qualquer outro checklist.

**Tabela de campos/controles.**

| Campo / controle | Tipo | Chave técnica | Comportamento |
|---|---|---|---|
| Tipo de processo de destino | seletor (enum) | `guarantee.targetProcessType` | valores: `civil_execution` (Execução cível) / `tax_execution` (Execução fiscal) / `labor` (Trabalhista) / `precautionary_appeal` (Cautelar/recursal) / `settlement` (Acordo) |
| Valor da dívida | monetário | `guarantee.debtValue` | máscara numérica |
| Valor necessário de garantia | monetário | `guarantee.requiredGuaranteeValue` | pode diferir da dívida (acréscimos) |
| Percentual de cobertura | derivado (somente leitura) | `guarantee.coveragePct` | = valor de garantia ÷ valor necessário; sinaliza <100% |
| Prazo de uso | data/duração | `guarantee.usagePeriod` | validade/vigência pretendida |
| Remuneração pelo uso | texto/monetário | `guarantee.usageRemuneration` | como o titular é remunerado por ceder a garantia |
| Risco de recusa judicial | seletor (baixo/médio/alto) + justificativa | `guarantee.rejectionRisk` + `guarantee.rejectionRiskNote` | justificativa obrigatória; selo "requer validação jurídica" |
| Quem assume o risco se não aceito | seletor/texto | `guarantee.riskBearer` | ex.: ofertante / cessionário / terceiro |
| Contrato necessário | sim/não + anexo | `guarantee.contractRequired` + `guarantee.contractAttachment` | instrumento de cessão/vinculação |
| Documentos p/ apresentar ao juiz | checklist (itens estado+anexo) | `guarantee.courtDocuments[]` | laudo, sentença/trânsito, parecer, cessão, reforço; alimenta Pendências |
| Selo de prontidão | indicador derivado | `guarantee.readiness` | reflete completude do levantamento, não aceitação |

---

### 4.5 Tela Pendências

**Propósito.** Consolidar, num só lugar, **tudo o que falta** no caso — gerado automaticamente a partir dos estados dos checklists e do formulário de caução — priorizado e com link direto para resolver cada item. É o "mapa do que fazer a seguir".

**Layout.**
- **Lista agrupada e priorizada**: pendências agrupadas por origem (Documental / Jurídico / Tokenização / Caução) e ordenadas por prioridade. Contadores por grupo e por prioridade no topo.
- **Linha de pendência**: rótulo do que falta + origem (com ícone da tela de origem) + prioridade + botão/link "Resolver" que leva ao item exato (tela + grupo + item, com o item já expandido).
- **Filtros**: por origem, por prioridade, "só bloqueantes", "só requer validação jurídica".
- **Estado vazio**: quando não há pendências, mensagem clara de "levantamento completo para os itens obrigatórios" (sem afirmar mérito/aceitação).

**Comportamento — geração automática.** As pendências **não são criadas à mão**; são derivadas por regras a cada mudança:

| Origem da pendência | Condição que a gera | Prioridade sugerida |
|---|---|---|
| Documental | item em `pending` / `needs_completion` / `rejected` | alta se documento essencial de titularidade; média senão |
| Documental | item essencial `received` sem `validated` há muito tempo | média |
| Jurídico | resposta `not_assessed` ou `partial` | alta se "requer validação jurídica"; média senão |
| Jurídico | item `validated`/`yes` sem parecer quando "requer validação jurídica" | alta |
| Tokenização | pergunta de enquadramento `not_assessed`/`partial` | alta (bloqueante para estruturar) |
| Caução | cobertura < 100% | alta |
| Caução | risco de recusa "alto" sem mitigadores anexados | alta |
| Caução | documento do Bloco 3 `pending` | média |

Cada pendência guarda a **origem** (tela, grupo, item) e o **motivo** (regra que a disparou), exibidos na linha para transparência. Resolver a condição de origem (mudar estado, anexar, responder) **remove a pendência automaticamente** na próxima recomputação — a tela de Pendências é somente leitura quanto ao conteúdo (não se edita a pendência ali, edita-se a origem).

**Tabela de campos/controles.**

| Campo / controle | Tipo | Chave técnica | Comportamento |
|---|---|---|---|
| Rótulo da pendência | rótulo (somente leitura) | `pendency.label` | descreve o que falta |
| Origem | indicador (somente leitura) | `pendency.source` | um de: `documental` / `legal` / `tokenization` / `guarantee` |
| Referência ao item | link (somente leitura) | `pendency.ref` | tela + grupo + item (para navegação) |
| Motivo/regra | texto (somente leitura) | `pendency.reason` | regra que disparou a pendência |
| Prioridade | indicador (enum) | `pendency.priority` | `high` (Alta) / `medium` (Média) / `low` (Baixa) |
| Selo "bloqueante" | indicador | `pendency.isBlocking` | impede avanço da estruturação/uso |
| Selo "requer validação jurídica" | indicador | `pendency.requiresLegalReview` | herdado da origem |
| Botão "Resolver" | ação (navegação) | — | abre a tela de origem com o item expandido |
| Filtro por origem/prioridade | multiselect | (view) | filtra a lista |
| Contadores por grupo | indicador derivado | derivado | recálculo ao vivo |

---

## 5. Checklist documental completo

Este checklist é a espinha dorsal do módulo de organização documental. Cada caso (`case`) mantém uma coleção de itens documentais (`document_item`); cada item tem um **tipo** (do catálogo abaixo), uma **obrigatoriedade** resolvida em função do perfil do caso, um **estado** de workflow e **evidências** anexadas (arquivo + metadados). O sistema não julga mérito jurídico: ele registra presença, estado e pendências de cada documento, e sinaliza o que **requer validação jurídica**.

### 5.1 Estados possíveis de cada documento (`document_status`)

Todo item documental percorre a mesma máquina de estados, independentemente do tipo.

| Estado (enum) | Rótulo pt-BR | Significado | Transições típicas |
|---|---|---|---|
| `pending` | Pendente | Item exigido/esperado mas ainda não anexado. Estado inicial de todo item obrigatório ou condicional ativado. | → `received`, `needs_completion` |
| `received` | Recebido | Arquivo anexado, mas ainda não conferido por pessoa responsável. | → `in_review`, `needs_completion` |
| `in_review` | Em análise | Sob conferência do validador designado (documental e/ou jurídica). | → `validated`, `rejected`, `needs_completion` |
| `validated` | Validado | Documento conferido e aceito como suficiente para o fim declarado. | → `needs_completion` (se algo mudar), `rejected` (reabertura) |
| `rejected` | Rejeitado | Documento inservível (ilegível, inválido, não corresponde ao caso, vencido). Exige substituição. | → `pending`, `received` |
| `needs_completion` | Precisa completar | Anexado mas incompleto (falta página, falta averbação, falta assinatura, falta reconhecimento de firma, cópia parcial). | → `received`, `in_review` |

Regras transversais de estado:
- Um item **obrigatório** não pode ser marcado como concluído enquanto não estiver em `validated`.
- Item **condicional** só entra em `pending` quando sua condição de gatilho é verdadeira (ver 5.3); enquanto a condição for falsa, o item fica **inativo** (`not_applicable` — Não se aplica) e não conta como pendência.
- Todo estado guarda **quem** mudou, **quando** e uma **nota** (livre), formando trilha de auditoria por item.
- `rejected` e `needs_completion` devem exigir **motivo** preenchido (campo obrigatório na transição).

### 5.2 Campos de evidência por item

Cada anexo de um `document_item` carrega: arquivo (upload), tipo de documento, data do documento (quando aplicável), origem/emissor, número/identificador (quando houver), grau de confiança (`confidence` — alto/médio/baixo, a verificar), e flag `requires_legal_review` (Requer validação jurídica). Datas, valores e titularidade extraídos de um documento nunca são tratados como certos sem lastro — o item mantém sempre a referência à evidência.

### 5.3 Tabela do checklist documental

**Legenda de "Quem valida":** *Documental* = conferência administrativa (legibilidade, correspondência ao caso, completude). *Jurídica* = análise que **requer validação jurídica** (certeza/exigibilidade/cadeia/cessão). Vários itens passam pelas duas.

| Documento | Obrigatoriedade | Quem valida | Formato esperado | Observações |
|---|---|---|---|---|
| **Documento pessoal do titular** (`holder_id_document`) — RG/CNH/CPF ou contrato/CNPJ se PJ | Obrigatório | Documental | PDF/imagem legível, frente e verso; PJ: ato constitutivo + CNPJ | Identifica o titular original registrado. Verificar se corresponde ao nome no registro escritural; sinalizar homonímia. |
| **Comprovante de endereço** (`address_proof`) | Obrigatório | Documental | PDF/imagem; conta de consumo/documento oficial recente (recência a verificar) | Endereço do titular/representante atual para comunicação e cadastro. |
| **Procuração** (`power_of_attorney`) | Condicional — quando o caso é conduzido por representante/advogado (não o próprio titular) | Documental + Jurídica | PDF; instrumento com poderes específicos; reconhecimento de firma se aplicável (verificar) | Verificar se os **poderes** abrangem levantamento, cessão e oferta em garantia. Sem poderes suficientes → `needs_completion`. **Requer validação jurídica** quanto à extensão dos poderes. |
| **Certidão de óbito** (`death_certificate`) | Condicional — quando `holder_type` = `estate` (Espólio) ou `heir` (Herdeiro) | Documental | PDF; certidão oficial | Ativa a exigência de documentação sucessória (partilha, inventário). Só exigida se o titular original faleceu. |
| **Formal de partilha / documentação sucessória** (`partition_deed`) | Condicional — quando `holder_type` = `estate`/`heir` | Documental + Jurídica | PDF; formal de partilha, ou termo de inventário/alvará judicial, ou escritura de inventário | Comprova a **transferência sucessória** do direito. Verificar se as ações/direitos BESC estão descritos no acervo partilhado; se não, marcar pendência de sobrepartilha (verificar). **Requer validação jurídica** da cadeia sucessória. |
| **Certificado das ações BESC** (`besc_share_certificate`) | Condicional — quando existir emissão cartular física (ações antigas) | Documental + Jurídica | PDF/imagem do certificado físico digitalizado | Muitas posições eram **escriturais** (sem cártula) → nesses casos este item é `not_applicable` e a prova vem do extrato do escriturador. |
| **Extrato / comprovante das ações** (`share_statement`) — posição no escriturador/custodiante | Obrigatório | Documental + Jurídica | PDF; extrato do agente escriturador/custodiante, com classe (ON/PN/PNA/PNB) e quantidade | Fonte primária de titularidade e posição. Deve registrar **classe** da ação. Pós-incorporação pode refletir posição já convertida em ações do BB — registrar essa distinção. |
| **Documentos de aquisição** (`acquisition_documents`) — como as ações foram adquiridas | Condicional — quando necessário reconstruir a origem/cadeia (compra, subscrição, herança anterior) | Documental + Jurídica | PDF; boletim de subscrição, nota de corretagem, contrato de compra, comprovante de chamada de capital | Sustenta a **cadeia de titularidade** e teses sobre subscrições/diluição. Frequentemente incompleto por decurso de tempo → `needs_completion` é comum. |
| **Petição inicial** (`complaint_petition`) | Condicional — quando houver processo judicial associado ao direito | Documental | PDF dos autos | Define objeto, tese e partes da ação. Base para vincular o direito litigioso ao caso. |
| **Sentença** (`judgment`) | Condicional — quando o processo já tem sentença | Documental + Jurídica | PDF dos autos | **Requer validação jurídica** sobre o que foi decidido e efeitos. Fase processual influencia liquidez/exigibilidade. |
| **Acórdão** (`appellate_decision`) | Condicional — quando houve julgamento em instância recursal | Documental + Jurídica | PDF dos autos | Verificar se há trânsito em julgado. **Requer validação jurídica**. |
| **Recursos** (`appeals`) — recursos pendentes/interpostos | Condicional — quando existirem recursos em curso | Documental + Jurídica | PDF dos autos | Recurso pendente sinaliza **exigibilidade suspensa/incerta** — impacta uso como garantia. **Requer validação jurídica**. |
| **Cálculos judiciais** (`judicial_calculations`) — memória/planilha de cálculo | Condicional — quando o valor do crédito depende de cálculo/liquidação | Documental + Jurídica | PDF/planilha; laudo contábil/memória de cálculo homologada ou não | Base do valor determinável. Registrar se o cálculo está **homologado** (verificar). **Requer validação jurídica/contábil** do critério (correção, expurgos — verificar caso a caso). |
| **Parecer jurídico** (`legal_opinion`) — sobre certeza/exigibilidade | Condicional (recomendado como mitigador) — quando se pretende usar o direito em cessão/caução | Jurídica | PDF; parecer assinado por advogado | Mitigador-chave de recusa em garantia. O sistema **não** produz o parecer; **captura** o documento e a conclusão como campo. **Requer validação jurídica** (é o próprio insumo jurídico). |
| **Laudo de avaliação** (`valuation_report`) — do direito/crédito | Condicional (recomendado como mitigador) — quando se pretende tokenizar ou usar como garantia | Documental + Jurídica | PDF; laudo de avaliador independente com metodologia e premissas | Sustenta precificação e reduz risco de recusa por iliquidez. Registrar metodologia, premissas e data-base. Para direito litigioso/incerto, exigir divulgação de risco. |
| **Contrato de cessão** (`assignment_agreement`) | Condicional — quando `holder_type` = `assignee` (Cessionário) ou houve transferência do direito | Documental + Jurídica | PDF; instrumento de cessão com anuências aplicáveis | Titularidade atual pode divergir do titular original. Verificar anuência/observância procedimental (direito litigioso não vincula a parte contrária automaticamente — verificar). **Requer validação jurídica**. |
| **Documentos que comprovem titularidade** (`title_proof_bundle`) — conjunto que fecha a cadeia | Obrigatório | Documental + Jurídica | Conjunto: extrato + sucessão/cessão + identificação | Item agregador: cruza escriturador + sucessão + cessão + identidade. Sem cadeia fechada → titularidade **incerta** (pendência crítica). **Requer validação jurídica** da cadeia. |
| **Documentos que comprovem possibilidade de cessão ou caução** (`transferability_evidence`) | Obrigatório | Jurídica | Conjunto: cláusulas contratuais, estatuto/registro, decisões processuais, anuências | Levanta se há **restrição** à cessão/oneração (cláusula, condição, litígio, indisponibilidade). Direito litigioso/ilíquido tende a ser recusado — registrar premissas. **Requer validação jurídica** (admissibilidade da cessão/caução). |

### 5.4 Regras de condicionalidade (gatilhos)

As condições abaixo dirigem a ativação automática de itens condicionais. Enquanto o gatilho for falso, o item fica `not_applicable` (Não se aplica) e não gera pendência.

| Gatilho (campo do caso) | Itens que passam a **obrigatórios/pendentes** |
|---|---|
| `holder_type` = `estate` (Espólio) **ou** `heir` (Herdeiro) | `death_certificate`, `partition_deed` |
| `holder_type` = `assignee` (Cessionário) **ou** `has_assignment` = verdadeiro | `assignment_agreement`, e reforço em `title_proof_bundle` |
| `represented_by_attorney` = verdadeiro (representante/advogado atua) | `power_of_attorney` |
| `has_litigation` = verdadeiro (há processo associado) | `complaint_petition`; e, conforme fase: `judgment`, `appellate_decision`, `appeals`, `judicial_calculations` |
| `has_physical_certificate` = verdadeiro (ações cartulares) | `besc_share_certificate` (caso contrário `not_applicable`, prova via `share_statement`) |
| `intended_use` inclui `tokenization` (Tokenização) **ou** `collateral` (Caução/garantia) | `valuation_report`, `legal_opinion`, `transferability_evidence` (como mitigadores/obrigatórios do objetivo) |
| `value_depends_on_calculation` = verdadeiro | `judicial_calculations` |

### 5.5 Derivação de completude do caso

- **Documentação completa** (`docs_complete`): todos os itens **obrigatórios** e todos os **condicionais ativados** estão em `validated`.
- **Documentação incompleta** (`docs_incomplete`): existe ao menos um item obrigatório/condicional-ativado fora de `validated`.
- **Pendência crítica** (`critical_gap`): itens agregadores de titularidade (`title_proof_bundle`) ou de transferibilidade (`transferability_evidence`) não fechados — bloqueiam qualquer avaliação de tokenização/caução, independentemente do restante.
- Itens marcados `requires_legal_review` mantêm o caso sinalizado como **dependente de validação jurídica** mesmo quando documentalmente completo — o software organiza e sinaliza, **não conclui** o mérito jurídico.

---

## 6. Checklist jurídico e regulatório

> Esta seção é um instrumento de **levantamento documental**: cada linha é uma **pergunta a responder no software** com evidência anexada. Não constitui parecer nem conclusão jurídica. Toda resposta que dependa de mérito exige **validação jurídica/regulatória externa**. Números de lei/artigo e limites regulatórios citados são **genéricos e devem ser verificados** em fonte primária.

### 6.1 Checklist jurídico — perguntas a levantar

Cada pergunta é respondida por caso com o enum de resposta `answer` e um campo de evidência. Respostas possíveis: `yes` (Sim) · `no` (Não) · `partial` (Parcial) · `not_assessed` (Não avaliado, valor inicial) · `not_applicable` (Não se aplica).

| # | Chave (`key`) | Pergunta (rótulo pt-BR) | O que observar / evidência |
|---|---|---|---|
| 1 | `right_exists` | O direito alegado efetivamente existe? | Registro escritural, extrato de custódia, fato relevante, documento de conversão BESC→BB; confirmar posição e classe da ação. **Requer validação jurídica.** |
| 2 | `right_transferable` | O direito é transferível a terceiro? | Natureza do direito (acionário / creditório / litigioso); cláusula ou condição que restrinja transferência; se pende de decisão judicial. **Requer validação jurídica.** |
| 3 | `right_assignable` | O direito pode ser cedido (cessão formalizada)? | Existência/possibilidade de instrumento de cessão; se litigioso, necessidade de anuência da parte contrária e observância procedimental; cessionário assume a álea. **Requer validação jurídica.** |
| 4 | `usable_as_collateral` | O direito pode ser usado como caução/garantia processual? | Tipo do processo de destino (execução cível / fiscal-LEF / trabalhista / cautelar-recursal / acordo); modalidade de garantia; grau de liquidez exigido. **Requer validação jurídica.** |
| 5 | `prescription_risk` | Há risco de prescrição/decadência? | Datas dos eventos (conversão, chamadas de capital, óbito do titular), marcos processuais, prazo aplicável a checar — **não afirmar mérito**; marcar "verificar". **Requer validação jurídica.** |
| 6 | `liquidity_disputed` | Há discussão sobre a liquidez do direito? | Classificação de liquidez (remanescente/líquido · ilíquido/condicional · litigioso); valor determinado ou apenas determinável; dependência de sentença/trânsito em julgado. **Requer validação jurídica.** |
| 7 | `favorable_case_law` | Existe jurisprudência favorável à tese? | Referência a decisões/precedentes que sustentem a tese específica (relação de troca, critério de valor, subscrições, expurgos); anexar identificação — **generalizar, não fabricar número**. **Requer validação jurídica.** |
| 8 | `adverse_case_law` | Existe jurisprudência contrária à tese? | Precedentes que enfraqueçam a tese; divergência entre instâncias; risco de tese superada. **Requer validação jurídica.** |
| 9 | `judge_may_reject` | O juiz pode recusar o direito como garantia? | Baixa liquidez / crédito incerto autorizam recusa fundamentada; ordem legal de preferência de bens; discricionariedade do juízo (especialmente LEF). **Requer validação jurídica.** |
| 10 | `needs_external_opinion` | É necessário parecer jurídico externo? | Complexidade da cadeia de titularidade, tese controvertida, uso pretendido como garantia; parecer de certeza/exigibilidade como mitigador de recusa. **Requer validação jurídica.** |
| 11 | `needs_capital_markets_expert` | É necessária avaliação por especialista em mercado de capitais? | Intenção de estruturar tokenização/oferta; necessidade de valuation e metodologia; enquadramento como valor mobiliário de alto risco. **Requer validação jurídica/regulatória.** |

Campos de apoio sugeridos por linha (além de `answer`): `evidence_note` (Observação/evidência), `attachment_ref` (Anexo de referência: laudo/sentença/parecer/contrato), `confidence` (Grau de confiança) e `needs_legal_review` (Requer validação jurídica — booleano, default `true` nas linhas marcadas).

### 6.2 Checklist regulatório — perguntas para futura tokenização

Nível **levantamento**: mapear decisões de arquitetura regulatória, sem concluir enquadramento. Cada linha carrega `answer` (mesmo enum de 6.1) + evidência + a marca **"requer validação jurídica/regulatória"**. A classificação depende da **essência econômica do direito subjacente**, não do rótulo "token".

| # | Chave (`key`) | Pergunta (rótulo pt-BR) | O que observar / evidência |
|---|---|---|---|
| 1 | `is_security_cvm` | O token pode ser valor mobiliário (análise CVM / Parecer de Orientação 40)? | Aplicar o teste do contrato de investimento coletivo: investimento em dinheiro/bens, coletivo, expectativa de benefício, esforço de terceiro; registrar natureza do direito subjacente, promessa de rendimento e quem gera o retorno. **Requer validação jurídica/regulatória.** |
| 2 | `needs_offer_registration_or_exemption` | Precisa de registro/oferta pública ou cabe dispensa (Res. CVM 88 / regime geral de ofertas)? | Se é valor mobiliário, oferta exige registro (regime geral) **ou** enquadramento em crowdfunding via plataforma registrada; verificar tetos de captação, limites por investidor e requisitos de porte **vigentes**; risco da circulação secundária livre em blockchain conflitar com o regime. **Requer validação jurídica/regulatória.** |
| 3 | `structurable_via_fidc` | Cabe estruturar via FIDC / direito creditório (Res. CVM 175)? | Existência de direitos creditórios elegíveis e verificáveis (originação, cessão válida, ausência de vícios); papéis obrigatórios (administrador, gestor, custodiante); segregação de cotas sênior/subordinada; elegibilidade de varejo a checar. **Requer validação jurídica/regulatória.** |
| 4 | `virtual_asset_bcb_scope` | Há enquadramento no Marco Legal de Ativos Virtuais / competência do BCB (VASP)? | Linha divisória: se representa valor mobiliário → CVM; se cripto de pagamento/utilitário sem natureza de valor mobiliário → BCB; verificar estágio vigente da regulamentação de VASPs; registrar a decisão CVM vs BCB vs ambos. **Requer validação jurídica/regulatória.** |
| 5 | `kyc_aml_pld_ft` | Há necessidade de KYC/AML e PLD-FT (COAF)? | Identificação de clientes, KYC/KYT (screening de carteiras, sanções/PEP), monitoramento, trilha de auditoria e workflow de comunicação de operação suspeita ao COAF; confirmar obrigações por perfil (VASP vs plataforma CVM). **Requer validação jurídica/regulatória.** |
| 6 | `lgpd_compliance` | Há conformidade LGPD (dados pessoais, whitelist)? | Base legal por tratamento, minimização e retenção, direitos do titular; não gravar PII on-chain (manter off-chain com ponteiro/hash) diante da imutabilidade vs direito de eliminação; definir controlador/operador e DPO. **Requer validação jurídica/regulatória.** |
| 7 | `tax_capital_gains` | Há aspectos tributários a tratar (ganho de capital)? | Ganho de capital para PF e obrigações acessórias de declaração à RFB; rendimentos de valores mobiliários/cotas seguem o regime do instrumento; verificar alíquotas, faixas e obrigatoriedade **vigentes**; emissão de informes. **Requer validação jurídica/regulatória (tributário).** |
| 8 | `needs_regulatory_advisor` | Há necessidade de assessoria/estruturador regulatório? | Complexidade do enquadramento (CVM/BCB/FIDC), direito litigioso/indeterminado agrava suitability e valuation; necessidade de assessor CVM, estruturador e definição de trilho de oferta antes de qualquer decisão. **Requer validação jurídica/regulatória.** |

Campos de apoio por linha (iguais a 6.1): `evidence_note`, `attachment_ref`, `confidence` e `needs_regulatory_review` (Requer validação jurídica/regulatória — booleano, default `true`). Observação transversal para o software: nenhum limite numérico, prazo ou estágio de regulamentação deve ser exibido como definitivo — todos carregam marca **"verificar com jurídico/assessor CVM"**.

---

## 7. Checklist técnico de tokenização e lógica de caução

> Esta seção descreve **como o software levanta e organiza** informação para (a) preparar uma futura tokenização e (b) avaliar o uso do direito como caução/garantia. É **levantamento documental**, não execução técnica nem parecer jurídico. Toda decisão de enquadramento, cessão, oferta ou aceitação de garantia é marcada como campo a preencher e **requer validação jurídica**. O sistema **não decide** mérito, admissibilidade ou viabilidade — ele **estrutura perguntas, coleta evidências e sinaliza pendências**.

### 7.1 Checklist técnico para futura tokenização (levantamento, não execução)

O sistema apresenta este checklist como um formulário estruturado por caso (`tokenization_readiness` (Prontidão para tokenização)). Cada item é uma pergunta/campo cuja resposta é **registrada com fonte e grau de confiança** — nunca inferida como certa. Nenhum item executa tokenização; todos apenas **capturam a decisão pretendida e o que falta para sustentá-la**. Itens de enquadramento regulatório ou de validade jurídica do lastro são marcados **"requer validação jurídica"** e não são preenchíveis pelo próprio sistema como conclusão.

| # | Item (campo técnico → rótulo pt-BR) | Resposta esperada | O que observar (levantamento) |
|---|---|---|---|
| 1 | `tokenized_object` (O que exatamente será tokenizado) | Texto descritivo + referência ao(s) caso(s)/direito(s) vinculado(s) | Precisa apontar para um direito **já cadastrado e evidenciado** no sistema, não uma abstração. Se o objeto não tem lastro documental, gera pendência bloqueante. |
| 2 | `right_type` (Tipo de direito a tokenizar) | Enum: `share` (Direito acionário), `credit_right` (Direito creditório), `litigious_right` (Direito litigioso), `economic_right` (Direito econômico) | Tipo determina risco e enquadramento. `litigious_right` e `credit_right` não reconhecido = alto risco / valor incerto. **Requer validação jurídica** sobre a natureza real do direito. |
| 3 | `underlying_asset` (Qual o lastro) | Descrição do ativo/direito subjacente + documentos que o comprovam | Verificar se o lastro é **verificável e existente** (posição societária, sentença, título, contrato) ou apenas **pretendido**. Sem lastro comprovado → não prosseguir. |
| 4 | `legal_backing_validated` (Lastro validado juridicamente?) | Booleano + responsável + data + documento de suporte | **Requer validação jurídica.** O sistema apenas registra se houve parecer/validação e por quem — nunca afirma que o lastro é válido. |
| 5 | `legal_validator` (Quem validará juridicamente o lastro) | Nome/papel do responsável (advogado/consultor) + vínculo | Deve ser parte externa qualificada. Registrar se a validação está **pendente, em curso ou concluída**. Campo obrigatório antes de marcar prontidão. |
| 6 | `document_custodian` (Quem será o custodiante dos documentos) | Nome/instituição/papel do custodiante | Levantar se há custodiante definido dos documentos-fonte (escriturador, cartório, custodiante financeiro, o próprio operador). Sem custódia clara → pendência. |
| 7 | `estimated_asset_value` (Valor estimado do ativo) | Valor + moeda + metodologia + data-base + grau de confiança | **Não** aceitar valor "cheio" sem premissas. Observar se há laudo, metodologia declarada e se o valor depende de desfecho incerto (litigioso). Marcar `value_confidence` (Confiança do valor). |
| 8 | `valuation_method` (Metodologia de valuation) | Texto: como o valor foi estimado + premissas + gatilhos de baixa | Exigido especialmente para direito litigioso/ilíquido. **Requer validação** (contábil/jurídica) das premissas. Sinalizar se ausente. |
| 9 | `fractionalization` (Haverá fracionamento?) | Enum: `yes` (Sim) / `no` (Não) / `undecided` (Indefinido) + nº de frações previsto | Se `yes`, levantar como se define cada fração e se o direito é divisível de fato. Divisibilidade de direito litigioso **requer validação jurídica**. |
| 10 | `smart_contract` (Haverá smart contract?) | Enum: `yes` / `no` / `undecided` + observações | Só levantamento de intenção. Se `yes`, registrar que a lógica de distribuição/restrição precisará refletir as regras jurídicas (campo futuro, não implementado aqui). |
| 11 | `chain_type` (Blockchain pública ou permissionada?) | Enum: `public` (Pública) / `permissioned` (Permissionada) / `undecided` (Indefinido) | Decisão de arquitetura. Permissionada tende a andar com whitelist/KYC. Registrar justificativa pretendida. |
| 12 | `participant_whitelist` (Haverá whitelist de participantes?) | Enum: `yes` / `no` / `undecided` | Se `yes`, cruza com KYC e com tratamento de dados pessoais (LGPD). Registrar base legal pretendida como pendência. |
| 13 | `kyc_required` (Haverá KYC?) | Enum: `yes` / `no` / `undecided` + escopo (PLD/FT, PEP, sanções) | KYC implica tratamento de dados pessoais e possíveis deveres PLD/FT. **Requer validação jurídica** sobre obrigatoriedade conforme o perfil (VASP / plataforma CVM). |
| 14 | `transfer_restriction` (Haverá restrição de transferência?) | Enum: `yes` / `no` / `undecided` + regra pretendida | Restrição pode ser exigida por enquadramento regulatório ou por natureza litigiosa do direito. Circulação secundária livre **requer validação** (possível conflito com regime de oferta). |
| 15 | `future_distribution` (Haverá distribuição futura de valores?) | Enum: `yes` / `no` / `undecided` + gatilho/condição | Se `yes`, o token tende a se aproximar de valor mobiliário (expectativa de retorno por esforço de terceiro). **Requer validação jurídica** (enquadramento CVM). |
| 16 | `guarantee_remuneration` (Haverá remuneração pelo uso como garantia/caução?) | Enum: `yes` / `no` / `undecided` + forma/percentual pretendido | Levantar se o direito, ao ser dado em garantia, prevê remuneração/prêmio ao ofertante. Impacta enquadramento e a lógica da seção de caução (7.2). **Requer validação jurídica.** |
| 17 | `regulatory_classification` (Classificação regulatória pretendida) | Enum: `security_cvm` (Valor mobiliário — CVM), `virtual_asset_bcb` (Ativo virtual — BCB), `both` (Ambos), `undefined` (A definir) | Derivada da essência econômica, não do rótulo "token". **Requer validação jurídica / assessor CVM.** O sistema só registra a hipótese e as pendências. |
| 18 | `offering_track` (Trilho de oferta pretendido) | Enum: `cvm_160` (Registro — Res. 160), `crowdfunding_88` (Crowdfunding — Res. 88), `fidc_175` (FIDC — Res. 175), `none_yet` (A definir) | Só se aplica se for valor mobiliário. Registrar limites/requisitos como **"verificar"**. **Requer validação jurídica.** |
| 19 | `data_protection_plan` (Plano de proteção de dados — LGPD) | Texto: PII off-chain, base legal, controlador/operador, DPO | Levantar como pendência quando houver whitelist/KYC. Não gravar dado pessoal on-chain (imutabilidade × direito de eliminação). **Requer validação jurídica.** |
| 20 | `assignment_admissibility` (Admissibilidade da cessão do direito) | Booleano/estado + fundamento + responsável | Cessão de direito litigioso pode exigir observância procedimental e anuência. **Requer validação jurídica** — o sistema só registra o estado e a evidência. |

**Saída da subseção:** para cada caso, o sistema gera (i) um **escopo do que falta** (itens sem resposta ou marcados "requer validação jurídica") e (ii) um indicador `tokenization_readiness_level` (Nível de prontidão para tokenização) — `insufficient` (Insuficiente) / `partial` (Parcial) / `ready_for_review` (Pronto para revisão jurídica). O nível máximo alcançável pelo sistema é **"pronto para revisão jurídica"** — jamais "apto a tokenizar", porque essa conclusão está fora do escopo do software.

### 7.2 Lógica da área "Uso como caução/garantia"

Esta área avalia — **sem decidir juridicamente** — a **aptidão do direito para ser oferecido como caução/garantia** em processo de terceiro (execução cível, execução fiscal/LEF, trabalhista, cautelar-recursal ou acordo). A lógica é de **triagem e levantamento**: o sistema combina as entradas em um **nível de prontidão** e **gera pendências**, apontando o que reduz o risco de recusa. Ele **não afirma** que a garantia será aceita — a aceitação depende de discricionariedade do juízo/parte contrária e **requer validação jurídica**.

#### Entradas (campos coletados por oferta de garantia)

| Campo (técnico → pt-BR) | Tipo / enum | O que captura |
|---|---|---|
| `destination_process_type` (Tipo do processo de destino) | Enum: `civil_execution` (Execução cível), `tax_execution` (Execução fiscal — LEF), `labor` (Trabalhista), `precautionary_appeal` (Cautelar/recursal), `settlement` (Acordo) | Contexto onde a garantia será usada; ambientes com preferência por dinheiro/liquidez (LEF, trabalhista) elevam o risco de recusa de direito ilíquido. |
| `debt_value` (Valor da dívida garantida) | Número + moeda | Valor-alvo que a garantia precisa cobrir. |
| `guarantee_value` (Valor estimado da garantia oferecida) | Número + moeda + grau de confiança | Valor atribuído ao direito ofertado; se litigioso, marcar baixa confiança. |
| `coverage_ratio` (% de cobertura) | Derivado: `guarantee_value / debt_value` | Cobertura do débito; abaixo do integral, tende a exigir reforço complementar. |
| `term_validity` (Prazo/validade da garantia) | Data/duração | Relevante para modalidades com validade (seguro-garantia, fiança). |
| `guarantee_remuneration` (Remuneração pelo uso como garantia) | Enum + valor/percentual | Se há prêmio/remuneração ao ofertante (liga-se ao item 16 de 7.1). |
| `rejection_risk_factors` (Fatores de risco de recusa) | Multi-enum: `litigious` (Litigioso), `illiquid` (Ilíquido), `no_transit` (Sem trânsito em julgado), `no_appraisal` (Sem laudo), `undetermined_value` (Valor indeterminado), `third_party_debtor_absent` (Sem terceiro devedor identificado) | Sinais que a jurisprudência associa a recusa; cada sinal presente rebaixa a prontidão. |
| `risk_bearer` (Quem assume o risco de recusa) | Enum: `offeror` (Ofertante/executado), `assignee` (Cessionário), `third_party` (Terceiro) + cláusula de regresso? | Registra sobre quem recai o risco se a garantia for recusada. |
| `formalization_contract` (Contrato/instrumento de cessão-vinculação) | Anexo + estado (`absent` / `draft` / `signed_with_consent`) | Formalização e anuências; sem instrumento, gera pendência. |
| `documents_to_judge` (Documentos ao juiz) | Multi-anexo: `appraisal` (Laudo de avaliação), `final_judgment` (Sentença/trânsito em julgado), `legal_opinion` (Parecer jurídico), `assignment_instrument` (Instrumento de cessão), `complementary_reinforcement` (Reforço complementar) | Mitigadores anexados que reduzem o risco de recusa. |

#### Lógica de avaliação (triagem, sem decisão jurídica)

O sistema aplica regras **transparentes e declaradas** (não decide mérito):

- **Qualidade do crédito** — deriva de `right_type`, `rejection_risk_factors` e da presença de `final_judgment`. Direito com trânsito em julgado e valor determinado sobe; litigioso/ilíquido/sem laudo desce.
- **Cobertura** — `coverage_ratio` integral (ou com reforço complementar anexado) melhora a prontidão; abaixo do alvo, gera pendência "propor reforço/deságio".
- **Ambiente processual** — `destination_process_type` em LEF/trabalhista aumenta a exigência (preferência por dinheiro/seguro/fiança); o sistema sinaliza que direito ilíquido tende a ser recusado nesses ambientes.
- **Mitigadores** — cada documento em `documents_to_judge` presente reduz o risco de recusa e "levanta" pendências correspondentes (ex.: `appraisal` presente resolve `no_appraisal`).

#### Saídas

| Saída (técnico → pt-BR) | Valores | Significado |
|---|---|---|
| `caucao_readiness_level` (Nível de prontidão para caução) | `not_apt` (Não apto no momento), `weak` (Frágil — alto risco de recusa), `mitigable` (Mitigável com pendências), `ready_for_legal_review` (Pronto para revisão jurídica) | Triagem do sistema. **Nunca** "aceito/garantido" — o teto é "pronto para revisão jurídica". |
| `generated_pendencies` (Pendências geradas) | Lista de itens acionáveis | Ex.: "anexar laudo de avaliação", "obter parecer de certeza/exigibilidade", "propor reforço complementar para cobrir deságio", "formalizar instrumento de cessão com anuência", "confirmar admissibilidade da cessão — **verificar com advogado**". |
| `rejection_risk_summary` (Resumo do risco de recusa) | Texto + fatores ativos | Explica, em linguagem comum, por que o direito pode ser recusado e o que reduziria o risco. |
| `legal_review_flag` (Sinalização de validação jurídica) | Booleano sempre `true` para conclusão | Toda saída carrega o aviso: aptidão final e aceitação **requerem validação jurídica**; o sistema apenas levanta e organiza. |

**Princípio da área:** o objetivo é transformar um direito incerto em um **dossiê organizado com pendências claras** — laudo, trânsito em julgado, parecer, instrumento formalizado e eventual reforço complementar — de modo que um advogado/consultor possa decidir com rapidez. O sistema **classifica risco e prontidão**, mas **não conclui** sobre aceitação da garantia, que permanece sempre marcada **"requer validação jurídica"**.

---

## 8. Pendências, status e matriz de risco

### 8.1 Motor de pendências automáticas

As pendencias **nao sao cadastradas a mao**. O sistema mantem um conjunto de regras que sao **reavaliadas (recalculadas) a cada mudanca** nos dados do caso, nos anexos ou nas respostas de checklist. Cada regra tem uma **condicao (gatilho)**: quando a condicao e verdadeira, a pendencia correspondente passa a existir (fica "aberta"); quando a condicao deixa de ser verdadeira (ex.: o documento foi anexado, o campo foi preenchido, a resposta virou "sim"), a pendencia **desaparece sozinha** na proxima reavaliacao. Nao ha resolucao manual silenciosa: fechar uma pendencia significa satisfazer o dado/documento que a origina.

Convencoes usadas na tabela:
- `key` = identificador tecnico da regra (ingles); rotulo pt-BR entre parenteses.
- **Severidade**: `blocker` (Bloqueante) impede avancar para `ready_for_structuring`; `high` (Alta); `medium` (Media); `info` (Informativa/lembrete).
- Campos citados (ex.: `ownership_evidence`, `process_number`) sao os dados/anexos que o cadastro do caso e os checklists ja capturam.

| Regra (key) | Condicao (gatilho a partir dos dados/checklists) | Mensagem da pendencia | Severidade |
|---|---|---|---|
| `missing_ownership_proof` (Falta comprovar titularidade) | Nao ha anexo do tipo `ownership_evidence` (extrato de posicao escritural / registro do escriturador) OU a cadeia de titularidade tem elo sem documento (falecimento sem inventario, cessao sem instrumento) | "Titularidade nao comprovada: anexe extrato do escriturador e documentos da cadeia (inventario/partilha, instrumento de cessao). Requer validacao juridica da cadeia." | blocker |
| `missing_process_number` (Falta numero do processo) | `right_type` (Tipo de direito) = `litigious` (Litigioso) E `process_number` (Numero do processo) vazio | "Direito litigioso sem numero de processo informado: cadastre o numero para permitir consulta e rastreio da fase." | high |
| `missing_legal_opinion` (Falta parecer juridico) | Nao ha anexo do tipo `legal_opinion` (Parecer juridico) sobre certeza/exigibilidade do direito | "Sem parecer juridico de certeza/exigibilidade. Requer validacao juridica antes de estruturar ou oferecer como garantia." | high |
| `missing_updated_calculation` (Falta calculo atualizado) | Nao ha anexo/registro `valuation_calc` (Calculo atualizado) OU a data do ultimo calculo e anterior ao limite de defasagem configurado (ex.: > 12 meses — verificar) | "Valor sem calculo atualizado: anexe memoria de calculo com criterio, correcao e data-base. Valor exibido e apenas indicativo." | high |
| `assignability_unverified` (Falta validar possibilidade de cessao) | Campo `assignable` (Cedivel?) = `unknown` (Nao verificado) OU direito litigioso sem confirmacao de admissibilidade da cessao | "Possibilidade de cessao/transferencia do direito nao verificada. Requer validacao juridica (cessao de direito litigioso pode exigir anuencia/procedimento)." | high |
| `legal_structure_undefined` (Falta definir estrutura juridica) | Objetivo do caso inclui `structuring` (Estruturacao) e campo `legal_structure` (Estrutura juridica) vazio (nao escolhido entre FIDC / oferta / veiculo — a definir) | "Estrutura juridica da tokenizacao nao definida (ex.: veiculo de direitos creditorios vs. oferta direta). Requer validacao juridica/assessor CVM." | medium |
| `token_meaning_undefined` (Falta definir o que o token representa) | Objetivo inclui `structuring` e campo `token_represents` (O token representa) vazio (nao classificado: direito acionario / creditorio / litigioso / cota) | "Nao esta definido o que o token representaria (direito acionario, creditorio, cota etc.). Essa definicao determina o enquadramento regulatorio." | medium |
| `regulatory_analysis_missing` (Falta analise CVM/regulatoria) | Objetivo inclui `structuring` E nao ha registro `regulatory_assessment` (Analise regulatoria) respondendo "e valor mobiliario?" e "trilho de oferta" | "Sem analise regulatoria (valor mobiliario? CVM x BCB? trilho: registro / crowdfunding / FIDC). Requer validacao juridica/assessor CVM." | high |
| `missing_collateral_contract` (Falta contrato de caucao) | Objetivo inclui `collateral` (Uso como garantia/caucao) E nao ha anexo `collateral_instrument` (Instrumento de caucao/cessao em garantia) | "Uso como garantia pretendido sem instrumento de caucao/vinculacao formalizado (com anuencias). Requer validacao juridica." | medium |
| `missing_valuation_report` (Falta laudo de avaliacao) | Objetivo inclui `collateral` OU `structuring` E nao ha anexo `valuation_report` (Laudo de avaliacao) independente | "Sem laudo de avaliacao independente do direito/credito. Reduz risco de recusa da garantia e sustenta a precificacao." | medium |
| `missing_document_custodian` (Falta custodiante documental) | Campo `document_custodian` (Custodiante documental) vazio (nao definido quem guarda/responde pelos originais e evidencias) | "Custodiante documental nao definido: indique quem guarda os originais (escriturador, cartorio, responsavel) e a evidencia de custodia." | info |
| `unverified_field_evidence` (Falta evidencia por campo) | Qualquer campo essencial marcado com `confidence` = `low` (Baixa) ou sem `source`/anexo de suporte | "Ha informacoes essenciais sem lastro documental (fonte/anexo). Reveja os campos marcados como baixa confianca." | medium |

> Observacao de design: `blocker` e `high` alimentam diretamente os criterios de entrada da maquina de estados (8.2) e os fatores da matriz de risco (8.3). Toda pendencia carrega, alem da mensagem, o **link para o campo/anexo** que a resolve e a marca "requer validacao juridica" quando aplicavel.

### 8.2 Modelo de status do caso (máquina de estados)

O `status` do caso e, em grande parte, **derivado das pendencias abertas** (8.1): o sistema **sugere** a transicao apropriada sempre que recalcula pendencias, mas transicoes com efeito de decisao (declarar apto, marcar nao apto, arquivar) sao sempre **confirmadas manualmente** por um usuario. Nenhuma transicao afirma merito juridico — "apto para estruturacao" significa apenas "o levantamento documental esta completo o suficiente para as proximas etapas", nao que a tokenizacao/garantia e juridicamente viavel.

| Status (key) | Rotulo pt-BR | Significado | Criterios de entrada (condicoes/pendencias) | Modo |
|---|---|---|---|---|
| `new` | Novo | Caso recem-criado; dados minimos ainda nao consolidados. | Estado inicial na criacao do caso. | inicial |
| `docs_incomplete` | Documentacao incompleta | Faltam documentos/dados essenciais (titularidade, processo, anexos base). | Ha pendencia `blocker` aberta (ex.: `missing_ownership_proof`) ou multiplas pendencias `high` de documentacao. | derivado |
| `legal_review` | Em analise juridica | Documentacao base reunida; aguarda avaliacao juridica (cessao, estrutura, regulatorio). | Sem `blocker`; existem pendencias que "requerem validacao juridica" abertas (`assignability_unverified`, `regulatory_analysis_missing`, `missing_legal_opinion`). | derivado |
| `awaiting_calculation` | Aguardando calculo | Pendencia principal e o valor atualizado do direito. | `missing_updated_calculation` aberta e sem `blocker` documental. | derivado |
| `awaiting_opinion` | Aguardando parecer | Base e calculo prontos; falta o parecer juridico formal. | `missing_legal_opinion` aberta, com `missing_updated_calculation` ja resolvida. | derivado |
| `ready_for_structuring` | Apto para estruturacao | Levantamento documental completo; sem pendencias bloqueantes nem `high` abertas. | Nenhuma pendencia `blocker` ou `high` aberta. Definidos `token_represents`, `legal_structure`, `regulatory_assessment`. | confirmado |
| `ready_with_caveats` | Apto com ressalvas | Suficiente para seguir, porem com ressalvas registradas (pendencias `medium`/`info` remanescentes). | Sem `blocker`/`high`, mas restam pendencias `medium`/`info` explicitamente aceitas como ressalva. | confirmado |
| `not_eligible` | Nao apto | Levantamento indica impedimento relevante (ex.: titularidade nao comprovavel, cessao inadmissivel — requer validacao juridica). | Decisao manual apos analise; normalmente com `blocker` que nao pode ser resolvido. | confirmado |
| `archived` | Arquivado | Caso encerrado/suspenso; fora do fluxo ativo. | Decisao manual a partir de qualquer status. | confirmado |

#### Transições possíveis

| De → Para | Gatilho | Automatica (sugerida) x Manual |
|---|---|---|
| `new` → `docs_incomplete` | Primeira reavaliacao encontra pendencias essenciais abertas. | Automatica |
| `new` → `legal_review` | Documentos base ja anexados na criacao; sem `blocker`. | Automatica |
| `docs_incomplete` → `legal_review` | Pendencias `blocker`/documentais resolvidas; restam pendencias juridicas. | Automatica |
| `legal_review` → `awaiting_calculation` | Questoes juridicas encaminhadas; abre `missing_updated_calculation`. | Automatica |
| `awaiting_calculation` → `awaiting_opinion` | Calculo anexado; resta `missing_legal_opinion`. | Automatica |
| `awaiting_opinion` → `ready_for_structuring` | Parecer anexado; nenhuma pendencia `blocker`/`high` aberta. | Automatica (sugerida) + confirmacao manual |
| qualquer → `ready_with_caveats` | Sem `blocker`/`high`; usuario aceita ressalvas `medium`/`info`. | Manual |
| qualquer → `not_eligible` | Analise conclui impedimento relevante (requer validacao juridica). | Manual |
| qualquer → `docs_incomplete` | Uma reavaliacao volta a abrir pendencia `blocker` (ex.: anexo removido/invalidado). | Automatica (regressao) |
| qualquer → `archived` | Encerramento/suspensao pelo usuario. | Manual |
| `archived` → status anterior | Reabertura do caso. | Manual |

> Regra geral: **avancos rumo a "apto" que carregam decisao** (`ready_for_structuring`, `ready_with_caveats`, `not_eligible`, `archived`) exigem confirmacao manual; **regressoes** disparadas por reaparecimento de pendencia sao automaticas, para o status nunca "mentir" sobre a completude real do caso.

### 8.3 Matriz de risco

O sistema calcula um **risco juridico indicativo** — `low` (Baixo), `medium` (Medio), `high` (Alto) ou `undetermined` (Indeterminado) — combinando fatores derivados dos dados/anexos/checklists. **Este score e organizacional, nao um parecer**: serve para priorizar o levantamento e sinalizar onde falta validacao. Todo fator que dependa de avaliacao juridica carrega a marca "requer validacao juridica".

Regra de agregacao (qualitativa):
- Qualquer fator com valor **`unknown` (Nao verificado)** em dimensao essencial (titularidade, cessao, fase processual) puxa o resultado para **`undetermined` (Indeterminado)** — o sistema nao "chuta" risco baixo sobre incerteza.
- Predominancia de fatores desfavoraveis de alto peso → **`high`**; fatores majoritariamente favoraveis e sem `unknown` essencial → **`low`**; combinacoes intermediarias → **`medium`**.

| Fator (key) | Rotulo pt-BR | Como o sistema le (fonte) | Direcao favoravel (reduz risco) | Direcao desfavoravel (aumenta risco) | Peso qualitativo |
|---|---|---|---|---|---|
| `ownership_proven` | Titularidade comprovada | Anexos de titularidade + cadeia completa (8.1 `missing_ownership_proof`) | Comprovada e sem elos abertos | Nao comprovada / cadeia com lacuna | Muito alto |
| `procedural_phase` | Fase processual / transito em julgado | `right_type` + fase do processo (inicial / sentenca / transito em julgado) | Transito em julgado ou fase avancada | Litigioso em fase inicial / sem processo | Alto |
| `prescription_risk` | Risco de prescricao/decadencia | Campo `prescription_check` (a checar — requer validacao juridica) | Sem indicio de prescricao (verificado) | Indicio de prazo vencido / `unknown` | Alto |
| `liquidity` | Liquidez do direito | Campo `liquidity_status` (remanescente/liquido, condicional, litigioso) | Remanescente e liquido | Ilíquido / condicional / litigioso | Alto |
| `assignability` | Possibilidade de cessao | Campo `assignable` (8.1 `assignability_unverified`) | Cedivel confirmado (com validacao) | Inadmissivel / `unknown` | Alto |
| `case_law_alignment` | Alinhamento jurisprudencial | Campo `jurisprudence_note` (favoravel/desfavoravel/incerta — requer validacao juridica) | Tese com jurisprudencia favoravel | Tese controvertida / desfavoravel | Medio |
| `amount_materiality` | Materialidade do valor | `valuation_calc` + faixa de valor | Valor determinado e lastreado | Valor alto porem indeterminado/sem calculo | Medio |
| `regulatory_fit` | Enquadramento regulatorio | `regulatory_assessment` (valor mobiliario? trilho?) | Trilho definido e coerente (com assessor) | Indefinido / provavel valor mobiliario de alto risco | Medio |
| `document_evidence` | Evidencia documental geral | Proporcao de campos com `confidence` alta e `source` (8.1 `unverified_field_evidence`) | Maioria dos campos com lastro | Muitos campos em baixa confianca | Medio |

> Leitura combinada: um caso de **direito litigioso em fase inicial, titularidade com lacuna e cessao nao verificada** tende a `high` ou `undetermined`; um **direito remanescente e liquido, titularidade comprovada e sem indicio de prescricao** tende a `low`. Qualquer classificacao envolvendo dimensao juridica essencial e apresentada com a ressalva **"requer validacao juridica"** e nunca substitui parecer.

---

## 9. Relatórios (tela + modelos + modelo final)

Esta seção especifica o módulo de **Relatórios** — a superfície que transforma o levantamento documental de um caso em documentos legíveis, exportáveis e compartilháveis com advogados, consultores, tokenizadores e parceiros. Todos os relatórios são **derivados** dos dados já cadastrados (caso, processos, documentos, checklists, riscos, pendências); o módulo não coleta dado novo — ele **compõe, calcula percentuais e formata**. Sem login, sem pagamento, sem blockchain.

> **Aviso transversal (repetido em todo relatório gerado):** este é um material de **organização documental e levantamento**, não peça jurídica nem parecer. Todo item que dependa de avaliação jurídica/regulatória aparece como **pergunta/campo levantado** com marcação `requer validação jurídica`; conclusões de mérito, valores e titularidade só constam com lastro documental e sempre acompanhados do grau de confiança.

### 9.1 Tela de Relatórios (fluxo e comportamento)

Fluxo linear em 3 passos, sem estado persistente de "documento gerado" (o relatório é sempre recomposto a partir dos dados atuais do caso — evita relatório desatualizado):

| Passo | Rótulo de tela (pt-BR) | Comportamento |
|---|---|---|
| 1 | **Selecionar caso** | Busca/lista de casos por `case_code` (Código do caso), `holder_name` (Titular) e `status` (Situação). Ao escolher, mostra um cartão-resumo (titular, nº de processos, % documental, status) para confirmar antes de gerar. |
| 2 | **Escolher tipo de relatório** | Grade com os 8 tipos (9.3 a 9.10). Cada card traz título, 1 linha de "para que serve" e "público-alvo". Tipos que exigem dados ainda ausentes aparecem habilitados, mas sinalizam no preview quais seções sairão marcadas como pendentes. |
| 3 | **Gerar / Exportar** | Renderiza o relatório **em tela** (visualização paginada) e oferece **Exportar PDF**. Botão secundário **Copiar link de visualização** (link read-only para a tela do relatório, sem edição). |

**Formatos de saída**

| Formato | Rótulo de tela | Observação |
|---|---|---|
| `screen_view` | **Visualizar em tela** | Renderização HTML paginada; padrão. |
| `pdf_export` | **Exportar PDF** | Layout de impressão (capa + cabeçalho/rodapé com `case_code`, data de geração e nº de página). |

**Opções comuns de geração** (aplicáveis a qualquer tipo, na tela do passo 3):

| Chave técnica | Rótulo de tela (pt-BR) | Efeito |
|---|---|---|
| `include_evidence` | Incluir evidências (fonte/documento por afirmação) | Anexa fonte, documento e data a cada afirmação levantada. |
| `include_confidence` | Incluir grau de confiança por campo | Mostra `confidence_level` (Alto/Médio/Baixo/A verificar) ao lado de cada dado. |
| `include_pending_only` | Mostrar apenas pendências | Filtra o corpo para itens em aberto (útil no checklist). |
| `anonymize` | Anonimizar dados pessoais (LGPD) | Mascara CPF/nomes de terceiros ao compartilhar externamente. |
| `report_language_note` | Nota de finalidade e aviso legal | Sempre `true`, não desmarcável; garante o aviso em todo export. |

**Metadados carimbados em todo relatório** (cabeçalho/rodapé): `case_code`, `generated_at` (Data/hora de geração), `report_type`, `report_version` (recomputado), `data_completeness_pct` (% documental no momento). O relatório **não** é assinado nem tem valor probatório declarado — é insumo de trabalho.

### 9.2 Visão geral dos 8 relatórios

| # | Entidade / chave técnica | Título de tela (pt-BR) | Público-alvo | Para que serve (resumo) |
|---|---|---|---|---|
| 1 | `full_case_report` | Relatório completo do caso | Interno / todos | Retrato integral do caso — base para os demais. |
| 2 | `pending_checklist` | Checklist de pendências | Interno / operador | Lista acionável do que falta fazer/coletar. |
| 3 | `executive_summary` | Resumo executivo | Decisor / cliente | 1–2 páginas: onde o caso está e se vale avançar. |
| 4 | `risk_matrix` | Matriz de riscos | Interno / consultor | Riscos priorizados por probabilidade × impacto. |
| 5 | `missing_documents_list` | Lista de documentos faltantes | Operador / titular | O que coletar, de quem, para fechar o dossiê. |
| 6 | `lawyer_report` | Relatório para advogado | Advogado | Foco jurídico/processual: teses, provas, prazos a verificar. |
| 7 | `tokenization_partner_report` | Relatório para parceiro de tokenização | Tokenizador / estruturador | Viabilidade de estruturação e enquadramento regulatório. |
| 8 | `collateral_analysis_report` | Relatório para análise de uso como caução | Advogado / credor / parte | Aptidão do direito para servir de garantia processual. |

### 9.3 Relatório completo do caso (`full_case_report`)

**Para que serve:** retrato integral e autocontido do caso, reunindo tudo que foi levantado; é a base da qual os outros relatórios são recortes. Ver **modelo final** em 9.11.

**Estrutura (seções):**

| Seção | Conteúdo |
|---|---|
| Capa / identificação | `case_code`, `holder_name`, data de geração, `status`, `data_completeness_pct`. |
| Dados do caso | Titular, classe(s) de ação (ON/PN/PNA/PNB), tipo(s) de direito, cadeia de titularidade, `liquidity_status`. |
| Processos | Lista de `processes` com fase e `third_party_debtor`. |
| Situação documental | % completo, documentos presentes/ausentes por categoria. |
| Checklist jurídico | Respostas ao checklist de garantia (com `requer validação jurídica`). |
| Checklist regulatório | Respostas de enquadramento (CVM/BCB/LGPD/PLD-FT). |
| Checklist de tokenização | Pré-requisitos de estruturação. |
| Avaliação de caução | Aptidão como garantia + mitigadores. |
| Pendências abertas | Itens em aberto com responsável e prazo a verificar. |
| Matriz de risco | Riscos priorizados. |
| Status e próximos passos | Situação atual + ações recomendadas. |
| Aviso legal | Finalidade e limites. |

### 9.4 Checklist de pendências (`pending_checklist`)

**Para que serve:** lista **acionável** e priorizada de tudo que falta — documento, verificação jurídica, dado a confirmar — para o operador tocar o caso. É o "o que fazer agora".

**Estrutura:**

| Campo | Rótulo (pt-BR) | Descrição |
|---|---|---|
| `pending_id` | Código | Identificador da pendência. |
| `category` | Categoria | `documental` / `legal` / `regulatory` / `tokenization` / `collateral`. |
| `description` | Descrição | O que falta, em linguagem de ação. |
| `blocking` | Bloqueante | Se impede avançar (ex.: sem cadeia de titularidade não há caso). |
| `owner` | Responsável | Operador / titular / advogado / escriturador (a confirmar). |
| `due_note` | Prazo | Texto livre; prazos legais marcados `verificar`. |
| `evidence_needed` | Evidência esperada | Documento/fonte que encerra a pendência. |
| `status` | Situação | `open` (Aberta) / `in_progress` (Em andamento) / `resolved` (Resolvida). |

Agrupamento por `category`; ordenação por `blocking` (bloqueantes primeiro). Suporta opção `include_pending_only`.

### 9.5 Resumo executivo (`executive_summary`)

**Para que serve:** visão de 1–2 páginas para decisor/cliente responder "onde estamos e vale a pena avançar?", sem detalhe técnico.

**Estrutura:**

| Seção | Conteúdo |
|---|---|
| Identificação | `case_code`, `holder_name`, `status`. |
| Situação em uma frase | Síntese do estágio (ex.: "posição a confirmar; documentação 40% completa"). |
| Indicadores-chave | `data_completeness_pct`, nº de processos, nº de pendências bloqueantes, nível de risco geral, `liquidity_status`. |
| Aptidões (semáforo) | Tokenização: pronto/parcial/inviável a verificar · Caução: idem — cada um com 1 linha de justificativa. |
| Principais riscos | Top 3 da matriz. |
| Recomendação | Avançar / aprofundar levantamento / não recomendado no momento — com ressalva `requer validação jurídica`. |

### 9.6 Matriz de riscos (`risk_matrix`)

**Para que serve:** consolidar e priorizar os riscos do caso por `probability` × `impact`, para direcionar mitigação.

**Estrutura (por linha de risco):**

| Campo | Rótulo (pt-BR) | Valores |
|---|---|---|
| `risk_id` | Código | — |
| `risk_category` | Categoria | `titularidade` / `liquidez` / `processual` / `regulatorio` / `documental` / `prescricao` |
| `description` | Descrição | Enunciado do risco. |
| `probability` | Probabilidade | `low` (Baixa) / `medium` (Média) / `high` (Alta). |
| `impact` | Impacto | `low` / `medium` / `high`. |
| `severity` | Severidade | Derivada (prob × impacto): `low`/`medium`/`high`/`critical`. |
| `mitigation` | Mitigação | Ação que reduz o risco (ex.: obter laudo, trânsito em julgado). |
| `needs_legal_review` | Requer validação jurídica | Boolean. |

Complementos: **mapa de calor** 3×3 (probabilidade × impacto) e ordenação por `severity` desc.

### 9.7 Lista de documentos faltantes (`missing_documents_list`)

**Para que serve:** recorte documental puro — o que coletar, de quem, para fechar o dossiê e subir o `data_completeness_pct`.

**Estrutura:**

| Campo | Rótulo (pt-BR) | Descrição |
|---|---|---|
| `doc_category` | Categoria | `titularidade` / `societaria` / `sucessoria` / `cessao` / `processual` / `avaliacao`. |
| `doc_type` | Documento | Ex.: extrato do escriturador, certidão de inventário, instrumento de cessão, sentença. |
| `why_needed` | Por que é necessário | O que esse documento comprova/desbloqueia. |
| `source` | Onde obter | Escriturador/custodiante, cartório, juízo, titular (a confirmar). |
| `criticality` | Criticidade | `essencial` / `desejavel`. |
| `status` | Situação | `missing` (Faltante) / `requested` (Solicitado) / `received` (Recebido). |

Rodapé com contagem: essenciais faltantes vs. total, e impacto no `data_completeness_pct`.

### 9.8 Relatório para advogado (`lawyer_report`)

**Para que serve:** entregar ao advogado o recorte jurídico/processual — teses sustentadas, provas disponíveis, lacunas e pontos que **exigem** avaliação jurídica — sem que o software conclua mérito.

**Estrutura:**

| Seção | Conteúdo |
|---|---|
| Identificação e partes | Titular, espólio/herdeiros, cessionário, escriturador. |
| Direito(s) alegado(s) e tese | `right_type` (acionário/creditório/litigioso) e a tese que o sustenta (relação de troca, critério de valor, subscrição, expurgos) — **registrada, não julgada**. |
| Classe da ação e posição | ON/PN/PNA/PNB e reflexo na relação de troca. |
| Processos | `processes`: fase, `third_party_debtor`, existência de título/sentença/trânsito em julgado. |
| Qualidade do crédito | Certeza / liquidez / exigibilidade — cada uma como campo levantado, `requer validação jurídica`. |
| Provas disponíveis vs. faltantes | Cruzamento com a lista de documentos. |
| Pontos a verificar | Prescrição/decadência, admissibilidade de cessão, condição/termo pendente — todos `verificar`. |
| Aviso legal | Não é parecer. |

### 9.9 Relatório para parceiro de tokenização (`tokenization_partner_report`)

**Para que serve:** dar ao estruturador/tokenizador o material para julgar **viabilidade de estruturação** e **enquadramento regulatório** — sem afirmar que o direito é tokenizável, apenas mapeando pré-requisitos e lacunas.

**Estrutura:**

| Seção | Conteúdo |
|---|---|
| Natureza do direito subjacente | Tipo, classe, `liquidity_status`; se litigioso/indeterminado, destacar risco de não-materialização. |
| Enquadramento regulatório (perguntas) | É valor mobiliário? (teste CIC) → CVM · trilho de oferta (Res. 160 / Res. 88 / FIDC-Res. 175) · é VASP? → BCB · LGPD · PLD-FT — **todos como campo/pergunta**, `requer validação jurídica / assessor CVM`. |
| Metodologia de valuation (a definir) | Premissas, dependência de desfecho, gatilhos de baixa. |
| Elegibilidade de público | Varejo vs. profissional; restrição por alto risco. |
| Pré-requisitos de estruturação | Lastro verificável, cadeia de titularidade limpa, cessão válida, documentação completa. |
| Lacunas bloqueantes | O que impede estruturar hoje. |
| Aviso legal | Enquadramento depende da essência econômica; `verificar`. |

### 9.10 Relatório para análise de uso como caução (`collateral_analysis_report`)

**Para que serve:** avaliar a **aptidão do direito para servir de garantia** em processo de terceiro (execução cível/fiscal/trabalhista/acordo), com os mitigadores que reduzem risco de recusa — sempre como levantamento, nunca como garantia de aceitação.

**Estrutura:**

| Seção | Conteúdo |
|---|---|
| Natureza do direito ofertado | Tipo, terceiro devedor, fase processual do crédito de origem. |
| Qualidade do crédito | Certeza / liquidez / exigibilidade — `requer validação jurídica`. |
| Processo de destino | `execução cível` / `execução fiscal (LEF)` / `trabalhista` / `acordo`; exige garantia integral? valor-alvo. |
| Modalidade e formalização | Caução real/fidejussória, depósito, seguro-garantia, fiança bancária; instrumento de cessão/anuências. |
| Mitigadores de recusa | Laudo de avaliação, trânsito em julgado, parecer jurídico, deságio proposto, reforço complementar. |
| Risco e responsabilidade | Quem oferta / quem assume risco de recusa; impacto em prazos (embargos, efeito suspensivo). |
| Prognóstico de aceitação (qualitativo) | Alto/médio/baixo risco de recusa **com justificativa e ressalva** `requer validação jurídica`. |
| Aviso legal | Direito ilíquido/litigioso tende a ser recusado; verificar caso a caso. |

### 9.11 MODELO DE RELATÓRIO FINAL — Relatório completo do caso

Modelo detalhado do `full_case_report`, na ordem de leitura. Valores entre `‹ ›` são preenchidos a partir dos dados do caso; onde ausentes, o relatório imprime **"— a levantar —"**.

---

#### Capa / Identificação

| Campo | Valor |
|---|---|
| Código do caso (`case_code`) | ‹ex.: BESC-2026-0001› |
| Titular (`holder_name`) | ‹nome / — a levantar —› |
| Situação (`status`) | ‹ex.: docs_incomplete (Documentação incompleta)› |
| % documental (`data_completeness_pct`) | ‹ex.: 45%› |
| Data/hora de geração (`generated_at`) | ‹automático› |
| Versão do relatório (`report_version`) | ‹recomputado› |
| Finalidade | Levantamento documental — não é peça jurídica. |

#### 1. Dados do caso

| Campo | Valor |
|---|---|
| Titular original | ‹...› |
| Titular atual (`current_holder`) | ‹... / a confirmar› + `confidence_level` |
| Classe(s) de ação | ‹ON / PNA / PNB — verificar no estatuto da época› |
| Tipo(s) de direito (`right_type`) | ‹acionário remanescente / creditório / litigioso› |
| Situação de liquidez (`liquidity_status`) | ‹remanescente-líquido / ilíquido-condicional / litigioso› |
| Cadeia de titularidade | ‹titular → espólio/inventário → cessionário› + evidências |

#### 2. Processos

| `process_ref` | Tipo | Fase (`stage`) | Terceiro devedor | Título/Sentença/Trânsito | Evidência |
|---|---|---|---|---|---|
| ‹...› | ‹cível/fiscal/trabalhista› | ‹inicial/sentença/trânsito em julgado — verificar› | ‹sim/não/quem› | ‹...› | ‹doc/fonte› |

> Sem afirmar mérito: registra-se a **tese sustentada** por processo, não o resultado.

#### 3. Situação documental

- **% completo (`data_completeness_pct`):** ‹45%›
- **Presentes por categoria:** ‹titularidade ✓ · societária ✓ · sucessória ✗ · cessão ✗ · processual parcial›

| Documento faltante | Categoria | Criticidade | Onde obter | Situação |
|---|---|---|---|---|
| ‹certidão de inventário› | sucessoria | essencial | cartório (a confirmar) | missing (Faltante) |
| ‹instrumento de cessão› | cessao | essencial | titular/cessionário | missing (Faltante) |
| ‹extrato do escriturador› | titularidade | essencial | escriturador/custodiante | requested (Solicitado) |

#### 4. Checklist jurídico (respostas)

| Item | Resposta levantada | Evidência | Marcação |
|---|---|---|---|
| Natureza do direito ofertado | ‹litigioso› | ‹...› | — |
| Há terceiro devedor identificado? | ‹sim/não — a levantar› | ‹...› | requer validação jurídica |
| Fase processual do crédito | ‹sentença — verificar› | ‹...› | verificar |
| Certeza (há título/decisão?) | ‹a levantar› | ‹...› | requer validação jurídica |
| Liquidez (valor determinável?) | ‹a levantar› | ‹...› | requer validação jurídica |
| Exigibilidade (condição/recurso pendente?) | ‹a levantar› | ‹...› | requer validação jurídica |
| Admissibilidade da cessão | ‹a levantar› | ‹...› | requer validação jurídica |
| Prescrição/decadência | ‹a levantar› | ‹...› | verificar |

#### 5. Checklist regulatório (respostas)

| Item | Resposta levantada | Marcação |
|---|---|---|
| É valor mobiliário? (teste CIC — investimento coletivo, expectativa de retorno por esforço de terceiro) | ‹a levantar› | requer validação jurídica / assessor CVM |
| Competência: CVM (valor mobiliário) vs BCB (ativo virtual) | ‹a definir› | verificar |
| Trilho de oferta: Res. 160 (registro) / Res. 88 (crowdfunding) / FIDC-Res. 175 | ‹a definir› | verificar limites vigentes |
| É VASP? (Lei 14.478/2022) | ‹a levantar› | verificar |
| LGPD — base legal, PII off-chain | ‹a levantar› | requer validação jurídica |
| PLD-FT / COAF — KYC/KYT | ‹a levantar› | verificar |
| Tributação (ganho de capital / regime do instrumento) | ‹a levantar› | verificar com contador |

#### 6. Checklist de tokenização (pré-requisitos)

| Pré-requisito | Situação | Marcação |
|---|---|---|
| Lastro verificável (originação/direito comprovado) | ‹a levantar› | — |
| Cadeia de titularidade limpa | ‹incompleta› | bloqueante |
| Cessão válida (se aplicável) | ‹a levantar› | requer validação jurídica |
| Documentação completa (`data_completeness_pct` alvo) | ‹45% — abaixo do alvo› | — |
| Metodologia de valuation definida | ‹não definida› | — |
| Enquadramento regulatório resolvido | ‹pendente› | requer validação jurídica / assessor CVM |

#### 7. Avaliação de caução (uso como garantia)

| Dimensão | Levantamento | Marcação |
|---|---|---|
| Processo de destino | ‹execução fiscal (LEF) / trabalhista / cível / acordo — a definir› | — |
| Exige garantia integral do juízo? | ‹a verificar› | verificar |
| Qualidade (certeza/liquidez/exigibilidade) | ‹baixa — direito litigioso› | requer validação jurídica |
| Modalidade e formalização | ‹caução real sobre o crédito — a formalizar› | — |
| Mitigadores presentes | ‹laudo? ✗ · trânsito em julgado? ✗ · parecer? ✗ · reforço? ✗› | — |
| Prognóstico qualitativo de aceitação | ‹alto risco de recusa (direito ilíquido)› | requer validação jurídica |

#### 8. Pendências abertas

| Código | Categoria | Descrição | Bloqueante | Responsável | Evidência esperada | Situação |
|---|---|---|---|---|---|---|
| ‹P-01› | documental | Obter certidão de inventário | Sim | titular (a confirmar) | certidão | open (Aberta) |
| ‹P-02› | legal | Confirmar admissibilidade da cessão | Sim | advogado | parecer | open (Aberta) |
| ‹P-03› | regulatory | Definir enquadramento CVM/BCB | Não | assessor CVM | análise | open (Aberta) |

#### 9. Matriz de risco

| Código | Categoria | Descrição | Prob. | Impacto | Severidade | Mitigação | Val. jurídica |
|---|---|---|---|---|---|---|---|
| ‹R-01› | titularidade | Titular atual incerto (sem cadeia completa) | Alta | Alto | crítica | Obter inventário/cessão | sim |
| ‹R-02› | liquidez | Direito litigioso pode não se materializar | Média | Alto | alta | Trânsito em julgado / laudo | — |
| ‹R-03› | regulatorio | Enquadramento indefinido (CVM vs BCB) | Média | Médio | média | Consulta a assessor CVM | sim |
| ‹R-04› | prescricao | Prazo pode afetar exigibilidade | ‹a verificar› | Alto | ‹a verificar› | Verificar prazos | sim |

**Mapa de calor (probabilidade × impacto):** grade 3×3 posicionando R-01…R-04, ordenada por severidade.

#### 10. Status e próximos passos

| Item | Conteúdo |
|---|---|
| Situação atual (`status`) | ‹docs_incomplete (Documentação incompleta)› |
| Bloqueantes ativos | ‹2 pendências bloqueantes› |
| Próximos passos (ordenados) | 1) coletar documentos essenciais faltantes · 2) fechar cadeia de titularidade · 3) obter parecer sobre cessão/exigibilidade · 4) definir enquadramento regulatório com assessor CVM |
| Aptidão atual — Tokenização | ‹parcial — bloqueada por titularidade e enquadramento› |
| Aptidão atual — Caução | ‹baixa — direito ilíquido sem mitigadores› |

#### Aviso legal

> Este relatório é produto de **levantamento e organização documental**. **Não** constitui peça jurídica, parecer, laudo de avaliação nem recomendação de investimento. Titularidade, valores e situação de liquidez constam apenas com o grau de confiança indicado e o respectivo lastro documental; itens marcados **`requer validação jurídica`**, **`assessor CVM`** ou **`verificar`** dependem de análise profissional e de confirmação em fonte primária (Diário Oficial, atas, fatos relevantes, autos processuais). Números de lei/artigo, prazos, limites regulatórios e relações de troca citados são **genéricos e sujeitos a confirmação**. Nenhuma afirmação deste documento deve ser tratada como conclusão de mérito, garantia de aceitação de caução ou de viabilidade de tokenização.

---

## 10. MVP, arquitetura e roadmap

### 10.1 Recomendação de MVP — o menor recorte útil primeiro

O objetivo do MVP é entregar **valor cedo**: permitir que um advogado ou consultor **cadastre um caso, organize os documentos e gere um relatório consolidado** já na primeira onda — mesmo antes de existir qualquer automação de pendências, risco ou tokenização. A regra de fatiamento é: **primeiro captura e organização; depois inteligência; depois especializações; por último caução e relatórios avançados.**

#### Fatiamento em ondas

| Onda | Escopo | Entrega de valor |
|---|---|---|
| **Onda 1 — Núcleo de captura** | Cadastro do caso (`case`), cadastro do processo (`legal_process`), checklist documental básico, tela principal/lista (`case_list`), detalhe básico do caso (`case_detail`), geração do **"Relatório completo do caso"** (`full_case_report`) | Um caso pode ser inteiramente registrado e **exportado num relatório único** para revisão humana. Já substitui planilha + pasta de documentos solta. |
| **Onda 2 — Inteligência de estado** | Pendências automáticas (`auto_pending`), modelo de status do caso (`case_status`), matriz de risco (`risk_matrix`) | O sistema passa a **apontar sozinho** o que falta e a classificar maturidade/risco — deixa de ser só um repositório e vira ferramenta de triagem. |
| **Onda 3 — Checklists especializados** | Checklist jurídico (`legal_checklist`), regulatório/CVM-BCB (`regulatory_checklist`), tokenização (`tokenization_checklist`) | Cada frente (jurídica, regulatória, estruturação) ganha seu roteiro próprio de verificação, com itens marcáveis e campo "requer validação jurídica". |
| **Onda 4 — Caução e relatórios avançados** | Área de caução/garantia (`collateral_assessment`), demais relatórios (escopo de tokenização, laudo de pendências, sumário de risco) | Fecha o segundo objetivo do produto (uso como garantia processual) e entrega os relatórios derivados para parceiros/tokenizadores. |

#### Por que essa ordem

- **Onda 1 é auto-suficiente e testável isolada**: com cadastro + checklist + relatório, o usuário já tira o caso do papel/planilha. É o menor recorte que alguém usaria de verdade.
- **Inteligência (Onda 2) depende dos dados existirem primeiro**: pendências automáticas e matriz de risco só fazem sentido lendo campos já preenchidos na Onda 1. Construí-las antes seria arquitetar sobre o vazio.
- **Checklists especializados (Onda 3) são aditivos**: cada um é um módulo independente que não bloqueia o núcleo; podem ser liberados um a um conforme validação jurídica de cada roteiro.
- **Caução (Onda 4) é o caso de uso mais avançado e o que mais depende de validação jurídica** — naturalmente por último, apoiado em todo o levantamento anterior.

#### O que NÃO entra no MVP

- Login, contas de usuário, perfis, RBAC (produto é **sem login** por definição).
- Qualquer integração real de blockchain, emissão/custódia de token, carteira ou smart contract.
- Pagamento, cobrança, faturamento.
- Assinatura eletrônica de documentos.
- Integrações externas automáticas (consulta a tribunais, escriturador, CVM, RFB) — na Onda 1 tudo é **entrada manual**.
- Cálculo automático de valor/valuation do direito, relação de troca ou correção monetária (o sistema **registra** o que foi informado; não calcula mérito).
- Multiusuário simultâneo com colaboração/trilha de auditoria fina — fica para pós-MVP.

---

### 10.2 Arquitetura sugerida na plataforma DevOps local

App **`besc`** servido em **`/besc`**, **sem login**, seguindo a regra de ouro de roteamento por path da plataforma.

#### Serviços

| Serviço | Tipo | Path | stripPrefix | Papel |
|---|---|---|---|---|
| `frontend` | frontend (SPA) | `/` | **false** | SPA (ex.: Vite/React) buildada com base path `/besc/`; servida no subpath, sem strip. IngressRoute com **priority menor**. |
| `api` | api | `/api` | **true** | API REST (ex.: Node/Express). Middleware StripPrefix remove `/besc/api` → a app vê rotas na raiz. **Priority maior** que o frontend. |
| `worker` (opcional) | worker | — | true (health) | Geração de PDF dos relatórios de forma assíncrona. Só se a geração pesar; no MVP o `api` pode gerar o relatório em HTML/print direto. |

#### Persistência

Manter **simples e coerente com "sistema sem login"**:

- **Recomendado: Postgres** (namespace `apps`), pela robustez e por já ser padrão na plataforma — modela caso, processo, documentos, checklist e risco com relacionamentos limpos.
- **Alternativa mais enxuta: SQLite** (arquivo em volume persistente) se o objetivo for o mínimo operacional absoluto e baixíssimo volume. Trade-off: menos concorrência e backup mais artesanal.
- Documentos/anexos: metadados no banco; binários em volume persistente (ou storage de objetos futuramente). **Não** guardar binário grande dentro de linha do banco.

#### Contrato `devops.yaml` (esboço)

```yaml
app: { name: besc, namespace: apps, host: nvit.localhost, basePath: /besc }
services:
  frontend:
    type: frontend
    path: /
    image: besc-frontend        # laboratório: :local
    port: 80
    expose: true
    stripPrefix: false
    priority: 10
  api:
    type: api
    path: /api
    image: besc-api             # laboratório: :local
    port: 3000
    expose: true
    stripPrefix: true
    priority: 30
    health: { path: /health }
```

#### Convenções da plataforma

- **Imagens no laboratório**: `besc-frontend:local` / `besc-api:local` com `imagePullPolicy: IfNotPresent` (sem registry). CI publica no GHCR (`ghcr.io/flavioneto11/besc/<svc>`) quando promovido.
- **Labels**: todo recurso leva `app.kubernetes.io/part-of: besc` (o DevOps Console agrupa por isso na aba **Apps**).
- **Base path do frontend**: build com `VITE_BASE_PATH=/besc/` (e `<base href="/besc/">`) para os assets resolverem sob o subpath.
- **Validação**: `http://nvit.localhost/besc` (SPA) e `http://nvit.localhost/besc/api/health` (API pós-strip).
- **Onboarding**: `scripts/new-app.ps1 -Name besc -Services frontend,api` gera contrato + Dockerfiles + `k8s/` + Application do Argo no padrão.

---

### 10.3 LGPD, segurança e cuidados

O sistema guarda **dados pessoais e potencialmente sensíveis** — CPF, documentos de identidade, documentação sucessória (inventário/partilha), instrumentos de cessão, dados patrimoniais e financeiros de titulares e herdeiros. **Não ter login não elimina o dever de proteção** dos dados tratados.

#### Cuidados mínimos (mesmo sem login)

| Cuidado | O que fazer |
|---|---|
| **Não expor publicamente** | Mesmo sem login, o app **não** deve ficar aberto na internet sem controle. No laboratório, manter acesso restrito por **rede** (host local `nvit.localhost` / rede interna / VPN / túnel controlado). "Sem login" ≠ "público". Antes de qualquer exposição externa, **reavaliar necessidade de autenticação**. |
| **Minimização** | Coletar só o necessário para o levantamento. Evitar campos de dado sensível que não sustentem o objetivo documental. |
| **Retenção** | Definir por quanto tempo os dados de um caso ficam armazenados e um procedimento para descarte ao fim do uso — marcar como **campo/política a definir** (requer validação jurídica). |
| **Exportação** | Permitir exportar os dados de um caso (relatório + anexos) para portabilidade e para atender pedido do titular. |
| **Exclusão** | Permitir **excluir** um caso e seus dados/anexos de forma efetiva (não só marcar como inativo), atendendo direito de eliminação do titular. |
| **Aviso ao usuário** | Exibir na interface um **aviso de privacidade** claro: quais dados são tratados, finalidade (levantamento documental) e que o preenchimento pressupõe base legal adequada para o tratamento. |
| **Trilha mínima** | Registrar ao menos data de criação/alteração dos registros para rastreabilidade básica (sem virar sistema de auditoria fina no MVP). |

#### Aviso legal (reforço)

Este software é ferramenta de **organização e levantamento documental** — **não é peça jurídica, parecer nem aconselhamento**. Toda classificação de risco, enquadramento regulatório, avaliação de titularidade/liquidez e uso do direito como garantia **requer validação jurídica** por profissional habilitado antes de qualquer decisão. Os campos do sistema **registram** o que foi informado e o que falta verificar; **não afirmam** conclusão jurídica. Definição de **controlador/operador** dos dados e de **base legal** para cada tratamento: item a definir com o responsável — **requer validação jurídica**.

---

### 10.4 Roadmap pós-MVP

Evoluções futuras a **não** implementar agora — registradas para orientar o produto sem inflar o MVP:

| Evolução | Descrição | Pré-condição |
|---|---|---|
| **Autenticação / multiusuário** | Login (SSO Keycloak da plataforma), perfis e RBAC quando houver mais de um operador ou exposição externa. | Necessidade real de acesso controlado. |
| **Integração real de tokenização** | Conexão com trilho de emissão (FIDC/plataforma CVM), smart contracts, whitelist — só após estruturação jurídica/regulatória aprovada. | Enquadramento regulatório validado (requer validação jurídica). |
| **Custódia e carteira** | Vínculo com custodiante/escriturador e gestão de posições on-chain/off-chain. | Definição de arquitetura regulatória (CVM/BCB). |
| **Assinatura eletrônica** | Assinatura de instrumentos (cessão, procuração, termos) integrada ao fluxo documental. | Escolha de provedor e requisitos de validade jurídica. |
| **Integrações externas de dados** | Consulta automática a tribunais (andamento processual), escriturador (posição acionária), bases públicas. | APIs disponíveis + base legal do tratamento. |
| **Valuation assistido** | Cálculo assistido de valor/relação de troca/correção com premissas explícitas e metodologia versionada. | Metodologia validada; sempre com premissas e "requer validação". |
| **IA assistiva** | Extração de dados de documentos, sugestão de pendências e minutas de checklist a partir dos anexos (padrão `ai-kit` da plataforma), sempre fail-soft e com revisão humana. | Dados suficientes + salvaguardas de privacidade. |
| **PLD/FT e KYC** | Módulos de prevenção à lavagem e onboarding, caso o produto avance para operação financeira real. | Definição de perfil regulatório (VASP vs plataforma CVM). |
| **Trilha de auditoria fina** | Histórico completo de quem alterou o quê, versionamento de campos e evidências. | Multiusuário ativo. |
| **Relatórios avançados / dashboards** | Painéis agregados de carteira de casos, indicadores de maturidade e risco por portfólio. | Volume de casos que justifique análise agregada. |
