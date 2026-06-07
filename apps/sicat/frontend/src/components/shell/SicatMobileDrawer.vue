<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { groupNavigationByModule, isNavigationItemActive } from '../../config/navigation.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  groups: { type: Array, required: true },
  activeAccountTypeLabel: { type: String, default: '' },
  activeCetesbAccountLabel: { type: String, default: '' },
  userEmail: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'navigate']);

const route = useRoute();

const modules = computed(() => groupNavigationByModule(props.groups));

function isActive(path) {
  return isNavigationItemActive(route.path, path);
}

function handleNavigate(path) {
  emit('navigate', path);
  emit('update:modelValue', false);
}
</script>

<template>
  <v-navigation-drawer
    :model-value="modelValue"
    temporary
    location="left"
    width="320"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <div class="drawer-head">
      <router-link class="app-brand" to="/dashboard" @click="emit('update:modelValue', false)">
        <span class="app-brand-logo">
          <v-icon color="primary" size="24">mdi-leaf-circle</v-icon>
        </span>
        <span class="app-brand-copy">
          <strong>SICAT</strong>
          <small>MTR CETESB</small>
        </span>
      </router-link>
    </div>

    <div class="drawer-sections">
      <template v-for="section in modules" :key="section.moduleId">
        <div class="drawer-module-label">{{ section.moduleLabel }}</div>
        <template v-for="group in section.groups" :key="group.id">
          <v-list v-if="group.kind === 'direct'" density="comfortable" nav class="drawer-list">
            <v-list-item
              :prepend-icon="group.icon"
              :title="group.label"
              :subtitle="group.description"
              :active="isActive(group.to)"
              rounded="lg"
              @click="handleNavigate(group.to)"
            />
          </v-list>

          <div v-else class="drawer-group">
            <div class="drawer-group__label">
              <v-icon size="14">{{ group.icon }}</v-icon>
              <span>{{ group.label }}</span>
            </div>
            <v-list density="comfortable" nav class="drawer-list">
              <v-list-item
                v-for="item in group.items"
                :key="item.to"
                :prepend-icon="item.icon"
                :title="item.label"
                :subtitle="item.description"
                :active="isActive(item.to)"
                rounded="lg"
                @click="handleNavigate(item.to)"
              />
            </v-list>
          </div>
        </template>
      </template>
    </div>

    <template #append>
      <div class="drawer-footer">
        <v-chip size="small" color="secondary" variant="tonal" class="mb-3">
          {{ activeAccountTypeLabel }}
        </v-chip>
        <div class="text-body-2 font-weight-medium">{{ activeCetesbAccountLabel }}</div>
        <div class="text-caption text-medium-emphasis">{{ userEmail || 'Sessão ativa' }}</div>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.drawer-head {
  padding: 20px 20px 8px;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.app-brand-logo {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: rgba(var(--v-theme-primary), 0.12);
}

.app-brand-copy {
  display: grid;
  gap: 2px;
  line-height: 1.1;
}

.app-brand-copy strong {
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 1rem;
  font-weight: 800;
}

.app-brand-copy small {
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.drawer-sections {
  padding: 4px 0 12px;
}

.drawer-module-label {
  padding: 18px 24px 4px;
  color: rgba(var(--v-theme-on-surface), 0.42);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.drawer-module-label:first-child {
  padding-top: 8px;
}

.drawer-group {
  padding-top: 6px;
}

.drawer-group__label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px 4px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.drawer-list {
  padding: 0 8px;
}

.drawer-footer {
  padding: 20px;
  border-top: 1px solid rgba(var(--v-border-color), 0.14);
}
</style>
