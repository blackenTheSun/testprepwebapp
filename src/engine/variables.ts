import type { QuantityJson } from '../contract/types';
import { formatQuantity, formatUnit, latexToPlain } from './format';

export type VariableOrigin = 'given' | 'constant' | 'step';

export interface VariableInit {
  origin: VariableOrigin;
  name: string;
  symbol: string;
  unit?: string;
  quantityType?: string;
  /** Numeric value; absent for symbolic results such as a derivative function. */
  value?: number;
  /** LaTeX shown for symbolic results (and optionally for givens). */
  latex?: string;
  /** Id from the test file when the variable corresponds to an authored quantity. */
  authoredId?: string;
  /** Learner step that produced this variable. */
  stepId?: string;
}

/**
 * A value Amy can select as an input. The internal {@link id} is assigned once and never
 * changes; renaming only edits {@link name} and {@link symbol}, so earlier steps that refer
 * to the id stay intact.
 */
export class Variable {
  readonly origin: VariableOrigin;
  readonly unit?: string;
  readonly quantityType?: string;
  readonly value?: number;
  readonly latex?: string;
  readonly authoredId?: string;
  readonly stepId?: string;
  readonly originalName: string;
  readonly originalSymbol: string;
  name: string;
  symbol: string;

  constructor(
    readonly id: string,
    init: VariableInit,
  ) {
    this.origin = init.origin;
    this.name = init.name;
    this.symbol = init.symbol;
    this.originalName = init.name;
    this.originalSymbol = init.symbol;
    this.unit = init.unit;
    this.quantityType = init.quantityType;
    this.value = init.value;
    this.latex = init.latex;
    this.authoredId = init.authoredId;
    this.stepId = init.stepId;
  }

  get isNumeric(): boolean {
    return typeof this.value === 'number';
  }

  get isRenamed(): boolean {
    return this.name !== this.originalName || this.symbol !== this.originalSymbol;
  }

  /** Dropdown text, e.g. `Voltage across R1 (V_R1) = 12 V`. */
  describe(): string {
    const symbol = latexToPlain(this.symbol);
    const head = symbol && symbol !== this.name ? `${this.name} (${symbol})` : this.name;
    if (this.isNumeric) return `${head} = ${formatQuantity(this.value as number, this.unit)}`;
    if (this.latex) return `${head} = ${latexToPlain(this.latex)}`;
    return head;
  }

  displayUnit(): string {
    return formatUnit(this.unit);
  }

  static fromGiven(id: string, given: QuantityJson): Variable {
    const latex = Array.isArray(given.latex) ? given.latex.join(',\\;') : given.latex;
    return new Variable(id, {
      origin: given.quantityType === 'constant' ? 'constant' : 'given',
      name: given.name,
      symbol: given.symbol,
      unit: given.unit,
      quantityType: given.quantityType,
      value: given.value,
      latex,
      authoredId: given.id,
    });
  }
}

/** Owns every variable in one attempt and hands out stable `var_0001`-style ids. */
export class VariableStore {
  private readonly byId = new Map<string, Variable>();
  private nextNumber = 1;

  add(init: VariableInit): Variable {
    const variable = new Variable(this.allocateId(), init);
    this.byId.set(variable.id, variable);
    return variable;
  }

  addGiven(given: QuantityJson): Variable {
    const variable = Variable.fromGiven(this.allocateId(), given);
    this.byId.set(variable.id, variable);
    return variable;
  }

  get(id: string): Variable | undefined {
    return this.byId.get(id);
  }

  require(id: string): Variable {
    const variable = this.byId.get(id);
    if (!variable) throw new Error(`Unknown variable ${id}`);
    return variable;
  }

  all(): Variable[] {
    return [...this.byId.values()];
  }

  numeric(): Variable[] {
    return this.all().filter((v) => v.isNumeric);
  }

  rename(id: string, name: string, symbol: string): void {
    const variable = this.require(id);
    variable.name = name.trim() || variable.originalName;
    variable.symbol = symbol.trim() || variable.originalSymbol;
  }

  /** Removes the variables produced by a learner step (used when a step is deleted). */
  removeByStep(stepId: string): void {
    for (const [id, variable] of this.byId) if (variable.stepId === stepId) this.byId.delete(id);
  }

  private allocateId(): string {
    const id = `var_${String(this.nextNumber).padStart(4, '0')}`;
    this.nextNumber += 1;
    return id;
  }
}
