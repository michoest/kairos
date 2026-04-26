import { emit } from '../../events.js';

function normalizeToolName(name) {
  if (!name || typeof name !== 'string') return '';
  // Some models hallucinate a "functions." or "tool:" prefix on tool names referenced as strings.
  return name.replace(/^functions\./, '').replace(/^tool:/, '').trim();
}

export function proposalTools({ repo, currentTrigger, currentRunState, allowedToolNames }) {
  return [
    {
      name: 'propose_actions',
      description:
        'Instead of executing tool actions directly, bundle them into a single proposal for the user to accept or dismiss. ' +
        'Use this for bulk operations, anything potentially unwanted, or changes where the user should confirm first ' +
        '(e.g. deactivating many tasks, reorganizing dependencies). Small, clearly-correct actions should still be executed directly. ' +
        'Call this at most once per run. ' +
        'Each action.tool MUST be a bare registered tool name (e.g. "update_task"), never a namespaced or prefixed name.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Short user-facing explanation of what you are proposing.' },
          actions: {
            type: 'array',
            description: 'List of tool calls to execute on accept.',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: 'Bare tool name, no prefix.' },
                args: { type: 'object', additionalProperties: true },
              },
              required: ['tool', 'args'],
            },
          },
        },
        required: ['message', 'actions'],
      },
      handler: ({ message, actions }) => {
        const state = currentRunState?.();
        if (state && state.proposalCount >= 1) {
          return { skipped: 'Already proposed actions in this run. One proposal per run.' };
        }

        const allowed = allowedToolNames ? allowedToolNames() : null;
        const normalized = [];
        const errors = [];
        for (const a of actions ?? []) {
          const name = normalizeToolName(a?.tool);
          if (!name) { errors.push(`action missing tool name`); continue; }
          if (allowed && !allowed.has(name)) {
            errors.push(`unknown tool "${a.tool}" — use a bare registered name`);
            continue;
          }
          normalized.push({ tool: name, args: a.args ?? {} });
        }
        if (errors.length) {
          return {
            error: errors.join('; '),
            hint: 'Fix the tool names and call propose_actions again.',
          };
        }

        if (state) state.proposalCount = (state.proposalCount ?? 0) + 1;
        const trigger = currentTrigger();
        const p = repo.createProposal({
          message,
          actions: normalized,
          trigger_type: trigger?.type ?? null,
          trigger_ref: trigger?.ref ?? null,
        });
        emit('proposal.created', p);
        return { proposal: p };
      },
    },
  ];
}
