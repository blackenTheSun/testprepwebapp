import type { AngleUnit, ExpressionNodeJson, ExpressionOp } from '../contract/types';

/** Thrown when a test file's expression tree is malformed (unknown op, wrong arity, missing field). */
export class ExpressionStructureError extends Error {
  constructor(
    message: string,
    /** JSON-pointer-style path relative to the expression root, e.g. "/args/1". */
    readonly path: string,
  ) {
    super(message);
    this.name = 'ExpressionStructureError';
  }
}

/** Thrown when a well-formed expression cannot produce a finite number for the given inputs. */
export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}

export type Scope = Readonly<Record<string, number>>;

/**
 * A node in a formula's expression tree. The tree is built once from the test file's JSON
 * by {@link ExpressionNode.fromJson}; only the fixed operator set below can exist, so a test
 * file can describe a calculation but never run code.
 */
export abstract class ExpressionNode {
  abstract readonly op: ExpressionOp;

  abstract evaluate(scope: Scope): number;

  /** Slot ids referenced anywhere in this subtree. */
  abstract slots(): string[];

  static fromJson(json: ExpressionNodeJson, path = ''): ExpressionNode {
    if (json === null || typeof json !== 'object') {
      throw new ExpressionStructureError('Expression node must be an object', path);
    }
    const factory = NODE_FACTORIES[json.op];
    if (!factory) throw new ExpressionStructureError(`Unknown operator "${String(json.op)}"`, `${path}/op`);
    return factory(json, path);
  }
}

export class SlotNode extends ExpressionNode {
  readonly op = 'slot';
  constructor(readonly slot: string) {
    super();
  }
  evaluate(scope: Scope): number {
    const value = scope[this.slot];
    if (value === undefined) throw new EvaluationError(`No value bound for input "${this.slot}"`);
    return value;
  }
  slots(): string[] {
    return [this.slot];
  }
}

export class NumberNode extends ExpressionNode {
  readonly op = 'number';
  constructor(readonly value: number) {
    super();
  }
  evaluate(): number {
    return this.value;
  }
  slots(): string[] {
    return [];
  }
}

/** Base for operators with child arguments; subclasses declare their arity and arithmetic. */
export abstract class OperatorNode extends ExpressionNode {
  static readonly minArgs: number = 1;
  static readonly maxArgs: number = 1;

  constructor(readonly args: readonly ExpressionNode[]) {
    super();
  }

  evaluate(scope: Scope): number {
    const result = this.apply(this.args.map((a) => a.evaluate(scope)));
    if (!Number.isFinite(result)) throw new EvaluationError(`${this.describe()} did not produce a finite number`);
    return result;
  }

  slots(): string[] {
    return this.args.flatMap((a) => a.slots());
  }

  protected abstract apply(values: number[]): number;

  protected describe(): string {
    return `The ${this.op} operation`;
  }
}

export class AddNode extends OperatorNode {
  static override readonly minArgs = 2;
  static override readonly maxArgs = Infinity;
  readonly op = 'add';
  protected apply(v: number[]): number {
    return v.reduce((a, b) => a + b, 0);
  }
}

export class MultiplyNode extends OperatorNode {
  static override readonly minArgs = 2;
  static override readonly maxArgs = Infinity;
  readonly op = 'multiply';
  protected apply(v: number[]): number {
    return v.reduce((a, b) => a * b, 1);
  }
}

export class SubtractNode extends OperatorNode {
  static override readonly minArgs = 2;
  static override readonly maxArgs = 2;
  readonly op = 'subtract';
  protected apply([a, b]: number[]): number {
    return a - b;
  }
}

export class DivideNode extends OperatorNode {
  static override readonly minArgs = 2;
  static override readonly maxArgs = 2;
  readonly op = 'divide';
  protected apply([a, b]: number[]): number {
    if (b === 0) throw new EvaluationError('Division by zero');
    return a / b;
  }
}

export class PowerNode extends OperatorNode {
  static override readonly minArgs = 2;
  static override readonly maxArgs = 2;
  readonly op = 'power';
  protected apply([a, b]: number[]): number {
    return a ** b;
  }
  protected override describe(): string {
    return 'Raising to that power';
  }
}

export class NegateNode extends OperatorNode {
  readonly op = 'negate';
  protected apply([a]: number[]): number {
    return -a;
  }
}

export class AbsNode extends OperatorNode {
  readonly op = 'abs';
  protected apply([a]: number[]): number {
    return Math.abs(a);
  }
}

export class SqrtNode extends OperatorNode {
  readonly op = 'sqrt';
  protected apply([a]: number[]): number {
    if (a < 0) throw new EvaluationError('Square root of a negative number');
    return Math.sqrt(a);
  }
}

// ---- Trigonometry (v2) -----------------------------------------------------------------

const DEG = Math.PI / 180;
/** |cos| below this is treated as zero, so tan(90°) is an error rather than ~1.6e16. */
const TAN_POLE_EPSILON = 1e-12;

/**
 * Named trig with an explicit angle unit. For sin/cos/tan the unit applies to the input angle;
 * for asin/acos/atan it applies to the returned angle.
 */
export abstract class TrigNode extends OperatorNode {
  constructor(
    args: readonly ExpressionNode[],
    readonly angleUnit: AngleUnit,
  ) {
    super(args);
  }

  protected toRadians(angle: number): number {
    return this.angleUnit === 'deg' ? angle * DEG : angle;
  }

  protected fromRadians(angle: number): number {
    return this.angleUnit === 'deg' ? angle / DEG : angle;
  }
}

export class SinNode extends TrigNode {
  readonly op = 'sin';
  protected apply([a]: number[]): number {
    return Math.sin(this.toRadians(a));
  }
}

export class CosNode extends TrigNode {
  readonly op = 'cos';
  protected apply([a]: number[]): number {
    return Math.cos(this.toRadians(a));
  }
}

export class TanNode extends TrigNode {
  readonly op = 'tan';
  protected apply([a]: number[]): number {
    const radians = this.toRadians(a);
    if (Math.abs(Math.cos(radians)) < TAN_POLE_EPSILON) {
      throw new EvaluationError(`tan is undefined at ${a} ${this.angleUnit === 'deg' ? 'degrees' : 'radians'}`);
    }
    return Math.tan(radians);
  }
}

abstract class InverseTrigNode extends TrigNode {
  protected requireUnitRange(a: number): void {
    if (a < -1 || a > 1) throw new EvaluationError(`${this.op} needs a value between -1 and 1, got ${a}`);
  }
}

export class AsinNode extends InverseTrigNode {
  readonly op = 'asin';
  protected apply([a]: number[]): number {
    this.requireUnitRange(a);
    return this.fromRadians(Math.asin(a));
  }
}

export class AcosNode extends InverseTrigNode {
  readonly op = 'acos';
  protected apply([a]: number[]): number {
    this.requireUnitRange(a);
    return this.fromRadians(Math.acos(a));
  }
}

export class AtanNode extends InverseTrigNode {
  readonly op = 'atan';
  protected apply([a]: number[]): number {
    return this.fromRadians(Math.atan(a));
  }
}

type TrigClass = new (args: ExpressionNode[], angleUnit: AngleUnit) => TrigNode;

function trigFactory(cls: TrigClass) {
  return (json: ExpressionNodeJson, path: string): ExpressionNode => {
    if (json.angleUnit !== 'deg' && json.angleUnit !== 'rad') {
      throw new ExpressionStructureError(`"${json.op}" needs "angleUnit": "deg" or "rad"`, `${path}/angleUnit`);
    }
    const args = json.args;
    if (!Array.isArray(args) || args.length !== 1) {
      throw new ExpressionStructureError(`"${json.op}" takes exactly 1 argument(s), got ${Array.isArray(args) ? args.length : 0}`, `${path}/args`);
    }
    return new cls([ExpressionNode.fromJson(args[0], `${path}/args/0`)], json.angleUnit);
  };
}

type OperatorClass = (new (args: ExpressionNode[]) => OperatorNode) & { minArgs: number; maxArgs: number };

function operatorFactory(cls: OperatorClass) {
  return (json: ExpressionNodeJson, path: string): ExpressionNode => {
    const args = json.args;
    if (!Array.isArray(args)) throw new ExpressionStructureError(`"${json.op}" needs an "args" array`, `${path}/args`);
    if (args.length < cls.minArgs || args.length > cls.maxArgs) {
      const expected = cls.maxArgs === Infinity ? `at least ${cls.minArgs}` : cls.minArgs === cls.maxArgs ? `exactly ${cls.minArgs}` : `${cls.minArgs}-${cls.maxArgs}`;
      throw new ExpressionStructureError(`"${json.op}" takes ${expected} argument(s), got ${args.length}`, `${path}/args`);
    }
    return new cls(args.map((a, i) => ExpressionNode.fromJson(a, `${path}/args/${i}`)));
  };
}

const NODE_FACTORIES: Record<ExpressionOp, (json: ExpressionNodeJson, path: string) => ExpressionNode> = {
  slot: (json, path) => {
    if (typeof json.slot !== 'string') throw new ExpressionStructureError('"slot" node needs a "slot" id', `${path}/slot`);
    return new SlotNode(json.slot);
  },
  number: (json, path) => {
    if (typeof json.value !== 'number' || !Number.isFinite(json.value)) {
      throw new ExpressionStructureError('"number" node needs a finite "value"', `${path}/value`);
    }
    return new NumberNode(json.value);
  },
  add: operatorFactory(AddNode),
  multiply: operatorFactory(MultiplyNode),
  subtract: operatorFactory(SubtractNode),
  divide: operatorFactory(DivideNode),
  power: operatorFactory(PowerNode),
  negate: operatorFactory(NegateNode),
  abs: operatorFactory(AbsNode),
  sqrt: operatorFactory(SqrtNode),
  sin: trigFactory(SinNode),
  cos: trigFactory(CosNode),
  tan: trigFactory(TanNode),
  asin: trigFactory(AsinNode),
  acos: trigFactory(AcosNode),
  atan: trigFactory(AtanNode),
};
