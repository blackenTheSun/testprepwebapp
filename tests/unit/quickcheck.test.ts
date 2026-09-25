import { describe, expect, it } from 'vitest';
import { TestFileValidator } from '../../src/contract/contracts';
import type { QuickCheckSetJson } from '../../src/contract/types';
import { MatchingItem, QuickCheckItem, RecallItem, SingleChoiceItem, TrueFalseItem } from '../../src/engine/quickcheck/items';
import { QuickCheckRun } from '../../src/engine/quickcheck/run';
import { Session } from '../../src/engine/session';
import { TestFile } from '../../src/engine/testFile';
import { FakeClock, readRepoFile } from './helpers';

function placeholderTest(): TestFile {
  const { file } = new TestFileValidator().validateAndNormalize(JSON.parse(readRepoFile('docs/handoff/v0.3/placeholder-visual-checks.test.example.json')));
  return new TestFile(file!);
}
const standard = () => placeholderTest().quickCheckSets[0];
const rapid = () => placeholderTest().quickCheckSets[1];
const item = <T extends QuickCheckItem>(set: QuickCheckSetJson, id: string) => {
  const index = set.items.findIndex((i) => i.id === id);
  return QuickCheckItem.fromJson(set.items[index], index) as T;
};

describe('item scoring', () => {
  it('scores single choice, true/false and recall', () => {
    const choice = item<SingleChoiceItem>(standard(), 'identify-sphere');
    expect(choice.score({ kind: 'singleChoice', optionId: 'sphere' }).status).toBe('correct');
    expect(choice.score({ kind: 'singleChoice', optionId: 'cube' }).status).toBe('incorrect');
    expect(choice.correctAnswerText()).toBe('Sphere');

    const tf = item<TrueFalseItem>(standard(), 'tf-third-shape');
    expect(tf.score({ kind: 'trueFalse', value: false }).status).toBe('correct');
    expect(tf.score({ kind: 'trueFalse', value: true }).status).toBe('incorrect');
    expect(tf.explanation).toBe('The third shape is a triangle. The square is the second shape.');

    const recall = item<RecallItem>(standard(), 'recall-cube');
    expect(recall.isAutoScored).toBe(false);
    expect(recall.score({ kind: 'recall', mark: 'review' }).status).toBe('review');
  });

  it('scores matching per pair and keeps selections one-to-one', () => {
    const match = item<MatchingItem>(standard(), 'match-shapes');
    const all = { A: 'circle', B: 'square', C: 'triangle', D: 'hexagon', E: 'star' };
    expect(match.score({ kind: 'matching', selections: all })).toEqual({ status: 'correct', pairs: { A: true, B: true, C: true, D: true, E: true } });
    const partial = match.score({ kind: 'matching', selections: { ...all, D: 'pentagon' } });
    expect(partial.status).toBe('partial');
    expect(partial.pairs?.D).toBe(false);
    expect(match.score({ kind: 'matching', selections: { A: 'star', B: 'circle', C: 'square', D: 'triangle', E: 'hexagon' } }).status).toBe('incorrect');

    // A placed piece leaves the bank.
    expect(match.bankTerms({ A: 'circle' })).not.toContain('circle');
    expect(match.bankTerms({ A: 'circle' })).toHaveLength(7);
    expect(match.isComplete({ A: 'circle', B: 'square', C: 'triangle', D: 'hexagon' })).toBe(false);
    expect(match.isComplete({ A: 'circle', B: 'circle', C: 'triangle', D: 'hexagon', E: 'star' })).toBe(false);
    expect(match.isComplete(all)).toBe(true);
  });
});

describe('matching placement (drag and drop)', () => {
  const oneToOne = () => item<MatchingItem>(standard(), 'match-shapes');
  const reuseSet = () => placeholderTest().quickCheckSets.find((s) => s.id === 'labels-reuse')!;
  const reusable = () => item<MatchingItem>(reuseSet(), 'match-reuse');

  it('places from the bank, and a displaced piece returns to the bank', () => {
    const m = oneToOne();
    let s = m.place({}, 'circle', 'A');
    s = m.place(s, 'square', 'A');
    expect(s).toEqual({ A: 'square' });
    expect(m.bankTerms(s)).toContain('circle');
  });

  it('moves a piece between slots, swapping with an occupied slot', () => {
    const m = oneToOne();
    let s = m.place(m.place({}, 'circle', 'A'), 'square', 'B');
    s = m.place(s, 'circle', 'C', 'A'); // move to an empty slot
    expect(s).toEqual({ B: 'square', C: 'circle' });
    s = m.place(s, 'circle', 'B', 'C'); // move onto an occupied slot: swap
    expect(s).toEqual({ B: 'circle', C: 'square' });
    expect(m.remove(s, 'B')).toEqual({ C: 'square' });
  });

  it('never lets one label sit on two slots without allowReuse', () => {
    const m = oneToOne();
    const s = m.place(m.place({}, 'circle', 'A'), 'circle', 'B');
    expect(s).toEqual({ B: 'circle' });
  });

  it('with allowReuse keeps every piece in the bank and scores repeated labels', () => {
    const m = reusable();
    expect(m.allowReuse).toBe(true);
    let s = m.place({}, 'rectangle', 'A');
    s = m.place(s, 'rectangle', 'C');
    expect(s).toEqual({ A: 'rectangle', C: 'rectangle' });
    expect(m.bankTerms(s)).toHaveLength(5);
    s = m.place(s, 'rectangle', 'D', 'C'); // moving a copy just moves it
    expect(s).toEqual({ A: 'rectangle', D: 'rectangle' });
    const answer = { A: 'rectangle', B: 'circle', C: 'rectangle', D: 'triangle' };
    expect(m.isComplete(answer)).toBe(true);
    expect(m.score({ kind: 'matching', selections: answer }).status).toBe('correct');
  });
});

describe('QuickCheckRun', () => {
  it('walks cards in authored order with immediate feedback', () => {
    const run = new QuickCheckRun(standard());
    expect(run.items.map((i) => i.id)).toEqual(standard().items.map((i) => i.id));
    run.submit({ kind: 'singleChoice', optionId: 'cube' });
    expect(run.phase).toBe('feedback');
    expect(run.currentRecord?.result.status).toBe('incorrect');
    run.next();
    expect(run.index).toBe(1);
    expect(run.phase).toBe('answering');
  });

  it('holds feedback until the end in end mode', () => {
    const run = new QuickCheckRun(rapid());
    run.submit({ kind: 'singleChoice', optionId: 'box' });
    expect(run.phase).toBe('answering');
    expect(run.index).toBe(1);
  });

  it('runs recall as reveal → Got It / Review, with no answer submission', () => {
    const set = standard();
    const run = new QuickCheckRun(set, [item(set, 'recall-cube')]);
    run.submit({ kind: 'recall', mark: 'gotIt' }); // ignored: recall is never submitted as an answer
    expect(run.phase).toBe('answering');
    run.revealRecall();
    expect(run.phase).toBe('recallRevealed');
    run.markRecall('review');
    expect(run.finished).toBe(true);
    expect(run.summary().review.map((r) => r.item.id)).toEqual(['recall-cube']);
  });

  it('expires a timed card as unanswered, then offers Show answer or Next card', () => {
    const clock = new FakeClock();
    const run = new QuickCheckRun(rapid(), undefined, 1, clock.read);
    expect(run.remainingMs()).toBe(8000);
    clock.advance(7999);
    expect(run.checkExpiry()).toBe(false);
    clock.advance(1);
    expect(run.checkExpiry()).toBe(true);
    expect(run.phase).toBe('expired');
    expect(run.currentRecord).toMatchObject({ expired: true, result: { status: 'unanswered' } });
    // Answering after time is up does not count.
    run.submit({ kind: 'singleChoice', optionId: 'box' });
    expect(run.currentRecord?.result.status).toBe('unanswered');
    run.showExpiredAnswer();
    expect(run.phase).toBe('expiredAnswer');
    run.next();
    expect(run.index).toBe(1);
    expect(run.remainingMs()).toBe(6000); // next card's own displaySeconds

    // Second card: expire and skip straight on (review at the end).
    clock.advance(6000);
    run.checkExpiry();
    run.next();
    expect(run.index).toBe(2);
  });

  it('a submission that arrives after the deadline is recorded as expired', () => {
    const clock = new FakeClock();
    const run = new QuickCheckRun(rapid(), undefined, 1, clock.read);
    clock.advance(8500);
    run.submit({ kind: 'singleChoice', optionId: 'box' });
    expect(run.phase).toBe('expired');
    expect(run.currentRecord?.result.status).toBe('unanswered');
  });

  it('standard sets ignore displaySeconds', () => {
    const set = { ...standard(), items: standard().items.map((i) => ({ ...i, displaySeconds: 5 })) };
    expect(new QuickCheckRun(set).remainingMs()).toBeUndefined();
  });

  it('summarises misses, unanswered and Review separately, and retries exactly those in authored order', () => {
    const clock = new FakeClock();
    const set = standard();
    const run = new QuickCheckRun(set, undefined, 1, clock.read);
    const answers: Record<string, () => void> = {
      'identify-sphere': () => run.submit({ kind: 'singleChoice', optionId: 'sphere' }),
      'identify-highlight': () => run.submit({ kind: 'singleChoice', optionId: 'corner' }),
      'compare-panels': () => run.submit({ kind: 'singleChoice', optionId: 'panel-b' }),
      'tf-third-shape': () => run.submit({ kind: 'trueFalse', value: false }),
      'tf-arrow': () => run.submit({ kind: 'trueFalse', value: false }),
      'tf-cylinder': () => run.submit({ kind: 'trueFalse', value: false }),
      'match-shapes': () => run.submit({ kind: 'matching', selections: { A: 'circle', B: 'square', C: 'triangle', D: 'pentagon', E: 'star' } }),
    };
    while (!run.finished) {
      const current = run.current!;
      if (current.id === 'recall-cube') {
        run.revealRecall();
        run.markRecall('review');
      } else {
        answers[current.id]();
        run.next();
      }
    }
    const summary = run.summary();
    expect(summary.misses.map((r) => r.item.id)).toEqual(['identify-highlight', 'tf-arrow', 'match-shapes']);
    expect(summary.unanswered).toEqual([]);
    expect(summary.review.map((r) => r.item.id)).toEqual(['recall-cube']);
    expect(summary.correct).toHaveLength(4);
    expect(summary.scoredCount).toBe(7);

    const retry = run.retry(clock.read)!;
    expect(retry.round).toBe(2);
    expect(retry.items.map((i) => i.id)).toEqual(['identify-highlight', 'tf-arrow', 'match-shapes', 'recall-cube']);
  });

  it('includes expired cards in the summary and the retry, and offers no retry when all correct', () => {
    const clock = new FakeClock();
    const set = rapid();
    const run = new QuickCheckRun(set, [item(set, 'rapid-1'), item(set, 'rapid-2')], 1, clock.read);
    clock.advance(9000);
    run.checkExpiry();
    run.next();
    run.submit({ kind: 'trueFalse', value: true });
    expect(run.finished).toBe(true);
    expect(run.summary().unanswered.map((r) => r.item.id)).toEqual(['rapid-1']);
    const retry = run.retry(clock.read)!;
    expect(retry.items.map((i) => i.id)).toEqual(['rapid-1']);
    retry.submit({ kind: 'singleChoice', optionId: 'box' });
    expect(retry.retry()).toBeUndefined();
  });
});

describe('Session quick checks', () => {
  it('starts, retries and closes runs, remembering the last score', () => {
    const clock = new FakeClock();
    const session = new Session(placeholderTest(), [], 'p.json', clock.read);
    session.startQuickCheck('shapes-rapid');
    const run = session.activeRun!;
    for (let i = 0; i < 8; i++) {
      clock.advance(11_000);
      run.checkExpiry();
      run.next();
    }
    expect(run.finished).toBe(true);
    session.retryQuickCheck();
    expect(session.activeRun!.round).toBe(2);
    expect(session.activeRun!.items).toHaveLength(8);
    expect(session.lastScore('shapes-rapid')).toEqual({ correct: 0, scored: 8, round: 1 });
    session.closeQuickCheck();
    expect(session.activeRun).toBeUndefined();
    session.openProblem('ramp-height');
    expect(session.activeAttempt?.problem.id).toBe('ramp-height');
  });
});
