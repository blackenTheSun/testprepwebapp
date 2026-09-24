import katex from 'katex';
import { memo, useMemo } from 'react';
import { type Latex, latexLines } from '../contract/types';

/**
 * Renders LaTeX with the bundled KaTeX. `trust: false` disables \href, \includegraphics and
 * similar, and `throwOnError: false` shows a bad expression in red instead of crashing.
 */
export const Tex = memo(function Tex({ latex, display = false, className }: { latex: string; display?: boolean; className?: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
      }),
    [latex, display],
  );
  const Tag = display ? 'div' : 'span';
  return <Tag className={className ? `tex ${className}` : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
});

/** One display block per line for fields that may be a string or an array of strings. */
export function TexLines({ latex, className }: { latex: Latex | undefined; className?: string }) {
  const lines = latexLines(latex);
  if (lines.length === 0) return null;
  return (
    <div className={className ? `tex-lines ${className}` : 'tex-lines'}>
      {lines.map((line, i) => (
        <Tex key={i} latex={line} display />
      ))}
    </div>
  );
}
