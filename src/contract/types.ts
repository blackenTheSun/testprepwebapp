/**
 * TypeScript mirror of src/contract/test-file.local.v1.schema.json (guided-test-file.local/v1).
 * These describe the raw JSON; the engine wraps them in classes.
 */

export const API_VERSION = 'guided-test-file.local/v1';

export type Latex = string | string[];

export interface QuantityJson {
  id: string;
  name: string;
  symbol: string;
  unit?: string;
  quantityType?: string;
  latex?: Latex;
  value?: number;
}

export interface SlotJson {
  id: string;
  name: string;
  symbol: string;
  unit?: string;
  quantityType?: string;
}

export type ExpressionOp =
  | 'slot'
  | 'number'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'negate'
  | 'abs'
  | 'sqrt';

export interface ExpressionNodeJson {
  op: ExpressionOp;
  slot?: string;
  value?: number;
  args?: ExpressionNodeJson[];
}

export interface FormulaTeachingJson {
  whatToNotice: string;
  whyThisOperation: string;
  commonMistakes?: string[];
}

export interface FormulaJson {
  id: string;
  title: string;
  category?: string;
  latex: Latex;
  inputs: SlotJson[];
  output: SlotJson;
  calculation: { kind: 'expression/v1'; ast: ExpressionNodeJson };
  teaching: FormulaTeachingJson;
}

export interface ConversionJson {
  id: string;
  title: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
  outputName?: string;
  outputSymbol?: string;
  latex?: Latex;
}

export interface SolutionTeachingJson {
  whyNow: string;
  whatToNotice: string;
  whyThisOperation: string;
  inputMeaning: string;
  resultUse: string;
  commonMistakes?: string[];
}

export interface DerivativeActionJson {
  id: string;
  title: string;
  expressionLatex: string;
  variable: string;
  resultLatex: string;
  numericEvaluation?: QuantityJson;
  output: SlotJson;
  teaching: SolutionTeachingJson;
}

export type MathOperationName = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt';

export type SolutionStepKind = 'formula' | 'basicMath' | 'conversion' | 'derivative' | 'finalAnswer';

export interface SolutionStepJson {
  id: string;
  kind: SolutionStepKind;
  title: string;
  formulaId?: string;
  mathOperation?: MathOperationName;
  conversionId?: string;
  derivativeId?: string;
  bindings?: Record<string, string>;
  output?: QuantityJson;
  expectedLatex?: string;
  teaching: SolutionTeachingJson;
}

// ---- Visuals -------------------------------------------------------------

export type Vec3 = [number, number, number];

interface Common2d {
  id?: string;
  label?: string;
  color?: string;
}

export type DiagramPrimitiveJson = Common2d &
  (
    | { kind: 'line' | 'arrow' | 'resistor'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'polyline'; points: [number, number][] }
    | { kind: 'circle' | 'voltageSource'; x: number; y: number; radius: number }
    | { kind: 'rect'; x: number; y: number; width: number; height: number }
    | { kind: 'point' | 'ground'; x: number; y: number }
    | { kind: 'text'; x: number; y: number; text: string }
  );

interface Common3d extends Common2d {
  highlight?: boolean;
}

export type Scene3dObjectJson = Common3d &
  (
    | { kind: 'axes'; length: number; labels?: [string, string, string] }
    | { kind: 'point'; at: Vec3 }
    | { kind: 'line' | 'arrow'; from: Vec3; to: Vec3 }
    | { kind: 'plane'; origin: Vec3; u: Vec3; v: Vec3 }
    | { kind: 'box'; center: Vec3; size: Vec3 }
    | { kind: 'cylinder'; from: Vec3; to: Vec3; radius: number }
    | { kind: 'label'; at: Vec3; text: string }
  );

export interface LatexVisualJson {
  type: 'latex/v1';
  altText: string;
  latex: Latex;
}

export interface Diagram2dJson {
  type: 'diagram2d/v1';
  altText: string;
  viewBox: [number, number, number, number];
  primitives: DiagramPrimitiveJson[];
}

export interface Scene3dCameraJson {
  azimuthDeg: number;
  elevationDeg: number;
  scale?: number;
  projection?: 'orthographic' | 'perspective';
}

export interface Scene3dJson {
  type: 'scene3d/v1';
  altText: string;
  camera: Scene3dCameraJson;
  objects: Scene3dObjectJson[];
}

export type VisualJson = LatexVisualJson | Diagram2dJson | Scene3dJson;

// ---- Problems and file ---------------------------------------------------

export interface ProblemJson {
  id: string;
  title: string;
  prompt: { text: string; latex?: Latex };
  givens: QuantityJson[];
  target: SlotJson;
  visual?: VisualJson;
  allowedFormulaIds: string[];
  allowedConversionIds?: string[];
  derivativeActions?: DerivativeActionJson[];
  solutionPath: SolutionStepJson[];
}

export interface TestFileJson {
  apiVersion: typeof API_VERSION;
  id: string;
  version?: string;
  title: string;
  description?: string;
  formulaSheet: FormulaJson[];
  conversions: ConversionJson[];
  problems: ProblemJson[];
}

export function latexLines(latex: Latex | undefined): string[] {
  if (latex === undefined) return [];
  return Array.isArray(latex) ? latex : [latex];
}
