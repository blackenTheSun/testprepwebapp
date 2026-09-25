import type { ReactNode } from 'react';
import type { Diagram2dJson, DiagramPrimitiveJson } from '../contract/types';
import { SvgLabel } from './SvgLabel';

type Of<K extends DiagramPrimitiveJson['kind']> = DiagramPrimitiveJson & { kind: K };

interface Point {
  x: number;
  y: number;
}

/** Offset a point perpendicular to segment a→b (positive = left of travel in screen space). */
function perpendicular(a: Point, b: Point, distance: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: (-dy / len) * distance, y: (dx / len) * distance };
}

function arrowHead(from: Point, to: Point, size = 10): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const left = { x: to.x - size * Math.cos(angle - Math.PI / 7), y: to.y - size * Math.sin(angle - Math.PI / 7) };
  const right = { x: to.x - size * Math.cos(angle + Math.PI / 7), y: to.y - size * Math.sin(angle + Math.PI / 7) };
  return `${to.x},${to.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

/** Label placed beside a segment's midpoint, on the side away from the segment. */
function segmentLabel(a: Point, b: Point, text: string, key: string): ReactNode {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  return horizontal ? (
    <SvgLabel key={key} x={mid.x} y={mid.y - 14} text={text} anchor="middle" />
  ) : (
    <SvgLabel key={key} x={mid.x + 16} y={mid.y + 4} text={text} anchor="start" />
  );
}

/**
 * One drawable element of a `diagram2d/v1` visual. Each primitive kind is a subclass that knows
 * how to draw itself as SVG; coordinates are in the visual's `viewBox` units.
 */
export abstract class Primitive2D<T extends DiagramPrimitiveJson = DiagramPrimitiveJson> {
  /** The visual's viewBox [minX, minY, width, height], for keeping labels inside the frame. */
  protected viewBox: readonly number[] = [0, 0, Infinity, Infinity];

  constructor(readonly json: T) {}

  protected get style(): { stroke?: string; color?: string } | undefined {
    return this.json.color ? { stroke: this.json.color, color: this.json.color } : undefined;
  }

  abstract draw(key: string): ReactNode;

  static create(json: DiagramPrimitiveJson, viewBox?: readonly number[]): Primitive2D {
    const cls = PRIMITIVES_2D[json.kind] as new (json: DiagramPrimitiveJson) => Primitive2D;
    const primitive = new cls(json);
    if (viewBox) primitive.viewBox = viewBox;
    return primitive;
  }
}

abstract class SegmentPrimitive<K extends 'line' | 'arrow' | 'resistor'> extends Primitive2D<Of<K>> {
  protected get a(): Point {
    return { x: this.json.x1, y: this.json.y1 };
  }
  protected get b(): Point {
    return { x: this.json.x2, y: this.json.y2 };
  }
}

class LinePrimitive extends SegmentPrimitive<'line'> {
  draw(key: string): ReactNode {
    const { a, b } = this;
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        {this.json.label && segmentLabel(a, b, this.json.label, 'l')}
      </g>
    );
  }
}

class ArrowPrimitive extends SegmentPrimitive<'arrow'> {
  draw(key: string): ReactNode {
    const { a, b } = this;
    return (
      <g key={key} className="dg-stroke dg-arrow" style={this.style}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <polygon points={arrowHead(a, b)} className="dg-fill" />
        {this.json.label && this.tipLabel(this.json.label)}
      </g>
    );
  }

  /**
   * Arrow labels sit at the arrowhead (where axis titles and load values belong): past the tip
   * when there is room inside the viewBox, otherwise just below (or above) the tip.
   */
  private tipLabel(label: string): ReactNode {
    const { a, b } = this;
    const [minX, minY, width] = this.viewBox;
    const textWidth = estimateTextWidth(label);
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      const pointsRight = b.x >= a.x;
      const roomPastTip = pointsRight ? minX + width - (b.x + 6) : b.x - 6 - minX;
      if (roomPastTip >= textWidth) {
        return <SvgLabel x={pointsRight ? b.x + 6 : b.x - 6} y={b.y + 4} text={label} anchor={pointsRight ? 'start' : 'end'} />;
      }
      return <SvgLabel x={b.x} y={b.y + 18} text={label} anchor={pointsRight ? 'end' : 'start'} />;
    }
    const pointsUp = b.y <= a.y;
    const y = pointsUp ? Math.max(b.y - 8, minY + 12) : b.y + 16;
    return <SvgLabel x={b.x} y={y} text={label} anchor="middle" />;
  }
}

/** Zig-zag resistor between the two ends, with straight leads. */
class ResistorPrimitive extends SegmentPrimitive<'resistor'> {
  draw(key: string): ReactNode {
    const { a, b } = this;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const lead = Math.min(18, length * 0.2);
    const t0 = lead / length;
    const t1 = 1 - t0;
    const zigs = 6;
    const amplitude = Math.min(8, length * 0.08);
    const points: Point[] = [a, lerp(a, b, t0)];
    for (let i = 1; i <= zigs * 2 - 1; i += 1) {
      const p = lerp(a, b, t0 + ((t1 - t0) * i) / (zigs * 2));
      const offset = perpendicular(a, b, i % 2 === 1 ? amplitude : -amplitude);
      points.push({ x: p.x + offset.x, y: p.y + offset.y });
    }
    points.push(lerp(a, b, t1), b);
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" />
        {this.json.label && segmentLabel(a, b, this.json.label, 'l')}
      </g>
    );
  }
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

class PolylinePrimitive extends Primitive2D<Of<'polyline'>> {
  draw(key: string): ReactNode {
    const pts = this.json.points;
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" />
        {this.json.label && this.longestSegmentLabel(this.json.label)}
      </g>
    );
  }

  /** Label beside the middle of the longest segment, away from the vertices (which often carry point labels). */
  private longestSegmentLabel(label: string): ReactNode {
    const pts = this.json.points;
    let best = 0;
    for (let i = 1; i < pts.length - 1; i += 1) {
      if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > Math.hypot(pts[best + 1][0] - pts[best][0], pts[best + 1][1] - pts[best][1])) best = i;
    }
    const a = { x: pts[best][0], y: pts[best][1] };
    const b = { x: pts[best + 1][0], y: pts[best + 1][1] };
    const mid = lerp(a, b, 0.5);
    // Offset toward the upper side of the segment so the text never sits on the line.
    let offset = perpendicular(a, b, 14);
    if (offset.y > 0) offset = { x: -offset.x, y: -offset.y };
    return <SvgLabel x={mid.x + offset.x} y={mid.y + offset.y} text={label} anchor="middle" />;
  }
}

class CirclePrimitive extends Primitive2D<Of<'circle'>> {
  draw(key: string): ReactNode {
    const { x, y, radius, label } = this.json;
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <circle cx={x} cy={y} r={radius} className="dg-shape" />
        {label && <SvgLabel x={x} y={y + radius + 14} text={label} anchor="middle" fontSize={10} />}
      </g>
    );
  }
}

class VoltageSourcePrimitive extends Primitive2D<Of<'voltageSource'>> {
  draw(key: string): ReactNode {
    const { x, y, radius, label } = this.json;
    const s = radius * 0.28;
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <circle cx={x} cy={y} r={radius} className="dg-shape" />
        <line x1={x - s} y1={y - radius * 0.45} x2={x + s} y2={y - radius * 0.45} />
        <line x1={x} y1={y - radius * 0.45 - s} x2={x} y2={y - radius * 0.45 + s} />
        <line x1={x - s} y1={y + radius * 0.45} x2={x + s} y2={y + radius * 0.45} />
        {label && this.sideLabel(label)}
      </g>
    );
  }

  /** Label to the left of the source, or to the right when the left side would clip it. */
  private sideLabel(label: string): ReactNode {
    const { x, y, radius } = this.json;
    const roomOnLeft = x - radius - 8 - this.viewBox[0];
    return estimateTextWidth(label) <= roomOnLeft ? (
      <SvgLabel x={x - radius - 8} y={y + 4} text={label} anchor="end" />
    ) : (
      <SvgLabel x={x + radius + 8} y={y + 4} text={label} anchor="start" />
    );
  }
}

/** Rough width of a 13px label, good enough to decide which side has room. */
function estimateTextWidth(text: string, fontSize = 13): number {
  return text.length * fontSize * 0.55;
}

class GroundPrimitive extends Primitive2D<Of<'ground'>> {
  draw(key: string): ReactNode {
    const { x, y, label } = this.json;
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <line x1={x - 14} y1={y} x2={x + 14} y2={y} />
        <line x1={x - 9} y1={y + 6} x2={x + 9} y2={y + 6} />
        <line x1={x - 4} y1={y + 12} x2={x + 4} y2={y + 12} />
        {label && <SvgLabel x={x + 18} y={y + 10} text={label} />}
      </g>
    );
  }
}

class RectPrimitive extends Primitive2D<Of<'rect'>> {
  draw(key: string): ReactNode {
    const { x, y, width, height, label } = this.json;
    return (
      <g key={key} className="dg-stroke" style={this.style}>
        <rect x={x} y={y} width={width} height={height} className="dg-shape" />
        {label && <SvgLabel x={x + 8} y={y + height / 2 + 4} text={label} fontSize={11} className="dg-label dg-label-muted" />}
      </g>
    );
  }
}

class PointPrimitive extends Primitive2D<Of<'point'>> {
  draw(key: string): ReactNode {
    const { x, y, label } = this.json;
    return (
      <g key={key} style={this.style}>
        <circle cx={x} cy={y} r={4} className="dg-fill" />
        {label && <SvgLabel x={x + 8} y={y + 15} text={label} />}
      </g>
    );
  }
}

class TextPrimitive extends Primitive2D<Of<'text'>> {
  draw(key: string): ReactNode {
    const { x, y, text } = this.json;
    return (
      <g key={key} style={this.style}>
        <SvgLabel x={x} y={y} text={text} />
      </g>
    );
  }
}

const PRIMITIVES_2D: Record<DiagramPrimitiveJson['kind'], new (json: never) => Primitive2D> = {
  line: LinePrimitive,
  arrow: ArrowPrimitive,
  resistor: ResistorPrimitive,
  polyline: PolylinePrimitive,
  circle: CirclePrimitive,
  voltageSource: VoltageSourcePrimitive,
  ground: GroundPrimitive,
  rect: RectPrimitive,
  point: PointPrimitive,
  text: TextPrimitive,
};

export function Diagram2D({ visual }: { visual: Diagram2dJson }) {
  const [minX, minY, width, height] = visual.viewBox;
  // Shapes first, then everything else, so filled rectangles never hide lines or labels.
  const ordered = [...visual.primitives].sort((a, b) => Number(b.kind === 'rect') - Number(a.kind === 'rect'));
  return (
    <svg
      className="visual-svg diagram2d"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label={visual.altText}
      data-visual="diagram2d/v1"
    >
      {ordered.map((json, i) =>
        json.highlight ? (
          <g key={`h${i}`} className="dg-highlight">
            {Primitive2D.create(json, visual.viewBox).draw(`p${i}`)}
          </g>
        ) : (
          Primitive2D.create(json, visual.viewBox).draw(`p${i}`)
        ),
      )}
    </svg>
  );
}
