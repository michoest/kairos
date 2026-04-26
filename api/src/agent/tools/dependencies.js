import { emit } from '../../events.js';

export function dependencyTools({ repo }) {
  return [
    {
      name: 'add_dependency',
      description: 'Mark that one task blocks another. blocking_task_id must finish (done or cancelled) before blocked_task_id can proceed.',
      parameters: {
        type: 'object',
        properties: {
          blocked_task_id: { type: 'string', description: 'The task that is blocked/waiting' },
          blocking_task_id: { type: 'string', description: 'The task that must complete first' },
        },
        required: ['blocked_task_id', 'blocking_task_id'],
      },
      handler: (args) => {
        const dep = repo.addDependency(args);
        emit('dependency.added', dep);
        return { dependency: dep };
      },
    },
    {
      name: 'remove_dependency',
      description: 'Remove a dependency between two tasks.',
      parameters: {
        type: 'object',
        properties: {
          blocked_task_id: { type: 'string' },
          blocking_task_id: { type: 'string' },
        },
        required: ['blocked_task_id', 'blocking_task_id'],
      },
      handler: (args) => {
        const result = repo.removeDependencyByPair(args);
        emit('dependency.removed', args);
        return { removed: result.changes };
      },
    },
  ];
}
