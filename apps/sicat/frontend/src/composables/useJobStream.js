import { onBeforeUnmount, ref } from 'vue';
import { streamJobEvents } from '../services/api.js';

/**
 * Acompanha os eventos de um job em tempo real (SSE/NDJSON). Garante o
 * fechamento do reader no unmount, evitando vazamento de listeners.
 *
 * Uso:
 *   const { events, streaming, streamError, start, stop } = useJobStream();
 *   await start(jobId, { onEvent: (evt) => {...} });
 */

export function useJobStream() {
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

  async function start(jobId, { onEvent, onError, resetEvents = true } = {}) {
    await stop();

    if (resetEvents) {
      events.value = [];
    }
    streamError.value = null;
    streaming.value = true;

    try {
      stopFn = await streamJobEvents(jobId, {
        onEvent: (event) => {
          events.value = [...events.value, event];
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
