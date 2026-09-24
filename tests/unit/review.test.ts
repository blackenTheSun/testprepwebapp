import { describe, expect, it } from 'vitest';
import { Attempt } from '../../src/engine/attempt';
import { AttemptExporter } from '../../src/engine/attemptExport';
import { AuthoredPath } from '../../src/engine/authoredPath';
import { ReviewMatcher } from '../../src/engine/review';
import { fixtureTest } from './helpers';

describe('AuthoredPath', () => {
  it('replays every fixture problem with no mismatches', () => {
    for (const test of [fixtureTest('engr206'), fixtureTest('mechanics')]) {
      for (const problem of test.problems) {
        const path = new AuthoredPath(problem);
        for (const result of path.results) {
          expect(result.error, `${problem.id}/${result.step.id}`).toBeUndefined();
          expect(result.mismatch, `${problem.id}/${result.step.id}`).toBe(false);
        }
      }
    }
  });

  it('resolves inputs to authored givens and outputs', () => {
    const problem = fixtureTest('mechanics').problem('bilinear_shear_strain_unloading')!;
    const residual = new AuthoredPath(problem).results.find((r) => r.step.id === 'calculate_residual_shear_strain')!;
    expect(residual.inputs.map((i) => i.variable?.name)).toEqual([
      'Total shear strain at working stress',
      'Elastic recovery strain',
    ]);
    expect(residual.computedValue).toBeCloseTo(0.0185, 12);
  });
});

describe('ReviewMatcher and export', () => {
  it('marks steps whose values Amy reached, including the final answer', () => {
    const problem = fixtureTest('engr206').problem('resistor-voltage-and-power')!;
    const attempt = new Attempt(problem);
    attempt.start();
    const catalog = problem.catalog();
    const get = (id: string) => attempt.store.all().find((v) => v.authoredId === id)!;
    const ohm = attempt.addStep(
      catalog.get('formula:ohms_law_voltage')!,
      { current: get('branch_current').id, resistance: get('resistor_value').id },
      { name: 'v', symbol: 'v' },
    );
    const vId = ohm.ok ? ohm.step.outputIds[0] : '';
    attempt.addStep(catalog.get('final:answer')!, { answer: vId }, { name: '', symbol: '' });
    attempt.finish();

    const matches = new ReviewMatcher(attempt).matches();
    expect(matches.map((m) => m.matched)).toEqual([true, false, false]);

    const exporter = new AttemptExporter(attempt);
    const exported = exporter.toJson(new Date('2026-01-01T00:00:00Z'));
    expect(exported.apiVersion).toBe('guided-test-attempt.local/v1');
    expect((exported.steps as unknown[]).length).toBe(2);
    expect(exported.finalAnswerVariableId).toBe(vId);
    expect(exporter.fileName()).toBe('attempt-engr206-local-practice-01-resistor-voltage-and-power.json');
  });

  it('matches a derivative step when Amy applied that action', () => {
    const problem = fixtureTest('engr206').problem('differentiate-position')!;
    const attempt = new Attempt(problem);
    attempt.start();
    const op = problem.catalog().get('derivative:differentiate-position-x')!;
    const d = attempt.addStep(op, {}, attempt.suggestName(op));
    attempt.addStep(problem.catalog().get('final:answer')!, { answer: d.ok ? d.step.outputIds[1] : '' }, { name: '', symbol: '' });
    attempt.finish();
    expect(new ReviewMatcher(attempt).matches().map((m) => m.matched)).toEqual([true, true]);
  });
});
