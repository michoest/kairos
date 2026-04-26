import { describe, test, expect } from 'vitest';
import request from 'supertest';
import { setupApp, setupRepo, seedBasicTree } from './helpers.js';

describe('inbox', () => {
  test('create + list unconverted items', async () => {
    const { app } = setupApp();
    const created = (await request(app).post('/api/inbox').send({ content: 'Call back Bob', origin: 'keyboard' })).body;
    expect(created.id).toBeDefined();
    expect(created.origin).toBe('keyboard');

    const list = (await request(app).get('/api/inbox')).body;
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('Call back Bob');
  });

  test('origin fallback on unknown value', async () => {
    const { app } = setupApp();
    const item = (await request(app).post('/api/inbox').send({ content: 'x', origin: 'bogus' })).body;
    expect(item.origin).toBe('keyboard');
  });

  test('convert creates task and marks item as converted (filtered by default)', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const item = (await request(app).post('/api/inbox').send({ content: 'Dachrinne checken' })).body;

    const res = await request(app).post(`/api/inbox/${item.id}/convert`).send({
      category_id: category.id,
      title: 'Dachrinne checken und säubern',
      metadata: { url: 'https://foo' },
    });
    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('Dachrinne checken und säubern');
    expect(res.body.inbox_item.converted_task_id).toBe(res.body.task.id);

    // Default list excludes converted
    const list = (await request(app).get('/api/inbox')).body;
    expect(list).toHaveLength(0);

    // With include_converted=1 we see it
    const all = (await request(app).get('/api/inbox?include_converted=1')).body;
    expect(all).toHaveLength(1);
    expect(all[0].converted_at).toBeTruthy();
  });

  test('convert twice fails', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const item = (await request(app).post('/api/inbox').send({ content: 'x' })).body;
    await request(app).post(`/api/inbox/${item.id}/convert`).send({ category_id: category.id });
    const res = await request(app).post(`/api/inbox/${item.id}/convert`).send({ category_id: category.id });
    expect(res.status).toBe(400);
  });

  test('inbox_added trigger fires for new items', async () => {
    const calls = [];
    const { app } = setupApp({ runAgent: async (t) => { calls.push(t); return {}; } });
    await request(app).post('/api/inbox').send({ content: 'x' });
    await new Promise((r) => setImmediate(r));
    expect(calls[0]?.type).toBe('inbox_added');
  });
});
