// Sessão do usuário na borda — lê /helpflow/api/me UMA vez e compartilha o papel
// (RBAC) com o route guard e com as telas que escondem ações mutativas.
//
// O backend (apps/helpflow/api/src/server.js → GET /me) devolve
// { email, name, role } onde `role` vem do header X-Auth-Request-Groups
// injetado pelo oauth2-proxy. Pode ser nulo (sem SSO, ex.: dev local) ou conter
// vários grupos separados por vírgula. O backend continua sendo a FONTE DE
// VERDADE do RBAC — este módulo é defesa em profundidade na UI.
import { ref } from 'vue';

const ME_URL = '/helpflow/api/me';

export const me = ref(null);
export const meLoaded = ref(false);
export const meKnown = ref(false); // true só quando /me retornou um papel não-nulo

let inflight = null;

function parseRoles(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function loadMe() {
  if (meLoaded.value) return me.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(ME_URL);
      if (res.ok) {
        const m = await res.json();
        me.value = m && (m.email || m.role) ? m : null;
        meKnown.value = !!(m && m.role);
      }
    } catch {
      // degrada graciosamente — o backend ainda aplica o RBAC
    } finally {
      meLoaded.value = true;
      inflight = null;
    }
    return me.value;
  })();
  return inflight;
}

// papéis efetivos do usuário (lowercase). Vazio quando não há contexto SSO.
export function currentRoles() {
  return me.value ? parseRoles(me.value.role) : [];
}

// true se o usuário tem QUALQUER um dos papéis exigidos.
export function hasAnyRole(required) {
  if (!required || !required.length) return true;
  const roles = currentRoles();
  return required.some((r) => roles.includes(String(r).toLowerCase()));
}

// Gate de visibilidade de ações mutativas. Fail-OPEN apenas quando o papel é
// DESCONHECIDO (sem SSO/dev local) — aí o backend é a barreira. Quando o papel é
// conhecido, exige pertencer aos `required`.
export function canMutate(required) {
  if (!meKnown.value) return true;
  return hasAnyRole(required);
}
