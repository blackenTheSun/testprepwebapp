import { type FormEvent, type ReactElement, useState } from 'react';
import {
  type ItemResult,
  MatchingItem,
  type QuickCheckItem,
  RecallItem,
  SingleChoiceItem,
  TrueFalseItem,
} from '../../engine/quickcheck/items';
import type { CardRecord, QuickCheckRun } from '../../engine/quickcheck/run';
import { MatchingBoard } from './MatchingBoard';
import { type CalloutReveal, ItemVisualView } from '../../render/itemVisual';

interface ControlsProps<T extends QuickCheckItem> {
  item: T;
  run: QuickCheckRun;
  /** Controls are read-only once the card is answered or expired. */
  locked: boolean;
}

/** Shared submit form: Enter or the button submits once an answer is chosen. */
function AnswerForm({ ready, locked, onSubmit, children }: { ready: boolean; locked: boolean; onSubmit: () => void; children: ReactElement | ReactElement[] }) {
  return (
    <form
      className="answer-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ready && !locked) onSubmit();
      }}
    >
      <fieldset disabled={locked} className="answer-fields">
        {children}
      </fieldset>
      {!locked && (
        <button type="submit" className="primary" disabled={!ready}>
          Submit
        </button>
      )}
    </form>
  );
}

function SingleChoiceControls({ item, run, locked }: ControlsProps<SingleChoiceItem>) {
  const [choice, setChoice] = useState('');
  const record = run.record(item.id);
  const chosen = record?.response?.kind === 'singleChoice' ? record.response.optionId : choice;
  return (
    <AnswerForm ready={Boolean(choice)} locked={locked} onSubmit={() => run.submit({ kind: 'singleChoice', optionId: choice })}>
      <legend className="sr-only">{item.promptText}</legend>
      <div className="choice-list" role="radiogroup">
        {item.options.map((option) => (
          <label key={option.id} className={`choice${chosen === option.id ? ' chosen' : ''}`}>
            <input type="radio" name={`choice-${item.id}`} value={option.id} checked={chosen === option.id} onChange={() => setChoice(option.id)} />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    </AnswerForm>
  );
}

function TrueFalseControls({ item, run, locked }: ControlsProps<TrueFalseItem>) {
  const [value, setValue] = useState<boolean>();
  const record = run.record(item.id);
  const chosen = record?.response?.kind === 'trueFalse' ? record.response.value : value;
  return (
    <AnswerForm ready={value !== undefined} locked={locked} onSubmit={() => run.submit({ kind: 'trueFalse', value: value as boolean })}>
      <legend className="sr-only">True or false: {item.promptText}</legend>
      <div className="choice-list tf" role="radiogroup">
        {[true, false].map((v) => (
          <label key={String(v)} className={`choice${chosen === v ? ' chosen' : ''}`}>
            <input type="radio" name={`tf-${item.id}`} checked={chosen === v} onChange={() => setValue(v)} />
            <span>{v ? 'True' : 'False'}</span>
          </label>
        ))}
      </div>
    </AnswerForm>
  );
}

/**
 * Drag labels onto the slot under each prompt (see MatchingBoard). Without `allowReuse` each label
 * can sit on only one slot; Submit waits until every slot is filled.
 */
function MatchingControls({ item, run, locked }: ControlsProps<MatchingItem>) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const record = run.record(item.id);
  const shown = record?.response?.kind === 'matching' ? record.response.selections : selections;
  return (
    <AnswerForm ready={item.isComplete(selections)} locked={locked} onSubmit={() => run.submit({ kind: 'matching', selections })}>
      <legend className="sr-only">{item.promptText}</legend>
      <MatchingBoard item={item} selections={shown} onChange={setSelections} locked={locked} result={record?.result} />
    </AnswerForm>
  );
}

/** Paper-first: reveal the authored key, then self-mark. No text box, no drawing canvas. */
function RecallControls({ item, run, locked }: ControlsProps<RecallItem>) {
  const revealed = run.current === item && run.phase === 'recallRevealed';
  return (
    <div className="recall">
      <p className="muted">
        {item.json.responseMode === 'sketch' ? 'Sketch your answer on paper or your iPad.' : 'Write or say your answer on paper first.'} Then reveal the reference and
        compare.
      </p>
      {!revealed && !locked && (
        <button type="button" className="primary" onClick={() => run.revealRecall()}>
          Reveal reference
        </button>
      )}
      {revealed && (
        <div className="recall-reference">
          <RecallReference item={item} />
          <p className="recall-question">How did you do?</p>
          <div className="button-row">
            <button type="button" className="primary" onClick={() => run.markRecall('gotIt')}>
              Got It
            </button>
            <button type="button" className="accent" onClick={() => run.markRecall('review')}>
              Review
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecallReference({ item }: { item: RecallItem }) {
  return (
    <>
      {item.json.modelAnswer && <p className="model-answer">{item.json.modelAnswer}</p>}
      {item.keyPoints.length > 0 && (
        <ul className="key-points">
          {item.keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {item.referenceVisual && <ItemVisualView visual={item.referenceVisual} />}
    </>
  );
}

/** Picks the control component for an item's class. */
export function ItemControls({ item, run, locked }: ControlsProps<QuickCheckItem>) {
  if (item instanceof SingleChoiceItem) return <SingleChoiceControls item={item} run={run} locked={locked} />;
  if (item instanceof TrueFalseItem) return <TrueFalseControls item={item} run={run} locked={locked} />;
  if (item instanceof MatchingItem) return <MatchingControls item={item} run={run} locked={locked} />;
  if (item instanceof RecallItem) return <RecallControls item={item} run={run} locked={locked} />;
  return <p className="notice">Unsupported item.</p>;
}

const STATUS_TEXT: Record<ItemResult['status'], string> = {
  correct: 'Correct',
  incorrect: 'Not quite',
  partial: 'Partly correct',
  unanswered: 'Unanswered',
  gotIt: 'Got It',
  review: 'Marked for review',
};

export function statusText(result: ItemResult): string {
  if (result.status === 'partial' && result.pairs) {
    const pairs = Object.values(result.pairs);
    return `Partly correct: ${pairs.filter(Boolean).length} of ${pairs.length}`;
  }
  return STATUS_TEXT[result.status];
}

/** Correct answer and teaching text for one item (feedback panel and summary). */
export function AnswerExplanation({ item, result }: { item: QuickCheckItem; result?: ItemResult }) {
  return (
    <div className="answer-explanation">
      {item instanceof MatchingItem ? (
        <ul className="pair-results">
          {item.prompts.map((p) => {
            const ok = result?.pairs?.[p.id];
            return (
              <li key={p.id} className={ok === undefined ? '' : ok ? 'ok' : 'wrong'}>
                <span className="callout-chip">{p.id}</span> {ok === undefined ? '' : ok ? '✓ ' : '✗ '}
                <strong>{item.correctTerm(p.id)}</strong>
              </li>
            );
          })}
        </ul>
      ) : item instanceof RecallItem ? (
        <RecallReference item={item} />
      ) : item instanceof TrueFalseItem ? (
        <p>
          The statement is <strong>{item.correctAnswerText()}</strong>.
        </p>
      ) : (
        <p>
          Answer: <strong>{item.correctAnswerText()}</strong>
        </p>
      )}
      {!(item instanceof RecallItem) && item.explanation && <p className="explanation">{item.explanation}</p>}
    </div>
  );
}

/** Callout overlay showing the correct terms (and ✓/✗ against Amy's picks, when she answered). */
export function revealFor(item: QuickCheckItem, record?: CardRecord): CalloutReveal | undefined {
  if (!(item instanceof MatchingItem)) return undefined;
  const reveal: CalloutReveal = {};
  for (const p of item.prompts) reveal[p.id] = { term: item.correctTerm(p.id), ok: record?.result.pairs?.[p.id] };
  return reveal;
}
