import type {
  ItemVisualJson,
  MatchingItemJson,
  QuickCheckItemJson,
  RecallItemJson,
  SingleChoiceItemJson,
  TrueFalseItemJson,
} from '../../contract/types';

export type ResultStatus = 'correct' | 'incorrect' | 'partial' | 'unanswered' | 'gotIt' | 'review';

export interface ItemResult {
  status: ResultStatus;
  /** Matching only: per-callout correctness. */
  pairs?: Record<string, boolean>;
}

export type SingleChoiceResponse = { kind: 'singleChoice'; optionId: string };
export type TrueFalseResponse = { kind: 'trueFalse'; value: boolean };
export type MatchingResponse = { kind: 'matching'; selections: Record<string, string> };
export type RecallResponse = { kind: 'recall'; mark: 'gotIt' | 'review' };
export type ItemResponse = SingleChoiceResponse | TrueFalseResponse | MatchingResponse | RecallResponse;

export const UNANSWERED: ItemResult = { status: 'unanswered' };

/**
 * One card in a quick-check set. Subclasses score their own response type and describe the
 * correct answer for feedback and the summary. Scoring is always against authored answers.
 */
export abstract class QuickCheckItem<J extends QuickCheckItemJson = QuickCheckItemJson, R extends ItemResponse = ItemResponse> {
  constructor(
    readonly json: J,
    /** Position in the authored set (0-based), kept for retries. */
    readonly index: number,
  ) {}

  abstract readonly kind: J['type'];

  get id(): string {
    return this.json.id;
  }

  get displaySeconds(): number | undefined {
    return this.json.displaySeconds;
  }

  get visual(): ItemVisualJson | undefined {
    return 'visual' in this.json ? this.json.visual : undefined;
  }

  /** Recall items are self-marked, never machine-graded. */
  get isAutoScored(): boolean {
    return true;
  }

  /** The question text shown on the card. */
  abstract get promptText(): string;

  /** Author's teaching text for feedback. */
  abstract get explanation(): string | undefined;

  abstract score(response: R): ItemResult;

  /** Plain-text correct answer, for feedback and the summary. */
  abstract correctAnswerText(): string;

  /** Plain-text description of a response, for the summary. */
  abstract responseText(response: R): string;

  static fromJson(json: QuickCheckItemJson, index: number): QuickCheckItem {
    switch (json.type) {
      case 'singleChoice':
        return new SingleChoiceItem(json, index);
      case 'trueFalse':
        return new TrueFalseItem(json, index);
      case 'matching':
        return new MatchingItem(json, index);
      case 'recall':
        return new RecallItem(json, index);
    }
  }
}

/** Visual identification and visual comparison (a `pair` visual). */
export class SingleChoiceItem extends QuickCheckItem<SingleChoiceItemJson, SingleChoiceResponse> {
  readonly kind = 'singleChoice';

  get promptText(): string {
    return this.json.prompt;
  }

  get explanation(): string {
    return this.json.explanation;
  }

  get options(): { id: string; text: string }[] {
    return this.json.options;
  }

  score(response: SingleChoiceResponse): ItemResult {
    return { status: response.optionId === this.json.correctOptionId ? 'correct' : 'incorrect' };
  }

  correctAnswerText(): string {
    return this.optionText(this.json.correctOptionId);
  }

  responseText(response: SingleChoiceResponse): string {
    return this.optionText(response.optionId);
  }

  private optionText(id: string): string {
    return this.json.options.find((o) => o.id === id)?.text ?? id;
  }
}

export class TrueFalseItem extends QuickCheckItem<TrueFalseItemJson, TrueFalseResponse> {
  readonly kind = 'trueFalse';

  get promptText(): string {
    return this.json.statement;
  }

  get explanation(): string {
    return this.json.explanation;
  }

  score(response: TrueFalseResponse): ItemResult {
    return { status: response.value === this.json.answer ? 'correct' : 'incorrect' };
  }

  correctAnswerText(): string {
    return this.json.answer ? 'True' : 'False';
  }

  responseText(response: TrueFalseResponse): string {
    return response.value ? 'True' : 'False';
  }
}

/** Diagram-label matching: one term per callout, one-to-one, from a bank that may hold decoys. */
export class MatchingItem extends QuickCheckItem<MatchingItemJson, MatchingResponse> {
  readonly kind = 'matching';

  get promptText(): string {
    return this.json.prompt ?? 'Match each marked callout to its label.';
  }

  get explanation(): string | undefined {
    return this.json.explanation;
  }

  get prompts(): { id: string; text: string }[] {
    return this.json.prompts;
  }

  get terms(): string[] {
    return this.json.options;
  }

  correctTerm(calloutId: string): string {
    return this.json.answers[calloutId];
  }

  /** A label may be placed on several callouts (pieces are never used up). */
  get allowReuse(): boolean {
    return this.json.allowReuse === true;
  }

  /**
   * Places `term` on callout `to`. `from` is the callout it was dragged from, or undefined when it
   * came from the bank. Without reuse a term lives on at most one callout: moving a piece onto an
   * occupied slot swaps the two pieces, and a piece displaced by one from the bank returns to the
   * bank. With reuse, bank pieces are copies and moving between slots just moves.
   */
  place(selections: Readonly<Record<string, string>>, term: string, to: string, from?: string): Record<string, string> {
    const next = { ...selections };
    if (from === to) return next;
    const displaced = next[to];
    if (from !== undefined) {
      if (!this.allowReuse && displaced) next[from] = displaced;
      else delete next[from];
    } else if (!this.allowReuse) {
      for (const [id, placed] of Object.entries(next)) if (placed === term) delete next[id];
    }
    next[to] = term;
    return next;
  }

  /** Takes the piece off callout `id` (it returns to the bank). */
  remove(selections: Readonly<Record<string, string>>, id: string): Record<string, string> {
    const next = { ...selections };
    delete next[id];
    return next;
  }

  /** Terms not placed on any callout (the whole bank when reuse is allowed). */
  bankTerms(selections: Readonly<Record<string, string>>): string[] {
    if (this.allowReuse) return this.json.options;
    const placed = new Set(Object.values(selections).filter(Boolean));
    return this.json.options.filter((term) => !placed.has(term));
  }

  /** True when every callout has a term (and, without reuse, no term is used twice). */
  isComplete(selections: Readonly<Record<string, string>>): boolean {
    const picked = this.json.prompts.map((p) => selections[p.id]).filter(Boolean);
    if (picked.length !== this.json.prompts.length) return false;
    return this.allowReuse || new Set(picked).size === picked.length;
  }

  score(response: MatchingResponse): ItemResult {
    const pairs: Record<string, boolean> = {};
    for (const prompt of this.json.prompts) pairs[prompt.id] = response.selections[prompt.id] === this.json.answers[prompt.id];
    const right = Object.values(pairs).filter(Boolean).length;
    const status = right === this.json.prompts.length ? 'correct' : right === 0 ? 'incorrect' : 'partial';
    return { status, pairs };
  }

  correctAnswerText(): string {
    return this.json.prompts.map((p) => `${p.id}: ${this.json.answers[p.id]}`).join('; ');
  }

  responseText(response: MatchingResponse): string {
    return this.json.prompts.map((p) => `${p.id}: ${response.selections[p.id] ?? '—'}`).join('; ');
  }
}

/** Paper-first recall: reveal the authored key, then self-mark Got It or Review. */
export class RecallItem extends QuickCheckItem<RecallItemJson, RecallResponse> {
  readonly kind = 'recall';

  override get isAutoScored(): boolean {
    return false;
  }

  get promptText(): string {
    return this.json.prompt;
  }

  get explanation(): string | undefined {
    return this.json.modelAnswer;
  }

  get keyPoints(): string[] {
    return this.json.keyPoints ?? [];
  }

  get referenceVisual(): ItemVisualJson | undefined {
    return this.json.referenceVisual;
  }

  score(response: RecallResponse): ItemResult {
    return { status: response.mark };
  }

  correctAnswerText(): string {
    return [this.json.modelAnswer, ...this.keyPoints].filter(Boolean).join(' • ');
  }

  responseText(response: RecallResponse): string {
    return response.mark === 'gotIt' ? 'Got It' : 'Review';
  }
}
