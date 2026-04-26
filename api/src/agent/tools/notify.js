import { emit } from '../../events.js';

export function notifyTools({ repo, currentTrigger, currentRunState }) {
  return [
    {
      name: 'notify_user',
      description: 'Send a short, actionable message to the user. Call this at most once per run — if you have several points, combine them into one message.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The message to show the user' },
          related_task_id: { type: 'string', description: 'Optional task id this message relates to' },
        },
        required: ['content'],
      },
      handler: ({ content, related_task_id = null }) => {
        const state = currentRunState?.();
        if (state && state.notifyCount >= 1) {
          return {
            skipped: 'Already notified earlier in this run. Only one notify_user per run is allowed — combine messages next time.',
          };
        }
        if (state) state.notifyCount += 1;

        const trigger = currentTrigger();
        const msg = repo.createAgentMessage({
          content,
          related_task_id,
          trigger_type: trigger?.type ?? 'unknown',
          trigger_ref: trigger?.ref ?? null,
        });
        emit('agent.message', msg);
        return { message: msg };
      },
    },
  ];
}
