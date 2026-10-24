// Kernel Kart: main loop and start-up.
import { CHARACTERS } from './core.js';
import { initDevKeys } from './devkeys.js';
import { initDevUpdate } from './devupdate.js';
import { buildTrack, vmaxAt } from './geometry.js';
import { Input } from './input.js';
import { Race } from './race.js';
import { DPR, H, W, ctx, cv, render } from './render.js';
import { TRACKS } from './tracks.js';
import { game, setup, showMenu, showResults, startRace, toast, fpsTick } from './ui.js';
import { initMenuBg } from './menu-bg.js';
import { initQol } from './qol.js';
import { initPause } from './pause-ui.js';
import { initGamepads } from './gamepad.js';
import { boot, skipBoot } from './boot.js';
import { fightDemo, fightFrame } from './fight-ui.js';


// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  // never negative: the first frame's timestamp can be from before `last` was read, and a negative step runs every
  // timer backwards (statuses switch on, projection windows go negative and projectToTrack reads past the track)
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  fpsTick(now);
  const racing = game.state === 'race' || game.state === 'results', fighting = game.state === 'fight';
  // the menu sits on the CSS background: hide the full-screen canvas there, or the browser recomposites it every frame
  if (cv.style.visibility !== (racing || fighting ? 'visible' : 'hidden')) { cv.style.visibility = racing || fighting ? 'visible' : 'hidden'; if (!racing && !fighting) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); } }
  if (racing) {
    const r = game.race;
    if (game.state === 'race') { if (!r.paused) r.update(dt); if (r.over) showResults(r); }
    else r.update(dt); // keep the AI finishing in the background behind the results
    render(r, r.paused ? 0 : dt);
  }
  if (fighting) fightFrame(dt);   // Fight mode (fight-ui.js): its update and drawing
  requestAnimationFrame(frame);
}
// dev hook: index.html#demo=<trackIdx> auto-starts a race (all AI) for screenshots/testing (no boot screen)
const demo = /#demo(?:=(\d+))?/.exec(location.hash), fightHook = /#fight\b/.test(location.hash);   // #fight[=<bot level>]: a bot-vs-bot fight (fight-ui.js fightDemo)
Input.init({ game, toast }); initMenuBg(() => game.state); initDevUpdate(); initDevKeys(); initQol({ game }); initPause(); initGamepads(game);
showMenu('home');   // (always the title on a fresh start, whatever mode was last used; a #join link still goes to Online)
// the boot screen (index.html, boot.js) over the title while the menu's first heavy work is done, then fades into it
if (demo || fightHook) skipBoot(); else boot();
if (demo) { setup.track = +(demo[1] || 0); setup.random = false; setup.humans = 1; startRace({ immediate: true }); game.race.countdown = 0.01; }
if (fightHook) fightDemo(location.hash);
requestAnimationFrame(frame);
window.KK = { game, Race, TRACKS, CHARACTERS, Input, setup, buildTrack, vmaxAt, render };
