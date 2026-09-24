import { useState } from 'react';
import type { Attempt } from '../engine/attempt';
import { formatNumberLatex, unitToLatex } from '../engine/format';
import type { Variable } from '../engine/variables';
import { Tex } from '../render/Latex';

/** `symbol = value unit` as LaTeX (or the stored LaTeX for symbolic results). */
export function variableLatex(variable: Variable): string {
  if (variable.isNumeric) {
    const unit = unitToLatex(variable.unit);
    const unitTex = unit ? `\\;${unit}` : '';
    return `${variable.symbol} = ${formatNumberLatex(variable.value as number)}${unitTex}`;
  }
  return variable.latex ?? variable.symbol;
}

interface VariableLineProps {
  attempt: Attempt;
  variable: Variable;
  /** For givens, show the author's LaTeX (e.g. `R_2 = 2\,k\Omega`) instead of the computed form. */
  showGivenLatex?: boolean;
}

/** A named value with an inline Rename editor. Renaming never changes the variable's id. */
export function VariableLine({ attempt, variable, showGivenLatex = false }: VariableLineProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(variable.name);
  const [symbol, setSymbol] = useState(variable.symbol);

  if (editing) {
    return (
      <form
        className="rename-form"
        onSubmit={(e) => {
          e.preventDefault();
          attempt.rename(variable.id, name, symbol);
          setEditing(false);
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </label>
        <button type="submit" className="primary small-button">
          Save
        </button>
        <button type="button" className="small-button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );
  }

  const useAuthorLatex = showGivenLatex && !variable.isRenamed && variable.latex && variable.origin !== 'step';
  return (
    <div className="variable-line" data-variable-id={variable.id}>
      <span className="variable-name">
        {variable.name}
        {variable.origin === 'constant' && <span className="tag">constant</span>}
      </span>
      <Tex latex={useAuthorLatex ? (variable.latex as string) : variableLatex(variable)} />
      <button
        type="button"
        className="link-button small"
        aria-label={`Rename ${variable.name}`}
        onClick={() => {
          setName(variable.name);
          setSymbol(variable.symbol);
          setEditing(true);
        }}
      >
        Rename
      </button>
    </div>
  );
}
