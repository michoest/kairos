import { createDatabase } from '../src/db.js';
import { createRepo } from '../src/repo.js';
import { createApp } from '../src/app.js';

export function setupRepo() {
  const db = createDatabase(':memory:');
  return { db, repo: createRepo(db) };
}

export function setupApp({
  runAgent = async () => ({ iterations: 0, tool_calls: [] }),
  executeProposal = async () => [],
} = {}) {
  const { db, repo } = setupRepo();
  const app = createApp({ repo, runAgent, executeProposal, openaiClient: null });
  return { db, repo, app };
}

export function seedBasicTree(repo) {
  const space = repo.createSpace({ name: 'Privat' });
  const category = repo.createCategory({ space_id: space.id, name: 'Finanzen' });
  return { space, category };
}
