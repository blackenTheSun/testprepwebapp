import { Observable } from './observable';
import { AutoNamer, FinalAnswerOperation, type Operation, type SuggestedName } from './operations';
import type { Problem } from './testFile';
import { type Clock, StudyTimer } from './timer';
import { type Variable, VariableStore } from './variables';

export interface LearnerStepInput {
  key: string;
  slotName: string;
  variableId: string;
}

/** One calculated step in Amy's work list. Inputs and outputs refer to stable variable ids. */
export interface LearnerStep {
  id: string;
  number: number;
  operation: Operation;
  inputs: LearnerStepInput[];
  outputIds: string[];
  /** Unit hints shown when the step was calculated. */
  hints: string[];
  /** Elapsed timer milliseconds when the step was added. */
  atElapsedMs: number;
}

export type StepResult = { ok: true; step: LearnerStep } | { ok: false; error: string };

export type RevealMode = 'stepByStep' | 'all';

/** One timed try at a problem: timer, variables, steps, final answer and review state. */
export class Attempt extends Observable {
  private static instances = 0;
  /** Distinguishes a reset attempt from the one it replaced (used as a React key). */
  readonly uid = ++Attempt.instances;
  readonly store = new VariableStore();
  readonly timer: StudyTimer;
  readonly steps: LearnerStep[] = [];
  private readonly namer = new AutoNamer();
  private stepCounter = 0;
  private _finalAnswerId?: string;
  private _revealed = 0;
  private _revealMode: RevealMode = 'stepByStep';

  constructor(
    readonly problem: Problem,
    clock?: Clock,
  ) {
    super();
    this.timer = new StudyTimer(clock);
    for (const given of problem.json.givens) this.store.addGiven(given);
  }

  // ---- Timer ----------------------------------------------------------------

  /** Steps can be added only while the timer is running. */
  get canWork(): boolean {
    return this.timer.state === 'running';
  }

  get isFinished(): boolean {
    return this.timer.state === 'finished';
  }

  start(): void {
    this.timer.start();
    this.notify();
  }

  pause(): void {
    this.timer.pause();
    this.notify();
  }

  /** Finish and reveal path: stops the timer permanently and opens the review. */
  finish(): void {
    this.timer.finish();
    this._revealed = Math.max(this._revealed, 1);
    this.notify();
  }

  // ---- Steps ----------------------------------------------------------------

  suggestName(operation: Operation): SuggestedName {
    return operation.suggestName(this.namer);
  }

  /** Variables Amy may bind to an input, in creation order (givens, constants, then results). */
  choicesFor(acceptsSymbolic: boolean): Variable[] {
    return this.store.all().filter((v) => acceptsSymbolic || v.isNumeric);
  }

  addStep(operation: Operation, bindings: Readonly<Record<string, string>>, name: SuggestedName): StepResult {
    if (!this.canWork) {
      return { ok: false, error: this.isFinished ? 'This attempt is finished.' : 'Press Start to begin working.' };
    }
    const bound: Record<string, Variable> = {};
    for (const slot of operation.inputs()) {
      const variable = this.store.get(bindings[slot.key] ?? '');
      if (!variable) return { ok: false, error: `Choose a value for "${slot.name}".` };
      if (!slot.acceptsSymbolic && !variable.isNumeric) {
        return { ok: false, error: `${variable.name} is symbolic and cannot be used as a number.` };
      }
      bound[slot.key] = variable;
    }
    const finalName = operation.hasOutput ? this.normalizeName(name, operation) : name;
    let outputs;
    try {
      outputs = operation.execute(bound, finalName).outputs;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    this.stepCounter += 1;
    const id = `step_${String(this.stepCounter).padStart(3, '0')}`;
    const created = outputs.map((init) => this.store.add({ ...init, origin: 'step', stepId: id }));
    const step: LearnerStep = {
      id,
      number: this.steps.length + 1,
      operation,
      inputs: operation.inputs().map((slot) => ({ key: slot.key, slotName: slot.name, variableId: bound[slot.key].id })),
      outputIds: created.map((v) => v.id),
      hints: operation.unitHints(bound),
      atElapsedMs: this.timer.elapsedMs(),
    };
    operation.commitName(this.namer);
    this.steps.push(step);
    if (operation instanceof FinalAnswerOperation) this._finalAnswerId = bound.answer.id;
    this.notify();
    return { ok: true, step };
  }

  /** Removes the most recent step and any variables it created. */
  undoLastStep(): void {
    if (!this.canWork) return;
    const step = this.steps.pop();
    if (!step) return;
    this.store.removeByStep(step.id);
    this._finalAnswerId = this.latestFinalAnswer();
    this.notify();
  }

  rename(variableId: string, name: string, symbol: string): void {
    this.store.rename(variableId, name, symbol);
    this.notify();
  }

  /** The variable most recently stated as the final answer, if any. */
  get finalAnswer(): Variable | undefined {
    return this._finalAnswerId ? this.store.get(this._finalAnswerId) : undefined;
  }

  private latestFinalAnswer(): string | undefined {
    for (let i = this.steps.length - 1; i >= 0; i -= 1) {
      const step = this.steps[i];
      if (step.operation instanceof FinalAnswerOperation) return step.inputs[0]?.variableId;
    }
    return undefined;
  }

  private normalizeName(name: SuggestedName, operation: Operation): SuggestedName {
    const fallback = operation.suggestName(this.namer);
    return { name: name.name.trim() || fallback.name, symbol: name.symbol.trim() || fallback.symbol };
  }

  // ---- Review ---------------------------------------------------------------

  get revealMode(): RevealMode {
    return this._revealMode;
  }

  /** Number of authored solution steps currently visible in the review. */
  get revealedCount(): number {
    return this._revealMode === 'all' ? this.problem.json.solutionPath.length : this._revealed;
  }

  revealNext(): void {
    if (!this.isFinished) return;
    this._revealed = Math.min(this._revealed + 1, this.problem.json.solutionPath.length);
    this.notify();
  }

  setRevealMode(mode: RevealMode): void {
    this._revealMode = mode;
    if (mode === 'stepByStep' && this._revealed === 0) this._revealed = 1;
    this.notify();
  }
}
