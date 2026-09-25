import schemaV1 from './generated/schemaValidatorV1.js';
import schemaV2 from './generated/schemaValidatorV2.js';
import {
  ActivityPresenceRule,
  CalloutRule,
  MatchingRule,
  QuickCheckIdRule,
  RapidVisualRule,
  RecallRule,
  SingleChoiceRule,
  VisualAssetRule,
} from './rulesV2';
import { API_VERSION, API_VERSION_V2, type ApiVersion, type TestFileJson, type TestFileV2Json } from './types';
import {
  AuthoredValueRule,
  BindingRule,
  type CompiledSchema,
  FormulaExpressionRule,
  GivenValueRule,
  ReferenceRule,
  SchemaCheck,
  UniqueIdRule,
  ValidationReport,
  type ValidationRule,
} from './validate';

export interface ContractResult {
  report: ValidationReport;
  /** The file in the engine's normalized shape; present only when there are no errors. */
  file?: TestFileJson;
}

/**
 * One version of the test-file contract: its compiled schema, how to normalize a valid file into
 * the engine's shape, and its semantic rules. Validation runs schema → semantic rules → (only if
 * still error-free) the answer-key recomputation.
 */
export abstract class TestFileContract {
  abstract readonly apiVersion: ApiVersion;
  protected abstract readonly schema: CompiledSchema;

  protected abstract rules(): ValidationRule[];

  protected answerKeyRules(): ValidationRule[] {
    return [new AuthoredValueRule()];
  }

  protected abstract normalize(data: unknown): TestFileJson;

  validate(data: unknown): ContractResult {
    const report = new ValidationReport();
    new SchemaCheck(this.schema).check(data, report);
    if (!report.ok) return { report };
    const file = this.normalize(data);
    for (const rule of this.rules()) rule.check(file, report);
    if (report.ok) for (const rule of this.answerKeyRules()) rule.check(file, report);
    return report.ok ? { report, file } : { report };
  }
}

const WORKED_PROBLEM_RULES = (): ValidationRule[] => [
  new UniqueIdRule(),
  new FormulaExpressionRule(),
  new ReferenceRule(),
  new BindingRule(),
  new GivenValueRule(),
];

/** guided-test-file.local/v1: frozen; worked problems only. */
export class ContractV1 extends TestFileContract {
  readonly apiVersion = API_VERSION;
  protected readonly schema = schemaV1;

  protected rules(): ValidationRule[] {
    return WORKED_PROBLEM_RULES();
  }

  protected normalize(data: unknown): TestFileJson {
    return data as TestFileJson;
  }
}

/** guided-test-file.local/v2: v1 worked problems plus visual rapid-check sets. */
export class ContractV2 extends TestFileContract {
  readonly apiVersion = API_VERSION_V2;
  protected readonly schema = schemaV2;

  protected rules(): ValidationRule[] {
    return [
      new ActivityPresenceRule(),
      ...WORKED_PROBLEM_RULES(),
      new QuickCheckIdRule(),
      new VisualAssetRule(),
      new CalloutRule(),
      new SingleChoiceRule(),
      new MatchingRule(),
      new RecallRule(),
      new RapidVisualRule(),
    ];
  }

  protected normalize(data: unknown): TestFileJson {
    const raw = data as TestFileV2Json;
    return {
      ...raw,
      formulaSheet: raw.formulaSheet ?? [],
      conversions: raw.conversions ?? [],
      problems: raw.problems ?? [],
      quickCheckSets: raw.quickCheckSets ?? [],
    };
  }
}

export class ContractRegistry {
  private readonly byVersion = new Map<string, TestFileContract>();

  constructor(contracts: TestFileContract[]) {
    for (const contract of contracts) this.byVersion.set(contract.apiVersion, contract);
  }

  get supportedVersions(): string[] {
    return [...this.byVersion.keys()];
  }

  /** The contract named by the file's `apiVersion`, or undefined. */
  forData(data: unknown): TestFileContract | undefined {
    const version = typeof data === 'object' && data !== null ? (data as { apiVersion?: unknown }).apiVersion : undefined;
    return typeof version === 'string' ? this.byVersion.get(version) : undefined;
  }
}

export const CONTRACTS = new ContractRegistry([new ContractV1(), new ContractV2()]);

/** Validates any supported test-file version and normalizes it for the engine. */
export class TestFileValidator {
  constructor(private readonly registry: ContractRegistry = CONTRACTS) {}

  validateAndNormalize(data: unknown): ContractResult {
    const contract = this.registry.forData(data);
    if (contract) return contract.validate(data);
    const report = new ValidationReport();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      report.error('schema', '/', 'A test file must be a JSON object');
    } else {
      const found = (data as { apiVersion?: unknown }).apiVersion;
      report.error(
        'schema',
        '/apiVersion',
        `${found === undefined ? 'Missing "apiVersion"' : `Unsupported apiVersion ${JSON.stringify(found)}`}; supported: ${this.registry.supportedVersions.map((v) => `"${v}"`).join(', ')}`,
      );
    }
    return { report };
  }

  validate(data: unknown): ValidationReport {
    return this.validateAndNormalize(data).report;
  }
}
