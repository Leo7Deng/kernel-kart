// Checker only (npm run typecheck reads it; the game never loads it): the few things JSDoc can't say. Everything
// else is typed with JSDoc in the modules themselves (docs/code-map.md "Type checks").

// Race's methods that live in other files: race.js mixes them into Race.prototype with Object.assign at its bottom,
// which the checker can't follow, so their types are merged into the class here. A new object on that Object.assign
// line goes here too.
type RaceMixins = typeof import('./fx.js').fxSpawners & typeof import('./race-mechanics.js').mechanics
  & typeof import('./race-start.js').startRules & typeof import('./race-bits.js').bitRules
  & typeof import('./race-forks.js').forkRules & typeof import('./race-drift.js').driftRules & {
    aiThrottle: typeof import('./race-ai.js').aiThrottle; wantUse: typeof import('./race-ai.js').wantUse;
    dropBehind: typeof import('./race-items.js').dropBehind; useItem: typeof import('./race-items.js').useItem;
    nextItem: typeof import('./race-items.js').nextItem; giveItem: typeof import('./race-items.js').giveItem;
    updateTrain: typeof import('./race-hazards.js').updateTrain; crossingState: typeof import('./race-hazards.js').crossingState;
  };
declare module './race.js' {
  interface Race extends RaceMixins {
    /** when GO was (race-start.js sets it) */
    goT?: number;
    /** 3+ players: the item odds lean harder on the leader (ui.js, net.js) */
    packMode?: boolean;
    /** online only: { role: 'host' | 'player', quit, link? } (net.js) */
    net?: { role: 'host' | 'player', quit: () => void, link?: () => any };
    /** online only: the players at this screen (net-sync.js); offline it's race.humans */
    localHumans?: import('./race.js').Car[];
    // the mechanics' per-race state that a checked module reads (each race-<name>.js keeps its own on the race, made
    // when it's first needed): add yours here when a checked module starts reading it
    /** the bits on the road: each spot's state (race-bits.js) */
    bits: number[];
    /** bits thrown out by a hit, lying loose (race-bits.js) */
    loose: any[];
    /** the logic gate's state (race-gate.js) */
    gate?: { until: number, at: number, by: number, shut: boolean };
    /** the giant crab's state, one per zone (race-crab.js) */
    crab?: any[];
  }
  interface Car {
    /** the route it's on this lap (the track itself, or one of a course's routes): set by Race right after new Car */
    T: import('./geometry.js').Track;
  }
}

// Fight's two non-enumerable fields (Object.defineProperty in its constructor, so the online snapshots skip them).
declare module './fight.js' {
  interface Fight {
    /** the arena: static data (js/fight-arenas.js) */
    A: import('./fight-arenas.js').Arena;
    /** the random streams: bot 0's, bot 1's, the fight's (the only randomness a kit may use) */
    rngs: (() => number)[];
  }
}
export {};
