import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const TABLES_SCHEMA = `
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting', 'done', 'cancelled')),
  responsible TEXT,
  deadline TEXT,
  follow_up_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  recurrence TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dependencies (
  id TEXT PRIMARY KEY,
  blocked_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocking_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(blocked_task_id, blocking_task_id),
  CHECK (blocked_task_id != blocking_task_id)
);

CREATE TABLE IF NOT EXISTS context_events (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'context',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  related_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  trigger_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  dismissed_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  trigger_payload TEXT NOT NULL,
  iterations INTEGER,
  tool_calls TEXT,
  final_message TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deadline_fires (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  fired_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, kind)
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'keyboard',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  converted_at TEXT,
  converted_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  actions TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'dismissed')),
  results TEXT,
  trigger_type TEXT,
  trigger_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
`;

const INDEXES_SCHEMA = `
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_follow_up ON tasks(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_categories_space ON categories(space_id);
CREATE INDEX IF NOT EXISTS idx_deps_blocked ON dependencies(blocked_task_id);
CREATE INDEX IF NOT EXISTS idx_deps_blocking ON dependencies(blocking_task_id);
CREATE INDEX IF NOT EXISTS idx_inbox_unconverted ON inbox_items(converted_at);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON agent_proposals(status);
`;

/**
 * Column-level additive migrations. On each boot we inspect the existing tables
 * and add any missing columns. For breaking schema changes we'd use PRAGMA user_version
 * but for an MVP appending columns is enough.
 */
function runMigrations(db) {
  const tasksCols = db.prepare('PRAGMA table_info(tasks)').all().map((r) => r.name);
  const addTaskCol = (name, ddl) => {
    if (!tasksCols.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${ddl}`);
  };
  addTaskCol('follow_up_at', 'follow_up_at TEXT');
  addTaskCol('is_active', 'is_active INTEGER NOT NULL DEFAULT 1');
  addTaskCol('recurrence', 'recurrence TEXT');

  const ctxCols = db.prepare('PRAGMA table_info(context_events)').all().map((r) => r.name);
  if (!ctxCols.includes('mode')) {
    db.exec(`ALTER TABLE context_events ADD COLUMN mode TEXT NOT NULL DEFAULT 'context'`);
  }
}

export function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(TABLES_SCHEMA);
  runMigrations(db);
  db.exec(INDEXES_SCHEMA);
  return db;
}
