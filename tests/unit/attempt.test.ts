import { describe, expect, it } from 'vitest';
import { Attempt } from '../../src/engine/attempt';
import { Session } from '../../src/engine/session';
import { FakeClock, fixtureTest } from './helpers';

function started(problemId: string, fixture: 'engr206' | 'mechanics' = 'engr206') {
  const clock = new FakeClock();
  const problem = fixtureTest(fixture).problem(problemId)!;
  const attempt = new Attempt(problem, clock.read);
  attempt.start();
  return { attempt, clock, problem };
}

const byAuthored = (attempt: Attempt, id: string) => attempt.store.all().find((v) => v.authoredId === id)!;

describe('Attempt', () => {
  it('turns givens into variables with stable ids', () => {
    const { attempt } = started('voltage-divider-conversion');
    expect(attempt.store.all().map((v) => v.id)).toEqual(['var_0001', 'var_0002', 'var_0003']);
    expect(byAuthored(attempt, 'r2_kohm').describe()).toBe('Resistor R2 (R_2) = 2 kΩ');
  });

  it('requires Start before steps can be added', () => {
    const problem = fixtureTest('engr206').problem('voltage-divider-conversion')!;
    const attempt = new Attempt(problem);
    const op = problem.catalog().get('math:add')!;
    const result = attempt.addStep(op, {}, attempt.suggestName(op));
    expect(result).toEqual({ ok: false, error: 'Press Start to begin working.' });
  });

  it('completes the voltage-divider path with conversion, basic math, formula and final answer', () => {
    const { attempt, problem } = started('voltage-divider-conversion');
    const catalog = problem.catalog();

    const convert = catalog.get('conversion:kohm_to_ohm')!;
    expect(attempt.suggestName(convert)).toEqual({ name: 'Resistance 1', symbol: 'R_{1}' });
    const c = attempt.addStep(convert, { value: byAuthored(attempt, 'r2_kohm').id }, attempt.suggestName(convert));
    expect(c.ok).toBe(true);
    const r2 = attempt.store.get(c.ok ? c.step.outputIds[0] : '')!;
    expect(r2.value).toBe(2000);
    expect(r2.unit).toBe('ohm');

    // Rename, then reuse the renamed variable in a later step.
    attempt.rename(r2.id, 'R2 in ohms', 'R_{2}');
    expect(attempt.choicesFor(false).find((v) => v.id === r2.id)!.describe()).toBe('R2 in ohms (R_2) = 2000 Ω');

    const add = catalog.get('math:add')!;
    expect(attempt.suggestName(add)).toEqual({ name: 'Result 1', symbol: 'r_{1}' });
    const sum = attempt.addStep(add, { left: byAuthored(attempt, 'r1').id, right: r2.id }, attempt.suggestName(add));
    const total = attempt.store.get(sum.ok ? sum.step.outputIds[0] : '')!;
    expect(total.value).toBe(3000);
    expect(total.unit).toBe('ohm');

    const divider = catalog.get('formula:voltage_divider')!;
    const v = attempt.addStep(
      divider,
      { sourceVoltage: byAuthored(attempt, 'source_voltage').id, loadResistance: r2.id, totalResistance: total.id },
      { name: 'Node a voltage', symbol: 'V_a' },
    );
    const va = attempt.store.get(v.ok ? v.step.outputIds[0] : '')!;
    expect(va.value).toBe(8);
    expect(va.name).toBe('Node a voltage');

    const final = catalog.get('final:answer')!;
    expect(attempt.addStep(final, { answer: va.id }, attempt.suggestName(final)).ok).toBe(true);
    expect(attempt.finalAnswer?.id).toBe(va.id);
    expect(attempt.steps.map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });

  it('flags unit mismatches without blocking the step', () => {
    const { attempt, problem } = started('voltage-divider-conversion');
    const add = problem.catalog().get('math:add')!;
    const result = attempt.addStep(
      add,
      { left: byAuthored(attempt, 'r1').id, right: byAuthored(attempt, 'r2_kohm').id },
      attempt.suggestName(add),
    );
    expect(result.ok && result.step.hints[0]).toMatch(/convert first/);
  });

  it('reports evaluation errors and creates no variable', () => {
    const { attempt, problem } = started('voltage-divider-conversion');
    const divide = problem.catalog().get('math:divide')!;
    const zero = attempt.store.add({ origin: 'step', name: 'Zero', symbol: 'z', value: 0 });
    const before = attempt.store.all().length;
    const result = attempt.addStep(divide, { left: byAuthored(attempt, 'r1').id, right: zero.id }, attempt.suggestName(divide));
    expect(result).toEqual({ ok: false, error: 'Division by zero' });
    expect(attempt.store.all().length).toBe(before);
  });

  it('applies a pre-authored derivative, producing symbolic and numeric variables', () => {
    const { attempt, problem } = started('differentiate-position');
    const op = problem.catalog().get('derivative:differentiate-position-x')!;
    const result = attempt.addStep(op, {}, attempt.suggestName(op));
    expect(result.ok).toBe(true);
    const [fn, numeric] = (result.ok ? result.step.outputIds : []).map((id) => attempt.store.get(id)!);
    expect(fn.isNumeric).toBe(false);
    expect(fn.latex).toContain('6t + 2');
    expect(numeric.value).toBe(26);
    // Symbolic results are not offered to numeric inputs.
    expect(attempt.choicesFor(false)).not.toContain(fn);
    expect(attempt.choicesFor(true)).toContain(fn);
  });

  it('undoes the last step', () => {
    const { attempt, problem } = started('resistor-voltage-and-power');
    const ohm = problem.catalog().get('formula:ohms_law_voltage')!;
    attempt.addStep(
      ohm,
      { current: byAuthored(attempt, 'branch_current').id, resistance: byAuthored(attempt, 'resistor_value').id },
      attempt.suggestName(ohm),
    );
    expect(attempt.store.all()).toHaveLength(3);
    attempt.undoLastStep();
    expect(attempt.steps).toHaveLength(0);
    expect(attempt.store.all()).toHaveLength(2);
  });
});

describe('StudyTimer via Attempt', () => {
  it('starts, pauses, resumes and finishes permanently', () => {
    const { attempt, clock } = started('resistor-voltage-and-power');
    clock.advance(10_000);
    attempt.pause();
    clock.advance(60_000);
    expect(attempt.timer.elapsedMs()).toBe(10_000);
    expect(attempt.canWork).toBe(false);
    attempt.start();
    clock.advance(5_000);
    attempt.finish();
    clock.advance(99_000);
    expect(attempt.timer.elapsedMs()).toBe(15_000);
    attempt.start();
    expect(attempt.timer.state).toBe('finished');
    expect(attempt.revealedCount).toBe(1);
  });
});

describe('Session', () => {
  it('resets only the chosen problem and pauses when leaving a problem', () => {
    const test = fixtureTest('engr206');
    const clock = new FakeClock();
    const session = new Session(test, [], 'x.json', clock.read);
    session.openProblem('resistor-voltage-and-power');
    const first = session.activeAttempt!;
    first.start();
    session.openProblem('differentiate-position');
    expect(first.timer.state).toBe('paused');
    const second = session.activeAttempt!;
    session.resetProblem('resistor-voltage-and-power');
    expect(session.attemptFor(test.problem('resistor-voltage-and-power')!)).not.toBe(first);
    expect(session.activeAttempt).toBe(second);
    expect(session.test).toBe(test);
  });
});
