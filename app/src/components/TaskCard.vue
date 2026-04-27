<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';
import { statusLabel } from '../utils/labels.js';

const props = defineProps({
  task: Object,
  context: { type: String, default: '' },
});
const emit = defineEmits(['open']);
const store = useMainStore();

// --- Swipe state ---
const offset = ref(0);
const swiping = ref(false);
const snapped = ref(false);
const committed = ref(false);
const rescheduleOpen = ref(false);
let startX = 0;
let startY = 0;
let locked = null; // null | 'x' | 'y'

const COMPLETE_THRESHOLD = 70;
const ACTION_THRESHOLD = -60;
const SNAP_WIDTH = 156;

const hasMeta = computed(() => {
  const t = props.task;
  return t.status !== 'open' || t.is_blocked || !t.is_active || t.deadline || t.follow_up_at || t.responsible || t.recurrence;
});

function onStart(e) {
  if (committed.value) return;
  const t = e.touches?.[0] ?? e;
  startX = t.clientX;
  startY = t.clientY;
  locked = null;
  swiping.value = true;
}
function onMove(e) {
  if (!swiping.value) return;
  const t = e.touches?.[0] ?? e;
  const dx = t.clientX - startX;
  const dy = t.clientY - startY;
  if (locked === null) {
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) locked = 'x';
    else if (Math.abs(dy) > 8) locked = 'y';
  }
  if (locked !== 'x') return;
  e.preventDefault();
  if (snapped.value) {
    offset.value = Math.max(-SNAP_WIDTH, Math.min(40, -SNAP_WIDTH + dx));
  } else {
    offset.value = Math.max(-SNAP_WIDTH, Math.min(120, dx));
  }
}
async function onEnd() {
  if (!swiping.value) return;
  swiping.value = false;
  const dx = offset.value;

  if (snapped.value) {
    if (dx > -SNAP_WIDTH + 40) resetSnap();
    else offset.value = -SNAP_WIDTH;
    locked = null;
    return;
  }

  if (dx >= COMPLETE_THRESHOLD) {
    committed.value = true;
    offset.value = 300;
    await doComplete();
    reset();
  } else if (dx <= ACTION_THRESHOLD) {
    snapped.value = true;
    offset.value = -SNAP_WIDTH;
  } else {
    offset.value = 0;
  }
  locked = null;
}
function reset() {
  setTimeout(() => { offset.value = 0; committed.value = false; }, 200);
}
function resetSnap() {
  rescheduleOpen.value = false;
  snapped.value = false;
  offset.value = 0;
}

async function doComplete() {
  if (props.task.status === 'done') {
    await api.updateTask(props.task.id, { status: 'open' });
  } else {
    await api.completeTask(props.task.id);
  }
  await store.refreshTasks();
}

async function toggleCheckbox(e) {
  e.stopPropagation();
  await doComplete();
}

function openReschedule(e) {
  e.stopPropagation();
  rescheduleOpen.value = true;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function reschedule(type) {
  if (type === 'none') {
    await api.updateTask(props.task.id, { deadline: null });
    await store.refreshTasks();
    resetSnap();
    return;
  }
  const d = new Date();
  if (type === 'today') {
    // already today
  } else if (type === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else if (type === 'nextweek') {
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? 1 : 8 - day));
  }
  await api.updateTask(props.task.id, { deadline: toDateStr(d) });
  await store.refreshTasks();
  resetSnap();
}

function openSheet(e) {
  e.stopPropagation();
  emit('open', props.task);
  resetSnap();
}

function onCardClick() {
  if (rescheduleOpen.value) { rescheduleOpen.value = false; return; }
  if (snapped.value) { resetSnap(); return; }
  emit('open', props.task);
}

function recurrenceLabel(rec) {
  if (!rec) return '';
  if (rec.type === 'interval') return `alle ${rec.every} ${unitLabel(rec.unit, rec.every)}`;
  if (rec.type === 'weekly') {
    const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return rec.weekdays.map((d) => names[d]).join('·');
  }
  return '';
}
function unitLabel(u, n) {
  const plural = n > 1;
  return ({ day: plural ? 'Tage' : 'Tag', week: plural ? 'Wochen' : 'Woche', month: plural ? 'Monate' : 'Monat' }[u] || u);
}
function fmtDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const now = new Date();
    if (y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate()) return 'Heute';
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`;
  }
  // Fallback for datetime strings (follow_up_at)
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <div
    class="card-wrap"
    @touchstart.passive="onStart"
    @touchmove="onMove"
    @touchend="onEnd"
    @touchcancel="onEnd"
    @mousedown.prevent="onStart"
    @mousemove="swiping ? onMove($event) : null"
    @mouseup="onEnd"
    @mouseleave="swiping ? onEnd() : null"
  >
    <!-- Complete reveal (right swipe) -->
    <div
      class="bg-complete"
      :style="{ opacity: snapped ? 0 : Math.min(1, offset / COMPLETE_THRESHOLD) }"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z"/>
      </svg>
      <span>{{ task.status === 'done' ? 'Wieder öffnen' : 'Erledigt' }}</span>
    </div>

    <!-- Actions reveal (left swipe) -->
    <div class="bg-actions" :class="{ snapped }">
      <button class="action-btn reschedule-btn" @click="openReschedule" @mousedown.stop>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H18V1H16V3H8V1H6V3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 19H5V8H19M7 10H12V15H7V10Z"/>
        </svg>
        Verschieben
      </button>
      <button class="action-btn details-btn" @click="openSheet" @mousedown.stop>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2M18 20H6V4H13V9H18V20M9 13V19H7V13H9M15 15V19H17V15H15M11 11V19H13V11H11Z"/>
        </svg>
        Detail
      </button>
    </div>

    <!-- Card -->
    <div
      class="card"
      :class="{
        done: task.status === 'done',
        inactive: !task.is_active,
        swiping,
      }"
      :style="{ transform: `translateX(${offset}px)` }"
      @click="onCardClick"
    >
      <!-- Reschedule overlay -->
      <div v-if="rescheduleOpen" class="reschedule-overlay" @click.stop>
        <button class="rdate-btn" @click.stop="reschedule('today')">
          <span class="rdate-label">Heute</span>
        </button>
        <button class="rdate-btn" @click.stop="reschedule('tomorrow')">
          <span class="rdate-label">Morgen</span>
        </button>
        <button class="rdate-btn" @click.stop="reschedule('nextweek')">
          <span class="rdate-label">Nächste Woche</span>
          <span class="rdate-time">Montag</span>
        </button>
        <button class="rdate-btn rdate-none" @click.stop="reschedule('none')">
          <span class="rdate-label">Kein Datum</span>
        </button>
      </div>

      <template v-else>
        <label class="check-wrap" @click.stop>
          <input
            type="checkbox"
            class="check"
            :checked="task.status === 'done'"
            @change="toggleCheckbox"
          />
        </label>
        <div class="body">
          <div class="title">
            {{ task.title }}<span v-if="context" class="context-inline"> · {{ context }}</span>
          </div>
          <div v-if="hasMeta" class="meta">
            <span v-if="task.status !== 'open'" class="status-badge" :class="'status-' + task.status">{{ statusLabel(task.status) }}</span>
            <span v-if="task.is_blocked" class="status-badge badge-blocked">blockiert</span>
            <span v-if="!task.is_active" class="status-badge badge-inactive">inaktiv</span>
            <span v-if="task.deadline" class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22 22 17.52 22 12 17.52 2 12 2M12.5 7H11V13L16.25 16.15L17 14.92L12.5 12.25V7Z"/>
              </svg>
              {{ fmtDate(task.deadline) }}
            </span>
            <span v-if="task.follow_up_at && task.status === 'waiting'" class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V20H3V19L5 17V11C5 7.9 7.02 5.17 10 4.29V4C10 2.9 10.9 2 12 2S14 2.9 14 4V4.29C16.98 5.17 19 7.9 19 11V17L21 19M14 21C14 22.11 13.11 23 12 23S10 22.11 10 21"/>
              </svg>
              {{ fmtDate(task.follow_up_at) }}
            </span>
            <span v-if="task.responsible" class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4z"/>
              </svg>
              {{ task.responsible }}
            </span>
            <span v-if="task.recurrence" class="meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 17H7v-3l-4 4 4 4v-3h12v-6h-2M7 7h10v3l4-4-4-4v3H5v6h2V7z"/>
              </svg>
              {{ recurrenceLabel(task.recurrence) }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.card-wrap {
  position: relative;
  margin: 0 0 var(--s-2);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: transparent;
  user-select: none;
}
.card {
  display: flex;
  gap: var(--s-3);
  align-items: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s-3);
  cursor: pointer;
  position: relative;
  z-index: 1;
  overflow: hidden;
  transition: transform 180ms cubic-bezier(0.25, 0.8, 0.25, 1), background 100ms;
  touch-action: pan-y;
  min-height: 56px;
}
.card.swiping { transition: none; }
.card:hover { background: var(--surface-2); }
.card.done { opacity: 0.55; }
.card.done .title { text-decoration: line-through; color: var(--muted); }
.card.inactive { opacity: 0.55; }

.check-wrap { padding-top: 2px; cursor: pointer; flex: 0 0 auto; }
.check { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; }

.body { flex: 1; min-width: 0; }
.title { font-size: var(--fz-md); font-weight: 500; color: var(--text); word-break: break-word; }
.meta {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
  font-size: var(--fz-xs);
  color: var(--text-2);
}
.meta-item { white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; }
.context-inline { color: var(--muted); font-weight: 400; font-size: 0.8em; }

/* Reschedule overlay (inside .card) */
.reschedule-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 2px;
  background: var(--surface);
  border-radius: calc(var(--r-lg) - 1px);
  z-index: 2;
}
.rdate-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: var(--surface-2);
  border: none;
  border-radius: calc(var(--r-lg) - 3px);
  min-height: unset;
  padding: var(--s-1) var(--s-2);
  cursor: pointer;
  transition: background 100ms;
}
.rdate-btn:hover { background: var(--accent-soft); }
.rdate-label { font-size: var(--fz-xs); font-weight: 600; color: var(--text); }
.rdate-time { font-size: 10px; color: var(--muted); }
.rdate-none .rdate-label { color: var(--muted); font-weight: 400; }

/* Right-swipe complete layer */
.bg-complete {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--s-4);
  font-weight: 600;
  font-size: var(--fz-sm);
  border-radius: var(--r-lg);
  color: white;
  background: var(--ok);
  pointer-events: none;
}

/* Left-swipe actions layer */
.bg-actions {
  position: absolute;
  top: 1px; right: 0; bottom: 1px;
  width: v-bind('SNAP_WIDTH + "px"');
  display: flex;
  pointer-events: none;
  border-radius: 0 var(--r-lg) var(--r-lg) 0;
  overflow: hidden;
}
.bg-actions.snapped { pointer-events: auto; }

.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: var(--fz-xs);
  font-weight: 600;
  border: none;
  cursor: pointer;
  border-radius: 0;
  min-height: unset;
  padding: 0;
}
.reschedule-btn {
  background: var(--accent);
  color: var(--accent-contrast);
}
.reschedule-btn:hover { background: var(--accent); opacity: 0.9; }
.details-btn {
  background: var(--surface-2);
  color: var(--text);
  border-left: 1px solid var(--border);
}
.details-btn:hover { background: var(--surface-2); opacity: 0.9; }
</style>
