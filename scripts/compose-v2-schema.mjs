// Builds the guided-test-file.local/v2 JSON Schema from the frozen v1 schema plus the v0.3
// visual rapid-check additions, so the definitions both versions share cannot drift.
//
//   node scripts/compose-v2-schema.mjs     writes src/contract/ and docs/handoff/ copies
//
// A unit test (tests/unit/schemaV2.test.ts) fails if the committed files are out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const V1_PATH = resolve(root, 'src/contract/test-file.local.v1.schema.json');
export const V2_PATHS = [
  resolve(root, 'src/contract/test-file.local.v2.schema.json'),
  resolve(root, 'docs/handoff/test-file.local.v2.schema.json'),
];

const num = { type: 'number' };
const str = { type: 'string' };
const nonEmpty = { type: 'string', minLength: 1 };
const ref = (name) => ({ $ref: `#/$defs/${name}` });

/** `{ type: object, required: [field], allOf: [if field = k then $ref] }` for readable discriminated errors. */
function discriminated(field, refs) {
  const keys = Object.keys(refs);
  return {
    type: 'object',
    required: [field],
    properties: { [field]: { enum: keys } },
    allOf: keys.map((k) => ({ if: { properties: { [field]: { const: k } }, required: [field] }, then: ref(refs[k]) })),
  };
}

export function composeV2(v1) {
  const s = structuredClone(v1);
  const d = s.$defs;

  s.$id = 'https://guided-test-prep.local/schemas/test-file.local.v2.schema.json';
  s.title = 'Guided Test Prep Local Test File v2';
  s.description =
    'guided-test-file.local/v2: v1 worked problems plus optional visual rapid-check sets. At least one of problems or quickCheckSets must be non-empty.';
  s.properties.apiVersion = { const: 'guided-test-file.local/v2' };
  s.required = ['apiVersion', 'id', 'title'];
  s.properties.problems = { type: 'array', items: ref('problem') };
  s.properties.quickCheckSets = { type: 'array', items: ref('quickCheckSet') };

  // ---- Expression trees: named trig with an explicit angle unit ----------------------------
  const trig = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'];
  d.expressionNode.properties.op.enum = [...d.expressionNode.properties.op.enum, ...trig];
  d.expressionNode.properties.angleUnit = { enum: ['deg', 'rad'] };
  d.expressionNode.allOf.push(
    ...trig.map((op) => ({
      if: { properties: { op: { const: op } }, required: ['op'] },
      then: { required: ['args', 'angleUnit'], properties: { args: { minItems: 1, maxItems: 1 } } },
    })),
  );

  // ---- Typed-scene additions: highlight on 2D, sphere and wireframe box in 3D ----------------
  for (const [name, def] of Object.entries(d)) {
    if (name.startsWith('diagramPrimitive_')) def.properties.highlight = { type: 'boolean' };
  }
  d.scene3dObject_box.properties.wireframe = { type: 'boolean' };
  d.scene3dObject_sphere = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'center', 'radius'],
    properties: {
      kind: { const: 'sphere' },
      ...Object.fromEntries(['id', 'label', 'color'].map((k) => [k, str])),
      highlight: { type: 'boolean' },
      center: ref('vec3'),
      radius: { type: 'number', exclusiveMinimum: 0 },
    },
  };
  const sceneKinds = [...d.scene3dObject.properties.kind.enum, 'sphere'];
  d.scene3dObject = discriminated('kind', Object.fromEntries(sceneKinds.map((k) => [k, `scene3dObject_${k}`])));

  // ---- Item visuals ---------------------------------------------------------------------
  d.callout = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'xPct', 'yPct'],
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 3 },
      xPct: { type: 'number', minimum: 0, maximum: 100 },
      yPct: { type: 'number', minimum: 0, maximum: 100 },
    },
  };
  d.typedSceneVisual = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'scene'],
    properties: {
      kind: { const: 'typedScene' },
      scene: ref('visual'),
      caption: str,
      callouts: { type: 'array', items: ref('callout') },
    },
  };
  d.imageVisual = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'mediaType', 'data', 'altText', 'width', 'height'],
    properties: {
      kind: { const: 'image' },
      mediaType: { enum: ['image/png', 'image/jpeg'] },
      data: { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9+/]+={0,2}$' },
      altText: nonEmpty,
      width: { type: 'integer', minimum: 1 },
      height: { type: 'integer', minimum: 1 },
      caption: str,
      callouts: { type: 'array', items: ref('callout') },
    },
  };
  d.panelVisual = discriminated('kind', { typedScene: 'typedSceneVisual', image: 'imageVisual' });
  d.pairVisual = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'panels'],
    properties: {
      kind: { const: 'pair' },
      altText: str,
      panels: { type: 'array', minItems: 2, maxItems: 2, items: ref('panelVisual') },
    },
  };
  d.itemVisual = discriminated('kind', { typedScene: 'typedSceneVisual', image: 'imageVisual', pair: 'pairVisual' });

  // ---- Quick-check items ----------------------------------------------------------------
  const common = {
    id: ref('id'),
    displaySeconds: { type: 'number', exclusiveMinimum: 0, maximum: 600 },
  };
  d.choiceOption = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'text'],
    properties: { id: ref('id'), text: nonEmpty },
  };
  d.singleChoiceItem = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type', 'prompt', 'options', 'correctOptionId', 'explanation'],
    properties: {
      ...common,
      type: { const: 'singleChoice' },
      prompt: nonEmpty,
      visual: ref('itemVisual'),
      options: { type: 'array', minItems: 2, items: ref('choiceOption') },
      correctOptionId: ref('id'),
      explanation: nonEmpty,
    },
  };
  d.trueFalseItem = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type', 'visual', 'statement', 'answer', 'explanation'],
    properties: {
      ...common,
      type: { const: 'trueFalse' },
      visual: ref('itemVisual'),
      statement: nonEmpty,
      answer: { type: 'boolean' },
      explanation: nonEmpty,
    },
  };
  d.matchingItem = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type', 'visual', 'prompts', 'options', 'answers'],
    properties: {
      ...common,
      type: { const: 'matching' },
      prompt: str,
      visual: ref('itemVisual'),
      prompts: {
        type: 'array',
        minItems: 2,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'text'],
          properties: { id: { type: 'string', minLength: 1, maxLength: 3 }, text: nonEmpty },
        },
      },
      options: { type: 'array', minItems: 2, items: nonEmpty },
      answers: { type: 'object', additionalProperties: nonEmpty },
      // When true, a label may be the correct answer for more than one callout and every piece
      // stays in the bank after use.
      allowReuse: { type: 'boolean' },
      explanation: str,
    },
  };
  d.recallItem = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type', 'responseMode', 'prompt'],
    properties: {
      ...common,
      type: { const: 'recall' },
      responseMode: { enum: ['written', 'sketch'] },
      prompt: nonEmpty,
      visual: ref('itemVisual'),
      referenceVisual: ref('itemVisual'),
      modelAnswer: str,
      keyPoints: { type: 'array', items: nonEmpty },
    },
  };
  d.quickCheckItem = discriminated('type', {
    singleChoice: 'singleChoiceItem',
    trueFalse: 'trueFalseItem',
    matching: 'matchingItem',
    recall: 'recallItem',
  });
  d.quickCheckSet = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'title', 'instructions', 'feedbackMode', 'presentationMode', 'items'],
    properties: {
      id: ref('id'),
      title: nonEmpty,
      instructions: str,
      feedbackMode: { enum: ['immediate', 'end'] },
      presentationMode: { enum: ['standard', 'rapidVisual'] },
      items: { type: 'array', minItems: 1, items: ref('quickCheckItem') },
    },
  };
  return s;
}

export function composedText() {
  return `${JSON.stringify(composeV2(JSON.parse(readFileSync(V1_PATH, 'utf8'))), null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = composedText();
  for (const path of V2_PATHS) writeFileSync(path, text);
  console.log(`Wrote ${V2_PATHS.length} copies of the v2 schema`);
}
