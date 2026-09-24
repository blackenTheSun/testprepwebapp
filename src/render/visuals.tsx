import type { ReactElement } from 'react';
import type { Diagram2dJson, LatexVisualJson, Scene3dJson, VisualJson } from '../contract/types';
import { Diagram2D } from './diagram2d';
import { TexLines } from './Latex';
import { Scene3D } from './scene3d';

/** Renders one visual `type`. New visual kinds are added by registering another adapter. */
export abstract class VisualAdapter<T extends VisualJson = VisualJson> {
  abstract readonly type: T['type'];
  abstract render(visual: T): ReactElement;
}

class LatexVisualAdapter extends VisualAdapter<LatexVisualJson> {
  readonly type = 'latex/v1';
  render(visual: LatexVisualJson): ReactElement {
    return (
      <div className="latex-visual" role="img" aria-label={visual.altText} data-visual="latex/v1">
        <TexLines latex={visual.latex} />
      </div>
    );
  }
}

class Diagram2DAdapter extends VisualAdapter<Diagram2dJson> {
  readonly type = 'diagram2d/v1';
  render(visual: Diagram2dJson): ReactElement {
    return <Diagram2D visual={visual} />;
  }
}

class Scene3DAdapter extends VisualAdapter<Scene3dJson> {
  readonly type = 'scene3d/v1';
  render(visual: Scene3dJson): ReactElement {
    return <Scene3D visual={visual} />;
  }
}

export class VisualRegistry {
  private readonly adapters = new Map<string, VisualAdapter>();

  constructor(adapters: VisualAdapter[]) {
    for (const adapter of adapters) this.adapters.set(adapter.type, adapter);
  }

  render(visual: VisualJson): ReactElement {
    const adapter = this.adapters.get(visual.type);
    if (!adapter) return <p className="notice">This visual type ({visual.type}) is not supported.</p>;
    return adapter.render(visual);
  }
}

export const visuals = new VisualRegistry([
  new LatexVisualAdapter(),
  new Diagram2DAdapter(),
  new Scene3DAdapter(),
] as VisualAdapter[]);

/** Visual with its alt text available to everyone in a disclosure. */
export function VisualView({ visual }: { visual: VisualJson }) {
  return (
    <figure className="visual">
      {visuals.render(visual)}
      <details className="alt-text">
        <summary>Describe this picture</summary>
        <p>{visual.altText}</p>
      </details>
    </figure>
  );
}
