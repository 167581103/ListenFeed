export type PanAxis = "x" | "y";

/** Pick an axis after a short movement. Equal movement stays horizontal. */
export function choosePanAxis(dx: number, dy: number, slop = 6): PanAxis | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < slop) return null;
  return Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
}

/** Finger movement in pixels, clamped to the reachable control positions. */
export function clampPanOffset(origin: number, dx: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, origin + dx));
}

/**
 * `fraction` is 0 on the QA controls and -1 when sentence controls are fully open.
 * `velocity` is fraction change per millisecond; negative moves toward sentence controls.
 */
export function shouldOpenListening(fraction: number, velocity: number): boolean {
  return fraction + velocity * 180 <= -0.22;
}
