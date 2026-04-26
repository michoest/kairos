import { describe, test, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAgent } from '../src/agent/index.js';
import { setupRepo, seedBasicTree } from './helpers.js';

function toolCall(name, args, id = `c_${Math.random().toString(36).slice(2)}`) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

describe('proposals', () => {
  test('agent propose → API accept executes bundled tool calls', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'Chore A', is_active: true });
    const b = repo.createTask({ category_id: category.id, title: 'Chore B', is_active: true });

    // Agent responds with a propose_actions that would deactivate both chores.
    const openai = { chat: { completions: { create: async () => ({
      choices: [{ message: {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('propose_actions', {
          message: 'Urlaub: 2 Chores auf inaktiv setzen?',
          actions: [
            { tool: 'update_task', args: { id: a.id, is_active: false } },
            { tool: 'update_task', args: { id: b.id, is_active: false } },
          ],
        })],
      }}],
    })}}};

    const { runAgent, executeProposal } = createAgent({ repo, openaiClient: openai });
    const app = createApp({ repo, runAgent, executeProposal, openaiClient: null });

    // Fire a context event so the agent generates the proposal
    const evt = repo.createContextEvent({ content: 'Ich bin 3 Wochen weg' });
    await runAgent({ type: 'context_event', payload: { event: evt } });

    const proposals = (await request(app).get('/api/proposals')).body;
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p.status).toBe('pending');
    expect(p.actions).toHaveLength(2);

    // Accept → tasks become inactive
    const accepted = (await request(app).post(`/api/proposals/${p.id}/accept`)).body;
    expect(accepted.status).toBe('accepted');
    expect(repo.getTask(a.id).is_active).toBe(false);
    expect(repo.getTask(b.id).is_active).toBe(false);
    expect(accepted.results).toHaveLength(2);
  });

  test('dismiss does not execute actions', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'X', is_active: true });

    const p = repo.createProposal({
      message: 'deactivate X',
      actions: [{ tool: 'update_task', args: { id: a.id, is_active: false } }],
    });

    const app = createApp({
      repo,
      runAgent: async () => ({}),
      executeProposal: async () => { throw new Error('should not be called'); },
      openaiClient: null,
    });

    const res = await request(app).post(`/api/proposals/${p.id}/dismiss`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dismissed');
    expect(repo.getTask(a.id).is_active).toBe(true);
  });

  test('proposal creation silently strips "functions." prefix and stores clean tool name', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A', is_active: true });

    const openai = { chat: { completions: { create: async () => ({
      choices: [{ message: {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('propose_actions', {
          message: 'deaktivieren',
          actions: [{ tool: 'functions.update_task', args: { id: a.id, is_active: false } }],
        })],
      }}],
    })}}};

    const { runAgent } = createAgent({ repo, openaiClient: openai });
    await runAgent({ type: 'context_event', payload: { event: repo.createContextEvent({ content: 'x' }) } });

    const proposals = repo.listProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].actions[0].tool).toBe('update_task');  // prefix stripped
  });

  test('proposal creation rejects truly unknown tool names with error to the model', async () => {
    const { repo } = setupRepo();

    let step = 0;
    const capturedToolResult = [];
    const openai = { chat: { completions: { create: async (args) => {
      step += 1;
      if (step === 1) {
        return { choices: [{ message: {
          role: 'assistant',
          content: null,
          tool_calls: [toolCall('propose_actions', {
            message: 'x',
            actions: [{ tool: 'frobnicate', args: {} }],
          }, 'p1')],
        }}]};
      }
      const tr = args.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'p1');
      capturedToolResult.push(JSON.parse(tr.content));
      return { choices: [{ message: { role: 'assistant', content: 'noted' } }] };
    }}}};

    const { runAgent } = createAgent({ repo, openaiClient: openai });
    await runAgent({ type: 'context_event', payload: { event: repo.createContextEvent({ content: 'x' }) } });

    expect(repo.listProposals()).toHaveLength(0);
    expect(capturedToolResult[0].error).toMatch(/unknown tool/);
  });

  test('executor strips functions.-prefix for legacy proposals', async () => {
    const { repo } = setupRepo();
    const { category } = seedBasicTree(repo);
    const a = repo.createTask({ category_id: category.id, title: 'A', is_active: true });

    // Legacy proposal written directly to DB with the bad prefix
    const p = repo.createProposal({
      message: 'legacy',
      actions: [{ tool: 'functions.update_task', args: { id: a.id, is_active: false } }],
    });

    const openai = { chat: { completions: { create: async () => ({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    })}}};
    const { executeProposal } = createAgent({ repo, openaiClient: openai });
    const results = await executeProposal(repo.getProposal(p.id));

    expect(results).toHaveLength(1);
    expect(results[0].error).toBeUndefined();
    expect(repo.getTask(a.id).is_active).toBe(false);
  });

  test('accept after resolve is rejected', async () => {
    const { repo } = setupRepo();
    const p = repo.createProposal({ message: 'm', actions: [] });
    repo.markProposalResolved(p.id, 'dismissed');

    const app = createApp({ repo, runAgent: async () => ({}), executeProposal: async () => [], openaiClient: null });
    const res = await request(app).post(`/api/proposals/${p.id}/accept`);
    expect(res.status).toBe(400);
  });
});
