import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  formatNumber,
  formatNumberLatex,
  formatUnit,
  latexToPlain,
  nearlyEqual,
  numberedSymbol,
  prettifyLabel,
  splitSubscripts,
} from '../../src/engine/format';

describe('format helpers', () => {
  it('formats numbers to 6 significant digits', () => {
    expect(formatNumber(190.9859317102744)).toBe('190.986');
    expect(formatNumber(0.023125)).toBe('0.023125');
    expect(formatNumber(0.0005)).toBe('5e-4');
    expect(formatNumber(120000)).toBe('120000');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumberLatex(0.0005)).toBe('5 \\times 10^{-4}');
  });

  it('formats units', () => {
    expect(formatUnit('ohm')).toBe('Ω');
    expect(formatUnit('kohm')).toBe('kΩ');
    expect(formatUnit('mm^2')).toBe('mm²');
    expect(formatUnit('N/mm^2')).toBe('N/mm²');
    expect(formatUnit(undefined)).toBe('');
  });

  it('converts LaTeX symbols to plain text', () => {
    expect(latexToPlain('\\tau_{avg}')).toBe('τ_avg');
    expect(latexToPlain('\\Delta\\gamma_p')).toBe('Δγ_p');
    expect(latexToPlain('V_{in}')).toBe('V_in');
  });

  it('numbers symbols', () => {
    expect(numberedSymbol('V', 1)).toBe('V_{1}');
    expect(numberedSymbol('V_{out}', 2)).toBe('V_{out,2}');
    expect(numberedSymbol('R_T', 3)).toBe('R_{T,3}');
  });

  it('prettifies diagram labels', () => {
    expect(prettifyLabel('tau_y = 250 MPa')).toBe('τ_y = 250 MPa');
    expect(prettifyLabel('R_2 = 2 kohm')).toBe('R_2 = 2 kΩ');
    expect(prettifyLabel('beta')).toBe('β');
    expect(splitSubscripts('R_1 = 5')).toEqual([
      { text: 'R', sub: false },
      { text: '1', sub: true },
      { text: ' = 5', sub: false },
    ]);
  });

  it('formats elapsed time and compares numbers', () => {
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(nearlyEqual(1, 1 + 1e-9)).toBe(true);
    expect(nearlyEqual(1, 1.01)).toBe(false);
  });
});
