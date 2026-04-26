<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import CategorySwitcher from './CategorySwitcher.vue';
import TaskCard from './TaskCard.vue';

const store = useMainStore();
const doneExpanded = ref(false);

const category = computed(() =>
  store.categories.find((c) => c.id === store.selectedCategoryId) ?? null
);
const tasks = computed(() =>
  store.selectedCategoryId ? store.tasksByCategory(store.selectedCategoryId) : []
);
const activeTasks = computed(() => tasks.value.filter((t) => t.is_active && t.status !== 'done' && t.status !== 'cancelled'));
const doneTasks = computed(() => tasks.value.filter((t) => t.status === 'done' || t.status === 'cancelled'));
const inactiveTasks = computed(() => tasks.value.filter((t) => !t.is_active && t.status !== 'done' && t.status !== 'cancelled'));

function openTask(task) {
  store.selectedTaskId = task.id;
}
</script>

<template>
  <div class="tasks-screen">
    <CategorySwitcher />

    <div class="list">
      <template v-if="!category">
        <div class="empty">
          Lege einen Space und eine Kategorie an, um Aufgaben zu verwalten.
        </div>
      </template>
      <template v-else>
        <div v-if="!tasks.length" class="empty">Noch keine Aufgaben in dieser Kategorie.</div>

        <TaskCard v-for="t in activeTasks" :key="t.id" :task="t" @open="openTask" />

        <div v-if="inactiveTasks.length" class="group-label">Inaktiv</div>
        <TaskCard v-for="t in inactiveTasks" :key="t.id" :task="t" @open="openTask" />

        <template v-if="doneTasks.length">
          <button class="group-toggle" @click="doneExpanded = !doneExpanded">
            <svg
              class="chevron"
              :class="{ open: doneExpanded }"
              width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
            >
              <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
            </svg>
            <span>Erledigt</span>
            <span class="done-badge">{{ doneTasks.length }}</span>
          </button>
          <template v-if="doneExpanded">
            <TaskCard v-for="t in doneTasks" :key="t.id" :task="t" @open="openTask" />
          </template>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tasks-screen { display: flex; flex-direction: column; height: 100%; }
.list {
  padding: var(--s-3);
  padding-bottom: var(--s-6);
}
.group-label {
  font-size: var(--fz-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: var(--s-4) 0 var(--s-2);
  font-weight: 600;
}
.group-toggle {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  background: transparent;
  border: none;
  border-radius: var(--r-md);
  padding: var(--s-1) 0;
  margin: var(--s-3) 0 var(--s-2);
  color: var(--muted);
  font-size: var(--fz-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.group-toggle:hover { color: var(--text-2); background: transparent; }
.chevron { transition: transform 180ms ease; flex: 0 0 auto; }
.chevron.open { transform: rotate(90deg); }
.done-badge {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  text-align: center;
}

@media (min-width: 720px) {
  .list { padding: var(--s-4); max-width: 720px; margin: 0 auto; width: 100%; }
}
</style>
