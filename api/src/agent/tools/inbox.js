import { emit } from '../../events.js';

export function inboxTools({ repo }) {
  return [
    {
      name: 'add_to_inbox',
      description: 'Add a text snippet to the inbox. Use this when something should become a task but you are not sure which category it belongs to, or when the user gives you an unstructured idea.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          reason: { type: 'string', description: 'Short internal note on why this landed in inbox instead of a direct task.' },
        },
        required: ['content'],
      },
      handler: ({ content }) => {
        const item = repo.createInboxItem({ content, origin: 'agent' });
        emit('inbox.created', item);
        return { inbox_item: item };
      },
    },
    {
      name: 'convert_inbox_item',
      description: 'Convert an inbox item into a real task with a category. The inbox item is kept but marked as converted.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Inbox item id' },
          category_id: { type: 'string' },
          title: { type: 'string', description: 'Optional — defaults to inbox item content' },
          description: { type: 'string' },
          deadline: { type: 'string' },
          follow_up_at: { type: 'string' },
          responsible: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in_progress', 'waiting', 'done', 'cancelled'] },
          recurrence: { type: 'object', additionalProperties: true },
          metadata: { type: 'object', additionalProperties: true },
        },
        required: ['id', 'category_id'],
      },
      handler: ({ id, ...fields }) => {
        const result = repo.convertInboxItem(id, fields);
        emit('inbox.converted', result.inbox_item);
        emit('task.created', result.task);
        return result;
      },
    },
  ];
}
