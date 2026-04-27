import { Router } from 'express';

export function pushRouter({ repo }) {
  const r = Router();

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

  return r;
}