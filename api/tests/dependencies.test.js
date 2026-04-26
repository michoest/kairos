import { describe, test, expect } from 'vitest';
import { setupRepo, seedBasicTree } from './helpers.js';

describe('dependencies', () => {
  test('add + list blocking', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    const b = repo.createTask({ category_id: category.id, title: 'B' });

    repo.addDependency({ blocked_task_id: a.id, blocking_task_id: b.id });
    expect(repo.isBlocked(a.id)).toBe(true);
    expect(repo.isBlocked(b.id)).toBe(false);

    const blockers = repo.listBlockingFor(a.id);
    expect(blockers.map((t) => t.id)).toEqual([b.id]);
  });

  test('isBlocked becomes false when blocker is done', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    const b = repo.createTask({ category_id: category.id, title: 'B' });
    repo.addDependency({ blocked_task_id: a.id, blocking_task_id: b.id });
    expect(repo.isBlocked(a.id)).toBe(true);
    repo.updateTask(b.id, { status: 'done' });
    expect(repo.isBlocked(a.id)).toBe(false);
  });

  test('rejects self-dependency', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    expect(() => repo.addDependency({ blocked_task_id: a.id, blocking_task_id: a.id }))
      .toThrow();
  });

  test('rejects direct cycle', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    const b = repo.createTask({ category_id: category.id, title: 'B' });
    repo.addDependency({ blocked_task_id: a.id, blocking_task_id: b.id });
    expect(() => repo.addDependency({ blocked_task_id: b.id, blocking_task_id: a.id }))
      .toThrow(/cycle/);
  });

  test('rejects transitive cycle', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    const b = repo.createTask({ category_id: category.id, title: 'B' });
    const c = repo.createTask({ category_id: category.id, title: 'C' });
    repo.addDependency({ blocked_task_id: a.id, blocking_task_id: b.id });
    repo.addDependency({ blocked_task_id: b.id, blocking_task_id: c.id });
    expect(() => repo.addDependency({ blocked_task_id: c.id, blocking_task_id: a.id }))
      .toThrow(/cycle/);
  });

  test('removeDependencyByPair deletes the edge', () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    const b = repo.createTask({ category_id: category.id, title: 'B' });
    repo.addDependency({ blocked_task_id: a.id, blocking_task_id: b.id });
    repo.removeDependencyByPair({ blocked_task_id: a.id, blocking_task_id: b.id });
    expect(repo.isBlocked(a.id)).toBe(false);
  });
});
