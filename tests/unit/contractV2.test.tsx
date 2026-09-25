import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs build script without type declarations
import { composedText } from '../../scripts/compose-v2-schema.mjs';
import { TestFileValidator } from '../../src/contract/contracts';
import { inspectRaster } from '../../src/contract/imageInfo';
import { TestFileLoader } from '../../src/contract/loader';
import { IMAGE_MAX_BYTES } from '../../src/contract/rulesV2';
import type { ImageVisualJson, MatchingItemJson, TestFileV2Json } from '../../src/contract/types';
import { EvaluationError, ExpressionNode } from '../../src/engine/expression';
import { AuthoredPath } from '../../src/engine/authoredPath';
import { TestFile } from '../../src/engine/testFile';
import { Scene3D } from '../../src/render/scene3d';
import { clone, loadFixture, readRepoFile } from './helpers';

const root = resolve(__dirname, '../..');
const PLACEHOLDER = 'docs/handoff/v0.3/placeholder-visual-checks.test.example.json';
const validator = new TestFileValidator();

function placeholder(): TestFileV2Json {
  return JSON.parse(readRepoFile(PLACEHOLDER)) as TestFileV2Json;
}

/** Mutate a copy of the placeholder fixture and return its error/warning messages with paths. */
function issuesAfter(mutate: (t: TestFileV2Json) => void) {
  const data = clone(placeholder());
  mutate(data);
  const report = validator.validate(data);
  return {
    report,
    errors: report.errors.map((e) => `${e.path} ${e.message}`),
    warnings: report.warnings.map((e) => `${e.path} ${e.message}`),
  };
}

const standardItems = (t: TestFileV2Json) => t.quickCheckSets![0].items;
const matching = (t: TestFileV2Json) => standardItems(t).find((i) => i.type === 'matching') as MatchingItemJson;
const firstImage = (t: TestFileV2Json) => standardItems(t).find((i) => i.id === 'tf-third-shape')!.visual as ImageVisualJson;

describe('guided-test-file.local/v2 contract', () => {
  it('accepts the placeholder proof fixture with no issues, including its degree-trig answer key', () => {
    const { report, file } = validator.validateAndNormalize(placeholder());
    expect(report.issues).toEqual([]);
    const test = new TestFile(file!);
    expect(test.quickCheckSets.map((s) => [s.id, s.items.length])).toEqual([
      ['shapes-standard', 8],
      ['shapes-rapid', 8],
      ['labels-reuse', 1],
    ]);
    const path = new AuthoredPath(test.problems[0]);
    expect(path.results[0].computedValue).toBeCloseTo(2, 12);
    expect(path.results[0].mismatch).toBe(false);
  });

  it('meets the SOW §7 proof-fixture minimums', () => {
    const sets = placeholder().quickCheckSets!;
    const items = sets.flatMap((s) => s.items);
    expect(items.filter((i) => i.type === 'singleChoice' && i.visual).length).toBeGreaterThanOrEqual(2);
    expect(items.filter((i) => i.type === 'trueFalse').length).toBeGreaterThanOrEqual(3);
    const match = items.find((i) => i.type === 'matching') as MatchingItemJson;
    expect(match.prompts).toHaveLength(5);
    expect(match.options.length).toBeGreaterThanOrEqual(8);
    expect(sets.some((s) => s.presentationMode === 'rapidVisual' && s.items.length === 8)).toBe(true);
    expect(items.filter((i) => i.type === 'recall')).toHaveLength(1);
    expect(JSON.stringify(placeholder().formulaSheet)).toContain('"angleUnit":"deg"');
  });

  it('keeps v1 files valid and unchanged in behaviour', () => {
    for (const name of ['engr206', 'mechanics'] as const) expect(validator.validate(loadFixture(name)).issues).toEqual([]);
  });

  it('opens a rapid-only file, and rejects a file with no activities', () => {
    expect(issuesAfter((t) => delete t.problems).errors).toEqual([]);
    expect(
      issuesAfter((t) => {
        delete t.problems;
        t.quickCheckSets = [];
      }).errors,
    ).toEqual(['/ A v2 test needs at least one worked problem ("problems") or quick-check set ("quickCheckSets")']);
  });

  it('rejects every file in tests/fixtures/invalid-v2 and loads the rapid-only fixture', () => {
    const loader = new TestFileLoader();
    const dir = resolve(root, 'tests/fixtures/invalid-v2');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(5);
    for (const file of files) expect(loader.fromText(readRepoFile(`tests/fixtures/invalid-v2/${file}`), file).ok, file).toBe(false);
    const rapidOnly = loader.fromText(readRepoFile('tests/fixtures/v2/rapid-only.json'), 'rapid-only.json');
    expect(rapidOnly.ok && rapidOnly.test.problems.length).toBe(0);
    expect(rapidOnly.ok && rapidOnly.test.quickCheckSets.length).toBe(3);
  });

  it('names the supported versions for an unknown apiVersion', () => {
    const report = validator.validate({ ...placeholder(), apiVersion: 'guided-test-file.local/v9' });
    expect(report.errors[0].message).toBe(
      'Unsupported apiVersion "guided-test-file.local/v9"; supported: "guided-test-file.local/v1", "guided-test-file.local/v2"',
    );
  });

  it('rejects the unsupported item type', () => {
    const { errors } = issuesAfter((t) => {
      (standardItems(t)[0] as { type: string }).type = 'essay';
    });
    expect(errors).toContain('/quickCheckSets/0/items/0/type Must be one of: "singleChoice", "trueFalse", "matching", "recall"');
  });
});

describe('visual asset validation', () => {
  it('rejects data that is not a PNG/JPEG, and a type mismatch', () => {
    expect(issuesAfter((t) => (firstImage(t).data = btoa('<svg onload="alert(1)"/>'))).errors).toContain(
      '/quickCheckSets/0/items/3/visual/data Unsupported image data: only PNG and JPEG pictures are allowed',
    );
    expect(issuesAfter((t) => (firstImage(t).mediaType = 'image/jpeg')).errors).toContain(
      '/quickCheckSets/0/items/3/visual/mediaType Declared image/jpeg, but the data is image/png',
    );
  });

  it('rejects remote URLs, local paths and data: URIs', () => {
    expect(issuesAfter((t) => (firstImage(t).data = 'https://example.com/a.png')).errors[0]).toMatch(/visual\/data Must be raw base64 image data/);
    expect(issuesAfter((t) => (firstImage(t).data = `data:image/png;base64,${firstImage(t).data}`)).errors[0]).toMatch(/Must be raw base64/);
    expect(
      issuesAfter((t) => {
        (firstImage(t) as unknown as Record<string, unknown>).src = 'C:/pictures/a.png';
      }).errors,
    ).toContain('/quickCheckSets/0/items/3/visual Unexpected field "src"');
    expect(issuesAfter((t) => ((firstImage(t) as { mediaType: string }).mediaType = 'image/svg+xml')).errors[0]).toMatch(/Must be one of: "image\/png", "image\/jpeg"/);
  });

  it('rejects missing or blank alt text', () => {
    expect(issuesAfter((t) => delete (firstImage(t) as Partial<ImageVisualJson>).altText).errors).toContain(
      '/quickCheckSets/0/items/3/visual Missing required field "altText"',
    );
    expect(issuesAfter((t) => (firstImage(t).altText = '   ')).errors).toContain('/quickCheckSets/0/items/3/visual/altText Alt text must not be blank');
  });

  it('enforces the per-image size limit', () => {
    const big = 'A'.repeat(Math.ceil((IMAGE_MAX_BYTES * 4) / 3) + 8);
    expect(issuesAfter((t) => (firstImage(t).data = big)).errors[0]).toMatch(/Image is 1\.5 MB; the limit is 1\.5 MB|Image is .* the limit is 1\.5 MB/);
  });

  it('warns when the declared size has a different shape from the picture', () => {
    expect(issuesAfter((t) => (firstImage(t).height = 400)).warnings[0]).toMatch(/callouts may land in the wrong place/);
  });

  it('rejects an oversize file before parsing it', () => {
    const result = new TestFileLoader().fromText(' '.repeat(20 * 1024 * 1024 + 1), 'huge.json');
    expect(!result.ok && result.errors[0].message).toMatch(/^The file is 20\.0 MB; the limit is 20\.0 MB/);
  });

  it('reads PNG and JPEG sizes', () => {
    const png = inspectRaster(new Uint8Array(readFileSync(resolve(root, 'tests/fixtures/images/shapes-lineup.png'))));
    const jpg = inspectRaster(new Uint8Array(readFileSync(resolve(root, 'tests/fixtures/images/shaded-ball.jpg'))));
    expect(png).toMatchObject({ type: 'image/png', width: 400, height: 160 });
    expect(jpg).toMatchObject({ type: 'image/jpeg', width: 200, height: 200 });
  });
});

describe('callouts and matching', () => {
  it('rejects a duplicate callout id and a coordinate outside the canvas', () => {
    expect(issuesAfter((t) => ((matching(t).visual as ImageVisualJson).callouts![1].id = 'A')).errors).toContain(
      '/quickCheckSets/0/items/6/visual/callouts/1/id Duplicate callout id "A"',
    );
    expect(issuesAfter((t) => ((matching(t).visual as ImageVisualJson).callouts![0].xPct = 120)).errors).toContain(
      '/quickCheckSets/0/items/6/visual/callouts/0/xPct Must be at most 100',
    );
  });

  it('rejects a label bank smaller than the callout count', () => {
    expect(issuesAfter((t) => (matching(t).options = ['circle', 'square', 'triangle', 'hexagon'])).errors).toContain(
      '/quickCheckSets/0/items/6/options The label bank has 4 term(s) but there are 5 callouts; it must be at least as large',
    );
  });

  it('rejects a missing answer, an answer outside the bank, and a reused correct label', () => {
    const { errors } = issuesAfter((t) => {
      const m = matching(t);
      delete m.answers.E;
      m.answers.D = 'octagon';
      m.answers.B = 'circle';
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        '/quickCheckSets/0/items/6/answers Missing answer for callout "E"',
        '/quickCheckSets/0/items/6/answers/D "octagon" is not in the label bank',
        '/quickCheckSets/0/items/6/answers/B "circle" is already the correct label for callout "A"; each label can be correct only once (set "allowReuse": true to allow this)',
      ]),
    );
  });

  it('accepts a label that is correct for several callouts only when allowReuse is set', () => {
    const reuse = (t: TestFileV2Json) => t.quickCheckSets![2].items[0] as MatchingItemJson;
    expect(issuesAfter(() => undefined).errors).toEqual([]);
    expect(issuesAfter((t) => delete reuse(t).allowReuse).errors).toEqual([
      '/quickCheckSets/2/items/0/answers/C "rectangle" is already the correct label for callout "A"; each label can be correct only once (set "allowReuse": true to allow this)',
    ]);
  });

  it('rejects duplicate terms, prompts without callouts, and pair visuals', () => {
    expect(issuesAfter((t) => (matching(t).options[7] = 'circle')).errors).toContain('/quickCheckSets/0/items/6/options/7 Duplicate term "circle" in the label bank');
    expect(issuesAfter((t) => (matching(t).prompts[4].id = 'Z')).errors).toEqual(
      expect.arrayContaining(['/quickCheckSets/0/items/6/prompts Callout "E" has no prompt', '/quickCheckSets/0/items/6/prompts/4/id Prompt "Z" has no matching callout on the visual']),
    );
    expect(
      issuesAfter((t) => {
        matching(t).visual = standardItems(t).find((i) => i.id === 'compare-panels')!.visual!;
      }).errors,
    ).toContain('/quickCheckSets/0/items/6/visual/kind Diagram-label matching needs a single typedScene or image visual, not a pair');
  });
});

describe('other item rules', () => {
  it('rejects duplicate option ids and a missing correct option', () => {
    const { errors } = issuesAfter((t) => {
      const item = standardItems(t)[0];
      if (item.type !== 'singleChoice') throw new Error('fixture changed');
      item.options[1].id = 'sphere';
      item.correctOptionId = 'torus';
    });
    expect(errors).toEqual(['/quickCheckSets/0/items/0/options/1/id Duplicate option id "sphere"', '/quickCheckSets/0/items/0/correctOptionId "torus" is not one of this item\'s option ids']);
  });

  it('requires a key for recall items and a visual on rapidVisual cards', () => {
    expect(
      issuesAfter((t) => {
        const item = standardItems(t)[7];
        if (item.type === 'recall') delete item.keyPoints;
      }).errors,
    ).toEqual(['/quickCheckSets/0/items/7 A recall item needs a "modelAnswer" or "keyPoints" for Amy to compare against']);
    expect(
      issuesAfter((t) => {
        const item = t.quickCheckSets![1].items[0];
        if (item.type === 'singleChoice') delete item.visual;
      }).errors,
    ).toEqual(['/quickCheckSets/1/items/0/visual Items in a rapidVisual set must have a visual']);
  });

  it('rejects duplicate set and item ids', () => {
    const { errors } = issuesAfter((t) => {
      t.quickCheckSets![1].id = 'shapes-standard';
      standardItems(t)[1].id = standardItems(t)[0].id;
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        '/quickCheckSets/1/id Duplicate quick-check set id "shapes-standard" (first used at /quickCheckSets/0/id)',
        '/quickCheckSets/0/items/1/id Duplicate item id "identify-sphere" in this set (first used at /quickCheckSets/0/items/0/id)',
      ]),
    );
  });

  it('requires angleUnit on trig in formulas', () => {
    const { errors } = issuesAfter((t) => delete t.formulaSheet![0].calculation.ast.args![1].angleUnit);
    expect(errors).toContain('/formulaSheet/0/calculation/ast/args/1 Missing required field "angleUnit"');
  });

  it('keeps the published and compiled v2 schemas identical and in sync with the composer', () => {
    const composed = composedText();
    expect(readRepoFile('src/contract/test-file.local.v2.schema.json')).toBe(composed);
    expect(readRepoFile('docs/handoff/test-file.local.v2.schema.json')).toBe(composed);
  });
});

describe('trigonometry', () => {
  const trig = (op: string, value: number, angleUnit: 'deg' | 'rad') =>
    ExpressionNode.fromJson({ op: op as never, angleUnit, args: [{ op: 'number', value }] }).evaluate({});

  it('evaluates in degrees and radians', () => {
    expect(trig('sin', 30, 'deg')).toBeCloseTo(0.5, 12);
    expect(trig('cos', 60, 'deg')).toBeCloseTo(0.5, 12);
    expect(trig('tan', 45, 'deg')).toBeCloseTo(1, 12);
    expect(trig('sin', Math.PI / 6, 'rad')).toBeCloseTo(0.5, 12);
    expect(trig('asin', 0.5, 'deg')).toBeCloseTo(30, 10);
    expect(trig('acos', 0.5, 'rad')).toBeCloseTo(Math.PI / 3, 12);
    expect(trig('atan', 1, 'deg')).toBeCloseTo(45, 10);
  });

  it('reports domain problems readably', () => {
    expect(() => trig('asin', 2, 'deg')).toThrow(EvaluationError);
    expect(() => trig('acos', -1.5, 'rad')).toThrow(/between -1 and 1/);
    expect(() => trig('tan', 90, 'deg')).toThrow(/tan is undefined at 90 degrees/);
    expect(() => ExpressionNode.fromJson({ op: 'sin', args: [{ op: 'number', value: 1 }] })).toThrow(/angleUnit/);
  });
});

describe('scene3d additions', () => {
  it('draws spheres and wireframe boxes', () => {
    const html = renderToStaticMarkup(
      <Scene3D
        visual={{
          type: 'scene3d/v1',
          altText: 'cell',
          camera: { azimuthDeg: -40, elevationDeg: 24 },
          objects: [
            { kind: 'box', center: [0, 0, 0], size: [2, 2, 2], wireframe: true },
            { kind: 'sphere', center: [1, 1, 1], radius: 0.3 },
            { kind: 'sphere', center: [0, 0, 0], radius: 0.3, highlight: true },
          ],
        }}
      />,
    );
    expect(html.match(/class="sc-item sc-wire"/g)).toHaveLength(12);
    expect(html.match(/sc-sphere-body/g)).toHaveLength(2);
    expect(html).toContain('sc-highlight sc-sphere');
    expect(html).not.toContain('sc-solid');
  });
});
