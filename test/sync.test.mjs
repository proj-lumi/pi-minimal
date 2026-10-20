import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('../scripts/sync-models.mjs', import.meta.url));
const models = {
  'openai-codex': { models: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra'].map(id => ({ id })) },
};
const run = dir => spawnSync(process.execPath, [script, '--quiet'], { encoding: 'utf8', env: { ...process.env, PI_CODING_AGENT_DIR: dir } });

test('standalone sync updates only metadata and preserves permissions; rerun does not rewrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-minimal-sync-'));
  try {
    const settings = join(dir, 'settings.json');
    writeFileSync(settings, JSON.stringify({ defaultProvider: 'openai-codex', defaultModel: 'gpt-6-sol', theme: 'gruvbox' }), { mode: 0o600 });
    writeFileSync(join(dir, 'models-store.json'), JSON.stringify(models));
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(settings)).defaultModel, 'gpt-6.1-sol');
    assert.equal(statSync(settings).mode & 0o777, 0o600);
    const before = statSync(settings).mtimeMs;
    assert.equal(run(dir).status, 0);
    assert.equal(statSync(settings).mtimeMs, before);
  } finally { rmSync(dir, { recursive: true }); }
});
test('corrupt or incomplete catalog never overwrites existing settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-minimal-sync-'));
  try {
    const path = join(dir, 'settings.json'), before = '{"theme":"gruvbox"}\n';
    writeFileSync(path, before);
    for (const catalog of ['not JSON', '{}']) {
      writeFileSync(join(dir, 'models-store.json'), catalog);
      assert.equal(run(dir).status, 1);
      assert.equal(readFileSync(path, 'utf8'), before);
    }
  } finally { rmSync(dir, { recursive: true }); }
});
