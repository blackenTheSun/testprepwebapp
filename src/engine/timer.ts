export type TimerState = 'ready' | 'running' | 'paused' | 'finished';

export type Clock = () => number;

/**
 * Elapsed-time study timer: `ready → running ⇄ paused → finished`. Finishing is permanent for
 * the attempt. Time lives only in memory; this is a study aid, not proctoring.
 */
export class StudyTimer {
  private _state: TimerState = 'ready';
  private accumulatedMs = 0;
  private runningSince?: number;

  constructor(private readonly clock: Clock = () => Date.now()) {}

  get state(): TimerState {
    return this._state;
  }

  elapsedMs(): number {
    const live = this.runningSince === undefined ? 0 : this.clock() - this.runningSince;
    return this.accumulatedMs + live;
  }

  start(): void {
    if (this._state !== 'ready' && this._state !== 'paused') return;
    this.runningSince = this.clock();
    this._state = 'running';
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.bank();
    this._state = 'paused';
  }

  finish(): void {
    if (this._state === 'finished') return;
    this.bank();
    this._state = 'finished';
  }

  private bank(): void {
    if (this.runningSince !== undefined) this.accumulatedMs += this.clock() - this.runningSince;
    this.runningSince = undefined;
  }
}
