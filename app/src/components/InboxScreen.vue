<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';

const store = useMainStore();
const newContent = ref('');
const convertTarget = ref(null);
const convertCategoryId = ref('');
const editingId = ref(null);
const editText = ref('');

const categoryOptions = computed(() =>
  store.spaces.map((s) => ({ space: s, categories: store.categoriesBySpace(s.id) }))
    .filter((g) => g.categories.length)
);

const originIcon = { keyboard: '⌨', agent: '🤖', siri_shortcut: '🎙' };

async function add() {
  if (!newContent.value.trim()) return;
  await api.createInboxItem(newContent.value.trim(), 'keyboard');
  newContent.value = '';
  await store.refreshInbox();
}
async function remove(item) {
  if (!confirm('Löschen?')) return;
  await api.deleteInboxItem(item.id);
  await store.refreshInbox();
}
function startEdit(item) { editingId.value = item.id; editText.value = item.content; }
async function saveEdit(item) {
  await api.updateInboxItem(item.id, editText.value);
  editingId.value = null;
  await store.refreshInbox();
}
function startConvert(item) {
  convertTarget.value = item;
  convertCategoryId.value = store.selectedCategoryId || '';
}
async function confirmConvert() {
  if (!convertCategoryId.value) return;
  try {
    await api.convertInboxItem(convertTarget.value.id, { category_id: convertCategoryId.value });
    convertTarget.value = null;
    await Promise.all([store.refreshInbox(), store.refreshTasks()]);
  } catch (e) { alert(e.message); }
}
</script>

<template>
  <div class="inbox-screen">
    <div class="inbox-list">
      <div v-if="!store.inboxItems.length" class="empty">
        Inbox ist leer. Alles weggearbeitet — oder noch nichts angefangen.
      </div>

      <div
        v-for="item in store.inboxItems"
        :key="item.id"
        class="inbox-item"
      >
        <div class="item-head">
          <span class="origin" :title="item.origin">{{ originIcon[item.origin] ?? '?' }}</span>
          <div v-if="editingId === item.id" class="edit-row">
            <input
              v-model="editText"
              @keyup.enter="saveEdit(item)"
              @keyup.escape="editingId = null"
              autofocus
            />
            <button class="primary icon" @click="saveEdit(item)">✓</button>
            <button class="ghost icon" @click="editingId = null">✕</button>
          </div>
          <div v-else class="content" @click="startEdit(item)">{{ item.content }}</div>
        </div>
        <div class="item-foot">
          <span class="time">{{ new Date(item.created_at).toLocaleDateString() }}</span>
          <div class="spacer"></div>
          <button class="ghost" @click="startConvert(item)">→ Konvertieren</button>
          <button class="ghost icon" @click="remove(item)" title="Löschen">✕</button>
        </div>

        <div v-if="convertTarget && convertTarget.id === item.id" class="convert">
          <select v-model="convertCategoryId">
            <option value="">– Kategorie wählen –</option>
            <optgroup v-for="g in categoryOptions" :key="g.space.id" :label="g.space.name">
              <option v-for="c in g.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </optgroup>
          </select>
          <div class="row" style="gap: var(--s-2); margin-top: var(--s-2);">
            <button class="primary" :disabled="!convertCategoryId" @click="confirmConvert">Konvertieren</button>
            <button class="ghost" @click="convertTarget = null">Abbrechen</button>
          </div>
        </div>
      </div>
    </div>

    <div class="add-bar">
      <input
        v-model="newContent"
        placeholder="Gedanke, Idee, noch zu sortieren…"
        @keyup.enter="add"
      />
      <button class="primary icon" @click="add" :disabled="!newContent.trim()">+</button>
    </div>
  </div>
</template>

<style scoped>
.inbox-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 720px;
  margin: 0 auto;
}

.inbox-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--s-3);
  padding-bottom: var(--s-2);
}

.add-bar {
  flex: 0 0 auto;
  display: flex;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.add-bar input { flex: 1; }

.inbox-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s-3);
  margin-bottom: var(--s-2);
}
.item-head {
  display: flex;
  gap: var(--s-2);
  align-items: flex-start;
}
.origin {
  width: 20px;
  text-align: center;
  flex: 0 0 auto;
}
.content {
  flex: 1;
  cursor: text;
  font-size: var(--fz-md);
  word-break: break-word;
}
.edit-row { display: flex; gap: var(--s-2); flex: 1; }
.edit-row input { flex: 1; }

.item-foot {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-2);
  font-size: var(--fz-xs);
  color: var(--muted);
}

.convert {
  border-top: 1px dashed var(--border);
  margin-top: var(--s-2);
  padding-top: var(--s-2);
}
</style>
