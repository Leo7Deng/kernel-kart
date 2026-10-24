# Fight mode: frame data

Every fighter's moves as the sim (`js/fight.js`) runs them, from the per-move data in `js/fight-chars.js` and each kit's `phases` in `js/fight-kits.js`. Regenerate the tables with `node test/fight-frames.mjs` after changing a move (paste its output below this introduction). The drawer's side of the same (phases, objects, events, poses): `docs/fight-api-tux-duke.md`.

**Tux and Duke** (the only pickable fighters since 2026-10-23): three big moves on the light, heavy and special keys and their own evade on the guard key. No jab, no shield, no steps, no stamina, no flank bonus, no super. A move's **wind** is its tell: a hit then is a **counter hit** (×1.4 damage, a longer stagger) and cancels it. **Strike** is the move happening; **recover** is after it, open. Each move has a cooldown that runs once it's over (Duke's evade has two charges instead). A press is buffered 8 frames. A knockdown: down 42 frames, then 21 getting up, untouchable throughout. Hitstun 0.22 s + knockback / 1200, × (1 − 0.1 per hit already in the combo), at least × 0.5. A fighter knocked into a wall fast enough bounces off it, takes a little more and goes down. Sudden death after the clock: every hit ×1.5 rising to ×3 over 20 s.

**The old roster** (unpickable, kept for their rebuild) still runs the old rules: a light chain, a heavy that charges while held, a special and a super; the front shield (70° either side, Ferris 100°; a blocked hit chips 10 % and costs 0.018 × its damage of stamina), stamina (gassed when empty: startups ×1.35, walking ×0.7, a blocked hit staggers you), steps (Guard + a direction), flanks (×1.2 from the side, ×1.4 from behind, at most ×1.8 with a counter), trades, cancels and stale moves. Their table: Startup / Active / Recovery in 60 Hz frames; Block stun how long the blocker is held in their guard; On block block stun minus the attacker's recovery (below about −6 frames the other's quickest move punishes it).

### Tux (116 health, walks 138 u/s)

**Toboggan Torpedo** (move1, the light key): 18.5 damage, kb 250, knocks down; cooldown 0.8 s after it. Held: the held direction steers it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| crouch | wind | 0.38 s (23 f) | crouch | crouches and wiggles, turning; his line shows |
| slide | strike | up to 1.2 | slide | 365 u/s (x1.3 on ice), steers 1 rad/s, 1 wall bounce |
| skid | recover | 0.35 s (21 f) | slide | hit: skids to a stop |
| belly | recover | 0.75 s (45 f) | belly | missed or stopped: flat, open |

Tell: He crouches and wiggles, aimed at you, and a track of soft prints in the snow curves where he'll go. Answer: Get out of the line (walk, or your evade). Missing, he ends flat on his belly, open.

**Iceberg Drop** (move2, the heavy key): 19 damage, kb 210, knocks down; cooldown 1.5 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| leap | wind | 0.2 s (12 f) | leap | springs up; the shadow appears |
| up | strike | 0.2 s (12 f) | air | up out of shot, untouchable |
| high | strike | 0.54 s (32 f) | (off screen) | the shadow grows, moving 115 u/s the held way |
| drop | strike | 0.14 s (8 f) | flop | onto the shadow (it stops) |
| land | recover | 0.35 s (21 f) | land | hit (everyone within R 54) |
| dizzy | recover | 0.95 s (57 f) | dizzy | hit nothing: open |

Tell: His shadow grows and darkens on the floor where he'll land. Answer: Get out of the shadow, or evade as he lands. Hitting nothing leaves him dizzy.

**fork() Bomb** (move3, the special key): 4.5 damage, kb 65, a 0.45 s stagger; cooldown 1.5 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| summon | wind | 0.45 s (27 f) | summon | flippers up: open |
| fork | strike | 0.06 s (4 f) | summon | 3 penguins pop out |
| fork | recover | 0.3 s (18 f) | summon |  |

Tell: Flippers up: he's open while he summons. Answer: Hit or walk round them; an evade lets their slides through. They also shield Tux: a hit at him through one pops it instead.

**Ice Block** (evade, the guard key): cooldown 2.5 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| iceblock | strike | 0.6 s (36 f) | iceblock | in the ice: untouchable, rooted |
| crack | recover | 0.3 s (18 f) | crack | the ice cracks: open |
| shatter | recover | 0.1 s (6 f) | burst | hit: it shatters, the hitter (within 50) staggered 0.75 s |

Tell: He's a block of ice for a moment. Hit it and it shatters back at you, long enough for his toboggan. Answer: Don't attack into the ice: wait for the crack and hit that (an Iceberg Drop aimed at it lands as it cracks).


### Duke (106 health, walks 228 u/s)

**Write Once, Run Anywhere** (move1, the light key): 18 damage, kb 215, knocks down; cooldown 1 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| spin | wind | 0.22 s (13 f) | spin | spins and vanishes |
| gone | strike | 0.45 s (27 f) | (not drawn) | the mark shimmers behind them; untouchable |
| out | strike | 0.1 s (6 f) | smashup | pops out, arms overhead |
| smash | strike | 1 frame | smash | the slam: reach 27, 130° |
| smash | recover | 0.35 s (21 f) | smash | hit |
| stumble | recover | 0.65 s (39 f) | stumble | missed (or off the ice): open |

Tell: A little coffee swirl opens on the floor behind you. Answer: Walk or evade away from the swirl (he comes from behind). Missing, he stumbles out.

**Stop the World** (move2, the heavy key): freezes 1.1 s (hits on them: knockback x0.5, stored till the thaw); cooldown 4.5 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| raise | wind | 0.18 s (11 f) | snap | one arm up |
| snap | wind | 0.54 s (32 f) | snap | the ring grows to 105 (hit him: it breaks) |
| stop | strike | 0.05 s (3 f) | snap | inside: frozen 1.1 s |
| stop | recover | 0.15 / 0.55 missed | snap |  |

Tell: One arm up, a snap, and a grey ripple spreads out from him. Answer: Get out of the ripple before it completes, or hit him during the snap. A long cooldown.

**Coffee Geyser** (move3, the special key): 14.5 damage, kb 200, knocks down; cooldown 1 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| throw | wind | 0.3 (+ up to 0.5 held) | throw | the mark shows; held, it moves |
| toss | strike | 0.1 s (6 f) | toss | the pot leaves |
| toss | recover | 0.35 s (21 f) | toss | open |
| (the pot) |  | 0.42 + 0.42 + 0.35 |  | flies, brews, erupts (r 34), then a puddle |

Tell: A wet coffee stain marks the spot, and it bubbles before it blows. Answer: Walk off the mark, or evade the eruption. He is open while throwing.

**Garbage Collect** (evade, the guard key): 2 charges, each back 1.8 s after it's spent.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| blinkout | strike | 0.06 s (4 f) | blinkout | vanishing: untouchable |
| blinkin | strike | 0.06 s (4 f) | blinkin | there (110 the held way): untouchable |
| blinkin | recover | 0.18 s (11 f) | blinkin | back: open (2 charges, each back 1.8 s after it's spent) |

Tell: His charges show by his feet: none left, he can't get away. Answer: Bait both charges, then commit.


## The old roster (unpickable since 2026-10-23, kept for their rebuild)

### Gopher (104 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Paw Patch | light1 | light | 5 | 3 | 8 | - | 5.2 | 0.08 | - | 10 | +2 (+0.03 s) |
| Paw Patch | light2 | light | 4 | 3 | 8 | - | 5.2 | 0.08 | - | 10 | +2 (+0.03 s) |
| Paw Patch | light3 | light | 6 | 4 | 17 | - | 9.2 | 0.08 | on a counter or flank | 13 | -4 (-0.07 s) |
| select {} Slam | heavy | heavy | 11 | 8 | 22 | light from half charge | 15 | 0.16 | full charge | 17 | -5 (-0.08 s) |
| Dig | special | special | 8 | 45 | 22 | - | 11 | 0.12 | yes | 14 | -8 (-0.13 s) |
| Goroutines | super | super | 17 | 3 | 18 | super | 3.7 | 0 | - | 9 | thrown (gophers) |

### Ferris (118 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Pinch Points | light1 | light | 5 | 3 | 9 | - | 5.8 | 0.08 | - | 10 | +1 (+0.02 s) |
| Pinch Points | light2 | light | 5 | 3 | 9 | - | 5.8 | 0.08 | - | 10 | +1 (+0.02 s) |
| Pinch Points | light3 | light | 7 | 4 | 18 | - | 10.3 | 0.08 | on a counter or flank | 13 | -5 (-0.08 s) |
| unsafe { } | heavy | heavy | 12 | 8 | 23 | light from half charge | 17.5 | 0.16 | full charge | 19 | -4 (-0.07 s) |
| Borrow Checker | special | special | 3 | 33 | 15 | - | 9.2 | 0.12 | - | 13 | a stance: blocks a hit from in front, pinches back |
| Ownership | super | super | 18 | 3 | 18 | super | - | 0 | - | - | no hit (a lock) |

### Pyth (104 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Whitespace Whip | light1 | light | 5 | 4 | 9 | - | 4.8 | 0.08 | - | 9 | +0 (+0.01 s) |
| Whitespace Whip | light2 | light | 5 | 4 | 9 | - | 4.8 | 0.08 | - | 9 | +0 (+0.01 s) |
| Whitespace Whip | light3 | light | 7 | 4 | 18 | - | 8.6 | 0.08 | on a counter or flank | 12 | -6 (-0.10 s) |
| Lambda Lunge | heavy | heavy | 12 | 10 | 25 | light from half charge | 15.5 | 0.16 | full charge | 17 | -8 (-0.13 s) |
| Coil | special | special | 17 | 7 | 33 | - | 14.9 | 0.12 | yes | 17 | a hold: can't be blocked, step out of it |
| import antigravity | super | super | 18 | 3 | 15 | super | - | 0 | - | - | can't be blocked |

### Octo (118 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Commit Combo | light1 | light | 4 | 3 | 7 | - | 5 | 0.05 | - | 10 | +3 (+0.05 s) |
| Commit Combo | light2 | light | 4 | 3 | 7 | - | 5 | 0.05 | - | 10 | +3 (+0.05 s) |
| Commit Combo | light3 | light | 4 | 3 | 7 | - | 5 | 0.05 | - | 10 | +3 (+0.05 s) |
| Commit Combo | light4 | light | 4 | 3 | 7 | - | 5 | 0.05 | - | 10 | +3 (+0.05 s) |
| Commit Combo | light5 | light | 6 | 4 | 18 | - | 10.5 | 0.08 | on a counter or flank | 14 | -4 (-0.07 s) |
| Rebase Slam | heavy | heavy | 12 | 9 | 23 | light from half charge | 16.7 | 0.16 | full charge | 18 | -5 (-0.08 s) |
| Pull Request | special | special | 11 | 10 | 25 | - | 4.6 | 0.12 | - | 9 | thrown (a tentacle) |
| Merge Conflict | super | super | 17 | 63 | 24 | super | 2.5 a hit | 0 | - | - | many hits: a block doesn't stop it |

### Docky (122 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Layer Slaps | light1 | light | 5 | 4 | 10 | - | 5.8 | 0.08 | - | 10 | +0 (+0.00 s) |
| Layer Slaps | light2 | light | 5 | 4 | 10 | - | 5.8 | 0.08 | - | 10 | +0 (+0.00 s) |
| Layer Slaps | light3 | light | 8 | 5 | 19 | - | 9.2 | 0.08 | on a counter or flank | 13 | -7 (-0.11 s) |
| Blowhole | heavy | heavy | 14 | 10 | 24 | light from half charge | 16.1 | 0.16 | full charge | 18 | -6 (-0.11 s) |
| Container | special | special | 16 | 3 | 18 | light | 10.3 | 0.12 | - | 13 | thrown (a container) |
| docker compose | super | super | 18 | 3 | 18 | super | 6.9 | 0 | - | 11 | thrown (containers) |

### Swifty (100 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Talon Taps | light1 | light | 3 | 2 | 6 | - | 4.4 | 0.08 | - | 9 | +3 (+0.05 s) |
| Talon Taps | light2 | light | 3 | 2 | 6 | - | 4.4 | 0.08 | - | 9 | +3 (+0.05 s) |
| Talon Taps | light3 | light | 5 | 4 | 16 | - | 8.3 | 0.08 | on a counter or flank | 12 | -4 (-0.06 s) |
| guard let Kick | heavy | heavy | 9 | 8 | 22 | light from half charge | 14.9 | 0.16 | full charge | 17 | -5 (-0.08 s) |
| Swift Dive | special | special | 6 | 19 | 20 | - | 9 | 0.12 | - | 12 | -8 (-0.13 s) |
| Optional Chaining | super | super | 14 | 18 | 22 | super | 5.8 a hit | 0 | - | - | three dives: a block doesn't stop them |

### Cpp (118 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Byte Bites | light1 | light | 4 | 3 | 8 | - | 5.8 | 0.08 | - | 10 | +2 (+0.04 s) |
| Byte Bites | light2 | light | 4 | 3 | 8 | - | 5.8 | 0.08 | - | 10 | +2 (+0.04 s) |
| Byte Bites | light3 | light | 6 | 4 | 18 | - | 9.2 | 0.08 | on a counter or flank | 13 | -5 (-0.09 s) |
| Segfault Smash | heavy | heavy | 10 | 8 | 25 | light from half charge | 17.8 | 0.16 | full charge | 19 | -6 (-0.11 s) |
| Pointer | special | special | 6 | 4 | 14 | - | - | 0.12 | - | - | no hit |
| Undefined Behavior | super | super | 18 | 3 | 18 | super | - | 0 | - | - | varies |

### Bugdroid (116 health)

| Move | Key | Kind | Startup | Active | Recovery | Armor | Damage | Stamina | Knocks down | Block stun | On block |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Intent Jabs | light1 | light | 5 | 4 | 10 | - | 6 | 0.08 | - | 10 | +1 (+0.01 s) |
| Intent Jabs | light2 | light | 5 | 4 | 10 | - | 6 | 0.08 | - | 10 | +1 (+0.01 s) |
| Intent Jabs | light3 | light | 8 | 5 | 19 | - | 9.8 | 0.08 | on a counter or flank | 13 | -6 (-0.10 s) |
| Fragment Punch | heavy | heavy | 14 | 9 | 24 | light from half charge | 17.8 | 0.16 | full charge | 19 | -5 (-0.09 s) |
| Antenna Zap | special | special | 12 | 8 | 18 | - | 6.3 | 0.12 | - | 11 | -7 (-0.12 s) |
| Boot Loop | super | super | 18 | 3 | 18 | super | 5.8 | 0 | - | 10 | a field: can't be blocked |
