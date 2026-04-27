function todayDateStr(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseDeadline(str, now) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d); // local midnight
  }
  return new Date(str);
}

export function startDeadlineScheduler({ repo, runAgent, intervalMs = 60_000, logger = console, webpush = null }) {
  let stopped = false;
  let lastMorningPush = null;

  async function sendMorningPush(now) {
    if (!webpush) return;
    const subs = repo.listPushSubscriptions();
    if (!subs.length) return;

    const todayStr = todayDateStr(now);
    const tasks = repo.listTasks().filter(
      (t) => t.is_active && t.status !== 'done' && t.status !== 'cancelled' && t.deadline
    );
    const overdue = tasks.filter((t) => t.deadline < todayStr);
    const dueToday = tasks.filter((t) => t.deadline === todayStr);

    let body;
    if (dueToday.length && overdue.length) {
      body = `Heute fällig: ${dueToday.length}, überfällig: ${overdue.length}`;
    } else if (dueToday.length === 1) {
      body = `Heute: ${dueToday[0].title}`;
    } else if (dueToday.length > 1) {
      body = `Heute fällig: ${dueToday.length} Aufgaben`;
    } else if (overdue.length) {
      body = `${overdue.length} überfällige Aufgaben`;
    } else {
      return; // nothing to report
    }

    const payload = JSON.stringify({ title: 'Kairos', body, tag: 'morning-summary' });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
      } catch (e) {
        if (e.statusCode === 410) {
          repo.deletePushSubscription(sub.endpoint);
        } else {
          logger.error('push send error:', e.message);
        }
      }
    }
  }

  async function tick() {
    if (stopped) return;
    try {
      const now = new Date();

      // Daily morning push at 9:00
      const todayStr = todayDateStr(now);
      if (now.getHours() === 9 && lastMorningPush !== todayStr) {
        lastMorningPush = todayStr;
        sendMorningPush(now).catch((e) => logger.error('morning push error:', e));
      }

      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      const tasks = repo.listTasks().filter((t) =>
        t.is_active && t.status !== 'done' && t.status !== 'cancelled'
      );

      for (const t of tasks) {
        // Deadline triggers
        if (t.deadline) {
          const deadline = parseDeadline(t.deadline, now);
          if (!isNaN(deadline.getTime())) {
            if (deadline < todayMidnight && !repo.hasDeadlineFired(t.id, 'overdue')) {
              repo.recordDeadlineFire(t.id, 'overdue');
              runAgent({ type: 'deadline', payload: { task: t, kind: 'overdue' } })
                .catch((e) => logger.error('deadline trigger error:', e));
            } else if (deadline >= todayMidnight && deadline < tomorrowMidnight && !repo.hasDeadlineFired(t.id, 'approaching')) {
              repo.recordDeadlineFire(t.id, 'approaching');
              runAgent({ type: 'deadline', payload: { task: t, kind: 'approaching' } })
                .catch((e) => logger.error('deadline trigger error:', e));
            }
          }
        }
        // Follow-up trigger (full datetime, unchanged)
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