export const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export function validateConfig(config) {
  if (typeof config?.autoScope !== 'boolean' || !Array.isArray(config.slots) || config.slots.length !== 6)
    throw new Error('Expected autoScope and exactly six model slots.');
  const seen = new Set();
  for (const s of config.slots) {
    if (!['gpt', 'go'].includes(s.bank) || !['fast', 'balanced', 'deep'].includes(s.tier) ||
        s.provider !== (s.bank === 'gpt' ? 'openai-codex' : 'opencode-go') ||
        !LEVELS.includes(s.thinking) || !s.family?.startsWith('^') || !s.family.endsWith('$'))
      throw new Error('Invalid model slot; provider banks must remain explicit.');
    new RegExp(s.family);
    const key = `${s.bank}/${s.tier}`;
    if (seen.has(key)) throw new Error(`Duplicate slot: ${key}`);
    seen.add(key);
  }
  return config;
}

export function matchesSlot(model, slot) {
  return model.provider === slot.provider && new RegExp(slot.family).test(model.id);
}

// Numeric comparison: 6.10 > 6.9. Never use lexical order for releases.
export function compareVersions(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function resolveSlot(models, slot) {
  return models.filter(m => matchesSlot(m, slot) && (!slot.pin || m.id === slot.pin))
    .sort((a, b) => compareVersions(new RegExp(slot.family).exec(b.id)[1], new RegExp(slot.family).exec(a.id)[1]) || a.id.localeCompare(b.id))[0];
}

export function flattenCatalog(catalog) {
  return Object.entries(catalog).flatMap(([provider, entry]) =>
    Array.isArray(entry?.models) ? entry.models.filter(m => typeof m.id === 'string' && (!m.type || m.type === 'chat'))
      .map(m => ({ ...m, provider })) : []);
}

export function reconcileSettings(settings, config, models) {
  validateConfig(config);
  if (!config.autoScope) return { settings, changes: [] };
  const resolved = config.slots.map(slot => ({ slot, model: resolveSlot(models, slot) }));
  const missing = resolved.filter(r => !r.model);
  // Do not destroy a working offline scope because one catalog entry disappeared.
  if (missing.length) throw new Error(`Missing catalog slots: ${missing.map(r => `${r.slot.bank}/${r.slot.tier}`).join(', ')}. Existing settings kept.`);
  const references = resolved.map(({ slot, model }) => `${model.provider}/${model.id}:${slot.thinking}`);
  const isManagedRef = ref => {
    const [provider, rest] = ref.split('/');
    return config.slots.some(slot => matchesSlot({ provider, id: (rest ?? '').replace(/:(off|minimal|low|medium|high|xhigh|max)$/, '') }, slot));
  };
  const extras = (settings.enabledModels ?? []).filter(ref => !isManagedRef(ref));
  const levels = Object.fromEntries(Object.entries(settings.modelThinkingLevels ?? {}).filter(([ref]) => !isManagedRef(ref)));
  for (const { model, slot } of resolved) levels[`${model.provider}/${model.id}`] = slot.thinking;
  const next = { ...settings, enabledModels: [...references, ...extras], modelThinkingLevels: levels };
  const startup = resolved.find(({ slot }) => matchesSlot({ provider: settings.defaultProvider, id: settings.defaultModel ?? '' }, slot));
  if (startup) next.defaultModel = startup.model.id;
  return { settings: next, changes: references.filter(ref => !(settings.enabledModels ?? []).includes(ref)) };
}
