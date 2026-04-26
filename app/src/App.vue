<script setup>
import { onMounted } from 'vue';
import { useMainStore } from './stores/main.js';
import AppShell from './components/AppShell.vue';

const store = useMainStore();

onMounted(async () => {
  store.setTheme(store.theme); // applies data-theme attribute
  await store.refreshAll();
  store.subscribe();
});
</script>

<template>
  <AppShell />
</template>
