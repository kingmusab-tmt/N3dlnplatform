// Turn-by-turn progress for live delivery navigation. Pure functions so they
// can be tested without a map or a GPS.
import { distanceMetres, measureLine, nearestOnLine, type LngLat } from './geo';
import type { RouteResponse } from './postcode';

/** Within this distance of the destination the rider has arrived. */
export const ARRIVAL_RADIUS_M = 20;
/** Further than this from the route (or 1.5x the GPS accuracy, if worse) counts as off route. */
export const OFF_ROUTE_M = 40;

export type NavPlan = {
  line: ReturnType<typeof measureLine>;
  steps: { instruction: string; along: number }[];
  destination: LngLat;
};

export type NavProgress = {
  remaining_m: number;
  offset_m: number;
  next: { instruction: string; in_m: number } | null;
  arrived: boolean;
  offRoute: boolean;
};

/** The road route plus the on-foot last mile, with each step placed along it. */
export function buildNavPlan(route: RouteResponse): NavPlan {
  const coords: LngLat[] = [...route.route.geometry.coordinates];
  if (route.lastMile) coords.push(route.destination.point);
  const line = measureLine(coords);

  let previous = 0;
  const steps = route.route.steps
    .filter((s) => s.maneuver !== 'depart' && Array.isArray(s.location))
    .map((s) => {
      // Steps are in order; never let one snap behind the previous one.
      previous = Math.max(previous, nearestOnLine(line, s.location).along);
      return { instruction: s.instruction, along: previous };
    });
  if (route.lastMile) {
    steps.push({ instruction: `Walk the last ${Math.round(route.lastMile.distance_m)} m to the ${route.destination.kind}`, along: line.length });
  }
  return { line, steps, destination: route.destination.point };
}

export function navProgress(plan: NavPlan, position: LngLat, accuracy_m = 0): NavProgress {
  const { along, offset } = nearestOnLine(plan.line, position);
  const remaining_m = Math.max(0, plan.line.length - along);
  const next = plan.steps.find((s) => s.along > along + 5) ?? null;
  return {
    remaining_m,
    offset_m: offset,
    next: next ? { instruction: next.instruction, in_m: Math.max(0, next.along - along) } : null,
    arrived: distanceMetres(position, plan.destination) <= ARRIVAL_RADIUS_M,
    offRoute: offset > Math.max(OFF_ROUTE_M, accuracy_m * 1.5),
  };
}

/**
 * A straight-line plan to the destination, for when there's no connection to
 * fetch a road route: arrival detection and distance still work, and the app
 * swaps in a real route as soon as it's back online.
 */
export function straightLinePlan(from: LngLat, destination: LngLat): NavPlan {
  const line = measureLine([from, destination]);
  return { line, steps: [{ instruction: 'Offline: head towards the destination', along: line.length }], destination };
}
