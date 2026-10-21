// What changed in each version, newest first. The app shows these once after an update, and
// tools/release.mjs uses the same text for the GitHub release notes (it will not publish a version missing here).
// Keep each line short and plain: what was added or changed, from the player's point of view.
export const WHATS_NEW = [
  { v: '1.19.1', items: [
    'New: Colour vision settings. Tap the colours you find hard to see and the whole app shifts its colours to make them clearer, with a gentle or strong setting.',
    'Share GameHub with a friend: tap the share button on the games screen for a QR code, or send the link.',
    'Updating now shows its progress on screen, explains anything Android needs from you, and offers the browser as a backup if the download gets stuck.',
  ] },
  { v: '1.19.0', items: [
    'New: Land Grab. Loop out from your land and back again to claim it, against nine computer animals, on six maps.',
    'Arrow Away: from level 15, every fourth level is a 3D shape. Drag to turn it, and watch arrows follow the surface round corners.',
    'New colourblind mode in Settings. It adds symbols, outlines and labels wherever a game uses colour to mean something.',
    'Gridlock has a new set of 320 car parks that get harder sooner, with easier breathers between. Your stars reset for the new set, but your unlocked levels stay.',
    'Snip Buddies and Play Together: much less lag when playing on two phones.',
    'Guesswork: in dark theme, keyboard letters show their colours again.',
  ] },
  { v: '1.18.0', items: [
    'Play Together and Snip Buddies: a friend without the app can join from their browser, on an iPhone or a computer. Tap Host, then Friend on a browser, and they scan the QR code.',
    'If their phone locks or the wifi drops for a moment, the game reconnects and carries on.',
  ] },
  { v: '1.17.0', items: [
    "New: Casino Night, seven casino games with free play chips: Blackjack, Texas Hold'em, Roulette, Craps, Baccarat, Video Poker and Pokies.",
    'Play chips only. No real money is used or won, and you get a free top-up if you run out.',
    "Blackjack has a strategy hint, Hold'em has three computer players with their own styles, and Craps explains every bet.",
  ] },
  { v: '1.16.0', items: [
    'Web Swing has been rebuilt: smoother swinging, a glowing target, perfect releases for a speed boost, wall runs and rooftop running.',
    'Tap in the air to flip, kick drones, fly through speed rings and build swing combos as the city turns from day to night.',
    'Every Web Swing run has three challenges for bonus coins, and a ghost of your best run to race.',
    'Snip Buddies: legs now stay on whichever way up you are, so you can crouch and stand tall on your side or upside down too.',
  ] },
  { v: '1.15.1', items: [
    'Treat Twist: jelly is much easier to see. Jelly tiles are bright pink with a glowing edge, and double jelly is deeper pink with two rings.',
  ] },
  { v: '1.15.0', items: [
    'Treat Twist has been rebuilt: glossy new candies, a winding level map across eight worlds and 120 new levels.',
    'Make striped, wrapped and rainbow candies, and swap two specials together for huge combos.',
    'New goals: jelly, biscuits, spreading chocolate, liquorice locks and sweets to bring down.',
    'Boosters (hammer, free swap, shuffle and +5 moves) are earned by playing. No lives and no waiting.',
    'After an update, this card shows what changed. You can open it again from Settings.',
  ] },
  { v: '1.14.0', items: [
    'Snip Buddies: 28 new levels, 50 in all, with puzzles that need standing tall, crouching or lying flat.',
  ] },
  { v: '1.13.0', items: [
    'Snip Buddies: the buddies now stand on legs. Crouch and the new Stand tall button change their height without squashing the paper.',
    'Play Together: real pictures for the discs, stones, ships, balloons, pucks, paddles, bikes and football.',
    'A New badge shows on games you have not opened yet.',
  ] },
  { v: '1.12.0', items: [
    'Play Together: 20 two-player games on one phone, or on two phones over wifi, a hotspot or Bluetooth.',
    'Snip Buddies: tap the bulb for a hint showing the shape each buddy needs.',
  ] },
  { v: '1.11.0', items: [
    'Six new games: Arrow Away, Chess, Sweet Drop, Snip Buddies, Turtle Bay and Marvel Heroes.',
  ] },
];

// Compares version strings like 1.12.0 (pre-release suffixes are ignored).
export function cmpVersion(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number), pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
