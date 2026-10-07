import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareVersions, flattenCatalog, reconcileSettings, resolveSlot, validateConfig } from '../lib/models.mjs';
const config = JSON.parse(readFileSync(new URL('../config/models.json', import.meta.url)));
const catalog = [
  ['openai-codex', 'gpt-6-luna'], ['openai-codex', 'gpt-6-sol'], ['openai-codex', 'gpt-6.1-sol'], ['openai-codex', 'gpt-6-astra'],
  ['opencode-go', 'deepseek-v4.1-flash'], ['opencode-go', 'glm-5.3'], ['opencode-go', 'deepseek-v4-pro'],
].map(([provider, id]) => ({ provider, id }));

test('exact families select newer numeric releases, never pro/preview or other providers', () => {
  const slot = config.slots[1];
  const models = [...catalog, ...['gpt-6.9-sol', 'gpt-6.10-sol', 'gpt-7-sol-preview', 'gpt-8-sol-pro'].map(id => ({ provider: slot.provider, id })), { provider: 'opencode', id: 'gpt-99-sol' }];
  assert.equal(resolveSlot(models, slot).id, 'gpt-6.10-sol');
  assert.ok(compareVersions('6.10', '6.9') > 0);
  assert.equal(resolveSlot(models, { ...slot, pin: 'gpt-6-sol' }).id, 'gpt-6-sol');
  assert.equal(resolveSlot(models, { ...slot, pin: 'missing' }), undefined);
});
test('scope replacement preserves unrelated preferences and model entries, is idempotent', () => {
  const initial = { theme: 'gruvbox', defaultProvider: 'openai-codex', defaultModel: 'gpt-6-sol', enabledModels: ['openai-codex/gpt-6-sol:high', 'other/my-model'], modelThinkingLevels: { 'openai-codex/gpt-6-sol': 'high', 'other/my-model': 'off' } };
  const { settings } = reconcileSettings(initial, config, catalog);
  assert.equal(settings.defaultModel, 'gpt-6.1-sol');
  assert.equal(settings.enabledModels.length, 7);
  assert.equal(settings.theme, 'gruvbox');
  assert.ok(!settings.enabledModels.includes('openai-codex/gpt-6-sol:high'));
  assert.equal(settings.modelThinkingLevels['other/my-model'], 'off');
  assert.deepEqual(reconcileSettings(settings, config, catalog).settings, settings);
  assert.equal(initial.defaultModel, 'gpt-6-sol');
});
test('missing catalog slots fail safely and disabled autoscope is a no-op', () => {
  assert.throws(() => reconcileSettings({}, config, []), /Missing catalog slots/);
  const initial = { enabledModels: ['personal'] };
  assert.equal(reconcileSettings(initial, { ...config, autoScope: false }, []).settings, initial);
});
test('bank validation prevents accidental Zen/pay-as-you-go routing', () => {
  const invalid = structuredClone(config);
  invalid.slots[3].provider = 'opencode';
  assert.throws(() => validateConfig(invalid), /Invalid model slot/);
  const duplicates = structuredClone(config);
  duplicates.slots[1] = duplicates.slots[0];
  assert.throws(() => validateConfig(duplicates), /Duplicate/);
});
test('catalog flattening only includes chat models and uses container provider', () => {
  assert.deepEqual(flattenCatalog({ p: { models: [{ id: 'a', provider: 'wrong' }, { id: 'b', type: 'image' }] }, empty: {} }), [{ id: 'a', provider: 'p' }]);
});
