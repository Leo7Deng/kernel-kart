# Kernel Kart: balance

## Balance
Lap time alone is too narrow. Balance means: racers forgive bad driving differently, weight wins and loses shoves in a pack, and items work (catch-up items catch up, leader items don't run away with the race). Judge a change by item value by position, sloppy versus sharp driving, contact and outcome spread (win %, comebacks), with confidence ranges, not average times.

Racers don't need equal numbers; they need a **reason**: every racer in `CHARACTERS` (`js/core.js`) has a `balance` note saying why it's faster or slower where it is, from its stats and traits. `node test/balance.mjs` prints each note next to the numbers and flags a missing one. Nothing is pass/fail: when the numbers contradict a note (or a gap is well outside the ± range), fix the racer or rewrite the note; when stats change, update the note.
- Judge places at `npm run balance -- 640` (±0.12); the default 160 races is ±0.3.
- The plain run has no drifting (bots drift only in a drift-on race), but drift is on by default in the game: check `--drift` too (it favours top-speed cars).
- Any stat change reshuffles every race, so an unchanged racer moves about ±0.1 run to run: see a shift on a second run (other seeds, or drift on/off) before acting on it.

Every measuring script (`balance`, `items`, `frontrun`, `boxes`, `drift-bots`, Fight's `fight-odds`, `fight-roundrobin`, `fight-levels`) spreads its races or fights over worker threads (`test/pool.mjs`: `runAll` for race jobs, `mapPool`/`serve` for a script that is its own worker). Results are summed in job order, so any worker count prints byte for byte what one core does; `--jobs=N` sets it (default: every core). Keep `nice -n 19`.

## Front-runner score (per track)
Some maps favour the leader more than others (fine, but show it). `npm run frontrun` (`test/frontrun.mjs`) rates each track 0-10 (10: the leader is very hard to catch) into `js/frontrun-data.js`; the menu shows it as a meter with a one-line reason under each track's Show more (`js/frontrun.js`, one hook in ui.js `trackText`).
- **Races** (96 a track by default, ~20 min on 4 workers; all-bot, items on, L0-L2 in turn, 4/6/8 karts, random grids): the **hold rate** (of the karts leading at 1/3, 1/2 and 2/3 distance, how many win), **lead changes a minute** (a leader counts after holding 2 s, past the first 10%), the leader's margin and trend, **hits on the leader** (what each costs its margin over 3 s) and item pickups a kart a minute.
- **Tools** (what a human leader does on purpose and bots don't): Octo, Docky and Bugdroid alone (L1, no boxes) with a **mine dropped on their line** at ~36 spots a lap (best two spots, averaged over the three), and a **Turbo fired** at each spot (bot-driven or flat 2.5 s, whichever is quicker): best two spots over the median.
- **Score** = 10 × (0.6 hold + 0.15 calm + 0.25 tools), each 0..1 on fixed anchors so partial re-runs stay comparable: hold 0.2 → 0, 0.6 → 1; lead changes a minute 3 → 0, 1.2 → 1; tools the larger of the best mine spot (2 s → 0, 5 s → 1) and the Turbo edge (0.5 s → 0, 2.5 s → 1). The ± is a bootstrap over races (tools fixed), about ±1.2 at 96 races: tracks within ~1.5 aren't really different. The reason line comes from the signals that stand out (`reason`).
- Item pickup rate drives most low scores (bot leaders get hit 7-23 times a race).
- Re-run a changed track alone: `npm run frontrun -- 96 3,19` (indices or names; other entries kept, removed tracks dropped). `--save=raw.json` / `--load=raw.json` rescore without racing. `PROVISIONAL` in the script marks tracks being reworked (shown as provisional on the card): empty it once they land and re-run them.

## Fight: equal levels and the skill floor / ceiling
Same-level round robins only say how kits compare played equally well (too character-exact on their own), so `test/fight-odds.mjs` also measures each fighter across skill levels against the field at Normal:
- **Floor**: played by a Chill bot. A very low floor: too weak or too demanding for a beginner.
- **Ceiling**: played by a Ruthless bot. A very high ceiling: runs away with fights once mastered.
- **Spread** (ceiling - floor): how much skill it rewards.

Every ordered pair, N fights each way (sides alternating, arenas in turn, no mirrors, own seeds: identical whatever `--jobs`), written to `js/fight-matchup-data.js` as `skill.floor` / `skill.ceiling` (`[fights won, fights, rounds won, rounds]`) and `skill.vs` per opponent. Shares are read by rounds won (a Chill bot loses most fights, rounds resolve finer). `--no-skill` keeps the last ones.

The select screen's Easy / Medium / Hard and Ease bar come from them (js/fight-ui.js `skillOf`): ease = floor - spread / 2 against the field (Easy above +0.5 SD, Hard below -0.5, Medium within 2 points of the mean regardless); a kit's `difficulty` is the fallback without data. Equal-level numbers judge matchups; floor and ceiling judge fairness to weaker or stronger players. Re-run `nice -n 19 node test/fight-odds.mjs 40` after a kit or bot change.
