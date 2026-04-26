<script setup>
import { computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import TabSwitcher from './TabSwitcher.vue';

defineEmits(['open-account']);
const store = useMainStore();

const title = computed(() => ({
  inbox: 'Inbox', fokus: 'Fokus', tasks: 'Tasks', feed: 'Agent',
}[store.tab]));
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <img src="/icon-192.png" class="brand-icon" alt="" />
      Kairos
    </div>
    <div class="title-mobile">{{ title }}</div>
    <div class="tabs-desktop">
      <TabSwitcher />
    </div>
    <button class="icon ghost account-btn" @click="$emit('open-account')" title="Account">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4z"/>
      </svg>
    </button>
  </header>
</template>

<style scoped>
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  min-height: 48px;
}
.brand {
  justify-self: start;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-size: var(--fz-md);
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 7px;
}
.brand-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  flex: 0 0 auto;
}
.title-mobile {
  justify-self: center;
  font-size: var(--fz-md);
  color: var(--text-2);
  font-weight: 500;
}
.tabs-desktop {
  display: none;
  justify-self: center;
}
.account-btn {
  justify-self: end;
}

@media (min-width: 720px) {
  .title-mobile { display: none; }
  .tabs-desktop { display: flex; }
  .topbar { padding: var(--s-2) var(--s-4); }
}
</style>
