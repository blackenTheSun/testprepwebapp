/** Display helpers shared by the engine (auto names, dropdown text) and the UI. */

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

/** Significant digits used for displayed values. */
const DISPLAY_PRECISION = 6;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e7) return String(Number.parseFloat(value.toPrecision(DISPLAY_PRECISION)));
  const [mantissa, exponent] = value.toExponential(DISPLAY_PRECISION - 1).split('e');
  return `${String(Number.parseFloat(mantissa))}e${Number.parseInt(exponent, 10)}`;
}

/** Same as {@link formatNumber} but as LaTeX, e.g. `5 \times 10^{-4}`. */
export function formatNumberLatex(value: number): string {
  const plain = formatNumber(value);
  const match = /^(-?[\d.]+)e(-?\d+)$/.exec(plain);
  return match ? `${match[1]} \\times 10^{${match[2]}}` : plain;
}

const UNIT_WORDS: Record<string, string> = { ohm: 'Ω', kohm: 'kΩ', Mohm: 'MΩ', mohm: 'mΩ' };
const SUPERSCRIPT: Record<string, string> = { '2': '²', '3': '³', '-1': '⁻¹', '-2': '⁻²' };

/** Plain-text unit for dropdowns and labels: `ohm` → `Ω`, `mm^2` → `mm²`. */
export function formatUnit(unit: string | undefined): string {
  if (!unit) return '';
  return unit
    .split(/([/*·\s])/)
    .map((part) => {
      const powered = /^([A-Za-z]+)\^(-?\d)$/.exec(part);
      if (powered) return (UNIT_WORDS[powered[1]] ?? powered[1]) + (SUPERSCRIPT[powered[2]] ?? `^${powered[2]}`);
      return UNIT_WORDS[part] ?? part;
    })
    .join('');
}

/** Value with unit, e.g. `12 V`, `78.5398 mm²`. */
export function formatQuantity(value: number, unit?: string): string {
  const u = formatUnit(unit);
  return u ? `${formatNumber(value)} ${u}` : formatNumber(value);
}

/**
 * Converts a LaTeX symbol (as used in test files) to readable plain text for places that
 * cannot render math, such as native dropdown options: `\tau_{avg}` → `τ_avg`.
 */
export function latexToPlain(latex: string): string {
  return latex
    .replace(/\\(?:mathrm|text|mathit|mathbf|operatorname)\{([^}]*)\}/g, '$1')
    .replace(/\\([A-Za-z]+)/g, (_m, name: string) => GREEK[name] ?? (name === 'times' ? '×' : name === 'cdot' ? '·' : ''))
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Light formatting for plain-text diagram labels written by test authors:
 * Greek letter words become symbols and `ohm` becomes Ω. Subscripts are handled by the renderer.
 */
export function prettifyLabel(text: string): string {
  // Maximal letter runs, so `tau_y` → `τ_y` but `beta` never becomes `bη`.
  return text.replace(/[A-Za-z]+/g, (word) => GREEK[word] ?? UNIT_WORDS[word] ?? word);
}

/** Splits `R_1 = 1000 Ω` into runs so a renderer can draw `_x` / `_{xy}` as subscripts. */
export function splitSubscripts(text: string): { text: string; sub: boolean }[] {
  const runs: { text: string; sub: boolean }[] = [];
  const re = /_(\{[^}]*\}|[A-Za-z0-9]+)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), sub: false });
    runs.push({ text: m[1].replace(/[{}]/g, ''), sub: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), sub: false });
  return runs;
}

/** Adds a counter to a LaTeX symbol as a subscript: `V` → `V_{1}`, `V_{out}` → `V_{out,1}`. */
export function numberedSymbol(symbol: string, n: number): string {
  const braced = /^(.*)_\{([^{}]*)\}$/.exec(symbol);
  if (braced) return `${braced[1]}_{${braced[2]},${n}}`;
  const single = /^(.*)_([A-Za-z0-9])$/.exec(symbol);
  if (single) return `${single[1]}_{${single[2]},${n}}`;
  return `${symbol}_{${n}}`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Relative closeness used for authored-value checks and review matching. */
export function nearlyEqual(a: number, b: number, relTol = 1e-6): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= relTol * scale;
}

const UNIT_LATEX_WORDS: Record<string, string> = { ohm: '\\Omega', kohm: 'k\\Omega', Mohm: 'M\\Omega', mohm: 'm\\Omega' };

/** LaTeX for a unit string: `ohm` → `\Omega`, `mm^2` → `\mathrm{mm}^{2}`, `N·mm` → `\mathrm{N}\cdot\mathrm{mm}`. */
export function unitToLatex(unit: string | undefined): string {
  if (!unit) return '';
  return unit
    .split(/([/*·])/)
    .map((part) => {
      if (part === '*' || part === '·') return '\\cdot ';
      if (part === '/') return '/';
      const m = /^\s*([A-Za-zµμ°%]+)(?:\^(-?\d+))?\s*$/.exec(part);
      if (!m) return `\\text{${part.replace(/[\\{}$&#^_%~]/g, '')}}`;
      const base = UNIT_LATEX_WORDS[m[1]] ?? `\\mathrm{${m[1]}}`;
      return m[2] ? `${base}^{${m[2]}}` : base;
    })
    .join('');
}
