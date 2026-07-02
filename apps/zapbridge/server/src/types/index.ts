import { Request } from 'express';

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

// Request autenticado: `user` é injetado pelo middleware de auth.
export interface AuthedRequest extends Request {
  user?: AuthTokenPayload;
}

export type SessionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'error';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';
