// Every sprite Turtle Bay uses. Each is rendered one unit long (size 1), so a game draws it at the
// width it wants in pixels. yaw turns the model to face right; TOP looks straight down (nose to the right).
const PX = 260;
const TOP = { yaw: 0, el: 88 };
// models face along their own z axis, so turned ones are fitted on z; props that keep yaw 0 fit on x
const side = (name, model, extra = {}) => ({ name, model, size: 1, fit: extra.yaw === 0 ? 'x' : 'z', yaw: 90, px: PX, ...extra });
const top = (name, model, extra = {}) => side(name, model, { view: TOP, ...extra });

export const SPRITES = [
  // turtles, side on and from above
  side('t_sea', 'sea'),
  top('t_sea_top', 'sea'),
  top('t_hatch', 'hatch'),
  side('t_swim', 'hatch', { view: { yaw: 10, el: 20 } }),
  side('t_tort', 'tort'),
  top('t_tort_top', 'tort'),
  side('t_box', 'box', { yaw: -90 }),
  side('t_grey', 'grey'),
  side('t_long', 'long', { yaw: -90 }),
  side('t_front', 'sea', { yaw: 60, view: { yaw: 18, el: 16 } }),
  side('t_tort_front', 'tort', { yaw: 35, view: { yaw: 18, el: 16 } }),

  // beach and sea
  top('t_crab_top', 'crab'),
  side('t_jelly', 'jelly', { yaw: 0 }),
  top('t_gull_top', 'gull', { yaw: 0 }),
  side('t_fish', 'fish'),
  side('t_seaweed', 'kelp', { yaw: 0 }),
  side('t_coral', 'coral', { yaw: 0 }),
  side('t_seagrass', 'seagrass', { yaw: 0 }),
  side('t_bag', 'bag', { yaw: 0, view: { yaw: 18, el: 30 } }),

  // river and field
  top('t_lilypad', 'lilypad'),
  top('t_log', 'log', { yaw: 0 }),
  top('t_rock_top', 'rock', { view: { yaw: 0, el: 70 } }),
  top('t_lettuce', 'lettuce', { view: { yaw: 0, el: 65 } }),
];
