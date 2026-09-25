import { useEffect, useState } from 'react';
import type { QuickCheckItem } from '../../engine/quickcheck/items';
import type { QuickCheckRun } from '../../engine/quickcheck/run';
import type { Session } from '../../engine/session';
import { ItemVisualView } from '../../render/itemVisual';
import { useObservable } from '../hooks';
import { AnswerExplanation, ItemControls, revealFor, statusText } from './ItemControls';
import { QuickCheckSummary } from './QuickCheckSummary';

/** Drives the per-card countdown: re-renders a few times a second and expires the card on time. */
function useCountdown(run: QuickCheckRun): number | undefined {
  const [, setTick] = useState(0);
  const remaining = run.remainingMs();
  const timed = remaining !== undefined;
  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => {
      if (!run.checkExpiry()) setTick((t) => t + 1);
    }, 200);
    return () => window.clearInterval(id);
  }, [run, timed, run.index]);
  return remaining;
}

export function QuickCheckView({ session, run }: { session: Session; run: QuickCheckRun }) {
  useObservable(run);
  const remaining = useCountdown(run);
  const item = run.current;
  const total = run.items.length;

  return (
    <div className="quickcheck-view">
      <header className="topbar">
        <button type="button" className="link-button" onClick={() => session.closeQuickCheck()}>
          ← Back
        </button>
        <div className="topbar-title">
          <span className="muted small">
            {run.isRapid ? 'Rapid visual round' : 'Visual check'}
            {run.round > 1 ? ` · Retry round ${run.round}` : ''} · {run.immediateFeedback ? 'feedback after each card' : 'answers at the end'}
          </span>
          <h1>{run.set.title}</h1>
        </div>
        {!run.finished && (
          <div className="card-progress" aria-live="polite">
            Card {run.index + 1} of {total}
          </div>
        )}
        {remaining !== undefined && (
          <div className={`countdown${remaining <= 3000 ? ' low' : ''}`} role="timer" aria-label="Time left on this card" data-testid="card-countdown">
            {Math.ceil(remaining / 1000)}s
          </div>
        )}
      </header>

      {run.finished ? (
        <QuickCheckSummary session={session} run={run} />
      ) : (
        item && <Card key={`${run.round}:${item.id}`} run={run} item={item} />
      )}
    </div>
  );
}

function Card({ run, item }: { run: QuickCheckRun; item: QuickCheckItem }) {
  const phase = run.phase;
  const record = run.currentRecord;
  const showAnswer = phase === 'feedback' || phase === 'expiredAnswer';
  const locked = phase !== 'answering';
  const isLast = run.index + 1 >= run.items.length;
  const nextLabel = isLast ? 'See summary' : 'Next card';

  return (
    <div className="card-layout">
      {run.index === 0 && run.round === 1 && run.set.instructions && phase === 'answering' && <p className="notice">{run.set.instructions}</p>}
      <section className="panel card" aria-label={`Card ${run.index + 1}`} data-item-id={item.id} data-item-type={item.kind}>
        <p className={item.kind === 'trueFalse' ? 'card-prompt statement' : 'card-prompt'}>
          {item.kind === 'trueFalse' && <span className="tag">True or false?</span>} {item.promptText}
        </p>
        {item.visual && <ItemVisualView visual={item.visual} reveal={showAnswer ? revealFor(item, record) : undefined} />}
        <ItemControls item={item} run={run} locked={locked} />

        {phase === 'expired' && (
          <div className="card-feedback expired" role="status">
            <p>
              <strong>Time's up.</strong> This card counts as unanswered.
            </p>
            <div className="button-row">
              <button type="button" className="primary" onClick={() => run.showExpiredAnswer()}>
                Show answer
              </button>
              <button type="button" onClick={() => run.next()}>
                {isLast ? 'See summary' : 'Next card'} (review at the end)
              </button>
            </div>
          </div>
        )}

        {showAnswer && record && (
          <div className={`card-feedback status-${record.result.status}`} role="status">
            <p className="feedback-status">{record.expired ? "Time's up: unanswered" : statusText(record.result)}</p>
            <AnswerExplanation item={item} result={record.result} />
            <button type="button" className="primary" onClick={() => run.next()} autoFocus>
              {nextLabel}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
