export function emptyProgress() {
  return { sequence: 0, lastConcept: null, concepts: Object.create(null) };
}

// The model evaluates answers; this reducer enforces evidence-counting rules.
// It deliberately says 'ready' or 'retained', never 'mastered'.
export function recordEvidence(state, event) {
  const { concept, question, result, kind, note, userId, at } = event;
  if (!/^[a-z0-9][a-z0-9/._-]{0,79}$/.test(concept ?? '') ||
      typeof question !== 'string' || !question.trim() || question.length > 240 ||
      typeof note !== 'string' || !note.trim() || note.length > 600 ||
      !['independent', 'hinted', 'incorrect', 'skipped'].includes(result) ||
      !['explanation', 'application', 'transfer', 'retrieval'].includes(kind) ||
      typeof userId !== 'string' || !userId || !Number.isFinite(at))
    throw new Error('Incomplete or invalid evidence.');
  const previous = Object.hasOwn(state.concepts, concept) ? state.concepts[concept] : undefined;
  if (!previous && Object.keys(state.concepts).length >= 60)
    throw new Error('This session already tracks 60 concepts. Start a separate course session.');
  const item = previous ?? { status: 'practice', checks: [], independent: [], attempts: 0 };
  if (item.checks.some(c => c.userId === userId))
    throw new Error('This learner turn was already recorded for this concept. Ask a new question and wait.');
  const key = question.trim().toLowerCase().replace(/\s+/g, ' ');
  const repeated = item.checks.some(c => c.question === key);
  const next = structuredClone(state);
  const updated = structuredClone(item);
  next.sequence++;
  updated.attempts++;
  updated.note = note;
  updated.lastResult = result;
  updated.checks.push({ userId, question: key });
  // Bound in-memory state. Entry history remains in Pi's session file.
  updated.checks = updated.checks.slice(-100);
  if (result === 'incorrect' || result === 'hinted') {
    updated.status = 'practice';
    updated.independent = [];
    delete updated.readyAt;
    delete updated.readySequence;
  } else if (result === 'independent' && !repeated) {
    updated.independent.push({ userId, kind });
    updated.independent = updated.independent.slice(-20);
    const delayed = item.status === 'ready' && kind === 'retrieval' &&
      ((at - item.readyAt >= 10 * 60_000) ||
       (state.lastConcept !== concept && state.sequence > item.readySequence));
    if (delayed) updated.status = 'retained';
    else if (updated.status === 'practice' && updated.independent.length >= 2 &&
             updated.independent.some(c => c.kind === 'transfer')) {
      updated.status = 'ready';
      updated.readyAt = at;
      updated.readySequence = next.sequence;
    }
  }
  // A requested skip records a choice, never learning evidence.
  next.concepts[concept] = updated;
  next.lastConcept = concept;
  return next;
}

export function progressText(state) {
  const entries = Object.entries(state.concepts);
  if (!entries.length) return 'No exam evidence yet. Exploration does not require quizzes.';
  return entries.map(([id, c]) => `- ${id}: ${c.status}; ${c.independent.length} independent checks; last=${c.lastResult}. ${c.note}`).join('\n');
}

export function restoreProgress(entries) {
  let state = emptyProgress();
  for (const e of entries) {
    if (e.type === 'custom' && e.customType === 'pi-minimal-evidence-v1') state = recordEvidence(state, e.data);
  }
  return state;
}
