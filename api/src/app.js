import express from 'express';
import cors from 'cors';
import { spacesRouter } from './routes/spaces.js';
import { categoriesRouter } from './routes/categories.js';
import { tasksRouter } from './routes/tasks.js';
import { agentInputRouter } from './routes/context.js';
import { messagesRouter } from './routes/messages.js';
import { sseRouter } from './routes/sse.js';
import { sttRouter } from './routes/stt.js';
import { inboxRouter } from './routes/inbox.js';
import { proposalsRouter } from './routes/proposals.js';

export function createApp({ repo, runAgent, executeProposal, openaiClient, sttModel, corsOrigin }) {
  const app = express();
  app.use(cors({ origin: corsOrigin ?? true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.use('/api/spaces', spacesRouter({ repo }));
  app.use('/api/categories', categoriesRouter({ repo }));
  app.use('/api/tasks', tasksRouter({ repo, runAgent }));
  app.use('/api/agent-input', agentInputRouter({ repo, runAgent }));
  app.use('/api/context', agentInputRouter({ repo, runAgent })); // legacy alias, defaults to mode='context'
  app.use('/api/messages', messagesRouter({ repo }));
  app.use('/api/inbox', inboxRouter({ repo, runAgent }));
  app.use('/api/proposals', proposalsRouter({ repo, executeProposal: executeProposal ?? (async () => []) }));
  app.use('/api/events', sseRouter());
  app.use('/api/stt', sttRouter({ openaiClient, model: sttModel }));

  return app;
}
