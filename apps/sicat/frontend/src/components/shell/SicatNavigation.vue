<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { findActiveGroup, isNavigationItemActive } from '../../config/navigation.js';

const props = defineProps({
  groups: {
    type: Array,
    required: true
  }
});

defineEmits(['navigate']);

const route = useRoute();
const activeGroup = computed(() => findActiveGroup(props.groups, route.path));

function isActive(path) {
  return isNavigationItemActive(route.path, path);
}

function isGroupActive(group) {
  return activeGroup.value?.id === group.id;
}
</script>

<template>
  <ul class="sicat-nav" aria-label="Navegação principal">
    <li v-for="group in groups" :key="group.id" class="sicat-nav__item">
      <router-link
        v-if="group.kind === 'direct'"
        :to="group.to"
        class="sicat-nav__link"
        :class="{ 'is-active': isActive(group.to) }"
        :aria-current="isActive(group.to) ? 'page' : undefined"
        @click="$emit('navigate', group.to)"
      >
        <v-icon size="18">{{ group.icon }}</v-icon>
        <span>{{ group.label }}</span>
      </router-link>

      <v-menu
        v-else
        location="bottom start"
        :close-on-content-click="true"
        offset="8"
      >
        <template #activator="{ props: activatorProps }">
          <button
            v-bind="activatorProps"
            type="button"
            class="sicat-nav__link sicat-nav__link--group"
            :class="{ 'is-active': isGroupActive(group) }"
            :aria-label="`Abrir grupo ${group.label}`"
            aria-haspopup="menu"
          >
            <v-icon size="18" aria-hidden="true">{{ group.icon }}</v-icon>
            <span>{{ group.label }}</span>
            <v-icon size="16" class="sicat-nav__chevron" aria-hidden="true">mdi-chevron-down</v-icon>
          </button>
        </template>

        <v-card class="sicat-nav__menu" min-width="280" elevation="8">
          <v-list density="comfortable" nav>
            <v-list-item
              v-for="item in group.items"
              :key="item.to"
              :prepend-icon="item.icon"
              :title="item.label"
              :subtitle="item.description"
              :active="isActive(item.to)"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              :to="item.to"
              rounded="lg"
              @click="$emit('navigate', item.to)"
            />
          </v-list>
        </v-card>
      </v-menu>
    </li>
  </ul>
</template>

<style scoped>
.sicat-nav {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 0;
  padding: 0 12px;
  list-style: none;
}

.sicat-nav__item {
  display: flex;
}

.sicat-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.sicat-nav__link:hover,
.sicat-nav__link:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.92);
  outline: none;
}

/* Ativo monocromático: texto + fundo discreto na cor do acento, sem gradiente
   nem sombra — leitura imediata de "onde estou" sem gritar. */
.sicat-nav__link.is-active {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.sicat-nav__chevron {
  margin-left: 2px;
  opacity: 0.7;
}

.sicat-nav__menu {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
}
</style>
