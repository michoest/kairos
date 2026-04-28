import 'dotenv/config';
import OpenAI from 'openai';
import webpush from 'web-push';
import { createDatabase } from './db.js';
import { createRepo } from './repo.js';
import { createAgent } from './agent/index.js';
import { startDeadlineScheduler } from './scheduler.js';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const DB_PATH = process.env.DATABASE_PATH ?? './data/kairos.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const STT_MODEL = process.env.OPENAI_STT_MODEL ?? 'whisper-1';
const MAX_ITER = parseInt(process.env.AGENT_MAX_ITERATIONS ?? '5', 10);
const DEADLINE_INTERVAL = parseInt(process.env.DEADLINE_POLL_INTERVAL_MS ?? '60000', 10);
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? null;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? null;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:michael.oesterle@bridge-brain.ai', VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('[kairos] VAPID keys not set — push notifications are disabled.');
}

const db = createDatabase(DB_PATH);
const repo = createRepo(db);

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

if (!openaiClient) {
  console.warn('[kairos] OPENAI_API_KEY not set — agent and STT are disabled.');
}

const agent = openaiClient
  ? createAgent({ repo, openaiClient, model: MODEL, maxIterations: MAX_ITER })
  : { runAgent: async () => ({ skipped: 'no openai client' }), executeProposal: async () => [] };

const app = createApp({
  repo,
  runAgent: agent.runAgent,
  executeProposal: agent.executeProposal,
  openaiClient,
  sttModel: STT_MODEL,
  corsOrigin: CORS_ORIGIN,
  webpush: (VAPID_PUBLIC && VAPID_PRIVATE) ? webpush : null,
  vapidPublicKey: VAPID_PUBLIC,
});

const scheduler = startDeadlineScheduler({
  repo,
  runAgent: agent.runAgent,
  intervalMs: DEADLINE_INTERVAL,
  webpush: (VAPID_PUBLIC && VAPID_PRIVATE) ? webpush : null,
});

const server = app.listen(PORT, () => {
  console.log(`[kairos] api listening on http://localhost:${PORT}`);
});

function shutdown() {
  console.log('[kairos] shutting down...');
  scheduler.stop();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
