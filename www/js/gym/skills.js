// Tumble Coach skills: each is a list of keyframe poses (see figure.js for the angles) and the coaching
// that goes with them. steps[].f is the keyframe a step shows, hl rings body parts on that step.
// d is how long (ms) the figure takes to reach a keyframe from the one before.
// coach: true marks skills to learn with a coach and proper mats, not at home.

export const GROUPS = [
  { id: 'shapes', name: 'Body shapes', blurb: 'The building blocks of every skill. Get these strong first.' },
  { id: 'rolls', name: 'Rolls', blurb: 'Rolling safely forwards and backwards.' },
  { id: 'hand', name: 'Balances and handstands', blurb: 'Strong arms and a straight body upside down.' },
  { id: 'wheels', name: 'Cartwheels and walkovers', blurb: 'Turning over through your hands.' },
  { id: 'jumps', name: 'Jumps and leaps', blurb: 'Take off, make a shape, land like a statue.' },
  { id: 'free', name: 'Freestyle', blurb: 'Landings, rolls and vaults for freestyle gymnastics.' },
];

export const LEVELS = ['Starter', 'Building', 'Advanced'];

// Shared poses
const UP = { a: 0 };
const SQUAT = { t: 30, l: 60, k: 95, a: 120, h: 10 };
const LUNGE = { a: 0, l1: 140, k1: 40, l2: 200 };
const KICK = { t: 110, a: 60, l1: 90, l2: 190, h: -10 };
const HSTAND = { t: 180, a: 0, h: -10 };
const BRIDGE = { t: -115, h: -30, a: 330, l: 265, k: 30 };
const DIP = { t: 20, l: 130, k: 50, a: 190 };
const LANDED = { t: 20, l: 130, k: 50, a: 70 };
const PIC = (src, alt) => ({ src: `img/gym/${src}.webp`, alt });

export const SKILLS = [
  // ---------- Body shapes ----------
  {
    id: 'tuck', group: 'shapes', level: 0, name: 'Tuck', hold: 10,
    frames: [{ t: -5, l: 90, k: 90, a: 90, d: 0 }, { t: -15, l: 35, k: 145, a: 130, e: 40, h: 20, d: 700 }],
    steps: [
      { f: 0, title: 'Sit tall', text: 'Sit on the floor with your knees bent and your feet flat.' },
      { f: 1, title: 'Hug your knees', text: 'Pull your knees right up to your chest and hold your shins. Lift your feet so you balance on your bottom. Chin in, back round.', hl: ['knees'] },
    ],
    cues: ['Knees to nose', 'Make yourself a little ball'],
    mistakes: ['Knees apart: squeeze them together', 'Leaning back too far: keep your chin in'],
    safety: 'A great one to practise anywhere on carpet or grass.',
  },
  {
    id: 'pike', group: 'shapes', level: 0, name: 'Pike', hold: 10,
    frames: [{ t: 0, l: 90, a: 0, d: 0 }, { t: 25, l: 65, a: 65, h: 10, d: 800 }],
    steps: [
      { f: 0, title: 'Sit up straight', text: 'Sit with your legs straight out in front, knees and feet together. Reach your arms up tall.' },
      { f: 1, title: 'Fold forward', text: 'Keep your back long and reach towards your toes. Point your toes and press the backs of your knees into the floor.', hl: ['feet', 'knees'] },
    ],
    cues: ['Tight knees, pointed toes', 'Chest to knees, not nose to knees'],
    mistakes: ['Bent knees: it is fine to reach less far with straight legs', 'Rounded back: lead with your chest'],
    safety: 'Stretch gently. A stretch should feel like a pull, never a pain.',
  },
  {
    id: 'straddle', group: 'shapes', level: 0, name: 'Straddle', view: 'front', hold: 10,
    frames: [{ t: 0, l: 130, a: 180, d: 0 }, { t: 0, l: 95, a: 80, d: 800 }],
    steps: [
      { f: 0, title: 'Legs apart', text: 'Sit tall with straight legs and open them as wide as is comfortable.' },
      { f: 1, title: 'Reach out', text: 'Point your toes, turn your knees to face the ceiling and reach your arms out wide. Keep your back straight.', hl: ['feet'] },
    ],
    cues: ['Knees to the ceiling', 'Long back, wide legs'],
    mistakes: ['Knees rolling in: turn them up', 'Slumping: sit up on your bottom bones'],
    safety: 'Only open as wide as feels comfortable. Flexibility grows with time.',
  },
  {
    id: 'star', group: 'shapes', level: 0, name: 'Star', view: 'front', hold: 5,
    frames: [{ d: 0 }, { a: 45, l: 155, d: 600 }],
    steps: [
      { f: 0, title: 'Stand tall', text: 'Stand with your feet together and arms by your sides.' },
      { f: 1, title: 'Make a star', text: 'Step your feet wide and lift your arms up and out in a big X. Tight tummy, straight arms and legs.', hl: ['hands', 'feet'] },
    ],
    cues: ['Five points: two hands, two feet, one head', 'Stretch to the tips of your fingers'],
    mistakes: ['Bent elbows: reach long', 'Arms too low: make a V above your head'],
    safety: 'This shape is used in star jumps and cartwheels.',
  },
  {
    id: 'dish', group: 'shapes', level: 0, name: 'Dish (hollow hold)', hold: 20,
    frames: [{ t: -90, a: 0, d: 0 }, { t: -75, h: 20, a: -25, l: 155, d: 800 }],
    steps: [
      { f: 0, title: 'Lie on your back', text: 'Lie flat with your arms by your ears and legs together.' },
      { f: 1, title: 'Lift and press', text: 'Press your lower back into the floor. Lift your shoulders, arms and legs a little off the floor, like a banana. Hold it.', hl: ['hips'] },
    ],
    cues: ['Belly button to the floor', 'Look at your toes'],
    mistakes: ['Lower back lifting: raise your legs higher until it stays down', 'Holding your breath: breathe slowly'],
    safety: 'Start with 5 to 10 seconds. Bend your knees to make it easier.',
  },
  {
    id: 'arch', group: 'shapes', level: 0, name: 'Arch (superman)', hold: 15,
    frames: [{ t: 90, a: 0, d: 0 }, { t: 75, h: -15, a: 5, l: 205, d: 800 }],
    steps: [
      { f: 0, title: 'Lie on your tummy', text: 'Lie face down, arms reaching past your head and legs together.' },
      { f: 1, title: 'Lift up', text: 'Squeeze your bottom and lift your arms, chest and legs off the floor together. Keep your arms by your ears and look at the floor.', hl: ['hands', 'feet'] },
    ],
    cues: ['Long, not high', 'Squeeze your bottom'],
    mistakes: ['Head tipped right back: look a little ahead at the floor', 'Bent knees: keep legs long'],
    safety: 'Stop if your lower back hurts.',
  },
  {
    id: 'plank', group: 'shapes', level: 0, name: 'Front support', hold: 20,
    frames: [{ ...SQUAT, t: 40, a: 140, d: 0 }, { t: 65, a: 115, l: 180, h: -5, d: 800 }],
    steps: [
      { f: 0, title: 'Hands down', text: 'Crouch and put your hands flat on the floor under your shoulders.' },
      { f: 1, title: 'Straight as a plank', text: 'Step your feet back so your body is one straight line from head to heels. Push the floor away and keep your tummy tight.', hl: ['hands', 'hips'] },
    ],
    cues: ['Push the floor away', 'No sagging, no bottom in the air'],
    mistakes: ['Hips dropping: squeeze your tummy and bottom', 'Hands too far forward: hands under shoulders'],
    safety: 'Builds the strong arms you need for handstands and cartwheels.',
  },
  {
    id: 'candle', group: 'shapes', level: 0, name: 'Candlestick', hold: 10,
    frames: [{ t: -15, l: 35, k: 145, a: 130, e: 40, h: 20, d: 0 }, { t: -100, l: 40, k: 120, a: 200, h: 30, d: 700 }, { t: -170, h: 80, l: 180, a: 260, d: 700, p: 900 }, { t: -100, l: 40, k: 120, a: 200, h: 30, d: 700 }, { t: 25, l: 60, k: 110, a: 90, h: 10, d: 700 }, { ...UP, d: 600 }],
    steps: [
      { f: 0, title: 'Start in a tuck', text: 'Sit in a tight tuck with your chin in.' },
      { f: 1, title: 'Rock back', text: 'Roll back onto your shoulders with your knees close to your chest.' },
      { f: 2, title: 'Point to the sky', text: 'Straighten your legs up to the ceiling. Arms flat on the floor, toes pointed. Weight on your shoulders, never your neck.', hl: ['feet', 'shoulders'] },
      { f: 4, title: 'Rock up', text: 'Bend your knees, rock forward and reach your arms forward to land on your feet.' },
      { f: 5, title: 'Stand up', text: 'Stand up tall with your arms by your ears.' },
    ],
    cues: ['Toes to the ceiling', 'Rock like a rocking chair'],
    mistakes: ['Legs falling over your head: push your hips up', 'Using your hands on the floor to stand: reach forward instead'],
    safety: 'Do this on a mat or soft carpet, and keep your head still.',
  },

  // ---------- Rolls ----------
  {
    id: 'froll', group: 'rolls', level: 0, name: 'Forward roll', pic: PIC('forward_roll', 'Forward roll, step by step'), ready: ['tuck', 'candle'],
    frames: [{ ...UP, d: 0 }, { ...SQUAT, x: 8, d: 600 }, { x: 22, t: 100, h: 40, a: 70, e: 30, l: 100, k: 20, d: 600 }, { x: 45, t: 230, h: 40, l: 40, k: 140, a: 60, e: 60, d: 700 }, { x: 70, t: 375, l: 65, k: 110, a: 90, h: 15, d: 700 }, { ...UP, x: 76, t: 360, d: 600 }],
    steps: [
      { f: 0, title: 'Stand tall', text: 'Stand at the end of the mat with your arms up by your ears.' },
      { f: 1, title: 'Squat and reach', text: 'Squat down and put your hands flat on the mat in front of your feet, shoulder width apart.', hl: ['hands'] },
      { f: 2, title: 'Chin to chest', text: 'Tuck your chin right in and look at your tummy. Lift your hips and push with your legs. The back of your head touches the mat, not the top.', hl: ['head'] },
      { f: 3, title: 'Roll in a ball', text: 'Roll along your rounded back, staying in a tight tuck with your knees close to your chest.' },
      { f: 4, title: 'Feet under bottom', text: 'Keep your feet close to your bottom and reach your arms forward to come up onto your feet.', hl: ['feet'] },
      { f: 5, title: 'Finish tall', text: 'Stand up without using your hands and finish with your arms up.' },
    ],
    cues: ['Chin to chest', 'Round like a ball', 'Reach forward to stand'],
    mistakes: ['Landing on the top of the head: tuck your chin before rolling', 'Pushing up with hands at the end: reach forward and squeeze your tuck', 'Legs opening: squeeze your knees together'],
    safety: 'Always on a mat. An adult can help by guiding the back of the head and hips on the first tries.',
  },
  {
    id: 'pikeroll', group: 'rolls', level: 1, name: 'Straight-leg forward roll', pic: PIC('straight_leg_roll', 'Straight-leg forward roll, step by step'), ready: ['froll', 'pike'],
    frames: [{ ...UP, d: 0 }, { x: 10, t: 120, a: 60, h: 20, l: 60, d: 700 }, { x: 25, t: 170, h: 40, a: 30, e: 40, l: 30, d: 600 }, { x: 45, t: 260, h: 40, l: 70, a: 120, d: 700 }, { x: 65, t: 400, l: 25, a: 140, h: 20, d: 700 }, { x: 70, t: 360, ...UP, d: 600 }],
    steps: [
      { f: 0, title: 'Stand tall', text: 'Stand with your feet together and arms up.' },
      { f: 1, title: 'Fold over', text: 'Bend forward in a pike with straight legs and put your hands on the mat close to your feet.', hl: ['hands'] },
      { f: 2, title: 'Tuck your head', text: 'Chin to chest and lower the back of your head and shoulders onto the mat, legs still straight.', hl: ['head'] },
      { f: 3, title: 'Roll in a pike', text: 'Roll along your back keeping your legs straight and together.' },
      { f: 4, title: 'Push to stand', text: 'As your legs come down, open them slightly or keep them together, put your hands beside your hips and push hard to stand up.', hl: ['hands'] },
      { f: 5, title: 'Finish', text: 'Stand tall with your arms up.' },
    ],
    cues: ['Knees locked the whole way', 'Fast roll, big push'],
    mistakes: ['Bending knees to stand: push harder with your hands by your hips', 'Rolling too slowly: start with more speed'],
    safety: 'Needs good flexibility in your pike. Practise on a soft mat or down a gentle slope (wedge) first.',
  },
  {
    id: 'broll', group: 'rolls', level: 1, name: 'Backward roll', pic: PIC('backward_roll', 'Backward roll, step by step'), ready: ['froll', 'candle'],
    frames: [{ a: 20, e: 165, d: 0 }, { t: 20, l: 65, k: 110, h: 35, a: 20, e: 165, d: 600 }, { x: -15, t: -40, l: 45, k: 130, h: 35, a: 20, e: 165, d: 600 }, { x: -40, t: -160, l: 45, k: 130, h: 40, a: 20, e: 165, d: 700 }, { x: -68, t: -330, l: 65, k: 110, a: 90, h: 10, d: 700 }, { x: -72, t: -360, ...UP, d: 600 }],
    steps: [
      { f: 0, title: 'Pizza hands', text: 'Stand with your back to the mat. Bend your elbows and put your hands by your ears, palms facing up like you are carrying a pizza.', hl: ['hands'] },
      { f: 1, title: 'Squat and tuck', text: 'Squat down with your chin on your chest and your back round.', hl: ['head'] },
      { f: 2, title: 'Sit and rock back', text: 'Sit down close to your heels and rock straight back in a tight ball.' },
      { f: 3, title: 'Hands push', text: 'When your hands touch the mat beside your head, push hard so your head slips through. Keep your knees close to your face.', hl: ['hands'] },
      { f: 4, title: 'Land on your feet', text: 'Your feet land where your head was. Land in a squat.', hl: ['feet'] },
      { f: 5, title: 'Stand up', text: 'Stand up tall with your arms up.' },
    ],
    cues: ['Pizza hands', 'Stay in a ball', 'Push the floor away'],
    mistakes: ['Rolling over one shoulder: push evenly with both hands', 'Opening up halfway: keep your knees by your nose', 'Not pushing: weight lands on your neck. Stop and practise the rock and push first.'],
    safety: 'Learn this down a wedge or soft slope with a coach. Never force it over your neck.',
  },
  {
    id: 'straddleback', group: 'rolls', level: 1, name: 'Straddle backward roll', pic: PIC('straddle_back_roll', 'Straddle backward roll, step by step'), ready: ['broll', 'straddle'],
    frames: [{ a: 20, e: 165, d: 0 }, { t: 70, a: 20, e: 165, l: 100, h: 30, d: 600 }, { x: -12, t: -40, a: 20, e: 165, l: 60, h: 35, d: 600 }, { x: -35, t: -160, a: 20, e: 165, l: 70, h: 40, d: 700 }, { x: -60, t: -300, a: 160, l: 110, h: 10, d: 700 }, { x: -64, t: -360, ...UP, d: 600 }],
    steps: [
      { f: 0, title: 'Pizza hands', text: 'Stand with your back to the mat and your hands by your ears.' },
      { f: 1, title: 'Pike over', text: 'Bend forward with straight legs and sit back towards the mat. Your hands can reach back between your legs to soften the sit.' },
      { f: 2, title: 'Roll back', text: 'Roll back with straight legs, chin to chest.', hl: ['head'] },
      { f: 3, title: 'Open and push', text: 'Open your legs wide as they go over your head and push hard with your hands.', hl: ['hands', 'feet'] },
      { f: 4, title: 'Land in a straddle', text: 'Land on your feet with legs wide and straight, then bring them together to stand.', hl: ['feet'] },
      { f: 5, title: 'Finish', text: 'Stand up with your arms up.' },
    ],
    cues: ['Straight legs the whole way', 'Wide legs, big push'],
    mistakes: ['Bending knees: practise your pike stretch', 'Landing with feet too close: open wider'],
    safety: 'Learn the backward roll first, on a mat or wedge.',
  },

  // ---------- Balances and handstands ----------
  {
    id: 'scale', group: 'hand', level: 0, name: 'Front scale (arabesque)', pic: PIC('scale', 'Front scale balance'), hold: 5,
    frames: [{ ...UP, d: 0 }, { a: 90, l1: 200, d: 600 }, { t: 60, a: 30, l1: 255, h: -20, d: 900, p: 800 }, { a: 90, l1: 200, d: 700 }, { ...UP, d: 600 }],
    steps: [
      { f: 0, title: 'Stand tall', text: 'Stand on one leg with your arms up. Keep the standing leg straight.' },
      { f: 1, title: 'Lift the back leg', text: 'Point your other foot behind you and start lifting it, arms reaching forward.', hl: ['feet'] },
      { f: 2, title: 'Balance', text: 'Lean your chest forward as the leg lifts high behind. Keep your chest up and your back leg straight, and hold for 3 seconds.', hl: ['feet', 'head'] },
      { f: 4, title: 'Come back up', text: 'Lower the leg slowly and stand up tall.' },
    ],
    cues: ['Look at a spot on the floor', 'Long from fingers to toes'],
    mistakes: ['Bent back leg: point and lock it', 'Dropping your chest too low: lift the leg first'],
    safety: 'Practise next to a wall or chair for balance.',
  },
  {
    id: 'bridge', group: 'hand', level: 0, name: 'Bridge', pic: PIC('bridge', 'Bridge'), hold: 10, ready: ['arch'],
    frames: [{ t: -90, l: 135, k: 115, a: 0, d: 0 }, { t: -90, l: 135, k: 115, a: 20, e: 160, d: 600 }, { ...BRIDGE, d: 900, p: 800 }, { t: -90, l: 135, k: 115, a: 20, e: 160, d: 900 }],
    steps: [
      { f: 0, title: 'Lie on your back', text: 'Lie down with your knees bent and feet flat on the floor, close to your bottom.' },
      { f: 1, title: 'Hands by ears', text: 'Put your hands flat beside your ears, fingers pointing towards your shoulders, elbows up.', hl: ['hands'] },
      { f: 2, title: 'Push up', text: 'Push through your hands and feet at the same time. Straighten your arms and push your tummy to the sky. Look at your hands.', hl: ['hands', 'hips'] },
      { f: 3, title: 'Come down slowly', text: 'Tuck your chin and lower your shoulders first, then your bottom.' },
    ],
    cues: ['Tummy to the sky', 'Straight arms, shoulders over hands'],
    mistakes: ['Bent arms: push your shoulders back over your hands', 'Feet too far away: walk them closer'],
    safety: 'Warm up your back and shoulders first. Do not push through back pain.',
  },
  {
    id: 'handstand', group: 'hand', level: 1, name: 'Handstand', pic: PIC('handstand', 'Handstand, step by step'), hold: 10, ready: ['plank', 'dish'],
    frames: [{ ...UP, d: 0 }, { ...LUNGE, d: 600 }, { ...KICK, d: 600 }, { ...HSTAND, d: 600, p: 1000 }, { ...KICK, l1: 190, l2: 90, d: 700 }, { ...LUNGE, l1: 200, l2: 140, k2: 40, k1: 0, d: 700 }, { ...UP, d: 500 }],
    steps: [
      { f: 0, title: 'Arms by ears', text: 'Stand tall with your arms straight up by your ears. Keep them there the whole time.', hl: ['hands'] },
      { f: 1, title: 'Lunge', text: 'Step forward into a lunge: front knee bent, back leg straight, arms still by your ears.', hl: ['feet'] },
      { f: 2, title: 'Reach and kick', text: 'Reach long to put your hands flat on the floor, shoulder width apart, and kick your back leg up.', hl: ['hands'] },
      { f: 3, title: 'Straight as a pencil', text: 'Bring your legs together at the top. Push the floor away, squeeze your tummy and bottom, toes to the ceiling. Look at your hands.', hl: ['hands', 'hips'] },
      { f: 4, title: 'Step down', text: 'Bring one leg down at a time, back the way you came.' },
      { f: 5, title: 'Finish', text: 'Land in a lunge and stand up with your arms by your ears.' },
    ],
    cues: ['Push tall through your shoulders', 'Squeeze everything tight', 'Arms stay by your ears'],
    mistakes: ['Banana back: squeeze your tummy, like your dish shape', 'Bent arms: push the floor away', 'Kicking too hard and falling over: practise against a wall first'],
    safety: 'Learn to cartwheel out if you over-balance: turn a hand and step out sideways. Practise against a wall with lots of space around you.',
  },
  {
    id: 'hsroll', group: 'hand', level: 1, name: 'Handstand forward roll', ready: ['handstand', 'froll'],
    frames: [{ ...UP, d: 0 }, { ...LUNGE, d: 600 }, { ...KICK, d: 600 }, { ...HSTAND, d: 600, p: 600 }, { t: 200, a: 0, e: 70, h: 40, l: 160, d: 600 }, { x: 25, t: 250, h: 40, l: 40, k: 140, a: 60, e: 60, d: 700 }, { x: 48, t: 375, l: 65, k: 110, a: 90, h: 15, d: 700 }, { ...UP, x: 54, t: 360, d: 600 }],
    steps: [
      { f: 1, title: 'Lunge', text: 'Lunge with your arms by your ears.' },
      { f: 3, title: 'Handstand', text: 'Kick to a straight handstand on the mat and hold it for a moment.', hl: ['hands'] },
      { f: 4, title: 'Tuck and bend', text: 'Let your legs tip slightly forward, tuck your chin to your chest and slowly bend your arms.', hl: ['head'] },
      { f: 5, title: 'Roll', text: 'Roll down your rounded back into a tuck.' },
      { f: 6, title: 'Stand up', text: 'Reach forward and stand up without your hands.' },
    ],
    cues: ['Chin in before you bend', 'Lower slowly, like a lift'],
    mistakes: ['Dropping straight onto your back: bend your arms slowly to control it', 'Head not tucked: chin to chest first'],
    safety: 'On a mat only. Have a coach spot you until it is controlled.',
  },

  // ---------- Cartwheels and walkovers ----------
  {
    id: 'cartwheel', group: 'wheels', level: 1, name: 'Cartwheel', view: 'front', pic: PIC('cartwheel', 'Cartwheel, step by step'), ready: ['star', 'plank'],
    frames: [{ a: 15, d: 0 }, { a: 15, l1: 165, l2: 180, d: 500 }, { x: 18, t: 90, a1: 30, a2: 30, l: 150, d: 550 }, { x: 40, t: 180, a: 20, l: 145, d: 500 }, { x: 62, t: 270, a: 20, l: 150, d: 500 }, { x: 82, t: 360, a: 60, l: 155, d: 550 }, { x: 84, t: 360, a: 15, d: 500 }],
    steps: [
      { f: 0, title: 'Arms up', text: 'Stand side on to your line, arms straight up by your ears.' },
      { f: 1, title: 'Step and reach', text: 'Step your front foot along the line and reach your first hand down to the floor.', hl: ['feet'] },
      { f: 2, title: 'Hand, hand', text: 'Put one hand down then the other, all on a straight line. Kick your back leg up and over.', hl: ['hands'] },
      { f: 3, title: 'Straddle at the top', text: 'Go through a straddle handstand with straight arms and legs wide.', hl: ['hands', 'feet'] },
      { f: 4, title: 'Foot, foot', text: 'Land one foot, then the other, still on the line.', hl: ['feet'] },
      { f: 5, title: 'Finish in a star', text: 'Stand up tall facing the way you started, arms up in a star.' },
    ],
    cues: ['Hand, hand, foot, foot', 'Stay on the line', 'Straight legs over the top'],
    mistakes: ['Bent legs that stay low: kick higher and lock your knees', 'Hands and feet off the line: draw a chalk or tape line to follow', 'Landing facing sideways: finish facing where you began'],
    safety: 'Practise on grass or mats with plenty of space. Try a line on the floor or over a small cushion to lift your legs.',
  },
  {
    id: 'roundoff', group: 'wheels', level: 2, coach: true, name: 'Round-off', view: 'front', pic: PIC('roundoff', 'Round-off, step by step'), ready: ['cartwheel', 'handstand'],
    frames: [{ a: 15, d: 0 }, { a: 15, l1: 165, l2: 180, d: 500 }, { x: 18, t: 90, a1: 30, a2: 30, l: 150, d: 500 }, { x: 40, t: 180, a: 20, l: 165, d: 450 }, { x: 55, t: 250, a: 10, l: 180, view: 'back', d: 400 }, { x: 72, t: 350, a: 0, view: 'back', d: 450 }, { x: 74, t: 360, a: 0, lift: 14, view: 'back', d: 300 }, { x: 76, t: 360, a: 0, view: 'back', d: 350 }],
    steps: [
      { f: 1, title: 'Run, hurdle, lunge', text: 'Take a few steps, a little skip (hurdle) and step into a strong lunge with your arms by your ears.' },
      { f: 2, title: 'Hands down, turned', text: 'Reach long like a cartwheel, but turn your second hand in so your fingers point back towards the first.', hl: ['hands'] },
      { f: 3, title: 'Turn at the top', text: 'Kick over and bring your legs together at the top, turning a quarter turn so your tummy faces where you came from.', hl: ['feet'] },
      { f: 4, title: 'Snap down', text: 'Push hard off your hands and snap both feet down together.', hl: ['hands'] },
      { f: 6, title: 'Rebound', text: 'Land on both feet facing back the way you came and bounce up with arms by your ears.', hl: ['feet'] },
    ],
    cues: ['Feet together at the top', 'Push, snap, rebound'],
    mistakes: ['Landing with feet apart: squeeze your legs together over the top', 'Landing too far from your hands: snap your feet down quickly'],
    safety: 'Learn with a coach on a tumbling track or mats. The round-off leads into backwards skills, which must be coached.',
  },
  {
    id: 'kickover', group: 'wheels', level: 1, name: 'Bridge kickover', pic: PIC('handstand_bridge', 'Handstand to bridge, the reverse of a kickover'), ready: ['bridge', 'handstand'],
    frames: [{ ...BRIDGE, d: 0 }, { ...BRIDGE, t: -140, a: 320, l1: 150, k1: 0, d: 700 }, { x: -25, t: -180, a: 360, l1: 120, l2: 230, k: 0, d: 700 }, { x: -48, t: -300, a: 460, l1: 140, k1: 0, l2: 320, k2: 0, d: 700 }, { x: -58, t: -360, a: 0, l1: 200, l2: 160, k: 0, h: 0, d: 600 }],
    steps: [
      { f: 0, title: 'Bridge', text: 'Push up into a strong bridge with straight arms.', hl: ['hands'] },
      { f: 1, title: 'Shoulders over hands', text: 'Rock your shoulders over your hands and lift one straight leg up to the ceiling.', hl: ['shoulders', 'feet'] },
      { f: 2, title: 'Kick over', text: 'Push off your standing foot and kick your leg over the top through a split handstand.', hl: ['hands'] },
      { f: 3, title: 'Land one foot', text: 'Land on your first foot close to your hands, keeping your arms by your ears.', hl: ['feet'] },
      { f: 4, title: 'Stand up', text: 'Stand up in a lunge with your arms up.' },
    ],
    cues: ['Shoulders over hands', 'Lift the leg, then kick'],
    mistakes: ['Bent arms in the bridge: work on shoulder flexibility', 'Kicking with a bent leg: kick long and straight'],
    safety: 'Start on a raised mat or an incline so your feet are higher than your hands. A spotter can support your lower back.',
  },
  {
    id: 'bwalkover', group: 'wheels', level: 2, coach: true, name: 'Back walkover', ready: ['kickover', 'bridge'],
    frames: [{ ...UP, l1: 160, d: 0 }, { t: -35, h: -35, a: -20, l1: 195, l2: 215, d: 800 }, { x: -10, t: -115, h: -30, a: 330, l1: 175, l2: 265, k2: 30, d: 800 }, { x: -30, t: -180, a: 360, l1: 120, l2: 230, d: 700 }, { x: -50, t: -300, a: 460, l1: 140, l2: 320, d: 700 }, { x: -60, t: -360, a: 0, l1: 200, l2: 160, d: 600 }],
    steps: [
      { f: 0, title: 'Point one foot', text: 'Stand tall with your arms by your ears and one foot pointed in front.', hl: ['feet'] },
      { f: 1, title: 'Reach back', text: 'Push your hips forward and reach back with your arms, looking for the floor behind you.', hl: ['hands'] },
      { f: 2, title: 'Hands down, leg up', text: 'Place your hands on the floor in a bridge with your pointed leg lifting up.', hl: ['hands'] },
      { f: 3, title: 'Split handstand', text: 'Push off and pass through a split handstand, legs straight and wide.' },
      { f: 4, title: 'Step down', text: 'Land on your first foot, then the second.', hl: ['feet'] },
      { f: 5, title: 'Finish', text: 'Stand up in a lunge with your arms up.' },
    ],
    cues: ['Hips forward, arms back', 'Look for your hands'],
    mistakes: ['Bending the knees: keep your support leg straight as you arch', 'Dropping fast: reach long and slow'],
    safety: 'Must be learnt with a coach. Needs a strong, flexible bridge and a confident kickover first.',
  },
  {
    id: 'fwalkover', group: 'wheels', level: 2, coach: true, name: 'Front walkover', pic: PIC('handstand_bridge', 'Handstand to bridge, the first half of a front walkover'), ready: ['kickover', 'handstand'],
    frames: [{ ...UP, d: 0 }, { ...LUNGE, d: 600 }, { x: 10, ...KICK, d: 600 }, { x: 28, t: 180, a: 0, l1: 120, l2: 240, h: -10, d: 600 }, { x: 50, t: 245, h: -30, a: 330, l1: 135, l2: 265, k2: 30, d: 800 }, { x: 62, t: 360, a: 0, l2: 140, k2: 40, l1: 200, d: 900 }],
    steps: [
      { f: 1, title: 'Lunge', text: 'Lunge forward with your arms by your ears.' },
      { f: 2, title: 'Kick up', text: 'Reach for the floor and kick through a handstand with your legs split.', hl: ['hands'] },
      { f: 3, title: 'Split at the top', text: 'Keep pushing through your shoulders and keep your legs wide.', hl: ['shoulders'] },
      { f: 4, title: 'Land in a bridge', text: 'Reach your first foot over to land in a bridge, pushing your hips up.', hl: ['feet', 'hips'] },
      { f: 5, title: 'Stand up', text: 'Push your hips forward and stand up with your arms by your ears, other leg stepping down.' },
    ],
    cues: ['Push through the shoulders', 'Hips high, head stays back until you stand'],
    mistakes: ['Lifting the head early: keep your arms by your ears', 'Landing on two feet: step one at a time'],
    safety: 'Learn with a coach. Practise the handstand to bridge (front limber) on a soft mat first.',
  },
  {
    id: 'fhandspring', group: 'wheels', level: 2, coach: true, name: 'Front handspring', pic: PIC('handspring', 'Front handspring, step by step'), ready: ['handstand', 'fwalkover'],
    frames: [{ ...UP, d: 0 }, { ...LUNGE, d: 500 }, { x: 10, ...KICK, d: 500 }, { x: 28, t: 180, a: 0, l: 200, h: -10, d: 400 }, { x: 52, t: 250, a: 330, l: 200, lift: 18, d: 450 }, { x: 70, t: 340, a: 0, l: 200, lift: 8, d: 400 }, { x: 74, t: 360, a: 0, d: 400 }],
    steps: [
      { f: 1, title: 'Hurdle and lunge', text: 'Run, hurdle and step into a long, strong lunge with arms by your ears.' },
      { f: 2, title: 'Block', text: 'Reach long and push hard off the floor through your shoulders as your legs come over.', hl: ['hands', 'shoulders'] },
      { f: 4, title: 'Fly', text: 'Bring your legs together and fly over in a slight arch.' },
      { f: 6, title: 'Land', text: 'Land on both feet with your arms by your ears.', hl: ['feet'] },
    ],
    cues: ['Block through your shoulders', 'Arms stay by your ears'],
    mistakes: ['Bent arms: push the floor away', 'Throwing the head back early: keep your eyes on your hands'],
    safety: 'An advanced skill. Learn only with a coach, on proper mats or a tumble track.',
  },

  // ---------- Jumps and leaps ----------
  {
    id: 'sjump', group: 'jumps', level: 0, name: 'Straight jump',
    frames: [{ d: 0 }, { ...DIP, d: 500 }, { ...UP, lift: 30, d: 350 }, { ...LANDED, d: 350 }, { ...UP, d: 500 }],
    steps: [
      { f: 1, title: 'Bend and swing', text: 'Bend your knees and swing your arms back.' },
      { f: 2, title: 'Jump tall', text: 'Swing your arms up by your ears and jump straight up. Squeeze your legs together and point your toes.', hl: ['feet'] },
      { f: 3, title: 'Land soft', text: 'Land on the balls of your feet, bend your knees and hold your arms out in front. Freeze like a statue.', hl: ['knees'] },
      { f: 4, title: 'Present', text: 'Stand up and lift your arms to finish.' },
    ],
    cues: ['Swing, jump, stick', 'Land quietly'],
    mistakes: ['Stiff-legged landing: bend your knees', 'Wobbling: keep your eyes forward and tummy tight'],
    safety: 'Every jump ends with a soft landing like this one.',
  },
  {
    id: 'tjump', group: 'jumps', level: 0, name: 'Tuck jump', ready: ['sjump', 'tuck'],
    frames: [{ d: 0 }, { ...DIP, d: 500 }, { ...UP, lift: 20, d: 250 }, { t: -5, l: 40, k: 140, a: 110, e: 20, lift: 38, d: 200 }, { ...UP, lift: 15, d: 200 }, { ...LANDED, d: 300 }, { ...UP, d: 500 }],
    steps: [
      { f: 1, title: 'Bend and swing', text: 'Bend your knees and swing your arms back.' },
      { f: 3, title: 'Knees up', text: 'Jump up and pull your knees to your chest in a tuck at the top of the jump. Hands can touch your shins.', hl: ['knees'] },
      { f: 4, title: 'Open', text: 'Kick your legs back down straight before you land.', hl: ['feet'] },
      { f: 5, title: 'Land soft', text: 'Land with bent knees and arms in front.' },
    ],
    cues: ['Knees up, not chest down', 'Open before landing'],
    mistakes: ['Bending forward to meet your knees: keep your chest up', 'Landing still tucked: open early'],
    safety: 'Land on a soft surface.',
  },
  {
    id: 'starjump', group: 'jumps', level: 0, name: 'Star jump', view: 'front', ready: ['star'],
    frames: [{ d: 0 }, { l: 175, k: 20, a: 190, d: 400 }, { a: 45, l: 150, lift: 32, d: 300 }, { l: 175, k: 20, a: 100, d: 300 }, { a: 15, d: 500 }],
    steps: [
      { f: 1, title: 'Bend', text: 'Bend your knees with your arms down.' },
      { f: 2, title: 'Star in the air', text: 'Jump and open into a star at the top: arms and legs wide and straight.', hl: ['hands', 'feet'] },
      { f: 3, title: 'Close and land', text: 'Bring your feet back together before you land, knees soft.', hl: ['feet'] },
    ],
    cues: ['Open at the top, close to land'],
    mistakes: ['Landing with legs apart: snap them together'],
    safety: 'A good warm-up jump too.',
  },
  {
    id: 'stradjump', group: 'jumps', level: 1, name: 'Straddle jump', view: 'front', ready: ['starjump', 'straddle'],
    frames: [{ d: 0 }, { l: 175, k: 20, a: 190, d: 400 }, { a: 10, lift: 22, d: 250 }, { l: 95, a: 80, lift: 42, d: 220 }, { a: 10, lift: 18, d: 220 }, { l: 175, k: 20, a: 100, d: 300 }, { a: 15, d: 500 }],
    steps: [
      { f: 1, title: 'Bend', text: 'Bend your knees and get ready to jump high.' },
      { f: 3, title: 'Straddle', text: 'At the top of the jump, lift both legs out wide and up, toes pointed, and reach your arms towards your toes.', hl: ['feet'] },
      { f: 5, title: 'Close and land', text: 'Bring your legs down and together, then land softly.' },
    ],
    cues: ['Lift your legs, do not drop your chest', 'Jump first, straddle second'],
    mistakes: ['Bent knees: lock them and point', 'Leaning forward: keep your chest up'],
    safety: 'Work on your straddle stretch to lift higher.',
  },
  {
    id: 'leap', group: 'jumps', level: 1, name: 'Split leap', ready: ['sjump', 'pike'],
    frames: [{ t: 5, l1: 160, l2: 200, a1: 150, a2: 210, d: 0 }, { x: 18, t: 5, l1: 150, l2: 200, k2: 30, a: 120, lift: 4, d: 400 }, { x: 50, l1: 90, l2: 270, a1: 60, a2: 110, h: -5, lift: 28, d: 400 }, { x: 80, l1: 170, k1: 30, l2: 220, a: 60, d: 400 }, { x: 88, ...UP, d: 500 }],
    steps: [
      { f: 0, title: 'Run', text: 'Take a few running steps.' },
      { f: 1, title: 'Take off from one foot', text: 'Push off from your back foot and kick your front leg forward and up.', hl: ['feet'] },
      { f: 2, title: 'Split in the air', text: 'Open into the splits in the air: front leg forward, back leg behind, both straight with pointed toes. Arms out for balance.', hl: ['feet'] },
      { f: 3, title: 'Land on the front foot', text: 'Land on your front foot first with a bent knee, then step through.', hl: ['feet'] },
    ],
    cues: ['Kick front, kick back', 'Long legs, pointed toes'],
    mistakes: ['Back leg bent: reach it long behind you', 'Landing on both feet: land front foot first'],
    safety: 'Warm up and stretch your splits first.',
  },

  // ---------- Freestyle ----------
  {
    id: 'precision', group: 'free', level: 0, name: 'Precision landing',
    frames: [{ d: 0 }, { t: 35, l: 110, k: 70, a: 200, h: -10, d: 500 }, { x: 38, t: 10, l: 150, k: 20, a: 20, lift: 25, d: 400 }, { x: 70, t: 40, l: 85, k: 80, a: 60, h: -10, d: 350, p: 600 }, { x: 72, ...UP, d: 600 }],
    steps: [
      { f: 1, title: 'Swing back', text: 'Stand with feet hip width apart. Bend your knees, lean forward and swing your arms back.' },
      { f: 2, title: 'Jump forward', text: 'Swing your arms forward and jump forwards off both feet, looking at your landing spot.', hl: ['head'] },
      { f: 3, title: 'Stick it', text: 'Land on the balls of both feet together, bend your knees and hips to soak it up, arms forward. Freeze with no wobble.', hl: ['feet', 'knees'] },
      { f: 4, title: 'Stand', text: 'Stand up tall.' },
    ],
    cues: ['Eyes on the spot', 'Land quiet, like a cat'],
    mistakes: ['Landing flat-footed: land on the balls of your feet', 'Knees falling in: keep them over your toes'],
    safety: 'Start with short jumps to a line on the ground, then build distance. Only jump to low, solid targets.',
  },
  {
    id: 'saferoll', group: 'free', level: 0, name: 'Safety roll', ready: ['froll'],
    frames: [{ d: 0 }, { x: 5, t: 40, l: 55, k: 95, a1: 110, a2: 150, h: 20, d: 600 }, { x: 20, t: 110, h: 50, a1: 40, a2: 80, l: 110, k: 30, d: 600 }, { x: 45, t: 240, h: 40, l: 45, k: 130, a: 80, d: 700 }, { x: 70, t: 375, l: 65, k: 110, a: 90, h: 15, d: 700 }, { x: 80, t: 360, l1: 160, l2: 200, a1: 150, a2: 210, d: 500 }],
    steps: [
      { f: 1, title: 'Crouch and reach', text: 'Crouch with one foot slightly forward. Reach both hands to the ground, one in front of the other, to make a diamond shape.', hl: ['hands'] },
      { f: 2, title: 'Look away', text: 'Turn your head away from your lead shoulder and tuck it in. Roll onto the back of that shoulder, not your head.', hl: ['head', 'shoulders'] },
      { f: 3, title: 'Roll diagonally', text: 'Roll across your back from that shoulder to the opposite hip. Keep round.' },
      { f: 4, title: 'Up and away', text: 'Use the momentum to come up onto your feet, ready to keep moving.', hl: ['feet'] },
    ],
    cues: ['Shoulder to opposite hip', 'Head away and tucked'],
    mistakes: ['Rolling straight over the spine: go diagonally', 'Head down on the ground: turn and tuck it'],
    safety: 'Learn on grass or mats from a crouch first, then from walking, then from small jumps. This is how freestyle athletes land safely from height.',
  },
  {
    id: 'stepvault', group: 'free', level: 0, name: 'Step vault', props: [{ type: 'box', x: 38, w: 28, h: 28 }],
    frames: [{ t: 5, l1: 150, k1: 20, l2: 210, k2: 20, a1: 150, a2: 210, d: 0 }, { x: 30, t: 60, a1: 110, a2: 200, l1: 85, k1: 70, l2: 145, h: -10, d: 600 }, { x: 50, t: 30, a1: 150, a2: 120, l1: 105, k1: 80, l2: 85, k2: 30, h: -10, d: 600 }, { x: 88, t: 10, l: 150, k: 50, a: 80, d: 600 }, { x: 100, t: 5, l1: 150, k1: 20, l2: 210, k2: 20, a1: 150, a2: 210, d: 500 }],
    steps: [
      { f: 0, title: 'Approach', text: 'Walk or jog towards the box or low wall.' },
      { f: 1, title: 'Hand and foot', text: 'Put one hand on top of the box and step the opposite foot up onto it.', hl: ['hands', 'feet'] },
      { f: 2, title: 'Swing through', text: 'Swing your free leg over and between your hand and foot.', hl: ['feet'] },
      { f: 3, title: 'Land and go', text: 'Land on the other side with soft knees and keep moving.', hl: ['knees'] },
    ],
    cues: ['Hand, foot, swing', 'Look where you land'],
    mistakes: ['Jumping on top with both feet: step and swing through instead'],
    safety: 'Use a padded box or a solid, waist-high object that will not move. Check the landing side is clear.',
  },
  {
    id: 'kong', group: 'free', level: 2, coach: true, name: 'Kong vault', props: [{ type: 'box', x: 46, w: 34, h: 26 }], ready: ['stepvault', 'precision', 'tjump'],
    frames: [{ t: 5, l1: 150, k1: 20, l2: 210, k2: 20, a1: 150, a2: 210, d: 0 }, { x: 18, t: 65, a: 15, l: 180, h: -10, lift: 18, d: 450 }, { x: 42, t: 80, a: 95, l: 30, k: 130, h: -10, d: 400 }, { x: 95, t: 15, l: 120, k: 40, a: 200, lift: 15, d: 450 }, { x: 110, ...LANDED, d: 350 }, { x: 115, ...UP, d: 500 }],
    steps: [
      { f: 0, title: 'Run up', text: 'Run towards the box at a steady speed.' },
      { f: 1, title: 'Dive', text: 'Take off from both feet and dive forward, reaching both hands for the far half of the box.', hl: ['hands'] },
      { f: 2, title: 'Hands down, knees up', text: 'Put both hands on the box and pull your knees up between your arms in a tuck.', hl: ['hands', 'knees'] },
      { f: 3, title: 'Push and pass', text: 'Push off the box hard so your hands come off as your feet pass through.' },
      { f: 4, title: 'Land', text: 'Land on both feet with soft knees.', hl: ['feet'] },
    ],
    cues: ['Reach far, push hard', 'Knees up through your arms'],
    mistakes: ['Hands too close: reach further', 'Feet clipping the box: tuck tighter and push harder'],
    safety: 'Learn with a coach on a soft vault box with a crash mat. Start by jumping to a tuck on top of the box.',
  },
  {
    id: 'diveroll', group: 'free', level: 2, coach: true, name: 'Dive roll', props: [{ type: 'mat', x: 18, w: 95, h: 6 }], ready: ['froll', 'saferoll'],
    frames: [{ ...DIP, d: 0 }, { x: 25, t: 60, a: 5, l: 180, lift: 22, d: 400 }, { x: 45, t: 110, a: 65, e: 40, h: 45, l: 150, k: 20, d: 400 }, { x: 65, t: 230, h: 40, l: 40, k: 140, a: 60, e: 60, d: 600 }, { x: 88, t: 375, l: 65, k: 110, a: 90, h: 15, d: 600 }, { x: 94, t: 360, ...UP, d: 500 }],
    steps: [
      { f: 0, title: 'Swing and bend', text: 'Stand at the mat, swing your arms back and bend your knees.' },
      { f: 1, title: 'Dive forward', text: 'Jump forward and a little up with straight arms reaching ahead.', hl: ['hands'] },
      { f: 2, title: 'Catch and tuck', text: 'Land on your hands, bend your arms to soak it up and tuck your chin in.', hl: ['hands', 'head'] },
      { f: 3, title: 'Roll', text: 'Roll along your rounded back in a tuck.' },
      { f: 4, title: 'Stand', text: 'Come up to your feet and stand.' },
    ],
    cues: ['Hands first, then chin in', 'Bend arms to land soft'],
    mistakes: ['Landing on the head: catch with your hands and bend', 'Diving too high too soon: build up distance slowly'],
    safety: 'Only with a coach on thick mats. Never over people or objects.',
  },
];

export const skillById = (id) => SKILLS.find((s) => s.id === id);
