<script setup>
import { computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';

const store = useMainStore();
const latest = computed(() => store.pendingProposals[0] ?? null);

async function accept(id) {
  try {
    const res = await api.acceptProposal(id);
    await Promise.all([store.refreshProposals(), store.refreshTasks(), store.refreshInbox()]);
    const failed = (res?.results ?? []).filter((r) => r.error);
    if (failed.length) {
      alert(`${failed.length} von ${res.results.length} Aktionen fehlgeschlagen:\n` +
        failed.map(f => `• ${f.tool}: ${f.error}`).join('\n'));
    }
  } catch (e) { alert(e.message); }
}
async function dismiss(id) {
  await api.dismissProposal(id);
  await store.refreshProposals();
}
function openFeed() { store.setTab('feed'); }
</script>

<template>
  <div v-if="latest" class="banner">
    <div class="banner-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7m-1 16h2v1h-2v-1m-1-3h4v-1.81l.7-.5A5 5 0 0 0 17 9a5 5 0 0 0-5-5 5 5 0 0 0-5 5 5 5 0 0 0 2.3 4.19l.7.5V15z"/>
      </svg>
    </div>
    <div class="banner-body" @click="openFeed">
      <div class="banner-msg">{{ latest.message }}</div>
      <div class="banner-sub">
        {{ latest.actions.length }} Aktion{{ latest.actions.length === 1 ? '' : 'en' }}
        <span v-if="store.pendingProposals.length > 1"> · +{{ store.pendingProposals.length - 1 }} weitere</span>
      </div>
    </div>
    <div class="banner-actions">
      <button class="ghost icon" @click.stop="dismiss(latest.id)" title="Ablehnen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
      <button class="primary" @click.stop="accept(latest.id)">OK</button>
    </div>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
}
.banner-icon { display: flex; align-items: center; color: var(--accent); flex: 0 0 auto; }
.banner-body { flex: 1; cursor: pointer; min-width: 0; }
.banner-msg {
  font-weight: 600;
  color: var(--text);
  font-size: var(--fz-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.banner-sub { color: var(--text-2); font-size: var(--fz-xs); }
.banner-actions { display: flex; gap: var(--s-1); }
</style>
