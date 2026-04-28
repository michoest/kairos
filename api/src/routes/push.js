import { Router } from 'express';

export function pushRouter({ repo, webpush = null, vapidPublicKey = null }) {
  const r = Router();

  r.get('/config', (_req, res) => {
    res.json({
      publicVapidKey: vapidPublicKey ?? '',
      configured: Boolean(webpush && vapidPublicKey),
    });
  });

  r.post('/subscribe', (req, res) => {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    repo.savePushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
    res.status(201).json({ ok: true });
  });

  r.delete('/subscribe', (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    repo.deletePushSubscription(endpoint);
    res.json({ ok: true });
  });

  r.post('/test', async (req, res) => {
    if (!webpush) {
      return res.status(503).json({ error: 'Push not configured (missing VAPID keys)' });
    }
    const subs = repo.listPushSubscriptions();
    if (!subs.length) {
      return res.status(400).json({ error: 'No subscriptions found — subscribe first.' });
    }

    const title = req.body?.title ?? 'Kairos Test';
    const body = req.body?.body ?? 'Push-Benachrichtigungen funktionieren!';
    const payload = JSON.stringify({ title, body, tag: 'kairos-test', url: '/' });

    let sent = 0, removed = 0;
    const failures = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          repo.deletePushSubscription(sub.endpoint);
          removed++;
        } else {
          failures.push({ endpoint: sub.endpoint, statusCode: e.statusCode, message: e.message });
        }
      }
    }

    res.json({ ok: failures.length === 0, sent, removed, failed: failures.length, failures });
  });

  return r;
}
