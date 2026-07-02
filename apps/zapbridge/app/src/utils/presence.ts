// Presença de um contato (1:1). typing/recording são transitórios; online/lastSeen persistem.
export type Presence = {
  typing?: boolean;
  recording?: boolean;
  online?: boolean;
  lastSeen?: number | null;
};

export function formatLastSeen(secs: number): string {
  const d = new Date(secs * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `hoje às ${time}`;
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `ontem às ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
}

// Subtítulo do header da conversa conforme a presença (null = não mostra nada).
export function presenceLabel(p?: Presence): string | null {
  if (!p) return null;
  if (p.typing) return 'digitando…';
  if (p.recording) return 'gravando áudio…';
  if (p.online) return 'online';
  if (p.lastSeen) return `visto por último ${formatLastSeen(p.lastSeen)}`;
  return null;
}
