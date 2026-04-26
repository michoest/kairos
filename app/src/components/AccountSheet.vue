<script setup>
import { useMainStore } from '../stores/main.js';

defineProps({ open: Boolean });
defineEmits(['close']);
const store = useMainStore();
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-backdrop" @click.self="$emit('close')">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="sheet-head">
            <div class="sheet-title">Account</div>
            <button class="ghost icon" @click="$emit('close')" title="Schließen">✕</button>
          </div>

          <section class="sheet-section">
            <div class="label">Theme</div>
            <div class="theme-toggle">
              <button
                :class="{ active: store.theme === 'light' }"
                @click="store.setTheme('light')"
              >☀ Hell</button>
              <button
                :class="{ active: store.theme === 'dark' }"
                @click="store.setTheme('dark')"
              >☾ Dunkel</button>
            </div>
          </section>

          <section class="sheet-section">
            <div class="label">Konto</div>
            <div class="placeholder">
              Login / Logout kommt später.<br>
              Aktuell: Single-User, lokal.
            </div>
          </section>

          <section class="sheet-section">
            <div class="label">Version</div>
            <div class="mono">Kairos MVP · 0.0.1</div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  box-shadow: var(--shadow-2);
  padding: var(--s-2) var(--s-4) calc(var(--s-4) + var(--safe-bottom));
  max-height: 80vh;
  overflow-y: auto;
}
.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--border-strong);
  border-radius: 2px;
  margin: 8px auto var(--s-3);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s-3);
}
.sheet-title { font-size: var(--fz-lg); font-weight: 600; }
.sheet-section { padding: var(--s-3) 0; border-top: 1px solid var(--border); }
.sheet-section:first-of-type { border-top: none; padding-top: 0; }
.label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-size: var(--fz-xs);
  font-weight: 600;
  margin-bottom: var(--s-2);
}
.theme-toggle { display: flex; gap: var(--s-2); }
.theme-toggle button { flex: 1; }
.theme-toggle button.active {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: var(--accent);
}
.placeholder { color: var(--muted); font-size: var(--fz-sm); line-height: 1.5; }

@media (min-width: 720px) {
  .sheet-backdrop { align-items: center; }
  .sheet { border-radius: var(--r-xl); max-width: 420px; }
}

.sheet-enter-from .sheet, .sheet-leave-to .sheet {
  transform: translateY(100%);
}
.sheet-enter-active .sheet, .sheet-leave-active .sheet {
  transition: transform 200ms ease;
}
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-active, .sheet-leave-active { transition: opacity 200ms ease; }
</style>
