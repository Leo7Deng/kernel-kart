// Kernel Kart: sound effects and the background music sequencer. All synthesised: no audio files.
// Effects are named (SOUNDS below) and played with sfx.play(name, volume); the race picks the volume by distance
// from the players (race.sound in fx.js).
import { clamp, mulberry } from './core.js';
import { TRACKS } from './tracks.js';


// ---------------------------------------------------------------- audio: sound effects and background music
// The music is a tiny chiptune sequencer. Each song is generated from a seed: a chord progression, a two-bar melody
// motif in the major pentatonic that's replayed over the chords (so it sticks in your head), bass, bouncy offbeat
// chord stabs and soft drums. The menu and every track get their own tune.
export const sfx = (() => {
  let ctx = null, muted = false, musicVol = 1, sfxVol = 1, api = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let song = null, want = null, timer = null, nextT = 0, step = 0, tempoMul = 1;
  const lastAt = {};
  // the audio context and its buses, made (warm: the boot screen makes them ahead, as opening the audio device takes
  // 0.05-0.2 s, a stall on the first click otherwise; a context made before any key or click starts suspended and is
  // resumed by the first one). Sound and music only once ensure() has run (the first key, click or tap: heard).
  let heard = false;
  const make = () => {
    if (!ctx) { try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.42 * musicVol; musicBus.connect(master);
      // effects go through a compressor so a pile-up of hits gets loud, not distorted
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(comp);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // the browser can suspend or interrupt the audio (tab hidden, output device changed): pick it back up
      ctx.onstatechange = () => { if (heard && ctx.state !== 'running' && ctx.state !== 'closed' && document.visibilityState === 'visible') ctx.resume().catch(() => { }); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && heard) ensure(); });
    } catch (e) { ctx = null; } }
  };
  const ensure = () => {
    heard = true; make();
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => { });   // 'suspended', or Safari's 'interrupted'
    if (ctx && want && (!song || song.id !== want)) start(want);
  };
  const beep = (f, d = 0.08, type = 'square', vol = 0.12, slide = 0) => { if (live()) osc(ctx.currentTime, f, d, type, vol, slide); };
  const live = () => { if (muted || typeof window === 'undefined') return false; ensure(); return !!ctx; };
  // one note on the effects bus at time t: frequency f sliding by `slide` Hz over d seconds
  const osc = (t, f, d, type, vol, slide = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(sfxBus); o.start(t); o.stop(t + d + 0.02);
  };
  // a burst of filtered noise at time t, its filter sweeping from f to f2
  const hiss = (t, d, vol, type, f, f2 = 0) => {
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(fl).connect(g).connect(sfxBus); src.start(t, Math.random() * 0.4); src.stop(t + d + 0.02);
  };
  const arp = (t, fs, gap, d, type, vol, slide = 0) => fs.forEach((f, k) => osc(t + k * gap, f, d, type, vol, slide));
  const boom = (t, v, size = 1) => {   // an explosion: a thump, a crackle and a rumble
    osc(t, 140 * size, 0.35, 'square', 0.22 * v, -90 * size); osc(t, 70, 0.5, 'sine', 0.35 * v, -35);
    hiss(t, 0.45 * size, 0.3 * v, 'lowpass', 1800, 160); hiss(t, 0.12, 0.18 * v, 'highpass', 3000);
  };
  // ----- every sound effect, by name: (v = volume 0..1, t = start time)
  const SOUNDS = {
    // menus and race flow
    click: (v, t) => osc(t, 700, 0.05, 'triangle', 0.16 * v, 260),
    start: (v, t) => { arp(t, [523, 659, 784, 1046], 0.06, 0.14, 'square', 0.1 * v, 20); osc(t + 0.24, 1568, 0.3, 'triangle', 0.1 * v); },
    count: (v, t) => { osc(t, 440, 0.18, 'square', 0.14 * v); osc(t, 880, 0.12, 'sine', 0.08 * v); },
    go: (v, t) => { osc(t, 880, 0.45, 'square', 0.14 * v); osc(t, 1320, 0.45, 'triangle', 0.12 * v); hiss(t, 0.35, 0.1 * v, 'highpass', 5000); },
    chat: (v, t) => { osc(t, 988, 0.06, 'sine', 0.07 * v); osc(t + 0.07, 1319, 0.1, 'sine', 0.06 * v); },   // a line of chat came in (chat-ui.js)
    lap: (v, t) => { osc(t, 784, 0.09, 'triangle', 0.2 * v); osc(t + 0.08, 1046, 0.16, 'triangle', 0.2 * v); },
    finalLap: (v, t) => { arp(t, [659, 784, 988, 1318], 0.09, 0.16, 'square', 0.11 * v, 20); osc(t + 0.36, 1318, 0.4, 'triangle', 0.14 * v); hiss(t + 0.36, 0.3, 0.06 * v, 'highpass', 6000); },
    finish: (v, t) => { arp(t, [523, 659, 784], 0.1, 0.14, 'triangle', 0.18 * v); osc(t + 0.3, 1046, 0.45, 'triangle', 0.2 * v); osc(t + 0.3, 523, 0.45, 'square', 0.06 * v); },
    win: (v, t) => {
      arp(t, [523, 659, 784, 1046], 0.13, 0.16, 'square', 0.1 * v); arp(t, [523, 659, 784, 1046], 0.13, 0.16, 'triangle', 0.14 * v);
      for (const f of [523, 659, 784, 1046]) osc(t + 0.55, f, 0.9, 'triangle', 0.09 * v);
      for (let k = 0; k < 6; k++) osc(t + 0.6 + k * 0.07, 1568 + k * 220, 0.12, 'sine', 0.06 * v);
    },
    rivalWin: (v, t) => { osc(t, 392, 0.14, 'triangle', 0.14 * v); osc(t + 0.14, 523, 0.3, 'triangle', 0.14 * v); },
    // a time trial lap that beats your record: a quick rising run and a sparkle on top
    record: (v, t) => { arp(t, [784, 988, 1175, 1568], 0.07, 0.12, 'triangle', 0.17 * v); osc(t + 0.28, 1568, 0.5, 'square', 0.05 * v); osc(t + 0.28, 2093, 0.5, 'triangle', 0.1 * v); for (let k = 0; k < 5; k++) osc(t + 0.34 + k * 0.06, 2637 + k * 260, 0.1, 'sine', 0.05 * v); },
    // driving
    bump: (v, t) => { osc(t, 160, 0.1, 'square', 0.16 * v, -80); hiss(t, 0.08, 0.2 * v, 'lowpass', 1100); },
    offroad: (v, t) => { hiss(t, 0.3, 0.22 * v, 'lowpass', 700, 180); osc(t, 95, 0.18, 'sawtooth', 0.08 * v, -35); },
    jump: (v, t) => { hiss(t, 0.28, 0.14 * v, 'bandpass', 600, 2600); osc(t, 300, 0.22, 'triangle', 0.14 * v, 520); },
    trick: (v, t) => arp(t, [880, 1108, 1318, 1760], 0.045, 0.09, 'square', 0.09 * v),
    land: (v, t) => { osc(t, 120, 0.14, 'sine', 0.3 * v, -60); hiss(t, 0.14, 0.18 * v, 'lowpass', 800); },
    trickLand: (v, t) => { osc(t, 120, 0.14, 'sine', 0.3 * v, -60); osc(t, 330, 0.3, 'sawtooth', 0.12 * v, 760); arp(t + 0.05, [1318, 1760], 0.06, 0.12, 'triangle', 0.12 * v); },
    pad: (v, t) => { osc(t, 420, 0.2, 'square', 0.1 * v, 820); hiss(t, 0.22, 0.14 * v, 'bandpass', 1500, 5200); },
    rocket: (v, t) => { osc(t, 150, 0.45, 'sawtooth', 0.16 * v, 900); hiss(t, 0.4, 0.2 * v, 'bandpass', 900, 4200); arp(t + 0.12, [988, 1318], 0.07, 0.14, 'triangle', 0.12 * v); },   // a rocket start
    bit: (v, t) => { osc(t, 1568, 0.06, 'triangle', 0.07 * v, 400); osc(t + 0.035, 2349, 0.07, 'sine', 0.05 * v); },   // a bit taken: a tiny glassy tick
    bitFull: (v, t) => { arp(t, [1568, 2093, 2637], 0.04, 0.08, 'triangle', 0.07 * v); },   // ...and that's the most you can hold
    bitSpill: (v, t) => { arp(t, [2093, 1568, 1175], 0.05, 0.07, 'triangle', 0.07 * v, -200); },   // a hit threw yours out
    wheelspin: (v, t) => { for (let k = 0; k < 4; k++) osc(t + k * 0.09, 110 - k * 8, 0.07, 'sawtooth', 0.1 * v, -30); hiss(t, 0.5, 0.16 * v, 'highpass', 2600, 1200); },   // too early: a sputter and a tyre squeal
    // the drift button (race-drift.js): a tyre chirp as it starts, a crackle each time the sparks change colour, and a
    // whoosh for the mini-turbo, bigger each tier; over-held, it spins out with a long screech
    driftStart: (v, t) => { hiss(t, 0.16, 0.12 * v, 'bandpass', 2600, 1500); osc(t, 900, 0.08, 'triangle', 0.04 * v, -300); },
    driftSpark1: (v, t) => { for (let k = 0; k < 3; k++) osc(t + k * 0.03, 1900 + k * 160, 0.025, 'square', 0.045 * v); hiss(t, 0.08, 0.08 * v, 'highpass', 5000); },
    driftSpark2: (v, t) => { for (let k = 0; k < 4; k++) osc(t + k * 0.028, 2300 + k * 200, 0.025, 'square', 0.05 * v); hiss(t, 0.1, 0.09 * v, 'highpass', 5500); },
    driftSpark3: (v, t) => { for (let k = 0; k < 5; k++) osc(t + k * 0.026, 2700 + k * 240, 0.025, 'square', 0.055 * v); hiss(t, 0.12, 0.1 * v, 'highpass', 6000); osc(t + 0.12, 3520, 0.18, 'sine', 0.04 * v); },
    driftBoost1: (v, t) => { hiss(t, 0.28, 0.14 * v, 'bandpass', 500, 2400); osc(t, 180, 0.24, 'sawtooth', 0.07 * v, 300); },
    driftBoost2: (v, t) => { hiss(t, 0.38, 0.17 * v, 'bandpass', 450, 3000); osc(t, 170, 0.32, 'sawtooth', 0.09 * v, 420); },
    driftBoost3: (v, t) => { hiss(t, 0.5, 0.2 * v, 'bandpass', 400, 3600); osc(t, 160, 0.42, 'sawtooth', 0.1 * v, 560); arp(t + 0.1, [1318, 1760], 0.06, 0.12, 'triangle', 0.08 * v); },
    hit_drift: (v, t) => { hiss(t, 0.5, 0.2 * v, 'bandpass', 2600, 600); osc(t, 280, 0.4, 'triangle', 0.12 * v, -200); },
    fall: (v, t) => { osc(t, 1200, 0.7, 'sine', 0.16 * v, -1050); osc(t + 0.65, 80, 0.32, 'square', 0.2 * v, -30); hiss(t + 0.65, 0.32, 0.22 * v, 'lowpass', 600); },
    // a secret shortcut (race-secret.js): the phoenix takes you (a roar of flame, a rising run up to a bright chord) and puts you down (a whoosh, a thump, a sparkle)
    phoenix: (v, t) => { hiss(t, 0.7, 0.2 * v, 'bandpass', 300, 3200); osc(t, 110, 0.6, 'sawtooth', 0.08 * v, 440); arp(t + 0.15, [523, 659, 784, 1046, 1318], 0.07, 0.18, 'triangle', 0.13 * v); for (const f of [784, 1046, 1568]) osc(t + 0.5, f, 0.8, 'sine', 0.07 * v); },
    hit_phoenix: (v, t) => { osc(t, 70, 0.6, 'sawtooth', 0.22 * v, -40); hiss(t, 0.7, 0.3 * v, 'lowpass', 2400, 300); osc(t + 0.05, 180, 0.4, 'square', 0.1 * v, -120); },   // burned out by the phoenix's landing
    phoenixLand: (v, t) => { hiss(t, 0.35, 0.18 * v, 'bandpass', 3000, 400); osc(t + 0.12, 140, 0.25, 'sine', 0.26 * v, -70); arp(t + 0.16, [1318, 1568, 2093], 0.05, 0.14, 'triangle', 0.1 * v); },
    mineIn: (v, t) => { hiss(t, 0.5, 0.2 * v, 'lowpass', 1800, 200); osc(t, 70, 0.9, 'sawtooth', 0.12 * v, -20); osc(t + 0.1, 48, 1.1, 'square', 0.1 * v, -8); for (let k = 0; k < 5; k++) osc(t + 0.25 + k * 0.17, 1320 + (k % 2) * 180, 0.05, 'triangle', 0.05 * v); },   // a mine (race-secret.js): a rumble down into the dark, rails clicking
    mineOut: (v, t) => { hiss(t, 0.4, 0.22 * v, 'bandpass', 500, 2600); osc(t, 90, 0.3, 'sawtooth', 0.12 * v, 160); arp(t + 0.12, [784, 1046], 0.06, 0.12, 'triangle', 0.12 * v); },   // ...and out of the portal in a puff of dust
    shortcut: (v, t) => { osc(t, 780, 0.12, 'triangle', 0.16 * v, 300); osc(t + 0.08, 1170, 0.16, 'triangle', 0.14 * v, 200); },
    forkSharp: (v, t) => { osc(t, 660, 0.1, 'triangle', 0.16 * v, 400); osc(t + 0.07, 990, 0.12, 'triangle', 0.12 * v, 300); },
    forkWide: (v, t) => osc(t, 330, 0.18, 'triangle', 0.12 * v, -120),
    // the logic gate: the switch clicking in (and the gate's chime going up), the bars sliding shut, a kart into them
    gateSet: (v, t) => { osc(t, 2400, 0.03, 'square', 0.12 * v); hiss(t, 0.03, 0.12 * v, 'highpass', 3500); arp(t + 0.05, [784, 1047, 1568], 0.06, 0.1, 'square', 0.08 * v); },
    gateShut: (v, t) => { arp(t, [1175, 880, 587], 0.08, 0.1, 'square', 0.08 * v); hiss(t + 0.2, 0.25, 0.14 * v, 'bandpass', 1800, 700); osc(t + 0.45, 140, 0.18, 'square', 0.16 * v, -60); },
    hit_gate: (v, t) => { osc(t, 1700, 0.25, 'square', 0.1 * v, -600); osc(t, 95, 0.35, 'square', 0.22 * v, -40); hiss(t, 0.3, 0.24 * v, 'bandpass', 2600, 900); osc(t + 0.05, 2900, 0.3, 'sine', 0.06 * v, -200); },
    trainHorn: (v, t) => { osc(t, 196, 0.45, 'square', 0.12 * v); osc(t, 247, 0.45, 'square', 0.08 * v); osc(t + 0.45, 165, 0.6, 'square', 0.12 * v); osc(t + 0.45, 208, 0.6, 'square', 0.08 * v); },
    // items: picking one up, running out, being protected
    pickup: (v, t) => { arp(t, [523, 659, 784, 1046, 1318], 0.035, 0.09, 'triangle', 0.18 * v, 120); osc(t + 0.18, 2093, 0.2, 'sine', 0.14 * v, -150); hiss(t, 0.08, 0.08 * v, 'highpass', 7000); },
    block: (v, t) => { osc(t, 1250, 0.3, 'triangle', 0.18 * v, -250); osc(t, 1870, 0.25, 'sine', 0.1 * v); hiss(t, 0.14, 0.14 * v, 'highpass', 4000); },
    denied: (v, t) => { osc(t, 220, 0.1, 'square', 0.12 * v); osc(t + 0.12, 180, 0.16, 'square', 0.12 * v, -40); },
    shieldDown: (v, t) => arp(t, [880, 660, 440], 0.05, 0.1, 'triangle', 0.1 * v),
    ghostEnd: (v, t) => osc(t, 240, 0.3, 'sine', 0.16 * v, 220),
    ffEnd: (v, t) => { osc(t, 900, 0.35, 'sawtooth', 0.08 * v, -700); hiss(t, 0.3, 0.1 * v, 'bandpass', 3000, 400); },
    merge: (v, t) => { osc(t, 300, 0.3, 'sawtooth', 0.12 * v, 900); hiss(t, 0.3, 0.14 * v, 'bandpass', 800, 4000); },
    pullBreak: (v, t) => { osc(t, 520, 0.2, 'square', 0.1 * v, -380); hiss(t, 0.06, 0.12 * v, 'highpass', 5000); },
    duckBounce: (v, t) => osc(t, 1300, 0.06, 'square', 0.06 * v, -450),
    megaBonk: (v, t) => { osc(t, 220, 0.12, 'square', 0.18 * v, 320); osc(t + 0.1, 540, 0.28, 'triangle', 0.18 * v, -340); },
    // items: firing each one
    use_boost: (v, t) => { osc(t, 180, 0.36, 'sawtooth', 0.16 * v, 620); hiss(t, 0.34, 0.2 * v, 'bandpass', 1100, 3400); },
    use_oc: (v, t) => { osc(t, 160, 0.45, 'sawtooth', 0.16 * v, 950); osc(t, 320, 0.45, 'square', 0.06 * v, 1900); hiss(t, 0.25, 0.14 * v, 'highpass', 3600); },
    use_ff: (v, t) => { osc(t, 140, 0.5, 'sawtooth', 0.16 * v, 1150); hiss(t, 0.45, 0.2 * v, 'bandpass', 600, 4200); osc(t + 0.4, 1290, 0.25, 'triangle', 0.1 * v); },
    use_duck: (v, t) => { osc(t, 940, 0.1, 'square', 0.16 * v, -290); osc(t + 0.06, 1260, 0.12, 'square', 0.14 * v, -460); hiss(t, 0.06, 0.1 * v, 'bandpass', 2000); },
    use_mega: (v, t) => { osc(t, 150, 0.45, 'square', 0.18 * v, -30); osc(t, 95, 0.5, 'sawtooth', 0.18 * v, 40); osc(t + 0.15, 220, 0.35, 'square', 0.14 * v, -70); hiss(t + 0.1, 0.3, 0.14 * v, 'lowpass', 500); },
    use_shield: (v, t) => { arp(t, [440, 554, 659, 880], 0.035, 0.12, 'triangle', 0.16 * v, 60); osc(t + 0.14, 1760, 0.3, 'sine', 0.08 * v, -200); },
    use_ghost: (v, t) => { osc(t, 350, 0.45, 'sine', 0.16 * v, -150); osc(t + 0.1, 262, 0.4, 'sine', 0.14 * v, 130); osc(t, 353, 0.45, 'sine', 0.1 * v, -152); },
    use_undo: (v, t) => { osc(t, 1300, 0.3, 'triangle', 0.14 * v, -1000); hiss(t, 0.3, 0.12 * v, 'bandpass', 4000, 500); osc(t + 0.28, 520, 0.1, 'triangle', 0.14 * v); },
    use_pull: (v, t) => arp(t, [360, 440, 360, 480], 0.055, 0.11, 'triangle', 0.16 * v, 80),
    use_panic: (v, t) => { for (let k = 0; k < 3; k++) { osc(t + k * 0.22, 900, 0.2, 'sawtooth', 0.12 * v, -380); } hiss(t, 0.5, 0.12 * v, 'highpass', 2800); osc(t, 60, 0.6, 'square', 0.16 * v); },
    use_fork: (v, t) => { for (let k = 0; k < 3; k++) { osc(t + k * 0.06, 380 + k * 170, 0.09, 'square', 0.14 * v, -100); hiss(t + k * 0.06, 0.05, 0.1 * v, 'highpass', 4500); } },
    use_tomato: (v, t) => { osc(t, 220, 0.14, 'square', 0.16 * v, -80); hiss(t, 0.12, 0.14 * v, 'bandpass', 1600, 400); osc(t + 0.12, 1800, 0.05, 'square', 0.06 * v); },
    use_leak: (v, t) => { osc(t, 200, 0.22, 'sine', 0.2 * v, -110); hiss(t, 0.16, 0.14 * v, 'bandpass', 750, 220); osc(t + 0.12, 140, 0.16, 'sine', 0.14 * v, -50); },
    use_bubble: (v, t) => { hiss(t, 0.18, 0.12 * v, 'bandpass', 1800, 2900); osc(t + 0.04, 500, 0.24, 'sine', 0.2 * v, 300); },
    use_grow: (v, t) => { for (let k = 0; k < 6; k++) osc(t + k * 0.06, [262, 392, 330, 494, 392, 523][k] * 1.5, 0.08, 'square', 0.1 * v); osc(t, 110, 0.45, 'sawtooth', 0.12 * v, 110); hiss(t, 0.4, 0.08 * v, 'lowpass', 300, 1200); },
    shrink: (v, t) => { for (let k = 0; k < 4; k++) osc(t + k * 0.06, 784 - k * 130, 0.08, 'square', 0.1 * v); osc(t, 220, 0.3, 'sawtooth', 0.08 * v, -150); },
    stomp: (v, t) => { osc(t, 70, 0.16, 'sine', 0.3 * v, -25); hiss(t, 0.1, 0.1 * v, 'lowpass', 400); },
    use_thread: (v, t) => { osc(t, 520, 0.32, 'sine', 0.14 * v, 520); osc(t, 527, 0.32, 'triangle', 0.1 * v, 780); arp(t + 0.12, [1046, 1318, 1568], 0.05, 0.1, 'sine', 0.08 * v); hiss(t, 0.2, 0.06 * v, 'highpass', 6000); },   // your voice forks into two, rising
    threadPop: (v, t) => { osc(t, 1600, 0.16, 'sine', 0.16 * v, -1100); osc(t + 0.02, 2400, 0.08, 'triangle', 0.08 * v, -1200); hiss(t, 0.12, 0.14 * v, 'highpass', 4500, 2000); },   // a clone pops like glass
    use_loop: (v, t) => { osc(t, 180, 0.12, 'square', 0.14 * v, -70); arp(t + 0.08, [523, 784, 1046, 784, 1046], 0.06, 0.1, 'triangle', 0.1 * v); },   // set down with a clunk, then it hums round
    hit_loop: (v, t) => { osc(t, 260, 0.45, 'sine', 0.18 * v, 700); osc(t + 0.45, 960, 0.45, 'sine', 0.18 * v, -660); hiss(t, 0.9, 0.12 * v, 'bandpass', 500, 2600); arp(t + 0.3, [784, 988, 1175, 1568], 0.07, 0.12, 'triangle', 0.08 * v); },   // whoosh up and over and down, and a whee
    use_sudo: (v, t) => { arp(t, [523, 659, 784, 1046], 0.045, 0.12, 'square', 0.12 * v, 40); osc(t, 131, 0.4, 'sawtooth', 0.12 * v); },
    // items: what hitting you sounds like
    hit_mine: (v, t) => boom(t, v),
    hit_train: (v, t) => { boom(t, v, 1.3); osc(t, 196, 0.3, 'square', 0.1 * v); },
    hit_duck: (v, t) => { osc(t, 820, 0.13, 'square', 0.18 * v, -360); osc(t + 0.07, 580, 0.17, 'square', 0.16 * v, -240); hiss(t, 0.08, 0.1 * v, 'bandpass', 1900); },
    hit_leak: (v, t) => { osc(t, 290, 0.2, 'sine', 0.22 * v, -190); hiss(t, 0.22, 0.18 * v, 'bandpass', 900, 260); osc(t + 0.08, 150, 0.18, 'sine', 0.16 * v, -70); for (let k = 0; k < 4; k++) osc(t + 0.15 + k * 0.08, 1500 - k * 200, 0.04, 'square', 0.05 * v); },
    hit_bubble: (v, t) => { osc(t, 440, 0.22, 'sine', 0.2 * v, 340); osc(t + 0.08, 680, 0.16, 'triangle', 0.16 * v, -320); hiss(t, 0.1, 0.1 * v, 'highpass', 4200); },
    hit_panic: (v, t) => { hiss(t, 0.06, 0.35 * v, 'highpass', 2500); hiss(t + 0.02, 0.5, 0.25 * v, 'lowpass', 900, 120); osc(t, 960, 0.1, 'sawtooth', 0.14 * v, -720); osc(t + 0.04, 240, 0.34, 'sawtooth', 0.12 * v, -130); },   // a thunder crack, then the stall
    hit_sudo: (v, t) => { boom(t, v, 1.1); arp(t + 0.05, [784, 523], 0.08, 0.12, 'square', 0.08 * v); },
    hit_gc: (v, t) => { osc(t, 320, 0.15, 'square', 0.16 * v, -100); osc(t + 0.05, 520, 0.12, 'square', 0.12 * v, -200); hiss(t, 0.16, 0.18 * v, 'bandpass', 3000); osc(t + 0.12, 2200, 0.1, 'triangle', 0.06 * v); },
    hit_ff: (v, t) => { hiss(t, 0.25, 0.18 * v, 'bandpass', 3000, 600); osc(t, 200, 0.2, 'square', 0.16 * v, -100); },
    hit_pull: (v, t) => { osc(t, 700, 0.3, 'triangle', 0.14 * v, -400); osc(t, 1400, 0.2, 'sine', 0.06 * v, -800); },
    hit_squish: (v, t) => { osc(t, 400, 0.18, 'square', 0.16 * v, -330); hiss(t, 0.15, 0.2 * v, 'lowpass', 1400, 300); osc(t + 0.12, 200, 0.25, 'triangle', 0.16 * v, 300); osc(t + 0.3, 500, 0.15, 'triangle', 0.1 * v, -250); },
    hit_stamp: (v, t) => { osc(t, 60, 0.35, 'square', 0.3 * v, -20); hiss(t, 0.2, 0.3 * v, 'lowpass', 900, 150); osc(t + 0.02, 1800, 0.05, 'square', 0.08 * v); },
    warp: (v, t) => { osc(t, 220, 0.4, 'sine', 0.16 * v, 1400); osc(t + 0.05, 330, 0.35, 'triangle', 0.1 * v, 1800); hiss(t, 0.3, 0.1 * v, 'bandpass', 600, 5000); },
    geyser: (v, t) => { hiss(t, 0.25, 0.1 * v, 'lowpass', 300, 900); hiss(t + 0.15, 1.6, 0.14 * v, 'bandpass', 700, 2600); osc(t, 55, 0.9, 'sine', 0.14 * v, 25); },   // a rumble, then the whoosh of steam
    slag: (v, t) => { hiss(t, 0.4, 0.2 * v, 'lowpass', 500, 200); for (let k = 0; k < 3; k++) osc(t + k * 0.1, 120 + k * 30, 0.08, 'sine', 0.12 * v, 60); },
    hit_fall: (v, t) => SOUNDS.fall(v, t),
    // the volcano: a deep rumble before it blows, the eruption, a bomb splatting down, a tyre in hot lava, being hit
    rumble: (v, t) => { osc(t, 38, 1.6, 'sine', 0.3 * v, 14); osc(t + 0.3, 52, 1.3, 'triangle', 0.12 * v, -10); hiss(t, 1.7, 0.16 * v, 'lowpass', 160, 320); },
    erupt: (v, t) => { boom(t, v, 1.6); osc(t, 45, 1.2, 'sine', 0.35 * v, -15); hiss(t + 0.1, 1.4, 0.2 * v, 'lowpass', 700, 120); for (let k = 0; k < 5; k++) hiss(t + 0.15 + k * 0.12, 0.08, 0.1 * v, 'highpass', 2600); },
    lavaLand: (v, t) => { osc(t, 110, 0.18, 'sine', 0.22 * v, -60); hiss(t, 0.08, 0.2 * v, 'lowpass', 1200); hiss(t + 0.05, 0.6, 0.14 * v, 'highpass', 3800, 1800); },   // a thud, then the sizzle
    ignite: (v, t) => { hiss(t, 0.5, 0.26 * v, 'bandpass', 900, 2600); osc(t, 70, 0.5, 'sine', 0.22 * v, -30); for (let k = 0; k < 7; k++) hiss(t + 0.15 + k * 0.13, 0.05, 0.12 * v, 'highpass', 3000 + k * 300); },   // the thicket going up: a whoomp, then crackling (race-thicket.js)
    timber: (v, t) => { osc(t, 220, 0.35, 'triangle', 0.07 * v, -120); osc(t + 0.1, 180, 0.3, 'triangle', 0.06 * v, -90); osc(t + 0.5, 60, 0.4, 'sine', 0.3 * v, -30); hiss(t + 0.5, 0.35, 0.22 * v, 'lowpass', 700, 200); },   // burnt trunks creaking, then crashing down across the gap
    hit_thicket: (v, t) => { osc(t, 90, 0.3, 'square', 0.2 * v, -40); hiss(t, 0.4, 0.26 * v, 'bandpass', 1400, 500); for (let k = 0; k < 4; k++) hiss(t + 0.08 + k * 0.07, 0.04, 0.14 * v, 'highpass', 2600); },   // ploughing into branches
    scorch: (v, t) => { hiss(t, 0.45, 0.16 * v, 'highpass', 3200, 1500); osc(t, 90, 0.2, 'sine', 0.1 * v, -30); },
    waveIn: (v, t) => { hiss(t, 1.5, 0.08 * v, 'lowpass', 300, 1100); hiss(t + 1.3, 0.8, 0.16 * v, 'bandpass', 1200, 400); },   // a swell building, then the break
    hit_wave: (v, t) => { hiss(t, 0.5, 0.26 * v, 'bandpass', 2200, 500); osc(t, 140, 0.25, 'sine', 0.16 * v, -60); },
    hit_slag: (v, t) => { boom(t, v * 0.8, 0.7); hiss(t + 0.03, 0.9, 0.2 * v, 'highpass', 4200, 1600); for (let k = 0; k < 4; k++) osc(t + 0.15 + k * 0.12, 260 - k * 40, 0.09, 'triangle', 0.1 * v, 140); },   // the splash, a long sizzle, spitting
    hit_lava: (v, t) => { boom(t, v, 1.1); hiss(t + 0.08, 1.2, 0.16 * v, 'highpass', 3600, 1400); for (let k = 0; k < 6; k++) osc(t + 0.3 + k * 0.25, 160 - k * 18, 0.12, 'sine', 0.14 * v, 120); },   // the splash, the sizzle, then glugging under
    surface: (v, t) => { osc(t, 180, 0.25, 'triangle', 0.14 * v, 260); hiss(t, 0.3, 0.1 * v, 'lowpass', 900, 300); },   // back up out of the lava
    hit_splash: (v, t) => { hiss(t, 0.5, 0.26 * v, 'lowpass', 2400, 300); osc(t, 520, 0.25, 'sine', 0.14 * v, -380); for (let k = 0; k < 4; k++) osc(t + 0.12 + k * 0.07, 900 + k * 260, 0.05, 'sine', 0.06 * v, 300); },
    thunder: (v, t) => { hiss(t, 0.12, 0.22 * v, 'highpass', 2800); osc(t + 0.05, 42, 2.2, 'sine', 0.3 * v, -8); hiss(t + 0.05, 2.4, 0.2 * v, 'lowpass', 260, 90); for (let k = 0; k < 4; k++) hiss(t + 0.4 + k * 0.35, 0.5, 0.1 * v, 'lowpass', 420 - k * 60); },   // a hurricane coming in: a crack, then the long roll
    aquaplane: (v, t) => { hiss(t, 0.55, 0.24 * v, 'bandpass', 1800, 900); hiss(t + 0.05, 0.4, 0.12 * v, 'highpass', 3800); osc(t, 330, 0.3, 'sine', 0.06 * v, -160); },   // a puddle: the hiss of a wave of spray, the tyres floating
    gust: (v, t) => { hiss(t, 1.4, 0.16 * v, 'bandpass', 300, 1400); hiss(t + 0.3, 1.0, 0.08 * v, 'highpass', 2500); },
    // the giant crab: a claw rearing up (clacking, a hiss), slamming down on the road, and a kart swatted by it
    crabRear: (v, t) => { for (let k = 0; k < 6; k++) osc(t + k * 0.055, 1500 - k * 70, 0.03, 'square', 0.07 * v); hiss(t, 0.7, 0.1 * v, 'bandpass', 1200, 3600); osc(t + 0.1, 68, 0.7, 'sawtooth', 0.09 * v, 30); },
    clawSlam: (v, t) => { osc(t, 58, 0.45, 'sine', 0.38 * v, -22); osc(t, 120, 0.2, 'square', 0.14 * v, -70); hiss(t, 0.35, 0.28 * v, 'lowpass', 1500, 140); osc(t, 2300, 0.04, 'square', 0.1 * v); hiss(t, 0.06, 0.14 * v, 'highpass', 4000); },
    hit_claw: (v, t) => { osc(t, 1900, 0.04, 'square', 0.14 * v); osc(t + 0.03, 330, 0.22, 'square', 0.16 * v, -200); hiss(t, 0.16, 0.2 * v, 'bandpass', 1600, 500); arp(t + 0.18, [880, 660], 0.07, 0.08, 'triangle', 0.08 * v); },
    scrape: (v, t) => { hiss(t, 0.32, 0.18 * v, 'bandpass', 2600, 1800); osc(t, 70, 0.3, 'sawtooth', 0.05 * v, 12); },   // grinding along a breakwater
    // the jackpot slot machine: the reels rattling round, each one clunking to a stop, then what it paid
    slotSpin: (v, t) => { for (let k = 0; k < 14; k++) { osc(t + k * 0.07, 1500 + (k % 3) * 220, 0.025, 'square', 0.05 * v); hiss(t + k * 0.07, 0.02, 0.05 * v, 'highpass', 5000); } osc(t, 880, 0.12, 'triangle', 0.12 * v, 440); },
    reel: (v, t) => { osc(t, 180, 0.07, 'square', 0.14 * v, -60); hiss(t, 0.05, 0.12 * v, 'bandpass', 1600); },
    slotWin: (v, t) => { arp(t, [988, 1318], 0.09, 0.18, 'triangle', 0.16 * v); for (let k = 0; k < 4; k++) osc(t + 0.15 + k * 0.05, 2400 + k * 180, 0.06, 'sine', 0.06 * v); },
    jackpot: (v, t) => {   // the bell: a run up the Hijaz scale, a ringing chord and a cascade of coins
      arp(t, [587, 622, 740, 784, 880, 932, 1046, 1175], 0.045, 0.12, 'square', 0.08 * v);
      for (const f of [1175, 1480, 1760]) osc(t + 0.38, f, 0.9, 'triangle', 0.1 * v);
      for (let k = 0; k < 12; k++) osc(t + 0.4 + k * 0.055, 2600 + ((k * 7) % 5) * 260, 0.05, 'sine', 0.07 * v, -200);
    },
    bust: (v, t) => { for (let k = 0; k < 3; k++) osc(t + k * 0.16, 330 - k * 40, 0.16, 'sawtooth', 0.1 * v, -30); osc(t + 0.48, 190, 0.5, 'sawtooth', 0.1 * v, -90); hiss(t + 0.45, 0.4, 0.1 * v, 'lowpass', 900, 200); },   // wah, wah, wah, waaah, and a cough of sand
    // the boulder run: stone grinding as the idol's eyes light up, a boulder thudding out of its jaws, the splash far
    // down in the gorge, and a kart flattened by one
    idolWake: (v, t) => { hiss(t, 1.9, 0.14 * v, 'bandpass', 220, 520); osc(t, 46, 2.0, 'sawtooth', 0.06 * v, 18); osc(t + 1.4, 600, 0.6, 'sine', 0.05 * v, 500); },
    // the drawbridge (race-drawbridge.js): the temple bell before it lifts (a deep strike and its long hum), and a kart
    // knocked back off the lifting leaf (a wooden thunk and a creak)
    bridgeBell: (v, t) => { osc(t, 1100, 0.05, 'triangle', 0.08 * v); osc(t, 147, 2.4, 'sine', 0.2 * v, -4); osc(t, 294, 1.8, 'sine', 0.08 * v, -6); osc(t, 441, 1.1, 'sine', 0.05 * v, -8); osc(t + 0.02, 74, 2.0, 'sine', 0.14 * v); hiss(t, 0.08, 0.08 * v, 'bandpass', 900); },
    hit_drawbridge: (v, t) => { osc(t, 120, 0.22, 'square', 0.2 * v, -60); hiss(t, 0.12, 0.22 * v, 'lowpass', 900, 200); osc(t + 0.06, 220, 0.4, 'sawtooth', 0.05 * v, -90); hiss(t + 0.1, 0.35, 0.06 * v, 'bandpass', 1400, 600); },
    rockOut: (v, t) => { osc(t, 70, 0.5, 'sine', 0.36 * v, -35); hiss(t, 0.35, 0.22 * v, 'lowpass', 600, 120); osc(t + 0.18, 55, 0.4, 'sine', 0.2 * v, -20); hiss(t + 0.2, 1.4, 0.1 * v, 'lowpass', 180, 90); },
    rockSplash: (v, t) => { osc(t, 60, 0.4, 'sine', 0.2 * v, -25); hiss(t + 0.05, 0.9, 0.18 * v, 'lowpass', 2000, 300); for (let k = 0; k < 4; k++) osc(t + 0.25 + k * 0.09, 700 + k * 230, 0.06, 'sine', 0.05 * v, 250); },
    hit_boulder: (v, t) => { osc(t, 55, 0.5, 'square', 0.26 * v, -20); hiss(t, 0.3, 0.3 * v, 'lowpass', 700, 120); osc(t + 0.15, 300, 0.3, 'triangle', 0.1 * v, -220); },
    hit_crash: (v, t) => SOUNDS.hit_boulder(v, t),
    hit_tree: (v, t) => { osc(t, 90, 0.3, 'square', 0.2 * v, -40); hiss(t, 0.5, 0.3 * v, 'highpass', 1800, 6000); hiss(t + 0.08, 0.6, 0.2 * v, 'lowpass', 1500, 300); osc(t + 0.05, 600, 0.12, 'triangle', 0.08 * v, -300); },   // a thump into a pine and its snow sliding off (race-ski.js)
    hit_skifall: (v, t) => SOUNDS.fall(v, t),
    // Fight mode (fight-ui.js plays these from the fight's events): slaps and thumps by weight, a block's tock, a whiff,
    // a launch's whee (a jump pad), a KO, a shove, a stance, a step's scuff, a counter hit's crack, a flank's thwack, a
    // body hitting the floor and the hop back up, panting, the edge tiles crumbling, a heavy's charge,
    // Duke's coffee splatting, Stop the World
    fJab: (v, t) => { osc(t, 620, 0.06, 'square', 0.1 * v, -260); hiss(t, 0.05, 0.16 * v, 'highpass', 2600); },
    fHit: (v, t) => { osc(t, 260, 0.12, 'square', 0.15 * v, -140); hiss(t, 0.09, 0.2 * v, 'bandpass', 1700, 600); osc(t + 0.02, 900, 0.05, 'triangle', 0.06 * v, -300); },
    fHeavy: (v, t) => { osc(t, 120, 0.3, 'sine', 0.34 * v, -70); osc(t, 210, 0.18, 'square', 0.16 * v, -120); hiss(t, 0.22, 0.26 * v, 'lowpass', 1600, 200); hiss(t, 0.05, 0.16 * v, 'highpass', 3500); },
    fBlock: (v, t) => { osc(t, 980, 0.08, 'triangle', 0.16 * v, -320); osc(t, 1470, 0.06, 'sine', 0.06 * v); hiss(t, 0.05, 0.1 * v, 'highpass', 4200); },
    fClash: (v, t) => { osc(t, 1560, 0.26, 'triangle', 0.13 * v, -160); osc(t, 2337, 0.2, 'sine', 0.08 * v, -120); osc(t, 3110, 0.12, 'sine', 0.04 * v); hiss(t, 0.06, 0.16 * v, 'highpass', 3800); },   // two attacks meeting: a bright metal ting
    fArmor: (v, t) => { osc(t, 150, 0.16, 'sine', 0.24 * v, -40); osc(t, 620, 0.18, 'triangle', 0.06 * v, -80); hiss(t, 0.07, 0.1 * v, 'lowpass', 1200); },   // armor soaking a hit: a dull thud with a ring
    fWhiff: (v, t) => hiss(t, 0.13, 0.1 * v, 'bandpass', 900, 2800),
    fLaunch: (v, t) => { osc(t, 300, 0.42, 'triangle', 0.14 * v, 900); hiss(t, 0.4, 0.14 * v, 'bandpass', 700, 3600); },
    fLand: (v, t) => { osc(t, 110, 0.14, 'sine', 0.26 * v, -50); hiss(t, 0.12, 0.16 * v, 'lowpass', 700); },
    fKO: (v, t) => { boom(t, v * 0.8, 0.9); arp(t + 0.12, [784, 659, 523, 392], 0.09, 0.14, 'square', 0.08 * v, -40); },
    fThrow: (v, t) => { hiss(t, 0.3, 0.16 * v, 'bandpass', 500, 2600); osc(t, 200, 0.2, 'sawtooth', 0.08 * v, 260); osc(t + 0.25, 120, 0.14, 'sine', 0.2 * v, -50); },
    fGrab: (v, t) => { osc(t, 520, 0.05, 'square', 0.1 * v, 120); osc(t + 0.06, 700, 0.05, 'square', 0.1 * v, 120); },
    fStep: (v, t) => { hiss(t, 0.09, 0.1 * v, 'bandpass', 1400, 700); osc(t, 160, 0.06, 'sine', 0.08 * v, -60); },   // a quick step: a soft scuff of feet
    fCrit: (v, t) => { osc(t, 1250, 0.05, 'square', 0.12 * v, -700); hiss(t, 0.06, 0.24 * v, 'highpass', 3800); osc(t + 0.015, 210, 0.2, 'square', 0.16 * v, -130); osc(t, 95, 0.26, 'sine', 0.3 * v, -50); },   // a counter hit: a sharp crack over a thump
    fFlank: (v, t) => { hiss(t, 0.1, 0.12 * v, 'bandpass', 600, 2400); osc(t + 0.06, 300, 0.1, 'square', 0.13 * v, -170); hiss(t + 0.06, 0.07, 0.16 * v, 'bandpass', 1900, 700); },   // round the shield: a whoosh into a thwack
    fDown: (v, t) => { osc(t, 82, 0.34, 'sine', 0.36 * v, -36); hiss(t, 0.3, 0.2 * v, 'lowpass', 900, 160); osc(t + 0.13, 120, 0.12, 'sine', 0.14 * v, -40); },   // a body hitting the floor, and a little bounce
    fGetup: (v, t) => { osc(t, 320, 0.12, 'triangle', 0.08 * v, 420); hiss(t, 0.08, 0.06 * v, 'bandpass', 1500); },   // a hop back up
    fPant: (v, t) => { for (let k = 0; k < 2; k++) hiss(t + k * 0.2, 0.13, 0.07 * v, 'bandpass', 1100, 700); },   // gassed: two breaths
    fTile: (v, t) => { hiss(t, 0.5, 0.18 * v, 'lowpass', 900, 160); osc(t, 80, 0.4, 'square', 0.1 * v, -30); for (let k = 0; k < 3; k++) osc(t + 0.1 + k * 0.09, 400 - k * 70, 0.05, 'triangle', 0.06 * v); },
    fCharge: (v, t) => { osc(t, 220, 0.5, 'triangle', 0.08 * v, 440); hiss(t, 0.45, 0.05 * v, 'bandpass', 600, 2400); },
    fSplash: (v, t) => { hiss(t, 0.3, 0.2 * v, 'lowpass', 1800, 300); osc(t, 420, 0.16, 'sine', 0.14 * v, -260); osc(t + 0.1, 300, 0.12, 'sine', 0.08 * v, 200); },
    fToss: (v, t) => { osc(t, 400, 0.18, 'triangle', 0.1 * v, 500); hiss(t, 0.12, 0.08 * v, 'bandpass', 1500, 3000); },
    fSuper: (v, t) => { arp(t, [392, 523, 659, 784, 1046], 0.05, 0.12, 'square', 0.1 * v, 30); for (const f of [784, 1046, 1318]) osc(t + 0.26, f, 0.5, 'triangle', 0.08 * v); hiss(t, 0.3, 0.08 * v, 'highpass', 5000); },
    fFreeze: (v, t) => { osc(t, 1400, 0.6, 'sine', 0.14 * v, -1100); osc(t, 70, 0.5, 'square', 0.1 * v, -20); for (let k = 0; k < 4; k++) osc(t + 0.15 + k * 0.1, 2637, 0.03, 'square', 0.04 * v); },   // the world grinding to a stop, a clock ticking
    fReady: (v, t) => { arp(t, [1046, 1318, 1568, 2093], 0.045, 0.16, 'triangle', 0.07 * v); osc(t + 0.15, 2637, 0.35, 'sine', 0.035 * v); },   // the super meter full: a sparkly little chime
    fCutin: (v, t) => { hiss(t, 0.22, 0.16 * v, 'bandpass', 800, 4200); osc(t, 160, 0.3, 'sawtooth', 0.07 * v, 520); osc(t + 0.12, 90, 0.35, 'sine', 0.3 * v, -45); osc(t + 0.12, 180, 0.18, 'square', 0.08 * v, -90); },   // a super's cut-in: a whoosh into a punch
    fPop: (v, t) => { osc(t, 1200, 0.12, 'sine', 0.14 * v, -800); hiss(t, 0.08, 0.12 * v, 'highpass', 4200); },
    // the fight's big beats (fight-ui.js): a fighter picked on the setup screen (a quick swish into a thump), the round
    // intro's two portraits slamming in (a whoosh and a low metal clang), each count of 3-2-1 (a taiko-ish drum), the
    // start (a gong-like crash), a KO (a sub drop, a crack and a long echoing tail), a round won (a bright little
    // two-step) and the match won (a short brassy fanfare with a sparkle on top)
    fPick: (v, t) => { hiss(t, 0.12, 0.1 * v, 'bandpass', 900, 3800); osc(t + 0.08, 150, 0.16, 'sine', 0.24 * v, -60); osc(t + 0.08, 780, 0.08, 'triangle', 0.06 * v, 200); },
    fVs: (v, t) => { hiss(t, 0.3, 0.16 * v, 'bandpass', 500, 3600); osc(t + 0.24, 98, 0.5, 'sine', 0.3 * v, -30); osc(t + 0.24, 392, 0.7, 'triangle', 0.07 * v, -12); osc(t + 0.24, 587, 0.55, 'sine', 0.05 * v, -10); hiss(t + 0.24, 0.12, 0.14 * v, 'highpass', 3000); },
    fCount: (v, t) => { osc(t, 140, 0.24, 'sine', 0.34 * v, -60); hiss(t, 0.1, 0.16 * v, 'lowpass', 900, 200); osc(t, 520, 0.1, 'triangle', 0.06 * v, -120); },
    fGo: (v, t) => { osc(t, 90, 0.6, 'sine', 0.34 * v, -30); for (const f of [523, 659, 784]) osc(t, f, 0.7, 'triangle', 0.07 * v); osc(t, 1046, 0.5, 'square', 0.04 * v); hiss(t, 0.9, 0.16 * v, 'highpass', 2600, 7000); hiss(t, 0.3, 0.14 * v, 'lowpass', 1200, 200); },
    fKOHit: (v, t) => {
      osc(t, 160, 0.9, 'sine', 0.42 * v, -120); osc(t, 70, 1.1, 'sine', 0.3 * v, -30); hiss(t, 0.06, 0.3 * v, 'highpass', 2500); hiss(t, 0.5, 0.3 * v, 'lowpass', 2400, 120);
      for (let k = 1; k < 4; k++) { hiss(t + k * 0.17, 0.3, 0.12 * v / k, 'bandpass', 900, 300); osc(t + k * 0.17, 130, 0.3, 'sine', 0.12 * v / k, -60); }   // the echo off the stands
    },
    fRoundWin: (v, t) => { arp(t, [659, 988], 0.1, 0.16, 'square', 0.08 * v); arp(t, [659, 988], 0.1, 0.18, 'triangle', 0.12 * v); osc(t + 0.2, 1318, 0.4, 'triangle', 0.1 * v); for (let k = 0; k < 3; k++) osc(t + 0.26 + k * 0.06, 2093 + k * 330, 0.1, 'sine', 0.04 * v); },
    fVictory: (v, t) => {
      const ch = (at, fs, d, vol) => fs.forEach(f => { osc(t + at, f, d, 'sawtooth', vol * 0.35 * v); osc(t + at, f, d, 'triangle', vol * v); });
      ch(0, [392, 494, 587], 0.16, 0.07); ch(0.18, [392, 494, 587], 0.12, 0.06); ch(0.32, [523, 659, 784], 0.75, 0.08);
      osc(t + 0.32, 131, 0.8, 'sine', 0.22 * v, -10); hiss(t + 0.32, 0.6, 0.06 * v, 'highpass', 6000);
      for (let k = 0; k < 7; k++) osc(t + 0.42 + k * 0.06, 1568 + k * 250, 0.12, 'sine', 0.045 * v);
    },
    // the other eight's kits (fight-kits.js): Gopher digging in and popping up, Ferris's claws catching a hit, Pyth's
    // coil (a hiss and a squeeze) and antigravity (an airy rise), Octo's tentacle (a wet whip) and Merge Conflict's
    // whirl, Docky's containers (a hollow steel boom) and Isolation (a container's clang), Swifty's dive (a rising
    // whoosh), Cpp's blink (a two-note bleep) and Undefined Behavior (glitchy blips), Bugdroid's zap (a buzzing crackle)
    // and his field's jolt, Ferris's Ownership (a chain and a lock clicking shut)
    fDig: (v, t) => { hiss(t, 0.35, 0.2 * v, 'lowpass', 700, 200); osc(t, 90, 0.2, 'sine', 0.2 * v, -30); for (let k = 0; k < 3; k++) hiss(t + 0.06 + k * 0.07, 0.05, 0.08 * v, 'bandpass', 1200 - k * 200); },
    fPopup: (v, t) => { osc(t, 140, 0.16, 'sine', 0.26 * v, 160); hiss(t, 0.3, 0.2 * v, 'lowpass', 1600, 300); osc(t + 0.02, 520, 0.08, 'triangle', 0.08 * v, 300); },
    fCounter: (v, t) => { osc(t, 1900, 0.05, 'triangle', 0.16 * v, -600); osc(t + 0.05, 1500, 0.06, 'triangle', 0.14 * v, -500); osc(t, 880, 0.3, 'sine', 0.07 * v, -120); hiss(t, 0.05, 0.14 * v, 'highpass', 5000); },
    fCoil: (v, t) => { hiss(t, 0.5, 0.11 * v, 'highpass', 4800, 6500); osc(t + 0.1, 160, 0.4, 'sawtooth', 0.04 * v, -40); hiss(t + 0.15, 0.3, 0.06 * v, 'bandpass', 500, 300); },
    fLift: (v, t) => { arp(t, [523, 659, 784, 1046, 1318], 0.07, 0.3, 'sine', 0.06 * v); hiss(t, 0.6, 0.06 * v, 'bandpass', 900, 3200); },
    fWhip: (v, t) => { hiss(t, 0.16, 0.16 * v, 'bandpass', 600, 3000); osc(t + 0.1, 180, 0.12, 'sine', 0.16 * v, -90); osc(t + 0.12, 360, 0.06, 'sine', 0.06 * v, 200); },
    fSpin: (v, t) => { for (let k = 0; k < 6; k++) hiss(t + k * 0.15, 0.13, 0.11 * v, 'bandpass', 700, 1900); osc(t, 220, 0.9, 'triangle', 0.03 * v, 120); },
    fCrate: (v, t) => { osc(t, 70, 0.45, 'sine', 0.3 * v, -25); osc(t, 240, 0.5, 'triangle', 0.07 * v, -40); osc(t, 410, 0.35, 'sine', 0.04 * v, -20); hiss(t, 0.25, 0.2 * v, 'lowpass', 1000, 200); },
    fIso: (v, t) => { osc(t, 310, 0.35, 'triangle', 0.12 * v, -20); osc(t, 465, 0.3, 'sine', 0.06 * v); hiss(t, 0.06, 0.1 * v, 'bandpass', 2400); },
    fDive: (v, t) => { hiss(t, 0.28, 0.14 * v, 'bandpass', 900, 4200); osc(t, 500, 0.2, 'sine', 0.05 * v, 700); },
    fBlink: (v, t) => { osc(t, 1318, 0.05, 'square', 0.06 * v); osc(t + 0.06, 1976, 0.07, 'square', 0.06 * v); hiss(t, 0.1, 0.06 * v, 'highpass', 5000); },
    fGlitch: (v, t) => { for (let k = 0; k < 7; k++) osc(t + k * 0.04, [220, 1760, 440, 3520, 330, 2637, 165][k], 0.03, 'square', 0.06 * v); hiss(t, 0.3, 0.06 * v, 'highpass', 3000); },
    fZap: (v, t) => { osc(t, 110, 0.22, 'sawtooth', 0.09 * v, 30); osc(t, 1760, 0.12, 'square', 0.03 * v, -900); hiss(t, 0.22, 0.14 * v, 'bandpass', 3200, 1400); for (let k = 0; k < 3; k++) hiss(t + 0.03 + k * 0.05, 0.02, 0.12 * v, 'highpass', 6000); },
    fJolt: (v, t) => { SOUNDS.fZap(v, t); osc(t + 0.05, 80, 0.3, 'square', 0.06 * v, -20); },
    fField: (v, t) => { osc(t, 60, 0.9, 'sawtooth', 0.05 * v, 0); osc(t, 120, 0.9, 'sine', 0.06 * v, 0); hiss(t, 0.7, 0.07 * v, 'bandpass', 2200, 3600); },
    // Tux's and Duke's three moves (2026-10-23): the torpedo's launch (a wet whoosh off a thunk), its wall bounce (a
    // boing), flat on his belly (a soft flop); the iceberg's leap (a rising whoosh) and its landing (a deep thud and ice
    // cracking); fork() (three pops) and a penguin bursting into snow; the portal (a warp down, then up as he pops out);
    // the snap (a crisp click) and the world stopping (fFreeze above), the thaw (ice cracking); the geyser's rumble and its
    // eruption (a boom and a long hiss of steam)
    fTorpedo: (v, t) => { osc(t, 130, 0.12, 'sine', 0.26 * v, -50); hiss(t + 0.03, 0.45, 0.18 * v, 'bandpass', 2400, 600); osc(t + 0.04, 520, 0.3, 'triangle', 0.06 * v, -300); },
    fBounce: (v, t) => { osc(t, 180, 0.28, 'sine', 0.22 * v, 260); osc(t, 360, 0.2, 'triangle', 0.08 * v, 300); hiss(t, 0.08, 0.14 * v, 'highpass', 3000); },
    fBelly: (v, t) => { osc(t, 96, 0.2, 'sine', 0.26 * v, -30); hiss(t, 0.16, 0.14 * v, 'lowpass', 900, 200); },
    fLeap: (v, t) => { osc(t, 180, 0.32, 'triangle', 0.1 * v, 900); hiss(t, 0.36, 0.16 * v, 'bandpass', 500, 4200); },
    fThud: (v, t) => { boom(t, v * 0.9, 1.1); osc(t, 55, 0.6, 'sine', 0.34 * v, -18); for (let k = 0; k < 4; k++) osc(t + 0.05 + k * 0.045, 2600 - k * 380, 0.04, 'square', 0.05 * v, -500); hiss(t + 0.04, 0.35, 0.12 * v, 'highpass', 4200, 1800); },
    fFork: (v, t) => { for (let k = 0; k < 3; k++) { osc(t + k * 0.12, 700 + k * 180, 0.09, 'sine', 0.14 * v, 600); hiss(t + k * 0.12, 0.06, 0.08 * v, 'highpass', 4000); } },
    fPeng: (v, t) => { hiss(t, 0.16, 0.16 * v, 'lowpass', 2400, 600); osc(t, 900, 0.08, 'sine', 0.1 * v, -600); },
    fWarp: (v, t) => { osc(t, 900, 0.32, 'sine', 0.1 * v, -760); osc(t, 1350, 0.28, 'triangle', 0.05 * v, -1100); hiss(t, 0.3, 0.08 * v, 'bandpass', 3000, 600); },
    fPopout: (v, t) => { osc(t, 200, 0.16, 'sine', 0.14 * v, 900); osc(t, 1200, 0.1, 'triangle', 0.06 * v, 800); hiss(t, 0.12, 0.12 * v, 'bandpass', 1200, 4000); },
    fSnap: (v, t) => { hiss(t, 0.03, 0.34 * v, 'highpass', 3200); osc(t, 2400, 0.03, 'square', 0.1 * v, -1500); osc(t + 0.01, 1200, 0.06, 'sine', 0.06 * v, -400); },
    fRing: (v, t) => { osc(t, 220, 0.55, 'sine', 0.08 * v, -110); osc(t, 330, 0.55, 'triangle', 0.04 * v, -165); for (let k = 0; k < 5; k++) osc(t + k * 0.11, 2637, 0.025, 'square', 0.03 * v); },
    fThaw: (v, t) => { for (let k = 0; k < 6; k++) osc(t + k * 0.03, [3100, 1900, 2700, 1500, 2300, 1200][k], 0.04, 'square', 0.05 * v, -600); hiss(t, 0.22, 0.14 * v, 'highpass', 2800, 900); },
    fRumble: (v, t) => { osc(t, 48, 0.45, 'sawtooth', 0.09 * v, 10); hiss(t, 0.45, 0.14 * v, 'lowpass', 500, 900); for (let k = 0; k < 4; k++) osc(t + 0.05 + k * 0.09, 300 + k * 90, 0.05, 'sine', 0.05 * v, 400); },
    fErupt: (v, t) => { boom(t, v * 0.8, 0.9); hiss(t, 0.9, 0.22 * v, 'bandpass', 1800, 5000); hiss(t + 0.1, 0.8, 0.1 * v, 'highpass', 5000); osc(t, 140, 0.4, 'sine', 0.2 * v, 260); },
    fOwn: (v, t) => { for (let k = 0; k < 5; k++) osc(t + k * 0.035, 2600 - k * 90, 0.03, 'triangle', 0.05 * v); osc(t + 0.25, 1400, 0.04, 'square', 0.1 * v); osc(t + 0.28, 700, 0.08, 'triangle', 0.1 * v, -200); },
    hit_skicrash: (v, t) => { SOUNDS.hit_boulder(v * 0.7, t); hiss(t + 0.05, 0.6, 0.22 * v, 'highpass', 1500, 5000); },   // a bad ski-jump landing in the snow   // off the Ridge's edge (race-ski.js)   // a crash landing past a cliff's landing slope (race-cliff.js)
    // the clocktower (race-clock.js): the hour striking (a great bronze bell: the strike, its hum and a ring of partials), and
    // a kart swatted by the minute hand (a clang of brass) or the pendulum's bob (a deeper bong)
    chime: (v, t) => { osc(t, 2200, 0.05, 'triangle', 0.1 * v); hiss(t, 0.06, 0.1 * v, 'bandpass', 1800); for (const [f, d, a] of [[98, 3.2, 0.22], [196, 2.8, 0.2], [233, 2.2, 0.1], [294, 1.8, 0.09], [392, 1.4, 0.07], [523, 0.9, 0.05], [655, 0.7, 0.04]]) osc(t, f, d, 'sine', a * v, -f * 0.004); osc(t + 0.01, 197.5, 2.6, 'sine', 0.1 * v); },
    hit_hand: (v, t) => { osc(t, 1480, 0.5, 'triangle', 0.14 * v, -60); osc(t, 2210, 0.35, 'sine', 0.1 * v, -90); osc(t, 330, 0.25, 'square', 0.12 * v, -140); hiss(t, 0.14, 0.2 * v, 'bandpass', 2600, 700); osc(t + 0.02, 3100, 0.2, 'sine', 0.05 * v); },
    hit_pendulum: (v, t) => { osc(t, 220, 0.7, 'sine', 0.24 * v, -40); osc(t, 660, 0.45, 'triangle', 0.1 * v, -60); osc(t, 1340, 0.3, 'sine', 0.07 * v); hiss(t, 0.18, 0.22 * v, 'lowpass', 1600, 200); osc(t, 70, 0.3, 'square', 0.14 * v, -20); },
    jetSpool: (v, t) => { osc(t, 140, 2.2, 'sawtooth', 0.05 * v, 420); osc(t + 0.3, 900, 1.9, 'sine', 0.04 * v, 1700); hiss(t, 2.2, 0.08 * v, 'bandpass', 600, 2400); },   // a jet's engines running up at the hold (race-jets.js)
    jetRoar: (v, t) => { hiss(t, 3.2, 0.2 * v, 'lowpass', 900, 220); hiss(t, 2.4, 0.08 * v, 'highpass', 3000); osc(t, 62, 3, 'sawtooth', 0.07 * v, -18); osc(t, 2600, 1.6, 'sine', 0.025 * v, -1400); },   // ...and the roar as it goes
    blast: (v, t) => { hiss(t, 1.1, 0.2 * v, 'bandpass', 500, 1600); hiss(t + 0.1, 0.8, 0.08 * v, 'highpass', 2800); },   // caught in a jet's blast
    hit_burnout: (v, t) => { boom(t, v, 0.8); hiss(t, 1.1, 0.2 * v, 'bandpass', 700, 260); osc(t, 120, 0.5, 'sawtooth', 0.09 * v, -70); },   // an engine blowing out at the start
    hit_jet: (v, t) => { boom(t, v, 1.1); osc(t, 1500, 0.4, 'square', 0.08 * v, -1100); hiss(t, 0.5, 0.15 * v, 'highpass', 3500, 900); },   // bowled over by a jet
    // the rockets to the Moon (race-rocket.js): a klaxon and a chime (unused since the Launch Row), taken aboard, the engines
    // lighting, the long roar of a liftoff, down on the Moon, a capsule's burn off the Moon and its chutes cracking open, a kart off a bay's buffer
    padClose: (v, t) => { for (let k = 0; k < 2; k++) { osc(t + k * 0.32, 392, 0.26, 'square', 0.08 * v); osc(t + k * 0.32, 311, 0.26, 'sawtooth', 0.05 * v); } },
    padOpen: (v, t) => arp(t, [659, 880, 1175], 0.07, 0.18, 'triangle', 0.09 * v),
    board: (v, t) => { osc(t, 180, 0.18, 'square', 0.1 * v, 120); hiss(t, 0.25, 0.08 * v, 'bandpass', 900, 2600); osc(t + 0.14, 1046, 0.1, 'triangle', 0.06 * v); },
    liftoff: (v, t) => { hiss(t, 4.2, 0.26 * v, 'lowpass', 520, 160); hiss(t, 2.4, 0.1 * v, 'bandpass', 1400, 300); osc(t, 48, 4, 'sawtooth', 0.12 * v, -12); osc(t, 96, 3.2, 'sine', 0.14 * v, -30); boom(t, 0.6 * v, 1.3); },
    engines: (v, t) => { hiss(t, 1.1, 0.14 * v, 'bandpass', 400, 1800); osc(t, 55, 1.1, 'sawtooth', 0.08 * v, 30); arp(t, [523, 659], 0.12, 0.08, 'square', 0.05 * v); },   // the engines lighting on the pad
    touchdown: (v, t) => { osc(t, 70, 0.4, 'sine', 0.2 * v, -30); hiss(t, 0.7, 0.14 * v, 'lowpass', 900, 200); osc(t + 0.05, 330, 0.12, 'triangle', 0.06 * v); },   // down on the Moon
    capsule: (v, t) => { hiss(t, 1.2, 0.16 * v, 'bandpass', 700, 2600); osc(t, 70, 1, 'sawtooth', 0.08 * v, 40); },
    chute: (v, t) => { hiss(t, 0.08, 0.2 * v, 'highpass', 2500); osc(t, 260, 0.12, 'square', 0.08 * v, -120); for (let k = 0; k < 5; k++) hiss(t + 0.1 + k * 0.08, 0.06, 0.05 * v, 'bandpass', 1200 + k * 120); },
    hit_zap: (v, t) => { osc(t, 1800, 0.18, 'sawtooth', 0.1 * v, -1500); osc(t, 110, 0.4, 'square', 0.16 * v, -70); hiss(t, 0.3, 0.2 * v, 'bandpass', 3200, 800); },   // grabbed by the mass driver's red (race-driver.js)
    launchRail: (v, t) => { osc(t, 180, 0.5, 'sawtooth', 0.12 * v, 1400); osc(t + 0.05, 360, 0.45, 'triangle', 0.1 * v, 2200); hiss(t, 0.6, 0.18 * v, 'bandpass', 900, 5200); },   // launched down the mass driver (race-driver.js)
    hit_pad: (v, t) => { osc(t, 1240, 0.3, 'triangle', 0.12 * v, -200); osc(t, 160, 0.25, 'square', 0.16 * v, -80); hiss(t, 0.15, 0.18 * v, 'lowpass', 1400, 300); },
  };
  // ----- instruments
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const tone = (t, m, dur, type, vol, cut = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(hz(m), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o; if (cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); out = f; }
    out.connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (t, dur, vol, type, freq) => {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); src.connect(f).connect(g).connect(musicBus); src.start(t); src.stop(t + dur + 0.02);
  };
  const kick = (t, vol) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.2); };
  // ----- songs & per-map music
  const PROGS = [[0, 7, 9, 5], [0, 9, 5, 7], [9, 5, 0, 7], [0, 5, 9, 7], [5, 7, 0, 0], [0, 4, 5, 7]];
  const RHY = [[1,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,0], [1,0,0,1, 0,0,1,0, 1,0,1,0, 1,0,0,0], [1,0,1,1, 0,1,0,1, 1,0,0,0, 1,0,1,0], [1,0,0,0, 1,0,1,0, 1,1,0,1, 0,0,1,0], [0,0,1,0, 1,0,1,0, 0,1,1,0, 1,0,0,0]];
  const PENT = [0, 2, 4, 7, 9];

  // Map-specific musical profiles giving each circuit a distinctive theme, tempo, and atmosphere
  const MAP_THEMES = [
    { bpm: 138, lead: 'square', key: 57, prog: [9, 5, 7, 9], scale: [0, 3, 5, 7, 10], style: 'crab' },       // 0: Crab Harbor (a boss march in a minor key, claws clacking on the offbeats)
    { bpm: 128, lead: 'sawtooth', key: 62, prog: [0, 1, 0, 1], scale: [0, 1, 4, 5, 7, 8, 10], style: 'casino' },   // 1: Pharaoh's Jackpot (Hijaz scale over a I-bII vamp, a darbuka and casino bells)
    { bpm: 150, lead: 'square', key: 58, prog: [9, 5, 0, 7], scale: [0, 3, 5, 7, 10], style: 'rock' },       // 2: Duke's Volcano
    { bpm: 140, lead: 'sawtooth', key: 60, prog: [0, 7, 9, 5], scale: [0, 2, 4, 7, 9], style: 'techno' },     // 3: (Silicon Circuit's; Moonshot has its own, by name)
    { bpm: 124, lead: 'triangle', key: 62, prog: [0, 9, 5, 7], scale: [0, 2, 5, 7, 9], style: 'sakura' },     // 4: Sakura Stack (Yo scale)
    { bpm: 135, lead: 'sawtooth', key: 58, prog: [9, 5, 0, 7], scale: [0, 2, 3, 7, 8], style: 'dune' },       // 5: Pyth Plateau
    { bpm: 130, lead: 'square', key: 60, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], style: 'funk' },        // 6: Merge Bay
    { bpm: 144, lead: 'square', key: 62, prog: [0, 7, 9, 5], scale: [0, 2, 4, 7, 9], style: 'carnival' },    // 7: Kernel Pretzel
    { bpm: 152, lead: 'sawtooth', key: 58, prog: [9, 5, 0, 7], scale: [0, 2, 4, 7, 10], style: 'rush' },      // 8: Pipeline Pass
    { bpm: 138, lead: 'square', key: 62, prog: [0, 7, 9, 5], scale: [0, 3, 5, 7, 10], style: 'techno' },     // 9: Heap Space
    { bpm: 148, lead: 'sawtooth', key: 57, prog: [9, 5, 0, 7], scale: [0, 3, 5, 7, 10], style: 'rock' },      // 10: Assembly Line
    { bpm: 142, lead: 'sawtooth', key: 58, prog: [0, 5, 9, 7], scale: [0, 2, 4, 7, 9], style: 'train' },     // 11: Cron Canyon
    { bpm: 148, lead: 'triangle', key: 63, prog: [9, 5, 0, 7], scale: [0, 2, 3, 7, 10], style: 'rush' },     // 12: Cryo Caldera
    { bpm: 146, lead: 'triangle', key: 61, prog: [9, 5, 0, 7], scale: [0, 2, 3, 7, 9], style: 'ocean' },     // 13: Async Atoll (steel drums in a minor key: a storm coming in)
    { bpm: 140, lead: 'triangle', key: 57, prog: [9, 5, 7, 0], scale: [0, 3, 5, 7, 10], style: 'jungle' }    // 14: Ruby Ruins (marimba over tom-toms: an adventure film's temple run)
  ];

  // by name: tracks added after the numbered list above
  const NAMED_THEMES = {
    'Race Condition': { bpm: 132, lead: 'triangle', key: 60, prog: [9, 5, 0, 7], scale: [0, 2, 3, 5, 7, 8, 10], style: 'clock' },   // a clockwork waltz-march: ticking woodblocks, a ratchet winding
    'Recursion Ridge': { bpm: 154, lead: 'triangle', key: 64, prog: [0, 5, 9, 7], scale: [0, 2, 4, 7, 9], style: 'rush' },   // a bright downhill rush in a major key
    'Neon Overflow': { bpm: 126, lead: 'sawtooth', key: 57, prog: [9, 5, 7, 0], scale: [0, 2, 3, 7, 8], style: 'techno' },   // night-city synths in a dark minor
    'Moonshot': { bpm: 136, lead: 'triangle', key: 62, prog: [0, 5, 9, 7], scale: [0, 2, 4, 7, 9], style: 'space' },   // a bright, heroic countdown: a sequencer arpeggio, a bouncing bass, a sonar ping
    'Gradient Descent': { bpm: 152, lead: 'triangle', key: 62, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], style: 'bounce' },   // a bright, bouncy downhill run in a major key
    'Gateway 8080': { bpm: 134, lead: 'square', key: 65, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], style: 'funk' },   // a sunny, bouncy departure-lounge groove
  };
  // the menu's second tune (2026-10-23, the user: the old music plus "1 good addition that's actually good and sounds different"): a sunny groove in the race music's own style, its own key and melody; the title picks it or the old one at random
  const MENU_ALT = { bpm: 116, lead: 'triangle', key: 63, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], style: 'funk' };
  const FIGHT_THEME = { bpm: 132, lead: 'sawtooth', key: 53, prog: [9, 5, 9, 4], scale: [0, 2, 4, 5, 8, 9, 11], style: 'fight', dom: true };   // Fight mode: D harmonic minor (Dm Bb Dm A), taiko drums, a pounding octave bass, a dark brass pad and orchestral hits
  function makeSong(id, seed, o = {}) {
    const isMenu = id === 'menu', isResults = id === 'results', isFight = id === 'fight';
    const trackNum = isMenu || isResults || isFight ? -1 : (+String(id).replace(/\D/g, '') || 0);
    let theme = o.theme || (isFight ? FIGHT_THEME : trackNum >= 0 && (NAMED_THEMES[TRACKS[trackNum] && TRACKS[trackNum].name] || MAP_THEMES[trackNum % MAP_THEMES.length]) || null);

    const rng = mulberry(seed * 7919 + 13), pick = a => a[Math.floor(rng() * a.length)];
    const key = o.key || (theme ? theme.key : 57 + pick([0, 2, 3, 5, 7, 8, 10]));
    const prog = o.prog || (theme ? theme.prog : pick(PROGS));
    const scale = o.scale || (theme ? theme.scale : PENT);
    const bpm = o.bpm || (theme ? theme.bpm : 128 + Math.floor(rng() * 24));
    const lead = o.lead || (theme ? theme.lead : (o.calm ? 'triangle' : pick(['square', 'square', 'triangle'])));
    const style = theme ? theme.style : 'standard';

    const notes = []; for (let oc = 0; oc < 3; oc++) for (const p of scale) notes.push(key + oc * 12 + p);
    const dom = !!(theme && theme.dom), chordOf = bar => { const r = prog[bar % 4], minor = r === 9 || r === 2 || (r === 4 && !dom); return [r, r + (minor ? 3 : 4), r + 7].map(x => ((key + x) % 12)); };   // (dom: the iii is a major V, the harmonic minor's pull home)
    const contour = n => { const c = [0]; for (let i = 1; i < n; i++) c.push(c[i - 1] + pick([-2, -1, -1, 1, 1, 2, 0, 1, -1, 3, -3])); return c; };
    const rA = [pick(RHY), pick(RHY)], rB = [pick(RHY), [1,0,0,0, 1,0,1,0, 1,0,0,0, 0,0,0,0]];
    const onsets = r => r.flatMap((bar, b) => bar.map((v, i) => v ? b * 16 + i : -1)).filter(i => i >= 0);
    const oA = onsets(rA), oB = onsets(rB), cA = contour(oA.length), cB = contour(oB.length);
    const mel = new Array(128).fill(null);
    const realize = (startBar, on, con, land) => {
      const root = chordOf(startBar)[0]; let base = notes.findIndex(n => n >= key + 7 && n % 12 === root); if (base < 0) base = 5;
      on.forEach((st, k) => {
        let idx = clamp(base + con[k], 0, notes.length - 1); const bar = startBar + (st >> 4), ch = chordOf(bar);
        if (st % 4 === 0 && !ch.includes(notes[idx] % 12)) { for (const d of [1, -1, 2, -2]) { const j = clamp(idx + d, 0, notes.length - 1); if (ch.includes(notes[j] % 12)) { idx = j; break; } } }
        if (land && k === on.length - 1) idx = notes.findIndex(n => n >= key + 12 && n % 12 === key % 12);
        const len = k < on.length - 1 ? Math.min(on[k + 1] - st, 4) : (land ? 12 : 3);
        mel[startBar * 16 + st] = [notes[idx], len];
      });
    };
    realize(0, oA, cA); realize(2, oA, cA); realize(4, oA, cA); realize(6, oB, cB, true);
    return { id, bpm, key, prog, mel, chordOf, calm: !!o.calm, lead, style, kick6: rng() < 0.5, hats16: rng() < 0.4 };
  }

  function play(s, st, t, sd) {
    const i = st % 128, bar = i >> 4, b = i % 16, ch = s.chordOf(bar), rootPc = (s.key + s.prog[bar % 4]) % 12;
    const m = s.mel[i];
    if (m) {
      const cut = s.lead === 'square' ? 2400 : s.lead === 'sawtooth' ? 1800 : 0;
      tone(t, m[0], m[1] * sd * 0.95, s.lead, s.calm ? 0.08 : 0.075, cut);
    }
    const bass = 36 + ((rootPc - 0 + 12) % 12) + (rootPc < 4 ? 12 : 0);

    // Dynamic style-specific bassline and percussion
    if (s.style === 'techno') {
      // 16th rolling synth bass
      tone(t, bass + (b % 4 === 2 ? 12 : 0), sd * 0.85, 'sawtooth', 0.12, 1200);
      if (b % 4 === 0) kick(t, 0.35);
      if (b % 4 === 2) noise(t, 0.04, 0.08, 'highpass', 7000);
      if (b === 4 || b === 12) { noise(t, 0.11, 0.14, 'bandpass', 2100); tone(t, 55, 0.07, 'triangle', 0.09); }
    } else if (s.style === 'train') {
      // locomotive chug-chug rhythm
      if (b % 2 === 0) noise(t, 0.06, 0.07, 'bandpass', 1200 + (b % 4) * 200);
      if (b === 0 || b === 8) kick(t, 0.28);
      if (b === 0 || b === 6 || b === 11) tone(t, bass, sd * 1.5, 'triangle', 0.15);
    } else if (s.style === 'rock' || s.style === 'rush') {
      // driving rock 4-on-the-floor
      if (b % 4 === 0) kick(t, 0.36);
      if (b === 4 || b === 12) { noise(t, 0.14, 0.16, 'bandpass', 2200); tone(t, 65, 0.08, 'triangle', 0.1); }
      if (b % 2 === 0) noise(t, 0.04, 0.05, 'highpass', 8000);
      if (b === 0 || b === 3 || b === 6 || b === 10 || b === 12) tone(t, bass, sd * 1.2, 'sawtooth', 0.14, 900);
    } else if (s.style === 'casino') {
      // maqsum on the darbuka (doum . tek . . . tek . doum . . . tek . . .), a walking bass, finger cymbals, and a
      // slot machine's bells twinkling at the end of every other bar
      if (b === 0 || b === 8) kick(t, 0.3);
      if (b === 2 || b === 6 || b === 12) noise(t, 0.05, 0.11, 'bandpass', 3200);
      if (b === 14 || b === 15) noise(t, 0.03, 0.05, 'bandpass', 3800);
      if (b % 4 === 3) noise(t, 0.12, 0.03, 'highpass', 9000);
      if (b === 0 || b === 3 || b === 6 || b === 8 || b === 11) tone(t, bass + (b === 11 ? 1 : b === 6 ? 7 : 0), sd * 1.4, 'triangle', 0.15);
      if (bar % 2 === 1 && b >= 13) tone(t, 86 + (b - 13) * 3, sd * 0.9, 'triangle', 0.05);
    } else if (s.style === 'jungle') {
      // tom-toms rolling round the bar, a shaker on the off-beats and a low, plucked bass
      if (b === 0 || b === 10) kick(t, 0.32);
      if (b === 3 || b === 6 || b === 13 || b === 14) tone(t, b > 12 ? 43 : 47, 0.16, 'sine', 0.2);   // toms (low, then lower)
      if (b === 4 || b === 12) noise(t, 0.09, 0.1, 'bandpass', 1500);
      if (b % 2 === 1) noise(t, 0.05, 0.035, 'bandpass', 6000);
      if (b === 0 || b === 7 || b === 10) tone(t, bass, sd * 1.4, 'triangle', 0.16, 700);
    } else if (s.style === 'clock') {
      // a clockwork march: tick (high woodblock) and tock (low) on the eighths, a kick on 1 and 3, the ratchet winding at the
      // end of every fourth bar, a staccato plucked bass
      if (b % 4 === 0) noise(t, 0.03, 0.12, 'bandpass', 3200); else if (b % 4 === 2) noise(t, 0.03, 0.1, 'bandpass', 1700);
      if (b === 0 || b === 8) kick(t, 0.3);
      if (bar % 4 === 3 && b >= 12) noise(t, 0.02, 0.06, 'highpass', 5200);
      if (b === 0 || b === 3 || b === 8 || b === 11) tone(t, bass + (b === 11 ? 7 : 0), sd * 0.7, 'triangle', 0.15, 900);
    } else if (s.style === 'space') {
      // a countdown pulse: a kick on 1 and 3, a snare on 4, a little sequencer arpeggio of the chord on the 16ths, an
      // octave-bouncing bass, and a sonar ping at the end of every other bar
      if (b === 0 || b === 8) kick(t, 0.32);
      if (b === 12) noise(t, 0.12, 0.12, 'bandpass', 2000);
      if (b % 2 === 1) noise(t, 0.02, 0.03, 'highpass', 9000);
      tone(t, 72 + ((ch[b % 3] - 72 % 12 + 12) % 12) + (b % 6 >= 3 ? 12 : 0), sd * 0.6, 'triangle', 0.03);
      if (b % 4 === 0) tone(t, bass + (b % 8 === 4 ? 12 : 0), sd * 2.2, 'sawtooth', 0.12, 700);
      if (bar % 2 === 1 && b === 14) tone(t, 96, sd * 6, 'sine', 0.045);
    } else if (s.style === 'crab') {
      // a stomping boss march: kick on every beat, a snare on 2 and 4, claw clacks on the offbeats, a staccato bass
      if (b % 4 === 0) kick(t, 0.36);
      if (b === 4 || b === 12) { noise(t, 0.12, 0.15, 'bandpass', 1900); tone(t, 52, 0.07, 'triangle', 0.09); }
      if (b % 4 === 3 || b === 6) { noise(t, 0.025, 0.1, 'bandpass', 3600); noise(t + sd * 0.5, 0.02, 0.06, 'bandpass', 4200); }
      if (b % 2 === 0) tone(t, bass + (b === 6 || b === 14 ? 7 : 0), sd * 0.8, 'square', 0.09, 650);
    } else if (s.style === 'fight') {
      // a dark, heavy brawl: taiko on 1 and the "and" of 2, booming toms into 3, a big gated snare on 2 and 4, a pounding
      // octave bass on the eighths, a low brass/choir pad held under each bar, an orchestral hit every four bars, ticking
      // hats for tension and a rising swell into every eighth bar
      if (b === 0 || b === 6) { kick(t, 0.42); tone(t, 38, 0.32, 'sine', 0.22); }
      if (b === 10 || b === 11) tone(t, b === 10 ? 45 : 41, 0.22, 'sine', 0.2);
      if (b === 4 || b === 12) { noise(t, 0.22, 0.17, 'bandpass', 1500); noise(t, 0.08, 0.1, 'highpass', 5000); tone(t, 50, 0.1, 'triangle', 0.1); }
      if (b % 2 === 1) noise(t, 0.02, 0.025, 'highpass', 9000);
      if (b % 2 === 0) tone(t, 26 + bass % 12 + (b % 4 === 2 ? 12 : 0), sd * 1.6, 'sawtooth', 0.15, 520);
      if (b === 0) for (const pc of ch) { const n = 48 + ((pc - 48 % 12 + 12) % 12); tone(t, n, sd * 15, 'sawtooth', 0.03, 800); tone(t + 0.01, n + 0.1, sd * 15, 'sawtooth', 0.02, 700); }
      if (b === 0 && bar % 4 === 0) { noise(t, 0.25, 0.16, 'bandpass', 900); for (const pc of ch) tone(t, 60 + ((pc - 60 % 12 + 12) % 12), 0.35, 'sawtooth', 0.06, 2200); }
      if (bar % 8 === 7 && b >= 8) noise(t, sd * 1.1, 0.02 + (b - 8) * 0.012, 'highpass', 1500 + (b - 8) * 600);
    } else if (s.style === 'calypso' || s.style === 'bounce' || s.style === 'funk' || s.style === 'carnival' || s.style === 'ocean') {
      // syncopated offbeat bounce
      if (b === 0 || b === 6 || b === 10) kick(t, 0.3);
      if (b === 4 || b === 12) noise(t, 0.1, 0.12, 'bandpass', 1800);
      if (b % 2 === 1) noise(t, 0.03, 0.04, 'highpass', 7500);
      if (b === 0 || b === 6 || b === 11) tone(t, bass, sd * 1.6, 'triangle', 0.16);
      if (b === 8) tone(t, bass + 12, sd * 1.4, 'triangle', 0.12);
    } else {
      // standard melodic groove
      if (b === 0 || b === 6 || b === 11) tone(t, bass, sd * 1.8, 'triangle', 0.16);
      if (b === 8) tone(t, bass + 12, sd * 1.6, 'triangle', 0.13);
      if (b === 14) tone(t, bass + 7, sd * 1.6, 'triangle', 0.13);
      if (!s.calm) {
        if (b === 0 || b === 8 || (s.kick6 && b === 6)) kick(t, 0.32);
        if (b === 4 || b === 12) { noise(t, 0.12, 0.13, 'bandpass', 1900); tone(t, 50, 0.06, 'triangle', 0.08); }
        if (b % 4 === 2 || (s.hats16 && b % 2 === 1)) noise(t, 0.035, b % 4 === 2 ? 0.05 : 0.025, 'highpass', 7500);
      } else if (b % 4 === 2) noise(t, 0.03, 0.02, 'highpass', 8000);
    }
    // harmonic stabs
    if (b % 4 === 2 && s.style !== 'fight') for (const pc of ch) tone(t, 60 + ((pc - 60 % 12 + 12) % 12), sd * 1.1, 'square', s.calm ? 0.016 : 0.022, 1400);
  }

  function start(id) {
    stop(); if (!ctx) return;
    const isMenu = id === 'menu', isResults = id === 'results';
    const seed = isMenu ? 3 : isResults ? 11 : id === 'fight' ? 21 : 100 + (+String(id).replace(/\D/g, '') || 0);
    const alt = isMenu && Math.random() < 0.5;   // (cosmetic: which of the two menu tunes)
    song = makeSong(id, alt ? 5 : seed, alt ? { bpm: 116, calm: true, theme: MENU_ALT } : isMenu ? { bpm: 108, calm: true } : isResults ? { bpm: 118, calm: true } : {});
    step = 0; tempoMul = 1; nextT = ctx.currentTime + 0.08;
    timer = setInterval(() => {
      if (!song || !ctx) return;
      const sd = 60 / (song.bpm * tempoMul) / 4;
      // fell behind (a long frame, a hidden tab, audio suspended): skip the missed steps instead of firing them all at once
      if (nextT < ctx.currentTime) { const miss = Math.ceil((ctx.currentTime - nextT) / sd); step += miss; nextT += miss * sd; }
      while (nextT < ctx.currentTime + 0.25) { play(song, step, nextT, sd); nextT += sd; step++; }
    }, 40);
  }

  function stop() { if (timer) clearInterval(timer); timer = null; song = null; }

  return (api = {
    ensure, beep,
    music(id) { want = id; if (ctx && heard) start(id); },          // starts once the browser allows sound (first key or click)
    warm() { if (!muted && typeof window !== 'undefined') make(); },
    tempo(k) { tempoMul = k; },
    toggle() { return this.setMuted(!muted); },
    setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 1; if (api && api.onMute) api.onMute(muted); return muted; },
    setMusicVolume(v) { musicVol = Math.min(1, Math.max(0, v)); if (musicBus) musicBus.gain.value = 0.42 * musicVol; },   // 1 is the usual level
    setSfxVolume(v) { sfxVol = Math.min(1, Math.max(0, v)); if (sfxBus) sfxBus.gain.value = sfxVol; },
    onMute: null,   // called with the new state when muted changes (the settings panel keeps in sync)
    get muted() { return muted; },
    get state() { return { song: song && song.id, ctx: ctx && ctx.state, step }; },

    // a new named sound (a plug-in fighter's: js/art/kits.js): make(lib) returns its (v, t) => ..., lib the makers above
    define(name, make) { SOUNDS[name] = make({ osc, hiss, arp, boom, SOUNDS }); },
    // a named sound effect (see SOUNDS) at volume v
    play(name, v = 1) {
      const f = SOUNDS[name]; if (!f || v < 0.03 || !live()) return;
      const now = ctx.currentTime; if ((lastAt[name] || 0) > now - 0.04) return; lastAt[name] = now;   // the same sound twice in a frame is just louder
      f(Math.min(v, 1.3), now + 0.005);
    },
  });
})();

