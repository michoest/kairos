import { Router } from 'express';

export function messagesRouter({ repo }) {
  const r = Router();

  r.get('/', (req, res) => {
    const limit = parseInt(req.query.limit ?? '100', 10);
    res.json(repo.listAgentMessages(limit));
  });

  r.post('/:id/dismiss', (req, res) => {
    repo.dismissAgentMessage(req.params.id);
    res.status(204).end();
  });

  r.get('/runs', (req, res) => {
    const limit = parseInt(req.query.limit ?? '50', 10);
    res.json(repo.listAgentRuns(limit));
  });

  return r;
}
