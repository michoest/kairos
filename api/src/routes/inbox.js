import { Router } from 'express';
import { emit } from '../events.js';

const VALID_ORIGINS = new Set(['keyboard', 'agent', 'siri_shortcut']);

export function inboxRouter({ repo, runAgent }) {
  const r = Router();

  r.get('/', (req, res) => {
    const includeConverted = req.query.include_converted === '1';
    res.json(repo.listInboxItems({ includeConverted }));
  });

  r.post('/', async (req, res) => {
    const { content, origin = 'keyboard' } = req.body ?? {};
    if (!content || typeof content !== 'string') return res.status(400).json({ error: 'content required' });
    const o = VALID_ORIGINS.has(origin) ? origin : 'keyboard';
    const item = repo.createInboxItem({ content, origin: o });
    emit('inbox.created', item);

    runAgent?.({ type: 'inbox_added', payload: { item } })
      .catch((e) => console.error('agent inbox_added error:', e));

    res.status(201).json(item);
  });

  r.patch('/:id', (req, res) => {
    const item = repo.getInboxItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const updated = repo.updateInboxItem(req.params.id, req.body ?? {});
    emit('inbox.updated', updated);
    res.json(updated);
  });

  r.delete('/:id', (req, res) => {
    repo.deleteInboxItem(req.params.id);
    emit('inbox.deleted', { id: req.params.id });
    res.status(204).end();
  });

  r.post('/:id/convert', (req, res) => {
    try {
      const result = repo.convertInboxItem(req.params.id, req.body ?? {});
      emit('inbox.converted', result.inbox_item);
      emit('task.created', result.task);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return r;
}
