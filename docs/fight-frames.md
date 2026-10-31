# Fight mode: frame data

Every fighter's moves as the sim (`js/fight.js`) runs them, from the kits in `js/kits/<id>.js` (their `phases`, `tell`, `answer`). The tables below are generated: after changing a move, run `node test/fight-frames.mjs` and paste its output below this introduction (shorten the text in the kits, not here). The kit API is in `js/kits/index.js`.

**Every fighter**: three moves on the light, heavy and special keys (`move1`..`move3`) and an evade on the guard key; no jab, shield, steps, stamina, flank bonus or super. **Wind** is the tell: a hit then is a **counter hit** (×1.4 damage, longer stagger) and cancels it. **Strike** is the move; **recover** is after it, open. Each move's cooldown runs once it's over (Duke's evade has two charges instead). Presses buffer 8 frames. Two contact moves active in reach of each other both land (a **trade**, ×0.7 knockback). The same move within your last 5 hits does 10 % less each time (at most half). Knockdown: down 24 frames, then 9 getting up, untouchable; hits on someone down do half (at most 2 a knockdown); any key after 7 frames rolls up early. Hitstun 0.22 s + knockback / 1200, × (1 − 0.1 per hit already in the combo), at least × 0.5. Knocked into a wall fast enough: a bounce, a little more damage, down. Sudden death after the clock: hits ×1.5 rising to ×3 over 20 s. **Poisoned** (Pyth's venom, Cpp's sludge): slower walk, no evade till it wears off; no damage by itself.

### Tux (108 health, walks 138 u/s)

**Frozen Fish** (move1, the light key): 7 damage, kb 130, a 0.45 s stagger; cooldown 0.24 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| fishout | wind | 0.12 s (8 f) | fishback | the fish whipped out from behind his back |
| slap | strike | 0.08 s (5 f) | fishslap | the slap, a small step in (70 u/s): 7, kb 130, a 0.45 s stagger, reach 30 past his edge, 140°; armoured, frozen 0.8 s |
| slapped | recover | 0.18 s (11 f) | fishslap | hit: the fish back |
| fishmiss | recover | 0.3 s (18 f) | fishslap | whiffed: the fish flops about, open, the row gone |
| walup | wind | 0.22 s (14 f) | walup | the third in a row: the fish raised overhead in both flippers |
| wallop | strike | 0.1 s (6 f) | wallop | the wallop: 13, kb 330, down, reach 34 |
| walloped | recover | 0.3 s (18 f) | wallop | hit: the bent fish back |
| walmiss | recover | 0.5 s (30 f) | wallop | whiffed: open |

Tell: The fish coming out over his shoulder. The wallop: raised high in both flippers, a beat slower. Answer: Keep out of its short reach, above all of the wallop. Whiffing, he flops the fish about: he's open a moment, and the row is gone.

**Belly Slide** (move2, the heavy key): 11 damage, kb 270, knocks down; cooldown 1.54 s after it. Held: the held direction steers it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| flop | wind | 0.2 s (12 f) | crouch | a hop forward onto his belly, pointed the way the press aimed him |
| slide | strike | up to 0.45 | slide | on his belly at 390 u/s (x1.3 on his own frost streak), steering 1 rad/s the held way, off walls 2 times: 11, kb 270, down; armoured, through them |
| skid | recover | 0.3 s (18 f) | slide | hit: skids to a stop |
| belly | recover | 0.55 s (33 f) | belly | missed, or stopped by a wall: flat, open |

Tell: A little hop forward as he flops onto his belly. Answer: Step off his line (he only steers so fast). Missing, he ends up lying on his belly: hit him there.

**Ice Armour** (move3, the special key): 4 damage a quick hit (kb 170), the last undefined (kb undefined); cooldown 3.9 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| armup | wind | 0.32 s (20 f) | armup | the ice growing over him (a hit now: a counter hit, and it's gone) |
| armset | strike | 0.05 s (3 f) | burst | armoured: 2 hits chipped off it, for 3 s |
| armset | recover | 0.15 s (9 f) | burst | then it bursts: within 40 of him, 4 and a 0.6 s stagger |

Tell: Ice growing over him, from his feet up. Hit him then and it's gone. Answer: Don't waste big hits on it: back off out of the burst and wait it out, or chip it off from a distance. It has a long cooldown.

**Snow Dive** (evade, the guard key): cooldown 1.2 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| dive | strike | 0.07 s (5 f) | slide | head first into a puff of snow: untouchable |
| under | strike | 0.23 s (14 f) | (under the snow) | 110 the held way (away from them if nothing's held), untouchable |
| popup | recover | 0.2 s (12 f) | leap | pops out: open |

Tell: A puff of snow, and a little snowy bump running along where he's going. Answer: Be where he pops up: he's open a moment.


### Duke (118 health, walks 228 u/s)

**HotSpot Jab** (move1, the light key): 5 then 7 (kb 40, 90), x(1 + 0.15 x heat) as it heats up (each landed jab +1, at most 3; a statue x0.7); the second jab at full heat boils over: 8 x1.45, kb 300, knocks down; cooldown 0.21 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| ready | wind | 0.06 s (4 f) | guard | fists up |
| jab1 | strike | 0.1 s (6 f) | jab1 | the first jab: reach 22, 110°, where he stands |
| jab2 | strike | 0.1 s (6 f) | jab2 | the second (at full heat, 3: it boils over and knocks down) |
| jabend | recover | 0.14 s (9 f) | jab2 | one landed |
| jabmiss | recover | 0.48 s (29 f) | jab2 | both whiffed: open, and the heat is gone |

Tell: Fists up for a blink of an eye: too quick to see coming up close. How hot he is shows on his fists: glowing warmer, then steaming like a fresh coffee. Answer: Keep out of his short reach (he doesn't step in: the blink is how he gets close). Back off a steaming Duke: make him whiff and he cools right down.

**Hot Java** (move2, the heavy key): a 1 tap that sticks the pot on them; 1.5 s later it boils over: 18, kb 280, knocks down (on someone down: x0.6, no knockdown); a hit on Duke first passes it back onto him; cooldown 2.2 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| potup | wind | 0.12 s (8 f) | potup | the steaming pot up over his shoulder |
| slap | strike | 0.08 s (5 f) | slap | slapped on, a small step in (140 u/s): reach 22 from his edge, 110°; it sticks on them (a 1 tap) |
| slapped | recover | 0.2 s (12 f) | slap | stuck: it rides on them 1.5 s (whistling the last 0.4), then boils over: 18, kb 280, knocks down; hit Duke first and it hops back onto him |
| potmiss | recover | 0.5 s (30 f) | slap | missed: the pot dropped, open |

Tell: He lifts a steaming coffee pot over his shoulder before he slaps it on: only from right next to you. Once it's on you it rattles, puffs steam faster and faster and whistles just before it blows. Answer: Keep out of his short reach while the pot is up (it misses a moving target easily, he's open after). Stuck with it: chase him and hit him to pass it back before it boils, or evade as it whistles.

**Stop the World** (move3, the special key): freezes 1.3 s (hits on them: knockback x0.5, stored till the thaw); cooldown 5.4 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| raise | wind | 0.15 s (9 f) | snapup | the arm on its way up for the snap, a pocket watch swinging up into his hand |
| snap | wind | 0.4 s (24 f) | snap | snap! the grey ripple grows to 105 (still a wind-up: hit him and it breaks) |
| stop | strike | 0.05 s (3 f) | snap | inside: frozen 1.3 s (hits store their knockback x0.5 till the thaw) |
| stop | recover | 0.15 / 0.4 missed | snap | cooldown 5.4 s |

Tell: A pocket watch swings up into his raised hand, then a snap, and a grey ripple spreads out from him. Answer: Get out of the ripple before it completes, or hit him while he snaps. Freezing nobody leaves him open, and it comes back slowly.

**Garbage Collect** (evade, the guard key): 2 charges, each back 1.08 s after it's spent.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| blinkout | strike | 0.06 s (4 f) | blinkout | vanishing: untouchable |
| blinkin | strike | 0.06 s (4 f) | blinkin | there (110 the held way): untouchable |
| blinkin | recover | 0.18 s (11 f) | blinkin | back: open (2 charges, each back 1.08 s after it's spent) |

Tell: His charges show by his feet: none left, he can't get away. Answer: Bait both charges, then commit.


### Gopher (107 health, walks 180 u/s)

**Dig & Pop** (move1, the light key): 15 damage, kb 300, knocks down; cooldown 0.45 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| scoop | wind | 0.16 s (10 f) | scoop | a crouch, paws scrabbling at the ground |
| rumble | wind | 0.16 s (10 f) | (underground) | out of a Burrow instead: the mound stops and rumbles, untouchable |
| pop | strike | 0.1 s (6 f) | uppercut | bursts up, 6 ahead: reach 36, 150° in front, launches (6 more on someone stuck in a hole) |
| uppercut | recover | 0.3 s (18 f) | uppercut | hit |
| whiff | recover | 0.45 s (27 f) | dazed | missed: standing in his hole, open |

Tell: He drops into a crouch, paws scrabbling, earth flying back off them. It comes out almost at once. Out of a Burrow: the mound stops and rumbles. Answer: Keep out of his reach: it only hits in front of him, a little way out (back off a mound that stops close). Missing, he's left standing in his hole, open.

**Goroutine Rush** (move2, the heavy key): 7.5 damage, kb 150, a 0.45 s stagger; cooldown 0.94 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| whistle | wind | 0.42 s (26 f) | whistle | 4 goroutines spread into lanes 62 apart |
| send | strike | 0.06 s (4 f) | send | they run 300 u/s, up to 440 |
| send | recover | 0.3 s (18 f) | send |  |

Tell: They spread out into their lanes first, a faint dirt track ahead of each. Answer: Step into a gap between two lanes (one runs right at you), or evade. He's open while they spread.

**Deadlock** (move3, the special key): 5 damage, kb 0, a 0.1 s stagger; cooldown 1.68 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| rear | wind | 0.4 s (24 f) | rear | paws up, aimed (3.4 rad/s, settled the last 0.1 s) |
| slam | strike | up to 0.67 | slam | the crack races 450 u/s, up to 300: who it reaches sinks in, stuck 1.2 s |
| slam | recover | 0.12 s (8 f) | slam | it caught them: up |
| pant | recover | 0.3 s (18 f) | pant | it ran out: panting, open |

Tell: He rears up, paws high, then slams them down: a crack of splitting earth comes racing along the floor in a straight line. Answer: Step off its line (or evade over it) before it reaches you. If it runs out he's left panting, open.

**Burrow** (evade, the guard key): cooldown 1.02 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| burrow | strike | 0.75 s (45 f) | dig | underground, up to 174 (232 u/s), steered 3.2 rad/s: untouchable (Dig & Pop now: up into the uppercut right there) |
| popup | recover | 0.3 s (18 f) | pop | pops up: open |

Tell: A mound runs along the floor, turning where he steers it, loose earth left behind it; it stops and rumbles if he's about to burst up. Answer: Watch where the mound goes and back off one that comes at you: it can only run so far, and he pops up slowly at the end, shaking the dirt off: hit him then. Don't let it stop right next to you.


### Ferris (128 health, walks 147 u/s)

**Borrow Claw** (move1, the light key): 19 damage, kb 170, knocks down; cooldown 0.45 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| clawback | wind | 0.36 s (22 f) | clawback | the line turns 0.9 rad/s, locked the last 0.22 |
| shoot | strike | 0.14 s (9 f) | clawshot | out to 140, 30 wide |
| reel | strike | 0.18 s (11 f) | clawshot | caught: reeled in |
| hold | strike | 0.5 s (30 f) | clawhold | borrowed: held, turning the held way |
| heave | strike | 0.12 s (8 f) | clawhold | unsafe pressed while he holds them: heaved up |
| clawspin | strike | 0.34 s (21 f) | whirl | spun once round in his claw, slammed out (23, down; unsafe's self and cooldown) |
| slung | recover | unsafe's recovery | whirl |  |
| fling | recover | 0.32 s (20 f) | fling | not pressed: flung, down a short way off (19) |
| clamp | recover | 0.65 s (39 f) | clamp | missed: open |

Tell: The claw opens wide and a scuffed track shows on the floor where it'll go. Answer: Step out of the line (it stops turning just before it shoots), or evade. Locked, walking won't save you: evade it. Missing, the claw clamps shut on nothing: he's open. Caught, there's no way out: it's the claw you have to beat.

**unsafe { }** (move2, the heavy key): 21 damage, kb 310, knocks down; cooldown 0.99 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| brace | wind | 0.1 s (6 f) | brace | twisted back, claws cocked |
| burst | wind | 0.1 s (6 f) | shell | out of a Shell Tuck instead: the shell stops dead and judders, open |
| spin | strike | 0.24 s (15 f) | whirl | one spin, reach 36 all round: launches; costs him 2 |
| spun | recover | 0.26 s (16 f) | whirl | hit |
| spent | recover | 0.45 s (27 f) | dizzy | missed: spun past, settling, open |

Tell: He twists back for an instant, claws cocked to one side. It comes out almost at once. Answer: Keep out of his reach (it hits all round him, but not far). Missing, he spins past and has to settle: hit him then.

**Ownership Lock** (move3, the special key): undefined damage, kb undefined; cooldown 1.8 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| decree | wind | 0.28 s (17 f) | decree | claws up, a clack (hit him: no ring) |
| cast | strike | 0.05 s (3 f) | decree |  |
| cast | recover | 0.3 s (18 f) | decree |  |
| (the ring) |  | 0.7 s (42 f) |  | R 58, up to 300 off him: inside, locked 2 s |

Tell: The coil swinging round his raised claw, a shadow on the floor under you, then the coil landing and paying out into a ring round you. Answer: Walk out before it closes. Locked, you walk slowly (not at all while his claw comes) but can still evade (and a move you were winding up is gone): keep your evade for his claw.

**Shell Tuck** (evade, the guard key): cooldown 1.02 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| tuck | strike | 0.38 s (23 f) | shell | rolls 120 the held way: untouchable (unsafe now: out of the shell into the spin right there) |
| popout | recover | 0.18 s (11 f) | popout | pops out: open |

Tell: A rolling shell; it stops dead and judders if he's about to burst out. Answer: Meet him where he pops out: he's open for a moment. Back off a shell that stops close to you.


### Pyth (110 health, walks 188 u/s)

**Indentation Whip** (move1, the light key): 11.5 damage, kb 300, knocks down; cooldown 0.5 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| pull | wind | 0.18 s (11 f) | pull | twists away, the tail coiled back (nothing on the floor) |
| whip | strike | 0.16 s (10 f) | whip | the tail swung 240° round from behind him, out to 94 from his middle (the outer 26: the sweet spot, 14, kb 360) |
| recoil | recover | 0.3 s (18 f) | whip | hit: the tail comes back |
| unwind | recover | 0.55 s (33 f) | whip | missed: carried round, open |

Tell: For a blink his body twists away and the tail coils back behind him. Answer: Stay outside the tail's reach. Missing, the swing carries him right round and he's open while he unwinds.

**Coil** (move2, the heavy key): 11.6 damage, kb 240, knocks down; cooldown 1.05 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| coilback | wind | 0.34 s (21 f) | coil | drawn back low into an S, aimed as he pressed (nothing on the floor) |
| lunge | strike | 0.24 s (15 f) | lunge | the spring: his head out 104 past his edge in 0.17 s (a wall stops it; sliding 60 u/s), 10 either side |
| wrap | strike | 1.19 s (72 f) | wrap | caught (a 2 bite): dragged in over 0.24 s, squeezed 3 x 1.2 |
| toss | recover | 0.32 s (20 f) | toss | tossed the held way: 6, knocks down, poisoned 2.6 s (walking x0.6, no evade) |
| sprawl | recover | 0.5 s (30 f) | sprawl | missed: stretched out, open |

Tell: He draws back low into a tight S, shaking like a spring. Answer: Step off his line or out of its long reach, or evade. A miss leaves him stretched out, open.

**Apple** (move3, the special key): undefined damage, kb undefined; cooldown 10.8 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| call | wind | 0.22 s (14 f) | cast | looks up, tongue out |
| call | strike | 0.06 s (4 f) | cast | an apple drops onto a random spot of open floor (0.5 s to land, there for 6 s; one at a time): his to eat (+10), anyone else's to squash |
| called | recover | 0.24 s (15 f) | cast | back down |

Tell: He looks up, and a shadow grows where it'll land. Answer: Squash it first, or keep him too busy to reach it.

**Slither** (evade, the guard key): cooldown 0.9 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| slither | strike | 0.22 s (14 f) | slither | 140 the held way (none: sideways round them), untouchable |
| coilup | recover | 0.2 s (12 f) | coil | coiling back up: open |

Tell: None: it's quick. Its cooldown shows on his key. Answer: He's open for a moment as he coils back up: bait it, then commit.


### Octo (120 health, walks 158 u/s)

**git blame** (move1, the light key): 10.5 damage, kb 0; cooldown 0.33 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| coil | wind | 0.36 s (22 f) | coil | the tentacle coils back; the damp track runs out on them (turning 3.2 rad/s), settled for the last 0.07 s |
| shoot | strike | up to 0.22 | shoot | the tentacle out 165 at 760 u/s, 6 either side (a wall stops it) |
| blamed | recover | 0.3 s (18 f) | shoot | landed: 10.5, a 0.4 s stagger, knocked back out to 150 off him |
| droop | recover | 0.45 s (27 f) | droop | missed: the tentacle flops back, open |

Tell: The tentacle coils back and a damp track of sucker marks runs out along the floor, following you; when it darkens it has settled, and the tentacle comes a moment later. Answer: Step off the track once it darkens, or evade it. A miss leaves him open while the tentacle flops back.

**Force Push** (move2, the heavy key): 4 damage, kb 470, knocks down; cooldown 0.77 s after it. Held: charges it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| rise | wind | 0.14 (+ up to 0.6 held) | rise | he bobs up, the tentacles flick up round him; held, they rise higher and gather |
| push | strike | 0.06 s (4 f) | slam | the slam: within 100 (gathered: up to 134), 4 (up to x1.5), blasted off their feet (kb 470, up to x1.5; x0.75 at the edge) |
| push | recover | 0.3 s (18 f) | slam | hit: the tentacles gather back |
| gather | recover | 0.45 s (27 f) | slam | missed: they take longer, open |

Tell: He bobs up and his tentacles flick up round him, their tips' shadows on the floor where they'll land; held, they rise high and tremble as they gather. Answer: Don't rush in while it's ready, back off while he gathers, and keep off the walls near him. Missing, he's open while his tentacles come back.

**Fork** (move3, the special key): 0 damage, kb 0; cooldown 2.1 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| fork | wind | 0.35 s (21 f) | fork | splits: the ink blot shows where the clone pops up |
| forked | strike | 0.05 s (3 f) | fork | the clone pops up 100 from them |
| forked | recover | 0.25 s (15 f) | fork | (the clone: 3 s or his next git blame, copied from its angle: 9, knocked away from him; hit it and it pops) |

Tell: A soft ink blot marks where the clone pops up, a branch of ink running out to it; then a second damp track runs out from the clone when he blames. Answer: Step off both tracks, or hit the clone: it pops. It lasts 3 s or one blame.

**Ink Jet** (evade, the guard key): cooldown 1.08 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| jet | strike | 0.2 s (12 f) | jet | 130 the held way (none: away from them), untouchable; an ink puddle (r 32, 3.5 s) left behind |
| land | recover | 0.18 s (11 f) | ink | landing: open |

Tell: None: it's quick. Its cooldown shows on his key. Answer: Don't chase him through the ink; he's open for a moment as he lands.


### Docky (120 health, walks 135 u/s)

**Tail Slap** (move1, the light key): 18 damage, kb 420, knocks down; cooldown 0.6 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| coil | wind | 0.17 s (11 f) | coil | twisted the other way, his tail cocked back high, lurching in at 110 u/s |
| slap | strike | 0.16 s (10 f) | slap | the spin: his tail round once, hitting anyone within 50 of his edge; off its tip (past 12): 18, kb 420, down 0.3 s longer (into a wall or a container: +9, 0.35 s more); closer: 10, staggered |
| follow | recover | 0.26 s (16 f) | slap | hit: a short settle |
| unwind | recover | 0.38 s (23 f) | slap | missed: unwinding, open |

Tell: He twists the other way and his tail cocks back high behind him, water dripping off the flukes, then the whole whale spins. Answer: Keep out of the tail's reach (the spray shows it), or hug him: right up close it only staggers. Missing, he's left unwinding and open.

**Tidal Wave** (move2, the heavy key): 4 damage, kb 110, a 0.9 s stagger; cooldown 1.65 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| swell | wind | 0.42 s (26 f) | swell | rears up; the water swells on the floor in front of him |
| surf | strike | up to 0.92 | ram | the slam, then he rides it (240 u/s, 100 wide): catches whoever it reaches (4), carries them |
| land | recover | 0.22 s (14 f) | surge | caught someone: where it breaks they're dropped staggered in front of him (2, 0.5 s), or slammed down on a wall (6) |
| wipe | recover | 0.48 s (29 f) | surge | caught nobody: wipes out where it breaks, open |

Tell: He rears up, flippers high, and the water swells up on the floor in front of him. Answer: Get out of its way sideways (it rolls straight on), or evade through it: it's thin. Missed, he wipes out where it breaks, open.

**Compose Up** (move3, the special key): 6 damage, kb 200, a 0.4 s stagger; cooldown 2.22 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| stack | wind | 0.4 s (24 f) | stack | the tower on his back; 3 cracks in the floor behind them, following them |
| build | strike | 0.1 s (6 f) | surge | the wall rises out of the floor in 0.22 s (3 containers, 30 square, two high); rising under someone: popped toward him (6) |
| build | recover | 0.3 s (18 f) | surge |  |
| (the wall) |  | 4.2 s (252 f) |  | solid; sinks in 0.4 s |

Tell: The containers pile up into a tower on his back, and the floor cracks behind you, following you. Answer: Don't back into it as it rises (it pops you back to him). Walk round its ends (it's short), or wait it out: it sinks after a few seconds. It's no hit: he's open while he builds.

**Swim** (evade, the guard key): cooldown 1.08 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| swim | strike | 0.46 s (28 f) | (under the water) | swims 175 the held way (else away), fast: untouchable, not there to bump |
| surface | recover | 0.24 s (15 f) | breach | surfaces with a small splash: open |

Tell: A splash, then a ripple line and a trail of bubbles racing along the floor where he swims. Answer: Follow the ripples and punish him as he surfaces: he's open then, and nothing comes out of it.


### Swifty (108 health, walks 218 u/s)

**do / try / catch** (move1, the light key): 8.5 damage, kb 230, a 0.42 s stagger; cooldown 0.33 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| crouch | wind | 0.12 s (8 f) | flick | a quick crouch, beak open (no floor tell) |
| dart | strike | 0.18 s (11 f) | swoop | the dart: 105 straight on; bugs within 30 swallowed (+1.5 each); within 24 of her edge (120°): 8.5, kb 230, and she flips back off them (300 u/s) |
| tuck | strike | 0.14 s (9 f) | hover | out of a Wing Hop instead: a tuck in the air (no hits yet) |
| swoop | strike | 0.15999999999999998 s (10 f) | swoop | the dart down at them: 70 forward, hitting within 22 |
| flip | strike | 0.18 s (11 f) | glide | hit: flipping back off them, out of reach (300 u/s) |
| alight | recover | 0.3 s (18 f) | perch |  |
| skid | recover | 0.55 s (33 f) | perch | missed: overshoots and skids, open |

Tell: A quick crouch, beak open; then she's darting at you in a straight line. Out of a Wing Hop: she tucks in the air and swoops down. Answer: Keep out of her dash (it only goes straight), and don't wait where her hop comes down. Missing, she overshoots and skids: punish that.

**Closure** (move2, the heavy key): 6 damage, kb 150, a 0.4 s stagger; cooldown 1.26 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| cock | wind | 0.3 s (18 f) | cock | the wing back; the loop shows as a trail of feathers |
| fling | strike | 0.06 s (4 f) | fling | the feather goes |
| fling | recover | 0.4 s (24 f) | fling |  |
| (the feather) |  | 1.15 s (69 f) |  | out (120-270), round (110) and home: a hit each way |

Tell: A faint trail of little feathers shows the whole loop it will fly. Answer: Read the loop and stand clear of both legs: it can't turn. A wall or a crate stops it.

**Gust** (move3, the special key): 5 damage, kb 140, a 0.55 s stagger; cooldown 2.16 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| flap | wind | 0.5 s (30 f) | flap | wings up; leaves and dust skitter in the cone (175, 70°) |
| gust | strike | 0.32 s (20 f) | gust | the blow: kb 140, pushed 900 u/s² in it; anyone else in it held back 200 u/s, Cpp's flies blown along |
| gust | recover | 0.48 s (29 f) | gust | landing: open |

Tell: Wings up, and leaves and dust skitter over the floor in the cone in front of her. Answer: Get out of the cone: to her side, or beyond its reach. Or evade. Don't walk into it while it blows. She's open as she lands.

**Wing Hop** (evade, the guard key): cooldown 1.32 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| hop | strike | 0.32 s (20 f) | glide | 160 the held way (else away), up to 26: untouchable (do / try / catch now: the swoop down out of the air) |
| perch | recover | 0.42 s (26 f) | perch | the landing: open |

Tell: She takes off: a long hop, then a long landing (or a tuck in the air, and she swoops down at you). Answer: Follow her and punish the landing; don't wait right under where she comes down.


### Cpp (116 health, walks 173 u/s)

**Dangling Pointer** (move1, the light key): 2 damage, kb 0; cooldown 0.36 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| flick | wind | 0.15 s (9 f) | wind | his paw back, a fly on it |
| flung | strike | 0.05 s (3 f) | strike | the fly: 440 u/s up to 210; on them: 2, then 0.15/s for 4.5 s; missed: a sentry over his sludge (within 120) for 9 s off it, darting within 38; at most 5 flies |
| flung | recover | 0.22 s (14 f) | strike |  |

Tell: He draws his paw back with a fly on it, then it zips out in a straight line. Answer: Step off its line. Your evade (or a fast dash) swats half the flies on you off, and keep clear of the sentries hovering over his sludge.

**Use After Free** (move2, the heavy key): 3.5 damage, kb 70, a 0.2 s stagger; cooldown 1.38 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| call | wind | 0.42 s (26 f) | rear | reared up, whistling: his flies lift off |
| sic | strike | 0.08 s (5 f) | chomp | they dive (620 u/s): 3.5 a bite (+0.7 a fly for each other one in the call), 2+ in one call stagger 0.6 s |
| called | recover | 0.3 s (18 f) | chomp |  |

Tell: He rears up and whistles, and his flies lift off (the ones on you first), gathering over you. Answer: Evade as they lift off: it swats half the ones on you away and the rest dive into nothing. Don't carry flies round him; he's open after the call.

**Memory Leak** (move3, the special key): 0 damage, kb 0; cooldown 1.92 s after it. Held: the held direction steers it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| shudder | wind | 0.12 s (8 f) | wind | shudders, a drip |
| leak | strike | 0.95 s (57 f) | scurry | 320 u/s, steered 2.6 rad/s; sludge r 24 every 12, lasting 12 s, 2 trails (poisoned: x0.62 walking, no evade, 0.8 s after); a fly hatches every 8 s |
| leakend | recover | 0.26 s (16 f) | pant |  |

Tell: The trail of grey-green sludge itself, and the flies hovering over it. Answer: Walk round it and keep off it: his flies hatch and wait there. Rush him before the swarm builds. He can be hit while he scurries.

**Play Dead** (evade, the guard key): cooldown 1.32 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| dead | strike | 0.45 s (27 f) | dead | on his back: untouchable, rooted; the stink r 52 (x0.5 walking) for 2.4 s |
| scramble | recover | 0.2 s (12 f) | wind | flips up in a splash: a puddle r 26 (9 s, 2 at most); open |

Tell: A rat on his back in a green-grey stink cloud. Answer: Keep out of the stink and the splash; meet him as he scrambles up: he's open for a moment.


### Bugdroid (130 health, walks 147 u/s)

**Battery Beam** (move1, the light key): 11 damage, kb 180, a 0.45 s stagger; cooldown 0.3 s after it. Held: aims it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| charge | wind | 0.35 (+ up to 0.7 held) | charge | antennae glowing; the line turns 1 rad/s the held way |
| lock | strike | 0.12 s (8 f) | charge | the line settles |
| beam | strike | 0.2 s (12 f) | beam | out to 330, 30 wide: x1-1.6 damage by charge, down from 0.7 |
| cool | recover | 0.28 s (17 f) | beam |  |

Tell: His antennae glow and a faint line of light motes runs along the floor. It settles for a moment just before it fires. Answer: Step off the line (it follows slowly, and settles before it fires). A well charged one knocks you down. He has two battery cells.

**Background Service** (move2, the heavy key): 11 damage, kb 40, a 0.9 s stagger; cooldown 1.76 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| flick | wind | 0.2 s (12 f) | twist | a flick of the wrist, the tile in his hand |
| flung | strike | 0.25 s (15 f) | plugout | the tile slides out to where they stand (45-180 off) |
| flung | recover | 0.22 s (14 f) | plugout |  |
| (the service) |  | 7.3 s (438 f) |  | arms 0.3 s, then waits 7 s: stepped on (within 12), 11 and locked up 0.9 s; a battery cell back; 2 at a time |

Tell: The tile sliding out along the floor, its light blinking faster as it arms. Then only a faint blink. Answer: Step off it before it arms, then walk round it (they last a few seconds). Shocked, you're stuck in his beam's line.

**Sideload** (move3, the special key): undefined damage, kb undefined; cooldown 2.7 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| plug | wind | 0.36 s (22 f) | plug | crouched, plugging the cube in |
| plugged | strike | 0.06 s (4 f) | plug | the cube 26 ahead |
| plugged | recover | 0.3 s (18 f) | plug |  |
| (the cube) |  | 3.7 s (222 f) |  | boots 0.5 s, then a pellet every 0.8 s at 195 u/s; walk into it to kick it over |

Tell: The cube booting (its light filling up), then turning to face you before each pellet. Answer: Sidestep the pellets or keep a pillar between you. Walk up to it and it zaps you away, but then it needs a moment: walk into it again and kick it over.

**Power Surge** (evade, the guard key): cooldown 1.68 s after it.

| Phase | State | Time | Pose | What |
|---|---|---|---|---|
| gather | strike | 0.07 s (5 f) | emp | rooted, sparks gathering (not yet safe) |
| surge | strike | 0.53 s (32 f) | emp | lightning round him: a hit soaked; its thrower within 70 shocked (5, locked up 0.6 s), from further it fizzles |
| surged | recover | 0.15 s (9 f) | emp | soaked one: back quickly |
| drained | recover | 0.28 s (17 f) | reboot | nothing came: drained, rooted, open |

Tell: Sparks gathering round him for a blink before the lightning's live: he can't move while it's up. Answer: Don't swing into the lightning: wait it out (a shot from afar just fizzles on it). Drained afterwards, he's open: hit him then.

