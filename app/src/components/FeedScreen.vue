<script setup>
import { ref, computed } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';
import { SKIP_IN_ACTIONS, actionLabel, statusLabel } from '../utils/labels.js';

const store = useMainStore();
const expanded = ref(new Set());

// Build a unified, chronologically sorted list of entries from the three backend sources.
const entries = computed(() => {
  const list = [];

  for (const m of store.messages) {
    list.push({
      id: `msg:${m.id}`,
      type: 'message',
      important: !m.dismissed_at,
      ts: m.created_at,
      payload: m,
    });
  }

  for (const p of store.proposals) {
    list.push({
      id: `prop:${p.id}`,
      type: 'proposal',
      important: p.status === 'pending',
      ts: p.created_at,
      payload: p,
    });
  }

  for (const run of store.agentRuns) {
    // Extract action + thinking entries from each run.
    const stateChanging = (run.tool_calls ?? []).filter((tc) => !SKIP_IN_ACTIONS.has(tc.name));
    if (stateChanging.length) {
      list.push({
        id: `run:${run.id}:actions`,
        type: 'action',
        important: false,
        ts: run.created_at,
        payload: { run, actions: stateChanging },
      });
    }
    const noActionCall = (run.tool_calls ?? []).find((tc) => tc.name === 'no_action');
    const thinkingText = run.final_message || noActionCall?.args?.reason;
    if (thinkingText) {
      list.push({
        id: `run:${run.id}:think`,
        type: 'thinking',
        important: false,
        ts: run.created_at,
        payload: { run, text: thinkingText },
      });
    }
  }

  list.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return list;
});

const counts = computed(() => ({
  all: entries.value.length,
  important: entries.value.filter((e) => e.important).length,
}));

const filtered = computed(() => {
  if (store.feedFilter === 'important') return entries.value.filter((e) => e.important);
  return entries.value;
});

function toggle(id) {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
  expanded.value = new Set(expanded.value);
}

async function dismissMessage(id) {
  await api.dismissMessage(id);
  await store.refreshMessages();
}
async function acceptProposal(id) {
  try {
    const r = await api.acceptProposal(id);
    await Promise.all([store.refreshProposals(), store.refreshTasks(), store.refreshInbox()]);
    const failed = (r?.results ?? []).filter(x => x.error);
    if (failed.length) {
      alert(`${failed.length} Aktion(en) fehlgeschlagen:\n` + failed.map(f => `• ${f.tool}: ${f.error}`).join('\n'));
    }
  } catch (e) { alert(e.message); }
}
async function dismissProposal(id) {
  await api.dismissProposal(id);
  await store.refreshProposals();
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, '0');
  if (same) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <div class="feed">
    <div class="filter-bar">
      <button
        class="filter-chip"
        :class="{ active: store.feedFilter === 'all' }"
        @click="store.feedFilter = 'all'"
      >Alle <span class="cnt">{{ counts.all }}</span></button>
      <button
        class="filter-chip"
        :class="{ active: store.feedFilter === 'important' }"
        @click="store.feedFilter = 'important'"
      >Wichtig <span class="cnt">{{ counts.important }}</span></button>
    </div>

    <div v-if="!filtered.length" class="empty">Noch keine Agenten-Aktivität.</div>

    <div
      v-for="e in filtered"
      :key="e.id"
      class="entry"
      :class="{
        muted: !e.important,
        [`t-${e.type}`]: true,
      }"
    >
      <!-- Message -->
      <template v-if="e.type === 'message'">
        <div class="entry-row">
          <span class="icon-dot msg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
            </svg>
          </span>
          <div class="body">
            <div class="content">{{ e.payload.content }}</div>
            <div class="meta">
              <span class="time">{{ fmtTime(e.payload.created_at) }}</span>
              <span class="dim">· {{ e.payload.trigger_type }}</span>
              <span v-if="e.payload.dismissed_at" class="dim">· verworfen</span>
            </div>
          </div>
          <button
            v-if="!e.payload.dismissed_at"
            class="ghost icon"
            @click="dismissMessage(e.payload.id)"
            title="Erledigt"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </template>

      <!-- Proposal -->
      <template v-else-if="e.type === 'proposal'">
        <div class="entry-row">
          <span class="icon-dot prop">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7m-1 16h2v1h-2v-1m-1-3h4v-1.81l.7-.5A5 5 0 0 0 17 9a5 5 0 0 0-5-5 5 5 0 0 0-5 5 5 5 0 0 0 2.3 4.19l.7.5V15z"/>
            </svg>
          </span>
          <div class="body">
            <div class="content"><strong>{{ e.payload.message }}</strong></div>
            <div class="meta">
              <span class="time">{{ fmtTime(e.payload.created_at) }}</span>
              <span class="dim">· {{ statusLabel(e.payload.status) }}</span>
            </div>
            <ul class="proposal-actions">
              <li v-for="(a, i) in e.payload.actions" :key="i">{{ actionLabel(a) }}</li>
            </ul>
            <div v-if="e.payload.status === 'pending'" class="row" style="gap: var(--s-2); margin-top: var(--s-2);">
              <button class="primary" @click="acceptProposal(e.payload.id)">Akzeptieren</button>
              <button @click="dismissProposal(e.payload.id)">Ablehnen</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Action -->
      <template v-else-if="e.type === 'action'">
        <div class="entry-row clickable" @click="toggle(e.id)">
          <span class="icon-dot act">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.33.07-.67.07-1.08s-.03-.75-.07-1.08l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.12.22-.07.49.12.64L4.57 10.5c-.04.34-.07.67-.07 1.08s.03.74.07 1.08L2.46 14.29c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.71z"/>
            </svg>
          </span>
          <div class="body">
            <div class="content action-line">
              <span v-for="(tc, i) in e.payload.actions" :key="i" class="chip">{{ actionLabel(tc) }}</span>
            </div>
            <div class="meta">
              <span class="time">{{ fmtTime(e.ts) }}</span>
              <span class="dim">· trigger: {{ e.payload.run.trigger_type }}</span>
            </div>
          </div>
          <svg class="expand-icon" :class="{ expanded: expanded.has(e.id) }" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z"/>
          </svg>
        </div>
        <div v-if="expanded.has(e.id)" class="detail">
          <div v-for="(tc, i) in e.payload.actions" :key="i" class="detail-call">
            <div class="mono"><strong>{{ tc.name }}</strong></div>
            <div class="mono dim">args: {{ JSON.stringify(tc.args) }}</div>
            <div class="mono dim">result: {{ JSON.stringify(tc.result) }}</div>
          </div>
        </div>
      </template>

      <!-- Thinking -->
      <template v-else-if="e.type === 'thinking'">
        <div class="entry-row clickable" @click="toggle(e.id)">
          <span class="icon-dot think">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 22C8.45 22 8 21.55 8 21V18H4C2.9 18 2 17.1 2 16V4C2 2.9 2.9 2 4 2H20C21.1 2 22 2.9 22 4V16C22 17.1 21.1 18 20 18H13.9L10.2 21.71C10 21.9 9.75 22 9.5 22H9M10 16V19.08L13.08 16H20V4H4V16H10M6 7H18V9H6V7M6 11H15V13H6V11Z"/>
            </svg>
          </span>
          <div class="body">
            <div class="content dim">{{ e.payload.text }}</div>
            <div class="meta">
              <span class="time">{{ fmtTime(e.ts) }}</span>
              <span class="dim">· trigger: {{ e.payload.run.trigger_type }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.feed {
  padding: var(--s-3);
  max-width: 720px;
  margin: 0 auto;
}
.filter-bar {
  display: flex;
  gap: var(--s-1);
  margin-bottom: var(--s-3);
  position: sticky;
  top: 0;
  background: var(--bg);
  padding-bottom: var(--s-2);
  z-index: 3;
}
.filter-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: var(--fz-sm);
  min-height: 30px;
  background: var(--surface);
  color: var(--text-2);
}
.filter-chip.active {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: var(--accent);
  font-weight: 600;
}
.filter-chip .cnt { font-size: var(--fz-xs); opacity: 0.75; margin-left: 4px; }

.entry {
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--border);
}
.entry.muted { opacity: 0.55; }
.entry.muted:hover { opacity: 0.85; }

.entry-row {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
}
.entry-row.clickable { cursor: pointer; }

.icon-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fz-sm);
  flex: 0 0 auto;
  background: var(--surface-2);
}
.icon-dot.msg { background: var(--accent-soft); }
.icon-dot.prop { background: var(--warn-soft); }
.icon-dot.act { background: var(--surface-2); }
.icon-dot.think { background: transparent; opacity: 0.7; }

.body { flex: 1; min-width: 0; }
.content {
  font-size: var(--fz-sm);
  color: var(--text);
  word-break: break-word;
  line-height: 1.45;
}
.content.dim { color: var(--text-2); font-style: italic; }
.meta {
  margin-top: 4px;
  font-size: var(--fz-xs);
  color: var(--muted);
}
.dim { color: var(--muted); }
.time { color: var(--text-2); }

.action-line { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  display: inline-block;
  background: var(--surface-2);
  border-radius: var(--r-sm);
  padding: 2px 8px;
  font-size: var(--fz-xs);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-2);
}

.proposal-actions {
  margin: var(--s-2) 0 0;
  padding-left: 16px;
  color: var(--muted);
  font-size: var(--fz-xs);
}

.detail {
  margin-top: var(--s-2);
  padding: var(--s-2);
  background: var(--surface-2);
  border-radius: var(--r-sm);
  font-size: var(--fz-xs);
}
.detail-call { margin-bottom: var(--s-2); }
.detail-call .dim { word-break: break-all; }

.expand-icon {
  color: var(--muted);
  flex: 0 0 auto;
  transition: transform 150ms ease;
}
.expand-icon.expanded { transform: rotate(90deg); }
</style>
