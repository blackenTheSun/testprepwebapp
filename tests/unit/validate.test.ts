import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestFileLoader } from '../../src/contract/loader';
import type { TestFileJson } from '../../src/contract/types';
import { TestFileValidator } from '../../src/contract/validate';
import { clone, loadFixture, readRepoFile } from './helpers';

const validator = new TestFileValidator();

function issuesAfter(mutate: (t: TestFileJson) => void, fixture: 'engr206' | 'mechanics' = 'engr206') {
  const data = clone(loadFixture(fixture));
  mutate(data);
  return validator.validate(data);
}

describe('TestFileValidator', () => {
  it('accepts both supplied fixtures with no errors or warnings', () => {
    for (const name of ['engr206', 'mechanics'] as const) {
      const report = validator.validate(loadFixture(name));
      expect(report.issues, name).toEqual([]);
    }
  });

  it('reports schema problems with JSON paths', () => {
    const report = issuesAfter((t) => {
      delete (t.problems[0] as Partial<(typeof t.problems)[0]>).target;
      (t.problems[0].visual as { primitives: unknown[] }).primitives[1] = { kind: 'voltageSource', x: 1, y: 2 };
    });
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/problems/0', message: 'Missing required field "target"' }),
        expect.objectContaining({ path: '/problems/0/visual/primitives/1', message: 'Missing required field "radius"' }),
      ]),
    );
    expect(report.errors.some((e) => e.message.includes('"then"'))).toBe(false);
  });

  it('rejects wrong expression arity through the schema', () => {
    const report = issuesAfter((t) => {
      t.formulaSheet[0].calculation.ast.args![1].args!.pop();
    });
    expect(report.errors[0].path).toBe('/formulaSheet/0/calculation/ast/args/1/args');
  });

  it('rejects unknown and disallowed references', () => {
    const report = issuesAfter((t) => {
      t.problems[0].allowedFormulaIds.push('does_not_exist');
      t.problems[1].solutionPath[0].formulaId = 'voltage_divider';
      t.problems[2].solutionPath[0].derivativeId = 'nope';
    });
    const messages = report.errors.map((e) => `${e.path} ${e.message}`);
    expect(messages).toContain('/problems/0/allowedFormulaIds/1 Formula "does_not_exist" is not in the formula sheet');
    expect(messages).toContain('/problems/1/solutionPath/0/formulaId Formula "voltage_divider" is used here but missing from allowedFormulaIds');
    expect(messages.some((m) => m.startsWith('/problems/2/solutionPath/0/derivativeId'))).toBe(true);
  });

  it('rejects bindings to later or unknown values, and wrong binding keys', () => {
    const report = issuesAfter((t) => {
      const path = t.problems[0].solutionPath;
      path[1].bindings = { left: 'r1', right: 'total_resistance' }; // defined later
      path[2].bindings = { sourceVoltage: 'source_voltage', loadResistance: 'r2_ohm' }; // missing key
      path[3].bindings = { result: 'node_a_voltage' }; // wrong key
    });
    const messages = report.errors.map((e) => `${e.path} ${e.message}`);
    expect(messages).toContain('/problems/0/solutionPath/1/bindings/right "total_resistance" is not a given or an output of an earlier step');
    expect(messages.some((m) => m.includes('Missing binding "totalResistance"'))).toBe(true);
    expect(messages.some((m) => m.includes('Unexpected binding "result"'))).toBe(true);
  });

  it('rejects formulas that use slots they do not declare, and duplicate ids', () => {
    const report = issuesAfter((t) => {
      t.formulaSheet[1].calculation.ast.args![0].slot = 'voltage';
      t.problems[1].givens[1].id = 'branch_current';
    });
    const messages = report.errors.map((e) => e.message);
    expect(messages).toContain('Uses slot "voltage", which is not one of this formula\'s inputs');
    expect(messages.some((m) => m.startsWith('Duplicate value id "branch_current"'))).toBe(true);
  });

  it('warns (without blocking) when an authored value is wrong', () => {
    const report = issuesAfter((t) => {
      t.problems[0].solutionPath[1].output!.value = 3001;
    }, 'engr206');
    expect(report.ok).toBe(true);
    // The slip is reported where it happens; the next step (which consumed 3001) is flagged too.
    expect(report.warnings[0]).toEqual(
      expect.objectContaining({
        path: '/problems/0/solutionPath/1/output/value',
        message: 'Answer key says 3001, but the app calculates 3000 from the bound inputs',
      }),
    );
    expect(report.warnings.map((w) => w.path)).toEqual([
      '/problems/0/solutionPath/1/output/value',
      '/problems/0/solutionPath/2/output/value',
    ]);
  });

  it('warns about givens without a numeric value', () => {
    const report = issuesAfter((t) => {
      delete t.problems[1].givens[0].value;
    });
    expect(report.warnings.some((w) => w.path === '/problems/1/givens/0/value')).toBe(true);
  });
});

describe('TestFileLoader', () => {
  const loader = new TestFileLoader();

  it('reports JSON syntax errors with line and column', () => {
    const result = loader.fromText('{\n  "a": 1,\n  oops\n}', 'bad.json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toMatch(/^Not valid JSON: .*line 3/);
  });

  it('loads a fixture from text', () => {
    const result = loader.fromText(readRepoFile('docs/handoff/mechanics-of-materials.local.test.example.json'), 'm.json');
    expect(result.ok && result.test.problems.map((p) => p.id)).toEqual([
      'double_shear_bolt_group',
      'axial_bar_elongation_and_strain',
      'bilinear_shear_strain_unloading',
    ]);
  });

  it('rejects every file in tests/fixtures/invalid', () => {
    const dir = resolve(__dirname, '../fixtures/invalid');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const result = loader.fromText(readRepoFile(`tests/fixtures/invalid/${file}`), file);
      expect(result.ok, file).toBe(false);
    }
  });
});

describe('schema copies', () => {
  it('keeps the published contract identical to the one compiled into the app', () => {
    expect(readRepoFile('docs/handoff/test-file.local.v1.schema.json')).toBe(readRepoFile('src/contract/test-file.local.v1.schema.json'));
  });
});
