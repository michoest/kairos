<script setup>
import { computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import { SKIP_IN_ACTIONS, actionLabel } from '../utils/labels.js';

const store = useMainStore();

function taskTitle(id) {
  return store.tasks.find((t) => t.id === id)?.title ?? `#${id}`;
}
function categoryContext(catId) {
  const cat = store.categories.find((c) => c.id === catId);
  if (!cat) return '';
  const space = store.spaces.find((s) => s.id === cat.space_id);
  return space ? `${space.name} · ${cat.name}` : cat.name;
}
function spaceName(spaceId) {
  return store.spaces.find((s) => s.id === spaceId)?.name ?? `#${spaceId}`;
}

function richLabel(tc) {
  const { name, args = {} } = tc;
  switch (name) {
    case 'update_task':     return `Aktualisiert: „${taskTitle(args.id)}"`;
    case 'complete_task':   return `Erledigt: „${taskTitle(args.id)}"`;
    case 'cancel_task':     return `Verworfen: „${taskTitle(args.id)}"`;
    case 'skip_recurrence': return `Übersprungen: „${taskTitle(args.id)}"`;
    case 'add_dependency':  return `Abhängigkeit: „${taskTitle(args.blocking_task_id)}" blockiert „${taskTitle(args.blocked_task_id)}"`;
    case 'remove_dependency': return `Abhängigkeit gelöscht: „${taskTitle(args.blocking_task_id)}" → „${taskTitle(args.blocked_task_id)}"`;
    case 'create_task': {
      const ctx = args.category_id ? categoryContext(args.category_id) : '';
      return ctx ? `Aufgabe erstellt: „${args.title}" (${ctx})` : `Aufgabe erstellt: „${args.title}"`;
    }
    case 'convert_inbox_item': {
      const ctx = args.category_id ? categoryContext(args.category_id) : '';
      return ctx ? `Inbox → ${ctx}` : 'Inbox konvertiert';
    }
    case 'create_category': {
      const sn = args.space_id ? spaceName(args.space_id) : '';
      return sn ? `Kategorie erstellt: „${args.name}" in ${sn}` : `Kategorie erstellt: „${args.name}"`;
    }
    default: return actionLabel(tc);
  }
}

const lines = computed(() => {
  const run = store.agentLastRun;
  if (!run) return [];
  const state = (run.tool_calls ?? []).filter((tc) => !SKIP_IN_ACTIONS.has(tc.name));
  if (state.length) return state.map((tc) => richLabel(tc));
  const noAct = (run.tool_calls ?? []).find((tc) => tc.name === 'no_action');
  const text = run.final_message || noAct?.args?.reason || '';
  return text ? [text.slice(0, 100) + (text.length > 100 ? '…' : '')] : ['Keine Aktion'];
});

const triggerLabel = computed(() => {
  const run = store.agentLastRun;
  if (!run) return '';
  const map = { instruction: 'Anweisung', context_event: 'Kontext', auto: 'Auto', deadline: 'Deadline', follow_up: 'Nachhaken', scheduler: 'Scheduler', inbox_added: 'Inbox' };
  return map[run.trigger_type] ?? run.trigger_type ?? '';
});
</script>

<template>
  <Transition name="strip">
    <div v-if="store.agentStatusVisible" class="strip" :class="{ running: store.agentBusy }">
      <div v-if="store.agentBusy" class="strip-inner">
        <span class="spinner"></span>
        <span class="strip-text">Agent läuft…</span>
      </div>
      <div v-else class="strip-inner done">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="done-icon">
          <path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z"/>
        </svg>
        <span class="trigger-chip">{{ triggerLabel }}</span>
        <span class="strip-text">{{ lines.join(' · ') }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.strip {
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  overflow: hidden;
  flex: 0 0 auto;
}
.strip.running {
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.strip-inner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 6px var(--s-3);
  min-height: 32px;
  overflow: hidden;
}
.strip-text {
  font-size: var(--fz-xs);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.trigger-chip {
  font-size: 10px;
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 999px;
  padding: 1px 6px;
  flex: 0 0 auto;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.done-icon {
  color: var(--ok);
  flex: 0 0 auto;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex: 0 0 auto;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Transition */
.strip-enter-from, .strip-leave-to { max-height: 0; opacity: 0; }
.strip-enter-to, .strip-leave-from { max-height: 48px; opacity: 1; }
.strip-enter-active, .strip-leave-active { transition: max-height 200ms ease, opacity 150ms ease; }
</style>
