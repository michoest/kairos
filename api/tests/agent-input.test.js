import { describe, test, expect } from 'vitest';
import request from 'supertest';
import { setupApp } from './helpers.js';

describe('agent-input modes', () => {
  test('POST /api/agent-input mode=context fires context_event trigger', async () => {
    const calls = [];
    const { app } = setupApp({ runAgent: async (t) => { calls.push(t); return {}; } });
    await request(app).post('/api/agent-input').send({ content: 'Es regnet', mode: 'context' });
    expect(calls[0]?.type).toBe('context_event');
    expect(calls[0].payload.event.mode).toBe('context');
  });

  test('mode=instruction fires `instruction` trigger', async () => {
    const calls = [];
    const { app } = setupApp({ runAgent: async (t) => { calls.push(t); return {}; } });
    await request(app).post('/api/agent-input').send({ content: 'Mach X', mode: 'instruction' });
    expect(calls[0]?.type).toBe('instruction');
    expect(calls[0].payload.event.mode).toBe('instruction');
  });

  test('mode=auto fires `auto` trigger', async () => {
    const calls = [];
    const { app } = setupApp({ runAgent: async (t) => { calls.push(t); return {}; } });
    await request(app).post('/api/agent-input').send({
      content: 'Mehl kaufen',
      mode: 'auto',
      source: 'siri_shortcut',
    });
    expect(calls[0]?.type).toBe('auto');
    expect(calls[0].payload.event.source).toBe('siri_shortcut');
  });

  test('invalid mode is rejected', async () => {
    const { app } = setupApp();
    const res = await request(app).post('/api/agent-input').send({ content: 'x', mode: 'nonsense' });
    expect(res.status).toBe(400);
  });

  test('/api/context alias still works and defaults to context mode', async () => {
    const calls = [];
    const { app } = setupApp({ runAgent: async (t) => { calls.push(t); return {}; } });
    await request(app).post('/api/context').send({ content: 'legacy' });
    expect(calls[0]?.type).toBe('context_event');
    expect(calls[0].payload.event.mode).toBe('context');
  });
});
