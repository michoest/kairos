export function buildAgentContext({ repo, recentEventLimit = 20 }) {
  const spaces = repo.listSpaces();
  const categories = repo.listCategories();
  // Include inactive tasks (flagged) so the agent can re-activate; exclude done/cancelled.
  const openTasks = repo.listTasks().filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const tasksSummary = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    is_active: t.is_active,
    category_id: t.category_id,
    deadline: t.deadline,
    follow_up_at: t.follow_up_at,
    responsible: t.responsible,
    recurrence: t.recurrence,
    is_blocked: repo.isBlocked(t.id),
    description: t.description ? truncate(t.description, 200) : null,
    metadata: t.metadata,
  }));
  const dependencies = repo.listDependencies();
  const recentEvents = repo.listContextEvents(recentEventLimit).reverse();
  const inbox = repo.listInboxItems({ includeConverted: false });

  return {
    now: new Date().toISOString(),
    spaces: spaces.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    categories: categories.map((c) => ({ id: c.id, space_id: c.space_id, name: c.name, color: c.color })),
    open_tasks: tasksSummary,
    inbox_items: inbox.map((i) => ({ id: i.id, content: i.content, origin: i.origin, created_at: i.created_at })),
    dependencies: dependencies.map((d) => ({
      blocked_task_id: d.blocked_task_id,
      blocking_task_id: d.blocking_task_id,
    })),
    recent_context: recentEvents.map((e) => ({
      id: e.id, content: e.content, source: e.source, created_at: e.created_at,
    })),
  };
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + '…' : s;
}
