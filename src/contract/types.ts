/**
 * TypeScript mirror of src/contract/test-file.local.v1.schema.json (guided-test-file.local/v1).
 * These describe the raw JSON; the engine wraps them in classes.
 */

export const API_VERSION = 'guided-test-file.local/v1';
export const API_VERSION_V2 = 'guided-test-file.local/v2';
export type ApiVersion = typeof API_VERSION | typeof API_VERSION_V2;

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
  | 'sqrt'
  // v2 only; each requires angleUnit.
  | 'sin'
  | 'cos'
  | 'tan'
  | 'asin'
  | 'acos'
  | 'atan';

export type AngleUnit = 'deg' | 'rad';

export interface ExpressionNodeJson {
  op: ExpressionOp;
  slot?: string;
  value?: number;
  args?: ExpressionNodeJson[];
  /** Trig ops (v2): unit of the input for sin/cos/tan, of the output for asin/acos/atan. */
  angleUnit?: AngleUnit;
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
  /** v2: draw in the highlight colour. */
  highlight?: boolean;
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

type Common3d = Common2d;

export type Scene3dObjectJson = Common3d &
  (
    | { kind: 'axes'; length: number; labels?: [string, string, string] }
    | { kind: 'point'; at: Vec3 }
    | { kind: 'line' | 'arrow'; from: Vec3; to: Vec3 }
    | { kind: 'plane'; origin: Vec3; u: Vec3; v: Vec3 }
    | { kind: 'box'; center: Vec3; size: Vec3; wireframe?: boolean }
    | { kind: 'sphere'; center: Vec3; radius: number }
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

/**
 * A test file in the engine's normalized shape. v1 files arrive in exactly this shape; v2 files
 * are normalized into it by `ContractV2` (missing arrays become empty).
 */
export interface TestFileJson {
  apiVersion: ApiVersion;
  id: string;
  version?: string;
  title: string;
  description?: string;
  formulaSheet: FormulaJson[];
  conversions: ConversionJson[];
  problems: ProblemJson[];
  /** v2 only. */
  quickCheckSets?: QuickCheckSetJson[];
}

/** A v2 file as authored: every activity list is optional (at least one must be non-empty). */
export interface TestFileV2Json {
  apiVersion: typeof API_VERSION_V2;
  id: string;
  version?: string;
  title: string;
  description?: string;
  formulaSheet?: FormulaJson[];
  conversions?: ConversionJson[];
  problems?: ProblemJson[];
  quickCheckSets?: QuickCheckSetJson[];
}

// ---- v2 quick checks -------------------------------------------------------------

export interface CalloutJson {
  id: string;
  xPct: number;
  yPct: number;
}

export interface TypedSceneVisualJson {
  kind: 'typedScene';
  scene: VisualJson;
  caption?: string;
  callouts?: CalloutJson[];
}

export interface ImageVisualJson {
  kind: 'image';
  mediaType: 'image/png' | 'image/jpeg';
  /** Raw base64 (no `data:` prefix). */
  data: string;
  altText: string;
  width: number;
  height: number;
  caption?: string;
  callouts?: CalloutJson[];
}

export type PanelVisualJson = TypedSceneVisualJson | ImageVisualJson;

export interface PairVisualJson {
  kind: 'pair';
  altText?: string;
  panels: [PanelVisualJson, PanelVisualJson];
}

export type ItemVisualJson = PanelVisualJson | PairVisualJson;

interface ItemCommon {
  id: string;
  /** Per-card time limit, used in rapidVisual sets. */
  displaySeconds?: number;
}

export interface SingleChoiceItemJson extends ItemCommon {
  type: 'singleChoice';
  prompt: string;
  visual?: ItemVisualJson;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface TrueFalseItemJson extends ItemCommon {
  type: 'trueFalse';
  visual: ItemVisualJson;
  statement: string;
  answer: boolean;
  explanation: string;
}

export interface MatchingItemJson extends ItemCommon {
  type: 'matching';
  prompt?: string;
  visual: ItemVisualJson;
  prompts: { id: string; text: string }[];
  /** Term bank; may include decoys. */
  options: string[];
  /** Callout id → correct term. */
  answers: Record<string, string>;
  /** Labels may be correct for several callouts, and pieces stay in the bank after use. */
  allowReuse?: boolean;
  explanation?: string;
}

export interface RecallItemJson extends ItemCommon {
  type: 'recall';
  responseMode: 'written' | 'sketch';
  prompt: string;
  /** Shown with the prompt. */
  visual?: ItemVisualJson;
  /** Shown only when the reference is revealed (e.g. the correct sketch). */
  referenceVisual?: ItemVisualJson;
  modelAnswer?: string;
  keyPoints?: string[];
}

export type QuickCheckItemJson = SingleChoiceItemJson | TrueFalseItemJson | MatchingItemJson | RecallItemJson;

export interface QuickCheckSetJson {
  id: string;
  title: string;
  instructions: string;
  feedbackMode: 'immediate' | 'end';
  presentationMode: 'standard' | 'rapidVisual';
  items: QuickCheckItemJson[];
}

export function latexLines(latex: Latex | undefined): string[] {
  if (latex === undefined) return [];
  return Array.isArray(latex) ? latex : [latex];
}
