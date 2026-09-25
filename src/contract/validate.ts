import { AuthoredPath } from '../engine/authoredPath';
import { ExpressionNode, ExpressionStructureError } from '../engine/expression';
import { formatNumber } from '../engine/format';
import { mathOperator } from '../engine/operations';
import { TestFile } from '../engine/testFile';
import type { SchemaError } from './generated/schemaValidatorV1.js';
import type { ProblemJson, SolutionStepJson, TestFileJson } from './types';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  /** JSON pointer into the test file, e.g. `/problems/0/solutionPath/2/bindings/left`. */
  path: string;
  message: string;
  /** Name of the rule that raised it. */
  rule: string;
}

/** Collects issues for one validation run. */
export class ValidationReport {
  readonly issues: ValidationIssue[] = [];

  error(rule: string, path: string, message: string): void {
    this.issues.push({ severity: 'error', rule, path, message });
  }

  warning(rule: string, path: string, message: string): void {
    this.issues.push({ severity: 'warning', rule, path, message });
  }

  get errors(): ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'error');
  }

  get warnings(): ValidationIssue[] {
    return this.issues.filter((i) => i.severity === 'warning');
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }
}

/** A check over a schema-valid test file. Each rule reports its own issues. */
export abstract class ValidationRule {
  abstract readonly name: string;
  abstract check(file: TestFileJson, report: ValidationReport): void;
}

// ---- Schema ------------------------------------------------------------------

export type CompiledSchema = ((data: unknown) => boolean) & { errors?: SchemaError[] | null };

/** Structural validation against one contract version's (build-time compiled) JSON Schema. */
export class SchemaCheck {
  readonly name = 'schema';

  constructor(private readonly schemaValidate: CompiledSchema) {}

  check(data: unknown, report: ValidationReport): void {
    if (this.schemaValidate(data)) return;
    for (const error of SchemaCheck.simplify(this.schemaValidate.errors ?? [])) {
      report.error(this.name, error.instancePath || '/', SchemaCheck.describe(error));
    }
  }

  /** Drops Ajv's wrapper errors (`if`/`then` bookkeeping) that repeat a more specific error. */
  static simplify(errors: SchemaError[]): SchemaError[] {
    const seen = new Set<string>();
    return errors
      .filter((e) => e.keyword !== 'if')
      .filter((e) => {
        const key = `${e.instancePath}|${e.keyword}|${JSON.stringify(e.params)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  static describe(error: SchemaError): string {
    const p = error.params as Record<string, unknown>;
    switch (error.keyword) {
      case 'required':
        return `Missing required field "${String(p.missingProperty)}"`;
      case 'additionalProperties':
        return `Unexpected field "${String(p.additionalProperty)}"`;
      case 'enum':
        return `Must be one of: ${(p.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(', ')}`;
      case 'const':
        return `Must be ${JSON.stringify(p.allowedValue)}`;
      case 'pattern':
        if (error.instancePath.endsWith('/data')) {
          return 'Must be raw base64 image data (no "data:" prefix, URL, file path or line breaks)';
        }
        return 'Must start with a letter and use only letters, digits, ".", "_" or "-" (2-128 characters)';
      case 'type':
        return `Must be ${String(p.type)}`;
      case 'minItems':
        return `Needs at least ${String(p.limit)} item(s)`;
      case 'maxItems':
        return `Allows at most ${String(p.limit)} item(s)`;
      case 'minimum':
        return `Must be at least ${String(p.limit)}`;
      case 'maximum':
        return `Must be at most ${String(p.limit)}`;
      case 'exclusiveMinimum':
        return `Must be greater than ${String(p.limit)}`;
      case 'minLength':
        return p.limit === 1 ? 'Must not be empty' : `Must be at least ${String(p.limit)} characters`;
      case 'maxLength':
        return `Must be at most ${String(p.limit)} characters`;
      default:
        return error.message ?? `Failed "${error.keyword}" check`;
    }
  }
}

// ---- Semantic rules -------------------------------------------------------------

const problemPath = (pi: number) => `/problems/${pi}`;

/** Ids that must be unique: formulas, conversions, problems, and every id inside a problem. */
export class UniqueIdRule extends ValidationRule {
  readonly name = 'unique-ids';

  check(file: TestFileJson, report: ValidationReport): void {
    this.unique(file.formulaSheet.map((f, i) => [f.id, `/formulaSheet/${i}/id`]), 'formula', report);
    this.unique(file.conversions.map((c, i) => [c.id, `/conversions/${i}/id`]), 'conversion', report);
    this.unique(file.problems.map((p, i) => [p.id, `/problems/${i}/id`]), 'problem', report);
    file.problems.forEach((p, pi) => {
      const base = problemPath(pi);
      this.unique(p.solutionPath.map((s, i) => [s.id, `${base}/solutionPath/${i}/id`]), 'solution step', report);
      this.unique((p.derivativeActions ?? []).map((d, i) => [d.id, `${base}/derivativeActions/${i}/id`]), 'derivative action', report);
      // Values a binding can refer to share one namespace.
      const values: [string, string][] = [
        ...p.givens.map((g, i): [string, string] => [g.id, `${base}/givens/${i}/id`]),
        ...p.solutionPath.flatMap((s, i): [string, string][] => (s.output ? [[s.output.id, `${base}/solutionPath/${i}/output/id`]] : [])),
        ...(p.derivativeActions ?? []).flatMap((d, i): [string, string][] => [
          [d.output.id, `${base}/derivativeActions/${i}/output/id`],
          ...(d.numericEvaluation ? [[d.numericEvaluation.id, `${base}/derivativeActions/${i}/numericEvaluation/id`] as [string, string]] : []),
        ]),
      ];
      this.unique(values, 'value', report);
    });
  }

  private unique(entries: [string, string][], what: string, report: ValidationReport): void {
    const first = new Map<string, string>();
    for (const [id, path] of entries) {
      const prior = first.get(id);
      if (prior) report.error(this.name, path, `Duplicate ${what} id "${id}" (first used at ${prior})`);
      else first.set(id, path);
    }
  }
}

/** Formula expression trees are well formed and only use their own input slots. */
export class FormulaExpressionRule extends ValidationRule {
  readonly name = 'formula-expression';

  check(file: TestFileJson, report: ValidationReport): void {
    file.formulaSheet.forEach((formula, fi) => {
      const astPath = `/formulaSheet/${fi}/calculation/ast`;
      let tree: ExpressionNode;
      try {
        tree = ExpressionNode.fromJson(formula.calculation.ast);
      } catch (error) {
        if (error instanceof ExpressionStructureError) report.error(this.name, astPath + error.path, error.message);
        else throw error;
        return;
      }
      const inputs = new Set(formula.inputs.map((s) => s.id));
      const used = new Set(tree.slots());
      for (const slot of used) {
        if (!inputs.has(slot)) report.error(this.name, astPath, `Uses slot "${slot}", which is not one of this formula's inputs`);
      }
      formula.inputs.forEach((slot, si) => {
        if (!used.has(slot.id)) report.warning(this.name, `/formulaSheet/${fi}/inputs/${si}`, `Input "${slot.id}" is never used by the calculation`);
      });
    });
  }
}

/** Formula, conversion and derivative references exist and are allowed by the problem. */
export class ReferenceRule extends ValidationRule {
  readonly name = 'references';

  check(file: TestFileJson, report: ValidationReport): void {
    const formulas = new Set(file.formulaSheet.map((f) => f.id));
    const conversions = new Set(file.conversions.map((c) => c.id));
    file.problems.forEach((problem, pi) => {
      const base = problemPath(pi);
      problem.allowedFormulaIds.forEach((id, i) => {
        if (!formulas.has(id)) report.error(this.name, `${base}/allowedFormulaIds/${i}`, `Formula "${id}" is not in the formula sheet`);
      });
      (problem.allowedConversionIds ?? []).forEach((id, i) => {
        if (!conversions.has(id)) report.error(this.name, `${base}/allowedConversionIds/${i}`, `Conversion "${id}" is not in the conversions list`);
      });
      const allowedFormulas = new Set(problem.allowedFormulaIds);
      const allowedConversions = new Set(problem.allowedConversionIds ?? []);
      const derivatives = new Set((problem.derivativeActions ?? []).map((d) => d.id));
      problem.solutionPath.forEach((step, si) => {
        const path = `${base}/solutionPath/${si}`;
        if (step.kind === 'formula' && step.formulaId) {
          if (!formulas.has(step.formulaId)) report.error(this.name, `${path}/formulaId`, `Formula "${step.formulaId}" is not in the formula sheet`);
          else if (!allowedFormulas.has(step.formulaId)) report.error(this.name, `${path}/formulaId`, `Formula "${step.formulaId}" is used here but missing from allowedFormulaIds`);
        }
        if (step.kind === 'conversion' && step.conversionId) {
          if (!conversions.has(step.conversionId)) report.error(this.name, `${path}/conversionId`, `Conversion "${step.conversionId}" is not in the conversions list`);
          else if (!allowedConversions.has(step.conversionId)) report.error(this.name, `${path}/conversionId`, `Conversion "${step.conversionId}" is used here but missing from allowedConversionIds`);
        }
        if (step.kind === 'derivative' && step.derivativeId && !derivatives.has(step.derivativeId)) {
          report.error(this.name, `${path}/derivativeId`, `Derivative action "${step.derivativeId}" is not defined in this problem's derivativeActions`);
        }
      });
    });
  }
}

/**
 * Solution-path bindings use the right keys for their step kind and refer to a given or an
 * output defined earlier in the path.
 */
export class BindingRule extends ValidationRule {
  readonly name = 'bindings';

  check(file: TestFileJson, report: ValidationReport): void {
    const formulas = new Map(file.formulaSheet.map((f) => [f.id, f]));
    file.problems.forEach((problem, pi) => {
      const available = new Map<string, { numeric: boolean }>();
      for (const given of problem.givens) available.set(given.id, { numeric: typeof given.value === 'number' });
      problem.solutionPath.forEach((step, si) => {
        const path = `${problemPath(pi)}/solutionPath/${si}`;
        const expected = this.expectedKeys(step, formulas);
        if (expected) this.checkKeys(step, expected, path, report);
        for (const [key, ref] of Object.entries(step.bindings ?? {})) {
          const target = available.get(ref);
          if (!target) {
            report.error(this.name, `${path}/bindings/${key}`, `"${ref}" is not a given or an output of an earlier step`);
          } else if (!target.numeric && step.kind !== 'finalAnswer') {
            report.error(this.name, `${path}/bindings/${key}`, `"${ref}" has no numeric value, so it cannot be used in a calculation`);
          }
        }
        this.defineOutputs(problem, step, available);
      });
    });
  }

  private expectedKeys(step: SolutionStepJson, formulas: Map<string, TestFileJson['formulaSheet'][number]>): string[] | undefined {
    switch (step.kind) {
      case 'formula':
        return formulas.get(step.formulaId ?? '')?.inputs.map((s) => s.id);
      case 'basicMath':
        return step.mathOperation ? [...mathOperator(step.mathOperation).keys] : undefined;
      case 'conversion':
        return ['value'];
      case 'finalAnswer':
        return ['answer'];
      case 'derivative':
        return [];
    }
  }

  private checkKeys(step: SolutionStepJson, expected: string[], path: string, report: ValidationReport): void {
    const actual = Object.keys(step.bindings ?? {});
    for (const key of expected) {
      if (!actual.includes(key)) report.error(this.name, `${path}/bindings`, `Missing binding "${key}" (${step.kind} steps bind: ${expected.join(', ') || 'nothing'})`);
    }
    for (const key of actual) {
      if (!expected.includes(key)) report.error(this.name, `${path}/bindings/${key}`, `Unexpected binding "${key}" (${step.kind} steps bind: ${expected.join(', ') || 'nothing'})`);
    }
  }

  private defineOutputs(problem: ProblemJson, step: SolutionStepJson, available: Map<string, { numeric: boolean }>): void {
    if (step.output) available.set(step.output.id, { numeric: true });
    if (step.kind === 'derivative') {
      const action = problem.derivativeActions?.find((d) => d.id === step.derivativeId);
      if (action) {
        available.set(action.output.id, { numeric: false });
        if (action.numericEvaluation) available.set(action.numericEvaluation.id, { numeric: typeof action.numericEvaluation.value === 'number' });
      }
    }
  }
}

/** Givens that Amy would pick from should carry a number. */
export class GivenValueRule extends ValidationRule {
  readonly name = 'given-values';

  check(file: TestFileJson, report: ValidationReport): void {
    file.problems.forEach((problem, pi) => {
      problem.givens.forEach((given, gi) => {
        if (typeof given.value !== 'number') {
          report.warning(this.name, `${problemPath(pi)}/givens/${gi}/value`, `Given "${given.id}" has no numeric value, so it cannot be used in a calculation`);
        }
      });
    });
  }
}

/**
 * Recomputes every authored step and warns when the stored `output.value` disagrees.
 * This catches arithmetic slips in generated answer keys. Warnings do not block opening.
 */
export class AuthoredValueRule extends ValidationRule {
  readonly name = 'authored-values';

  check(file: TestFileJson, report: ValidationReport): void {
    const test = new TestFile(file);
    for (const problem of test.problems) {
      const path = new AuthoredPath(problem);
      path.results.forEach((result, si) => {
        const at = `${problemPath(problem.index)}/solutionPath/${si}`;
        if (result.error) {
          report.warning(this.name, at, `Could not recompute this step: ${result.error}`);
        } else if (result.mismatch) {
          report.warning(
            this.name,
            `${at}/output/value`,
            `Answer key says ${formatNumber(result.authoredValue as number)}, but the app calculates ${formatNumber(result.computedValue as number)} from the bound inputs`,
          );
        }
      });
    }
  }
}
