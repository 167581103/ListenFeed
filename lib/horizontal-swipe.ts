export type HorizontalSwipe = "left" | "right";

/** A horizontal swipe must clearly exceed the vertical movement. */
export function classifySwipe(dx: number, dy: number, threshold = 64): HorizontalSwipe | null {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.25) return null;
  return dx > 0 ? "right" : "left";
}
