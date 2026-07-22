// useObligation — ação "marcar obrigação como concluída" compartilhada pelos 4 painéis por papel
// (PF/PJ/Contador/Admin). Antes cada painel duplicava um `try { ... } catch {}` VAZIO: em erro de
// rede/API nada acontecia (sem toast, modal seguia aberto) e o usuário podia assumir que a obrigação
// fiscal ficou "paga" sem confirmação do sistema (UX-CV360-003). Aqui centralizamos:
//   1. confirmação explícita antes de mutar (useConfirm),
//   2. feedback de sucesso e de ERRO visível (useToast) — a mensagem da API sobe ao usuário,
//   3. estado de `concluding` para o botão.
// A view fecha o modal APENAS quando `conclude` retorna true — em falha o modal permanece para retry.
import { ref } from 'vue';
import { useToast, useConfirm } from '../ui/index.js';
import { concludeObligation } from '../api.js';

export function useObligation({ onDone } = {}) {
  const toast = useToast();
  const confirm = useConfirm();
  const concluding = ref(false);

  async function conclude(obrigacao) {
    if (!obrigacao || !obrigacao.id) return false;
    const nome = obrigacao.tipo || 'esta obrigação';
    const ok = await confirm({
      title: 'Marcar como concluída',
      message: 'Confirmar que "' + nome + '" foi paga/entregue? O status fiscal será atualizado.',
      confirmLabel: 'Marcar como concluída',
    });
    if (!ok) return false;

    concluding.value = true;
    try {
      await concludeObligation(obrigacao.id);
      toast.success('Obrigação marcada como concluída.');
      if (onDone) await onDone();
      return true;
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Não foi possível concluir a obrigação. Tente novamente.');
      return false;
    } finally {
      concluding.value = false;
    }
  }

  return { concluding, conclude };
}
