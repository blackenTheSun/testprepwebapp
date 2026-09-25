import type { CardRecord, QuickCheckRun } from '../../engine/quickcheck/run';
import type { Session } from '../../engine/session';
import { ItemVisualView } from '../../render/itemVisual';
import { AnswerExplanation, revealFor, statusText } from './ItemControls';

/**
 * End of a run: visual misses, unanswered cards and recall items marked Review are listed
 * separately, each with Amy's answer, the correct answer and the explanation. Matching items
 * show the correct label overlay. "Retry Missed and Review" rebuilds a round from those items.
 */
export function QuickCheckSummary({ session, run }: { session: Session; run: QuickCheckRun }) {
  const summary = run.summary();
  const retryCount = summary.retryItems().length;
  return (
    <section className="panel summary" aria-labelledby="summary-title">
      <h2 id="summary-title">{run.round > 1 ? `Retry round ${run.round} summary` : 'Summary'}</h2>
      <ul className="summary-stats">
        <li>
          <strong>{summary.correct.length}</strong> of {summary.scoredCount} answered correctly
        </li>
        <li>
          <strong>{summary.misses.length}</strong> visual miss{summary.misses.length === 1 ? '' : 'es'}
        </li>
        <li>
          <strong>{summary.unanswered.length}</strong> unanswered
        </li>
        {summary.records.some((r) => !r.item.isAutoScored) && (
          <li>
            <strong>{summary.review.length}</strong> marked Review
          </li>
        )}
      </ul>

      <div className="button-row summary-actions">
        <button type="button" className="primary" disabled={retryCount === 0} onClick={() => session.retryQuickCheck()}>
          Retry Missed and Review{retryCount > 0 ? ` (${retryCount})` : ''}
        </button>
        <button type="button" onClick={() => session.startQuickCheck(run.set.id)}>
          Start the whole set again
        </button>
        <button type="button" onClick={() => session.closeQuickCheck()}>
          Back to checks
        </button>
      </div>

      <SummaryGroup title="Visual misses" records={summary.misses} />
      <SummaryGroup title="Unanswered" records={summary.unanswered} />
      <SummaryGroup title="Marked Review" records={summary.review} />
      {summary.correct.length + summary.gotIt.length > 0 && (
        <details className="summary-correct">
          <summary>
            Correct and Got It ({summary.correct.length + summary.gotIt.length})
          </summary>
          <SummaryGroup title="" records={[...summary.correct, ...summary.gotIt]} />
        </details>
      )}
    </section>
  );
}

function SummaryGroup({ title, records }: { title: string; records: CardRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="summary-group">
      {title && <h3>{title}</h3>}
      <ol className="summary-list">
        {records.map((record) => (
          <li key={record.item.id} className={`summary-item status-${record.result.status}`} data-item-id={record.item.id}>
            <div className="step-head">
              <span className="step-title">{record.item.promptText}</span>
              <span className={`status status-${record.result.status}`}>{record.expired ? "Time's up" : statusText(record.result)}</span>
            </div>
            {record.item.visual && record.item.kind === 'matching' && <ItemVisualView visual={record.item.visual} reveal={revealFor(record.item, record)} />}
            {record.response && (
              <p className="muted small">
                Your answer: {record.item.responseText(record.response as never)}
              </p>
            )}
            <AnswerExplanation item={record.item} result={record.result} />
          </li>
        ))}
      </ol>
    </div>
  );
}
