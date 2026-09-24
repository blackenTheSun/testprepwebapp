import type { Attempt } from './attempt';
import { type AuthoredStepResult, AuthoredPath } from './authoredPath';
import { nearlyEqual } from './format';
import { DerivativeOperation } from './operations';
import type { Variable } from './variables';

export interface StepMatch {
  result: AuthoredStepResult;
  /** Amy produced this authored step's result (informational ✓, not a grade). */
  matched: boolean;
  /** The learner variable that matched, when there is one. */
  learnerVariable?: Variable;
}

/**
 * Compares Amy's work with the authored path by *value*: an authored step is ✓ when one of her
 * calculated results equals its output (relative tolerance 1e-6). She may reach the same number
 * by a different route, so this never marks anything wrong; it only shows what she reached.
 */
export class ReviewMatcher {
  readonly path: AuthoredPath;

  constructor(private readonly attempt: Attempt) {
    this.path = new AuthoredPath(attempt.problem);
  }

  matches(): StepMatch[] {
    const learnerResults = this.attempt.store.all().filter((v) => v.origin === 'step');
    return this.path.results.map((result) => this.match(result, learnerResults));
  }

  private match(result: AuthoredStepResult, learnerResults: Variable[]): StepMatch {
    const { step } = result;
    switch (step.json.kind) {
      case 'derivative': {
        const used = this.attempt.steps.find(
          (s) => s.operation instanceof DerivativeOperation && s.operation.action.id === step.json.derivativeId,
        );
        const learnerVariable = used ? this.attempt.store.get(used.outputIds[0]) : undefined;
        return { result, matched: Boolean(used), learnerVariable };
      }
      case 'finalAnswer': {
        const expected = result.inputs[0]?.variable;
        const stated = this.attempt.finalAnswer;
        return { result, matched: Boolean(expected && stated && sameValue(expected, stated)), learnerVariable: stated };
      }
      default: {
        const expected = result.authoredValue ?? result.computedValue;
        if (typeof expected !== 'number') return { result, matched: false };
        const learnerVariable = learnerResults.find((v) => v.isNumeric && nearlyEqual(v.value as number, expected));
        return { result, matched: Boolean(learnerVariable), learnerVariable };
      }
    }
  }
}

function sameValue(expected: Variable, stated: Variable): boolean {
  if (expected.isNumeric && stated.isNumeric) return nearlyEqual(expected.value as number, stated.value as number);
  return Boolean(expected.authoredId && expected.authoredId === stated.authoredId);
}
