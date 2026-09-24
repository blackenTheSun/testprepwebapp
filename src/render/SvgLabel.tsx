import { prettifyLabel, splitSubscripts } from '../engine/format';

interface SvgLabelProps {
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  className?: string;
  fontSize?: number;
}

/**
 * Plain-text diagram label with light formatting: Greek words → symbols, `ohm` → Ω, and
 * `_x` / `_{xy}` drawn as subscripts. Uses `dy` shifts because Firefox ignores
 * `baseline-shift` on `<tspan>`.
 */
export function SvgLabel({ x, y, text, anchor = 'start', className = 'dg-label', fontSize = 13 }: SvgLabelProps) {
  const runs = splitSubscripts(prettifyLabel(text));
  const shift = fontSize * 0.3;
  let lowered = false;
  return (
    <text x={x} y={y} textAnchor={anchor} className={className} fontSize={fontSize}>
      {runs.map((run, i) => {
        let dy = 0;
        if (run.sub && !lowered) {
          dy = shift;
          lowered = true;
        } else if (!run.sub && lowered) {
          dy = -shift;
          lowered = false;
        }
        return (
          <tspan key={i} dy={dy || undefined} fontSize={run.sub ? fontSize * 0.75 : undefined}>
            {run.text}
          </tspan>
        );
      })}
    </text>
  );
}
