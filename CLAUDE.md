# Kernel Kart

A one-button kart racer in plain JS on a canvas (ES modules under `js/`, Vite for dev/build). Racers are programming-language mascots (Gopher, Ferris, Pyth, Octo, Tux, Duke, Docky, Swifty, Cpp, Bugdroid), items are dev terms (Turbo, Rubber Duck, Segfault, malloc, sudo, Kernel Panic, Pull Request...). 20 tracks, offline races and cups for 1-4 players, time trial, and LAN online rooms. Live at https://leo7deng.github.io/kernel-kart/.

`README.md` is the player-facing description of every track, item and racer: keep it in sync. Details live in `docs/`:
- `docs/code-map.md`: every file and system in depth (read the part you're touching before changing it).
- `docs/tracks.md`: how to make a track, and every track mechanic with its rules, bot logic and measurements.
- `docs/status.md`: dated history and decisions per track/system (why things are the way they are).
- `docs/balance.md`: how balance is judged.

## How we work (the user's standing rules)
- **One commit per change; the subject is one player-facing sentence** (it shows in the game's What's new). End commit messages with the Co-Authored-By line from the session.
- **Keep "In the works" current** (`js/roadmap.js`, the menu's In the works dialog): everything being worked on gets an entry when it starts (`'queued'` if waiting): when it started and an earliest-latest range, guessed from how long similar jobs took (small art jobs 10-25 min, a new map or the menu 1.5-2.5 h, more with several helpers running); check in on running helpers about every 20 min and revise the range; remove the entry when it's committed. Ideas nobody's on go in `ideas`. Roadmap-only commits are hidden from What's new.
- **Helpers:** the main session coordinates and fans work out to helper agents in git worktrees (one task each, their own files where possible), then merges, resolves conflicts and reports. Keep at most ~3 running when the machine is busy; pause/queue long ones (TaskStop, resume with SendMessage).
- **Test lightly while work is in flight** (`node test/sim.test.mjs` and `npx vite build`, a few screenshots), heavy testing (net, timetrial, mega, balance runs) once at the end. Committing something a bit unbalanced is fine; tune after. Run heavy things with `nice -n 19`.
- **Never kill servers or browsers you didn't start.** Use your own ports for dev servers (`npx vite --port 52xx --strictPort`) and headless Chrome debug ports (`.claude/kk-tools/cdp-online.mjs` has a CDP driver).
- The user plays via `npm run play` (a `.play` worktree kept at HEAD; F9 reloads to the newest commit) and online with friends over LAN, often on iPads and iPhones.
- `npm run publish:web` updates the web version: a single no-history snapshot on `main` and `gh-pages`, authored by an address no GitHub account has, with every file marked linguist-vendored. The user's calls: never push the local history (a private email, and they don't want the commits on their GitHub profile or the code in their language stats).

## The user's taste (decisions that keep coming up)
- Cute, simple, cartoony but believable art; not realistic or metallic. Effects sparing and meaningful, no words in effects (events go in the icon feed).
- Catch-up is items only (no speed help for cars behind). Some maps may favour front-running (e.g. Moonshot's rocket rows).
- Online: every screen frames every player (yours first). No split screen, ever.
- Drift is on by default (a third key); bots drift too. Burnout at the start is harsh and obvious.
- Looks: Settings → Style. **Only Classic Flat is worked on**: new art and UI must look right there; Classic (the default) shouldn't break; Racing and Premium are archived (no extra time on them). Flat-look code lives in `bold()` branches with the `BK` palette (`js/look.js`). 3D models (experimental) behind a Settings toggle (`js/art/model3d.js`).

## Rules that keep things working
- **Determinism:** gameplay code never calls `Math.random` (it only seeds `race.rng` / `car.rng`); cosmetics use `frnd`/`fchance`. Replays and measurements depend on it.
- **The golden:** `test/golden.json` records every test race. A refactor or drawing change must keep it byte-identical; an intended gameplay change regenerates it (`node test/sim.test.mjs --update`, `git add test/golden.json` after) and says why in the commit. If others have uncommitted edits, regenerate in a clean worktree of HEAD.
- `race.js` and everything it imports must load in Node without a DOM (the tests import it). DOM code stays in `render.js`, `ui.js`, `input.js`, `main.js` and the `*-ui.js` files.
- Track mechanics only some tracks have go through `race-mechanics.js` (`T.mech` null otherwise, so other tracks replay identically); per-race state lives on the race (plain data, so online snapshots carry it), never on the shared track.
- A new map/mechanic: bots must handle it (a mechanic the AI ignores makes balance meaningless); a layout change bumps the track's `rev` (time-trial ghosts set aside).

## Run and test
- `npm run play` (what the user plays), `npm run dev` (the working tree), `#demo=N` auto-starts an all-bot race on track N, `npm run build` → `dist/`, `npm run server` (dist + the online relay).
- `node test/sim.test.mjs` (every track × level × seed against the golden), `node test/net.test.mjs` (relay + online sync on every track), `node test/timetrial.test.mjs`, `node test/mega.test.mjs`, `node test/drift.mjs`. `npm test` runs them all.
- Measurement tools: `npm run items` (item value by position), `npm run balance -- 640 [--drift]`, `npm run boxes` (single boxes), `npm run odds` (README's odds table), `node test/drift-bots.mjs`, `npm run frontrun` (each track's Front-runner score for the menu, `js/frontrun-data.js`: re-run a reworked track with `npm run frontrun -- 96 <index>`; see docs/balance.md).

## Where things are (one line each; see docs/code-map.md)
- `js/main.js` frame loop · `js/ui.js` menu, race start, results, `game`/`setup` · `js/render.js` drawing the race and HUD · `js/input.js` keys and touch · `js/settings.js` · `js/look.js` the style palettes · `js/roadmap.js` In the works · `js/changelog.js` What's new (from git, via `vite.config.js`).
- `js/race.js` `Race`/`Car` and `updateCar` physics, `collideCars`; `race-ai.js` bot throttle; `race-items.js` + `js/items/<id>.js` one module per item (odds, use, bot use, world objects); `race-start.js` rocket start/burnout; `race-drift.js` drift (players and bots); `race-bits.js`; `race-forks.js`; `rules.js` (`untouchable`, `phased`, `blockedByShield`).
- `js/race-mechanics.js` + one `js/race-<name>.js` per mechanic; drawing in `js/draw-mechanics.js` and `js/art/*.js` (one file per theme/set piece); `js/tracks.js` definitions; `js/geometry.js` track building.
- Online: `server/relay.mjs` (WebSocket relay), `js/net.js` session, `js/net-sync.js` snapshots/prediction, `js/net-room.js` room rules, `js/net-ui.js` room screen, `js/net-chat.js` + `js/chat-ui.js` chat.
- Time trial: `js/timetrial.js`, `timetrial-ui.js`, `draw-timetrial.js`. Clips: `js/clip.js`, `clip-ui.js`. Audio: `js/audio.js` (all synthesised).
