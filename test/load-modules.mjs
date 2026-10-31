// Imports the game's simulation modules straight into Node (no DOM: race.js and what it imports never touch it at load).
const { Race } = await import('../js/race.js');
const { TRACKS } = await import('../js/tracks.js');
const { CHARACTERS } = await import('../js/core.js');
const { ITEMS, TIERS, itemChances } = await import('../js/items/index.js');
const { BOT } = await import('../js/race-drift.js');
export default () => ({ Race, TRACKS, CHARACTERS, ITEMS, TIERS, itemChances, driftBot: BOT, setRandom: fn => { Math.random = fn; } });
