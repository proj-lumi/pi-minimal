#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenCatalog, reconcileSettings, validateConfig } from '../lib/models.mjs';

// Local metadata only. No credentials, downloads, model calls, timers, or installs.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
const settingsPath = join(agentDir, 'settings.json');
const quiet = process.argv.includes('--quiet');
let temp;
try {
  const config = validateConfig(JSON.parse(readFileSync(join(root, 'config/models.json'), 'utf8')));
  if (config.autoScope) {
    const before = readFileSync(settingsPath, 'utf8');
    const current = JSON.parse(before);
    const models = flattenCatalog(JSON.parse(readFileSync(join(agentDir, 'models-store.json'), 'utf8')));
    const result = reconcileSettings(current, config, models);
    if (JSON.stringify(current) !== JSON.stringify(result.settings)) {
      temp = `${settingsPath}.pi-minimal-${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(result.settings, null, 2)}\n`, { mode: statSync(settingsPath).mode & 0o777, flag: 'wx' });
      if (readFileSync(settingsPath, 'utf8') !== before) throw new Error('Settings changed concurrently; retry on the next launch.');
      renameSync(temp, settingsPath);
      temp = undefined;
      if (!quiet || result.changes.length) process.stderr.write(`Pi minimal: scoped models updated${result.changes.length ? ` → ${result.changes.join(', ')}` : ''}.\n`);
    } else if (!quiet) process.stderr.write('Pi minimal: model scope is current.\n');
  } else if (!quiet) process.stderr.write('Pi minimal: automatic scope management is disabled.\n');
} catch (error) {
  if (temp) { try { unlinkSync(temp); } catch {} }
  process.stderr.write(`Pi minimal: ${error.message} Continuing with existing settings.\n`);
  process.exitCode = 1;
}
