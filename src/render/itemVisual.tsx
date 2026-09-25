import type { CSSProperties, ReactElement } from 'react';
import type {
  CalloutJson,
  ImageVisualJson,
  ItemVisualJson,
  PairVisualJson,
  PanelVisualJson,
  TypedSceneVisualJson,
  VisualJson,
} from '../contract/types';
import { visuals } from './visuals';

/** Revealed matching answers, per callout id: the correct term and whether Amy got it. */
export type CalloutReveal = Record<string, { term: string; ok?: boolean }>;

interface RenderOptions {
  reveal?: CalloutReveal;
}

/** Aspect ratio (width / height) of a typed scene, so callout percentages map onto it exactly. */
function sceneAspect(scene: VisualJson): number | undefined {
  if (scene.type === 'diagram2d/v1') return scene.viewBox[2] / scene.viewBox[3];
  if (scene.type === 'scene3d/v1') return 520 / 340;
  return undefined;
}

function CalloutMarkers({ callouts, reveal }: { callouts: CalloutJson[]; reveal?: CalloutReveal }) {
  return (
    <>
      {callouts.map((c) => {
        const shown = reveal?.[c.id];
        const state = shown === undefined ? '' : shown.ok === undefined ? ' revealed' : shown.ok ? ' revealed ok' : ' revealed wrong';
        return (
          <span
            key={c.id}
            className={`callout${state}`}
            style={{ left: `${c.xPct}%`, top: `${c.yPct}%` }}
            data-callout={c.id}
            aria-label={shown ? `Callout ${c.id}: ${shown.term}` : `Callout ${c.id}`}
          >
            <span className="callout-id">{c.id}</span>
            {shown && (
              <span className="callout-term">
                {shown.ok === undefined ? '' : shown.ok ? '✓ ' : '✗ '}
                {shown.term}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/** Wraps a visual in a box with the visual's exact aspect ratio, and overlays its callouts. */
function CalloutFrame({ aspect, callouts, reveal, children }: { aspect?: number; callouts?: CalloutJson[]; reveal?: CalloutReveal; children: ReactElement }) {
  const style = aspect ? ({ aspectRatio: String(aspect), '--frame-aspect': String(aspect) } as CSSProperties) : undefined;
  return (
    <div className={aspect ? 'callout-frame fixed-aspect' : 'callout-frame'} style={style}>
      {children}
      {callouts && callouts.length > 0 && <CalloutMarkers callouts={callouts} reveal={reveal} />}
    </div>
  );
}

/**
 * Renders one quick-check item visual kind. Adapters are registered by `kind`; typed scenes
 * delegate to the existing `latex/v1`, `diagram2d/v1` and `scene3d/v1` renderers.
 */
export abstract class ItemVisualAdapter<T extends ItemVisualJson = ItemVisualJson> {
  abstract readonly kind: T['kind'];
  abstract render(visual: T, options: RenderOptions): ReactElement;
  abstract altTexts(visual: T): string[];
}

class TypedSceneAdapter extends ItemVisualAdapter<TypedSceneVisualJson> {
  readonly kind = 'typedScene';
  render(visual: TypedSceneVisualJson, { reveal }: RenderOptions): ReactElement {
    return (
      <CalloutFrame aspect={sceneAspect(visual.scene)} callouts={visual.callouts} reveal={reveal}>
        {visuals.render(visual.scene)}
      </CalloutFrame>
    );
  }
  altTexts(visual: TypedSceneVisualJson): string[] {
    return [visual.scene.altText];
  }
}

class ImageAdapter extends ItemVisualAdapter<ImageVisualJson> {
  readonly kind = 'image';
  render(visual: ImageVisualJson, { reveal }: RenderOptions): ReactElement {
    // The data comes only from the loaded test file: validated PNG/JPEG base64, never a URL.
    return (
      <CalloutFrame aspect={visual.width / visual.height} callouts={visual.callouts} reveal={reveal}>
        <img className="item-image" src={`data:${visual.mediaType};base64,${visual.data}`} alt={visual.altText} width={visual.width} height={visual.height} />
      </CalloutFrame>
    );
  }
  altTexts(visual: ImageVisualJson): string[] {
    return [visual.altText];
  }
}

class PairAdapter extends ItemVisualAdapter<PairVisualJson> {
  readonly kind = 'pair';
  render(visual: PairVisualJson, options: RenderOptions): ReactElement {
    return (
      <div className="visual-pair" role="group" aria-label={visual.altText ?? 'Two pictures side by side'}>
        {visual.panels.map((panel, i) => (
          <figure key={i} className="pair-panel">
            {panel.caption && <figcaption className="pair-caption">{panel.caption}</figcaption>}
            {ITEM_VISUALS.render(panel, options)}
          </figure>
        ))}
      </div>
    );
  }
  altTexts(visual: PairVisualJson): string[] {
    return visual.panels.flatMap((panel: PanelVisualJson, i) => ITEM_VISUALS.altTexts(panel).map((t) => `${panel.caption ?? (i === 0 ? 'Left' : 'Right')}: ${t}`));
  }
}

export class ItemVisualRegistry {
  private readonly adapters = new Map<string, ItemVisualAdapter>();

  constructor(adapters: ItemVisualAdapter[]) {
    for (const a of adapters) this.adapters.set(a.kind, a);
  }

  render(visual: ItemVisualJson, options: RenderOptions = {}): ReactElement {
    const adapter = this.adapters.get(visual.kind);
    return adapter ? adapter.render(visual, options) : <p className="notice">Unsupported visual ({visual.kind}).</p>;
  }

  altTexts(visual: ItemVisualJson): string[] {
    return this.adapters.get(visual.kind)?.altTexts(visual) ?? [];
  }
}

export const ITEM_VISUALS = new ItemVisualRegistry([new TypedSceneAdapter(), new ImageAdapter(), new PairAdapter()] as ItemVisualAdapter[]);

/** Item visual plus a "Describe this picture" disclosure with every panel's alt text. */
export function ItemVisualView({ visual, reveal }: { visual: ItemVisualJson; reveal?: CalloutReveal }) {
  const alts = ITEM_VISUALS.altTexts(visual);
  return (
    <figure className="visual item-visual">
      {ITEM_VISUALS.render(visual, { reveal })}
      <details className="alt-text">
        <summary>Describe this picture</summary>
        {alts.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </details>
    </figure>
  );
}
