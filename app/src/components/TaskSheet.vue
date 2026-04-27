<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';
import { statusLabel } from '../utils/labels.js';

const store = useMainStore();

const task = computed(() => store.selectedTask);
const isCreating = computed(() => store.newTaskCategoryId !== null && !task.value);
const open = computed(() => !!task.value || isCreating.value);

function close() {
  store.selectedTaskId = null;
  store.clearNewTask();
}

const form = ref({});
const titleRef = ref(null);
const showDeadlineTime = ref(false);
const metadataText = ref('');
const fullDetail = ref(null);
const recType = ref('none');
const recUnit = ref('day');
const recEvery = ref(1);
const recWeekdays = ref([]);
const showAdvanced = ref(false);

const WEEKDAYS = [
  { n: 1, label: 'Mo' }, { n: 2, label: 'Di' }, { n: 3, label: 'Mi' },
  { n: 4, label: 'Do' }, { n: 5, label: 'Fr' }, { n: 6, label: 'Sa' }, { n: 0, label: 'So' },
];

const categoriesGrouped = computed(() =>
  store.spaces.map((s) => ({ space: s, categories: store.categoriesBySpace(s.id) }))
    .filter((g) => g.categories.length)
);
const allTasks = computed(() => task.value ? store.tasks.filter((t) => t.id !== task.value.id) : []);

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Offen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'waiting',     label: 'Wartet' },
  { value: 'done',        label: 'Erledigt' },
  { value: 'cancelled',   label: 'Verworfen' },
];

const pad = (n) => String(n).padStart(2, '0');

function loadDeadline(deadline) {
  if (!deadline) {
    form.value.deadline = '';
    form.value.deadlineTime = '';
    showDeadlineTime.value = false;
    return;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    form.value.deadline = deadline;
    form.value.deadlineTime = '';
    showDeadlineTime.value = false;
  } else {
    // ISO datetime → split into local date + time parts
    const d = new Date(deadline);
    form.value.deadline = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    form.value.deadlineTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    showDeadlineTime.value = true;
  }
}

function saveDeadline() {
  if (!form.value.deadline) return null;
  if (showDeadlineTime.value && form.value.deadlineTime) {
    const [y, m, d] = form.value.deadline.split('-').map(Number);
    const [h, min] = form.value.deadlineTime.split(':').map(Number);
    return new Date(y, m - 1, d, h, min).toISOString();
  }
  return form.value.deadline; // date-only string
}

// follow_up_at: full datetime
function toDatetimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeInput(val) { return val ? new Date(val).toISOString() : null; }

function loadRecurrence(r) {
  if (!r) { recType.value = 'none'; recWeekdays.value = []; return; }
  if (r.type === 'interval') { recType.value = 'interval'; recUnit.value = r.unit; recEvery.value = r.every; }
  else if (r.type === 'weekly') { recType.value = 'weekly'; recWeekdays.value = [...r.weekdays]; }
}
function buildRecurrence() {
  if (recType.value === 'none') return null;
  if (recType.value === 'interval') return { type: 'interval', unit: recUnit.value, every: Number(recEvery.value) };
  if (recType.value === 'weekly') return { type: 'weekly', weekdays: [...recWeekdays.value].sort() };
  return null;
}
function toggleWeekday(n) {
  const i = recWeekdays.value.indexOf(n);
  if (i >= 0) recWeekdays.value.splice(i, 1);
  else recWeekdays.value.push(n);
}

watch([task, isCreating], async ([t, creating]) => {
  if (!t && !creating) { fullDetail.value = null; return; }
  if (creating) {
    form.value = {
      title: '',
      description: '',
      status: 'open',
      responsible: '',
      deadline: '',
      deadlineTime: '',
      follow_up_at: '',
      category_id: store.newTaskCategoryId,
      is_active: true,
    };
    showDeadlineTime.value = false;
    nextTick(() => titleRef.value?.focus());
    metadataText.value = '';
    loadRecurrence(null);
    fullDetail.value = null;
    showAdvanced.value = true;  // show all fields for new tasks
    return;
  }
  form.value = {
    title: t.title,
    description: t.description ?? '',
    status: t.status,
    responsible: t.responsible ?? '',
    deadline: '',
    deadlineTime: '',
    follow_up_at: toDatetimeInput(t.follow_up_at),
    category_id: t.category_id,
    is_active: t.is_active !== false,
  };
  loadDeadline(t.deadline);
  nextTick(() => titleRef.value?.focus());
  metadataText.value = t.metadata ? JSON.stringify(t.metadata, null, 2) : '';
  loadRecurrence(t.recurrence);
  showAdvanced.value = false;  // collapsed for existing tasks
  fullDetail.value = await api.getTask(t.id);
}, { immediate: true });

async function save() {
  let metadata;
  try { metadata = metadataText.value.trim() ? JSON.parse(metadataText.value) : null; }
  catch { alert('Metadata ist kein gültiges JSON'); return; }

  const payload = {
    ...form.value,
    deadline: saveDeadline(),
    follow_up_at: fromDatetimeInput(form.value.follow_up_at),
    metadata,
    recurrence: buildRecurrence(),
  };

  try {
    if (isCreating.value) {
      await api.createTask(payload);
    } else {
      await api.updateTask(task.value.id, payload);
    }
    await store.refreshTasks();
    close();
  } catch (e) { alert(e.message); }
}

async function remove() {
  if (!confirm('Aufgabe löschen?')) return;
  await api.deleteTask(task.value.id);
  close();
  await store.refreshTasks();
}

async function skipRecurrence() {
  await api.skipTask(task.value.id);
  await store.refreshTasks();
  fullDetail.value = await api.getTask(task.value.id);
}

const blockerSelect = ref('');
const addingBlocker = ref(false);
async function addBlocker() {
  if (!blockerSelect.value) return;
  try {
    await api.addDependency(task.value.id, blockerSelect.value);
    fullDetail.value = await api.getTask(task.value.id);
    blockerSelect.value = ''; addingBlocker.value = false;
    await store.refreshTasks();
  } catch (e) { alert(e.message); }
}
async function removeBlocker(depId) {
  await api.removeDependency(task.value.id, depId);
  fullDetail.value = await api.getTask(task.value.id);
  await store.refreshTasks();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-backdrop" @click.self="close">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-head">
            <input ref="titleRef" class="title-input" v-model="form.title" placeholder="Titel" />
            <button class="ghost icon" @click="close" title="Schließen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <div class="sheet-body">
            <!-- Core fields: always visible -->
            <div class="row">
              <label class="field" style="flex: 1;">
                <span>Status</span>
                <select v-model="form.status">
                  <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </label>
              <div class="field" style="flex: 1;">
                <span>Deadline</span>
                <div class="deadline-row">
                  <input type="date" v-model="form.deadline" style="flex: 1;" />
                  <button
                    v-if="!showDeadlineTime"
                    class="ghost time-add-btn"
                    type="button"
                    @click="showDeadlineTime = true"
                    tabindex="-1"
                  >+ Zeit</button>
                  <template v-else>
                    <input type="time" v-model="form.deadlineTime" class="time-input" />
                    <button class="ghost time-add-btn" type="button" @click="showDeadlineTime = false; form.deadlineTime = ''" tabindex="-1">✕</button>
                  </template>
                </div>
              </div>
            </div>

            <label class="field">
              <span>Beschreibung</span>
              <textarea v-model="form.description" rows="3"></textarea>
            </label>

            <!-- Advanced toggle -->
            <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
              <svg
                class="chevron"
                :class="{ open: showAdvanced }"
                width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
              >
                <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
              </svg>
              <span>{{ showAdvanced ? 'Weniger' : 'Mehr Felder' }}</span>
            </button>

            <!-- Advanced fields -->
            <template v-if="showAdvanced">
              <label class="field">
                <span>Kategorie</span>
                <select v-model="form.category_id">
                  <optgroup v-for="g in categoriesGrouped" :key="g.space.id" :label="g.space.name">
                    <option v-for="c in g.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </optgroup>
                </select>
              </label>

              <label class="field">
                <span>Verantwortlich</span>
                <input v-model="form.responsible" placeholder="Wer ist dran?" />
              </label>

              <label class="field" v-if="form.status === 'waiting'">
                <span>Nachhaken am</span>
                <input type="datetime-local" v-model="form.follow_up_at" />
              </label>


              <label class="check-row">
                <input type="checkbox" v-model="form.is_active" />
                <span>Aktiv (Scheduler-Trigger)</span>
              </label>

              <fieldset class="recurrence">
                <legend>Wiederholung</legend>
                <div class="row rec-type">
                  <label><input type="radio" value="none" v-model="recType" /> Einmalig</label>
                  <label><input type="radio" value="interval" v-model="recType" /> Intervall</label>
                  <label><input type="radio" value="weekly" v-model="recType" /> Wochentage</label>
                </div>
                <div v-if="recType === 'interval'" class="row">
                  alle <input type="number" min="1" v-model="recEvery" style="width: 70px;" />
                  <select v-model="recUnit" style="flex: 0 0 auto; width: auto;">
                    <option value="day">Tage</option>
                    <option value="week">Wochen</option>
                    <option value="month">Monate</option>
                  </select>
                </div>
                <div v-if="recType === 'weekly'" class="weekday-row">
                  <button
                    v-for="d in WEEKDAYS"
                    :key="d.n"
                    type="button"
                    class="wd"
                    :class="{ active: recWeekdays.includes(d.n) }"
                    @click="toggleWeekday(d.n)"
                  >{{ d.label }}</button>
                </div>
                <div v-if="recType !== 'none' && task?.recurrence" style="margin-top: 6px;">
                  <button class="ghost skip-btn" @click="skipRecurrence">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18V6l8.5 6L6 18zm8.5-6V6H17v12h-2.5V12z"/>
                    </svg>
                    Überspringen
                  </button>
                </div>
              </fieldset>

              <label class="field">
                <span>Metadata (JSON)</span>
                <textarea v-model="metadataText" class="mono" rows="3"
                  placeholder='{ "url": "…", "tel": "tel:+49…", "email": "…" }'></textarea>
              </label>

              <section class="deps" v-if="fullDetail">
                <div class="deps-title">Blockiert von</div>
                <div v-if="!fullDetail.blocking.length" class="empty-inline">Keine.</div>
                <div v-for="t in fullDetail.blocking" :key="t.dep_id" class="dep-row">
                  <span>{{ t.title }}</span>
                  <div class="row" style="gap: 4px;">
                    <span class="status-badge" :class="'status-' + t.status">{{ statusLabel(t.status) }}</span>
                    <button class="ghost icon" @click="removeBlocker(t.dep_id)" title="Entfernen">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="row" style="margin-top: 6px;">
                  <button v-if="!addingBlocker" class="ghost" @click="addingBlocker = true">+ Blocker</button>
                  <template v-else>
                    <select v-model="blockerSelect">
                      <option value="">– wählen –</option>
                      <option v-for="t in allTasks" :key="t.id" :value="t.id">{{ t.title }}</option>
                    </select>
                    <button class="primary" @click="addBlocker">OK</button>
                    <button @click="addingBlocker = false">Abbrechen</button>
                  </template>
                </div>
              </section>
            </template>
          </div>

          <div class="sheet-footer">
            <button v-if="!isCreating" class="danger" @click="remove">Löschen</button>
            <div class="spacer"></div>
            <button @click="close">Schließen</button>
            <button class="primary" @click="save">{{ isCreating ? 'Erstellen' : 'Speichern' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 900;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  background: var(--surface);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  box-shadow: var(--shadow-2);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--border-strong);
  border-radius: 2px;
  margin: 8px auto;
  flex: 0 0 auto;
}
.sheet-head {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-3) var(--s-2);
  flex: 0 0 auto;
}
.title-input {
  font-size: var(--fz-lg);
  font-weight: 600;
  border: none;
  background: transparent;
  padding: 4px 0;
  min-height: 32px;
}
.title-input:focus { border: none; box-shadow: none; }
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--s-3) var(--s-4);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.sheet-footer {
  display: flex;
  gap: var(--s-2);
  padding: var(--s-3);
  border-top: 1px solid var(--border);
  flex: 0 0 auto;
  padding-bottom: calc(var(--s-3) + var(--safe-bottom));
}

.field { display: flex; flex-direction: column; gap: 4px; }
.deadline-row { display: flex; gap: var(--s-1); align-items: center; }
.time-input { width: 90px; flex: 0 0 auto; }
.time-add-btn { min-height: 32px; padding: 0 8px; font-size: var(--fz-xs); flex: 0 0 auto; }
.field > span {
  font-size: var(--fz-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.check-row { display: flex; gap: var(--s-2); align-items: center; }

.advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  padding: 6px var(--s-2);
  font-size: var(--fz-xs);
  color: var(--text-2);
  cursor: pointer;
  align-self: flex-start;
}
.advanced-toggle:hover { border-color: var(--accent); color: var(--accent); background: transparent; }
.chevron { transition: transform 180ms ease; }
.chevron.open { transform: rotate(90deg); }

fieldset.recurrence {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
fieldset.recurrence legend {
  font-size: var(--fz-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  padding: 0 4px;
}
.rec-type label { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fz-sm); }
.weekday-row { display: flex; gap: 4px; flex-wrap: wrap; }
.wd { padding: 4px 10px; min-height: 28px; border-radius: 999px; font-size: var(--fz-xs); }
.wd.active { background: var(--accent); color: var(--accent-contrast); border-color: var(--accent); font-weight: 600; }
.skip-btn { display: inline-flex; align-items: center; gap: 4px; }

.deps-title {
  font-size: var(--fz-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  margin-bottom: 4px;
}
.dep-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-size: var(--fz-sm);
}
.empty-inline { color: var(--muted); font-size: var(--fz-xs); }

@media (min-width: 720px) {
  .sheet-backdrop { align-items: center; padding: var(--s-4); }
  .sheet { border-radius: var(--r-xl); max-width: 560px; max-height: 85vh; }
}

.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(100%); }
.sheet-enter-active .sheet, .sheet-leave-active .sheet { transition: transform 220ms cubic-bezier(0.25, 0.8, 0.25, 1); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-active, .sheet-leave-active { transition: opacity 200ms ease; }
</style>
