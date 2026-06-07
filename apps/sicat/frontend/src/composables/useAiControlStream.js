import { onBeforeUnmount, ref } from 'vue';
import { streamAiControlEvents } from '../services/api.js';

/**
 * Acompanha o stream de eventos em tempo real do AI Control Center (SSE).
 * Mirror de useJobStream, porém ligado ao endpoint /v1/ai-control/events/stream.
 *
 * Garante o fechamento do reader no unmount, evitando vazamento de listeners.
 * Frames "heartbeat" são ignorados pelo client (streamAiControlEvents).
 *
 * Uso:
 *   const { events, streaming, streamError, start, stop } = useAiControlStream();
 *   await start({ onEvent: (evt) => {...}, max: 50 });
 *
 * Cada evento recebido tem a forma { type, at, payload }.
 */

const DEFAULT_MAX_EVENTS = 50;

export function useAiControlStream() {
  const events = ref([]);
  const streaming = ref(false);
  const streamError = ref(null);

  let stopFn = null;

  async function stop() {
    if (stopFn) {
      try {
        await stopFn();
      } catch {
        // reader já fechado — ignorar
      }
      stopFn = null;
    }
    streaming.value = false;
  }

  async function start({ onEvent, onError, resetEvents = true, max = DEFAULT_MAX_EVENTS } = {}) {
    await stop();

    if (resetEvents) {
      events.value = [];
    }
    streamError.value = null;
    streaming.value = true;

    try {
      stopFn = await streamAiControlEvents({
        onEvent: (event) => {
          const next = [...events.value, event];
          // Mantém apenas os N eventos mais recentes para o feed ao vivo.
          events.value = next.length > max ? next.slice(next.length - max) : next;
          onEvent?.(event);
        },
        onError: (error) => {
          streamError.value = error;
          onError?.(error);
        }
      });
    } catch (error) {
      streaming.value = false;
      streamError.value = error;
      throw error;
    }

    return stop;
  }

  onBeforeUnmount(stop);

  return { events, streaming, streamError, start, stop };
}
