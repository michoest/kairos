import { emit } from '../../events.js';

export function categoryTools({ repo }) {
  return [
    {
      name: 'create_category',
      description: 'Create a new category within a space.',
      parameters: {
        type: 'object',
        properties: {
          space_id: { type: 'string' },
          name: { type: 'string' },
          color: { type: 'string' },
        },
        required: ['space_id', 'name'],
      },
      handler: (args) => {
        const c = repo.createCategory(args);
        emit('category.created', c);
        return { category: c };
      },
    },
    {
      name: 'update_category',
      description: 'Update a category (rename, change color, move to another space).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          color: { type: 'string' },
          space_id: { type: 'string' },
        },
        required: ['id'],
      },
      handler: ({ id, ...rest }) => {
        const c = repo.updateCategory(id, rest);
        emit('category.updated', c);
        return { category: c };
      },
    },
    {
      name: 'delete_category',
      description: 'Delete a category. Cascades to all its tasks — use with care.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }) => {
        repo.deleteCategory(id);
        emit('category.deleted', { id });
        return { deleted: id };
      },
    },
  ];
}
