// Fight mode's fighters: every number the sim (js/fight.js) and the bots (js/fight-ai.js) use, plus the names and
// blurbs the setup screen and README show. Times are seconds, distances world units (a mascot is ~46 tall), speeds
// units/s. A move's kb is its knockback speed (units/s) before weight (and the counter/flank bonus); `reach` is measured
// from the body's edge; `arc` is the hit cone in degrees round the facing.
//
// Combat fields, per move (js/fight.js reads them; anything left out gets its kind's default from MOVE_KIND below,
// filled in when this file loads, so a new fighter only writes what differs):
//   kind         'light' | 'heavy' | 'special' | 'super' (default: from the move's key: light1..5 light, heavy, special, super)
//   startup, active, recovery   the three phases, seconds. Hit in startup (wind-up or charging): a counter hit (x1.4,
//                longer stagger) and the move is gone, unless armor soaks it. Active: it hits; two contact moves active
//                and in reach of each other both land (a trade). Recovery: helpless, punishable.
//   cost         stamina it takes when it starts (default by kind: RULES.cost in fight.js; light 0.06, heavy 0.14,
//                special 0.12, super 0)
//   prio         the hit's weight against armor: light 1 (light armor soaks it), heavy and special 2, super 3
//   contact      true when the active frames hit by touch (punches, lunges, slides): only those trade, and they whiff
//                (stamina) when they meet nothing. Thrown things (the cup, the clones) don't
//   armor        armor in startup: null, 'light' (soaks light hits: you take the damage but don't flinch) or 'super'
//                (soaks every hit)
//   chargeArmor  armor while a held heavy is at least half charged: 'light' for heavies
//   blockStun    seconds the blocker is held in their guard by this hit (default 0.1 + 0.012 x damage: bigger hits hold
//                you longer)
//   pushback     units/s the attacker is pushed back off a block (light 70, heavy 30, special 45, super 0)
//   kd           true: a clean hit always knocks down (a toboggan, a pop up from under, a coil's toss...). Otherwise a
//                full charge, a chain's finisher on a counter or a flank, a wall slam or knockback over RULES.downKb do
//   stun         hitstun override (default 0.22 + kb/1200 after weight, x the combo's decay)
//   whiff        true: a special that costs whiff stamina when it catches nothing (the coil, the tentacle, the zap...)
//   stale        whether repeating it within your last 5 landed hits weakens it (~10% each: RULES.stale in fight.js)
//   do, icon, pose   a special's or super's behaviour (js/fight-kits.js KITS), the icon its key shows (draw-kits.js), the
//                3D pose it strikes in (wpose: its wind-up's); hit/last/shove/seg/boom/swap/dbl: its own sub-hits (SUBS)
// A heavy: maxCharge (s held past its startup to a full charge: fires by itself then, and knocks down), chargeDmg and
// chargeKb (x at full charge), lunge (units/s forward while active) or hop + hopH (Tux's flop).
// A fighter's own passives (all optional): balance (why it's strong or weak where it is: the balance runs print it),
// regen { wait, rate, cap } (Gopher), guardArc (the shield's half-angle, radians: Ferris's is wider) and blockCost (x the
// stamina a block costs: Ferris), step { dist, cd } multipliers (Pyth's Slither), stepSlide and slide (Tux slides on
// after a step: that long, at that grip), chain (lights in a string: Octo 5), isolation (Docky), stunMul (hitstun and
// knockdowns taken: Swifty), stamRegen (x stamina regrowth: Swifty), dmgOut and dmgIn (Cpp), battery { max, recharge }
// (Bugdroid's special charges).
// Computed, never written: frameData(st) gives each move's startup, active, recovery, armor, blockStun and onBlock
// (the attacker's advantage after a blocked melee hit, seconds: blockStun - recovery; a blocked contact move goes straight
// into its recovery. Below about -0.1 the other's quickest move punishes it).
import { CHARACTERS } from './core.js';
import { PLUGINS } from './kits/index.js';

// the pickable fighters: only the rebuilt ones (2026-10-23: Tux and Duke got three moves each; the other eight wait for
// theirs). The rest are hidden from the pick for now (the user, 2026-10-24: "temporarily disable the other not updated
// characters"; FIGHT_SOON was every other racer, greyed out as "soon"), their old data below, unused
export const FIGHT_ORDER = ['tux', 'duke', 'gopher', 'ferris', 'pyth', 'octo', 'docky', 'swifty', 'cpp', 'droid'];   // (2026-10-24: the rest rebuilt as plug-ins, js/kits/)
// the old roster (light chain, heavy, special, super): kept running (the tests play it) for when they're rebuilt
export const FIGHT_LEGACY = ['gopher', 'ferris', 'pyth', 'octo', 'docky', 'swifty', 'cpp', 'droid'].filter(id => !PLUGINS.some(p => p.id === id));   // (a plug-in replaces its old data)
export const FIGHT_SOON = [];   // (to show them greyed out again: CHARACTERS.map(c => c.id).filter(id => !FIGHT_ORDER.includes(id)))
const D2R = Math.PI / 180;
// a three-move fighter's moves, in key order (the light, heavy and special keys fire them: fight-keys.js MOVE_OF)
export const MOVE_KEYS = ['move1', 'move2', 'move3'];

// the setup screen's 0..1 stat bars, worked out from the numbers below on fixed scales (so a new fighter lands where it
// belongs): health from hp, weight from weight, speed from walk, power from the big hits' (light finisher, heavy,
// special) mean damage and knockback, reach from the light attack's reach (how far your jab gets)
const SCALE = { hp: [80, 130], weight: [0.5, 1.4], walk: [0.5, 1.7], dmg: [5, 14], kb: [40, 160], reach: [12, 44] };
const lin = (v, [lo, hi]) => Math.max(0.05, Math.min(1, (v - lo) / (hi - lo)));
export function fightBars(st) {
  const m = st.moves, r2 = x => Math.round(x * 100) / 100;
  if (st.kit3) {   // three big moves: power from their mean damage and knockback, reach given (how far they work from)
    const ms = MOVE_KEYS.map(k => m[k]), mean = k => ms.reduce((a, b) => a + (b[k] || 0), 0) / ms.length;
    return { health: r2(lin(st.hp, SCALE.hp)), weight: r2(lin(st.weight, SCALE.weight)), speed: r2(lin(st.walk, SCALE.walk)),
      power: r2(st.powerBar ?? 0.8 * lin(mean('damage'), [5, 24]) + 0.2 * lin(mean('kb'), [60, 300])), reach: r2(st.reachBar ?? 0.5) };   // (powerBar: given, for moves whose power isn't their damage: a lock, a whirl of small hits)
  }
  const big = [m['light' + (st.chain || 3)], m.heavy, m.special].filter(b => b.damage != null), mean = k => big.reduce((a, b) => a + (b[k] || 0), 0) / big.length * (k === 'damage' ? st.dmgOut || 1 : 1);   // (Cpp's blink does no damage: left out)
  const r = x => Math.round(x * 100) / 100;
  return { health: r(lin(st.hp, SCALE.hp)), weight: r(lin(st.weight, SCALE.weight)), speed: r(lin(st.walk, SCALE.walk)),
    power: r(0.8 * lin(mean('damage'), SCALE.dmg) + 0.2 * lin(mean('kb'), SCALE.kb)), reach: r(lin(m.light1.reach, SCALE.reach)) };
}

export const FIGHTERS = {
  // ---------------------------------------------------------------- Tux and Duke: three big moves each (2026-10-23, the
  // user: "no more basic fast attack for everyone. maybe 3 ish unique moves to everyone. they can be super strong and seem
  // broken... still try to develop some counter play"). No lights, heavy or super (kit3): move1..move3 on the three
  // attack keys, each its own kit in js/fight-kits.js (`do`) with a tell and an answer. docs/fight-api-tux-duke.md lists
  // their phases, objects, events and poses. A three-move move's fields: name, do, icon, hold ('aim': holding the key
  // aims it, 'steer': the held direction steers it), blurb / tell / answer (the move cards), startup / active / recovery
  // (its base phases), cooldown (s after it ends), damage, kb, kd, and its kit's own numbers. Plus `evade` on the fourth
  // key (the old Guard's: 2026-10-23, the user: "no shield, and just have dodges/dashes/evades... 4 buttons"): each
  // fighter's own. No shield, steps, stamina or flank bonus for them. Their move cards' clips: FIGHTERS[id].clips below
  tux: {
    id: 'tux', name: 'Tux', lang: 'Linux', role: 'Ice tank', kit3: true,
    blurb: 'A heavy penguin who turns the arena into ice: rockets across it on his belly, drops out of the sky like an iceberg, and forks little penguins at you.',
    passive: 'Stable: heavy, so hits push him less far.',
    balance: 'Not tuned for balance yet (2026-10-23, the user: "dont even think about balancing for now").',
    hp: 116, weight: 1.28, walk: 0.92, accel: 26, friction: 26, kbDecay: 2.9, radius: 18,
    slipMul: 0.12, stepSlide: 0.45, slide: 3, reachBar: 0.75,  // slipMul: friction on a coffee puddle (x his own): Tux slips the worst
    moves: {
      move1: { name: 'Toboggan Torpedo', do: 'toboggan', icon: 'toboggan', hold: 'steer',
        blurb: 'Belly-flops and rockets across the arena, bouncing off a wall once. Hits like a truck.',
        tell: 'He crouches and wiggles, aimed at you, and a track of soft prints in the snow curves where he\'ll go.',
        answer: 'Get out of the line (walk, or your evade). Missing, he ends flat on his belly, open.',
        // the crouch (aimed at them, turning up to aimTurn rad/s the held way, eased), then the slide: speed (x iceSpeed on an
        // ice patch), steering up to steer rad/s the held way (eased), bounces off one wall (the next stops him); after: skid
        // (recovery) if it hit, belly flat open if not. (2026-10-24, the user: "the slide seems slightly weak": speed 330 ->
        // 365, damage 17 -> 18.5, kb 235 -> 250, steer 0.65 -> 1)
        startup: 0.38, active: 1.2, recovery: 0.35, belly: 0.75, cooldown: 0.8,
        damage: 18.5, kb: 250, kd: true, contact: true, reach: 4, speed: 365, iceSpeed: 1.3, aimTurn: 2.4, steer: 1, bounces: 1, bounceBack: 160 },
      move2: { name: 'Iceberg Drop', do: 'iceberg', icon: 'iceberg', hold: 'aim',
        blurb: 'Leaps out of sight and lands on his shadow in a big belly flop: everyone under it goes down and the floor freezes.',
        tell: 'His shadow grows and darkens on the floor where he\'ll land.',
        answer: 'Get out of the shadow, or evade as he lands. Hitting nothing leaves him dizzy.',
        // up (up s rising), out of shot, then the drop (drop s); the shadow starts on them (at most far away) and moves
        // aimSpeed the held way (eased in and out over aimEase s) until the drop; landing: R round it, then an ice patch;
        // dizzy if it hit nothing
        startup: 0.2, active: 0.88, recovery: 0.35, up: 0.2, drop: 0.14, dizzy: 0.95, cooldown: 1.5,
        damage: 19, kb: 210, kd: true, R: 54, far: 220, aimSpeed: 115, aimEase: 0.08, high: 520, ice: { r: 66, life: 4, grip: 0.25 } },
      move3: { name: 'fork() Bomb', do: 'fork', icon: 'fork', hold: null,
        blurb: 'Raises his flippers and three little penguins pop out, waddle at them and belly-slide into them.',
        tell: 'Flippers up: he\'s open while he summons.',
        answer: 'Hit or walk round them; an evade lets their slides through. They also shield Tux: a hit at him through one pops it instead.',
        // n penguins (radius r), out wait s apart, popT s popping out, then waddling (walk u/s, turning turn rad/s) at them;
        // within slideAt they belly-slide (slideSpeed, slideT s): a hit each, a stun-s stagger; one fork alive at a time
        startup: 0.45, active: 0.06, recovery: 0.3, cooldown: 1.5, stale: false,
        damage: 4.5, kb: 65, stun: 0.45, n: 3, r: 9, wait: 0.14, popT: 0.18, walk: 62, turn: 2.6, slideAt: 66, slideSpeed: 225, slideT: 0.5, life: 5 },
      evade: { name: 'Ice Block', do: 'iceblock', icon: 'iceblock', hold: null,
        blurb: 'Freezes himself into a block of ice: hits clink off and shatter it, and the shards stagger whoever hit it. Left alone, it cracks open.',
        tell: 'He\'s a block of ice for a moment. Hit it and it shatters back at you, long enough for his toboggan.',
        answer: 'Don\'t attack into the ice: wait for the crack and hit that (an Iceberg Drop aimed at it lands as it cracks).',
        // in the ice (active s: untouchable, rooted), then the crack (recovery s: open); cooldown s after it. Hit (anything
        // that clinks off it, 2026-10-24, the user: "yes add it to the ice block"): it shatters, Tux out at once (a short
        // shatterRec s shake-off, still untouchable, no crack), and the hitter, if within shatter units of him (edge to edge:
        // a smash always, a geyser or a penguin from afar not), is staggered stagger s, pushed back shatterKb u/s
        startup: 0, active: 0.6, recovery: 0.3, cooldown: 2.5, shatter: 50, stagger: 0.75, shatterRec: 0.1, shatterKb: 70 },
    },
  },
  duke: {
    id: 'duke', name: 'Duke', lang: 'Java', role: 'Trickster', kit3: true,
    blurb: 'A quick trickster who bends time and space: pops out of a portal behind you, stops the world, and lobs coffee that erupts under your feet.',
    passive: 'Quick feet: the fastest walker in the fight.',
    balance: 'Not tuned for balance yet (2026-10-23).',
    hp: 106, weight: 0.89, walk: 1.52, accel: 32, friction: 32, kbDecay: 3.4, radius: 15,
    slipMul: 0.25, reachBar: 0.95,
    moves: {
      move1: { name: 'Write Once, Run Anywhere', do: 'portal', icon: 'portal', hold: null,
        blurb: 'Spins out of sight and pops out of a portal behind them with a big two-handed smash.',
        tell: 'A little coffee swirl opens on the floor behind you.',
        answer: 'Walk or evade away from the swirl (he comes from behind). Missing, he stumbles out.',
        // the spin (startup), gone s between portals (the mark behind them: behind units past their back), out s popping out,
        // then the smash (reach from his edge, arc degrees); stumble s open after a miss or a block
        startup: 0.22, active: 0.65, recovery: 0.35, gone: 0.45, out: 0.1, stumble: 0.65, cooldown: 1,
        damage: 18, kb: 215, kd: true, contact: true, reach: 27, arc: 130, behind: 12, lunge: 30, outTurn: 5 },
      move2: { name: 'Stop the World', do: 'stopworld', icon: 'stopworld', hold: null,
        blurb: 'Snaps his fingers: a grey ripple spreads out, and whoever is still inside freezes for a moment while he lands a free hit.',
        tell: 'One arm up, a snap, and a grey ripple spreads out from him.',
        answer: 'Get out of the ripple before it completes, or hit him during the snap. A long cooldown.',
        // the arm up (raise s), then the ring grows to R over the rest of the startup (still a wind-up: hit him and it breaks);
        // inside when it completes: frozen freeze s, the hits on them storing their knockback (x kbMul) till the thaw
        startup: 0.72, active: 0.05, recovery: 0.15, raise: 0.18, miss: 0.55, cooldown: 4.5,
        R: 105, freeze: 1.1, kbMul: 0.5 },
      move3: { name: 'Coffee Geyser', do: 'geyser', icon: 'geyser', hold: 'aim',
        blurb: 'Hurls a steaming coffee pot at a spot: a moment later it erupts into a scalding geyser, then leaves a slippery puddle.',
        tell: 'A wet coffee stain marks the spot, and it bubbles before it blows.',
        answer: 'Walk off the mark, or evade the eruption. He is open while throwing.',
        // the mark on them, near..far from him, moving aimSpeed the held way (eased in and out over aimEase s) while the key
        // is held (up to holdMax more); the pot flies flight s, brews brew s, erupts erupt s (r round it), then a puddle
        startup: 0.3, active: 0.1, recovery: 0.35, holdMax: 0.5, cooldown: 1,
        damage: 14.5, kb: 200, kd: true, r: 34, near: 60, far: 220, aimSpeed: 150, aimEase: 0.08, flight: 0.42, brew: 0.42, erupt: 0.35, puddle: 34, puddleLife: 4 },
      evade: { name: 'Garbage Collect', do: 'gc', icon: 'gc', hold: null,
        blurb: 'Blinks a short way the held way (or away from them), untouchable for the blink. Two charges.',
        tell: 'His charges show by his feet: none left, he can\'t get away.', answer: 'Bait both charges, then commit.',
        // the blink: out (active / 2), dist units the held way (none held: away from them), in; untouchable all of it, then
        // recovery s; charges, each one back recharge s after it's spent
        startup: 0, active: 0.12, recovery: 0.18, dist: 110, charges: 2, recharge: 1.8, cooldown: 0 },
    },
  },
  // ---------------------------------------------------------------- the other eight (2026-10-23, the user: "you can
  // start doing all the other characters"). A special's or super's `do` names its behaviour in js/fight-kits.js; `icon`
  // the key display's icon for it; `pose` the 3D pose it strikes in
  // (gopher and ferris: rebuilt 2026-10-24 as plug-ins, js/kits/gopher.js and js/kits/ferris.js)
  pyth: {
    id: 'pyth', name: 'Pyth', lang: 'Python', role: 'Grappler',
    blurb: 'A long snake with the longest reach in the game and a coil that wraps you up from across the room. Light and easily hurt once you get past the tail.',
    passive: 'Slither: his steps go further and come back sooner.',
    balance: 'Grappler: the longest jabs and a coil you have to step out of; light. Out-reaches the zoner and the fragile (Duke ~63%, Cpp ~62%); Bugdroid\'s zap and the heavy hitters that get past the tail are trouble (~45%). About 54%.',
    hp: 104, weight: 0.86, walk: 1.18, accel: 30, friction: 30, kbDecay: 3.2, radius: 15,
    slipMul: 0.22, step: { dist: 1.3, cd: 0.75 },
    moves: {
      light1: { name: 'Whitespace Whip', startup: 0.09, active: 0.06, recovery: 0.15, damage: 4.8, kb: 24, reach: 40, arc: 60 },
      light2: { name: 'Whitespace Whip', startup: 0.09, active: 0.06, recovery: 0.15, damage: 4.8, kb: 24, reach: 40, arc: 60 },
      light3: { name: 'Whitespace Whip', startup: 0.12, active: 0.07, recovery: 0.3, damage: 8.6, kb: 108, reach: 42, arc: 70 },
      heavy: { name: 'Lambda Lunge', startup: 0.2, active: 0.16, recovery: 0.42, damage: 15.5, kb: 125, reach: 36, arc: 70,
        lunge: 470, chargeDmg: 0.5, chargeKb: 0.5, maxCharge: 0.8, pose: 'lunge' },
      special: { name: 'Coil', do: 'coil', icon: 'coil', startup: 0.28, active: 0.12, recovery: 0.55, damage: 14.9, kb: 110, reach: 76, arc: 50,
        cooldown: 1.8, hold: 0.7, kd: true, whiff: true, pose: 'coil' },             // wraps them up from range (can't be blocked: step out of it), squeezes, then tosses them down
      super: { name: 'import antigravity', do: 'lift', startup: 0.3, active: 0.05, recovery: 0.25, range: 200, float: 1.4, h: 18, pose: 'lunge' },   // lifts them: helpless in the air, hits don't knock them down
    },
  },
  octo: {
    id: 'octo', name: 'Octo', lang: 'Git', role: 'Combo machine',
    blurb: 'Eight arms and every one of them busy: lots of quick little hits that add up, and a tentacle that drags you in for more.',
    passive: 'Eight Arms: his quick-attack chain is 5 hits long, not 3, and the first four cost him less stamina.',
    balance: 'Combo machine: five cheap hits to a string and a tentacle that starts them from range; each hit is small, so armor and stale moves hurt him and the tank out-trades him (Tux ~40%). About 48%.',
    hp: 118, weight: 1, walk: 1.1, accel: 30, friction: 30, kbDecay: 3.1, radius: 17,
    slipMul: 0.2, chain: 5,
    moves: {
      light1: { name: 'Commit Combo', startup: 0.07, active: 0.05, recovery: 0.11, damage: 5, kb: 20, reach: 28, arc: 110, cost: 0.05 },
      light2: { name: 'Commit Combo', startup: 0.07, active: 0.05, recovery: 0.11, damage: 5, kb: 20, reach: 28, arc: 110, cost: 0.05 },
      light3: { name: 'Commit Combo', startup: 0.07, active: 0.05, recovery: 0.11, damage: 5, kb: 20, reach: 28, arc: 110, cost: 0.05 },
      light4: { name: 'Commit Combo', startup: 0.07, active: 0.05, recovery: 0.11, damage: 5, kb: 20, reach: 28, arc: 110, cost: 0.05 },
      light5: { name: 'Commit Combo', startup: 0.1, active: 0.07, recovery: 0.3, damage: 10.5, kb: 115, reach: 30, arc: 130 },
      heavy: { name: 'Rebase Slam', startup: 0.2, active: 0.15, recovery: 0.38, damage: 16.7, kb: 135, reach: 30, arc: 120,
        lunge: 230, chargeDmg: 0.5, chargeKb: 0.5, maxCharge: 0.8 },
      special: { name: 'Pull Request', do: 'pull', icon: 'tentacle', startup: 0.18, active: 0.16, recovery: 0.42, damage: 4.6, kb: 0, reach: 88, arc: 40,
        cooldown: 1.5, stagger: 0.5, whiff: true, pose: 'ink' },                       // a tentacle from range: catches them and yanks them in, open
      super: { name: 'Merge Conflict', do: 'spin', startup: 0.28, active: 1.05, recovery: 0.4, reach: 26, arc: 360, contact: true, tick: 0.13, speed: 70, pose: 'spin',
        hit: { damage: 2.5, kb: 50 }, last: { damage: 8, kb: 160, kd: true } },   // spins all eight arms: hits all round him again and again, the last spin knocks down
    },
  },
  docky: {
    id: 'docky', name: 'Docky', lang: 'Docker', role: 'Builder',
    blurb: 'The heaviest of all and the slowest: hard to move, light hits, but he drops shipping containers that wall you in and can be shoved into you.',
    passive: 'Isolation: the first hit he takes each round does no damage.',
    balance: 'Builder: the most health and weight, light hits, containers that wall out the small ones and knock down when shoved (Cpp ~63%, Bugdroid ~62%, Ferris ~68%). Slow: Duke\'s jab and cup run rings round him (~25%). About 50%.',
    hp: 122, weight: 1.38, walk: 0.92, accel: 24, friction: 26, kbDecay: 2.8, radius: 20,
    slipMul: 0.18, isolation: true,
    moves: {
      light1: { name: 'Layer Slaps', startup: 0.09, active: 0.06, recovery: 0.17, damage: 5.8, kb: 30, reach: 28, arc: 120 },
      light2: { name: 'Layer Slaps', startup: 0.09, active: 0.06, recovery: 0.17, damage: 5.8, kb: 30, reach: 28, arc: 120 },
      light3: { name: 'Layer Slaps', startup: 0.13, active: 0.08, recovery: 0.32, damage: 9.2, kb: 120, reach: 30, arc: 130 },
      heavy: { name: 'Blowhole', startup: 0.24, active: 0.16, recovery: 0.4, damage: 16.1, kb: 140, reach: 32, arc: 120,
        lunge: 200, chargeDmg: 0.5, chargeKb: 0.5, maxCharge: 0.8, pose: 'spout' },   // a spout of water right in front
      special: { name: 'Container', do: 'crate', icon: 'crate', startup: 0.26, active: 0.05, recovery: 0.3, damage: 10.3, kb: 120, reach: 0, arc: 360,
        cooldown: 2.2, armor: 'light', dist: 46, size: 32, life: 5, fall: 0.3, max: 2, pose: 'stack',
        shove: { damage: 11.5, kb: 150, kd: true, v: 380 } },                            // drops a crate in front: a solid for 5 s; hit it and it slides
      super: { name: 'docker compose', do: 'compose', startup: 0.3, active: 0.05, recovery: 0.3, n: 5, every: 0.22, fall: 0.55, spread: 46, damage: 6.9, kb: 110,
        r: 22, size: 30, life: 2.6, pose: 'stack' },                                   // containers rain down round them
    },
  },
  swifty: {
    id: 'swifty', name: 'Swifty', lang: 'Swift', role: 'Rushdown',
    blurb: 'The fastest and lightest of all: a bird that dives across the arena before you can blink. The least health, and easily knocked about.',
    passive: 'Lightweight: back on her feet sooner after a hit or a knockdown, and her stamina comes back faster.',
    balance: 'Rushdown: fastest and lightest, the least health; her dive and steps get her round guards and to the zoners (Duke ~57%, Cpp ~68%). Light and easily knocked about: the tanks and the trapper\'s zap stop her (Tux ~42%, Bugdroid ~45%). About 50%.',
    hp: 100, weight: 0.8, walk: 1.45, accel: 34, friction: 32, kbDecay: 3.6, radius: 14,
    slipMul: 0.25, stunMul: 0.9, stamRegen: 1.1,
    moves: {
      light1: { name: 'Talon Taps', startup: 0.05, active: 0.04, recovery: 0.1, damage: 4.4, kb: 22, reach: 26, arc: 90 },
      light2: { name: 'Talon Taps', startup: 0.05, active: 0.04, recovery: 0.1, damage: 4.4, kb: 22, reach: 26, arc: 90 },
      light3: { name: 'Talon Taps', startup: 0.08, active: 0.06, recovery: 0.26, damage: 8.3, kb: 108, reach: 28, arc: 100 },
      heavy: { name: 'guard let Kick', startup: 0.15, active: 0.14, recovery: 0.36, damage: 14.9, kb: 130, reach: 26, arc: 80,
        lunge: 380, chargeDmg: 0.5, chargeKb: 0.5, maxCharge: 0.8 },
      special: { name: 'Swift Dive', do: 'dive', icon: 'dive', startup: 0.1, active: 0.32, recovery: 0.34, damage: 9, kb: 130, reach: 4, arc: 360,
        speed: 520, steer: 2, hopH: 16, cooldown: 1.3, contact: true, pose: 'dive' },
      super: { name: 'Optional Chaining', do: 'chain', startup: 0.24, active: 0.3, recovery: 0.36, n: 3, gap: 0.1, speed: 560, turn: 7, reach: 6, arc: 360, contact: true, pose: 'dive',
        hit: { damage: 5.8, kb: 70 }, last: { damage: 8.6, kb: 160, kd: true } },   // three homing dives in a row, the last knocks down
    },
  },
  cpp: {
    id: 'cpp', name: 'Cpp', lang: 'C++', role: 'Glass cannon',
    blurb: 'Keith, a rat with no safety checks: hits harder than anyone, blinks round the arena on a pointer, and goes down fast when you catch him.',
    passive: 'Manual Memory: he deals 15% more damage, and takes 15% more.',
    balance: 'Glass cannon: the hardest hits and takes 15% more; the blink crosses up into a flank. Every clean hit on him hurts, so the long reaches and the fast ones out-poke him (Swifty ~32%, Pyth ~38%). About 43%: the riskiest pick.',
    hp: 118, weight: 0.82, walk: 1.36, accel: 30, friction: 30, kbDecay: 3.3, radius: 15,
    slipMul: 0.22, dmgOut: 1.15, dmgIn: 1.15,
    moves: {
      light1: { name: 'Byte Bites', startup: 0.07, active: 0.05, recovery: 0.13, damage: 5.8, kb: 26, reach: 28, arc: 90 },
      light2: { name: 'Byte Bites', startup: 0.07, active: 0.05, recovery: 0.13, damage: 5.8, kb: 26, reach: 28, arc: 90 },
      light3: { name: 'Byte Bites', startup: 0.1, active: 0.06, recovery: 0.3, damage: 9.2, kb: 115, reach: 28, arc: 100 },
      heavy: { name: 'Segfault Smash', startup: 0.17, active: 0.14, recovery: 0.42, damage: 17.8, kb: 135, reach: 26, arc: 80,
        lunge: 330, chargeDmg: 0.5, chargeKb: 0.5, maxCharge: 0.8, pose: 'gnaw' },
      special: { name: 'Pointer', do: 'blink', icon: 'pointer', startup: 0.1, active: 0.06, recovery: 0.24, reach: 0, arc: 360, dist: 95, cooldown: 1.1, pose: 'scurry' },   // blinks a short way ahead (round behind them, if they're in the way)
      super: { name: 'Undefined Behavior', do: 'ub', startup: 0.3, active: 0.05, recovery: 0.3, pose: 'gnaw',
        // one of these, from the fight's own seeded stream: segfault (they crash: dizzy), stack overflow (a blast round him),
        // use after free (he swaps places with them and they take a hit), double free (both take one, they take more)
        seg: { dizzy: 1.4, damage: 4.6 }, boom: { r: 105, damage: 18.4, kb: 180, kd: true }, swap: { damage: 13.8, kb: 60 }, dbl: { damage: 16.1, self: 5, kb: 90 } },
    },
  },
  droid: {
    id: 'droid', name: 'Bugdroid', lang: 'Android', role: 'Trapper',
    blurb: 'A sturdy robot with slow, solid hits: zaps you still from range and fills the floor with an electric field you don\'t want to stand in.',
    passive: 'Battery: his zap holds two charges and recharges by itself (one every 2.4 s).',
    balance: 'Trapper: slow, solid hits, a zap that stuns into a heavy, a field that takes ground away. Beats the ones he can catch (Gopher ~67%, Swifty ~55%); Duke\'s reach and Docky\'s containers keep him at bay (~38%). About 51%.',
    hp: 116, weight: 1.05, walk: 0.98, accel: 28, friction: 28, kbDecay: 3, radius: 17,
    slipMul: 0.2, battery: { max: 2, recharge: 2.4 },
    moves: {
      light1: { name: 'Intent Jabs', startup: 0.09, active: 0.06, recovery: 0.16, damage: 6, kb: 28, reach: 26, arc: 100 },
      light2: { name: 'Intent Jabs', startup: 0.09, active: 0.06, recovery: 0.16, damage: 6, kb: 28, reach: 26, arc: 100 },
      light3: { name: 'Intent Jabs', startup: 0.14, active: 0.08, recovery: 0.32, damage: 9.8, kb: 120, reach: 28, arc: 110 },
      heavy: { name: 'Fragment Punch', startup: 0.24, active: 0.15, recovery: 0.4, damage: 17.8, kb: 140, reach: 28, arc: 90,
        lunge: 250, chargeDmg: 0.5, chargeKb: 0.5, maxCharge: 0.8 },
      special: { name: 'Antenna Zap', do: 'zap', icon: 'zap', startup: 0.2, active: 0.14, recovery: 0.3, damage: 6.3, kb: 30, reach: 78, arc: 360, width: 12,
        stun: 0.6, cooldown: 0.35, whiff: true, pose: 'antenna' },                     // a short beam from his antennae: stuns them for a moment
      super: { name: 'Boot Loop', do: 'field', startup: 0.3, active: 0.05, recovery: 0.3, r: 62, life: 4, dwell: 0.4, stun: 0.9, damage: 5.8, immune: 0.9, slow: 0.6, pose: 'boot' },   // an electric field under them: stay in it and you're stunned
    },
  },
};
// the plug-in fighters (2026-10-24: js/kits/<id>.js, listed in js/kits/index.js): each brings its own FIGHTERS entry
for (const p of PLUGINS) { const st = FIGHTERS[p.id] = p.fighter; if (Array.isArray(st.phFade)) st.phFade = new Set(st.phFade); }
// ---------------------------------------------------------------- the three-move fighters' clips
// the move cards' scripted clips (fight-clips.js's format; test/fight.test.mjs checks each lands): where the two stand
// (x of the one showing it, fighter 0, and of the other), how long, the camera ({ x, y?, w }), and the inputs over time
// for each, [from, to, input]. Per fighter: the three moves, and the evade (out of the other's move)
const P = (a, b, inp) => [a, b, inp];
FIGHTERS.tux.clips = {
  move1: { x: [-110, 40], len: 2.4, cam: { x: -20, w: 300 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-80, 40], len: 2.6, cam: { x: -10, w: 290 }, a: [P(0.3, 0.38, { heavy: 1 })] },
  move3: { x: [-110, 60], len: 3.2, cam: { x: -20, w: 310 }, a: [P(0.3, 0.38, { special: 1 })] },
  evade: { x: [-50, 60], len: 2.6, cam: { x: 0, w: 260 }, a: [P(0.85, 0.9, { guard: 1 }), P(1.12, 1.18, { light: 1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (Duke's smash shatters the ice, the shards stagger him, the toboggan)
};
FIGHTERS.duke.clips = {
  move1: { x: [-90, 40], len: 2.4, cam: { x: -10, w: 280 }, a: [P(0.3, 0.38, { light: 1 })] },
  move2: { x: [-50, 40], len: 3, cam: { x: 0, w: 290 }, a: [P(0.3, 0.38, { heavy: 1 }), P(1.3, 1.38, { light: 1 })] },   // (and a portal smash on the statue)
  move3: { x: [-100, 60], len: 2.8, cam: { x: -10, w: 300 }, a: [P(0.3, 0.5, { special: 1 })] },
  evade: { x: [-40, 110], len: 2.4, cam: { x: 10, w: 300 }, a: [P(0.82, 0.88, { guard: 1, x: 0, y: -1 })], b: [P(0.3, 0.38, { light: 1 })] },   // (a blink out of the toboggan's line)
};

// ---------------------------------------------------------------- combat defaults by kind (see the header)
export const MOVE_KIND = {
  light: { prio: 1, contact: true, armor: null, chargeArmor: null, pushback: 70, stale: true },
  heavy: { prio: 2, contact: true, armor: null, chargeArmor: 'light', pushback: 30, stale: true },
  special: { prio: 2, contact: false, armor: null, chargeArmor: null, pushback: 45, stale: true },
  super: { prio: 3, contact: false, armor: 'super', chargeArmor: null, pushback: 0, stale: true },
};
const kindOf = key => /^light/.test(key) ? 'light' : MOVE_KIND[key] ? key : 'special';
export function fillMove(key, mv) {
  const kind = mv.kind || kindOf(key), d = MOVE_KIND[kind];
  for (const k in d) if (mv[k] === undefined) mv[k] = d[k];
  mv.kind = kind;
  if (mv.damage !== undefined && mv.kb === undefined) mv.kb = 0;
  if (mv.blockStun === undefined && mv.damage !== undefined) mv.blockStun = Math.round((0.1 + 0.012 * mv.damage) * 1000) / 1000;
  return mv;
}
// fighter f's armor right now against a hit of priority p: 'light', 'super' or null (only armor that would soak it)
export function armorOf(f, p = 1) {
  if (!f.move || !(f.state === 'wind' || f.state === 'charge')) return null;
  const mv = f.stats.moves[f.move]; if (!mv) return null;
  // (holding a heavy: armored once it's half charged; its wind-up: its own armor)
  const held = f.move === 'heavy' && f.charge >= 0.5 && mv.chargeArmor;
  let a = f.state === 'charge' ? (mv.armor === 'super' ? 'super' : held ? mv.chargeArmor : mv.armor) : mv.armor;
  if (a === 'super') return 'super';
  if (a === 'light' && p <= 1) return 'light';
  return null;
}
// the frame data per move (the docs' table, the bots)
export const FRAME_MOVES = ['light1', 'light2', 'light3', 'light4', 'light5', 'heavy', 'special', 'super'];
// the specials whose hit comes from the fighter right there (a pop, a beam): their on-block counts like a punch's
const AT_HAND = new Set(['dig', 'zap']);
const NOTE = { coil: 'a hold: can\'t be blocked, step out of it', counter: 'a stance: blocks a hit from in front, pinches back', blink: 'no hit', own: 'no hit (a lock)', lift: 'can\'t be blocked',
  spin: 'many hits: a block doesn\'t stop it', chain: 'three dives: a block doesn\'t stop them', pull: 'thrown (a tentacle)', crate: 'thrown (a container)', compose: 'thrown (containers)', swarm: 'thrown (gophers)', field: 'a field: can\'t be blocked', ub: 'varies' };
export function frameData(st) {
  return FRAME_MOVES.filter(k => st.moves[k]).map(k => {
    const m = st.moves[k];
    return { key: k, name: m.name, kind: m.kind, startup: m.startup, active: m.active, recovery: m.recovery, prio: m.prio, cost: m.cost ?? null, kd: !!m.kd,
      armor: m.armor || (m.chargeArmor ? m.chargeArmor + ' from half charge' : null), damage: m.damage ?? (m.hit ? m.hit.damage + ' a hit' : null), blockStun: m.blockStun ?? null,
      contact: !!m.contact, onBlock: m.blockStun != null && (m.contact || AT_HAND.has(m.do)) ? Math.round((m.blockStun - m.recovery) * 1000) / 1000 : null,   // (a thrown thing: the thrower's timing is its own)
      note: NOTE[m.do] || null };
  });
}
// a move's own sub-hits (Merge Conflict's spins and its last one, the container's shove, Undefined Behavior's outcomes):
// moves of the parent's kind and priority that never go stale on their own
export const SUBS = ['hit', 'last', 'shove', 'seg', 'boom', 'swap', 'dbl'];
function fillSubs(mv) {
  for (const k of SUBS) if (mv[k] && typeof mv[k] === 'object') {
    const s = mv[k] = { kind: mv.kind, prio: mv.prio, contact: false, armor: null, chargeArmor: null, pushback: 0, stale: false, kb: 0, ...mv[k] };
    if (s.blockStun === undefined && s.damage !== undefined) s.blockStun = Math.round((0.1 + 0.012 * s.damage) * 1000) / 1000;
  }
}
for (const st of Object.values(FIGHTERS)) { for (const k in st.moves) { fillMove(k, st.moves[k]); fillSubs(st.moves[k]); } st.bars = fightBars(st); }
