import { base64ByteLength, decodeBase64, inspectRaster } from './imageInfo';
import type { ItemVisualJson, PanelVisualJson, QuickCheckItemJson, QuickCheckSetJson, TestFileJson } from './types';
import { type ValidationReport, ValidationRule } from './validate';

/** Asset-size guardrails for embedded pictures (see DECISIONS.md). */
export const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;
export const IMAGE_WARN_BYTES = 400 * 1024;
export const FILE_MAX_BYTES = 20 * 1024 * 1024;

interface ItemRef {
  set: QuickCheckSetJson;
  item: QuickCheckItemJson;
  path: string;
}

/** Base for rules over quick-check items: iterates sets and items with their JSON paths. */
abstract class QuickCheckRule extends ValidationRule {
  check(file: TestFileJson, report: ValidationReport): void {
    (file.quickCheckSets ?? []).forEach((set, si) => {
      set.items.forEach((item, ii) => this.checkItem({ set, item, path: `/quickCheckSets/${si}/items/${ii}` }, report));
    });
  }

  protected abstract checkItem(ref: ItemRef, report: ValidationReport): void;
}

/** Every visual on an item (the main one, and a recall item's reference), with JSON paths. */
export function itemVisuals(item: QuickCheckItemJson, path: string): { visual: ItemVisualJson; path: string }[] {
  const list: { visual: ItemVisualJson; path: string }[] = [];
  if ('visual' in item && item.visual) list.push({ visual: item.visual, path: `${path}/visual` });
  if (item.type === 'recall' && item.referenceVisual) list.push({ visual: item.referenceVisual, path: `${path}/referenceVisual` });
  return list;
}

/** The panels of an item visual (one, or two for a pair), with their JSON paths. */
export function panelsOf(visual: ItemVisualJson | undefined, path: string): { panel: PanelVisualJson; path: string }[] {
  if (!visual) return [];
  if (visual.kind === 'pair') return visual.panels.map((panel, i) => ({ panel, path: `${path}/panels/${i}` }));
  return [{ panel: visual, path }];
}

/** A v2 file must contain at least one worked problem or quick-check set. */
export class ActivityPresenceRule extends ValidationRule {
  readonly name = 'activity-presence';
  check(file: TestFileJson, report: ValidationReport): void {
    if (file.problems.length === 0 && (file.quickCheckSets ?? []).length === 0) {
      report.error(this.name, '/', 'A v2 test needs at least one worked problem ("problems") or quick-check set ("quickCheckSets")');
    }
  }
}

export class QuickCheckIdRule extends ValidationRule {
  readonly name = 'quick-check-ids';
  check(file: TestFileJson, report: ValidationReport): void {
    const setIds = new Map<string, string>();
    (file.quickCheckSets ?? []).forEach((set, si) => {
      const path = `/quickCheckSets/${si}/id`;
      const prior = setIds.get(set.id);
      if (prior) report.error(this.name, path, `Duplicate quick-check set id "${set.id}" (first used at ${prior})`);
      else setIds.set(set.id, path);
      const itemIds = new Map<string, string>();
      set.items.forEach((item, ii) => {
        const itemPath = `/quickCheckSets/${si}/items/${ii}/id`;
        const first = itemIds.get(item.id);
        if (first) report.error(this.name, itemPath, `Duplicate item id "${item.id}" in this set (first used at ${first})`);
        else itemIds.set(item.id, itemPath);
      });
    });
  }
}

/**
 * Embedded pictures must be real PNG/JPEG bytes matching their declared type, within the size
 * guardrails, with non-blank alt text. Typed scenes must have non-blank alt text too.
 */
export class VisualAssetRule extends QuickCheckRule {
  readonly name = 'visual-assets';

  protected checkItem({ item, path }: ItemRef, report: ValidationReport): void {
    const panels = itemVisuals(item, path).flatMap((v) => panelsOf(v.visual, v.path));
    for (const { panel, path: panelPath } of panels) {
      if (panel.kind === 'typedScene') {
        if (!panel.scene.altText.trim()) report.error(this.name, `${panelPath}/scene/altText`, 'Alt text must not be blank');
      } else {
        this.checkImage(panel, panelPath, report);
      }
    }
  }

  private checkImage(panel: Extract<PanelVisualJson, { kind: 'image' }>, path: string, report: ValidationReport): void {
    if (!panel.altText.trim()) report.error(this.name, `${path}/altText`, 'Alt text must not be blank');
    const declaredBytes = base64ByteLength(panel.data);
    if (declaredBytes > IMAGE_MAX_BYTES) {
      report.error(this.name, `${path}/data`, `Image is ${formatKb(declaredBytes)}; the limit is ${formatKb(IMAGE_MAX_BYTES)}. Resize or compress it.`);
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(panel.data);
    } catch {
      report.error(this.name, `${path}/data`, 'Image data is not valid base64');
      return;
    }
    const info = inspectRaster(bytes);
    if (!info) {
      report.error(this.name, `${path}/data`, 'Unsupported image data: only PNG and JPEG pictures are allowed');
      return;
    }
    if (info.type !== panel.mediaType) {
      report.error(this.name, `${path}/mediaType`, `Declared ${panel.mediaType}, but the data is ${info.type}`);
    }
    if (info.bytes > IMAGE_WARN_BYTES) {
      report.warning(this.name, `${path}/data`, `Image is ${formatKb(info.bytes)}; consider compressing it below ${formatKb(IMAGE_WARN_BYTES)}`);
    }
    if (Math.abs(info.width / info.height - panel.width / panel.height) > 0.01) {
      report.warning(
        this.name,
        `${path}/width`,
        `Declared size ${panel.width}×${panel.height} has a different shape from the picture (${info.width}×${info.height}); callouts may land in the wrong place`,
      );
    }
  }
}

/** Callout ids are unique within an item's visual (positions 0–100 are enforced by the schema). */
export class CalloutRule extends QuickCheckRule {
  readonly name = 'callouts';
  protected checkItem({ item, path }: ItemRef, report: ValidationReport): void {
    for (const visual of itemVisuals(item, path)) {
      const seen = new Set<string>();
      for (const { panel, path: panelPath } of panelsOf(visual.visual, visual.path)) {
        (panel.callouts ?? []).forEach((callout, ci) => {
          if (seen.has(callout.id)) report.error(this.name, `${panelPath}/callouts/${ci}/id`, `Duplicate callout id "${callout.id}"`);
          seen.add(callout.id);
        });
      }
    }
  }
}

export class SingleChoiceRule extends QuickCheckRule {
  readonly name = 'single-choice';
  protected checkItem({ item, path }: ItemRef, report: ValidationReport): void {
    if (item.type !== 'singleChoice') return;
    const ids = new Set<string>();
    item.options.forEach((option, oi) => {
      if (ids.has(option.id)) report.error(this.name, `${path}/options/${oi}/id`, `Duplicate option id "${option.id}"`);
      ids.add(option.id);
    });
    if (!ids.has(item.correctOptionId)) {
      report.error(this.name, `${path}/correctOptionId`, `"${item.correctOptionId}" is not one of this item's option ids`);
    }
  }
}

/**
 * Diagram-label matching: one prompt per callout, a term bank at least as large as the callout
 * count (decoys allowed), a complete answer map, answers drawn from the bank, and no term used as
 * the correct answer twice.
 */
export class MatchingRule extends QuickCheckRule {
  readonly name = 'matching';
  protected checkItem({ item, path }: ItemRef, report: ValidationReport): void {
    if (item.type !== 'matching') return;
    if (item.visual.kind === 'pair') {
      report.error(this.name, `${path}/visual/kind`, 'Diagram-label matching needs a single typedScene or image visual, not a pair');
      return;
    }
    const callouts = (item.visual.callouts ?? []).map((c) => c.id);
    if (callouts.length < 2) report.error(this.name, `${path}/visual/callouts`, `Needs at least 2 callouts, found ${callouts.length}`);

    const promptIds = new Set(item.prompts.map((p) => p.id));
    for (const id of callouts) {
      if (!promptIds.has(id)) report.error(this.name, `${path}/prompts`, `Callout "${id}" has no prompt`);
    }
    item.prompts.forEach((prompt, pi) => {
      if (!callouts.includes(prompt.id)) report.error(this.name, `${path}/prompts/${pi}/id`, `Prompt "${prompt.id}" has no matching callout on the visual`);
    });

    const bank = new Set<string>();
    item.options.forEach((term, oi) => {
      if (bank.has(term)) report.error(this.name, `${path}/options/${oi}`, `Duplicate term "${term}" in the label bank`);
      bank.add(term);
    });
    if (bank.size < callouts.length) {
      report.error(this.name, `${path}/options`, `The label bank has ${bank.size} term(s) but there are ${callouts.length} callouts; it must be at least as large`);
    }

    const used = new Map<string, string>();
    for (const id of callouts) {
      const answer = item.answers[id];
      if (answer === undefined) {
        report.error(this.name, `${path}/answers`, `Missing answer for callout "${id}"`);
        continue;
      }
      if (!bank.has(answer)) report.error(this.name, `${path}/answers/${id}`, `"${answer}" is not in the label bank`);
      const prior = used.get(answer);
      if (prior) report.error(this.name, `${path}/answers/${id}`, `"${answer}" is already the correct label for callout "${prior}"; each label can be correct only once`);
      else used.set(answer, id);
    }
    for (const key of Object.keys(item.answers)) {
      if (!callouts.includes(key)) report.error(this.name, `${path}/answers/${key}`, `Answer given for "${key}", which is not a callout`);
    }
  }
}

export class RecallRule extends QuickCheckRule {
  readonly name = 'recall';
  protected checkItem({ item, path }: ItemRef, report: ValidationReport): void {
    if (item.type !== 'recall') return;
    if (!item.modelAnswer?.trim() && !(item.keyPoints && item.keyPoints.length > 0)) {
      report.error(this.name, path, 'A recall item needs a "modelAnswer" or "keyPoints" for Amy to compare against');
    }
  }
}

/** rapidVisual sets are picture cards; per-card timers only apply there. */
export class RapidVisualRule extends QuickCheckRule {
  readonly name = 'rapid-visual';
  protected checkItem({ set, item, path }: ItemRef, report: ValidationReport): void {
    const hasVisual = 'visual' in item && item.visual !== undefined;
    if (set.presentationMode === 'rapidVisual' && !hasVisual) {
      report.error(this.name, `${path}/visual`, 'Items in a rapidVisual set must have a visual');
    }
    if (set.presentationMode === 'standard' && item.displaySeconds !== undefined) {
      report.warning(this.name, `${path}/displaySeconds`, 'displaySeconds is only used in rapidVisual sets and is ignored here');
    }
  }
}

function formatKb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function formatFileSize(bytes: number): string {
  return formatKb(bytes);
}
