import { defineStore } from 'pinia';
import { api, subscribeEvents } from '../api.js';

let agentDoneTimer = null;

export const useMainStore = defineStore('main', {
  state: () => ({
    spaces: [],
    categories: [],
    tasks: [],
    messages: [],
    contextEvents: [],
    inboxItems: [],
    proposals: [],
    agentRuns: [],
    tab: 'tasks',          // 'inbox' | 'fokus' | 'tasks' | 'feed'
    theme: localStorage.getItem('kairos.theme') === 'dark' ? 'dark' : 'light',
    selectedSpaceId: null,
    selectedCategoryId: null,
    selectedTaskId: null,
    newTaskCategoryId: null,
    feedFilter: 'all',     // 'all' | 'important'
    agentBusy: false,
    agentStatusVisible: false,
    agentLastRun: null,
    sseUnsub: null,
  }),
  getters: {
    categoriesBySpace: (state) => (spaceId) =>
      state.categories.filter((c) => c.space_id === spaceId),
    tasksByCategory: (state) => (categoryId) =>
      state.tasks.filter((t) => t.category_id === categoryId),
    selectedTask: (state) => state.tasks.find((t) => t.id === state.selectedTaskId) ?? null,
    taskById: (state) => (id) => state.tasks.find((t) => t.id === id),
    pendingProposals: (state) => state.proposals.filter((p) => p.status === 'pending'),
    inboxCount: (state) => state.inboxItems.length,
  },
  actions: {
    async refreshAll() {
      const [spaces, categories, tasks, messages, contextEvents, inbox, proposals, runs] = await Promise.all([
        api.listSpaces(), api.listCategories(), api.listTasks(), api.listMessages(),
        api.listContext(), api.listInbox(), api.listProposals(), api.listRuns(),
      ]);
      this.spaces = spaces;
      this.categories = categories;
      this.tasks = tasks;
      this.messages = messages;
      this.contextEvents = contextEvents;
      this.inboxItems = inbox;
      this.proposals = proposals;
      this.agentRuns = runs;
      if (!this.selectedSpaceId && spaces.length) this.selectedSpaceId = spaces[0].id;
      if (!this.selectedCategoryId && categories.length) {
        const cat = categories.find((c) => c.space_id === this.selectedSpaceId) ?? categories[0];
        this.selectedCategoryId = cat.id;
        this.selectedSpaceId = cat.space_id;
      }
    },
    subscribe() {
      if (this.sseUnsub) return;
      this.sseUnsub = subscribeEvents((type) => {
        if (type.startsWith('task.')) this.refreshTasks();
        else if (type.startsWith('space.') || type.startsWith('category.')) this.refreshAll();
        else if (type.startsWith('dependency.')) this.refreshTasks();
        else if (type === 'context.created') this.refreshContext();
        else if (type === 'agent.message') this.refreshMessages();
        else if (type.startsWith('inbox.')) { this.refreshInbox(); this.refreshTasks(); }
        else if (type.startsWith('proposal.')) this.refreshProposals();
        else if (type === 'agent.run') {
          this.refreshRuns().then(() => {
            this.agentBusy = false;
            this.agentLastRun = this.agentRuns[0] ?? null;
            this.agentStatusVisible = true;
            clearTimeout(agentDoneTimer);
            agentDoneTimer = setTimeout(() => { this.agentStatusVisible = false; }, 5000);
          });
        }
      });
    },
    async refreshTasks() { this.tasks = await api.listTasks(); },
    async refreshMessages() { this.messages = await api.listMessages(); },
    async refreshContext() { this.contextEvents = await api.listContext(); },
    async refreshInbox() { this.inboxItems = await api.listInbox(); },
    async refreshProposals() { this.proposals = await api.listProposals(); },
    async refreshRuns() { this.agentRuns = await api.listRuns(); },

    setAgentRunning() {
      clearTimeout(agentDoneTimer);
      this.agentBusy = true;
      this.agentStatusVisible = true;
    },
    clearAgentStatus() {
      clearTimeout(agentDoneTimer);
      this.agentBusy = false;
      this.agentStatusVisible = false;
    },

    startNewTask(categoryId) { this.newTaskCategoryId = categoryId; },
    clearNewTask() { this.newTaskCategoryId = null; },
    setTab(tab) { this.tab = tab; },
    setTheme(theme) {
      this.theme = theme;
      localStorage.setItem('kairos.theme', theme);
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    },
    toggleTheme() { this.setTheme(this.theme === 'dark' ? 'light' : 'dark'); },
  },
});
