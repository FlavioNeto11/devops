<script setup>
defineProps({
  user: { type: Object, default: null },
  userInitials: { type: String, default: 'SI' },
  activeAccountTypeLabel: { type: String, default: '' },
  activeCetesbAccountLabel: { type: String, default: '' },
  isDarkTheme: { type: Boolean, default: false },
  canAccessAdmin: { type: Boolean, default: false }
});

const emit = defineEmits([
  'navigate',
  'switchAccount',
  'toggleTheme',
  'logout'
]);
</script>

<template>
  <v-menu location="bottom end" offset="12">
    <template #activator="{ props: menuProps }">
      <v-btn v-bind="menuProps" class="user-trigger" variant="text" rounded="pill" height="46">
        <v-avatar size="34" color="primary" variant="tonal" class="me-3">
          <span class="user-trigger__avatar">{{ userInitials }}</span>
        </v-avatar>
        <span class="user-trigger__copy d-none d-sm-grid">
          <strong>{{ user?.name || 'Usuário SICAT' }}</strong>
          <small>{{ activeAccountTypeLabel }}</small>
        </span>
        <v-icon size="18">mdi-chevron-down</v-icon>
      </v-btn>
    </template>

    <v-card class="user-menu" min-width="320">
      <v-card-text class="user-menu__head">
        <div class="d-flex align-start justify-space-between ga-3">
          <div>
            <div class="text-subtitle-1 font-weight-bold">{{ user?.name || 'Usuário SICAT' }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ user?.email || 'Sessão ativa' }}</div>
          </div>
          <v-chip size="x-small" color="success" variant="tonal">Online</v-chip>
        </div>
        <div class="user-menu__account mt-3">
          <span>{{ activeCetesbAccountLabel }}</span>
          <small>{{ activeAccountTypeLabel }}</small>
        </div>
      </v-card-text>

      <v-divider />

      <v-list density="comfortable" nav>
        <v-list-item
          prepend-icon="mdi-account-cog-outline"
          title="Minha sessão"
          subtitle="Sessão, conta ativa e diagnóstico"
          @click="emit('navigate', '/sessao')"
        />
        <v-list-item
          v-if="canAccessAdmin"
          prepend-icon="mdi-shield-key-outline"
          title="Administração"
          subtitle="Perfis, permissões e sessões"
          @click="emit('navigate', '/admin/acessos')"
        />
        <v-list-item
          prepend-icon="mdi-swap-horizontal"
          title="Trocar conta CETESB"
          subtitle="Voltar para a seleção de contas"
          @click="emit('switchAccount')"
        />
        <v-list-item
          :prepend-icon="isDarkTheme ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          :title="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
          subtitle="Alternar aparência da interface"
          @click="emit('toggleTheme')"
        />
      </v-list>

      <v-divider />

      <v-card-actions class="justify-space-between px-4 py-3">
        <span class="text-caption text-medium-emphasis">SICAT MTR CETESB</span>
        <v-btn color="error" variant="tonal" prepend-icon="mdi-logout" @click="emit('logout')">Sair</v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<style scoped>
.user-trigger {
  border: 1px solid rgba(var(--v-border-color), 0.18);
  background: rgba(var(--v-theme-surface), 0.82);
  padding-inline: 6px 12px;
  max-width: 280px;
  text-transform: none;
}

.user-trigger__copy {
  display: grid;
  line-height: 1.1;
  text-align: left;
}

.user-trigger__copy strong {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.user-trigger__copy small {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.user-trigger__avatar {
  font-size: 0.78rem;
  font-weight: 800;
}

.user-menu {
  border: 1px solid rgba(var(--v-border-color), 0.16);
  background: rgba(var(--v-theme-surface), 0.96);
  backdrop-filter: blur(16px);
}

.user-menu__head {
  display: grid;
  gap: 10px;
}

.user-menu__account {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(var(--v-theme-primary), 0.08);
}

.user-menu__account span {
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.user-menu__account small {
  color: rgba(var(--v-theme-on-surface), 0.62);
}

@media (max-width: 599px) {
  .user-trigger {
    max-width: 180px;
  }
}
</style>
