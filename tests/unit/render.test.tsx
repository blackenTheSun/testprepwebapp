import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Diagram2dJson, Scene3dJson } from '../../src/contract/types';
import { Diagram2D } from '../../src/render/diagram2d';
import { Camera, SceneProjector } from '../../src/render/scene3d';
import { visuals } from '../../src/render/visuals';
import { fixtureTest } from './helpers';

describe('diagram2d/v1', () => {
  it('draws every primitive kind', () => {
    const visual: Diagram2dJson = {
      type: 'diagram2d/v1',
      altText: 'all kinds',
      viewBox: [0, 0, 400, 300],
      primitives: [
        { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { kind: 'arrow', x1: 0, y1: 10, x2: 50, y2: 10, label: 'F' },
        { kind: 'resistor', x1: 0, y1: 20, x2: 100, y2: 20, label: 'R_1 = 5 ohm' },
        { kind: 'polyline', points: [[0, 0], [5, 5], [10, 0]] },
        { kind: 'circle', x: 50, y: 50, radius: 5 },
        { kind: 'voltageSource', x: 100, y: 100, radius: 20, label: 'V_s' },
        { kind: 'rect', x: 1, y: 1, width: 5, height: 5 },
        { kind: 'point', x: 3, y: 3, label: 'a' },
        { kind: 'text', x: 9, y: 9, text: 'tau_y' },
        { kind: 'ground', x: 20, y: 200 },
      ],
    };
    const html = renderToStaticMarkup(<Diagram2D visual={visual} />);
    expect(html).toContain('aria-label="all kinds"');
    expect(html.match(/<polyline/g)).toHaveLength(2); // resistor zig-zag + polyline
    expect(html).toContain('Ω'); // "ohm" label formatting
    expect(html).toContain('τ'); // Greek word formatting
    expect(html).toMatch(/<rect[^>]*width="5"/);
  });

  it('renders both mechanics 2D fixtures and the 3D fixture through the visual registry', () => {
    for (const problem of fixtureTest('mechanics').problems) {
      const html = renderToStaticMarkup(visuals.render(problem.json.visual!));
      expect(html).toContain(`data-visual="${problem.json.visual!.type}"`);
    }
  });
});

describe('scene3d/v1', () => {
  it('uses a z-up camera: azimuth 0 looks from +x, so +y points right and +z up', () => {
    const camera = new Camera({ azimuthDeg: 0, elevationDeg: 0 });
    const y = camera.project([0, 1, 0]);
    const z = camera.project([0, 0, 1]);
    expect(y.x).toBeCloseTo(1);
    expect(y.y).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(1);
    expect(camera.project([1, 0, 0]).depth).toBeCloseTo(1); // +x is toward the camera
  });

  it('culls hidden box faces and fits the scene in the viewport', () => {
    const scene: Scene3dJson = {
      type: 'scene3d/v1',
      altText: 'box',
      camera: { azimuthDeg: -42, elevationDeg: 23, projection: 'orthographic' },
      objects: [{ kind: 'box', center: [0, 0, 0], size: [2, 1, 1], label: 'bar' }, { kind: 'cylinder', from: [0, 0, 1], to: [0, 0, 2], radius: 0.3 }],
    };
    const { drawables, toScreen } = new SceneProjector(scene).layout();
    const polygons = drawables.filter((d) => d.kind === 'polygon');
    expect(polygons.length).toBeGreaterThan(3);
    expect(polygons.length).toBeLessThan(6 + 26); // hidden faces removed
    for (const d of polygons) {
      for (const p of d.points.map(toScreen)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(520);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(340);
      }
    }
    expect(drawables.at(-1)?.kind).toBe('text'); // labels drawn last
  });

  it('supports perspective projection', () => {
    const camera = new Camera({ azimuthDeg: 0, elevationDeg: 0, projection: 'perspective' });
    camera.fitScene(1);
    expect(Math.abs(camera.project([1, 1, 0]).x)).toBeGreaterThan(Math.abs(camera.project([-1, 1, 0]).x));
  });
});
