<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';

const store = useMainStore();
const addingCategory = ref(false);
const newCategory = ref('');
const managing = ref(false);
const newSpace = ref('');

const currentSpace = computed(() =>
  store.spaces.find((s) => s.id === store.selectedSpaceId) ?? store.spaces[0] ?? null
);
const spaceCategories = computed(() =>
  currentSpace.value ? store.categoriesBySpace(currentSpace.value.id) : []
);

function pickSpace(id) {
  store.selectedSpaceId = id;
  const first = store.categoriesBySpace(id)[0];
  store.selectedCategoryId = first?.id ?? null;
}

async function addCategory() {
  if (!newCategory.value.trim() || !currentSpace.value) return;
  const c = await api.createCategory({ space_id: currentSpace.value.id, name: newCategory.value.trim() });
  newCategory.value = '';
  addingCategory.value = false;
  await store.refreshAll();
  store.selectedCategoryId = c.id;
}

async function addSpace() {
  if (!newSpace.value.trim()) return;
  const s = await api.createSpace({ name: newSpace.value.trim() });
  newSpace.value = '';
  await store.refreshAll();
  pickSpace(s.id);
}
</script>

<template>
  <div class="category-switcher">
    <div class="row space-row">
      <select v-if="store.spaces.length" :value="currentSpace?.id" @change="pickSpace($event.target.value)" class="space-select">
        <option v-for="s in store.spaces" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <button v-else class="ghost" @click="managing = true">+ Space anlegen</button>
      <button class="ghost icon" @click="managing = !managing" title="Verwalten">⋯</button>
    </div>

    <div class="chips">
      <button
        v-for="c in spaceCategories"
        :key="c.id"
        class="chip"
        :class="{ active: c.id === store.selectedCategoryId }"
        @click="store.selectedCategoryId = c.id"
      >{{ c.name }}</button>
      <button v-if="!addingCategory && currentSpace" class="chip add" @click="addingCategory = true">+</button>
      <div v-if="addingCategory" class="chip-input">
        <input
          v-model="newCategory"
          placeholder="Kategorie…"
          @keyup.enter="addCategory"
          @keyup.escape="addingCategory = false"
          autofocus
        />
      </div>
    </div>

    <div v-if="managing" class="manage">
      <div class="row">
        <input v-model="newSpace" placeholder="Neuer Space…" @keyup.enter="addSpace" />
        <button class="primary" @click="addSpace">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-switcher {
  padding: var(--s-2) var(--s-3) 0;
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 5;
  border-bottom: 1px solid var(--border);
}
.space-row { margin-bottom: var(--s-2); }
.space-select {
  background: transparent;
  border: none;
  font-size: var(--fz-md);
  font-weight: 600;
  padding: 4px 0;
  min-height: 28px;
  width: auto;
  flex: 1;
  color: var(--text);
}
.space-select:focus { box-shadow: none; }
.chips {
  display: flex;
  gap: var(--s-1);
  overflow-x: auto;
  padding: 0 0 var(--s-2);
  scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: 0 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: var(--fz-sm);
  color: var(--text-2);
  min-height: 28px;
}
.chip.active {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: var(--accent);
  font-weight: 600;
}
.chip.add { padding: 4px 10px; }
.chip-input input { min-height: 28px; font-size: var(--fz-sm); padding: 4px 10px; width: 140px; }
.manage { padding: var(--s-2) 0; border-top: 1px dashed var(--border); }
</style>
