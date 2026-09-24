import { useState } from 'react';
import { type FormulaJson, latexLines } from '../contract/types';
import type { Problem } from '../engine/testFile';
import { Tex, TexLines } from '../render/Latex';

type Categories = { category: string; formulas: FormulaJson[] }[];

/**
 * The formula sheet, grouped by category, with search. Formulas this problem allows come first;
 * the rest of the test's sheet sits in a collapsed section (the Add Step menu only offers the
 * allowed ones).
 */
export function FormulaSheet({ problem }: { problem: Problem }) {
  const [query, setQuery] = useState('');
  const allowed = new Set(problem.json.allowedFormulaIds);
  const q = query.trim().toLowerCase();
  const filtered = (keep: (f: FormulaJson) => boolean): Categories =>
    problem.test
      .formulaCategories()
      .map(({ category, formulas }) => ({
        category,
        formulas: formulas.filter((f) => keep(f) && (!q || `${f.title} ${category} ${f.teaching.whatToNotice}`.toLowerCase().includes(q))),
      }))
      .filter((c) => c.formulas.length > 0);
  const categories = filtered((f) => allowed.has(f.id));
  const others = filtered((f) => !allowed.has(f.id));
  const otherCount = others.reduce((n, c) => n + c.formulas.length, 0);
  const conversions = problem.allowedConversions();

  return (
    <details className="formula-sheet" open>
      <summary>
        <h2 className="section-title inline">Formula sheet</h2>
      </summary>
      <input
        type="search"
        className="formula-search"
        placeholder="Search formulas"
        aria-label="Search formulas"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <FormulaCategories categories={categories} />
      {categories.length === 0 && (q ? <p className="muted">No formulas for this problem match “{query}”.</p> : null)}
      {otherCount > 0 && (
        <details className="other-formulas" open={q.length > 0}>
          <summary>Other formulas in this test ({otherCount})</summary>
          <FormulaCategories categories={others} dimmed />
        </details>
      )}
      {conversions.length > 0 && (
        <div className="formula-category">
          <h3>Unit conversions</h3>
          <ul>
            {conversions.map((c) => (
              <li key={c.id} className="formula-card">
                <span className="formula-title">{c.title}</span>
                {latexLines(c.latex).map((l, i) => (
                  <Tex key={i} latex={l} display />
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

function FormulaCategories({ categories, dimmed = false }: { categories: Categories; dimmed?: boolean }) {
  return (
    <>
      {categories.map(({ category, formulas }) => (
        <div key={category} className="formula-category">
          <h3>{category}</h3>
          <ul>
            {formulas.map((formula) => (
              <li key={formula.id} className={dimmed ? 'formula-card not-allowed' : 'formula-card'}>
                <div className="formula-head">
                  <span className="formula-title">{formula.title}</span>
                  {dimmed && <span className="tag">not offered in this problem</span>}
                </div>
                <TexLines latex={formula.latex} />
                <details className="formula-notes">
                  <summary>When to use it</summary>
                  <p>{formula.teaching.whatToNotice}</p>
                  <p>{formula.teaching.whyThisOperation}</p>
                  {formula.teaching.commonMistakes && formula.teaching.commonMistakes.length > 0 && (
                    <ul className="mistakes">
                      {formula.teaching.commonMistakes.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
