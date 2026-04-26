import { Router } from 'express';
import { emit } from '../events.js';

const VALID_STATUSES = ['open', 'in_progress', 'waiting', 'done', 'cancelled'];

export function tasksRouter({ repo, runAgent }) {
  const r = Router();

  r.get('/', (req, res) => {
    const { category_id, space_id, status } = req.query;
    const tasks = repo.listTasks({
      categoryId: category_id ?? null,
      spaceId: space_id ?? null,
      status: status ?? null,
    });
    const enriched = tasks.map((t) => ({ ...t, is_blocked: repo.isBlocked(t.id) }));
    res.json(enriched);
  });

  r.post('/', async (req, res) => {
    const { category_id, title, description, status, responsible, deadline,
            follow_up_at, is_active, recurrence, metadata } = req.body ?? {};
    if (!category_id || !title) return res.status(400).json({ error: 'category_id and title required' });
    if (!repo.getCategory(category_id)) return res.status(400).json({ error: 'category not found' });
    if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
    let task;
    try {
      task = repo.createTask({ category_id, title, description, status, responsible, deadline,
                               follow_up_at, is_active, recurrence, metadata });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    emit('task.created', task);

    // Fire user_action trigger (fire-and-forget)
    runAgent?.({ type: 'user_action', payload: { action: 'task.created', task } })
      .catch((e) => console.error('agent user_action error:', e));

    res.status(201).json({ ...task, is_blocked: repo.isBlocked(task.id) });
  });

  r.get('/:id', (req, res) => {
    const t = repo.getTask(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({
      ...t,
      is_blocked: repo.isBlocked(t.id),
      blocking: repo.listBlockingFor(t.id),
      blocks: repo.listBlockedBy(t.id),
    });
  });

  r.patch('/:id', async (req, res) => {
    const existing = repo.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const { status } = req.body ?? {};
    if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
    let updated;
    try {
      updated = repo.updateTask(req.params.id, req.body ?? {});
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    emit('task.updated', updated);

    runAgent?.({ type: 'user_action', payload: { action: 'task.updated', task: updated, previous: existing } })
      .catch((e) => console.error('agent user_action error:', e));

    res.json({ ...updated, is_blocked: repo.isBlocked(updated.id) });
  });

  r.post('/:id/complete', (req, res) => {
    const existing = repo.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const result = repo.completeTask(req.params.id);
    emit('task.updated', result.task);
    runAgent?.({ type: 'user_action', payload: { action: 'task.completed', task: result.task, previous: existing, advanced: result.advanced } })
      .catch((e) => console.error('agent user_action error:', e));
    res.json({ ...result, task: { ...result.task, is_blocked: repo.isBlocked(result.task.id) } });
  });

  r.post('/:id/skip', (req, res) => {
    const existing = repo.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!existing.recurrence) return res.status(400).json({ error: 'task is not recurring' });
    const result = repo.skipRecurrence(req.params.id);
    emit('task.updated', result.task);
    res.json(result);
  });

  r.delete('/:id', (req, res) => {
    repo.deleteTask(req.params.id);
    emit('task.deleted', { id: req.params.id });
    res.status(204).end();
  });

  // --- Dependencies ---
  r.post('/:id/dependencies', (req, res) => {
    const blockedTask = repo.getTask(req.params.id);
    if (!blockedTask) return res.status(404).json({ error: 'task not found' });
    const { blocking_task_id } = req.body ?? {};
    if (!blocking_task_id) return res.status(400).json({ error: 'blocking_task_id required' });
    if (!repo.getTask(blocking_task_id)) return res.status(400).json({ error: 'blocking task not found' });
    try {
      const dep = repo.addDependency({ blocked_task_id: req.params.id, blocking_task_id });
      emit('dependency.added', dep);
      res.status(201).json(dep);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  r.delete('/:id/dependencies/:depId', (req, res) => {
    repo.removeDependency(req.params.depId);
    emit('dependency.removed', { id: req.params.depId });
    res.status(204).end();
  });

  return r;
}
