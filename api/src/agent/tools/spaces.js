import { emit } from '../../events.js';

export function spaceTools({ repo }) {
  return [
    {
      name: 'create_space',
      description: 'Create a new top-level space.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name'],
      },
      handler: (args) => {
        const s = repo.createSpace(args);
        emit('space.created', s);
        return { space: s };
      },
    },
    {
      name: 'update_space',
      description: 'Rename or redescribe a space.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id'],
      },
      handler: ({ id, ...rest }) => {
        const s = repo.updateSpace(id, rest);
        emit('space.updated', s);
        return { space: s };
      },
    },
    {
      name: 'delete_space',
      description: 'Delete a space. Cascades to all its categories and tasks — use with care.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }) => {
        repo.deleteSpace(id);
        emit('space.deleted', { id });
        return { deleted: id };
      },
    },
  ];
}
