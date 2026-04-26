import { describe, test, expect } from 'vitest';
import request from 'supertest';
import { setupApp, setupRepo, seedBasicTree } from './helpers.js';

describe('task: recurrence on complete', () => {
  test('one-off task → status done', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({ category_id: category.id, title: 'Einmalig' });
    const res = (await request(app).post(`/api/tasks/${t.id}/complete`)).body;
    expect(res.task.status).toBe('done');
    expect(res.advanced).toBe(false);
  });

  test('recurring task → advanced, stays open', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({
      category_id: category.id,
      title: 'Bad putzen',
      deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      recurrence: { type: 'interval', unit: 'week', every: 1 },
    });
    const res = (await request(app).post(`/api/tasks/${t.id}/complete`)).body;
    expect(res.advanced).toBe(true);
    expect(res.task.status).toBe('open');
    expect(new Date(res.task.deadline).getTime()).toBeGreaterThan(Date.now());
  });

  test('skip endpoint rejects non-recurring', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({ category_id: category.id, title: 'X' });
    const res = await request(app).post(`/api/tasks/${t.id}/skip`);
    expect(res.status).toBe(400);
  });

  test('skip advances past current occurrence', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const deadlineFuture = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const t = repo.createTask({
      category_id: category.id,
      title: 'Müll',
      deadline: deadlineFuture,
      recurrence: { type: 'interval', unit: 'week', every: 1 },
    });
    const res = (await request(app).post(`/api/tasks/${t.id}/skip`)).body;
    expect(new Date(res.task.deadline).getTime()).toBeGreaterThan(new Date(deadlineFuture).getTime());
  });
});

describe('status auto-clean (waiting → open)', () => {
  test('moving out of waiting to open clears responsible + follow_up_at', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({
      category_id: category.id,
      title: 'X',
      status: 'waiting',
      responsible: 'Bob',
      follow_up_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
    });
    const res = (await request(app).patch(`/api/tasks/${t.id}`).send({ status: 'open' })).body;
    expect(res.status).toBe('open');
    expect(res.responsible).toBeNull();
    expect(res.follow_up_at).toBeNull();
  });

  test('moving waiting → done keeps responsible (only open clears)', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({
      category_id: category.id,
      title: 'X',
      status: 'waiting',
      responsible: 'Bob',
    });
    const res = (await request(app).patch(`/api/tasks/${t.id}`).send({ status: 'done' })).body;
    expect(res.responsible).toBe('Bob');
  });
});

describe('deadline fires cleanup on change', () => {
  test('changing deadline clears past overdue fires', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({ category_id: category.id, title: 'X', deadline: '2026-01-01T00:00:00Z' });
    repo.recordDeadlineFire(t.id, 'overdue');
    expect(repo.hasDeadlineFired(t.id, 'overdue')).toBe(true);
    repo.updateTask(t.id, { deadline: '2027-01-01T00:00:00Z' });
    expect(repo.hasDeadlineFired(t.id, 'overdue')).toBe(false);
  });

  test('complete (recurring) clears overdue fires', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({
      category_id: category.id,
      title: 'X',
      deadline: new Date(Date.now() - 86400_000).toISOString(),
      recurrence: { type: 'interval', unit: 'day', every: 1 },
    });
    repo.recordDeadlineFire(t.id, 'overdue');
    repo.completeTask(t.id);
    expect(repo.hasDeadlineFired(t.id, 'overdue')).toBe(false);
  });
});

describe('is_active / recurrence persistence', () => {
  test('recurrence roundtrips as a typed object', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const body = {
      category_id: category.id,
      title: 'Wöchentlich',
      recurrence: { type: 'weekly', weekdays: [1, 4] },
    };
    const created = (await request(app).post('/api/tasks').send(body)).body;
    expect(created.recurrence).toEqual({ type: 'weekly', weekdays: [1, 4] });
    expect(created.is_active).toBe(true);

    const updated = (await request(app).patch(`/api/tasks/${created.id}`).send({ is_active: false })).body;
    expect(updated.is_active).toBe(false);
  });

  test('invalid recurrence rejected with 400', async () => {
    const { app, repo } = setupApp();
    const { category } = seedBasicTree(repo);
    const res = await request(app).post('/api/tasks').send({
      category_id: category.id,
      title: 'X',
      recurrence: { type: 'interval', unit: 'day', every: 0 },
    });
    expect(res.status).toBe(400);
  });
});
