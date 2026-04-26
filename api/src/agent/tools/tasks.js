import { emit } from '../../events.js';

const RECURRENCE_SCHEMA = {
  type: 'object',
  description: 'Recurrence spec. Either { type: "interval", unit: "day"|"week"|"month", every: N } or { type: "weekly", weekdays: [0-6, 0=Sun] }. Null for one-off.',
  additionalProperties: true,
};

export function taskTools({ repo }) {
  return [
    {
      name: 'create_task',
      description:
        'Create a new task. Requires a category_id. If you are not sure which category fits, use add_to_inbox instead.',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in_progress', 'waiting', 'done', 'cancelled'] },
          responsible: { type: 'string' },
          deadline: { type: 'string', description: 'ISO 8601 datetime' },
          follow_up_at: { type: 'string', description: 'ISO 8601 — when to nudge if still waiting' },
          is_active: { type: 'boolean' },
          recurrence: RECURRENCE_SCHEMA,
          metadata: { type: 'object', additionalProperties: true },
        },
        required: ['category_id', 'title'],
      },
      handler: (args) => {
        const task = repo.createTask(args);
        emit('task.created', task);
        return { id: task.id, task };
      },
    },
    {
      name: 'update_task',
      description: 'Update fields of an existing task. Pass only the fields to change. Use this to change deadlines, follow-up times, activate/deactivate, set recurrence, etc.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in_progress', 'waiting', 'done', 'cancelled'] },
          responsible: { type: 'string' },
          deadline: { type: 'string' },
          follow_up_at: { type: 'string' },
          category_id: { type: 'string' },
          is_active: { type: 'boolean' },
          recurrence: RECURRENCE_SCHEMA,
          metadata: { type: 'object', additionalProperties: true },
        },
        required: ['id'],
      },
      handler: ({ id, ...rest }) => {
        const task = repo.updateTask(id, rest);
        emit('task.updated', task);
        return { task };
      },
    },
    {
      name: 'complete_task',
      description: 'Mark a task as done. For recurring tasks this advances to the next occurrence instead of closing.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }) => {
        const result = repo.completeTask(id);
        emit('task.updated', result.task);
        return result;
      },
    },
    {
      name: 'cancel_task',
      description: 'Mark a task as cancelled. Recurrence stops.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }) => {
        const task = repo.updateTask(id, { status: 'cancelled' });
        emit('task.updated', task);
        return { task };
      },
    },
    {
      name: 'skip_recurrence',
      description: 'Skip the current occurrence of a recurring task — advances the deadline to the next scheduled occurrence without marking complete.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }) => {
        const result = repo.skipRecurrence(id);
        if (!result) return { error: 'task not found or not recurring' };
        emit('task.updated', result.task);
        return result;
      },
    },
  ];
}
