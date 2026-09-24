import type {
  ConversionJson,
  DerivativeActionJson,
  FormulaJson,
  Latex,
  MathOperationName,
  SolutionTeachingJson,
} from '../contract/types';
import {
  AddNode,
  DivideNode,
  EvaluationError,
  ExpressionNode,
  MultiplyNode,
  PowerNode,
  SlotNode,
  SqrtNode,
  SubtractNode,
} from './expression';
import { formatNumber, formatUnit, numberedSymbol } from './format';
import type { Variable, VariableInit } from './variables';

/** The five Add Step action groups from the SOW, in menu order. */
export type ActionGroup = 'formula' | 'basicMath' | 'conversion' | 'derivative' | 'finalAnswer';

export const ACTION_GROUP_LABELS: Record<ActionGroup, string> = {
  formula: 'Formula sheet',
  basicMath: 'Basic math',
  conversion: 'Unit conversion',
  derivative: 'Derivative',
  finalAnswer: 'Final answer',
};

export interface InputSlot {
  /** Binding key, e.g. a formula slot id, `left`/`right`, or `value`. */
  key: string;
  name: string;
  /** LaTeX symbol from the formula card, if any. */
  symbol?: string;
  unit?: string;
  /** Whether a symbolic (non-numeric) variable is an acceptable input. */
  acceptsSymbolic: boolean;
}

export type OutputInit = Omit<VariableInit, 'origin' | 'stepId'>;

export interface SuggestedName {
  name: string;
  symbol: string;
}

export interface OperationOutcome {
  /** New variables, primary output first. */
  outputs: OutputInit[];
}

/** Tracks per-label counters so auto names read `Voltage 1`, `Voltage 2`, ... within an attempt. */
export class AutoNamer {
  private readonly counts = new Map<string, number>();

  peek(label: string): number {
    return (this.counts.get(label) ?? 0) + 1;
  }

  commit(label: string): void {
    this.counts.set(label, this.peek(label));
  }
}

/**
 * One entry in the Add Step menu. Subclasses describe their inputs, suggest an output name,
 * and compute outputs from bound variables. Nothing here evaluates code from the test file:
 * formulas are pre-built {@link ExpressionNode} trees.
 */
export abstract class Operation {
  abstract readonly group: ActionGroup;
  /** Unique within a problem's catalog, e.g. `formula:ohms_law_voltage`. */
  abstract readonly key: string;
  abstract readonly title: string;

  abstract inputs(): InputSlot[];

  /** Label used for the auto-name counter (e.g. the formula's output name). */
  protected abstract counterLabel(): string;

  abstract suggestName(namer: AutoNamer): SuggestedName;

  /** Compute outputs. `name` is the learner-confirmed name/symbol for the primary output. */
  abstract execute(bound: Readonly<Record<string, Variable>>, name: SuggestedName): OperationOutcome;

  /** Optional LaTeX shown while building the step (formula card, conversion rule). */
  previewLatex(): Latex | undefined {
    return undefined;
  }

  /** Whether this operation produces a named output the learner can rename before calculating. */
  get hasOutput(): boolean {
    return true;
  }

  /** Non-blocking unit hints for the current bindings. */
  unitHints(bound: Readonly<Record<string, Variable | undefined>>): string[] {
    const hints: string[] = [];
    for (const slot of this.inputs()) {
      const variable = bound[slot.key];
      if (!variable || !slot.unit || !variable.unit) continue;
      if (!sameUnit(variable.unit, slot.unit)) {
        hints.push(`${variable.name} is in ${formatUnit(variable.unit)}; ${slot.name} expects ${formatUnit(slot.unit)}.`);
      }
    }
    return hints;
  }

  /** Records that a step using this operation succeeded, advancing its name counter. */
  commitName(namer: AutoNamer): void {
    namer.commit(this.counterLabel());
  }

  protected requireNumber(bound: Readonly<Record<string, Variable>>, key: string): number {
    const variable = bound[key];
    if (!variable) throw new EvaluationError(`Choose a value for "${this.inputs().find((s) => s.key === key)?.name ?? key}"`);
    if (!variable.isNumeric) throw new EvaluationError(`${variable.name} is symbolic and cannot be used as a number`);
    return variable.value as number;
  }
}

export function sameUnit(a: string | undefined, b: string | undefined): boolean {
  return formatUnit(a).replace(/\s+/g, '') === formatUnit(b).replace(/\s+/g, '');
}

// ---- Formula sheet ---------------------------------------------------------

export class FormulaOperation extends Operation {
  readonly group = 'formula';
  readonly key: string;
  readonly title: string;
  private readonly expression: ExpressionNode;

  constructor(readonly formula: FormulaJson) {
    super();
    this.key = `formula:${formula.id}`;
    this.title = formula.title;
    this.expression = ExpressionNode.fromJson(formula.calculation.ast);
  }

  inputs(): InputSlot[] {
    return this.formula.inputs.map((slot) => ({
      key: slot.id,
      name: slot.name,
      symbol: slot.symbol,
      unit: slot.unit,
      acceptsSymbolic: false,
    }));
  }

  protected counterLabel(): string {
    return this.formula.output.name;
  }

  suggestName(namer: AutoNamer): SuggestedName {
    const n = namer.peek(this.counterLabel());
    return { name: `${this.formula.output.name} ${n}`, symbol: numberedSymbol(this.formula.output.symbol, n) };
  }

  override previewLatex(): Latex {
    return this.formula.latex;
  }

  execute(bound: Readonly<Record<string, Variable>>, name: SuggestedName): OperationOutcome {
    const scope: Record<string, number> = {};
    for (const slot of this.formula.inputs) scope[slot.id] = this.requireNumber(bound, slot.id);
    const value = this.expression.evaluate(scope);
    const { output } = this.formula;
    return { outputs: [{ ...name, value, unit: output.unit, quantityType: output.quantityType }] };
  }
}

// ---- Basic math ------------------------------------------------------------

/** Strategy for one built-in arithmetic operation; each subclass knows its inputs and result unit. */
export abstract class MathOperator {
  abstract readonly name: MathOperationName;
  abstract readonly title: string;
  abstract readonly symbolLatex: string;

  /** Binding keys, in order. */
  abstract readonly keys: readonly string[];

  abstract buildExpression(): ExpressionNode;

  abstract resultUnit(units: (string | undefined)[], values: number[]): string | undefined;

  inputName(key: string): string {
    return key === 'left' ? 'First value' : key === 'right' ? 'Second value' : 'Value';
  }

  unitHints(_bound: Readonly<Record<string, Variable | undefined>>): string[] {
    return [];
  }
}

abstract class BinaryMathOperator extends MathOperator {
  readonly keys = ['left', 'right'] as const;
}

abstract class SameUnitOperator extends BinaryMathOperator {
  resultUnit([a, b]: (string | undefined)[]): string | undefined {
    return a ?? b;
  }
  override unitHints(bound: Readonly<Record<string, Variable | undefined>>): string[] {
    const { left, right } = bound;
    if (left?.unit && right?.unit && !sameUnit(left.unit, right.unit)) {
      return [`${left.name} is in ${formatUnit(left.unit)} but ${right.name} is in ${formatUnit(right.unit)}; convert first so the units match.`];
    }
    return [];
  }
}

export class AddOperator extends SameUnitOperator {
  readonly name = 'add';
  readonly title = 'Add (a + b)';
  readonly symbolLatex = 'a + b';
  buildExpression(): ExpressionNode {
    return new AddNode([new SlotNode('left'), new SlotNode('right')]);
  }
}

export class SubtractOperator extends SameUnitOperator {
  readonly name = 'subtract';
  readonly title = 'Subtract (a − b)';
  readonly symbolLatex = 'a - b';
  buildExpression(): ExpressionNode {
    return new SubtractNode([new SlotNode('left'), new SlotNode('right')]);
  }
}

export class MultiplyOperator extends BinaryMathOperator {
  readonly name = 'multiply';
  readonly title = 'Multiply (a × b)';
  readonly symbolLatex = 'a \\times b';
  buildExpression(): ExpressionNode {
    return new MultiplyNode([new SlotNode('left'), new SlotNode('right')]);
  }
  resultUnit([a, b]: (string | undefined)[]): string | undefined {
    if (a && b) return `${a}·${b}`;
    return a ?? b;
  }
}

export class DivideOperator extends BinaryMathOperator {
  readonly name = 'divide';
  readonly title = 'Divide (a ÷ b)';
  readonly symbolLatex = '\\frac{a}{b}';
  buildExpression(): ExpressionNode {
    return new DivideNode([new SlotNode('left'), new SlotNode('right')]);
  }
  resultUnit([a, b]: (string | undefined)[]): string | undefined {
    if (a && b) return `${a}/${b}`;
    if (b) return `1/${b}`;
    return a;
  }
}

export class PowerOperator extends BinaryMathOperator {
  readonly name = 'power';
  readonly title = 'Power (a ^ b)';
  readonly symbolLatex = 'a^{b}';
  override inputName(key: string): string {
    return key === 'left' ? 'Base' : 'Exponent';
  }
  buildExpression(): ExpressionNode {
    return new PowerNode([new SlotNode('left'), new SlotNode('right')]);
  }
  resultUnit([a]: (string | undefined)[], [, exponent]: number[]): string | undefined {
    if (!a) return undefined;
    return /^[A-Za-z]+$/.test(a) ? `${a}^${formatNumber(exponent)}` : `(${a})^${formatNumber(exponent)}`;
  }
}

export class SqrtOperator extends MathOperator {
  readonly name = 'sqrt';
  readonly title = 'Square root (√a)';
  readonly symbolLatex = '\\sqrt{a}';
  readonly keys = ['value'] as const;
  buildExpression(): ExpressionNode {
    return new SqrtNode([new SlotNode('value')]);
  }
  resultUnit([a]: (string | undefined)[]): string | undefined {
    if (!a) return undefined;
    const squared = /^([A-Za-z]+)\^2$/.exec(a);
    return squared ? squared[1] : `√(${a})`;
  }
}

export const MATH_OPERATORS: readonly MathOperator[] = [
  new AddOperator(),
  new SubtractOperator(),
  new MultiplyOperator(),
  new DivideOperator(),
  new PowerOperator(),
  new SqrtOperator(),
];

export function mathOperator(name: MathOperationName): MathOperator {
  const op = MATH_OPERATORS.find((o) => o.name === name);
  if (!op) throw new Error(`Unknown math operation ${name}`);
  return op;
}

export class BasicMathOperation extends Operation {
  readonly group = 'basicMath';
  readonly key: string;
  readonly title: string;
  private readonly expression: ExpressionNode;

  constructor(readonly operator: MathOperator) {
    super();
    this.key = `math:${operator.name}`;
    this.title = operator.title;
    this.expression = operator.buildExpression();
  }

  inputs(): InputSlot[] {
    return this.operator.keys.map((key) => ({ key, name: this.operator.inputName(key), acceptsSymbolic: false }));
  }

  protected counterLabel(): string {
    return 'Result';
  }

  suggestName(namer: AutoNamer): SuggestedName {
    const n = namer.peek(this.counterLabel());
    return { name: `Result ${n}`, symbol: `r_{${n}}` };
  }

  override previewLatex(): Latex {
    return this.operator.symbolLatex;
  }

  override unitHints(bound: Readonly<Record<string, Variable | undefined>>): string[] {
    return this.operator.unitHints(bound);
  }

  execute(bound: Readonly<Record<string, Variable>>, name: SuggestedName): OperationOutcome {
    const scope: Record<string, number> = {};
    for (const key of this.operator.keys) scope[key] = this.requireNumber(bound, key);
    const value = this.expression.evaluate(scope);
    const keys = this.operator.keys;
    const unit = this.operator.resultUnit(
      keys.map((k) => bound[k]?.unit),
      keys.map((k) => scope[k]),
    );
    const first = bound[keys[0]];
    const sameType = keys.every((k) => bound[k]?.quantityType === first?.quantityType);
    const quantityType = this.operator instanceof SameUnitOperator && sameType ? first?.quantityType : undefined;
    return { outputs: [{ ...name, value, unit, quantityType }] };
  }
}

// ---- Unit conversion -------------------------------------------------------

export class ConversionOperation extends Operation {
  readonly group = 'conversion';
  readonly key: string;
  readonly title: string;

  constructor(readonly conversion: ConversionJson) {
    super();
    this.key = `conversion:${conversion.id}`;
    this.title = conversion.title;
  }

  inputs(): InputSlot[] {
    return [{ key: 'value', name: `Value in ${formatUnit(this.conversion.fromUnit)}`, unit: this.conversion.fromUnit, acceptsSymbolic: false }];
  }

  protected counterLabel(): string {
    return this.conversion.outputName ?? 'Converted value';
  }

  suggestName(namer: AutoNamer): SuggestedName {
    const n = namer.peek(this.counterLabel());
    return { name: `${this.counterLabel()} ${n}`, symbol: numberedSymbol(this.conversion.outputSymbol ?? 'x', n) };
  }

  override previewLatex(): Latex | undefined {
    return this.conversion.latex;
  }

  override unitHints(bound: Readonly<Record<string, Variable | undefined>>): string[] {
    const variable = bound.value;
    if (variable?.unit && !sameUnit(variable.unit, this.conversion.fromUnit)) {
      return [`${variable.name} is in ${formatUnit(variable.unit)}, but this conversion starts from ${formatUnit(this.conversion.fromUnit)}.`];
    }
    return [];
  }

  execute(bound: Readonly<Record<string, Variable>>, name: SuggestedName): OperationOutcome {
    const value = this.requireNumber(bound, 'value') * this.conversion.factor;
    if (!Number.isFinite(value)) throw new EvaluationError('The conversion did not produce a finite number');
    return { outputs: [{ ...name, value, unit: this.conversion.toUnit, quantityType: bound.value?.quantityType }] };
  }
}

// ---- Derivative (pre-authored) ---------------------------------------------

export class DerivativeOperation extends Operation {
  readonly group = 'derivative';
  readonly key: string;
  readonly title: string;

  constructor(readonly action: DerivativeActionJson) {
    super();
    this.key = `derivative:${action.id}`;
    this.title = action.title;
  }

  get teaching(): SolutionTeachingJson {
    return this.action.teaching;
  }

  inputs(): InputSlot[] {
    return [];
  }

  protected counterLabel(): string {
    return this.action.output.name;
  }

  suggestName(namer: AutoNamer): SuggestedName {
    const n = namer.peek(this.counterLabel());
    const { name, symbol } = this.action.output;
    return n === 1 ? { name, symbol } : { name: `${name} ${n}`, symbol: numberedSymbol(symbol, n) };
  }

  override previewLatex(): Latex {
    return [this.action.expressionLatex, `\\frac{d}{d${this.action.variable}}`];
  }

  execute(_bound: Readonly<Record<string, Variable>>, name: SuggestedName): OperationOutcome {
    const { output, numericEvaluation, resultLatex } = this.action;
    const outputs: OutputInit[] = [
      { ...name, latex: resultLatex, unit: output.unit, quantityType: output.quantityType, authoredId: output.id },
    ];
    if (numericEvaluation && typeof numericEvaluation.value === 'number') {
      const latex = Array.isArray(numericEvaluation.latex) ? numericEvaluation.latex.join(',\\;') : numericEvaluation.latex;
      outputs.push({
        name: numericEvaluation.name,
        symbol: numericEvaluation.symbol,
        value: numericEvaluation.value,
        unit: numericEvaluation.unit,
        quantityType: numericEvaluation.quantityType,
        latex,
        authoredId: numericEvaluation.id,
      });
    }
    return { outputs };
  }
}

// ---- Final answer ------------------------------------------------------------

export class FinalAnswerOperation extends Operation {
  readonly group = 'finalAnswer';
  readonly key = 'final:answer';
  readonly title = 'State final answer';

  inputs(): InputSlot[] {
    return [{ key: 'answer', name: 'Answer', acceptsSymbolic: true }];
  }

  protected counterLabel(): string {
    return 'Final answer';
  }

  override get hasOutput(): boolean {
    return false;
  }

  suggestName(): SuggestedName {
    return { name: '', symbol: '' };
  }

  execute(bound: Readonly<Record<string, Variable>>): OperationOutcome {
    if (!bound.answer) throw new EvaluationError('Choose the value to state as the final answer');
    return { outputs: [] };
  }
}
