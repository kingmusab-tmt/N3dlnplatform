import { describe, expect, it } from 'vitest';
import { measureLine, nearestOnLine, type LngLat } from '@/lib/geo';
import { ARRIVAL_RADIUS_M, buildNavPlan, navProgress } from '@/lib/navigation';
import type { RouteResponse } from '@/lib/postcode';

// An L-shaped route in Wuse: ~1.1 km east along a street, then ~550 m north.
const A: LngLat = [7.47, 9.07];
const B: LngLat = [7.48, 9.07];
const C: LngLat = [7.48, 9.075];
const GATE: LngLat = [7.4803, 9.0751];

describe('nearestOnLine', () => {
  const line = measureLine([A, B, C]);

  it('measures distance along the line and the offset from it', () => {
    const halfway = nearestOnLine(line, [7.475, 9.0702]); // ~22 m north of the first leg
    expect(halfway.along).toBeGreaterThan(540);
    expect(halfway.along).toBeLessThan(560);
    expect(halfway.offset).toBeGreaterThan(20);
    expect(halfway.offset).toBeLessThan(25);
  });

  it('clamps to the ends and handles the corner', () => {
    expect(nearestOnLine(line, [7.46, 9.07]).along).toBe(0);
    expect(nearestOnLine(line, C).along).toBeCloseTo(line.length, 0);
    expect(nearestOnLine(line, [7.4801, 9.0725]).offset).toBeLessThan(15); // on the second leg
  });
});

const route = {
  destination: { point: GATE, kind: 'gate', source: 'claim' },
  lastMile: { geometry: { type: 'LineString', coordinates: [C, GATE] }, distance_m: 35 },
  route: {
    geometry: { type: 'LineString', coordinates: [A, B, C] },
    distance_m: 1650,
    duration_s: 300,
    steps: [
      { instruction: 'Head east on Aminu Kano Cres.', distance_m: 1100, road: '', maneuver: 'depart', location: A },
      { instruction: 'Turn left onto Ahmadu Bello Way.', distance_m: 550, road: '', maneuver: 'turn', location: B },
      { instruction: 'You have arrived.', distance_m: 0, road: '', maneuver: 'arrive', location: C },
    ],
  },
} as unknown as RouteResponse;

describe('navigation progress', () => {
  const plan = buildNavPlan(route);

  it('includes the on-foot last mile and skips the departure step', () => {
    expect(plan.line.coords.at(-1)).toEqual(GATE);
    expect(plan.steps.map((s) => s.instruction)).toEqual([
      'Turn left onto Ahmadu Bello Way.',
      'You have arrived.',
      'Walk the last 35 m to the gate',
    ]);
  });

  it('reports the next turn and the distance left from a position on the route', () => {
    const p = navProgress(plan, [7.475, 9.07]);
    expect(p.next?.instruction).toBe('Turn left onto Ahmadu Bello Way.');
    expect(p.next!.in_m).toBeGreaterThan(530);
    expect(p.next!.in_m).toBeLessThan(570);
    expect(p.remaining_m).toBeGreaterThan(1100);
    expect(p.offRoute).toBe(false);
    expect(p.arrived).toBe(false);
  });

  it('moves on to the following step after the turn', () => {
    expect(navProgress(plan, [7.48, 9.072]).next?.instruction).toBe('You have arrived.');
  });

  it('flags off-route, allowing for poor GPS accuracy', () => {
    const away: LngLat = [7.475, 9.0706]; // ~66 m from the route
    expect(navProgress(plan, away).offRoute).toBe(true);
    expect(navProgress(plan, away, 60).offRoute).toBe(false); // ±60 m GPS: can't tell yet
  });

  it(`detects arrival within ${ARRIVAL_RADIUS_M} m of the destination`, () => {
    expect(navProgress(plan, [7.48025, 9.07505]).arrived).toBe(true);
    expect(navProgress(plan, C).arrived).toBe(false); // road end, 35 m short of the gate
  });
});
