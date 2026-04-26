export function noActionTools() {
  return [
    {
      name: 'no_action',
      description: 'Explicitly decide to do nothing for this trigger. Provide a short reason for the log. Always prefer this over a silent no-op.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        required: ['reason'],
      },
      handler: ({ reason }) => ({ reason }),
    },
  ];
}
