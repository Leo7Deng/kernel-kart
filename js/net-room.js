// Kernel Kart online: what anyone in a room may change, and how often. Everyone (the host too) picks their racer, helps
// pick the track or the cup's tracks and may change their name; the host runs these requests (net.js) for all of them, its own included, so it stays
// the one copy of the room. DOM-free (test/net.test.mjs runs it in Node).
//
// Each player but the host may act once every COOL ms per section: 'chars' (their racer), 'maps' (the track, or the
// cup's tracks) and 'name'; the host's own changes go through at once, as often as it likes. The screen enforces the wait at once
// (net-ui.js) and the host again on arrival, with SLACK for the link's jitter; a request that comes too soon is dropped and
// the player told how long is left ({ k: 'cool', sec, ms, q }). A player's own request shows on their screen at once, laid
// over the host's room with applyRequest (net.js) until the host has dealt with it.
import { TRACKS } from './tracks.js';
import { CHARACTERS } from './core.js';
import { FIGHT_ORDER } from './fight-chars.js';

export const COOL = 2000, SLACK = 300;
export const CUP_MAX = 5;   // (as ui.js CUP_MAX: a cup has 3 to 5 tracks)
export const SECTION = { pick: 'chars', pickTrack: 'maps', cupEdit: 'maps', name: 'name', fpick: 'chars', fdev: 'dev' };
// (fpick: your fighter in a fight room; fdev: whether your device has a keyboard or a gamepad, which fighting needs: no wait)
// a name as the room shows it: plain text, at most 12 characters ('' if there's nothing left)
export const cleanName = n => typeof n === 'string' ? n.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12).trim() : '';
export const HOST_ID = 0;   // the host's own player id (net.js hostRoom): no wait for it
const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

// how long before p may act in sec again (ms, 0: now). slack: forgive this much (the host, for requests that came over the link)
export function coolLeft(p, sec, now, slack = 0) { const t = p.cool && p.cool[sec]; return t == null ? 0 : Math.max(0, COOL - slack - (now - t)); }

// player p asks for d in room { players, cfg, racing }: { ok } if it changed the room (and starts p's cooldown for that
// section: not the host's), { wait, sec } if it came too soon, { ok: false } if there was nothing to do (or it isn't allowed now)
export function roomRequest(room, p, d, now, slack = 0) {
  const sec = SECTION[d && d.k]; if (!sec || room.racing) return { ok: false };
  if (p.id === HOST_ID || d.k === 'fdev') return { ok: apply(room, p, d), sec };
  const wait = coolLeft(p, sec, now, slack); if (wait > 0) return { ok: false, wait, sec };
  const free = d.k === 'pick' && d.first && !p.firstPick;   // the racer you bring along as you join doesn't count
  if (d.k === 'pick') p.firstPick = true;
  const ok = apply(room, p, d);
  if (ok && !free) (p.cool ||= {})[sec] = now;
  return { ok, sec };
}
// d's change to the room for p, no wait checked (a player's own copy of the room, as it will be once the host has it): true if it changed it
export const applyRequest = (room, p, d) => !!SECTION[d && d.k] && !room.racing && apply(room, p, d);

function apply(room, p, d) {
  const cfg = room.cfg, cup = cfg.cupTracks || (cfg.cupTracks = []), by = cfg.cupBy || (cfg.cupBy = cup.map(() => 0));
  if (d.k === 'pick') {
    if (!isIdx(d.ci, CHARACTERS.length) || d.ci === p.pick) return false;   // (a racer someone else has is fine: you can share one)
    p.pick = d.ci; return true;
  }
  if (d.k === 'fpick') {   // your fighter (Fight mode: fight-net.js seats the first two players who can fight)
    if (!FIGHT_ORDER.includes(d.id) || d.id === p.fighter) return false;   // (only the pickable ones: FIGHT_ORDER)
    p.fighter = d.id; return true;
  }
  if (d.k === 'fdev') { const kb = !!d.kb; if (p.kb === kb) return false; p.kb = kb; return true; }
  if (d.k === 'name') {   // your name (a room link joins with a made-up one; net-ui.js: change it in the room)
    const n = cleanName(d.name); if (!n || n === p.name) return false;
    p.name = n; return true;
  }
  if (d.k === 'pickTrack') {   // the single race's track (who picked it shows on its card); t -1 is Random (net.js hostStart)
    if (cfg.mode === 'cup') return false;
    if (d.t === -1) { if (cfg.random) return false; cfg.random = true; cfg.trackBy = p.id; return true; }
    if (!isIdx(d.t, TRACKS.length) || (d.t === cfg.track && !cfg.random)) return false;
    cfg.track = d.t; cfg.random = false; cfg.trackBy = p.id; return true;
  }
  if (cfg.mode !== 'cup') return false;
  // the cup: tracks are named by their index, not their slot, so two people editing at once can't take out the wrong one
  const custom = () => { cfg.cupName = 'Custom Cup'; return true; };
  if (d.op === 'add') {
    if (!isIdx(d.t, TRACKS.length) || cup.includes(d.t) || cup.length >= CUP_MAX) return false;
    cup.push(d.t); by.push(p.id); return custom();
  }
  if (d.op === 'drop') {
    const i = cup.indexOf(d.t); if (i < 0) return false;
    cup.splice(i, 1); by.splice(i, 1); return custom();
  }
  if (d.op === 'clear') { if (!cup.length) return false; cup.length = 0; by.length = 0; return custom(); }
  if (d.op === 'preset') {   // a ready-made cup (ui.js PRESET_CUPS): its tracks and its name
    const ts = d.tracks;
    if (!Array.isArray(ts) || ts.length < 1 || ts.length > CUP_MAX || !ts.every(t => isIdx(t, TRACKS.length)) || new Set(ts).size !== ts.length) return false;
    if (typeof d.name !== 'string' || !d.name || d.name.length > 40) return false;
    if (cfg.cupName === d.name && ts.length === cup.length && ts.every((t, i) => t === cup[i])) return false;
    cfg.cupTracks = [...ts]; cfg.cupBy = ts.map(() => p.id); cfg.cupName = d.name; return true;
  }
  return false;
}
