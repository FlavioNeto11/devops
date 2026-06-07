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
          >
            <v-icon size="18">{{ group.icon }}</v-icon>
            <span>{{ group.label }}</span>
            <v-icon size="16" class="sicat-nav__chevron">mdi-chevron-down</v-icon>
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
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.sicat-nav__link:hover,
.sicat-nav__link:focus-visible {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgba(var(--v-theme-primary), 1);
  outline: none;
}

.sicat-nav__link.is-active {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.16) 0%, rgba(var(--v-theme-info), 0.10) 100%);
  color: rgba(var(--v-theme-primary), 1);
  box-shadow: 0 6px 16px rgba(var(--v-theme-primary), 0.12);
}

.sicat-nav__chevron {
  margin-left: 2px;
  opacity: 0.7;
}

.sicat-nav__menu {
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: 18px;
  background: rgba(var(--v-theme-surface), 0.98);
  backdrop-filter: blur(18px);
}
</style>
