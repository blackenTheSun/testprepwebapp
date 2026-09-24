import type { ReactNode } from 'react';
import type { Scene3dCameraJson, Scene3dJson, Scene3dObjectJson, Vec3 } from '../contract/types';
import { SvgLabel } from './SvgLabel';

type Of<K extends Scene3dObjectJson['kind']> = Scene3dObjectJson & { kind: K };

// ---- Vector helpers ------------------------------------------------------------

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

/** A projected point: screen-plane x/y (y up, before fitting) and depth toward the camera. */
export interface Projected {
  x: number;
  y: number;
  depth: number;
}

/**
 * Static camera looking at the origin. World convention: **z is up**; azimuth is measured in the
 * x-y plane from +x toward +y, and elevation upward from that plane.
 */
export class Camera {
  readonly toward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly perspective: boolean;
  readonly zoom: number;
  private distance = 10;

  constructor(json: Scene3dCameraJson) {
    const az = (json.azimuthDeg * Math.PI) / 180;
    const el = (json.elevationDeg * Math.PI) / 180;
    this.toward = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    this.right = [-Math.sin(az), Math.cos(az), 0];
    this.up = normalize(cross(this.right, scale(this.toward, -1)));
    this.perspective = json.projection === 'perspective';
    this.zoom = json.scale && json.scale > 0 ? json.scale : 1;
  }

  /** Perspective places the eye at 3× the scene radius from the origin. */
  fitScene(radius: number): void {
    this.distance = Math.max(radius, 1e-6) * 3;
  }

  project(p: Vec3): Projected {
    const depth = dot(p, this.toward);
    const factor = this.perspective ? this.distance / Math.max(this.distance - depth, 1e-6) : 1;
    return { x: dot(p, this.right) * factor, y: dot(p, this.up) * factor, depth };
  }

  /** True when a face with this outward normal points at the camera. */
  faces(normal: Vec3): boolean {
    return dot(normal, this.toward) > 1e-9;
  }
}

// ---- Drawables ------------------------------------------------------------------

export type Drawable =
  | { kind: 'polygon'; points: Projected[]; depth: number; shade: number; className: string; color?: string }
  | { kind: 'segment'; a: Projected; b: Projected; depth: number; arrow: boolean; className: string; color?: string }
  | { kind: 'dot'; at: Projected; depth: number; className: string; color?: string }
  | { kind: 'text'; at: Projected; text: string; depth: number; dx: number; dy: number; className: string; color?: string };

const avgDepth = (points: Projected[]) => points.reduce((s, p) => s + p.depth, 0) / points.length;

/**
 * One object in a `scene3d/v1` scene. Subclasses expose their world-space points (for fitting)
 * and turn themselves into projected drawables for the painter's-algorithm renderer.
 */
export abstract class Object3D<T extends Scene3dObjectJson = Scene3dObjectJson> {
  constructor(readonly json: T) {}

  abstract points(): Vec3[];

  abstract drawables(camera: Camera): Drawable[];

  protected get cls(): string {
    return this.json.highlight ? 'sc-item sc-highlight' : 'sc-item';
  }

  protected label(camera: Camera, at: Vec3, text = this.json.label, dx = 8, dy = -8): Drawable[] {
    if (!text) return [];
    const p = camera.project(at);
    return [{ kind: 'text', at: p, text, depth: p.depth, dx, dy, className: this.cls, color: this.json.color }];
  }

  static create(json: Scene3dObjectJson): Object3D {
    const cls = OBJECTS_3D[json.kind] as new (json: Scene3dObjectJson) => Object3D;
    return new cls(json);
  }
}

class AxesObject extends Object3D<Of<'axes'>> {
  points(): Vec3[] {
    const L = this.json.length;
    return [[0, 0, 0], [L, 0, 0], [0, L, 0], [0, 0, L]];
  }
  drawables(camera: Camera): Drawable[] {
    const L = this.json.length;
    const labels = this.json.labels ?? ['x', 'y', 'z'];
    const o = camera.project([0, 0, 0]);
    const tips: Vec3[] = [[L, 0, 0], [0, L, 0], [0, 0, L]];
    return tips.flatMap((tip, i) => {
      const b = camera.project(tip);
      return [
        { kind: 'segment', a: o, b, depth: (o.depth + b.depth) / 2, arrow: true, className: `${this.cls} sc-axis`, color: this.json.color },
        ...this.label(camera, scale(tip, 1.08), labels[i], 4, 4),
      ] as Drawable[];
    });
  }
}

class PointObject extends Object3D<Of<'point'>> {
  points(): Vec3[] {
    return [this.json.at];
  }
  drawables(camera: Camera): Drawable[] {
    const p = camera.project(this.json.at);
    return [{ kind: 'dot', at: p, depth: p.depth, className: this.cls, color: this.json.color }, ...this.label(camera, this.json.at)];
  }
}

class SegmentObject extends Object3D<Of<'line' | 'arrow'>> {
  points(): Vec3[] {
    return [this.json.from, this.json.to];
  }
  drawables(camera: Camera): Drawable[] {
    const a = camera.project(this.json.from);
    const b = camera.project(this.json.to);
    const labelAt = this.json.kind === 'arrow' ? this.json.to : scale(add(this.json.from, this.json.to), 0.5);
    return [
      { kind: 'segment', a, b, depth: (a.depth + b.depth) / 2, arrow: this.json.kind === 'arrow', className: this.cls, color: this.json.color },
      ...this.label(camera, labelAt),
    ];
  }
}

class PlaneObject extends Object3D<Of<'plane'>> {
  private corners(): Vec3[] {
    const { origin, u, v } = this.json;
    return [origin, add(origin, u), add(add(origin, u), v), add(origin, v)];
  }
  points(): Vec3[] {
    return this.corners();
  }
  drawables(camera: Camera): Drawable[] {
    const points = this.corners().map((c) => camera.project(c));
    const center = scale(this.corners().reduce(add), 0.25);
    return [
      { kind: 'polygon', points, depth: avgDepth(points), shade: 0.5, className: `${this.cls} sc-plane`, color: this.json.color },
      ...this.label(camera, center, this.json.label, 0, -4),
    ];
  }
}

/** Shared solid drawing: emits only faces that point toward the camera, shaded by orientation. */
abstract class SolidObject<T extends Of<'box' | 'cylinder'>> extends Object3D<T> {
  protected abstract faces(): { corners: Vec3[]; normal: Vec3 }[];
  protected abstract labelAnchor(): Vec3;

  points(): Vec3[] {
    return this.faces().flatMap((f) => f.corners);
  }

  drawables(camera: Camera): Drawable[] {
    const faces: Drawable[] = this.faces()
      .filter((f) => camera.faces(f.normal))
      .map((f) => {
        const points = f.corners.map((c) => camera.project(c));
        // Faces turned toward the viewer and toward "up" read lighter.
        const shade = 0.35 + 0.45 * Math.max(0, dot(normalize(f.normal), camera.toward)) + 0.2 * Math.max(0, f.normal[2]);
        return { kind: 'polygon', points, depth: avgDepth(points), shade: Math.min(shade, 1), className: `${this.cls} sc-solid`, color: this.json.color };
      });
    return [...faces, ...this.label(camera, this.labelAnchor(), this.json.label, 0, -10)];
  }
}

class BoxObject extends SolidObject<Of<'box'>> {
  protected faces() {
    const [cx, cy, cz] = this.json.center;
    const [hx, hy, hz] = scale(this.json.size, 0.5);
    const c = (sx: number, sy: number, sz: number): Vec3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz];
    return [
      { normal: [1, 0, 0] as Vec3, corners: [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)] },
      { normal: [-1, 0, 0] as Vec3, corners: [c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1)] },
      { normal: [0, 1, 0] as Vec3, corners: [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)] },
      { normal: [0, -1, 0] as Vec3, corners: [c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)] },
      { normal: [0, 0, 1] as Vec3, corners: [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)] },
      { normal: [0, 0, -1] as Vec3, corners: [c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1)] },
    ];
  }
  protected labelAnchor(): Vec3 {
    return add(this.json.center, [0, 0, this.json.size[2] / 2]);
  }
}

class CylinderObject extends SolidObject<Of<'cylinder'>> {
  private static readonly SEGMENTS = 24;

  protected faces() {
    const { from, to, radius } = this.json;
    const axis = normalize(sub(to, from));
    const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = normalize(cross(axis, helper));
    const e2 = cross(axis, e1);
    const n = CylinderObject.SEGMENTS;
    const ring = (center: Vec3) =>
      Array.from({ length: n }, (_, i) => {
        const t = (2 * Math.PI * i) / n;
        return add(center, add(scale(e1, radius * Math.cos(t)), scale(e2, radius * Math.sin(t))));
      });
    const bottom = ring(from);
    const top = ring(to);
    const sides = bottom.map((_, i) => {
      const j = (i + 1) % n;
      const mid = (2 * Math.PI * (i + 0.5)) / n;
      return { corners: [bottom[i], bottom[j], top[j], top[i]], normal: add(scale(e1, Math.cos(mid)), scale(e2, Math.sin(mid))) };
    });
    return [...sides, { corners: [...top].reverse(), normal: axis }, { corners: bottom, normal: scale(axis, -1) }];
  }
  protected labelAnchor(): Vec3 {
    return scale(add(this.json.from, this.json.to), 0.5);
  }
}

class LabelObject extends Object3D<Of<'label'>> {
  points(): Vec3[] {
    return [this.json.at];
  }
  drawables(camera: Camera): Drawable[] {
    return this.label(camera, this.json.at, this.json.text ?? this.json.label, 0, 0);
  }
}

const OBJECTS_3D: Record<Scene3dObjectJson['kind'], new (json: never) => Object3D> = {
  axes: AxesObject,
  point: PointObject,
  line: SegmentObject,
  arrow: SegmentObject,
  plane: PlaneObject,
  box: BoxObject,
  cylinder: CylinderObject,
  label: LabelObject,
};

// ---- Scene ------------------------------------------------------------------------

const VIEW_W = 520;
const VIEW_H = 340;
const PAD = 40;

/** Builds, projects, depth-sorts and fits every object in a scene to the SVG viewport. */
export class SceneProjector {
  readonly camera: Camera;
  readonly objects: Object3D[];

  constructor(readonly scene: Scene3dJson) {
    this.camera = new Camera(scene.camera);
    this.objects = scene.objects.map((o) => Object3D.create(o));
    const radius = Math.max(0, ...this.objects.flatMap((o) => o.points()).map(length));
    this.camera.fitScene(radius);
  }

  /** Drawables sorted far → near, with text always on top; plus the screen transform. */
  layout(): { drawables: Drawable[]; toScreen: (p: Projected) => { x: number; y: number } } {
    const drawables = this.objects.flatMap((o) => o.drawables(this.camera));
    const all = drawables.flatMap((d) => (d.kind === 'polygon' ? d.points : d.kind === 'segment' ? [d.a, d.b] : [d.at]));
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((VIEW_W - 2 * PAD) / (maxX - minX || 1), (VIEW_H - 2 * PAD) / (maxY - minY || 1)) * this.camera.zoom;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toScreen = (p: Projected) => ({ x: VIEW_W / 2 + (p.x - cx) * s, y: VIEW_H / 2 - (p.y - cy) * s });
    const text = drawables.filter((d) => d.kind === 'text');
    const rest = drawables.filter((d) => d.kind !== 'text').sort((a, b) => a.depth - b.depth);
    return { drawables: [...rest, ...text], toScreen };
  }
}

function arrowHeadPoints(a: { x: number; y: number }, b: { x: number; y: number }, size = 10): string {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const l = { x: b.x - size * Math.cos(angle - Math.PI / 7), y: b.y - size * Math.sin(angle - Math.PI / 7) };
  const r = { x: b.x - size * Math.cos(angle + Math.PI / 7), y: b.y - size * Math.sin(angle + Math.PI / 7) };
  return `${b.x},${b.y} ${l.x},${l.y} ${r.x},${r.y}`;
}

function drawDrawable(d: Drawable, toScreen: (p: Projected) => { x: number; y: number }, key: number): ReactNode {
  const style = d.color ? { stroke: d.color, color: d.color } : undefined;
  switch (d.kind) {
    case 'polygon': {
      const pts = d.points.map(toScreen).map((p) => `${p.x},${p.y}`).join(' ');
      return <polygon key={key} points={pts} className={d.className} style={{ ...style, fillOpacity: d.shade }} />;
    }
    case 'segment': {
      const a = toScreen(d.a);
      const b = toScreen(d.b);
      return (
        <g key={key} className={d.className} style={style}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          {d.arrow && <polygon points={arrowHeadPoints(a, b)} className="sc-head" />}
        </g>
      );
    }
    case 'dot': {
      const p = toScreen(d.at);
      return <circle key={key} cx={p.x} cy={p.y} r={4.5} className={`${d.className} sc-dot`} style={style} />;
    }
    case 'text': {
      const p = toScreen(d.at);
      return (
        <g key={key} style={style}>
          <SvgLabel x={p.x + d.dx} y={p.y + d.dy} text={d.text} anchor={d.dx === 0 ? 'middle' : 'start'} />
        </g>
      );
    }
  }
}

export function Scene3D({ visual }: { visual: Scene3dJson }) {
  const { drawables, toScreen } = new SceneProjector(visual).layout();
  return (
    <svg className="visual-svg scene3d" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={visual.altText} data-visual="scene3d/v1">
      {drawables.map((d, i) => drawDrawable(d, toScreen, i))}
    </svg>
  );
}
