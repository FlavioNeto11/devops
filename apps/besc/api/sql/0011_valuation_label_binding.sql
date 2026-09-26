-- 0011 — Rótulos amarrados ao que a fase consegue provar (ADR-010, hardening).
-- 1) Valuation: legal_status e fonte deixam de ser escolha livre de quem registra; cada tipo tem um
--    único rótulo e um conjunto fechado de fontes (espelho de recovery/domain/valuation.js). Assim
--    um número de alegação nunca aparece como "confirmado externamente", "observado no mercado",
--    "executado" ou "fato histórico".
-- 2) Classificação de evidência: nenhuma evidência é "decisão definitiva" em F1/F2 — trânsito em
--    julgado só se verifica na F4. A migration da F4 que relaxar isto precisa de ADR próprio.
ALTER TABLE valuation ADD CONSTRAINT valuation_label_by_type CHECK (legal_status = CASE value_type
  WHEN 'claimed_value' THEN 'SOURCE_CLAIM'
  WHEN 'expert_estimate' THEN 'SOURCE_CLAIM'
  WHEN 'historical_value' THEN 'HISTORICAL_FACT'
  WHEN 'recognized_value' THEN 'EXTERNALLY_CONFIRMED'
  WHEN 'market_value' THEN 'MARKET_OBSERVED'
  WHEN 'collateral_value' THEN 'MARKET_OBSERVED'
  WHEN 'liquidation_value' THEN 'EXECUTED'
END);

ALTER TABLE valuation ADD CONSTRAINT valuation_source_by_type CHECK (CASE value_type
  WHEN 'claimed_value' THEN source IN ('CLAIMANT', 'PETITION', 'COMMERCIAL_MATERIAL')
  WHEN 'expert_estimate' THEN source IN ('PRIVATE_APPRAISAL', 'COURT_EXPERT')
  WHEN 'historical_value' THEN source IN ('CORPORATE_DOCUMENT', 'HISTORICAL_QUOTE')
  WHEN 'recognized_value' THEN source = 'EXTERNAL_CONFIRMATION'
  WHEN 'market_value' THEN source = 'MARKET_DATA'
  WHEN 'collateral_value' THEN source = 'MARKET_DATA'
  WHEN 'liquidation_value' THEN source = 'EXECUTION'
END);

ALTER TABLE evidence_classification ADD CONSTRAINT classification_no_final_decision_in_f2
  CHECK (source_nature <> 'FINAL_COURT_DECISION');
