import type { SolutionStepJson } from '../contract/types';
import { nearlyEqual } from './format';
import {
  BasicMathOperation,
  ConversionOperation,
  DerivativeOperation,
  FinalAnswerOperation,
  FormulaOperation,
  mathOperator,
  type Operation,
} from './operations';
import type { Problem } from './testFile';
import { type Variable, VariableStore } from './variables';

/**
 * One step of the authored `solutionPath`. Each kind knows how to turn itself into the same
 * {@link Operation} the learner uses, so the answer key is recomputed by the exact code Amy's
 * steps run through.
 */
export abstract class AuthoredStep {
  constructor(readonly json: SolutionStepJson) {}

  get id(): string {
    return this.json.id;
  }

  /** Returns the operation, or throws with a readable message if a reference is missing. */
  abstract createOperation(problem: Problem): Operation;

  /** Whether the authored output is a number the runtime can check. */
  get checksValue(): boolean {
    return typeof this.json.output?.value === 'number';
  }

  static fromJson(json: SolutionStepJson): AuthoredStep {
    const cls = STEP_CLASSES[json.kind];
    if (!cls) throw new Error(`Unknown solution step kind "${String(json.kind)}"`);
    return new cls(json);
  }
}

class AuthoredFormulaStep extends AuthoredStep {
  createOperation(problem: Problem): Operation {
    const formula = problem.test.formula(this.json.formulaId ?? '');
    if (!formula) throw new Error(`Formula "${this.json.formulaId}" is not in the formula sheet`);
    return new FormulaOperation(formula);
  }
}

class AuthoredBasicMathStep extends AuthoredStep {
  createOperation(): Operation {
    return new BasicMathOperation(mathOperator(this.json.mathOperation ?? 'add'));
  }
}

class AuthoredConversionStep extends AuthoredStep {
  createOperation(problem: Problem): Operation {
    const conversion = problem.test.conversion(this.json.conversionId ?? '');
    if (!conversion) throw new Error(`Conversion "${this.json.conversionId}" is not in the conversions list`);
    return new ConversionOperation(conversion);
  }
}

class AuthoredDerivativeStep extends AuthoredStep {
  createOperation(problem: Problem): Operation {
    const action = problem.json.derivativeActions?.find((d) => d.id === this.json.derivativeId);
    if (!action) throw new Error(`Derivative action "${this.json.derivativeId}" is not defined on this problem`);
    return new DerivativeOperation(action);
  }
}

class AuthoredFinalAnswerStep extends AuthoredStep {
  createOperation(): Operation {
    return new FinalAnswerOperation();
  }
}

const STEP_CLASSES: Record<SolutionStepJson['kind'], new (json: SolutionStepJson) => AuthoredStep> = {
  formula: AuthoredFormulaStep,
  basicMath: AuthoredBasicMathStep,
  conversion: AuthoredConversionStep,
  derivative: AuthoredDerivativeStep,
  finalAnswer: AuthoredFinalAnswerStep,
};

export interface AuthoredInput {
  key: string;
  name: string;
  authoredId: string;
  variable?: Variable;
}

export interface AuthoredStepResult {
  step: AuthoredStep;
  operation?: Operation;
  inputs: AuthoredInput[];
  /** Variables this step defines (authored names/values). */
  outputs: Variable[];
  computedValue?: number;
  authoredValue?: number;
  /** The authored value disagrees with the recomputed value. */
  mismatch: boolean;
  error?: string;
}

/**
 * Replays a problem's authored solution path. Used for the load-time answer-key check and to
 * show resolved inputs and results in the review. Each step is recomputed from the *authored*
 * values of its inputs, so every warning points at a step whose stored output disagrees with its
 * own stored inputs (a slip is flagged where it happens, and again where a later step used it).
 */
export class AuthoredPath {
  readonly results: AuthoredStepResult[] = [];
  private readonly byAuthoredId = new Map<string, Variable>();

  constructor(readonly problem: Problem) {
    const store = new VariableStore();
    for (const given of problem.json.givens) this.byAuthoredId.set(given.id, store.addGiven(given));
    for (const json of problem.json.solutionPath) this.results.push(this.replay(AuthoredStep.fromJson(json), store));
  }

  /** The variable an authored id refers to (a given or an authored step output). */
  lookup(authoredId: string): Variable | undefined {
    return this.byAuthoredId.get(authoredId);
  }

  private replay(step: AuthoredStep, store: VariableStore): AuthoredStepResult {
    const result: AuthoredStepResult = { step, inputs: [], outputs: [], mismatch: false };
    try {
      const operation = step.createOperation(this.problem);
      result.operation = operation;
      const bindings = step.json.bindings ?? {};
      const bound: Record<string, Variable> = {};
      for (const slot of operation.inputs()) {
        const authoredId = bindings[slot.key];
        const variable = authoredId === undefined ? undefined : this.byAuthoredId.get(authoredId);
        result.inputs.push({ key: slot.key, name: slot.name, authoredId: authoredId ?? '', variable });
        if (variable) bound[slot.key] = variable;
      }
      const output = step.json.output;
      const outcome = operation.execute(bound, { name: output?.name ?? '', symbol: output?.symbol ?? '' });
      const [primary, ...rest] = outcome.outputs;
      if (primary && output && !(operation instanceof DerivativeOperation)) {
        result.computedValue = primary.value;
        result.authoredValue = output.value;
        if (typeof output.value === 'number' && typeof primary.value === 'number') {
          result.mismatch = !nearlyEqual(output.value, primary.value);
        }
        this.define(store, output.id, {
          ...primary,
          name: output.name,
          symbol: output.symbol,
          unit: output.unit ?? primary.unit,
          quantityType: output.quantityType ?? primary.quantityType,
          value: output.value ?? primary.value,
          authoredId: output.id,
        }, result);
      } else {
        for (const init of [primary, ...rest]) if (init?.authoredId) this.define(store, init.authoredId, init, result);
      }
    } catch (error) {
      // EvaluationError / ExpressionStructureError / missing references all carry readable messages.
      if (!(error instanceof Error)) throw error;
      result.error = error.message;
    }
    return result;
  }

  private define(store: VariableStore, authoredId: string, init: Omit<Parameters<VariableStore['add']>[0], 'origin'>, result: AuthoredStepResult) {
    const variable = store.add({ ...init, origin: 'step', authoredId });
    this.byAuthoredId.set(authoredId, variable);
    result.outputs.push(variable);
  }
}
