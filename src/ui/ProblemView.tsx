import { useState } from 'react';
import type { Attempt } from '../engine/attempt';
import { AttemptExporter } from '../engine/attemptExport';
import { formatElapsed, formatUnit } from '../engine/format';
import type { Session } from '../engine/session';
import { Tex, TexLines } from '../render/Latex';
import { VisualView } from '../render/visuals';
import { AddStep } from './AddStep';
import { FormulaSheet } from './FormulaSheet';
import { IssueList } from './Home';
import { useObservable, useTicker } from './hooks';
import { Review } from './Review';
import { VariableLine } from './VariableLine';
import { WorkList } from './WorkList';

export function ProblemView({ session, attempt }: { session: Session; attempt: Attempt }) {
  useObservable(attempt);
  const { problem } = attempt;
  const warnings = session.warningsFor(problem);
  const givens = attempt.store.all().filter((v) => v.origin !== 'step');

  return (
    <div className="problem-view">
      <header className="topbar">
        <button type="button" className="link-button" onClick={() => session.closeProblem()}>
          ← Problems
        </button>
        <div className="topbar-title">
          <span className="muted small">{session.test.title}</span>
          <h1>{problem.title}</h1>
        </div>
        <TimerBar session={session} attempt={attempt} />
      </header>

      {warnings.length > 0 && (
        <details className="warning-panel">
          <summary>This problem's answer key has {warnings.length} warning(s).</summary>
          <IssueList issues={warnings} />
        </details>
      )}

      <div className="problem-grid">
        <section className="problem-panel panel" aria-label="Problem">
          <p className="prompt">{problem.json.prompt.text}</p>
          <TexLines latex={problem.json.prompt.latex} className="prompt-latex" />
          {problem.json.visual && <VisualView visual={problem.json.visual} />}

          <h2 className="section-title">Givens</h2>
          <ul className="given-list">
            {givens.map((variable) => (
              <li key={variable.id}>
                <VariableLine attempt={attempt} variable={variable} showGivenLatex />
              </li>
            ))}
          </ul>

          <h2 className="section-title">Find</h2>
          <p className="target">
            {problem.json.target.name} <Tex latex={problem.json.target.symbol} />
            {problem.json.target.unit && <span className="muted"> ({formatUnit(problem.json.target.unit)})</span>}
          </p>

          <FormulaSheet problem={problem} />
        </section>

        <section className="work-panel" aria-label="Work">
          {attempt.isFinished ? (
            <Review attempt={attempt} />
          ) : (
            <AddStep attempt={attempt} key={attempt.problem.id} />
          )}
          <WorkList attempt={attempt} />
        </section>
      </div>
    </div>
  );
}

function TimerBar({ session, attempt }: { session: Session; attempt: Attempt }) {
  const state = attempt.timer.state;
  useTicker(state === 'running');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const download = () => {
    const exporter = new AttemptExporter(attempt);
    const blob = new Blob([JSON.stringify(exporter.toJson(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exporter.fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="timer-bar">
      <div className={`timer timer-${state}`} role="timer" aria-live="off" aria-label="Elapsed time">
        <span className="timer-value" data-testid="timer">
          {formatElapsed(attempt.timer.elapsedMs())}
        </span>
        <span className="timer-state">{TIMER_LABELS[state]}</span>
      </div>
      {state === 'ready' && (
        <button type="button" className="primary" onClick={() => attempt.start()}>
          Start
        </button>
      )}
      {state === 'running' && (
        <button type="button" onClick={() => attempt.pause()}>
          Pause
        </button>
      )}
      {state === 'paused' && (
        <button type="button" className="primary" onClick={() => attempt.start()}>
          Resume
        </button>
      )}
      {(state === 'running' || state === 'paused') && (
        <button type="button" className="accent" onClick={() => attempt.finish()}>
          Finish and reveal path
        </button>
      )}
      <button type="button" onClick={download} title="Save this attempt as a JSON file">
        Download Attempt
      </button>
      {confirmingReset ? (
        <span className="confirm">
          Reset this problem?
          <button type="button" className="danger" onClick={() => session.resetProblem(attempt.problem.id)}>
            Reset
          </button>
          <button type="button" onClick={() => setConfirmingReset(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmingReset(true)} disabled={state === 'ready' && attempt.steps.length === 0}>
          Reset problem
        </button>
      )}
    </div>
  );
}

const TIMER_LABELS = { ready: 'Not started', running: 'Running', paused: 'Paused', finished: 'Finished' } as const;

