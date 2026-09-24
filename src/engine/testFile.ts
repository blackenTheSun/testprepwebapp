import type { ConversionJson, FormulaJson, ProblemJson, TestFileJson } from '../contract/types';
import {
  type ActionGroup,
  BasicMathOperation,
  ConversionOperation,
  DerivativeOperation,
  FinalAnswerOperation,
  FormulaOperation,
  MATH_OPERATORS,
  type Operation,
} from './operations';

const GROUP_ORDER: readonly ActionGroup[] = ['formula', 'basicMath', 'conversion', 'derivative', 'finalAnswer'];

/** The Add Step menu for one problem: every operation the problem permits, grouped. */
export class OperationCatalog {
  private readonly byKey = new Map<string, Operation>();
  private readonly byGroup = new Map<ActionGroup, Operation[]>();

  constructor(operations: Operation[]) {
    for (const op of operations) {
      this.byKey.set(op.key, op);
      const list = this.byGroup.get(op.group) ?? [];
      list.push(op);
      this.byGroup.set(op.group, list);
    }
  }

  /** Groups that have at least one operation, in SOW menu order. */
  groups(): ActionGroup[] {
    return GROUP_ORDER.filter((g) => (this.byGroup.get(g)?.length ?? 0) > 0);
  }

  inGroup(group: ActionGroup): Operation[] {
    return this.byGroup.get(group) ?? [];
  }

  get(key: string): Operation | undefined {
    return this.byKey.get(key);
  }
}

export class Problem {
  private catalogCache?: OperationCatalog;

  constructor(
    readonly json: ProblemJson,
    readonly test: TestFile,
    readonly index: number,
  ) {}

  get id(): string {
    return this.json.id;
  }

  get title(): string {
    return this.json.title;
  }

  /** Formula cards this problem allows (in formula-sheet order). */
  allowedFormulas(): FormulaJson[] {
    const allowed = new Set(this.json.allowedFormulaIds);
    return this.test.json.formulaSheet.filter((f) => allowed.has(f.id));
  }

  allowedConversions(): ConversionJson[] {
    const allowed = new Set(this.json.allowedConversionIds ?? []);
    return this.test.json.conversions.filter((c) => allowed.has(c.id));
  }

  catalog(): OperationCatalog {
    this.catalogCache ??= new OperationCatalog([
      ...this.allowedFormulas().map((f) => new FormulaOperation(f)),
      ...MATH_OPERATORS.map((m) => new BasicMathOperation(m)),
      ...this.allowedConversions().map((c) => new ConversionOperation(c)),
      ...(this.json.derivativeActions ?? []).map((d) => new DerivativeOperation(d)),
      new FinalAnswerOperation(),
    ]);
    return this.catalogCache;
  }
}

/** A validated test file. Construct only from JSON that passed {@link TestFileValidator}. */
export class TestFile {
  readonly problems: Problem[];
  private readonly formulas: Map<string, FormulaJson>;
  private readonly conversions: Map<string, ConversionJson>;

  constructor(readonly json: TestFileJson) {
    this.formulas = new Map(json.formulaSheet.map((f) => [f.id, f]));
    this.conversions = new Map(json.conversions.map((c) => [c.id, c]));
    this.problems = json.problems.map((p, i) => new Problem(p, this, i));
  }

  get id(): string {
    return this.json.id;
  }

  get title(): string {
    return this.json.title;
  }

  formula(id: string): FormulaJson | undefined {
    return this.formulas.get(id);
  }

  conversion(id: string): ConversionJson | undefined {
    return this.conversions.get(id);
  }

  problem(id: string): Problem | undefined {
    return this.problems.find((p) => p.id === id);
  }

  /** Formula sheet grouped by category, in file order. */
  formulaCategories(): { category: string; formulas: FormulaJson[] }[] {
    const groups = new Map<string, FormulaJson[]>();
    for (const formula of this.json.formulaSheet) {
      const category = formula.category ?? 'Formulas';
      groups.set(category, [...(groups.get(category) ?? []), formula]);
    }
    return [...groups].map(([category, formulas]) => ({ category, formulas }));
  }
}
