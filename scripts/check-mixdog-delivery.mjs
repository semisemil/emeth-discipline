#!/usr/bin/env node

// Internal companion to check-mixdog.mjs. Only unused provider preparation,
// MCP inventory, and session persistence boundaries are stubbed. The native
// session/hook bridges and worker turn runner execute their real code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';

const { mixdogRoot, projectRoot, dataDir, baseline, args } = JSON.parse(readFileSync(0, 'utf8'));
const url = path => pathToFileURL(join(mixdogRoot, path)).href;
mock.module(url('src/runtime/agent/orchestrator/runtime-core/tool-catalog.mjs'), {
  namedExports: { reconcileDeferredMcpToolCatalog() {}, refreshInitialDeferredMcpSurface() {}, scopedMcpToolsFor: () => [] },
});
mock.module(url('src/runtime/agent/orchestrator/agent-runtime/session-builder.mjs'), {
  namedExports: { prepareAgentSession: () => { throw new Error('Provider preparation is outside this delivery check'); } },
});
mock.module(url('src/runtime/agent/orchestrator/providers/registry.mjs'), {
  namedExports: { getProvider: () => undefined },
});
mock.module(url('src/runtime/agent/orchestrator/session/store.mjs'), {
  namedExports: { saveSessionAsync: async () => {}, loadSession: () => null,
    readSessionLifecycleStateFromDisk: () => ({ state: 'absent', generation: 0 }), registerSessionPurgeHook: () => () => {} },
});
mock.module(url('src/runtime/agent/orchestrator/session/manager/pending-messages.mjs'), {
  namedExports: { markCompletionEntry: () => { throw new Error('Completion queues are outside this delivery check'); } },
});

const { createStandaloneHookBus } = await import(url('src/session-runtime/services/hook-bus.mjs'));
const { dispatchSessionStart } = await import(url('src/session-runtime/session-create/session-start-hook.mjs'));
const { createTurnPreparation } = await import(url('src/session-runtime/turn/turn-run/turn-prepare.mjs'));
const { createSpawnRunner } = await import(url('src/session-runtime/services/agent-tool/spawn-flow/spawn-run.mjs'));
const hooks = createStandaloneHookBus({ dataDir });
const session = { id: 'delivery-lead', messages: [] };
const hookCommonPayload = input => ({ cwd: projectRoot, ...input });
await dispatchSessionStart({ rt: { session, route: { model: 'fixture' } }, hooks, hookCommonPayload }, 'startup');
assert.ok(session.messages.some(message => message.role === 'user' && message.content.includes(baseline)),
  'SessionStart rules are inserted into the native lead transcript');
const preparation = createTurnPreparation({ hooks, hookCommonPayload });
const promptContext = await preparation.dispatchPromptSubmit({ awaitTurn: fn => fn() }, session,
  '/development-design Verify instructions.', { context: 'Caller context' });
assert.equal(promptContext, `Caller context\n\n${baseline}\n\nNext design number: DESIGN-0001`);

const worker = { id: 'delivery-worker', messages: [] };
const calls = [];
const runner = createSpawnRunner({
  mgr: {
    getSession: () => worker,
    async askSession(...input) { calls.push(input); return 'Deterministic delivery fixture completed.'; },
  },
  upsertWorkerSessionDeferred() {}, emitSubagentEvent() {}, scheduleReap() {},
  createTurnReviewCollector: () => ({ onToolResult() {}, complete() {} }),
});
await runner.runSpawn({
  args, tag: args.tag, session: worker, agent: args.agent, prompt: args.prompt, workerCwd: args.cwd,
  preset: { provider: 'fixture', model: 'fixture' }, presetName: 'fixture', watchdogPolicy: null,
});
assert.equal(calls.length, 1);
assert.equal(calls[0][0], worker.id);
assert.equal(calls[0][1], args.prompt);
assert.equal(calls[0][2], args.context);
assert.equal(calls[0][4], args.cwd);
assert.ok(calls[0][2].includes(baseline));
console.log('Native Mixdog delivery: lead transcript, user-turn context, and worker prompt/context/cwd verified');
