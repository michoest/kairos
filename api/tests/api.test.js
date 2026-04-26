import { describe, test, expect } from 'vitest';
import request from 'supertest';
import { setupApp } from './helpers.js';

describe('CRUD API', () => {
  test('create space, category, task and list them', async () => {
    const { app } = setupApp();

    const space = (await request(app).post('/api/spaces').send({ name: 'Arbeit' })).body;
    expect(space.id).toBeDefined();

    const category = (await request(app).post('/api/categories')
      .send({ space_id: space.id, name: 'Projekte' })).body;
    expect(category.id).toBeDefined();

    const task = (await request(app).post('/api/tasks')
      .send({ category_id: category.id, title: 'Konto eröffnen' })).body;
    expect(task.id).toBeDefined();
    expect(task.status).toBe('open');
    expect(task.is_blocked).toBe(false);

    const list = await request(app).get('/api/tasks');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Konto eröffnen');
  });

  test('rejects invalid status', async () => {
    const { app, repo } = setupApp();
    const s = repo.createSpace({ name: 's' });
    const c = repo.createCategory({ space_id: s.id, name: 'c' });
    const res = await request(app).post('/api/tasks')
      .send({ category_id: c.id, title: 't', status: 'nonsense' });
    expect(res.status).toBe(400);
  });

  test('rejects task with unknown category', async () => {
    const { app } = setupApp();
    const res = await request(app).post('/api/tasks')
      .send({ category_id: 'missing', title: 't' });
    expect(res.status).toBe(400);
  });

  test('metadata JSON roundtrips', async () => {
    const { app, repo } = setupApp();
    const s = repo.createSpace({ name: 's' });
    const c = repo.createCategory({ space_id: s.id, name: 'c' });
    const created = (await request(app).post('/api/tasks').send({
      category_id: c.id,
      title: 'Call bank',
      metadata: { tel: 'tel:+491234', url: 'https://bank.example' },
    })).body;
    expect(created.metadata).toEqual({ tel: 'tel:+491234', url: 'https://bank.example' });

    const fetched = (await request(app).get(`/api/tasks/${created.id}`)).body;
    expect(fetched.metadata).toEqual({ tel: 'tel:+491234', url: 'https://bank.example' });
  });

  test('user_action trigger fires on task create + update', async () => {
    const calls = [];
    const { app, repo } = setupApp({ runAgent: async (t) => { calls.push(t); return {}; } });
    const s = repo.createSpace({ name: 's' });
    const c = repo.createCategory({ space_id: s.id, name: 'c' });
    const created = (await request(app).post('/api/tasks')
      .send({ category_id: c.id, title: 'T' })).body;
    await request(app).patch(`/api/tasks/${created.id}`).send({ title: 'T2' });

    // Give fire-and-forget a tick
    await new Promise((r) => setImmediate(r));
    expect(calls.map((c) => c.payload.action)).toContain('task.created');
    expect(calls.map((c) => c.payload.action)).toContain('task.updated');
  });
});

describe('Context events', () => {
  test('POST /context creates an event and invokes the agent', async () => {
    let got = null;
    const { app } = setupApp({ runAgent: async (t) => { got = t; return { iterations: 1, tool_calls: [] }; } });
    const res = await request(app).post('/api/context').send({ content: 'Kontoeröffnung bestätigt' });
    expect(res.status).toBe(201);
    expect(res.body.event.content).toBe('Kontoeröffnung bestätigt');
    expect(got?.type).toBe('context_event');
  });

  test('GET /context returns events newest first', async () => {
    const { app } = setupApp();
    await request(app).post('/api/context').send({ content: 'one' });
    await request(app).post('/api/context').send({ content: 'two' });
    const list = await request(app).get('/api/context');
    expect(list.body).toHaveLength(2);
    expect(list.body[0].content).toBe('two');
  });
});

describe('Messages', () => {
  test('dismiss marks dismissed_at', async () => {
    const { app, repo } = setupApp();
    const m = repo.createAgentMessage({ content: 'hi', trigger_type: 'test' });
    const res = await request(app).post(`/api/messages/${m.id}/dismiss`);
    expect(res.status).toBe(204);
    const list = (await request(app).get('/api/messages')).body;
    expect(list[0].dismissed_at).toBeTruthy();
  });
});
