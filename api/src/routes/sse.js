import { Router } from 'express';
import { bus } from '../events.js';

export function sseRouter() {
  const r = Router();

  r.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: hello\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);

    const listener = (evt) => {
      res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.payload)}\n\n`);
    };
    bus.on('event', listener);

    const keepalive = setInterval(() => res.write(`:keepalive\n\n`), 25_000);

    req.on('close', () => {
      clearInterval(keepalive);
      bus.off('event', listener);
    });
  });

  return r;
}
