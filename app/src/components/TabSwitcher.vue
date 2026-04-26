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
  <nav class="tab-switcher">
    <button
      v-for="t in tabs"
      :key="t.id"
      class="tab"
      :class="{ active: store.tab === t.id }"
      @click="store.setTab(t.id)"
    >
      <SvgIcon :path="t.icon" :size="16" />
      <span class="tab-label">{{ t.label }}</span>
      <span v-if="t.badge" class="tab-badge">{{ t.badge }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tab-switcher {
  display: flex;
  gap: 2px;
  background: var(--surface-2);
  padding: 4px;
  border-radius: var(--r-lg);
}
.tab {
  border: none;
  background: transparent;
  padding: 6px 14px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  min-height: 32px;
  position: relative;
}
.tab:hover { background: var(--surface); color: var(--text); }
.tab.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); }
.tab-badge {
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: var(--fz-xs);
  font-weight: 600;
  padding: 0 6px;
  border-radius: 999px;
  line-height: 16px;
  min-width: 16px;
  text-align: center;
}
</style>
