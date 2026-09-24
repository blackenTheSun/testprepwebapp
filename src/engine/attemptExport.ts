import type { Attempt } from './attempt';
import { ReviewMatcher } from './review';

export const ATTEMPT_EXPORT_VERSION = 'guided-test-attempt.local/v1';

/** Serializes an attempt for the optional "Download Attempt" JSON export. */
export class AttemptExporter {
  constructor(private readonly attempt: Attempt) {}

  toJson(now = new Date()): Record<string, unknown> {
    const { attempt } = this;
    const { problem } = attempt;
    const matches = attempt.isFinished ? new ReviewMatcher(attempt).matches() : [];
    return {
      apiVersion: ATTEMPT_EXPORT_VERSION,
      exportedAt: now.toISOString(),
      test: { id: problem.test.id, version: problem.test.json.version, title: problem.test.title },
      problem: { id: problem.id, title: problem.title },
      timer: { state: attempt.timer.state, elapsedMs: Math.round(attempt.timer.elapsedMs()) },
      variables: attempt.store.all().map((v) => ({
        id: v.id,
        origin: v.origin,
        name: v.name,
        symbol: v.symbol,
        renamedFrom: v.isRenamed ? { name: v.originalName, symbol: v.originalSymbol } : undefined,
        value: v.value,
        latex: v.origin === 'step' ? v.latex : undefined,
        unit: v.unit,
        authoredId: v.authoredId,
        stepId: v.stepId,
      })),
      steps: attempt.steps.map((s) => ({
        id: s.id,
        number: s.number,
        group: s.operation.group,
        operation: s.operation.key,
        title: s.operation.title,
        inputs: s.inputs.map((i) => ({ key: i.key, slot: i.slotName, variableId: i.variableId })),
        outputIds: s.outputIds,
        hints: s.hints.length ? s.hints : undefined,
        atElapsedMs: Math.round(s.atElapsedMs),
      })),
      finalAnswerVariableId: attempt.finalAnswer?.id,
      review: matches.map((m) => ({
        solutionStepId: m.result.step.id,
        matched: m.matched,
        learnerVariableId: m.learnerVariable?.id,
      })),
    };
  }

  fileName(): string {
    const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-');
    return `attempt-${safe(this.attempt.problem.test.id)}-${safe(this.attempt.problem.id)}.json`;
  }
}
