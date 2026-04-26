import { describe, test, expect } from 'vitest';
import { createAgent } from '../src/agent/index.js';
import { setupRepo, seedBasicTree } from './helpers.js';

// A scriptable OpenAI mock. Each call consumes the next scripted response.
function mockOpenAI(responses) {
  const queue = [...responses];
  return {
    chat: {
      completions: {
        create: async () => {
          if (!queue.length) throw new Error('mockOpenAI: no more scripted responses');
          const next = queue.shift();
          return { choices: [{ message: next }] };
        },
      },
    },
    _remaining: () => queue.length,
  };
}

function toolCall(name, args, id = `call_${Math.random().toString(36).slice(2)}`) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

describe('agent loop', () => {
  test('no_action short-circuits without tool changes', async () => {
    const { repo } = setupRepo();
    const openai = mockOpenAI([
      { role: 'assistant', content: null, tool_calls: [toolCall('no_action', { reason: 'not relevant' })] },
    ]);
    const { runAgent } = createAgent({ repo, openaiClient: openai });
    const result = await runAgent({
      type: 'context_event',
      payload: { event: repo.createContextEvent({ content: 'weather is nice', source: 'user' }) },
    });
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].name).toBe('no_action');
    expect(repo.listAgentMessages()).toHaveLength(0);
    expect(openai._remaining()).toBe(0);
  });

  test('Konto-eröffnen scenario: context event spawns task and dependency', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const kontoTask = repo.createTask({ category_id: category.id, title: 'Konto eröffnen' });

    const ctxEvent = repo.createContextEvent({
      content: 'Mail: Kontoeröffnung bestätigt, aber Identifikation steht aus unter https://ident.example/abc',
      source: 'user',
    });

    // Script: agent creates identifikation task, then adds dependency, then notifies. Then ends.
    const openai = mockOpenAI([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          toolCall('create_task', {
            category_id: category.id,
            title: 'Identifikation für Konto durchführen',
            description: 'Identitätsprüfung für Kontoeröffnung abschließen',
            metadata: { url: 'https://ident.example/abc' },
          }, 'call_1'),
        ],
      },
      // Second turn: the agent has seen the create_task result and now adds the dep
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          toolCall('add_dependency', {
            blocked_task_id: kontoTask.id,
            blocking_task_id: '__placeholder__', // will be patched at runtime below
          }, 'call_2'),
          toolCall('notify_user', {
            content: 'Neue Aufgabe „Identifikation" blockt die Kontoeröffnung.',
            related_task_id: kontoTask.id,
          }, 'call_3'),
        ],
      },
      // Third turn: agent ends with no tool calls
      { role: 'assistant', content: 'Done.' },
    ]);

    // Patch the second turn to use the real created task id by intercepting create
    const originalCreate = openai.chat.completions.create;
    let callNum = 0;
    openai.chat.completions.create = async (args) => {
      callNum += 1;
      // After turn 1, look at tool result message for create_task to find id
      if (callNum === 2) {
        const toolMsg = args.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call_1');
        const parsed = JSON.parse(toolMsg.content);
        // Patch the dependency call to use the new task id
        const secondResponse = openai._peek ? openai._peek() : null; // fallback
      }
      return originalCreate(args);
    };

    // Simpler: we patch the queued response before the second call fires by inspecting the repo.
    // Instead of intercepting args, just run and afterwards assert the final DB state
    // using a fresh script that already knows we will create exactly one new task.

    // Re-script with two-phase via a small helper:
    const openai2 = (() => {
      const client = {
        chat: { completions: { create: null } },
      };
      let step = 0;
      client.chat.completions.create = async (args) => {
        step += 1;
        if (step === 1) {
          return { choices: [{ message: {
            role: 'assistant',
            content: null,
            tool_calls: [toolCall('create_task', {
              category_id: category.id,
              title: 'Identifikation für Konto durchführen',
              description: 'Identitätsprüfung für Kontoeröffnung abschließen',
              metadata: { url: 'https://ident.example/abc' },
            }, 'call_1')],
          }}]};
        }
        if (step === 2) {
          // Find the newly created task's id from the tool result
          const toolMsg = args.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call_1');
          const parsed = JSON.parse(toolMsg.content);
          const newId = parsed.id ?? parsed.task?.id;
          return { choices: [{ message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              toolCall('add_dependency', {
                blocked_task_id: kontoTask.id,
                blocking_task_id: newId,
              }, 'call_2'),
              toolCall('notify_user', {
                content: 'Neue Aufgabe „Identifikation" blockt die Kontoeröffnung.',
                related_task_id: kontoTask.id,
              }, 'call_3'),
            ],
          }}]};
        }
        return { choices: [{ message: { role: 'assistant', content: 'Done.' } }] };
      };
      return client;
    })();

    const { runAgent } = createAgent({ repo, openaiClient: openai2 });
    const result = await runAgent({ type: 'context_event', payload: { event: ctxEvent } });

    expect(result.error).toBeNull();

    // Two tasks now: Konto + Identifikation
    const tasks = repo.listTasks();
    expect(tasks).toHaveLength(2);
    const ident = tasks.find((t) => t.title.startsWith('Identifikation'));
    expect(ident).toBeDefined();
    expect(ident.metadata?.url).toBe('https://ident.example/abc');

    // Konto is blocked by Identifikation
    expect(repo.isBlocked(kontoTask.id)).toBe(true);
    const blockers = repo.listBlockingFor(kontoTask.id);
    expect(blockers.map((b) => b.id)).toEqual([ident.id]);

    // Notification stored
    const messages = repo.listAgentMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].related_task_id).toBe(kontoTask.id);
    expect(messages[0].trigger_type).toBe('context_event');

    // Context event marked processed
    const evts = repo.listContextEvents();
    expect(evts[0].processed_at).toBeTruthy();

    // Agent run logged
    const runs = repo.listAgentRuns();
    expect(runs).toHaveLength(1);
  });

  test('agent stops at maxIterations if model never stops calling tools', async () => {
    const { repo } = setupRepo();
    const openai = {
      chat: { completions: { create: async () => ({
        choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall('no_action', { reason: 'loop' })],
        }}],
      })}},
    };
    // no_action short-circuits after first turn, so use a different tool that doesn't short-circuit
    const openai2 = {
      chat: { completions: { create: async () => ({
        choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall('create_space', { name: 's' })],
        }}],
      })}},
    };
    const { runAgent } = createAgent({ repo, openaiClient: openai2, maxIterations: 3 });
    const result = await runAgent({ type: 'context_event', payload: { event: repo.createContextEvent({ content: 'x' }) } });
    expect(result.iterations).toBe(3);
  });

  test('notify_user is deduped to at most one per run', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const t = repo.createTask({ category_id: category.id, title: 'T' });

    let step = 0;
    const openai = { chat: { completions: { create: async (args) => {
      step += 1;
      if (step === 1) {
        return { choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            toolCall('notify_user', { content: 'first', related_task_id: t.id }, 'n1'),
            toolCall('notify_user', { content: 'second', related_task_id: t.id }, 'n2'),
          ],
        }}]};
      }
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    }}}};

    const { runAgent } = createAgent({ repo, openaiClient: openai });
    const result = await runAgent({
      type: 'context_event',
      payload: { event: repo.createContextEvent({ content: 'x' }) },
    });

    const messages = repo.listAgentMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('first');

    // Second call returned a skipped result
    const secondCall = result.tool_calls[1];
    expect(secondCall.name).toBe('notify_user');
    expect(secondCall.result.skipped).toBeTruthy();
  });

  test('notify_user across iterations also deduped', async () => {
    const { repo } = setupRepo();
    let step = 0;
    const openai = { chat: { completions: { create: async () => {
      step += 1;
      if (step <= 2) {
        return { choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall('notify_user', { content: `msg-${step}` }, `n${step}`)],
        }}]};
      }
      return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
    }}}};

    const { runAgent } = createAgent({ repo, openaiClient: openai, maxIterations: 5 });
    await runAgent({
      type: 'context_event',
      payload: { event: repo.createContextEvent({ content: 'x' }) },
    });
    expect(repo.listAgentMessages()).toHaveLength(1);
  });

  test('tool handler errors are captured and passed back to the model', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A' });
    const b = repo.createTask({ category_id: category.id, title: 'B' });

    let step = 0;
    const captured = [];
    const openai = { chat: { completions: { create: async (args) => {
      step += 1;
      if (step === 1) {
        return { choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall('add_dependency', { blocked_task_id: a.id, blocking_task_id: a.id }, 'call_1')],
        }}]};
      }
      // turn 2: inspect tool result, then stop
      const toolMsg = args.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call_1');
      captured.push(JSON.parse(toolMsg.content));
      return { choices: [{ message: { role: 'assistant', content: 'noted' }}]};
    }}}};

    const { runAgent } = createAgent({ repo, openaiClient: openai });
    await runAgent({ type: 'context_event', payload: { event: repo.createContextEvent({ content: 'x' }) } });
    expect(captured[0].error).toMatch(/itself/);
  });
});
