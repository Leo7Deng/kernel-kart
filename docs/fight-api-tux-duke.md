# Fight: Tux and Duke's moves and evades, the sim's API for the drawer

What `js/fight.js` + `js/fight-kits.js` give the drawer for the rebuilt Tux and Duke (spec: `fight-rebuild-spec.md`,
with its AMENDMENT: no shield, a fourth button that's each fighter's own evade). Everything is plain data on `F.f[i]`,
`F.objs` and `F.events`, so the online snapshots carry it as-is. Numbers are the starting tune and live in
`js/fight-chars.js` (`FIGHTERS.tux.moves.move1` ... `.evade`). Times in seconds, distances in world units (a mascot ~46
tall).

## Keys, roster, supers, what's gone
- Four buttons. The sim's input keys stay `light`, `heavy`, `special`, `guard` (`setInput`). For Tux and Duke they fire
  **`move1`, `move2`, `move3`** and **`evade`** (the guard key: one human keeps Space, the other layouts their Guard key,
  the pad its guard button). `js/fight-keys.js` exports `MOVE_OF = { light: 'move1', heavy: 'move2', special: 'move3', guard: 'evade' }`
  and `moveName(id, action)` (the move's name for a key: 'Ice Block' / 'Garbage Collect' for guard; Light / Heavy /
  Special / Guard for the old roster).
- **Gone for Tux and Duke:** the shield (the `block` state, `guardArc`, block stun, chip, the `block` event against
  them), steps (Guard + a direction, the `step` state and event, step attacks), stamina (`f.stam` stays 1, `f.gassed` 0,
  no `gassed` event: draw no stamina bar for them), the flank bonus (no `flank` event, `f.flankT` stays 0). Counter hits
  (`counter`), knockdowns (`down`, `getup`), walls, the buffer, walking and aiming stay.
- `FIGHT_ORDER = ['tux', 'duke']` (the pickable ones); `FIGHT_SOON` = every other racer (greyed "soon"). The eight
  others keep their data and old rules, unused. Online picks and the room's bot pick respect `FIGHT_ORDER`.
- **No supers for Tux and Duke.** No `moves.super`; their `meter` stays 0 whatever the setting (hide the meter for a
  fighter with no `moves.super`). The setting stays for the others, later.
- A fighter is "three-move" when `FIGHTERS[id].kit3` is true.

## Each move's data (`FIGHTERS[id].moves.move1|move2|move3|evade`)
`name`, `do` (its kit), `icon` (for the key display: 'toboggan', 'iceberg', 'fork', 'iceblock'; 'portal', 'stopworld',
'geyser', 'gc'), `blurb` (what it does), `tell` (what gives it away), `answer` (how to beat it), `hold` ('aim' | 'steer' |
null), `startup`, `active`, `recovery` (base numbers), `cooldown` (s after it's over), `damage`, `kb`, `kd`, plus its own
numbers below. The move cards' clips: `FIGHTERS[id].clips.move1|move2|move3|evade` (see the end).

## Fighter fields (new or newly used)
- `f.move`: 'move1' | 'move2' | 'move3' | 'evade' during one, else null.
- `f.state`: 'wind' (the tell / wind-up: a hit now is a counter hit and cancels it), 'strike' (happening), 'recover'
  (after it: open); plus idle/walk/hurt/stagger/down/getup/frozen/ko/win. (No 'block' or 'step' for them.)
- `f.ph`: the move's phase right now ('' outside a move); `f.pht`: seconds in it. Phase names per move below. `f.pose`
  (from `poseOf`) is the pose to draw (see Poses).
- `f.t` / `f.dur`: time in the state / its length.
- `f.cd`: [move1, move2, move3, evade], seconds of cooldown left (0: ready; a cooldown runs once the move's over). The
  key display's timers. Tux's Ice Block uses `f.cd[3]`; Duke's evade has charges instead (`f.cd[3]` stays 0).
- `f.ev`: Duke's Garbage Collect charges (0..2); `f.evT`: seconds until the next comes back (0 when full). Tux: 0.
- `f.gone`: 1 while Duke is between portals (don't draw him; his x, y sit on the portal mark so the camera frames it).
- `f.air`: 1 while Tux is up out of shot in the Iceberg Drop (`f.z` up to 520; his x, y follow the shadow). Draw him
  only when `f.z` is low enough to be on screen, with the camera not following z.
- `f.inv` > 0: untouchable (the ice block, the blink, between portals, up in the air, getting up).
- `f.hit`: the move connected.
- `f.state === 'frozen'`: grey statue (Stop the World), `f.t` / `f.dur` (1.1 s). Hits on a frozen fighter do their
  damage but they don't move until it ends ('thaw' event), then fly with the stored knockback (half) and fall if any hit
  knocked down.

## Tux (Linux)

### move1 Toboggan Torpedo (`do: 'toboggan'`, hold: 'steer')
| phase (`f.ph`) | state | time | pose | what |
|---|---|---|---|---|
| `crouch` | wind | 0.38 | `crouch` | crouches and wiggles, aimed at the foe; turns (eased, up to 2.4 rad/s) to the held direction (or back at the foe); the path shows |
| `slide` | strike | up to 1.2 | `slide` | belly-slides at 365 u/s (x1.3 on an ice patch), steering (eased) up to 1 rad/s the held way; bounces off one wall, the second stops him |
| `skid` | recover | 0.35 | `slide` | hit them (or clinked off ice, or a penguin took it): skids to a stop |
| `belly` | recover | 0.75 | `belly` | missed / stopped: flat on his belly, open |
- Hit: 18.5 damage, kb 250, knocks down. Cooldown 0.8. (2026-10-24: 330 -> 365 u/s, 17 -> 18.5, 235 -> 250, steer 0.65 -> 1.)
- Object `tobline` (from the press to the slide's end): `{ pts: [[x, y], ...], bi: [indices], w, ph: 'aim' | 'go', aw, lt }`
  the predicted path from Tux, a point every ~22 units, curving the way the held direction would steer him if it stays
  held (crouching: the rest of the crouch's turn, then the slide's steering; sliding: updated every step from where he
  is); `bi` the indices of its wall-bounce points, `w` its half-width, `aw` the eased turn speed (rad/s), `lt` its `t`
  when it locked (the slide began). 'aim' while he crouches, 'go' while sliding. Spray and ice trail: from Tux's `x, y, vx, vy` while
  `f.ph === 'slide'`.
- Events: `tell` (move 'move1') at the press, `toboggan` as the slide starts, `bounce` (`x, y, nx, ny`) off the wall,
  `belly` when he ends up flat, `hit` / `down` / `clink` / `peng` as they come.

### move2 Iceberg Drop (`do: 'iceberg'`, hold: 'aim')
| phase | state | time | pose | what |
|---|---|---|---|---|
| `leap` | wind | 0.2 | `leap` | crouch-and-spring, stretched up |
| `up` | strike | 0.2 | `air` | flying up out of shot (`f.z` 0 -> 520), untouchable |
| `high` | strike | 0.54 | (off screen) | out of shot; the shadow grows and follows the held direction |
| `drop` | strike | 0.14 | `flop` | falling belly first onto the shadow (`f.z` 520 -> 0), spread out |
| `land` | recover | 0.35 | `land` | landing squash (hit someone) |
| `dizzy` | recover | 0.95 | `dizzy` | hit nothing (or clinked off ice): dizzy, open |
- The shadow starts on the foe (at most 220 away), moves with the held direction at up to 115 u/s, its velocity
  (`vx, vy`) easing in and out over 0.08 s (bots: toward the foe), during `up` and `high`, sliding along walls, and stops
  (`lock: 1`, `lt` its `t` then) for the `drop`.
- Landing: anyone within `R` 54 of the shadow's centre (to their middle, + half their radius) takes 19, kb 210 outward,
  knocked down. Comes from above: Duke's blink or Tux's ice block are the only ways out besides walking. Cooldown 1.5.
- Object `shadow` `{ x, y, vx, vy, r (grows 12 -> R), R, lock (0 / 1), lt, t, life }`: the growing shadow, darker when locked.
- Object `shock` `{ x, y, r (grows to reach over 0.15 s), reach, t, life 0.3 }`: the landing ring (visual only).
- Object `ice` `{ x, y, r 66, grip, t, life 4 }`: the ice patch (fade in the last 0.6 s). Anyone on it slides;
  Tux's toboggan is faster across it.
- Events: `tell`, `leap` (takes off), `land` (`x, y`, power 1: a soft shake; `hit: true|false`), `ice`, `dizzy`.

### move3 fork() Bomb (`do: 'fork'`)
| phase | state | time | pose | what |
|---|---|---|---|---|
| `summon` | wind | 0.45 | `summon` | flippers up, open (a hit now cancels it) |
| `fork` | strike | 0.06 | `summon` | the three penguins pop out |
| `fork` | recover | 0.3 | `summon` -> '' | |
- One fork alive at a time (can't cast while any of his penguins remain), cooldown 1.5.
- Objects `peng` x3 `{ x, y, vx, vy, r 9, a (facing), ph, pt (time in phase), wait, t, life 5 }`:
  - `ph: 'wait'` (inside Tux, not drawn: its `wait` 0 / 0.14 / 0.28), `'pop'` (0.18 s popping out of Tux), `'waddle'`
    (62 u/s toward the foe, turning 2.6 rad/s: tiny Tux walking, `pt` for the cycle), `'slide'` (within 66 of the foe:
    a belly slide at 225 u/s, straight, 0.5 s: tiny Tux lying, `a` its way).
  - Each hits once: 4.5 damage, kb 65, a 0.45 s stagger (combo into the toboggan).
  - **They shield Tux:** a hit at Tux that passes through one (Duke's smash, a toboggan) pops it instead and Tux takes
    nothing (event `peng`, how 'soak').
  - Popped (event `peng`) by: hitting ('hit'), an ice block ('clink'), shielding Tux ('soak'), a move's area over it
    (the landing, the smash, the eruption, the time-stop ring: 'popped'), a wall ('wall'), running out ('old').
- Events: `tell`, `fork` (`x, y`: the pop-out puff), `peng` (`x, y`, `how`) when one bursts into snow.

### evade: Ice Block (`do: 'iceblock'`, the guard key)
| phase | state | time | pose | what |
|---|---|---|---|---|
| `iceblock` | strike | 0.6 | `iceblock` | frozen into a block of ice the moment it's pressed: untouchable, rooted |
| `crack` | recover | 0.3 | `crack` | left alone, the ice cracks off him: open, can't act |
| `shatter` | recover | 0.1 | `burst` | hit: the block shatters outward, he bursts out (untouchable), no crack |
- Cooldown 2.5 (`f.cd[3]`, from the crack's or the shatter's end). Draw the ice block round him during `iceblock` (thin
  cracks running up it in its last 0.2 s), shards on `crack`, a burst flung at the hitter on `shatter`.
- Hits on it (2026-10-24, the user: "yes add it to the ice block"): anything that clinks off it (fight.js hitF -> the kit's
  `clinked`) shatters it. The hitter, if within `shatter` 50 of Tux edge to edge (a smash or a slide always; a geyser
  or a penguin from afar not), is staggered (`state: 'stagger'`, `stagger` 0.75 s, its move dropped) and pushed back
  `shatterKb` 70 u/s: long enough for his toboggan. A geyser that clinks is spent on it. Duke's answer: don't attack
  into fresh ice; wait for the crack.
- Events: `iceblock` (`x, y`) in, `clink` (`x, y`, `who`: the hitter, `to`: Tux, `move`: what clinked) the hit off it,
  then `shatter` (`x, y`, `who`: Tux, `to`: the hitter, `stag`: true if the shards staggered them); left alone, `crack`
  (`x, y`) out.

## Duke (Java)

### move1 Write Once, Run Anywhere (`do: 'portal'`)
| phase | state | time | pose | what |
|---|---|---|---|---|
| `spin` | wind | 0.22 | `spin` | spins and vanishes (fade him out over it, spin with `f.t`) |
| `gone` | strike | 0.45 | (not drawn, `f.gone`) | the portal mark shimmers behind the foe |
| `out` | strike | 0.1 | `smashup` | pops out of the mark, both arms overhead, lunging up to 30 at them |
| `smash` | strike | 1 frame | `smash` | the two-handed slam (the hit) |
| `smash` | recover | 0.35 | `smash` -> '' | hit |
| `stumble` | recover | 0.65 | `stumble` | missed (or clinked off ice): stumbles out, open |
- Hit: 18 damage, kb 215, knocks down; reach 27 from his edge, 130° in front. Cooldown 1.
- Object `portal` `{ x, y, r 20, a (the way he'll smash: toward the target), ph: 'open' | 'out', t, life }`: the mark
  on the floor during `gone`, the burst during `out`.
- Events: `tell` at the press, `vanish` (`x, y`) as he disappears, `portal` (`x, y`) as the mark opens, `popout`, `smash`
  (`x, y`, `hit: true|false`), `stumble`.

### move2 Stop the World (`do: 'stopworld'`)
| phase | state | time | pose | what |
|---|---|---|---|---|
| `raise` | wind | 0.18 | `snap` | one arm up |
| `snap` | wind | 0.54 | `snap` | snap! the grey ripple spreads out (still a wind-up: hit him now and it breaks) |
| `stop` | strike | 0.05 | `snap` | the ring completes: whoever is inside freezes |
| `stop` | recover | 0.15 (caught) / 0.55 (missed) | `snap` -> '' | |
- Inside means within `R` 105 of Duke's middle (to theirs) when it completes, on the ground, not down, not untouchable
  (an ice block or a blink gets through it). Frozen 1.1 s (time for his portal smash: free 0.2 s after it
  starts, the smash 0.77 s later); hits on them store their knockback (x0.5) till the thaw.
  Cooldown 4.5.
- Object `ring` `{ x, y, r (grows 0 -> R), R, ph: 'grow' | 'done' | 'break', t, life }`: grows during `snap`; 'done'
  for a 0.25 s flash after it completes, 'break' (0.2 s) if Duke was hit out of it. Its centre follows Duke.
- Events: `tell`, `snap` (`x, y`) as the ring starts, `freeze` (`to`: who) caught, `stopmiss`, `ringbreak`, `thaw`.

### move3 Coffee Geyser (`do: 'geyser'`, hold: 'aim')
| phase | state | time | pose | what |
|---|---|---|---|---|
| `throw` | wind | 0.3 (+ up to 0.5 more while held) | `throw` | arm back with the pot; the mark shows and moves with the held direction while the key is held |
| `toss` | strike | 0.1 | `toss` | the pot leaves |
| `toss` | recover | 0.35 | `toss` -> '' | open |
- The mark starts on the foe, kept 60-220 from Duke; held, it moves the held way at up to 150 u/s, its velocity (`vx,
  vy`) easing in and out over 0.08 s (let go, it settles in 0.04 s), sliding along walls.
- The pot flies 0.42 s, lands, brews 0.42 s, then erupts for 0.35 s: anyone within r 34 of it (+ half their radius)
  takes 14.5, kb 200 outward, knocked down (from below). Then a puddle (slippery, r 34, 4 s). One geyser at a time;
  cooldown 1.
- Object `geyser` `{ x, y, r 34, ph: 'aim' | 'fly' | 'brew' | 'erupt', pt (time in phase), px, py, pz (the pot while
  flying), t, life }`. The mark in every phase (darker in 'brew'), the pot in 'fly', bubbling in 'brew', the column +
  steam in 'erupt'. After it a `puddle` `{ x, y, r, t, life }`.
- Events: `tell`, `throw` (`x, y`) the pot leaves, `potland`, `erupt` (`x, y`, power 1: a soft shake), `splash`.

### evade: Garbage Collect (`do: 'gc'`, the guard key)
| phase | state | time | pose | what |
|---|---|---|---|---|
| `blinkout` | strike | 0.06 | `blinkout` | vanishing where he was: untouchable |
| `blinkin` | strike | 0.06 | `blinkin` | appearing 110 away (the held way; none held: away from the foe), untouchable |
| `blinkin` | recover | 0.18 | `blinkin` -> '' | back, open |
- 2 charges (`f.ev`), each back 1.8 s after it's spent, one at a time (`f.evT`); none left, the key does nothing. He
  stops short of walls and of the foe. Draw the charges as two pips by his feet.
- Event `blink` (`x, y`: where he was, `x2, y2`: where he lands) at the press: the drawer can draw the streak at once.

## How the tells are drawn (js/draw-moves.js)
Since 2026-10-23 (the user: "slightly turn down the intensity of these new abilities, its a little too
much/fast/whatever/big right now. also, i dont like the graphics of these like red outlines and stuff"): no outlines and
no player colours on the floor. Each tell is part of the world, a light part over a soft dark part so it reads on pale
ice and dark stone: the toboggan's path a faint snowy band with a row of snow tufts (a soft puff where it bounces); the
iceberg a soft round shadow growing and darkening (its size is the reach), snowflakes drifting in; the portal a small
coffee-and-cream swirl with a glow and a few sparkles; Stop the World a grey water ripple (a light crest over a soft
trough, both gradients), its full reach a very faint tint; the geyser a wet coffee stain that bubbles and cracks the
ground as it brews. The penguins carry a faint tint of Tux's colour under their feet. Shakes only on the iceberg's
landing (0.38) and the eruption (0.3), no knockdown shake for them; the iceberg landing on someone nudges the camera in
2.5 %; Stop the World's grey-out is a soft half desaturation easing in over 0.25 s.
Since 2026-10-24 (the user: "i still want the aiming and feel of the aim to look better, and all animations and looks to
be better"): the toboggan's track is a gentle curve of soft oval prints (drifting while he aims; on the lock they swell
softly once and stay put on the floor), the shadow a soft falloff with snowflakes drifting in ahead of where it's moving
and a soft draw-in when it locks, the geyser's stain a ring of little bubbles round its rim while it's aimed and one soft
ripple when the pot leaves; the moving cues glide between the sim's steps (draw-moves.js `glide`). Every phase has
anticipation and a soft spring settle (`moveAnim`), Tux and Duke have hit reactions (`hitAnim`) and a 0.08 s pose
crossfade (`poseFade`, draw-fight.js draws the old pose fading out under the new one).

Since 2026-10-24 (the user: "the animations and effects just look like simple 2d graphics"): the set pieces are 3D, from
js/art/prop3d.js (a glacier Tux rides down, sized from `move2.R`; the ice block; the ice patch, `ice.r`; fork()'s snow
mounds; Duke's portal ring, `portal.r`; the coffee pot, geyser column and puddle, `geyser.r` / `puddle.r`; 3D bits for
snow, ice, steam, coffee drops, Stop the World's hanging crystals, Garbage Collect's cubes); the miss recoveries
(`belly`, `dizzy`, `crack`, `stumble`) draw a calm settle, not a stun (the sim's phases and timings unchanged).

## Poses (`f.pose`, one 3D pose per keyframe)
- Tux: `ride` (2026-10-24, drawn only: riding the glacier down, a surfer's stance), `burst` (2026-10-24: out of the shattered ice, flippers flung up and out), `crouch` (toboggan wind-up: low, flippers swept back along his sides; the drawer wiggles it), `slide` (exists), `belly` (lying flat,
  still, open: may share `slide`'s mesh), `leap` (stretched up, flippers up), `air` (exists), `flop` (exists, spread),
  `land` (squashed), `dizzy` (wobbly, flippers out), `summon` (both flippers raised high), `iceblock` (hunched, flippers
  tucked in: inside the ice), `crack` (shaking it off, flippers out), plus `stand`, `hurt`, `down`, `getup`, the walk.
- Duke: `spin` (arms out, spinning), `smashup` (both arms straight overhead), `smash` (both arms slammed down, bent
  forward), `stumble` (off balance, arms flailing), `snap` (one arm raised, fingers up), `throw` (arm back holding the
  pot), `toss` (exists), `blinkout` (pulled in small, arms tight, leaning the way he goes), `blinkin` (landing: arms out
  for balance), plus the shared ones.
- The penguins: Tux's sheet small (`walk0..3` waddling, `slide` sliding).
- Not produced any more for Tux and Duke: `block`, `step`, `wind`, `strike`, `butt`, `grab`.

## Events (all carry `who`, `x`, `y`, `power`, `move`)
New: `tell`, `toboggan`, `bounce`, `belly`, `leap`, `land`, `ice`, `dizzy`, `fork`, `peng`, `vanish`, `portal`,
`popout`, `smash`, `stumble`, `snap`, `freeze`, `stopmiss`, `ringbreak`, `thaw`, `throw`, `potland`, `erupt`,
`iceblock`, `clink`, `crack`, `blink`.
Kept: `round`, `sudden`, `win`, `hit`, `counter`, `trade`, `down`, `getup`, `ko`, `wall`, `splash`. Not for Tux and
Duke any more: `block`, `step`, `gassed`, `flank`, `charge`, `super`, `pop` (the old clones), the old cup.

## The move cards' clips
`FIGHTERS[id].clips.move1|move2|move3|evade` are ready clips in fight-clips.js's format: `{ x: [x0, x1], len, cam: { x,
y?, w }, a: [[from, to, input], ...], b: [...]? }` (fighter 0 shows it, fighter 1 is the other). `test/fight.test.mjs`
plays `script(id, k)` for k in `move1`, `move2`, `move3`, `evade` (falling back to `FIGHTERS[id].clips[k]` when
`script` returns nothing) and checks each lands: Tux's move1 a `hit` by fighter 0, move2 a `land` with `hit: true`,
move3 a `peng` with how 'hit', evade a `clink` on fighter 0 and no `hit` on them (the clip: Duke's smash shatters the
ice, then the toboggan); Duke's move1 a `smash` with `hit: true`,
move2 a `freeze`, move3 an `erupt` and a `hit`, evade a `blink` by fighter 0 and no `hit` on them. (No guard or step
clips any more.)
