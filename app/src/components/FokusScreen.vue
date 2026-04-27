<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import TaskCard from './TaskCard.vue';

const store = useMainStore();

// expanded state per section; urgent sections open by default
const expanded = ref({
  overdue: true,
  today: true,
  noDeadline: true,
  later: false,
  inactive: false,
});
// upcoming day sections keyed by ISO date string, open by default
const upcomingExpanded = ref({});

function toggle(key) { expanded.value[key] = !expanded.value[key]; }
function toggleDay(key) { upcomingExpanded.value[key] = !(upcomingExpanded.value[key] ?? true); }
function isDayOpen(key) { return upcomingExpanded.value[key] ?? true; }

const activeTasks = computed(() =>
  store.tasks.filter((t) => t.is_active && t.status !== 'done' && t.status !== 'cancelled')
);
const inactiveTasks = computed(() =>
  store.tasks.filter((t) => !t.is_active && t.status !== 'done' && t.status !== 'cancelled')
);

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return localDateStr(new Date()); }
function dateOffsetStr(n) { const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); }
function parseDateStr(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }

// Normalize both YYYY-MM-DD and full ISO datetimes to a local date string for comparison
function deadlineDatePart(deadline) {
  if (!deadline) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline;
  return localDateStr(new Date(deadline)); // parse ISO datetime to local date
}

const overdue = computed(() => {
  const t = todayStr();
  return activeTasks.value
    .filter((task) => task.deadline && deadlineDatePart(task.deadline) < t)
    .sort((a, b) => (deadlineDatePart(a.deadline) < deadlineDatePart(b.deadline) ? -1 : 1));
});

const today = computed(() => {
  const t = todayStr();
  return activeTasks.value.filter((task) => task.deadline && deadlineDatePart(task.deadline) === t);
});

const noDeadline = computed(() => activeTasks.value.filter((t) => !t.deadline));

const upcomingDays = computed(() => {
  const t = todayStr();
  const cutoff = dateOffsetStr(7);
  const tasks = activeTasks.value.filter((task) => {
    const dp = deadlineDatePart(task.deadline);
    return dp && dp > t && dp <= cutoff;
  });
  const groups = {};
  for (const task of tasks) {
    const key = deadlineDatePart(task.deadline);
    if (!groups[key]) groups[key] = { dateStr: key, date: parseDateStr(key), tasks: [] };
    groups[key].tasks.push(task);
  }
  return Object.values(groups)
    .sort((a, b) => (a.dateStr < b.dateStr ? -1 : 1))
    .map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => (deadlineDatePart(a.deadline) < deadlineDatePart(b.deadline) ? -1 : 1)) }));
});

const later = computed(() => {
  const cutoff = dateOffsetStr(7);
  return activeTasks.value
    .filter((t) => t.deadline && deadlineDatePart(t.deadline) > cutoff)
    .sort((a, b) => (deadlineDatePart(a.deadline) < deadlineDatePart(b.deadline) ? -1 : 1));
});

const isEmpty = computed(() =>
  !overdue.value.length && !today.value.length && !noDeadline.value.length &&
  !upcomingDays.value.length && !later.value.length && !inactiveTasks.value.length
);

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function fmtDayHeader(d) {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`;
}

function contextFor(task) {
  const cat = store.categories.find((c) => c.id === task.category_id);
  const space = store.spaces.find((s) => s.id === cat?.space_id);
  if (cat && space) return `${space.name} · ${cat.name}`;
  return cat?.name ?? '';
}

function openTask(task) { store.selectedTaskId = task.id; }
</script>

<template>
  <div class="fokus-screen">
    <div class="list">
      <div v-if="isEmpty" class="empty">
        Keine aktiven Aufgaben. Alles erledigt — oder noch nichts geplant.
      </div>

      <!-- Überfällig -->
      <section v-if="overdue.length" class="group">
        <button class="group-header toggle overdue" @click="toggle('overdue')">
          <svg class="chevron" :class="{ open: expanded.overdue }" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
          <span class="group-title">Überfällig</span>
          <span class="group-badge overdue-badge">{{ overdue.length }}</span>
        </button>
        <template v-if="expanded.overdue">
          <TaskCard v-for="t in overdue" :key="t.id" :task="t" :context="contextFor(t)" @open="openTask" />
        </template>
      </section>

      <!-- Heute -->
      <section v-if="today.length" class="group">
        <button class="group-header toggle" @click="toggle('today')">
          <svg class="chevron" :class="{ open: expanded.today }" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
          <span class="group-title">Heute</span>
          <span class="group-badge">{{ today.length }}</span>
        </button>
        <template v-if="expanded.today">
          <TaskCard v-for="t in today" :key="t.id" :task="t" :context="contextFor(t)" @open="openTask" />
        </template>
      </section>

      <!-- Kein Datum -->
      <section v-if="noDeadline.length" class="group">
        <button class="group-header toggle" @click="toggle('noDeadline')">
          <svg class="chevron" :class="{ open: expanded.noDeadline }" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
          <span class="group-title">Kein Datum</span>
          <span class="group-badge">{{ noDeadline.length }}</span>
        </button>
        <template v-if="expanded.noDeadline">
          <TaskCard v-for="t in noDeadline" :key="t.id" :task="t" :context="contextFor(t)" @open="openTask" />
        </template>
      </section>

      <!-- Nächste Tage (day-by-day, each collapsible) -->
      <section v-for="day in upcomingDays" :key="day.dateStr" class="group">
        <button class="group-header toggle" @click="toggleDay(day.dateStr)">
          <svg class="chevron" :class="{ open: isDayOpen(day.dateStr) }" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
          <span class="group-title">{{ fmtDayHeader(day.date) }}</span>
          <span class="group-badge">{{ day.tasks.length }}</span>
        </button>
        <template v-if="isDayOpen(day.dateStr)">
          <TaskCard v-for="t in day.tasks" :key="t.id" :task="t" :context="contextFor(t)" @open="openTask" />
        </template>
      </section>

      <!-- Später -->
      <section v-if="later.length" class="group">
        <button class="group-header toggle" @click="toggle('later')">
          <svg class="chevron" :class="{ open: expanded.later }" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
          <span class="group-title">Später</span>
          <span class="group-badge">{{ later.length }}</span>
        </button>
        <template v-if="expanded.later">
          <TaskCard v-for="t in later" :key="t.id" :task="t" :context="contextFor(t)" @open="openTask" />
        </template>
      </section>

      <!-- Inaktiv -->
      <section v-if="inactiveTasks.length" class="group">
        <button class="group-header toggle" @click="toggle('inactive')">
          <svg class="chevron" :class="{ open: expanded.inactive }" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
          <span class="group-title">Inaktiv</span>
          <span class="group-badge">{{ inactiveTasks.length }}</span>
        </button>
        <template v-if="expanded.inactive">
          <TaskCard v-for="t in inactiveTasks" :key="t.id" :task="t" :context="contextFor(t)" @open="openTask" />
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fokus-screen { display: flex; flex-direction: column; height: 100%; }
.list {
  padding: var(--s-3);
  padding-bottom: var(--s-6);
}

.group { margin-bottom: var(--s-1); }

.group-header {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-1) var(--s-1);
  margin-bottom: var(--s-1);
}
.group-header.toggle {
  background: transparent;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  width: 100%;
  text-align: left;
  min-height: unset;
}
.group-header.toggle:hover { background: var(--surface-2); }

.group-title {
  font-size: var(--fz-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  flex: 1;
}
.group-header.overdue .group-title { color: var(--danger); }

.group-badge {
  font-size: 10px;
  font-weight: 700;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  text-align: center;
}
.overdue-badge {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  color: var(--danger);
}

.chevron { transition: transform 180ms ease; flex: 0 0 auto; color: var(--muted); }
.chevron.open { transform: rotate(90deg); }

@media (min-width: 720px) {
  .list { padding: var(--s-4); max-width: 720px; margin: 0 auto; width: 100%; }
}
</style>
