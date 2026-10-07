import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, recordEvidence, restoreProgress } from '../lib/progress.mjs';
const answer = (overrides = {}) => ({ concept: 'cs/headers', question: 'explain content-type', result: 'independent', kind: 'explanation', note: 'Explained type versus encoding.', userId: 'u1', at: 1000, ...overrides });
const ready = () => recordEvidence(recordEvidence(emptyProgress(), answer()), answer({ userId: 'u2', question: 'new request scenario', kind: 'transfer', at: 2000 }));

test('one answer cannot establish readiness; two distinct turns including transfer can', () => {
  const once = recordEvidence(emptyProgress(), answer());
  assert.equal(once.concepts['cs/headers'].status, 'practice');
  assert.equal(ready().concepts['cs/headers'].status, 'ready');
  assert.equal(once.concepts['cs/headers'].attempts, 1);
});
test('duplicate tool calls cannot count a learner turn twice', () => {
  const once = recordEvidence(emptyProgress(), answer());
  assert.throws(() => recordEvidence(once, answer({ question: 'different', kind: 'transfer' })), /already recorded/);
});
test('a repeated question or two recognition checks do not establish readiness', () => {
  const once = recordEvidence(emptyProgress(), answer());
  const repeated = recordEvidence(once, answer({ userId: 'u2', kind: 'transfer' }));
  assert.equal(repeated.concepts['cs/headers'].independent.length, 1);
  const twice = recordEvidence(once, answer({ userId: 'u2', question: 'another explanation' }));
  assert.equal(twice.concepts['cs/headers'].status, 'practice');
});
test('hints and errors reopen practice; skips never fabricate evidence', () => {
  for (const result of ['hinted', 'incorrect']) {
    const state = recordEvidence(ready(), answer({ userId: 'u3', question: 'harder case', result }));
    assert.equal(state.concepts['cs/headers'].status, 'practice');
    assert.equal(state.concepts['cs/headers'].independent.length, 0);
  }
  const skipped = recordEvidence(emptyProgress(), answer({ result: 'skipped' }));
  assert.equal(skipped.concepts['cs/headers'].status, 'practice');
  assert.equal(skipped.concepts['cs/headers'].independent.length, 0);
});
test('immediate retrieval is not retained; delayed or interleaved retrieval is', () => {
  const r = ready();
  const review = answer({ userId: 'u3', question: 'recall from memory', kind: 'retrieval', at: 3000 });
  assert.equal(recordEvidence(r, review).concepts['cs/headers'].status, 'ready');
  assert.equal(recordEvidence(r, { ...review, at: 602000 }).concepts['cs/headers'].status, 'retained');
  const interleaved = recordEvidence(r, answer({ concept: 'cs/json', userId: 'u3' }));
  assert.equal(recordEvidence(interleaved, { ...review, userId: 'u4' }).concepts['cs/headers'].status, 'retained');
});
test('branch restoration uses only supplied branch events, and validates stored data', () => {
  const entry = data => ({ type: 'custom', customType: 'pi-minimal-evidence-v1', data });
  const branch = [entry(answer()), entry(answer({ userId: 'u2', question: 'new case', kind: 'transfer' }))];
  assert.equal(restoreProgress(branch.slice(0, 1)).concepts['cs/headers'].status, 'practice');
  assert.equal(restoreProgress(branch).concepts['cs/headers'].status, 'ready');
  assert.throws(() => restoreProgress([entry({})]), /invalid evidence/);
});
