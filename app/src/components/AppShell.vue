<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import TopBar from './TopBar.vue';
import BottomTabs from './BottomTabs.vue';
import TasksScreen from './TasksScreen.vue';
import FokusScreen from './FokusScreen.vue';
import InboxScreen from './InboxScreen.vue';
import FeedScreen from './FeedScreen.vue';
import AgentInput from './AgentInput.vue';
import AgentStatusStrip from './AgentStatusStrip.vue';
import AccountSheet from './AccountSheet.vue';
import ProposalBanner from './ProposalBanner.vue';
import TaskSheet from './TaskSheet.vue';

const store = useMainStore();
const accountOpen = ref(false);
const focusHelper = ref(null);

function startNewTask() {
  // Focus a hidden input synchronously so iOS opens the keyboard before nextTick fires
  focusHelper.value?.focus();
  store.startNewTask(store.selectedCategoryId);
}

const currentScreen = computed(() => ({
  inbox: InboxScreen,
  fokus: FokusScreen,
  tasks: TasksScreen,
  feed: FeedScreen,
}[store.tab]));
</script>

<template>
  <div class="shell">
    <!-- Hidden input: iOS needs a synchronous focus call inside user gesture to open keyboard -->
    <input ref="focusHelper" class="focus-helper" aria-hidden="true" tabindex="-1" readonly />
    <TopBar @open-account="accountOpen = true" />
    <ProposalBanner />
    <main class="shell-main">
      <component :is="currentScreen" />
    </main>
    <AgentStatusStrip />
    <AgentInput />
    <BottomTabs />

    <button
      v-if="store.tab === 'tasks' && store.selectedCategoryId"
      class="fab"
      @click="startNewTask"
      title="Neue Aufgabe"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
      </svg>
    </button>

    <AccountSheet :open="accountOpen" @close="accountOpen = false" />
    <TaskSheet />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background:
    linear-gradient(160deg,
      color-mix(in srgb, var(--accent) 7%, var(--bg)) 0%,
      var(--bg) 38%
    );
  padding-top: var(--safe-top);
}
.shell-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
.fab {
  position: fixed;
  right: var(--s-4);
  bottom: calc(56px + 88px + var(--safe-bottom, 0px) + var(--s-3));
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-contrast);
  border: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  cursor: pointer;
}
.fab:hover { opacity: 0.92; }
.fab:active { transform: scale(0.95); }

.focus-helper {
  position: fixed;
  left: -999px;
  top: -999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  border: none;
  padding: 0;
}

@media (min-width: 720px) {
  .fab { bottom: calc(88px + var(--s-3)); }
}
</style>
