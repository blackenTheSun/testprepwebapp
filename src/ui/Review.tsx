import { useMemo } from 'react';
import type { SolutionTeachingJson } from '../contract/types';
import type { Attempt } from '../engine/attempt';
import { formatElapsed, formatUnit } from '../engine/format';
import { ACTION_GROUP_LABELS, type ActionGroup, BasicMathOperation, ConversionOperation, DerivativeOperation, FormulaOperation } from '../engine/operations';
import { type StepMatch, ReviewMatcher } from '../engine/review';
import { Tex, TexLines } from '../render/Latex';
import { useObservable } from './hooks';
import { variableLatex } from './VariableLine';

const TEACHING_FIELDS: { key: keyof SolutionTeachingJson; label: string }[] = [
  { key: 'whyNow', label: 'Why now' },
  { key: 'whatToNotice', label: 'What to notice' },
  { key: 'whyThisOperation', label: 'Why this operation' },
  { key: 'inputMeaning', label: 'What the inputs mean' },
  { key: 'resultUse', label: 'What the result unlocks' },
];

export function TeachingFields({ teaching }: { teaching: SolutionTeachingJson }) {
  return (
    <dl className="teaching">
      {TEACHING_FIELDS.map(({ key, label }) => (
        <div key={key} className="teaching-row">
          <dt>{label}</dt>
          <dd>{teaching[key] as string}</dd>
        </div>
      ))}
      {teaching.commonMistakes && teaching.commonMistakes.length > 0 && (
        <div className="teaching-row">
          <dt>Common mistakes</dt>
          <dd>
            <ul className="mistakes">
              {teaching.commonMistakes.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

/** After Finish: the authored path, revealed one step at a time or all at once, beside her work. */
export function Review({ attempt }: { attempt: Attempt }) {
  useObservable(attempt);
  // The authored path never changes; recompute matches when her work (e.g. a rename) changes.
  const matches = useMemo(() => new ReviewMatcher(attempt).matches(), [attempt, attempt.version]);
  const total = matches.length;
  const shown = attempt.revealedCount;
  const reached = matches.filter((m) => m.matched).length;
  const { target } = attempt.problem.json;

  return (
    <section className="panel review" aria-labelledby="review-title">
      <div className="panel-heading">
        <h2 id="review-title">Correct path</h2>
        <div className="segmented" role="group" aria-label="Reveal mode">
          <button type="button" aria-pressed={attempt.revealMode === 'stepByStep'} onClick={() => attempt.setRevealMode('stepByStep')}>
            One step at a time
          </button>
          <button type="button" aria-pressed={attempt.revealMode === 'all'} onClick={() => attempt.setRevealMode('all')}>
            Show all
          </button>
        </div>
      </div>
      <p className="review-summary">
        Finished in <strong>{formatElapsed(attempt.timer.elapsedMs())}</strong>. You reached {reached} of {total} path results.{' '}
        {attempt.finalAnswer ? (
          <>
            Your final answer: <Tex latex={variableLatex(attempt.finalAnswer)} />
          </>
        ) : (
          <>You did not state a final answer.</>
        )}{' '}
        Target: {target.name} <Tex latex={target.symbol} />
        {target.unit ? ` (${formatUnit(target.unit)})` : ''}.
      </p>

      <ol className="path">
        {matches.slice(0, shown).map((match, i) => (
          <PathStep key={match.result.step.id} match={match} number={i + 1} />
        ))}
      </ol>

      {attempt.revealMode === 'stepByStep' && shown < total && (
        <button type="button" className="primary" onClick={() => attempt.revealNext()}>
          Reveal next step ({shown} of {total})
        </button>
      )}
      {shown >= total && <p className="muted">That's the whole path.</p>}
    </section>
  );
}

function PathStep({ match, number }: { match: StepMatch; number: number }) {
  const { result } = match;
  const { json } = result.step;
  const operation = result.operation;
  const primary = result.outputs[0];
  return (
    <li className={`path-step${match.matched ? ' matched' : ''}`} data-solution-step={json.id}>
      <div className="step-head">
        <span className="step-number">Step {number}</span>
        <span className="tag">{ACTION_GROUP_LABELS[json.kind as ActionGroup]}</span>
        <span className="step-title">{json.title}</span>
        {match.matched && (
          <span className="badge-ok" title="One of your results matches this step">
            ✓ You reached this
          </span>
        )}
      </div>

      <div className="path-operation">
        {operation instanceof FormulaOperation && (
          <>
            <span className="muted">Formula: {operation.formula.title}</span>
            <TexLines latex={operation.formula.latex} />
          </>
        )}
        {operation instanceof BasicMathOperation && (
          <>
            <span className="muted">Basic math: {operation.operator.title}</span>
          </>
        )}
        {operation instanceof ConversionOperation && (
          <>
            <span className="muted">Conversion: {operation.conversion.title}</span>
            <TexLines latex={operation.conversion.latex} />
          </>
        )}
        {operation instanceof DerivativeOperation && (
          <>
            <span className="muted">Derivative of</span> <Tex latex={operation.action.expressionLatex} />{' '}
            <span className="muted">with respect to</span> <Tex latex={operation.action.variable} />
            <TexLines latex={operation.action.resultLatex} />
          </>
        )}
      </div>

      {result.inputs.length > 0 && (
        <ul className="step-inputs">
          {result.inputs.map((input) => (
            <li key={input.key}>
              <span className="muted">{input.name}:</span>{' '}
              {input.variable ? <Tex latex={variableLatex(input.variable)} /> : <code>{input.authoredId}</code>}
              {input.variable && <span className="muted small"> ({input.variable.name})</span>}
            </li>
          ))}
        </ul>
      )}

      {primary && json.kind !== 'derivative' && (
        <p className="path-result">
          <span className="muted">Result:</span> <Tex latex={variableLatex(primary)} />
        </p>
      )}
      {json.kind === 'derivative' &&
        result.outputs.slice(1).map((v) => (
          <p key={v.id} className="path-result">
            <span className="muted">Evaluated:</span> <Tex latex={variableLatex(v)} />
          </p>
        ))}
      {json.expectedLatex && (
        <div className="path-expected">
          <Tex latex={json.expectedLatex} display />
        </div>
      )}
      {result.error && <p className="error-text">The app could not recompute this step: {result.error}</p>}
      {result.mismatch && (
        <p className="warning-text">
          Heads up: the answer key's stored value differs from what the app calculates for this step.
        </p>
      )}

      <TeachingFields teaching={json.teaching} />
    </li>
  );
}
