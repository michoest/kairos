<script setup>
import { computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import SvgIcon from './SvgIcon.vue';
import {
  mdiInboxArrowDown,
  mdiTarget,
  mdiFormatListCheckbox,
  mdiBrain,
} from '@mdi/js';

const store = useMainStore();

const tabs = computed(() => [
  { id: 'inbox', label: 'Inbox', icon: mdiInboxArrowDown, badge: store.inboxCount },
  { id: 'fokus', label: 'Fokus',  icon: mdiTarget },
  { id: 'tasks', label: 'Tasks',  icon: mdiFormatListCheckbox },
  { id: 'feed',  label: 'Agent',  icon: mdiBrain, badge: store.pendingProposals.length },
]);
</script>

<template>
  <nav class="bottom-tabs">
    <button
      v-for="t in tabs"
      :key="t.id"
      class="btab"
      :class="{ active: store.tab === t.id }"
      @click="store.setTab(t.id)"
    >
      <span class="btab-icon">
        <SvgIcon :path="t.icon" :size="22" />
        <span v-if="t.badge" class="btab-badge">{{ t.badge }}</span>
      </span>
      <span class="btab-label">{{ t.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-tabs {
  display: flex;
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding-bottom: var(--safe-bottom);
}
.btab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--muted);
  padding: 8px 4px;
  min-height: 56px;
}
.btab:hover { background: transparent; }
.btab.active { color: var(--accent); }
.btab-icon { position: relative; display: inline-flex; }
.btab-label { font-size: var(--fz-xs); font-weight: 500; }
.btab-badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  text-align: center;
}

@media (min-width: 720px) {
  .bottom-tabs { display: none; }
}
</style>
