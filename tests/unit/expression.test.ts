import { describe, expect, it } from 'vitest';
import { EvaluationError, ExpressionNode, ExpressionStructureError } from '../../src/engine/expression';

const n = (value: number) => ({ op: 'number' as const, value });
const s = (slot: string) => ({ op: 'slot' as const, slot });

describe('ExpressionNode', () => {
  it('evaluates every supported operator', () => {
    const cases: [object, number][] = [
      [{ op: 'add', args: [n(1), n(2), n(3)] }, 6],
      [{ op: 'subtract', args: [n(5), n(2)] }, 3],
      [{ op: 'multiply', args: [n(2), n(3), n(4)] }, 24],
      [{ op: 'divide', args: [n(9), n(3)] }, 3],
      [{ op: 'power', args: [n(2), n(10)] }, 1024],
      [{ op: 'negate', args: [n(4)] }, -4],
      [{ op: 'abs', args: [n(-4)] }, 4],
      [{ op: 'sqrt', args: [n(16)] }, 4],
    ];
    for (const [json, expected] of cases) expect(ExpressionNode.fromJson(json as never).evaluate({})).toBe(expected);
  });

  it('reads slots from the scope and lists them', () => {
    const tree = ExpressionNode.fromJson({ op: 'multiply', args: [s('current'), s('resistance')] });
    expect(tree.evaluate({ current: 0.5, resistance: 24 })).toBe(12);
    expect(tree.slots()).toEqual(['current', 'resistance']);
  });

  it('computes the bolt-area formula', () => {
    const tree = ExpressionNode.fromJson({
      op: 'divide',
      args: [{ op: 'multiply', args: [n(Math.PI), { op: 'power', args: [s('d'), n(2)] }] }, n(4)],
    });
    expect(tree.evaluate({ d: 10 })).toBeCloseTo(78.53981633974483, 12);
  });

  it('rejects unknown operators and wrong arity with a path', () => {
    expect(() => ExpressionNode.fromJson({ op: 'eval', args: [] } as never)).toThrow(ExpressionStructureError);
    try {
      ExpressionNode.fromJson({ op: 'add', args: [n(1), { op: 'divide', args: [n(1)] }] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionStructureError);
      expect((error as ExpressionStructureError).path).toBe('/args/1/args');
      expect((error as Error).message).toContain('exactly 2');
    }
  });

  it('reports evaluation problems instead of returning bad numbers', () => {
    expect(() => ExpressionNode.fromJson({ op: 'divide', args: [n(1), n(0)] }).evaluate({})).toThrow(EvaluationError);
    expect(() => ExpressionNode.fromJson({ op: 'sqrt', args: [n(-1)] }).evaluate({})).toThrow(/negative/);
    expect(() => ExpressionNode.fromJson(s('missing')).evaluate({})).toThrow(/No value bound/);
    expect(() => ExpressionNode.fromJson({ op: 'power', args: [n(10), n(1000)] }).evaluate({})).toThrow(/finite/);
  });
});
