// Builds the v0.3 PLACEHOLDER proof fixture (guided-test-file.local/v2) with deliberately generic
// content (shapes, a ramp angle) that exercises every feature the delta SOW lists. Replace it
// with client-approved course content; see docs/TEST_FILE_GUIDE.md.
//   node scripts/make-placeholder-images.mjs && node scripts/make-placeholder-fixture.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/handoff/v0.3/placeholder-visual-checks.test.example.json');
const b64 = (name) => readFileSync(resolve(root, 'tests/fixtures/images', name)).toString('base64');

const shapesImage = (callouts) => ({
  kind: 'image',
  mediaType: 'image/png',
  altText: 'Five filled shapes in a row on white, left to right: a blue circle, an orange square, a green triangle, a purple hexagon and a red five-pointed star.',
  width: 400,
  height: 160,
  data: b64('shapes-lineup.png'),
  ...(callouts ? { callouts } : {}),
});
const ballImage = {
  kind: 'image',
  mediaType: 'image/jpeg',
  altText: 'Photo-style picture of a shaded blue ball resting on a beige surface, lit from the upper left.',
  width: 200,
  height: 200,
  data: b64('shaded-ball.jpg'),
};
const camera = { azimuthDeg: -40, elevationDeg: 24, projection: 'orthographic' };
const scene = (altText, objects, extra = {}, cam = camera) => ({
  kind: 'typedScene',
  scene: { type: 'scene3d/v1', altText, camera: cam, objects },
  ...extra,
});
const diagram = (altText, viewBox, primitives) => ({
  kind: 'typedScene',
  scene: { type: 'diagram2d/v1', altText, viewBox, primitives },
});
const corners = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push({ kind: 'sphere', center: [x, y, z], radius: 0.28 });
const cubeWithCenter = (highlightCenter) =>
  scene(
    `A wireframe cube with a sphere at each of its eight corners and one sphere at its centre${highlightCenter ? '; the centre sphere is highlighted' : ''}.`,
    [{ kind: 'box', center: [0, 0, 0], size: [2, 2, 2], wireframe: true }, ...corners, { kind: 'sphere', center: [0, 0, 0], radius: 0.32, highlight: highlightCenter }],
    {},
    // A shallower angle keeps the centre sphere clear of the corner spheres in front of it.
    { azimuthDeg: -15, elevationDeg: 12, projection: 'orthographic' },
  );

const fixture = {
  apiVersion: 'guided-test-file.local/v2',
  id: 'placeholder-visual-checks-01',
  version: '0.3.0',
  title: 'PLACEHOLDER Visual Rapid Checks',
  description:
    'Placeholder proof fixture for the v0.3 delta. Generic shapes only; replace with client-approved content. Exercises every visual rapid-check feature plus one degree-based trig worked problem.',
  formulaSheet: [
    {
      id: 'ramp_height',
      title: 'Height gained along a slope',
      category: 'Trigonometry',
      latex: 'h = L \\sin\\theta',
      inputs: [
        { id: 'slopeLength', name: 'Slope length', symbol: 'L', unit: 'm', quantityType: 'length' },
        { id: 'angle', name: 'Slope angle', symbol: '\\theta', unit: 'deg', quantityType: 'angle' },
      ],
      output: { id: 'height', name: 'Height gained', symbol: 'h', unit: 'm', quantityType: 'length' },
      calculation: {
        kind: 'expression/v1',
        ast: {
          op: 'multiply',
          args: [
            { op: 'slot', slot: 'slopeLength' },
            { op: 'sin', angleUnit: 'deg', args: [{ op: 'slot', slot: 'angle' }] },
          ],
        },
      },
      teaching: {
        whatToNotice: 'The distance is measured along the slope and the angle is measured from the horizontal.',
        whyThisOperation: 'The vertical rise is the side opposite the angle, so it is the slope length times the sine of the angle.',
        commonMistakes: ['Using cosine, which gives the horizontal run.', 'Evaluating sin(30) in radians instead of degrees.'],
      },
    },
  ],
  conversions: [],
  problems: [
    {
      id: 'ramp-height',
      title: 'PLACEHOLDER Height gained along a ramp (degree trig)',
      prompt: {
        text: 'A straight ramp is 4.0 m long and rises at 30 degrees to the horizontal. Find the vertical height it gains.',
        latex: ['L = 4.0\\,\\mathrm{m}', '\\theta = 30^\\circ'],
      },
      givens: [
        { id: 'ramp_length', name: 'Ramp length', symbol: 'L', unit: 'm', quantityType: 'length', value: 4, latex: 'L = 4.0\\,\\mathrm{m}' },
        { id: 'ramp_angle', name: 'Ramp angle', symbol: '\\theta', unit: 'deg', quantityType: 'angle', value: 30, latex: '\\theta = 30^\\circ' },
      ],
      target: { id: 'ramp_height', name: 'Height gained', symbol: 'h', unit: 'm', quantityType: 'length' },
      visual: {
        type: 'diagram2d/v1',
        altText: 'A right triangle: a sloped ramp from lower left to upper right, 4.0 m long, at 30 degrees to the horizontal ground, with the unknown vertical height h on the right.',
        viewBox: [0, 0, 420, 220],
        primitives: [
          { kind: 'line', x1: 40, y1: 180, x2: 340, y2: 180 },
          { kind: 'line', x1: 40, y1: 180, x2: 340, y2: 7, label: 'L = 4.0 m' },
          { kind: 'line', x1: 340, y1: 180, x2: 340, y2: 7, label: 'h = ?', highlight: true },
          { kind: 'text', x: 92, y: 172, text: '30°' },
        ],
      },
      allowedFormulaIds: ['ramp_height'],
      allowedConversionIds: [],
      solutionPath: [
        {
          id: 'apply-sine',
          kind: 'formula',
          title: 'Use the sine of the slope angle',
          formulaId: 'ramp_height',
          bindings: { slopeLength: 'ramp_length', angle: 'ramp_angle' },
          output: { id: 'ramp_height_value', name: 'Height gained', symbol: 'h', unit: 'm', quantityType: 'length', value: 2 },
          teaching: {
            whyNow: 'The height is the only unknown side, and the slope length and its angle are both given.',
            whatToNotice: 'The angle is given in degrees and sits between the ramp and the ground.',
            whyThisOperation: 'Opposite side = hypotenuse × sin(angle).',
            inputMeaning: 'L is the 4.0 m ramp (the hypotenuse); θ is 30 degrees.',
            resultUse: 'This is the requested height.',
            commonMistakes: ['Using cos(30°) and getting 3.46 m.'],
          },
        },
        {
          id: 'state-height',
          kind: 'finalAnswer',
          title: 'State the height',
          bindings: { answer: 'ramp_height_value' },
          expectedLatex: 'h = 2.0\\,\\mathrm{m}',
          teaching: {
            whyNow: 'The height has been calculated.',
            whatToNotice: 'The answer is a length in metres.',
            whyThisOperation: 'A final answer names the quantity, value and unit.',
            inputMeaning: 'Use the calculated height.',
            resultUse: 'The problem is complete.',
          },
        },
      ],
    },
  ],
  quickCheckSets: [
    {
      id: 'shapes-standard',
      title: 'PLACEHOLDER Shapes and scenes',
      instructions: 'Look at each picture and answer. Feedback appears after each card.',
      feedbackMode: 'immediate',
      presentationMode: 'standard',
      items: [
        {
          id: 'identify-sphere',
          type: 'singleChoice',
          prompt: 'Which solid is shown?',
          visual: scene('A single shaded sphere floating above a set of x, y, z axes.', [
            { kind: 'axes', length: 2.2 },
            { kind: 'sphere', center: [0.6, 0.6, 1.1], radius: 0.7 },
          ]),
          options: [
            { id: 'sphere', text: 'Sphere' },
            { id: 'cube', text: 'Cube' },
            { id: 'cylinder', text: 'Cylinder' },
            { id: 'plane', text: 'Flat plane' },
          ],
          correctOptionId: 'sphere',
          explanation: 'Every point on the surface is the same distance from the centre, so it is a sphere.',
        },
        {
          id: 'identify-highlight',
          type: 'singleChoice',
          prompt: 'Where is the highlighted sphere?',
          visual: cubeWithCenter(true),
          options: [
            { id: 'corner', text: 'At a corner of the cube' },
            { id: 'center', text: 'At the centre of the cube' },
            { id: 'face', text: 'At the centre of a face' },
            { id: 'edge', text: 'At the middle of an edge' },
          ],
          correctOptionId: 'center',
          explanation: 'The highlighted sphere sits inside the cube, equally far from all eight corners.',
        },
        {
          id: 'compare-panels',
          type: 'singleChoice',
          prompt: 'Which panel shows a rounded solid with no flat faces?',
          visual: {
            kind: 'pair',
            altText: 'Two panels side by side: A is a rectangular box; B is a photo of a ball.',
            panels: [
              { ...scene('A solid rectangular box.', [{ kind: 'box', center: [0, 0, 0], size: [2, 1.2, 1] }]), caption: 'A' },
              { ...ballImage, caption: 'B' },
            ],
          },
          options: [
            { id: 'panel-a', text: 'Panel A' },
            { id: 'panel-b', text: 'Panel B' },
          ],
          correctOptionId: 'panel-b',
          explanation: 'Panel B is a ball: its surface curves everywhere. Panel A is a box with six flat faces.',
        },
        {
          id: 'tf-third-shape',
          type: 'trueFalse',
          visual: shapesImage(),
          statement: 'The third shape from the left is a square.',
          answer: false,
          explanation: 'The third shape is a triangle. The square is the second shape.',
        },
        {
          id: 'tf-arrow',
          type: 'trueFalse',
          visual: diagram('A horizontal highlighted arrow pointing to the right, above a thin baseline.', [0, 0, 300, 120], [
            { kind: 'line', x1: 20, y1: 90, x2: 280, y2: 90 },
            { kind: 'arrow', x1: 60, y1: 55, x2: 240, y2: 55, highlight: true },
          ]),
          statement: 'The highlighted arrow points to the right.',
          answer: true,
          explanation: 'The arrowhead is at the right-hand end.',
        },
        {
          id: 'tf-cylinder',
          type: 'trueFalse',
          visual: scene('An upright solid cylinder.', [{ kind: 'cylinder', from: [0, 0, 0], to: [0, 0, 2], radius: 0.8 }]),
          statement: 'This solid has exactly one flat face.',
          answer: false,
          explanation: 'A cylinder has two flat circular faces, one at each end, plus one curved side.',
        },
        {
          id: 'match-shapes',
          type: 'matching',
          prompt: 'Name each marked shape.',
          visual: shapesImage([
            { id: 'A', xPct: 10, yPct: 16 },
            { id: 'B', xPct: 30.5, yPct: 16 },
            { id: 'C', xPct: 50, yPct: 16 },
            { id: 'D', xPct: 66.5, yPct: 16 },
            { id: 'E', xPct: 90, yPct: 16 },
          ]),
          prompts: [
            { id: 'A', text: 'Shape A' },
            { id: 'B', text: 'Shape B' },
            { id: 'C', text: 'Shape C' },
            { id: 'D', text: 'Shape D' },
            { id: 'E', text: 'Shape E' },
          ],
          options: ['circle', 'square', 'triangle', 'hexagon', 'star', 'pentagon', 'ellipse', 'rhombus'],
          answers: { A: 'circle', B: 'square', C: 'triangle', D: 'hexagon', E: 'star' },
          explanation: 'Pentagon, ellipse and rhombus are decoys: none of those shapes appears.',
        },
        {
          id: 'recall-cube',
          type: 'recall',
          responseMode: 'sketch',
          prompt: 'On paper, sketch a cube with a sphere at every corner and one sphere at the centre.',
          referenceVisual: cubeWithCenter(false),
          keyPoints: ['Eight corner spheres, one per corner.', 'One sphere exactly in the middle.', 'No spheres on the faces or edges.'],
        },
      ],
    },
    {
      id: 'shapes-rapid',
      title: 'PLACEHOLDER Rapid shapes round',
      instructions: 'Eight picture cards, a few seconds each. Answers are shown at the end.',
      feedbackMode: 'end',
      presentationMode: 'rapidVisual',
      items: [
        {
          id: 'rapid-1',
          type: 'singleChoice',
          displaySeconds: 8,
          prompt: 'Name the solid.',
          visual: scene('A solid rectangular box.', [{ kind: 'box', center: [0, 0, 0], size: [2, 1.2, 1] }]),
          options: [
            { id: 'box', text: 'Box' },
            { id: 'sphere', text: 'Sphere' },
            { id: 'cylinder', text: 'Cylinder' },
          ],
          correctOptionId: 'box',
          explanation: 'Six flat rectangular faces: a box.',
        },
        {
          id: 'rapid-2',
          type: 'trueFalse',
          displaySeconds: 6,
          visual: ballImage,
          statement: 'This picture shows a ball.',
          answer: true,
          explanation: 'It is a shaded ball resting on a surface.',
        },
        {
          id: 'rapid-3',
          type: 'singleChoice',
          displaySeconds: 8,
          prompt: 'How many of these shapes have only straight edges?',
          visual: shapesImage(),
          options: [
            { id: 'two', text: '2' },
            { id: 'three', text: '3' },
            { id: 'four', text: '4' },
            { id: 'five', text: '5' },
          ],
          correctOptionId: 'four',
          explanation: 'Square, triangle, hexagon and star have straight edges; only the circle is curved.',
        },
        {
          id: 'rapid-4',
          type: 'singleChoice',
          displaySeconds: 8,
          prompt: 'Name the solid.',
          visual: scene('An upright solid cylinder.', [{ kind: 'cylinder', from: [0, 0, 0], to: [0, 0, 2], radius: 0.8 }]),
          options: [
            { id: 'cylinder', text: 'Cylinder' },
            { id: 'cone', text: 'Cone' },
            { id: 'box', text: 'Box' },
          ],
          correctOptionId: 'cylinder',
          explanation: 'Two circular flat ends joined by a curved side: a cylinder.',
        },
        {
          id: 'rapid-5',
          type: 'trueFalse',
          displaySeconds: 6,
          visual: diagram('An arrow pointing straight up.', [0, 0, 200, 200], [{ kind: 'arrow', x1: 100, y1: 180, x2: 100, y2: 30 }]),
          statement: 'The arrow points down.',
          answer: false,
          explanation: 'The arrowhead is at the top, so it points up.',
        },
        {
          id: 'rapid-6',
          type: 'singleChoice',
          displaySeconds: 8,
          prompt: 'How many spheres are at the corners of this cube?',
          visual: cubeWithCenter(false),
          options: [
            { id: 'four', text: '4' },
            { id: 'six', text: '6' },
            { id: 'eight', text: '8' },
            { id: 'nine', text: '9' },
          ],
          correctOptionId: 'eight',
          explanation: 'A cube has 8 corners. (The ninth sphere is at the centre, not a corner.)',
        },
        {
          id: 'rapid-7',
          type: 'trueFalse',
          displaySeconds: 6,
          visual: scene('A single flat square plane, drawn at an angle.', [{ kind: 'plane', origin: [-1, -1, 0], u: [2, 0, 0], v: [0, 2, 0] }]),
          statement: 'This object has thickness.',
          answer: false,
          explanation: 'It is a flat plane: it has length and width but no thickness.',
        },
        {
          id: 'rapid-8',
          type: 'singleChoice',
          displaySeconds: 10,
          prompt: 'Which shape is highlighted?',
          visual: diagram('A circle, a rectangle, and a highlighted point, side by side.', [0, 0, 360, 140], [
            { kind: 'circle', x: 60, y: 70, radius: 36 },
            { kind: 'rect', x: 140, y: 34, width: 90, height: 72 },
            { kind: 'point', x: 300, y: 70, label: 'P', highlight: true },
          ]),
          options: [
            { id: 'circle', text: 'The circle' },
            { id: 'rect', text: 'The rectangle' },
            { id: 'point', text: 'The point' },
          ],
          correctOptionId: 'point',
          explanation: 'The point P is drawn in the highlight colour.',
        },
      ],
    },
  ],
};

writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${out}`);

// ---- Derived test fixtures (E2E and unit tests) ------------------------------------------
const write = (dir, name, data) => {
  mkdirSync(resolve(root, dir), { recursive: true });
  writeFileSync(resolve(root, dir, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${dir}/${name}`);
};
const variant = (mutate) => {
  const copy = structuredClone(fixture);
  mutate(copy);
  return copy;
};
const itemById = (t, id) => t.quickCheckSets[0].items.find((i) => i.id === id);

// A v2 file with only rapid checks: no problems, formulas or conversions.
write(
  'tests/fixtures/v2',
  'rapid-only.json',
  variant((t) => {
    t.id = 'placeholder-rapid-only';
    t.title = 'PLACEHOLDER Rapid-only visual checks';
    delete t.problems;
    delete t.formulaSheet;
    delete t.conversions;
  }),
);

// One broken file per SOW §8 "readable local validation error" case.
write('tests/fixtures/invalid-v2', 'bad-visual-asset.json', variant((t) => (itemById(t, 'tf-third-shape').visual.data = Buffer.from('<svg onload="alert(1)"/>').toString('base64'))));
write('tests/fixtures/invalid-v2', 'invalid-callout.json', variant((t) => (itemById(t, 'match-shapes').visual.callouts[4].xPct = 120)));
write('tests/fixtures/invalid-v2', 'undersized-label-bank.json', variant((t) => (itemById(t, 'match-shapes').options = ['circle', 'square', 'triangle', 'hexagon'])));
write('tests/fixtures/invalid-v2', 'duplicate-answer-target.json', variant((t) => (itemById(t, 'match-shapes').answers.B = 'circle')));
write('tests/fixtures/invalid-v2', 'unsupported-item-type.json', variant((t) => (itemById(t, 'identify-sphere').type = 'essay')));
