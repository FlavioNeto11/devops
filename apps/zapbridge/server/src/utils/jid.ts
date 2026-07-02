// Utilitários para lidar com JIDs do WhatsApp.

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export type ChatKind = 'chat' | 'group' | 'channel';

// Classifica o tipo de conversa pelo JID:
//  @g.us → grupo · @newsletter → canal · demais → conversa 1:1.
export function chatKind(jid: string): ChatKind {
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.endsWith('@newsletter')) return 'channel';
  return 'chat';
}

export function isStatusBroadcast(jid: string): boolean {
  return jid === 'status@broadcast';
}

// Normaliza um número (apenas dígitos) em um JID de usuário.
export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

// Extrai o número de telefone de um JID, quando possível.
export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}
