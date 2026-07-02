import { Message } from '../types';

export type DateSep = { _sep: true; label: string; id: string };
export type ListItem = Message | DateSep;
export const isSep = (i: ListItem): i is DateSep => !!(i as DateSep)._sep;

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  const fmt = (x: Date) =>
    x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const msg = fmt(d);
  if (msg === fmt(now)) return 'Hoje';
  if (msg === fmt(yest)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long' });
}

// messages vem NEWEST-FIRST (como no store). Para a web renderizamos top→bottom
// (mais antiga em cima, mais nova embaixo) com separador antes de cada novo dia.
export function buildList(messagesNewestFirst: Message[]): ListItem[] {
  const msgs = [...messagesNewestFirst].reverse();
  const result: ListItem[] = [];
  let last: string | null = null;
  for (const m of msgs) {
    const d = dateLabel(m.timestamp);
    if (d !== last) {
      result.push({ _sep: true, label: d, id: 'sep-' + m.id });
      last = d;
    }
    result.push(m);
  }
  return result;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const SENDER_COLORS = [
  '#E91E63', '#9C27B0', '#3F51B5', '#2196F3', '#00BCD4', '#009688', '#8BC34A', '#FF9800', '#FF5722',
];
export function senderColor(jid: string): string {
  let h = 0;
  for (let i = 0; i < jid.length; i++) h = (h * 31 + jid.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}
