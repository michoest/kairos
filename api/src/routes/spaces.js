import { Router } from 'express';

export function spacesRouter({ repo }) {
  const r = Router();

  r.get('/', (req, res) => res.json(repo.listSpaces()));

  r.post('/', (req, res) => {
    const { name, description } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    res.status(201).json(repo.createSpace({ name, description }));
  });

  r.get('/:id', (req, res) => {
    const s = repo.getSpace(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(s);
  });

  r.patch('/:id', (req, res) => {
    const s = repo.getSpace(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(repo.updateSpace(req.params.id, req.body ?? {}));
  });

  r.delete('/:id', (req, res) => {
    repo.deleteSpace(req.params.id);
    res.status(204).end();
  });

  return r;
}
