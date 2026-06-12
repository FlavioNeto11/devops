-- Checklist: desabilitar bloco inteiro (soft) + comentário por item + anexo por item.
-- disabled_at: checklist desativado some do progresso e fica somente leitura na UI.
ALTER TABLE "activity_checklists" ADD COLUMN "disabled_at" TIMESTAMP(3);

-- Comentário curto e único por item (minimalista — não é thread).
ALTER TABLE "activity_checklist_items" ADD COLUMN "comment" TEXT;

-- Anexo opcionalmente vinculado a um item do checklist (evidência do check).
-- ON DELETE SET NULL: excluir o item preserva o anexo no nível da atividade.
ALTER TABLE "activity_attachments" ADD COLUMN "checklist_item_id" TEXT;

CREATE INDEX "activity_attachments_checklist_item_id_idx"
  ON "activity_attachments"("checklist_item_id");

ALTER TABLE "activity_attachments"
  ADD CONSTRAINT "activity_attachments_checklist_item_id_fkey"
  FOREIGN KEY ("checklist_item_id") REFERENCES "activity_checklist_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
