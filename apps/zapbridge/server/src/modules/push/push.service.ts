// Envio de notificações push via Expo Push API (sem SDK; usa fetch nativo do Node 18+).
// https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPush(token: string, payload: PushPayload): Promise<void> {
  // Token Expo válido tem o formato ExponentPushToken[...] ou ExpoPushToken[...].
  if (!token || !token.startsWith('Expo')) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      }),
    });
  } catch {
    // Falha de push não deve quebrar o fluxo de mensagens.
  }
}
