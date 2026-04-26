import { Router } from 'express';

export function categoriesRouter({ repo }) {
  const r = Router();

  r.get('/', (req, res) => res.json(repo.listCategories(req.query.space_id ?? null)));

  r.post('/', (req, res) => {
    const { space_id, name, color } = req.body ?? {};
    if (!space_id || !name) return res.status(400).json({ error: 'space_id and name required' });
    if (!repo.getSpace(space_id)) return res.status(400).json({ error: 'space not found' });
    res.status(201).json(repo.createCategory({ space_id, name, color }));
  });

  r.get('/:id', (req, res) => {
    const c = repo.getCategory(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json(c);
  });

  r.patch('/:id', (req, res) => {
    const c = repo.getCategory(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json(repo.updateCategory(req.params.id, req.body ?? {}));
  });

  r.delete('/:id', (req, res) => {
    repo.deleteCategory(req.params.id);
    res.status(204).end();
  });

  return r;
}
