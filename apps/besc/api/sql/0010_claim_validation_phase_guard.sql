-- 0010 — Guarda de fase no banco para os estados de validação do Claim (ADR-010, hardening).
-- Antes, só o serviço recusava claim -> VALIDATION_REQUESTED / INCONCLUSIVE (NOT_AVAILABLE_IN_PHASE);
-- um INSERT direto em entity_transition passava. Agora esses destinos exigem uma ClaimValidation
-- real do próprio claim. Como o papel de runtime (besc_app) não tem INSERT em claim_validation, na
-- F1/F2 o caminho fica fechado também por SQL. RECOGNIZED já exigia ClaimValidation CONFIRMED (0007).
CREATE OR REPLACE FUNCTION entity_transition_phase_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.entity_type = 'claim' AND NEW.to_state IN ('VALIDATION_REQUESTED', 'INCONCLUSIVE') THEN
    IF NOT EXISTS (SELECT 1 FROM claim_validation WHERE claim_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'entity_transition: claim só vai a % com ClaimValidation registrada (validação externa, fase F4)', NEW.to_state;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_transition_phase_guard_trg BEFORE INSERT ON entity_transition
  FOR EACH ROW EXECUTE FUNCTION entity_transition_phase_guard();
