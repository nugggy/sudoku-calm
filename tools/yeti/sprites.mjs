// Every sprite the Yeti Games use. Sizes are in world units (the yeti is 2.4 tall); px is pixels per unit.
// yaw turns the model so it faces right; anim/frames pick frames from a model's own animation, and track
// records where some bones land in every frame (the games draw the bat, flamingo or snowball at the hand).
const PX = 90;
const HAND = ['LowerArmL', 'Middle1L', 'LowerArmR', 'Middle1R', 'FootL', 'FootR', 'Head'];
const yeti = (name, anim, frames, extra = {}) => ({ name, model: 'yeti', anim, frames, size: 2.4, yaw: 90, px: PX, loop: false, track: HAND, ...extra });

export const SPRITES = [
  // the yeti
  yeti('yeti_idle', 'Idle', 8, { loop: true }),
  yeti('yeti_swing', 'Weapon', 14),
  yeti('yeti_throw', 'Punch', 12),
  yeti('yeti_jump', 'Jump', 12),
  yeti('yeti_wave', 'Wave', 10, { loop: true }),
  yeti('yeti_yes', 'Yes', 8, { loop: true }),
  yeti('yeti_no', 'No', 8, { loop: true }),
  yeti('yeti_hit', 'HitReact', 8),
  yeti('yeti_fall', 'Death', 10),
  yeti('yeti_run', 'Run', 8, { loop: true }),
  yeti('yeti_crouch', 'Duck', 1, { at: 0.42 }),
  yeti('yeti_air', 'Jump_Idle', 6, { loop: true }),
  yeti('yeti_front', 'Idle', 1, { yaw: 20 }),

  // the penguin (spins and tumbles are done in the game)
  { name: 'penguin', model: 'penguin', size: 1.0, yaw: 90, px: 160 },
  { name: 'penguin_front', model: 'penguin', size: 1.0, yaw: 20, px: 160 },

  // sea and ice
  { name: 'orca', model: 'orca', size: 5.2, fit: 'z', yaw: -90, px: 80 },
  { name: 'seal', model: 'seal', size: 1.7, fit: 'z', yaw: 90, px: PX },
  { name: 'albatross', model: 'gull', size: 3.0, fit: 'x', yaw: 0, px: PX, view: { yaw: 10, el: 18 } },
  { name: 'icicle', model: 'icicle', size: 1.5, px: PX },

  // savanna
  { name: 'flamingo', model: 'flamingo', size: 2.2, yaw: -90, px: PX },
  { name: 'giraffe', model: 'giraffe', size: 5.6, yaw: 90, px: PX },
  { name: 'elephant', model: 'elephant', size: 3.4, yaw: 90, px: PX },
  { name: 'vulture', model: 'vulture', size: 1.5, yaw: 90, px: PX },
  { name: 'snake', model: 'snake', anim: 'Snake_Idle', frames: 1, size: 1.1, yaw: 90, px: PX },
  { name: 'acacia', model: 'acacia', size: 5.5, px: 60 },

  // mountains and farm
  { name: 'ibex', model: 'goat', size: 1.7, yaw: 90, px: PX },
  { name: 'llama', model: 'llama', anim: 'Idle', frames: 1, size: 2.4, yaw: 90, px: PX, track: ['Head'] },
  { name: 'ox', model: 'bull', anim: 'Walk', frames: 8, size: 2.0, yaw: 90, px: PX, loop: true },
  { name: 'ram', model: 'bighorn', size: 1.6, yaw: 90, px: PX },

  // gear
  { name: 'bat', model: 'bat', size: 1.5, fit: 'x', px: PX, view: { yaw: 0, el: 0 } },
  { name: 'snowboard', model: 'snowboard', size: 2.3, fit: 'z', yaw: 90, px: PX, view: { yaw: 0, el: 12 } },
  { name: 'surfboard', model: 'surfboard', size: 2.6, fit: 'x', px: PX, view: { yaw: 0, el: 12 } },
];
