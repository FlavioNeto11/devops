<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { brDateToIsoDate, isoDateToBrDate, normalizeBrDateInput } from '../../../utils/date-format.js';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  id: {
    type: String,
    required: true
  },
  placeholder: {
    type: String,
    default: 'dd/mm/aaaa'
  },
  ariaLabel: {
    type: String,
    default: 'Selecionar data'
  },
  openCalendarAriaLabel: {
    type: String,
    default: 'Abrir calendário'
  },
  previousDayAriaLabel: {
    type: String,
    default: 'Dia anterior'
  },
  nextDayAriaLabel: {
    type: String,
    default: 'Dia seguinte'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  rangeMode: {
    type: Boolean,
    default: false
  },
  rangeRole: {
    type: String,
    default: ''
  },
  rangeStartValue: {
    type: String,
    default: ''
  },
  rangeEndValue: {
    type: String,
    default: ''
  },
  rangeHoverIso: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'commit', 'date-picked', 'range-hover']);

const rootRef = ref(null);
const isPickerOpen = ref(false);
const activeMonth = ref(new Date());

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const monthLabel = computed(() => {
  const monthDate = activeMonth.value;
  if (!(monthDate instanceof Date) || Number.isNaN(monthDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(monthDate);
});

function resolvePreviewRange({ rangeMode, rangeRole, rangeStartIso, rangeEndIso, hoverIso }) {
  if (!rangeMode || !hoverIso) {
    return { previewStartIso: null, previewEndIso: null };
  }

  if (rangeRole === 'end' && rangeStartIso && !rangeEndIso) {
    return {
      previewStartIso: rangeStartIso,
      previewEndIso: hoverIso
    };
  }

  if (rangeRole === 'start' && rangeEndIso && !rangeStartIso) {
    return {
      previewStartIso: hoverIso,
      previewEndIso: rangeEndIso
    };
  }

  return { previewStartIso: null, previewEndIso: null };
}

function normalizeIsoRange(startIso, endIso) {
  if (!startIso || !endIso) {
    return { startIso: null, endIso: null };
  }

  if (startIso <= endIso) {
    return { startIso, endIso };
  }

  return {
    startIso: endIso,
    endIso: startIso
  };
}

function resolveSelectableBounds(rangeRole, rangeStartIso, rangeEndIso) {
  if (rangeRole === 'end' && rangeStartIso) {
    return {
      minSelectableIso: rangeStartIso,
      maxSelectableIso: null
    };
  }

  if (rangeRole === 'start' && rangeEndIso) {
    return {
      minSelectableIso: null,
      maxSelectableIso: rangeEndIso
    };
  }

  return {
    minSelectableIso: null,
    maxSelectableIso: null
  };
}

function isIsoDisabled(iso, bounds) {
  if (!iso) {
    return false;
  }

  if (bounds.minSelectableIso && iso < bounds.minSelectableIso) {
    return true;
  }

  if (bounds.maxSelectableIso && iso > bounds.maxSelectableIso) {
    return true;
  }

  return false;
}

function buildDayCell(dayDate, monthDate, todayIso, committedRange, previewRange, selectionBounds, singleSelectedIso) {
  const iso = toIsoDateString(dayDate);
  const hasPreviewRange = Boolean(previewRange.startIso && previewRange.endIso);
  const isPreviewInRange = hasPreviewRange
    && iso >= previewRange.startIso
    && iso <= previewRange.endIso;
  const hasCommittedRange = Boolean(committedRange.startIso && committedRange.endIso);
  const isCommittedInRange = hasCommittedRange
    && iso >= committedRange.startIso
    && iso <= committedRange.endIso;
  const isRangeBoundary = Boolean(
    (committedRange.startIso && iso === committedRange.startIso)
    || (committedRange.endIso && iso === committedRange.endIso)
  );
  const isSingleSelected = Boolean(singleSelectedIso) && iso === singleSelectedIso;
  const isDisabled = isIsoDisabled(iso, selectionBounds);

  return {
    iso,
    day: dayDate.getDate(),
    isCurrentMonth: dayDate.getMonth() === monthDate.getMonth(),
    isToday: iso === todayIso,
    isSelected: isRangeBoundary || isSingleSelected,
    isPreviewInRange,
    isCommittedInRange,
    isDisabled
  };
}

const dayGrid = computed(() => {
  const monthDate = activeMonth.value;
  if (!(monthDate instanceof Date) || Number.isNaN(monthDate.getTime())) {
    return [];
  }

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStart.getDay());

  const singleSelectedIso = brDateToIsoDate(props.modelValue);
  const todayIso = toIsoDateString(new Date());
  const rangeStartIso = brDateToIsoDate(props.rangeStartValue);
  const rangeEndIso = brDateToIsoDate(props.rangeEndValue);
  const hoverIso = String(props.rangeHoverIso || '').trim();
  const committedRange = normalizeIsoRange(rangeStartIso, rangeEndIso);
  const selectionBounds = resolveSelectableBounds(props.rangeRole, rangeStartIso, rangeEndIso);
  const previewCandidate = resolvePreviewRange({
    rangeMode: props.rangeMode,
    rangeRole: props.rangeRole,
    rangeStartIso,
    rangeEndIso,
    hoverIso
  });
  const previewRange = normalizeIsoRange(previewCandidate.previewStartIso, previewCandidate.previewEndIso);

  return Array.from({ length: 42 }, (_, index) => {
    const dayDate = new Date(gridStart);
    dayDate.setDate(gridStart.getDate() + index);

    return buildDayCell(dayDate, monthDate, todayIso, committedRange, previewRange, selectionBounds, singleSelectedIso);
  });
});

const selectionBounds = computed(() => {
  const rangeStartIso = brDateToIsoDate(props.rangeStartValue);
  const rangeEndIso = brDateToIsoDate(props.rangeEndValue);
  return resolveSelectableBounds(props.rangeRole, rangeStartIso, rangeEndIso);
});

function toIsoDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function setValue(nextValue, shouldCommit = false) {
  emit('update:modelValue', nextValue);
  if (shouldCommit) {
    emit('commit', nextValue);
  }
}

function openPicker() {
  const currentIso = brDateToIsoDate(props.modelValue);
  const focusDate = currentIso ? new Date(`${currentIso}T00:00:00`) : new Date();
  activeMonth.value = Number.isNaN(focusDate.getTime())
    ? new Date()
    : new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  isPickerOpen.value = true;
}

function closePicker() {
  isPickerOpen.value = false;
  emit('range-hover', '');
}

function normalizeAndCommit() {
  const normalized = normalizeBrDateInput(props.modelValue);
  setValue(normalized, true);
}

function shiftMonth(delta) {
  const base = activeMonth.value;
  if (!(base instanceof Date) || Number.isNaN(base.getTime())) {
    activeMonth.value = new Date();
    return;
  }

  activeMonth.value = new Date(base.getFullYear(), base.getMonth() + Number(delta || 0), 1);
}

function selectDate(isoValue, source = 'calendar') {
  if (!isoValue || isIsoDisabled(isoValue, selectionBounds.value)) {
    return;
  }

  const nextValue = isoDateToBrDate(isoValue) || '';
  setValue(nextValue, true);
  emit('date-picked', {
    value: nextValue,
    iso: isoValue,
    source,
    rangeRole: props.rangeRole
  });
  closePicker();
}

function shiftDay(dayOffset) {
  const currentIso = brDateToIsoDate(props.modelValue);
  const currentDate = currentIso ? new Date(`${currentIso}T00:00:00`) : new Date();
  if (Number.isNaN(currentDate.getTime())) {
    return;
  }

  currentDate.setDate(currentDate.getDate() + Number(dayOffset || 0));
  const nextIso = toIsoDateString(currentDate);
  if (isIsoDisabled(nextIso, selectionBounds.value)) {
    return;
  }

  const nextValue = isoDateToBrDate(nextIso) || '';
  setValue(nextValue, true);
}

function selectToday() {
  selectDate(toIsoDateString(new Date()), 'today');
}

function handleDayHover(dayIso) {
  if (!props.rangeMode || !isPickerOpen.value || isIsoDisabled(dayIso, selectionBounds.value)) {
    return;
  }

  emit('range-hover', dayIso || '');
}

function clearDayHover() {
  emit('range-hover', '');
}

function handleClickOutside(event) {
  const rootElement = rootRef.value;
  if (!rootElement || !isPickerOpen.value) {
    return;
  }

  if (!rootElement.contains(event?.target)) {
    closePicker();
  }
}

function handleGlobalKeydown(event) {
  if (event?.key === 'Escape' && isPickerOpen.value) {
    closePicker();
  }
}

onMounted(() => {
  globalThis.addEventListener('mousedown', handleClickOutside);
  globalThis.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  globalThis.removeEventListener('mousedown', handleClickOutside);
  globalThis.removeEventListener('keydown', handleGlobalKeydown);
});

defineExpose({
  openPicker,
  closePicker
});
</script>

<template>
  <div ref="rootRef" class="sicat-date-field" :data-open="isPickerOpen">
    <button class="sicat-date-field-nav" type="button" :aria-label="previousDayAriaLabel" :disabled="disabled" @click="shiftDay(-1)">
      <span class="material-symbols-outlined">chevron_left</span>
    </button>
    <input
      :id="id"
      class="sicat-input sicat-date-field-input"
      :value="modelValue"
      type="text"
      inputmode="numeric"
      maxlength="10"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @input="setValue($event.target.value)"
      @blur="normalizeAndCommit"
    />
    <button class="sicat-date-field-picker" type="button" :aria-label="openCalendarAriaLabel" :disabled="disabled" @click="openPicker">
      <span class="material-symbols-outlined">calendar_month</span>
    </button>
    <button class="sicat-date-field-nav" type="button" :aria-label="nextDayAriaLabel" :disabled="disabled" @click="shiftDay(1)">
      <span class="material-symbols-outlined">chevron_right</span>
    </button>

    <dialog v-if="isPickerOpen" class="sicat-date-field-popover" open :aria-label="ariaLabel">
      <div class="sicat-date-field-header">
        <button class="sicat-date-field-popover-nav" type="button" aria-label="Mês anterior" @click="shiftMonth(-1)">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <strong>{{ monthLabel }}</strong>
        <button class="sicat-date-field-popover-nav" type="button" aria-label="Mês seguinte" @click="shiftMonth(1)">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <div class="sicat-date-field-weekdays">
        <span v-for="weekday in WEEKDAY_LABELS" :key="weekday">{{ weekday }}</span>
      </div>

      <div class="sicat-date-field-grid" @mouseleave="clearDayHover">
        <button
          v-for="day in dayGrid"
          :key="day.iso"
          type="button"
          class="sicat-date-field-day"
          :class="{
            muted: !day.isCurrentMonth,
            today: day.isToday,
            selected: day.isSelected,
            'range-preview': day.isPreviewInRange,
            'range-fill': day.isCommittedInRange,
            disabled: day.isDisabled
          }"
          :disabled="day.isDisabled"
          @mouseenter="handleDayHover(day.iso)"
          @click="selectDate(day.iso)"
        >
          {{ day.day }}
        </button>
      </div>

      <div class="sicat-date-field-actions">
        <button class="sicat-btn" type="button" @click="closePicker">Fechar</button>
        <button class="sicat-btn" type="button" @click="selectToday">Hoje</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.sicat-date-field {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
}

.sicat-date-field-input {
  min-width: 0;
}

.sicat-date-field-nav,
.sicat-date-field-picker {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sicat-date-field-nav:hover:not(:disabled),
.sicat-date-field-picker:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-bg-accent) 36%, var(--color-surface) 64%);
  border-color: var(--color-border-strong);
}

.sicat-date-field-nav:disabled,
.sicat-date-field-picker:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sicat-date-field-nav .material-symbols-outlined,
.sicat-date-field-picker .material-symbols-outlined {
  font-size: 20px;
}

.sicat-date-field-popover {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 20;
  width: min(320px, 92vw);
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-surface) 96%, white 4%);
  box-shadow: var(--shadow-lg);
}

.sicat-date-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  text-transform: capitalize;
}

.sicat-date-field-header strong {
  color: var(--color-text);
  font-weight: 800;
  letter-spacing: 0.01em;
}

.sicat-date-field-popover-nav {
  width: 30px;
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sicat-date-field-popover-nav:hover {
  background: color-mix(in srgb, var(--color-bg-accent) 42%, var(--color-surface) 58%);
  border-color: var(--color-border-strong);
}

.sicat-date-field-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-align: center;
}

.sicat-date-field-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.sicat-date-field-day {
  height: 34px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
}

.sicat-date-field-day:hover {
  background: color-mix(in srgb, var(--color-bg-accent) 40%, var(--color-surface) 60%);
}

.sicat-date-field-day.range-fill:not(.selected) {
  background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface) 84%);
}

.sicat-date-field-day.muted {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.sicat-date-field-day.today {
  border-color: var(--color-border-strong);
}

.sicat-date-field-day.selected {
  background: var(--color-primary);
  color: #fff;
}

.sicat-date-field-day.range-preview:not(.selected) {
  background: color-mix(in srgb, var(--color-primary) 24%, var(--color-surface) 76%);
}

.sicat-date-field-day.disabled,
.sicat-date-field-day:disabled {
  opacity: 0.32;
  cursor: not-allowed;
  background: transparent;
}

.sicat-date-field-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:global(:root[data-theme='dark']) .sicat-date-field-header strong {
  color: #f5f9ff;
}

:global(:root[data-theme='dark']) .sicat-date-field-popover-nav {
  background: color-mix(in srgb, var(--color-surface-raised) 88%, var(--color-surface) 12%);
  color: #eef6ff;
  border-color: color-mix(in srgb, var(--color-primary) 32%, var(--color-border) 68%);
}

:global(:root[data-theme='dark']) .sicat-date-field-popover-nav:hover {
  background: color-mix(in srgb, var(--color-primary) 22%, var(--color-surface-raised) 78%);
  border-color: color-mix(in srgb, var(--color-primary) 54%, var(--color-border-strong) 46%);
}

:global(:root[data-theme='dark']) .sicat-date-field-day.range-fill:not(.selected) {
  background: color-mix(in srgb, var(--color-primary) 34%, var(--color-surface) 66%);
  color: #edf5ff;
}

:global(:root[data-theme='dark']) .sicat-date-field-day.range-preview:not(.selected) {
  background: color-mix(in srgb, var(--color-primary) 48%, var(--color-surface-raised) 52%);
  color: #f7fbff;
}
</style>
