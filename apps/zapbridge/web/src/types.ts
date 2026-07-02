export type SessionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected' | 'logged_out';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'error';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';
export type ChatKind = 'chat' | 'group' | 'channel';

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface ChatListItem {
  id: string;
  jid: string;
  name: string | null;
  avatarUrl?: string | null;
  kind: ChatKind;
  isGroup: boolean;
  locked?: boolean;
  unreadCount: number;
  lastMessageAt: string;
  lastMessage: {
    text: string | null;
    type: MessageType;
    fromMe: boolean;
    senderName?: string | null;
    status?: MessageStatus;
  } | null;
}

export interface QuotedMessage {
  text: string | null;
  type: string;
  senderName: string | null;
}

export interface Reaction {
  jid: string;
  emoji: string;
  fromMe: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  waMessageId?: string | null;
  fromMe: boolean;
  senderJid: string;
  senderName?: string | null;
  type: MessageType;
  text: string | null;
  quotedMessageId?: string | null;
  quoted?: QuotedMessage | null;
  reactions?: Reaction[];
  status: MessageStatus;
  timestamp: string;
  media?: MediaInfo | null;
}

export interface MediaInfo {
  id: string;
  type: MessageType;
  mimeType?: string | null;
  fileName?: string | null;
  downloaded: boolean;
  expired: boolean;
}
