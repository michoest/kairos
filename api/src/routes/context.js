import { Router } from 'express';
import { emit } from '../events.js';

const VALID_MODES = new Set(['context', 'instruction', 'auto']);

/**
 * /api/agent-input is the canonical endpoint. Body: { content, mode, source? }
 * - mode='context':     passive observation; fires `context_event` trigger, agent may no_action.
 * - mode='instruction': direct command; fires `instruction` trigger, agent should execute.
 * - mode='auto':        source (e.g. Siri) did not pre-classify; fires `auto` trigger, agent classifies.
 *
 * /api/context is kept as an alias that always sets mode='context'.
 */
export function agentInputRouter({ repo, runAgent }) {
  const r = Router();

  r.get('/', (req, res) => {
    const limit = parseInt(req.query.limit ?? '50', 10);
    res.json(repo.listContextEvents(limit));
  });

  r.post('/', async (req, res) => {
    const { content, source, mode = 'context' } = req.body ?? {};
    if (!content || typeof content !== 'string') return res.status(400).json({ error: 'content required' });
    if (!VALID_MODES.has(mode)) return res.status(400).json({ error: `invalid mode: ${mode}` });

    const event = repo.createContextEvent({
      content,
      source: source ?? 'user',
      mode,
    });
    emit('context.created', event);

    const triggerType = mode === 'instruction' ? 'instruction' : mode === 'auto' ? 'auto' : 'context_event';

    try {
      const result = await runAgent?.({ type: triggerType, payload: { event } });
      res.status(201).json({ event, agent: result });
    } catch (err) {
      console.error(`agent ${triggerType} error:`, err);
      res.status(201).json({ event, agent: { error: err.message } });
    }
  });

  return r;
}
