import type { Attempt, LearnerStep } from '../engine/attempt';
import { formatElapsed } from '../engine/format';
import { ACTION_GROUP_LABELS, DerivativeOperation, FinalAnswerOperation } from '../engine/operations';
import { Tex } from '../render/Latex';
import { useObservable } from './hooks';
import { TeachingFields } from './Review';
import { VariableLine, variableLatex } from './VariableLine';

/** Amy's steps in order, with inputs, calculated outputs (renamable) and unit hints. */
export function WorkList({ attempt }: { attempt: Attempt }) {
  useObservable(attempt);
  const { steps } = attempt;
  return (
    <section className="panel work-list" aria-labelledby="work-title">
      <div className="panel-heading">
        <h2 id="work-title">My work</h2>
        {attempt.canWork && steps.length > 0 && (
          <button type="button" className="link-button small" onClick={() => attempt.undoLastStep()}>
            Undo last step
          </button>
        )}
      </div>
      {steps.length === 0 ? (
        <p className="muted">No steps yet.</p>
      ) : (
        <ol className="steps">
          {steps.map((step) => (
            <StepCard key={step.id} attempt={attempt} step={step} />
          ))}
        </ol>
      )}
      {attempt.finalAnswer && (
        <p className="final-answer">
          <strong>Final answer:</strong> <Tex latex={variableLatex(attempt.finalAnswer)} />
        </p>
      )}
    </section>
  );
}

function StepCard({ attempt, step }: { attempt: Attempt; step: LearnerStep }) {
  const { operation } = step;
  const outputs = step.outputIds.map((id) => attempt.store.get(id)).filter((v) => v !== undefined);
  return (
    <li className="step-card" data-step-id={step.id}>
      <div className="step-head">
        <span className="step-number">Step {step.number}</span>
        <span className="tag">{ACTION_GROUP_LABELS[operation.group]}</span>
        <span className="step-title">{operation.title}</span>
        <span className="muted small step-time">at {formatElapsed(step.atElapsedMs)}</span>
      </div>
      {step.inputs.length > 0 && (
        <ul className="step-inputs">
          {step.inputs.map((input) => {
            const variable = attempt.store.get(input.variableId);
            return (
              <li key={input.key}>
                <span className="muted">{input.slotName}:</span> {variable ? variable.describe() : '(removed)'}
              </li>
            );
          })}
        </ul>
      )}
      {operation instanceof FinalAnswerOperation ? null : (
        <ul className="step-outputs">
          {outputs.map((v) => (
            <li key={v.id}>
              <VariableLine attempt={attempt} variable={v} />
            </li>
          ))}
        </ul>
      )}
      {step.hints.length > 0 && (
        <ul className="hints">
          {step.hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      {operation instanceof DerivativeOperation && (
        <details className="derivative-explanation" open>
          <summary>Why differentiate here</summary>
          <TeachingFields teaching={operation.teaching} />
        </details>
      )}
    </li>
  );
}
