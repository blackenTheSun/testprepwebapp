import type { ValidationIssue } from '../contract/validate';
import { Attempt } from './attempt';
import { Observable } from './observable';
import { QuickCheckRun } from './quickcheck/run';
import type { Problem, TestFile } from './testFile';
import type { Clock } from './timer';

/** Result of the most recent finished run of a quick-check set (this session only). */
export interface QuickCheckScore {
  correct: number;
  scored: number;
  round: number;
}

/**
 * Everything for one loaded test: its problems, load warnings, one attempt per opened problem,
 * the active quick-check run, and what is on screen. Loading another test creates a new Session, which cleanly
 * replaces all of this.
 */
export class Session extends Observable {
  private readonly attempts = new Map<string, Attempt>();
  private _activeProblemId?: string;
  private _activeRun?: QuickCheckRun;
  private readonly lastScores = new Map<string, QuickCheckScore>();

  constructor(
    readonly test: TestFile,
    readonly warnings: readonly ValidationIssue[] = [],
    readonly sourceName = '',
    private readonly clock?: Clock,
  ) {
    super();
  }

  get activeProblem(): Problem | undefined {
    return this._activeProblemId ? this.test.problem(this._activeProblemId) : undefined;
  }

  get activeAttempt(): Attempt | undefined {
    const problem = this.activeProblem;
    return problem ? this.attemptFor(problem) : undefined;
  }

  attemptFor(problem: Problem): Attempt {
    let attempt = this.attempts.get(problem.id);
    if (!attempt) {
      attempt = new Attempt(problem, this.clock);
      this.attempts.set(problem.id, attempt);
    }
    return attempt;
  }

  hasAttempt(problemId: string): boolean {
    return this.attempts.has(problemId);
  }

  openProblem(problemId: string): void {
    this.pauseActive();
    this._activeRun = undefined;
    this._activeProblemId = problemId;
    this.notify();
  }

  // ---- Quick checks (v2) ---------------------------------------------------------------------

  get activeRun(): QuickCheckRun | undefined {
    return this._activeRun;
  }

  /** Starts a fresh first-round run of a quick-check set. */
  startQuickCheck(setId: string): void {
    const set = this.test.quickCheckSets.find((s) => s.id === setId);
    if (!set) return;
    this.pauseActive();
    this._activeProblemId = undefined;
    this._activeRun = new QuickCheckRun(set, undefined, 1, this.clock);
    this.notify();
  }

  /** "Retry Missed and Review": replaces the finished run with one built from its misses. */
  retryQuickCheck(): void {
    const next = this._activeRun?.retry(this.clock);
    if (!next) return;
    this.rememberScore(this._activeRun);
    this._activeRun = next;
    this.notify();
  }

  closeQuickCheck(): void {
    this.rememberScore(this._activeRun);
    this._activeRun = undefined;
    this.notify();
  }

  /** Score of the most recent finished run (any round) of a set, this session only. */
  lastScore(setId: string): QuickCheckScore | undefined {
    return this.lastScores.get(setId);
  }

  private rememberScore(run: QuickCheckRun | undefined): void {
    if (!run?.finished) return;
    const summary = run.summary();
    this.lastScores.set(run.set.id, { correct: summary.correct.length, scored: summary.scoredCount, round: run.round });
  }

  /** Back to the problem list. A running timer is paused, not lost. */
  closeProblem(): void {
    this.pauseActive();
    this._activeProblemId = undefined;
    this.notify();
  }

  /** Clears only this problem's attempt; the loaded test and other attempts are untouched. */
  resetProblem(problemId: string): void {
    this.attempts.delete(problemId);
    this.notify();
  }

  warningsFor(problem: Problem): ValidationIssue[] {
    const prefix = `/problems/${problem.index}/`;
    return this.warnings.filter((w) => w.path.startsWith(prefix));
  }

  private pauseActive(): void {
    const attempt = this.activeAttempt;
    if (attempt?.timer.state === 'running') attempt.pause();
  }
}
