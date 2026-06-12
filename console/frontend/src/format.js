/**
 * format.js
 * ---------
 * Pequenos helpers de formatacao compartilhados pelos componentes.
 * Sem dependencias externas — tudo puro e testavel.
 */

/**
 * Converte um timestamp ISO (creationTimestamp do K8s) em "idade" compacta,
 * no estilo do kubectl: 10s, 5m, 3h, 2d, 1d4h.
 * @param {string|number|Date|null} ts Timestamp de criacao.
 * @returns {string} Idade legivel ou '—' quando ausente.
 */
export function ageFrom(ts) {
  if (!ts) return '—';
  const start = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  if (Number.isNaN(start)) return '—';

  let secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const d = Math.floor(secs / 86400);
  secs -= d * 86400;
  const h = Math.floor(secs / 3600);
  secs -= h * 3600;
  const m = Math.floor(secs / 60);
  const s = secs - m * 60;

  if (d > 0) return h > 0 ? `${d}d${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * Tempo RELATIVO legivel em pt-BR ("ha 5 min", "ha 2 h", "ha 3 d") para tabelas
 * escaneaveis (o ISO completo vai no title). Datas futuras/invalidas viram '—'.
 * @param {string|number|Date|null} ts
 * @returns {string}
 */
export function timeAgo(ts) {
  if (!ts) return '—';
  const start = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  if (Number.isNaN(start)) return '—';
  const secs = Math.floor((Date.now() - start) / 1000);
  if (secs < 0) return '—';
  if (secs < 60) return 'agora há pouco';
  const m = Math.floor(secs / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `há ${mo} mês${mo > 1 ? 'es' : ''}` : `há ${Math.floor(mo / 12)} ano(s)`;
}

/**
 * Mapeia a fase de um pod (ou estado de saude) para uma classe de badge.
 * @param {string} phase Ex.: 'Running', 'Pending', 'Failed', 'Succeeded'.
 * @returns {string} Classe CSS de badge.
 */
export function phaseBadgeClass(phase) {
  switch ((phase || '').toLowerCase()) {
    case 'running':
    case 'succeeded':
    case 'ready':
    case 'healthy':
    case 'available':
      return 'badge badge-ok';
    case 'pending':
    case 'containercreating':
    case 'progressing':
    case 'degraded':
      return 'badge badge-warn';
    case 'failed':
    case 'crashloopbackoff':
    case 'error':
    case 'unhealthy':
      return 'badge badge-err';
    default:
      return 'badge badge-muted';
  }
}

/**
 * Encurta uma referencia de imagem para exibicao, preservando o final
 * (repo + tag), que costuma ser a parte informativa.
 * @param {string} image Referencia completa da imagem.
 * @param {number} [max=42] Tamanho maximo antes de truncar.
 * @returns {string} Imagem possivelmente encurtada.
 */
export function shortImage(image, max = 42) {
  if (!image) return '—';
  if (image.length <= max) return image;
  return `…${image.slice(image.length - (max - 1))}`;
}

/**
 * Soma defensiva de restarts a partir de valores possivelmente indefinidos.
 * @param {number|undefined|null} value
 * @returns {number}
 */
export function asCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
