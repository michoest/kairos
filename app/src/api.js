const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Spaces
  listSpaces: () => req('/spaces'),
  createSpace: (body) => req('/spaces', { method: 'POST', body }),
  deleteSpace: (id) => req(`/spaces/${id}`, { method: 'DELETE' }),

  // Categories
  listCategories: () => req('/categories'),
  createCategory: (body) => req('/categories', { method: 'POST', body }),
  deleteCategory: (id) => req(`/categories/${id}`, { method: 'DELETE' }),

  // Tasks
  listTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/tasks${q ? '?' + q : ''}`);
  },
  getTask: (id) => req(`/tasks/${id}`),
  createTask: (body) => req('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => req(`/tasks/${id}`, { method: 'PATCH', body }),
  deleteTask: (id) => req(`/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => req(`/tasks/${id}/complete`, { method: 'POST' }),
  skipTask: (id) => req(`/tasks/${id}/skip`, { method: 'POST' }),
  addDependency: (taskId, blocking_task_id) =>
    req(`/tasks/${taskId}/dependencies`, { method: 'POST', body: { blocking_task_id } }),
  removeDependency: (taskId, depId) =>
    req(`/tasks/${taskId}/dependencies/${depId}`, { method: 'DELETE' }),

  // Inbox
  listInbox: (includeConverted = false) =>
    req(`/inbox${includeConverted ? '?include_converted=1' : ''}`),
  createInboxItem: (content, origin = 'keyboard') =>
    req('/inbox', { method: 'POST', body: { content, origin } }),
  updateInboxItem: (id, content) =>
    req(`/inbox/${id}`, { method: 'PATCH', body: { content } }),
  deleteInboxItem: (id) => req(`/inbox/${id}`, { method: 'DELETE' }),
  convertInboxItem: (id, fields) =>
    req(`/inbox/${id}/convert`, { method: 'POST', body: fields }),

  // Proposals
  listProposals: (status = null) =>
    req(`/proposals${status ? '?status=' + status : ''}`),
  acceptProposal: (id) => req(`/proposals/${id}/accept`, { method: 'POST' }),
  dismissProposal: (id) => req(`/proposals/${id}/dismiss`, { method: 'POST' }),

  // Agent input (unified)
  listContext: () => req('/agent-input'),
  postAgentInput: ({ content, mode = 'context', source = 'user' }) =>
    req('/agent-input', { method: 'POST', body: { content, mode, source } }),
  // Legacy alias (mode defaults to 'context')
  postContext: (content, source = 'user') =>
    req('/agent-input', { method: 'POST', body: { content, mode: 'context', source } }),

  // Messages
  listMessages: () => req('/messages'),
  dismissMessage: (id) => req(`/messages/${id}/dismiss`, { method: 'POST' }),
  listRuns: () => req('/messages/runs'),

  // Push subscriptions
  savePushSubscription: (sub) => req('/push/subscribe', { method: 'POST', body: sub }),
  deletePushSubscription: (endpoint) => req('/push/subscribe', { method: 'DELETE', body: { endpoint } }),

  // STT
  transcribe: async (blob) => {
    const fd = new FormData();
    fd.append('audio', blob, 'audio.webm');
    const res = await fetch(`${BASE}/stt`, { method: 'POST', credentials: 'include', body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'STT failed');
    return res.json();
  },
};

export function subscribeEvents(onEvent) {
  const es = new EventSource(`${BASE}/events`);
  const types = [
    'task.created', 'task.updated', 'task.deleted',
    'dependency.added', 'dependency.removed',
    'space.created', 'space.updated', 'space.deleted',
    'category.created', 'category.updated', 'category.deleted',
    'context.created', 'agent.message', 'agent.run',
    'inbox.created', 'inbox.updated', 'inbox.deleted', 'inbox.converted',
    'proposal.created', 'proposal.resolved',
  ];
  for (const type of types) {
    es.addEventListener(type, (e) => onEvent(type, JSON.parse(e.data)));
  }
  es.addEventListener('error', () => {});
  return () => es.close();
}
