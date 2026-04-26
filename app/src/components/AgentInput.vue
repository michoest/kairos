<script setup>
import { ref } from 'vue';
import { useMainStore } from '../stores/main.js';
import { api } from '../api.js';

const store = useMainStore();
const text = ref('');
const busy = ref(false);

const mode = ref('instruction'); // 'instruction' | 'context'
const recording = ref(false);
let recorder = null;
let chunks = [];

async function send() {
  if (!text.value.trim()) return;
  busy.value = true;
  store.setAgentRunning();
  try {
    await api.postAgentInput({
      content: text.value.trim(),
      mode: mode.value,
      source: 'user',
    });
    text.value = '';
    await Promise.all([
      store.refreshContext(),
      store.refreshMessages(),
      store.refreshProposals(),
      store.refreshTasks(),
      store.refreshRuns(),
      store.refreshInbox(),
    ]);
    // HTTP response arrives only after the agent has finished (backend awaits runAgent).
    // Clear busy state here as a reliable fallback in case the SSE event is delayed.
    store.setAgentDone();
  } catch (e) {
    store.clearAgentStatus();
    alert(e.message);
  } finally {
    busy.value = false;
  }
}

async function toggleMic() {
  if (recording.value) { recorder?.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      recording.value = false;
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: 'audio/webm' });
      busy.value = true;
      try {
        const { text: transcribed } = await api.transcribe(blob);
        text.value = (text.value ? text.value + ' ' : '') + transcribed;
      } catch (e) {
        alert('STT: ' + e.message);
      } finally {
        busy.value = false;
      }
    };
    recorder.start();
    recording.value = true;
  } catch (e) {
    alert('Mikrofon: ' + e.message);
  }
}
</script>

<template>
  <div class="agent-input">
    <div class="mode-row">
      <button
        class="mode-btn"
        :class="{ active: mode === 'instruction' }"
        @click="mode = 'instruction'"
        title="Direkte Anweisung — Agent führt aus"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
        </svg>
        Anweisung
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'context' }"
        @click="mode = 'context'"
        title="Kontext — Agent entscheidet"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 9h-2V7h2m0 10h-2v-6h2m-1-9A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2z"/>
        </svg>
        Kontext
      </button>
    </div>
    <div class="input-row">
      <button class="icon mic" :class="{ rec: recording }" @click="toggleMic" :disabled="busy" :title="recording ? 'Stop' : 'Diktieren'">
        <svg v-if="!recording" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      </button>
      <input
        v-model="text"
        :placeholder="mode === 'instruction' ? 'Sag dem Agent, was er tun soll…' : 'Gib dem Agent Kontext…'"
        @keyup.enter="send"
        :disabled="busy"
      />
      <button class="icon primary send" @click="send" :disabled="busy || !text.trim()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.agent-input {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: var(--s-2) var(--s-3);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.mode-row {
  display: flex;
  gap: var(--s-1);
  background: var(--surface-2);
  border-radius: var(--r-md);
  padding: 2px;
  align-self: center;
}
.mode-btn {
  border: none;
  background: transparent;
  padding: 4px 10px;
  font-size: var(--fz-xs);
  min-height: 26px;
  border-radius: calc(var(--r-md) - 2px);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.mode-btn:hover { background: transparent; color: var(--text); }
.mode-btn.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-1);
  font-weight: 600;
}
.input-row { display: flex; gap: var(--s-2); align-items: center; }
.input-row input { flex: 1; }
.mic.rec { background: var(--danger); color: white; border-color: var(--danger); }
</style>
