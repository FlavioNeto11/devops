<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <RouterLink v-if="to" :to="to" class="ui-btn" :data-variant="variant" :data-size="size" :data-block="block ? 'true' : null">
    <slot name="icon-left" /><slot /><slot name="icon-right" />
  </RouterLink>
  <a v-else-if="href" :href="href" class="ui-btn" :data-variant="variant" :data-size="size" :data-block="block ? 'true' : null">
    <slot name="icon-left" /><slot /><slot name="icon-right" />
  </a>
  <button v-else class="ui-btn" :data-variant="variant" :data-size="size" :data-block="block ? 'true' : null"
          :type="type" :disabled="disabled || loading" @click="$emit('click', $event)">
    <span v-if="loading" class="ui-spin" aria-hidden="true" /><slot name="icon-left" /><slot /><slot name="icon-right" />
  </button>
</template>
<script setup>
import { RouterLink } from 'vue-router';
defineProps({
  variant: { type: String, default: 'primary' }, // primary | ghost | subtle | danger
  size: { type: String, default: 'md' },          // sm | md | lg
  type: { type: String, default: 'button' },
  to: { type: [String, Object], default: null },
  href: { type: String, default: null },
  loading: Boolean, disabled: Boolean, block: Boolean,
});
defineEmits(['click']);
</script>
