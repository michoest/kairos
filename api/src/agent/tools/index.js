import { taskTools } from './tasks.js';
import { dependencyTools } from './dependencies.js';
import { categoryTools } from './categories.js';
import { spaceTools } from './spaces.js';
import { notifyTools } from './notify.js';
import { noActionTools } from './no-action.js';
import { inboxTools } from './inbox.js';
import { proposalTools } from './proposals.js';

export function buildToolRegistry({ repo, currentTrigger, currentRunState }) {
  // Two-pass build so propose_actions can validate against the other tools' names.
  const coreTools = [
    ...taskTools({ repo }),
    ...dependencyTools({ repo }),
    ...categoryTools({ repo }),
    ...spaceTools({ repo }),
    ...inboxTools({ repo }),
    ...notifyTools({ repo, currentTrigger, currentRunState }),
    ...noActionTools(),
  ];
  const coreNames = new Set(coreTools.map((t) => t.name));
  const all = [
    ...coreTools,
    ...proposalTools({
      repo,
      currentTrigger,
      currentRunState,
      allowedToolNames: () => coreNames,
    }),
  ];
  const byName = new Map(all.map((t) => [t.name, t]));
  return {
    all,
    get: (name) => byName.get(name),
    openaiDefinitions: () => all.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
  };
}
