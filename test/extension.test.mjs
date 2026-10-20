import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Exercise Pi's actual TypeScript loader; no installs, credentials, or LLM calls.
const executable = execFileSync('which', ['pi'], { encoding: 'utf8' }).trim();
let pkg = dirname(realpathSync(executable));
while (!existsSync(join(pkg, 'dist/core/extensions/loader.js'))) {
  const parent = dirname(pkg);
  if (parent === pkg) throw new Error('Cannot locate the installed Pi SDK.');
  pkg = parent;
}
const { loadExtensions } = await import(pathToFileURL(join(pkg, 'dist/core/extensions/loader.js')).href);
const root = fileURLToPath(new URL('..', import.meta.url));
const available = [
  ['openai-codex', 'gpt-6-luna'], ['openai-codex', 'gpt-6.1-sol'], ['openai-codex', 'gpt-6-astra'],
].map(([provider, id]) => ({ provider, id }));

async function harness() {
  const loaded = await loadExtensions([join(root, 'extensions/minimal.ts')], root);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const ext = loaded.extensions[0], runtime = loaded.runtime;
  let branch = [], tools = ['read', 'bash', 'edit', 'write', 'transcribe_audio'], level = 'low';
  const messages = [], notices = [];
  const ctx = {
    hasUI: false, mode: 'print', cwd: root, model: available[0],
    ui: { notify: (...args) => notices.push(args), setStatus() {} },
    sessionManager: { getBranch: () => branch },
    modelRegistry: { getAvailable: () => available },
    waitForIdle: async () => {},
  };
  Object.assign(runtime, {
    getActiveTools: () => tools,
    setActiveTools: value => { tools = value; },
    getThinkingLevel: () => level,
    setThinkingLevel: value => { level = value; },
    setModel: async value => { ctx.model = value; return true; },
    appendEntry: (customType, data) => branch.push({ id: `e${branch.length}`, type: 'custom', customType, data }),
    sendMessage: message => messages.push(message),
    sendUserMessage: () => { throw new Error('Tests must not trigger LLM calls.'); },
  });
  const emit = async (name, event = {}) => { for (const handler of ext.handlers.get(name) ?? []) await handler({ type: name, ...event }, ctx); };
  const command = (name, args = '') => ext.commands.get(name).handler(args, ctx);
  const tool = ext.tools.get('exam_progress').definition;
  return { ext, emit, command, ctx, messages, notices, tool, tools: () => tools, level: () => level, branch: () => branch, setBranch: b => { branch = b; } };
}

test('loads against installed Pi; ordinary modes have no exam tool; exam activation preserves unrelated tools', async () => {
  const h = await harness();
  assert.equal(h.ext.tools.size, 1);
  assert.equal(h.tool.defaultActive, false);
  await h.emit('session_start', { reason: 'startup' });
  assert.ok(!h.tools().includes('exam_progress'));
  await h.command('exam');
  assert.ok(h.tools().includes('exam_progress'));
  assert.ok(h.tools().includes('transcribe_audio'));
  assert.equal(h.ctx.model.id, 'gpt-6.1-sol');
  assert.equal(h.level(), 'medium');
  const event = { systemPromptOptions: { sections: { existing: 'keep' } } };
  await h.emit('before_agent_start', event);
  assert.equal(event.systemPromptOptions.sections.existing, 'keep');
  assert.match(event.systemPromptOptions.sections.pi_minimal_mode, /EXAM-PREP/);
  await h.command('study');
  assert.ok(!h.tools().includes('exam_progress'));
  await h.emit('before_agent_start', event);
  assert.match(event.systemPromptOptions.sections.pi_minimal_mode, /EXPLORE/);
  assert.equal(event.systemPromptOptions.sections.pi_minimal_progress, undefined);
});
test('general excludes project context while other workflows preserve it', async () => {
  const { getAgentDir } = await import(pathToFileURL(join(pkg, 'dist/config.js')).href);
  const h = await harness();
  const files = [
    { path: join(getAgentDir(), 'AGENTS.md'), content: 'global' },
    { path: '/tmp/project/AGENTS.md', content: 'project' },
    { path: '/tmp/AGENTS.md', content: 'ancestor' },
  ];
  for (const mode of ['general', 'coding', 'exam', 'study', 'general']) {
    await h.command(mode);
    const event = { systemPromptOptions: { sections: {}, contextFiles: [...files] } };
    await h.emit('before_agent_start', event);
    assert.deepEqual(event.systemPromptOptions.contextFiles, mode === 'general' ? [files[0]] : files);
    if (mode === 'general') assert.equal(event.systemPromptOptions.sections.pi_minimal_project_setup, undefined);
    else assert.match(event.systemPromptOptions.sections.pi_minimal_project_setup, /ask what the user will do and wait for their answer/);
    assert.equal(files.length, 3);
  }
});
test('general removes project setup and progress after switching from exam', async () => {
  const h = await harness();
  const event = { systemPromptOptions: { sections: { unrelated: 'keep' } } };
  await h.command('exam');
  await h.emit('before_agent_start', event);
  assert.ok(event.systemPromptOptions.sections.pi_minimal_project_setup);
  assert.ok(event.systemPromptOptions.sections.pi_minimal_progress);
  await h.command('general');
  await h.emit('before_agent_start', event);
  assert.equal(event.systemPromptOptions.sections.pi_minimal_project_setup, undefined);
  assert.equal(event.systemPromptOptions.sections.pi_minimal_progress, undefined);
  assert.equal(event.systemPromptOptions.sections.unrelated, 'keep');
});
test('mode instructions stay within word budgets and exclude personal project details', () => {
  const budgets = { general: 65, coding: 150, study: 150, exam: 420, 'project-setup': 130 };
  for (const [mode, budget] of Object.entries(budgets)) {
    const text = readFileSync(join(root, 'modes', `${mode}.md`), 'utf8');
    assert.ok(text.trim().split(/\s+/).length <= budget, `${mode}: review prompt growth`);
    assert.doesNotMatch(text, /Obsidian|Credo|CS50|boot\.dev|tryhackme|\/home\/lumi/i);
  }
});
test('switching model slots is explicit and rejects invalid input without fallback', async () => {
  const h = await harness();
  await h.emit('session_start', { reason: 'startup' });
  await h.command('brain', 'gpt deep');
  assert.equal(h.ctx.model.provider, 'openai-codex');
  assert.equal(h.ctx.model.id, 'gpt-6-astra');
  await h.command('brain', 'gpt fast low');
  assert.equal(h.ctx.model.id, 'gpt-6-luna');
  await h.command('brain', 'go invalid');
  assert.equal(h.ctx.model.id, 'gpt-6-luna');
});
test('progress tool binds evidence to actual user turns and restores the active branch', async () => {
  const h = await harness();
  await h.emit('session_start', { reason: 'startup' });
  const params = { action: 'record', concept: 'cs/headers', question: 'explain', result: 'independent', kind: 'explanation', note: 'Good reasoning.' };
  await assert.rejects(h.tool.execute('t0', params, undefined, undefined, h.ctx), /only available/);
  await h.command('exam');
  await assert.rejects(h.tool.execute('t0', params, undefined, undefined, h.ctx), /No learner answer/);
  h.branch().push({ type: 'message', id: 'u1', message: { role: 'user', content: 'An actual answer' } });
  const first = await h.tool.execute('t1', params, undefined, undefined, h.ctx);
  assert.match(first.content[0].text, /practice/);
  const firstBranch = [...h.branch()];
  await assert.rejects(h.tool.execute('t2', params, undefined, undefined, h.ctx), /already recorded/);
  h.branch().push({ type: 'message', id: 'u2', message: { role: 'user', content: 'A second answer' } });
  const second = await h.tool.execute('t3', { ...params, question: 'different scenario', kind: 'transfer' }, undefined, undefined, h.ctx);
  assert.match(second.content[0].text, /ready/);
  h.setBranch(firstBranch);
  await h.emit('session_tree');
  const restored = await h.tool.execute('t4', { action: 'status' }, undefined, undefined, h.ctx);
  assert.match(restored.content[0].text, /practice/);
  await h.emit('session_start', { reason: 'reload' });
  assert.ok(h.tools().includes('exam_progress'));
  await h.command('progress');
  assert.match(h.messages.at(-1).content, /practice/);
});
