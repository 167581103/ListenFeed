export type PanAxis = "x" | "y";

/** The opposite axis cannot take over once a pan or its settle animation has started. */
export function allowPanAxis(active: PanAxis | null, next: PanAxis): boolean {
  return active == null || active === next;
}

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

type AxisClaim = { axis: PanAxis };

/** Shared across cards so a feed animation cannot be cancelled by another card. */
export function createAxisLock() {
  let current: AxisClaim | null = null;
  return {
    get(): PanAxis | null {
      return current?.axis ?? null;
    },
    claim(axis: PanAxis): () => void {
      const claim: AxisClaim = { axis };
      current = claim;
      return () => {
        if (current === claim) current = null;
      };
    },
  };
}

export const axisLock = createAxisLock();
