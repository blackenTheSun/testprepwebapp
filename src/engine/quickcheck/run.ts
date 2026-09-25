import type { QuickCheckSetJson } from '../../contract/types';
import { Observable } from '../observable';
import type { Clock } from '../timer';
import { type ItemResponse, type ItemResult, QuickCheckItem, UNANSWERED } from './items';

/**
 * Where the current card is in its life:
 * - `answering`: waiting for Amy (the countdown runs here, if any)
 * - `recallRevealed`: a recall item's key is showing; waiting for Got It / Review
 * - `feedback`: immediate feedback for the answer just submitted
 * - `expired`: time ran out; Amy chooses Show answer or Next card
 * - `expiredAnswer`: time ran out and she chose to see the answer
 */
export type CardPhase = 'answering' | 'recallRevealed' | 'feedback' | 'expired' | 'expiredAnswer';

export interface CardRecord {
  item: QuickCheckItem;
  response?: ItemResponse;
  result: ItemResult;
  /** The card's countdown ran out. */
  expired: boolean;
}

/** Counts a per-card countdown from an injected clock. */
export class CardTimer {
  private deadline?: number;

  constructor(private readonly clock: Clock) {}

  start(seconds: number | undefined): void {
    this.deadline = seconds === undefined ? undefined : this.clock() + seconds * 1000;
  }

  stop(): void {
    this.deadline = undefined;
  }

  get running(): boolean {
    return this.deadline !== undefined;
  }

  remainingMs(): number | undefined {
    return this.deadline === undefined ? undefined : Math.max(0, this.deadline - this.clock());
  }

  get expired(): boolean {
    return this.deadline !== undefined && this.clock() >= this.deadline;
  }
}

/**
 * One pass through a quick-check set (or a retry subset) in authored order. Never shuffles,
 * never persists. `rapidVisual` sets run a per-card countdown when an item has `displaySeconds`.
 */
export class QuickCheckRun extends Observable {
  readonly items: QuickCheckItem[];
  private readonly records = new Map<string, CardRecord>();
  private readonly timer: CardTimer;
  private _index = 0;
  private _phase: CardPhase = 'answering';
  private _finished = false;

  constructor(
    readonly set: QuickCheckSetJson,
    items?: QuickCheckItem[],
    /** 1 for the first pass, 2+ for "Retry Missed and Review" rounds. */
    readonly round = 1,
    clock: Clock = () => Date.now(),
  ) {
    super();
    this.items = items ?? set.items.map((json, i) => QuickCheckItem.fromJson(json, i));
    this.timer = new CardTimer(clock);
    this.startCard();
  }

  get isRapid(): boolean {
    return this.set.presentationMode === 'rapidVisual';
  }

  get immediateFeedback(): boolean {
    return this.set.feedbackMode === 'immediate';
  }

  get index(): number {
    return this._index;
  }

  get current(): QuickCheckItem | undefined {
    return this._finished ? undefined : this.items[this._index];
  }

  get phase(): CardPhase {
    return this._phase;
  }

  get finished(): boolean {
    return this._finished;
  }

  /** Remaining milliseconds on the current card's countdown, or undefined when untimed. */
  remainingMs(): number | undefined {
    return this._phase === 'answering' ? this.timer.remainingMs() : undefined;
  }

  record(itemId: string): CardRecord | undefined {
    return this.records.get(itemId);
  }

  get currentRecord(): CardRecord | undefined {
    return this.current ? this.records.get(this.current.id) : undefined;
  }

  // ---- Actions ----------------------------------------------------------------------------

  /** Submit a closed answer (single choice, true/false, matching). */
  submit(response: ItemResponse): void {
    const item = this.current;
    if (!item || this._phase !== 'answering' || !item.isAutoScored) return;
    if (this.checkExpiry()) return;
    this.timer.stop();
    this.records.set(item.id, { item, response, result: item.score(response as never), expired: false });
    if (this.immediateFeedback) {
      this._phase = 'feedback';
      this.notify();
    } else {
      this.advance();
    }
  }

  /** Recall: show the model answer / key points / reference visual. */
  revealRecall(): void {
    const item = this.current;
    if (!item || item.isAutoScored || this._phase !== 'answering') return;
    if (this.checkExpiry()) return;
    this.timer.stop();
    this._phase = 'recallRevealed';
    this.notify();
  }

  /** Recall: self-mark after revealing. Recall is its own feedback, so this moves on. */
  markRecall(mark: 'gotIt' | 'review'): void {
    const item = this.current;
    if (!item || this._phase !== 'recallRevealed') return;
    this.records.set(item.id, { item, response: { kind: 'recall', mark }, result: item.score({ kind: 'recall', mark } as never), expired: false });
    this.advance();
  }

  /** After an expiry, reveal the correct answer for this card now. */
  showExpiredAnswer(): void {
    if (this._phase !== 'expired') return;
    this._phase = 'expiredAnswer';
    this.notify();
  }

  /** Continue from feedback or an expired card. */
  next(): void {
    if (this._phase === 'feedback' || this._phase === 'expired' || this._phase === 'expiredAnswer') this.advance();
  }

  /**
   * Called on each UI tick: if the countdown has run out while answering, record the card as
   * unanswered and offer Show answer / Next card. Returns true when it expired the card.
   */
  checkExpiry(): boolean {
    const item = this.current;
    if (!item || this._phase !== 'answering' || !this.timer.expired) return false;
    this.timer.stop();
    this.records.set(item.id, { item, result: UNANSWERED, expired: true });
    this._phase = 'expired';
    this.notify();
    return true;
  }

  // ---- Summary and retry -------------------------------------------------------------------

  summary(): RunSummary {
    return new RunSummary(this.items.map((item) => this.records.get(item.id) ?? { item, result: UNANSWERED, expired: false }));
  }

  /** A new run of the missed, unanswered and Review items, in authored order; undefined if none. */
  retry(clock?: Clock): QuickCheckRun | undefined {
    const items = this.summary().retryItems();
    return items.length > 0 ? new QuickCheckRun(this.set, items, this.round + 1, clock) : undefined;
  }

  private advance(): void {
    if (this._index + 1 >= this.items.length) {
      this._finished = true;
      this.timer.stop();
    } else {
      this._index += 1;
      this.startCard();
    }
    this.notify();
  }

  private startCard(): void {
    this._phase = 'answering';
    const seconds = this.isRapid ? this.items[this._index]?.displaySeconds : undefined;
    this.timer.start(seconds);
  }
}

/** End-of-run grouping: visual misses, unanswered cards, and recall items marked Review. */
export class RunSummary {
  constructor(readonly records: CardRecord[]) {}

  get misses(): CardRecord[] {
    return this.records.filter((r) => r.result.status === 'incorrect' || r.result.status === 'partial');
  }

  get unanswered(): CardRecord[] {
    return this.records.filter((r) => r.result.status === 'unanswered');
  }

  get review(): CardRecord[] {
    return this.records.filter((r) => r.result.status === 'review');
  }

  get correct(): CardRecord[] {
    return this.records.filter((r) => r.result.status === 'correct');
  }

  get gotIt(): CardRecord[] {
    return this.records.filter((r) => r.result.status === 'gotIt');
  }

  /** Auto-scored cards (everything except recall). */
  get scoredCount(): number {
    return this.records.filter((r) => r.item.isAutoScored).length;
  }

  retryItems(): QuickCheckItem[] {
    const retry = new Set([...this.misses, ...this.unanswered, ...this.review].map((r) => r.item.id));
    return this.records.filter((r) => retry.has(r.item.id)).map((r) => r.item);
  }
}
