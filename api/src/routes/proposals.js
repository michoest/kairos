import { Router } from 'express';
import { emit } from '../events.js';

export function proposalsRouter({ repo, executeProposal }) {
  const r = Router();

  r.get('/', (req, res) => {
    const status = req.query.status ?? null;
    res.json(repo.listProposals({ status }));
  });

  r.post('/:id/accept', async (req, res) => {
    const p = repo.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    if (p.status !== 'pending') return res.status(400).json({ error: `already ${p.status}` });
    try {
      const results = await executeProposal(p);
      repo.markProposalResolved(p.id, 'accepted', results);
      const updated = repo.getProposal(p.id);
      emit('proposal.resolved', updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  r.post('/:id/dismiss', (req, res) => {
    const p = repo.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    if (p.status !== 'pending') return res.status(400).json({ error: `already ${p.status}` });
    repo.markProposalResolved(p.id, 'dismissed');
    const updated = repo.getProposal(p.id);
    emit('proposal.resolved', updated);
    res.json(updated);
  });

  return r;
}
