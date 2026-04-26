export function startDeadlineScheduler({ repo, runAgent, intervalMs = 60_000, logger = console }) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const now = new Date();
      const in1h = new Date(now.getTime() + 60 * 60 * 1000);
      // Only active, non-terminal tasks participate.
      const tasks = repo.listTasks().filter((t) =>
        t.is_active && t.status !== 'done' && t.status !== 'cancelled'
      );

      for (const t of tasks) {
        // Deadline triggers
        if (t.deadline) {
          const deadline = new Date(t.deadline);
          if (!isNaN(deadline.getTime())) {
            if (deadline <= now && !repo.hasDeadlineFired(t.id, 'overdue')) {
              repo.recordDeadlineFire(t.id, 'overdue');
              runAgent({ type: 'deadline', payload: { task: t, kind: 'overdue' } })
                .catch((e) => logger.error('deadline trigger error:', e));
            } else if (deadline > now && deadline <= in1h && !repo.hasDeadlineFired(t.id, 'approaching')) {
              repo.recordDeadlineFire(t.id, 'approaching');
              runAgent({ type: 'deadline', payload: { task: t, kind: 'approaching' } })
                .catch((e) => logger.error('deadline trigger error:', e));
            }
          }
        }
        // Follow-up trigger (only while waiting)
        if (t.status === 'waiting' && t.follow_up_at) {
          const fu = new Date(t.follow_up_at);
          if (!isNaN(fu.getTime()) && fu <= now && !repo.hasDeadlineFired(t.id, 'follow_up')) {
            repo.recordDeadlineFire(t.id, 'follow_up');
            runAgent({ type: 'follow_up', payload: { task: t } })
              .catch((e) => logger.error('follow_up trigger error:', e));
          }
        }
      }
    } catch (e) {
      logger.error('scheduler tick error:', e);
    }
  }

  const handle = setInterval(tick, intervalMs);
  setTimeout(tick, 1000);

  return {
    stop: () => { stopped = true; clearInterval(handle); },
    tick,
  };
}
