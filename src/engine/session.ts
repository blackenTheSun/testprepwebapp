import type { ValidationIssue } from '../contract/validate';
import { Attempt } from './attempt';
import { Observable } from './observable';
import type { Problem, TestFile } from './testFile';
import type { Clock } from './timer';

/**
 * Everything for one loaded test: its problems, load warnings, one attempt per opened problem,
 * and which problem is on screen. Loading another test creates a new Session, which cleanly
 * replaces all of this.
 */
export class Session extends Observable {
  private readonly attempts = new Map<string, Attempt>();
  private _activeProblemId?: string;

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
    this._activeProblemId = problemId;
    this.notify();
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
