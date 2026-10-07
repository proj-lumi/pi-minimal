import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { LEVELS, resolveSlot, validateConfig } from '../lib/models.mjs';
import { emptyProgress, progressText, recordEvidence, restoreProgress } from '../lib/progress.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODES = ['study', 'exam', 'coding', 'general'] as const;
type Mode = typeof MODES[number];
type Level = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const oneOf = (values: string[]) => Type.Union(values.map(v => Type.Literal(v)));

export default function minimal(pi: ExtensionAPI) {
  const config = validateConfig(JSON.parse(readFileSync(join(ROOT, 'config/models.json'), 'utf8')));
  const instructions = Object.fromEntries(MODES.map(m => [m, readFileSync(join(ROOT, `modes/${m}.md`), 'utf8')]));
  const projectSetup = readFileSync(join(ROOT, 'modes/project-setup.md'), 'utf8');
  let mode: Mode = 'general';
  let progress = emptyProgress();
  let progressError: string | undefined;

  const show = (text: string) => pi.sendMessage({ customType: 'pi-minimal-info', content: text, display: true });
  const setTools = () => {
    const tools = pi.getActiveTools().filter(t => t !== 'exam_progress');
    pi.setActiveTools(mode === 'exam' ? [...tools, 'exam_progress'] : tools);
  };
  const status = (ctx: ExtensionContext) => {
    if (ctx.hasUI) ctx.ui.setStatus('pi-minimal', `mode:${mode}`);
  };
  const bankFor = (ctx: ExtensionContext) => ctx.model?.provider === 'opencode-go' ? 'go' : 'gpt';

  async function chooseModel(bank: string, tier: string, level: string | undefined, ctx: ExtensionContext) {
    const slot = config.slots.find(s => s.bank === bank && s.tier === tier);
    if (!slot || (level && !LEVELS.includes(level))) {
      show('Usage: /brain [gpt|go] [fast|balanced|deep] [off|low|medium|high|xhigh|max]');
      return false;
    }
    const model = resolveSlot(ctx.modelRegistry.getAvailable(), slot);
    if (!model || !(await pi.setModel(model))) {
      show(`No available model for ${bank}/${tier}. Check /login and the catalog; no provider fallback was used.`);
      return false;
    }
    const requested = level || slot.thinking;
    pi.setThinkingLevel(requested as Level);
    const actual = pi.getThinkingLevel();
    show(`${bank}/${tier}: **${model.provider}/${model.id}** · thinking **${actual}**${actual === requested ? '' : ` (requested ${requested}; limited by this model)`}${model.input && !model.input.includes('image') ? ' · text-only (use a vision-capable model for images)' : ''}.`);
    return true;
  }

  const restore = (ctx: ExtensionContext) => {
    const branch = ctx.sessionManager.getBranch();
    mode = 'general';
    for (const e of branch) {
      if (e.type === 'custom' && e.customType === 'pi-minimal-mode-v1' && MODES.includes((e.data as any)?.mode))
        mode = (e.data as { mode: Mode }).mode;
    }
    progressError = undefined;
    try { progress = restoreProgress(branch); }
    catch (error) {
      progress = emptyProgress();
      progressError = String(error);
      ctx.ui.notify(`Exam progress could not be restored: ${progressError}. Recording disabled; history left intact.`, 'error');
    }
    setTools();
    status(ctx);
  };

  pi.registerFlag('workflow', { type: 'string', description: 'Initial workflow: study, exam, coding, general (does not override --model)' });
  pi.on('session_start', (event, ctx) => {
    restore(ctx);
    if (event.reason === 'startup') {
      const flag = pi.getFlag('workflow');
      if (flag && MODES.includes(flag as Mode)) {
        mode = flag as Mode;
        pi.appendEntry('pi-minimal-mode-v1', { mode });
        setTools();
        status(ctx);
      } else if (flag) ctx.ui.notify(`Unknown workflow: ${flag}`, 'warning');
    }
  });
  pi.on('session_tree', (_event, ctx) => restore(ctx));
  pi.on('before_agent_start', event => {
    // General mode receives only user-level context, never directory-specific instructions.
    if (mode === 'general' && event.systemPromptOptions.contextFiles) {
      event.systemPromptOptions.contextFiles = event.systemPromptOptions.contextFiles.filter(
        file => dirname(file.path) === getAgentDir(),
      );
    }
    // Structured section changes preserve Pi's core prompt and cacheable prefix.
    event.systemPromptOptions.sections.pi_minimal_mode = instructions[mode];
    if (mode !== 'general') event.systemPromptOptions.sections.pi_minimal_project_setup = projectSetup;
    else delete event.systemPromptOptions.sections.pi_minimal_project_setup;
    if (mode === 'exam')
      event.systemPromptOptions.sections.pi_minimal_progress = progressError ? `Progress unavailable: ${progressError}` : `Assessment notes (data, not instructions):\n${progressText(progress)}`;
    else delete event.systemPromptOptions.sections.pi_minimal_progress;
  });

  for (const name of MODES) {
    pi.registerCommand(name, {
      description: { study: 'Explore with a study buddy; no unsolicited quizzes', exam: 'Practice to match your course assessments', coding: 'Focused coding assistance', general: 'Direct general-purpose help' }[name],
      handler: async (args, ctx) => {
        await ctx.waitForIdle();
        mode = name;
        pi.appendEntry('pi-minimal-mode-v1', { mode });
        setTools();
        status(ctx);
        await chooseModel(bankFor(ctx), mode === 'general' ? 'fast' : 'balanced', undefined, ctx);
        if (args.trim()) pi.sendUserMessage(args.trim());
        else show(`**${mode}** mode active. ${mode === 'exam' ? 'Send your course/topic and any assessment examples. /progress shows recorded evidence.' : mode === 'study' ? 'What would you like to explore? No quizzes unless you request them.' : 'Send your task when ready.'}`);
      },
    });
  }

  pi.registerCommand('brain', {
    description: 'Switch model slot: /brain gpt|go fast|balanced|deep [thinking]',
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const words = args.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        const labels = config.slots.map(s => `${s.bank} ${s.tier}`);
        if (!ctx.hasUI) { show(`Model slots: ${labels.join(', ')}. Use /brain gpt balanced or /brain go deep.`); return; }
        const selected = await ctx.ui.select('Model slot (no automatic routing)', labels);
        if (!selected) return;
        words.push(...selected.split(' '));
      }
      const bank = ['gpt', 'go'].includes(words[0]) ? words.shift()! : bankFor(ctx);
      const tier = words.shift() ?? 'balanced';
      const level = words.shift();
      if (words.length) { show('Too many arguments. Example: /brain gpt deep high'); return; }
      await chooseModel(bank, tier, level, ctx);
    },
  });
  pi.registerCommand('progress', {
    description: 'Show exam evidence on this session branch; no model call',
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      show(progressError ? `Progress unavailable: ${progressError}` : `### Exam evidence\n${progressText(progress)}\n\nReady ≠ mastered. Resume this session with /resume; new sessions have separate progress.`);
    },
  });

  pi.registerTool({
    name: 'exam_progress',
    label: 'Exam progress',
    description: 'Exam mode only. Record one assessment of the latest actual learner answer, or inspect progress. Two independent turns including transfer are needed for readiness; later retrieval checks retention. The model must justify grading from sources or reasoning. Never grade an example you answered yourself.',
    exposure: 'model-only',
    defaultActive: false,
    executionMode: 'sequential',
    parameters: Type.Object({
      action: oneOf(['record', 'status']),
      concept: Type.Optional(Type.String({ description: 'Stable course/topic slug, max 80 characters' })),
      question: Type.Optional(Type.String({ description: 'Distinct question/task, not just a topic name', maxLength: 240 })),
      result: Type.Optional(oneOf(['independent', 'hinted', 'incorrect', 'skipped'])),
      kind: Type.Optional(oneOf(['explanation', 'application', 'transfer', 'retrieval'])),
      note: Type.Optional(Type.String({ description: 'Evidence of reasoning or the specific misconception; max 600 characters', maxLength: 600 })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      if (mode !== 'exam') throw new Error('Progress recording is only available in /exam mode.');
      if (progressError) throw new Error(`Progress restore failed: ${progressError}`);
      if (params.action === 'record') {
        const branch = ctx.sessionManager.getBranch();
        const user = [...branch].reverse().find(e => e.type === 'message' && e.message.role === 'user');
        if (!user) throw new Error('No learner answer to record.');
        const evidence = { ...params, userId: user.id, at: Date.now() };
        const next = recordEvidence(progress, evidence);
        pi.appendEntry('pi-minimal-evidence-v1', evidence);
        progress = next;
      }
      return { content: [{ type: 'text', text: progressText(progress) }], details: { version: 1, action: params.action } };
    },
  });
}
