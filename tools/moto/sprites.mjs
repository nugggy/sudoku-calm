// Every sprite the motorbike games use. Sizes are metres along the model's length (fit), yaw faces it right.
// Bikes get a rider layer per rider (see render.js); seat = where the rider's feet-origin sits on that bike.
const MC = (n) => `k:mini-characters/character-${n}`;
export const RIDERS = [
  { id: 'r1', ref: MC('male-a'), name: 'Max' },
  { id: 'r2', ref: MC('female-b'), name: 'Ruby' },
  { id: 'r3', ref: MC('male-c'), name: 'Kai' },
  { id: 'r4', ref: MC('female-d'), name: 'Zoe' },
];
const RS = 1.2; // rider standing height in metres (chunky cartoon proportions)
export const BIKES = [
  { id: 'sport', ref: 'm:bike_a', size: 2.1, yaw: 90, seat: [-0.32, 0.5, 0], lean: -8, wheels: 0.155 },
  { id: 'cruiser', ref: 'm:bike_b', size: 2.3, yaw: 0, seat: [-0.32, 0.42, 0], lean: 0, wheels: 0.15 },
  { id: 'chopper', ref: 'm:bike_c', size: 2.4, yaw: 90, seat: [-0.42, 0.4, 0], lean: 0, wheels: 0.15 },
  { id: 'scooter', ref: 'm:scooter', size: 1.8, yaw: 90, seat: [-0.3, 0.44, 0], lean: 0, wheels: 0.12 },
  { id: 'dirt', ref: 'm:dirtbike', size: 2.1, yaw: 90, seat: [-0.22, 0.6, 0], lean: -5, wheels: 0.17 },
];
const bikeJobs = (view) => BIKES.map((b) => ({
  name: `bike_${b.id}${view === 'top' ? '_top' : ''}`, ref: b.ref, size: b.size, fit: 'x', yaw: b.yaw, view, px: view === 'top' ? 64 : 90,
  wheels: b.wheels, riders: RIDERS, rider: { size: RS, seat: b.seat, lean: b.lean, anim: 'drive', at: 0.3 },
}));
// riders off the bike: tumbling after a crash and cheering at the finish
const riderJobs = RIDERS.flatMap((r) => [
  { name: `rider_${r.id}_tumble`, ref: r.ref, size: RS, fit: 'y', yaw: 90, anim: 'die', frames: 6, t0: 0, t1: 0.7, px: 90 },
  { name: `rider_${r.id}_cheer`, ref: r.ref, size: RS, fit: 'y', yaw: 40, anim: 'emote-yes', frames: 8, t0: 0, t1: 0.9, px: 90 },
]);
const CK = (n) => `k:car-kit/${n}`;
const CARS = ['sedan', 'taxi', 'van', 'truck', 'police', 'suv', 'hatchback-sports', 'delivery', 'ambulance', 'firetruck', 'garbage-truck', 'sedan-sports', 'suv-luxury', 'race'];
const LEN = { truck: 2.95 * 1.6, van: 2.75 * 1.6, firetruck: 3.4 * 1.6, 'garbage-truck': 3.3 * 1.6, ambulance: 3 * 1.6, delivery: 3 * 1.6 };
const carJobs = (view) => CARS.map((c) => ({ name: `car_${c}${view === 'top' ? '_top' : ''}`, ref: CK(c), size: LEN[c] || 4.2, fit: 'x', yaw: 90, view, px: view === 'top' ? 40 : 50 }));
const SIDE_CARS = ['sedan', 'taxi', 'van', 'truck', 'police', 'firetruck', 'garbage-truck', 'suv'];
const RK = (n) => `kt:racing-kit/${n}`;
const NK = (n) => `kt:nature-kit/${n}`;
const SU = (n) => `k:city-kit-suburban/${n}`;
const CO = (n) => `k:city-kit-commercial/${n}`;
const FK = (n) => `k:food-kit/${n}`;
const FOOD = ['burger', 'pizza', 'donut-sprinkles', 'fries', 'taco', 'hot-dog', 'sushi-salmon', 'ice-cream', 'cup-coffee', 'cake', 'sandwich', 'chinese', 'waffle', 'cupcake', 'soda', 'pancakes'];

export const JOBS = [
  ...bikeJobs('side'),
  ...bikeJobs('top'),
  ...riderJobs,
  ...carJobs('top'),
  ...carJobs('side').filter((j) => SIDE_CARS.some((c) => j.name === `car_${c}`)),
  // stunt park and hill props (side)
  { name: 'ramp', ref: RK('ramp'), size: 4, fit: 'x', yaw: 90, px: 60 },
  { name: 'ramp_long', ref: RK('roadRampLong'), size: 8, fit: 'x', yaw: 90, px: 50 },
  { name: 'barrier_red', ref: RK('barrierRed'), size: 2, fit: 'x', yaw: 0, px: 60 },
  { name: 'barrier_white', ref: RK('barrierWhite'), size: 2, fit: 'x', yaw: 0, px: 60 },
  { name: 'pylon', ref: RK('pylon'), size: 0.7, fit: 'y', px: 90 },
  { name: 'flag_checkers', ref: RK('flagCheckers'), size: 3, fit: 'y', yaw: 90, px: 50 },
  { name: 'banner_tower', ref: RK('bannerTowerRed'), size: 5, fit: 'y', yaw: 90, px: 40 },
  { name: 'grandstand', ref: RK('grandStandCovered'), size: 8, fit: 'x', yaw: 180, px: 30 },
  { name: 'tent', ref: RK('tent'), size: 3, fit: 'x', yaw: 90, px: 50 },
  { name: 'cone', ref: CK('cone'), size: 0.7, fit: 'y', px: 90 },
  { name: 'crate', ref: CK('box'), size: 1, fit: 'y', px: 80 },
  { name: 'tyre', ref: CK('debris-tire'), size: 0.9, fit: 'max', px: 80 },
  { name: 'tree_pine', ref: NK('tree_pineTallA'), size: 7, fit: 'y', px: 30 },
  { name: 'tree_round', ref: NK('tree_default'), size: 5, fit: 'y', px: 30 },
  { name: 'tree_oak', ref: NK('tree_oak'), size: 6, fit: 'y', px: 30 },
  { name: 'rock_big', ref: NK('rock_largeA'), size: 3, fit: 'x', px: 40 },
  { name: 'rock_small', ref: NK('rock_smallA'), size: 1.2, fit: 'x', px: 60 },
  { name: 'cactus', ref: NK('cactus_tall'), size: 3, fit: 'y', px: 40 },
  // delivery town (top view)
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'k', 'l'].map((x) => ({ name: `house_${x}_top`, ref: SU(`building-type-${x}`), size: 9, fit: 'max', view: 'top', px: 18 })),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => ({ name: `shop_${x}_top`, ref: CO(`building-${x}`), size: 11, fit: 'max', view: 'top', px: 16 })),
  { name: 'tree_top', ref: SU('tree-large'), size: 4, fit: 'max', view: 'top', px: 24 },
  { name: 'tree_small_top', ref: SU('tree-small'), size: 2.6, fit: 'max', view: 'top', px: 30 },
  { name: 'planter_top', ref: SU('planter'), size: 2, fit: 'max', view: 'top', px: 30 },
  { name: 'cone_top', ref: CK('cone'), size: 0.7, fit: 'max', view: 'top', px: 60 },
  { name: 'barrier_top', ref: RK('barrierRed'), size: 2, fit: 'x', yaw: 0, view: 'top', px: 50 },
  // food icons for delivery orders
  ...FOOD.map((f) => ({ name: `food_${f}`, ref: FK(f), size: 1, fit: 'max', view: 'icon', px: 110 })),
];
