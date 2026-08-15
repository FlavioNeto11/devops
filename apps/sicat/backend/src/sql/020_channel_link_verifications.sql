-- 020: desafios de verificação de canal (OTP) — vínculo telefone ↔ usuário SICAT.
-- Fase 2 da cadeia `whatsapp-channel-sicat`.
--
-- O desafio é SEMPRE iniciado no app: o usuário AUTENTICADO informa o número, recebe um código de
-- 6 dígitos pelo WhatsApp e confirma na tela. Não existe OTP iniciado a partir do canal externo —
-- um número desconhecido não provoca nenhuma escrita aqui.
--
-- Esta tabela é o estado TRANSITÓRIO do desafio **e** a trilha operacional dele (para onde foi, se o
-- provedor aceitou, qual o id da mensagem, quantas vezes reenviou, por que morreu). O estado FINAL
-- do vínculo continua em `conversation_channel_links` (011), que esta migration NÃO altera —
-- migration ADITIVA, cria tabela nova e mais nada.
--
-- `code_hash` guarda `hashPassword(code)` (scrypt COM salt por linha, formato `scrypt_v1$<salt>$<hash>`),
-- nunca o código e nunca um sha256 dele: 6 dígitos são 10^6 possibilidades, e um sha256 sem salt é
-- determinístico — pré-computar as 10^6 imagens leva menos de um segundo e inverteria TODOS os
-- desafios vivos de uma vez a partir de um dump/backup. O hash aqui não defende contra força bruta
-- online (isso é `attempt_count` + os limitadores); defende contra LEITURA do banco.

create table if not exists conversation_channel_verifications (
  id                  text primary key,                    -- cvfy_<hex> (createPrefixedId('cvfy'))
  -- Sem `check` no canal, espelhando `conversation_channel_links` (011): a whitelist vive no service,
  -- para que um canal novo não exija migration.
  channel_type        text not null default 'whatsapp',
  external_user_key   text not null,                       -- E.164 só dígitos, já canonicalizado (regra BR do 9º)
  user_id             text not null references sicat_users(id) on delete cascade,
  code_hash           text not null,                       -- scrypt_v1$<salt>$<hash>. NUNCA o código.
  attempt_count       integer not null default 0,
  max_attempts        integer not null default 5,
  send_count          integer not null default 0,          -- o start já conta 1 (a TENTATIVA de envio)
  max_sends           integer not null default 3,
  last_sent_at        timestamptz,                         -- cooldown de reenvio mora AQUI (sobrevive a restart)
  expires_at          timestamptz not null,
  consumed_at         timestamptz,                         -- desafio saiu do ar, por QUALQUER motivo
  outcome             text
                        check (outcome in (
                          'verified',      -- código correto → vínculo gravado
                          'expired',       -- passou de expires_at
                          'exhausted',     -- estourou max_attempts
                          'cancelled',     -- usuário desistiu / desvinculou o número
                          'superseded',    -- o usuário abriu outro desafio, ou o número foi verificado
                          'send_failed',   -- provedor recusou o envio
                          'conflict'       -- código correto, mas a transferência de posse está bloqueada
                        )),
  -- `sent` significa "o provedor ACEITOU", nunca "chegou no aparelho". `delivered`/`read`/
  -- `undelivered` já entram no check para que a fase 3 (recibos do webhook) só precise dar update.
  delivery_status     text not null default 'pending'
                        check (delivery_status in ('pending','sent','failed','delivered','read','undelivered')),
  provider_name       text,                                -- twilio | meta (qual adapter enviou)
  provider_message_id text,                                -- única chave para abrir chamado no provedor
  delivery_error      text,                                -- erro SANITIZADO (código + frase curta), nunca o corpo inteiro
  correlation_id      text,                                -- join com audit_logs e com o código que a tela mostra
  metadata            jsonb not null default '{}'::jsonb,  -- rawInput do telefone, template usado. NUNCA o código.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table conversation_channel_verifications
drop constraint if exists chk_channel_verifications_counters;

alter table conversation_channel_verifications
add constraint chk_channel_verifications_counters
  check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts
     and send_count >= 0 and max_sends > 0 and send_count <= max_sends);

-- Fechado é fechado: ou o desafio está vivo (ambos nulos), ou está fechado COM motivo. É o que
-- garante que o suporte sempre consiga responder "por que este desafio morreu?".
alter table conversation_channel_verifications
drop constraint if exists chk_channel_verifications_closure;

alter table conversation_channel_verifications
add constraint chk_channel_verifications_closure
  check ((consumed_at is null) = (outcome is null));

-- No máximo UM desafio vivo por (canal, telefone, USUÁRIO). O `user_id` está no escopo de propósito:
-- se a chave viva fosse só (canal, telefone), qualquer conta válida derrubaria repetidamente o
-- desafio pendente do dono legítimo só pedindo um código para o número dele — DoS de vinculação a
-- custo zero. `now()` não é IMMUTABLE, então o predicado é só `consumed_at is null`; a expiração é
-- aplicada no WHERE das queries.
create unique index if not exists conversation_channel_verifications_live_idx
  on conversation_channel_verifications (channel_type, external_user_key, user_id)
where
    consumed_at is null;

-- Tela "meus canais" + retomada do desafio pendente depois de um F5.
create index if not exists conversation_channel_verifications_user_idx
  on conversation_channel_verifications (user_id, created_at desc);

-- Escudo da vítima (contas DISTINTAS que pediram código para o mesmo número em 24 h) e busca do
-- suporte por telefone ("não recebi o código").
create index if not exists conversation_channel_verifications_phone_idx
  on conversation_channel_verifications (channel_type, external_user_key, created_at desc);

-- O suporte entra pelo código de correlação que a tela de erro mostra ao usuário.
create index if not exists conversation_channel_verifications_correlation_idx
  on conversation_channel_verifications (correlation_id)
where
    correlation_id is not null;

-- Varredura de expirados (higiene; a correção não depende dela — `expires_at > now()` está no WHERE).
create index if not exists conversation_channel_verifications_expiry_idx
  on conversation_channel_verifications (expires_at)
where
    consumed_at is null;
