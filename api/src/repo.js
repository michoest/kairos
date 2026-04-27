import { v4 as uuid } from 'uuid';
import { computeNextDeadline, computeSkippedDeadline, validateRecurrence } from './recurrence.js';

export function createRepo(db) {
  const now = () => new Date().toISOString();

  const parseTask = (row) => {
    if (!row) return row;
    if (row.metadata) {
      try { row.metadata = JSON.parse(row.metadata); }
      catch { row.metadata = null; }
    }
    if (row.recurrence) {
      try { row.recurrence = JSON.parse(row.recurrence); }
      catch { row.recurrence = null; }
    }
    if ('is_active' in row) row.is_active = !!row.is_active;
    return row;
  };
  const parseMetadata = parseTask; // backwards name

  const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

  return {
    // --- Spaces ---
    listSpaces: () => db.prepare('SELECT * FROM spaces ORDER BY created_at').all(),
    getSpace: (id) => db.prepare('SELECT * FROM spaces WHERE id = ?').get(id),
    createSpace: ({ name, description = null }) => {
      const id = uuid();
      db.prepare('INSERT INTO spaces (id, name, description) VALUES (?, ?, ?)').run(id, name, description);
      return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
    },
    updateSpace: (id, fields) => {
      const allowed = ['name', 'description'];
      const sets = [], values = [];
      for (const k of allowed) if (k in fields) { sets.push(`${k} = ?`); values.push(fields[k]); }
      if (!sets.length) return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
      sets.push(`updated_at = ?`); values.push(now());
      values.push(id);
      db.prepare(`UPDATE spaces SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
    },
    deleteSpace: (id) => db.prepare('DELETE FROM spaces WHERE id = ?').run(id),

    // --- Categories ---
    listCategories: (spaceId = null) => {
      if (spaceId) return db.prepare('SELECT * FROM categories WHERE space_id = ? ORDER BY created_at').all(spaceId);
      return db.prepare('SELECT * FROM categories ORDER BY created_at').all();
    },
    getCategory: (id) => db.prepare('SELECT * FROM categories WHERE id = ?').get(id),
    createCategory: ({ space_id, name, color = null }) => {
      const id = uuid();
      db.prepare('INSERT INTO categories (id, space_id, name, color) VALUES (?, ?, ?, ?)').run(id, space_id, name, color);
      return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    },
    updateCategory: (id, fields) => {
      const allowed = ['name', 'color', 'space_id'];
      const sets = [], values = [];
      for (const k of allowed) if (k in fields) { sets.push(`${k} = ?`); values.push(fields[k]); }
      if (!sets.length) return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      sets.push(`updated_at = ?`); values.push(now());
      values.push(id);
      db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    },
    deleteCategory: (id) => db.prepare('DELETE FROM categories WHERE id = ?').run(id),

    // --- Tasks ---
    listTasks: ({ categoryId = null, spaceId = null, status = null, active = null } = {}) => {
      let sql = `SELECT t.* FROM tasks t JOIN categories c ON t.category_id = c.id WHERE 1=1`;
      const params = [];
      if (categoryId) { sql += ' AND t.category_id = ?'; params.push(categoryId); }
      if (spaceId) { sql += ' AND c.space_id = ?'; params.push(spaceId); }
      if (status) { sql += ' AND t.status = ?'; params.push(status); }
      if (active === true) { sql += ' AND t.is_active = 1'; }
      if (active === false) { sql += ' AND t.is_active = 0'; }
      sql += ' ORDER BY t.is_active DESC, t.created_at';
      return db.prepare(sql).all(...params).map(parseTask);
    },
    getTask: (id) => parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)),
    createTask: ({ category_id, title, description = null, status = 'open', responsible = null,
                   deadline = null, follow_up_at = null, is_active = true, recurrence = null, metadata = null }) => {
      const id = uuid();
      const rec = validateRecurrence(recurrence);
      db.prepare(`INSERT INTO tasks (id, category_id, title, description, status, responsible,
                                     deadline, follow_up_at, is_active, recurrence, metadata)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, category_id, title, description, status, responsible,
             deadline, follow_up_at, is_active ? 1 : 0,
             rec ? JSON.stringify(rec) : null,
             metadata ? JSON.stringify(metadata) : null);
      return parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
    },
    updateTask: (id, fields) => {
      const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!existing) return null;

      const allowed = ['category_id', 'title', 'description', 'status', 'responsible',
                       'deadline', 'follow_up_at', 'is_active', 'recurrence', 'metadata'];

      const patch = { ...fields };
      // Auto-clean: transition waiting -> open clears responsible + follow_up_at
      if (existing.status === 'waiting' && patch.status === 'open') {
        if (!('responsible' in patch)) patch.responsible = null;
        if (!('follow_up_at' in patch)) patch.follow_up_at = null;
      }
      if ('recurrence' in patch) patch.recurrence = validateRecurrence(patch.recurrence);

      const sets = [], values = [];
      for (const k of allowed) {
        if (k in patch) {
          sets.push(`${k} = ?`);
          if (k === 'metadata' || k === 'recurrence') {
            values.push(patch[k] != null ? JSON.stringify(patch[k]) : null);
          } else if (k === 'is_active') {
            values.push(patch[k] ? 1 : 0);
          } else {
            values.push(patch[k]);
          }
        }
      }
      if (!sets.length) return parseTask(existing);
      sets.push(`updated_at = ?`); values.push(now());
      values.push(id);
      db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      // If deadline or follow_up_at changed, stale fires should be cleared so the scheduler
      // fires again for the new time.
      if ('deadline' in patch && patch.deadline !== existing.deadline) {
        db.prepare(`DELETE FROM deadline_fires WHERE task_id = ? AND kind IN ('approaching','overdue')`).run(id);
      }
      if ('follow_up_at' in patch && patch.follow_up_at !== existing.follow_up_at) {
        db.prepare(`DELETE FROM deadline_fires WHERE task_id = ? AND kind = 'follow_up'`).run(id);
      }

      return parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
    },
    deleteTask: (id) => db.prepare('DELETE FROM tasks WHERE id = ?').run(id),

    /**
     * Complete a task. If recurring, advance deadline + stay open; else set status=done.
     * Returns { task, advanced: bool, nextDeadline: string|null }.
     */
    completeTask: (id, clock = new Date()) => {
      const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!existing) return null;
      const parsed = parseTask({ ...existing });

      if (parsed.recurrence) {
        const next = computeNextDeadline(parsed.recurrence, parsed.deadline, clock);
        db.prepare(`UPDATE tasks SET status='open', deadline=?, updated_at=? WHERE id=?`)
          .run(next, now(), id);
        db.prepare(`DELETE FROM deadline_fires WHERE task_id = ? AND kind IN ('approaching','overdue')`).run(id);
        return { task: parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)), advanced: true, nextDeadline: next };
      }
      db.prepare(`UPDATE tasks SET status='done', updated_at=? WHERE id=?`).run(now(), id);
      return { task: parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)), advanced: false, nextDeadline: null };
    },

    skipRecurrence: (id, clock = new Date()) => {
      const existing = parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
      if (!existing || !existing.recurrence) return null;
      const next = computeSkippedDeadline(existing.recurrence, existing.deadline, clock);
      db.prepare(`UPDATE tasks SET deadline=?, updated_at=? WHERE id=?`).run(next, now(), id);
      db.prepare(`DELETE FROM deadline_fires WHERE task_id = ? AND kind IN ('approaching','overdue')`).run(id);
      return { task: parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)), nextDeadline: next };
    },

    // --- Dependencies ---
    listDependencies: () => db.prepare('SELECT * FROM dependencies').all(),
    listBlockingFor: (taskId) => db.prepare(
      `SELECT t.*, d.id AS dep_id FROM dependencies d JOIN tasks t ON d.blocking_task_id = t.id WHERE d.blocked_task_id = ?`
    ).all(taskId).map(parseMetadata),
    listBlockedBy: (taskId) => db.prepare(
      `SELECT t.*, d.id AS dep_id FROM dependencies d JOIN tasks t ON d.blocked_task_id = t.id WHERE d.blocking_task_id = ?`
    ).all(taskId).map(parseMetadata),
    addDependency: ({ blocked_task_id, blocking_task_id }) => {
      if (blocked_task_id === blocking_task_id) {
        throw new Error('A task cannot block itself');
      }
      if (wouldCreateCycle(db, blocked_task_id, blocking_task_id)) {
        throw new Error('Would create a dependency cycle');
      }
      const id = uuid();
      db.prepare('INSERT INTO dependencies (id, blocked_task_id, blocking_task_id) VALUES (?, ?, ?)')
        .run(id, blocked_task_id, blocking_task_id);
      return db.prepare('SELECT * FROM dependencies WHERE id = ?').get(id);
    },
    removeDependency: (id) => db.prepare('DELETE FROM dependencies WHERE id = ?').run(id),
    removeDependencyByPair: ({ blocked_task_id, blocking_task_id }) =>
      db.prepare('DELETE FROM dependencies WHERE blocked_task_id = ? AND blocking_task_id = ?')
        .run(blocked_task_id, blocking_task_id),

    isBlocked: (taskId) => {
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM dependencies d
         JOIN tasks t ON d.blocking_task_id = t.id
         WHERE d.blocked_task_id = ? AND t.status NOT IN ('done', 'cancelled')`
      ).get(taskId);
      return row.n > 0;
    },

    // --- Context events ---
    listContextEvents: (limit = 50) =>
      db.prepare('SELECT * FROM context_events ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit),
    createContextEvent: ({ content, source = 'user', mode = 'context' }) => {
      const id = uuid();
      db.prepare('INSERT INTO context_events (id, content, source, mode) VALUES (?, ?, ?, ?)')
        .run(id, content, source, mode);
      return db.prepare('SELECT * FROM context_events WHERE id = ?').get(id);
    },
    markContextEventProcessed: (id) =>
      db.prepare('UPDATE context_events SET processed_at = ? WHERE id = ?').run(now(), id),

    // --- Agent messages ---
    listAgentMessages: (limit = 100) =>
      db.prepare('SELECT * FROM agent_messages ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit),
    createAgentMessage: ({ content, related_task_id = null, trigger_type, trigger_ref = null }) => {
      const id = uuid();
      db.prepare(`INSERT INTO agent_messages (id, content, related_task_id, trigger_type, trigger_ref)
                  VALUES (?, ?, ?, ?, ?)`).run(id, content, related_task_id, trigger_type, trigger_ref);
      return db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id);
    },
    dismissAgentMessage: (id) =>
      db.prepare('UPDATE agent_messages SET dismissed_at = ? WHERE id = ?').run(now(), id),

    // --- Agent runs (debug) ---
    createAgentRun: (data) => {
      const id = uuid();
      db.prepare(`INSERT INTO agent_runs (id, trigger_type, trigger_payload, iterations, tool_calls, final_message, error)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, data.trigger_type, JSON.stringify(data.trigger_payload),
             data.iterations ?? null,
             data.tool_calls ? JSON.stringify(data.tool_calls) : null,
             data.final_message ?? null,
             data.error ?? null);
      return id;
    },
    listAgentRuns: (limit = 50) =>
      db.prepare('SELECT * FROM agent_runs ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map((r) => ({
          ...r,
          trigger_payload: r.trigger_payload ? safeJSON(r.trigger_payload) : null,
          tool_calls: r.tool_calls ? safeJSON(r.tool_calls) : [],
        })),

    // --- Deadline fires ---
    hasDeadlineFired: (taskId, kind) =>
      !!db.prepare('SELECT 1 FROM deadline_fires WHERE task_id = ? AND kind = ?').get(taskId, kind),
    recordDeadlineFire: (taskId, kind) =>
      db.prepare('INSERT OR IGNORE INTO deadline_fires (task_id, kind) VALUES (?, ?)').run(taskId, kind),

    // --- Inbox ---
    listInboxItems: ({ includeConverted = false } = {}) => {
      const sql = includeConverted
        ? 'SELECT * FROM inbox_items ORDER BY created_at DESC, rowid DESC'
        : 'SELECT * FROM inbox_items WHERE converted_at IS NULL ORDER BY created_at DESC, rowid DESC';
      return db.prepare(sql).all();
    },
    getInboxItem: (id) => db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id),
    createInboxItem: ({ content, origin = 'keyboard' }) => {
      const id = uuid();
      db.prepare('INSERT INTO inbox_items (id, content, origin) VALUES (?, ?, ?)')
        .run(id, content, origin);
      return db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id);
    },
    updateInboxItem: (id, { content }) => {
      db.prepare('UPDATE inbox_items SET content = ? WHERE id = ?').run(content, id);
      return db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id);
    },
    deleteInboxItem: (id) => db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id),
    convertInboxItem: (id, taskFields) => {
      const item = db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id);
      if (!item) throw new Error('inbox item not found');
      if (item.converted_at) throw new Error('inbox item already converted');
      const { category_id, title, description, metadata, deadline, follow_up_at, responsible, status, recurrence, is_active } = taskFields;
      if (!category_id) throw new Error('category_id required');
      const taskId = uuid();
      const rec = validateRecurrence(recurrence ?? null);
      db.prepare(`INSERT INTO tasks (id, category_id, title, description, status, responsible,
                                     deadline, follow_up_at, is_active, recurrence, metadata)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(taskId, category_id,
             title ?? item.content,
             description ?? null,
             status ?? 'open',
             responsible ?? null,
             deadline ?? null,
             follow_up_at ?? null,
             is_active === false ? 0 : 1,
             rec ? JSON.stringify(rec) : null,
             metadata ? JSON.stringify(metadata) : null);
      db.prepare('UPDATE inbox_items SET converted_at = ?, converted_task_id = ? WHERE id = ?')
        .run(now(), taskId, id);
      return {
        task: parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)),
        inbox_item: db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id),
      };
    },

    // --- Proposals ---
    listProposals: ({ status = null } = {}) => {
      const sql = status
        ? 'SELECT * FROM agent_proposals WHERE status = ? ORDER BY created_at DESC, rowid DESC'
        : 'SELECT * FROM agent_proposals ORDER BY created_at DESC, rowid DESC';
      const rows = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
      return rows.map((r) => ({
        ...r,
        actions: r.actions ? JSON.parse(r.actions) : [],
        results: r.results ? JSON.parse(r.results) : null,
      }));
    },
    getProposal: (id) => {
      const r = db.prepare('SELECT * FROM agent_proposals WHERE id = ?').get(id);
      if (!r) return null;
      return { ...r, actions: JSON.parse(r.actions), results: r.results ? JSON.parse(r.results) : null };
    },
    createProposal: ({ message, actions, trigger_type = null, trigger_ref = null }) => {
      const id = uuid();
      db.prepare(`INSERT INTO agent_proposals (id, message, actions, trigger_type, trigger_ref)
                  VALUES (?, ?, ?, ?, ?)`)
        .run(id, message, JSON.stringify(actions), trigger_type, trigger_ref);
      return { id, message, actions, status: 'pending', trigger_type, trigger_ref };
    },
    markProposalResolved: (id, status, results = null) => {
      db.prepare(`UPDATE agent_proposals SET status = ?, results = ?, resolved_at = ? WHERE id = ?`)
        .run(status, results ? JSON.stringify(results) : null, now(), id);
    },

    // --- Push subscriptions ---
    savePushSubscription: ({ endpoint, p256dh, auth }) => {
      db.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)')
        .run(endpoint, p256dh, auth);
    },
    listPushSubscriptions: () =>
      db.prepare('SELECT * FROM push_subscriptions').all().map((row) => ({
        endpoint: row.endpoint,
        subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      })),
    deletePushSubscription: (endpoint) =>
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint),
  };
}

function wouldCreateCycle(db, blockedId, blockingId) {
  // Adding edge blocking -> blocked. Check if blocked already reaches blocking.
  // i.e., does any path from blockedId's "blocking" set reach blockingId transitively?
  // Semantics: blocked_task_id is blocked BY blocking_task_id.
  // If we add (blocked=A, blocking=B), edge means B must finish before A.
  // Cycle: B already depends on A finishing (directly or transitively).
  const visited = new Set();
  const stack = [blockingId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === blockedId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const next = db.prepare('SELECT blocking_task_id FROM dependencies WHERE blocked_task_id = ?').all(cur);
    for (const r of next) stack.push(r.blocking_task_id);
  }
  return false;
}
