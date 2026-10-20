// Snip Buddies body: the paper shape every buddy starts as, and how long their legs are.
// Shared by the engine, the levels and the game screen. No browser dependencies.
//
// A fresh buddy has straight sides, a flat top and a round bottom (a U), 1.3 wide and 1.8 tall.
// Two thin legs hold the paper up off the ground. Crouching bends them and Stand tall stretches them,
// so the buddy goes lower or higher while the paper keeps its shape.
export const BW = 1.3, BH = 1.8;
export const BR = BW / 2;                  // radius of the round bottom
export const LEG_N = 0.42;                 // normal leg length: from the bottom of the paper to the ground
export const LEG_C = 0.14;                 // crouching
export const LEG_T = 1.0;                  // standing tall
export const STAND = 12 - LEG_N;           // where the bottom of a standing buddy's paper sits on the main floor (top at y = 12)

// The U shape with its top-left corner at (x, y), y growing downwards.
export function uShape(x = 0, y = 0, n = 16) {
  const straight = BH - BR, pts = [[x, y], [x + BW, y], [x + BW, y + straight]];
  for (let i = 1; i < n; i++) { const t = (i / n) * Math.PI; pts.push([x + BR + BR * Math.cos(t), y + straight + BR * Math.sin(t)]); }
  pts.push([x, y + straight]);
  return pts;
}
// A standing buddy outline for a level: left edge at x, bottom of the paper at `bottom`.
export const uStand = (x, bottom = STAND) => uShape(x, bottom - BH);
// A buddy on its side with the bottom of its paper at `floor` (pass the ground minus the leg length, since the
// legs hang down from its long edge). The round end points `end` ('left' or 'right').
export function uLying(x, floor = 12, end = 'left') {
  const u = uShape(0, 0);
  // turn a quarter: the round bottom ends up on the left (or right), then sit it on the floor
  const turned = u.map(([px, py]) => (end === 'left' ? [BH - py, px] : [py, BW - px]));
  return turned.map(([px, py]) => [x + px, floor - BW + py]);
}

// A U whose top is replaced by `top` (points from the top of the left side to the top of the right side, in a
// frame where the sheet runs from x = 0 to BW and y = 0 is the top). Used for the hint pictures.
export function uWithTop(top, n = 16) {
  const straight = BH - BR, pts = [...top, [BW, straight]];
  for (let i = 1; i < n; i++) { const t = (i / n) * Math.PI; pts.push([BR + BR * Math.cos(t), straight + BR * Math.sin(t)]); }
  pts.push([0, straight]);
  return pts;
}
