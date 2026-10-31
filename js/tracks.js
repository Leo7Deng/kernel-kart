// Kernel Kart: track definitions (layout points, theme, special features).

// ---------------------------------------------------------------- tracks
import { Math } from './detmath.js';
export const TRACKS = [
  // a crab's coastal kingdom: Harbour Quay, Lighthouse Sweeper, Groyne Chicane, the Whelk (tightens), the Crab's Reach
  // where the Borrow Checker's claw slams across the road (a pincer from lap 2), Lobster Pot hairpin, Boardwalk, Wreck
  // Hairpin, Kelp Esses, and the Shell Carousel (270° over its own way in).
  { name: 'Crab Harbor', desc: 'A crab\'s kingdom by the sea. The Borrow Checker, a giant crab, lives in the surf along the Crab\'s Reach: when it rears a claw, watch its shadow on the road and beat it or lift; from lap 2 it pinches with both claws, one ahead of you and one behind. Then the Boardwalk into the Wreck Hairpin, the Kelp Esses and the Shell Carousel over its own bridge.', width: 140, scale: 1.5, camera: true, runoff: 46, gripMul: 1, bridge: 'first',
    theme: { grass: '#d9bf8a', grass2: '#e6cf9f', road: '#6b6670', verge: '#f3e2b8', deco: 'crab' },
    pts: [[950,450],[2000,450,260],[2010,970,90],[1890,1080,90],[2010,1190,100],[2060,1400,200],[1880,1580,100],[1250,1660,1200],[420,1560,80],[400,1210,80],[1640,1170,55],[1660,870,55],[1330,880,110],[1150,740,110],[950,860,110],[760,740,130],[430,760,150],[430,140,170],[90,140,170],[90,450,170]],
    widths: [[1300,450,1.3,420],[1950,1080,0.88,150],[560,1575,1.25,160],[1000,1190,0.85,380]],
    crab: [{ from: [1720,1610], to: [620,1590], every: [1.2, 2.4] }],   // every: how long it rests between attacks (s)
    // single boxes (geometry.js singlesOf; the other rows are pairs: the Quay's, the one on the Crab's Reach, the Kelp Esses'):
    singleBoxes: [[419,1240,-0.6],   // out wide on the Lobster Pot's exit: carry speed out of it onto the Boardwalk and it's yours
      [176,155,0.6]],                // the Shell Carousel's outside wall: only a kart carrying speed round the carousel runs out there
    // the open sea along the bottom (the crab stands in its surf), the harbour basin behind the quay, and the mole with the lighthouse
    shore: { sea: [[2800,1690],[2150,1700],[1900,1760],[1600,1820],[1250,1855],[900,1820],[650,1770],[350,1730],[-500,1740],[-500,2600],[2800,2600]],
      harbour: [[880,-600],[2800,-600],[2800,320],[2300,320],[2150,300],[900,300]], mole: [[2000,305],[1880,95]],
      town: [540,60,900,290], piers: [[1150,300,150],[1500,300,170],[1760,300,140]] } },   // (the town's corner and the piers: art/shore.js)
  { name: "Pharaoh's Jackpot", desc: 'A pharaoh\'s casino in the desert. The wide Strip into Pharaoh\'s Gate (a right that tightens into a hairpin), a chicane, the Carousel, Jackpot Avenue, the Spike and the Staircase. The Strip is the bazaar, four rows of item boxes between the market stalls, and the only plain boxes on the lap. Everywhere else you gamble: at the apex of six corners sit golden boxes. Lift early and your line tucks in onto them, stay on the gas and you sail past. Each one spins a slot machine: two alike pays an item, three alike the jackpot (both hands full and a rush of coins), a cobra is a bust.', width: 134, scale: 1.6, camera: true, runoff: 50, gripMul: 1,
    theme: { grass: '#e9c98a', grass2: '#f1d69e', road: '#6f6670', verge: '#f3d58c', deco: 'pharaoh' },
    pts: [[230,168,150],[1794,168,170],[1955,300,55],[1955,516,80],[1840,612,80],[1840,732,80],[1955,828,90],[1955,1440,250],[1449,1440,250],[1449,672,150],[1127,672,150],[1127,984,100],[874,984,70],[782,720,40],[690,984,70],[230,984,110],[230,792,66],[414,792,66],[414,576,66],[230,576,66]],
    widths: [[1010,168,1.35,500],[1897,672,0.85,120]],
    boxRows: 4, boxLanes: [-0.62, 0, 0.62], boxZone: [[390,168],[1600,168]],   // all the plain boxes on the Strip, four rows of three
    ponds: 1,
    jackpots: [{ at: [1840,612] }, { at: [1950,848] }, { at: [1100,960] }, { at: [690,984] }, { at: [250,960] }, { at: [414,576] }] },
  // a road up and round a live volcano: Ash Flats (bridge over the lava river), Obsidian Hairpin, the lower ford (flat
  // out), the Funnel (tightens), the upper ford (slow), the Kiln, Ash Sweeper, Crater Lip, the Rim, Basalt S. Eruptions
  // often spill down the river (race-river.js) and flood the fords in turn.
  { name: "Duke's Volcano", desc: 'Up and round a live volcano. The Ash Flats into the Obsidian Hairpin, up the switchbacks through the Funnel (a fast right that tightens into a hairpin), the Kiln and the Ash Sweeper to the Crater Lip under the summit, and down the Basalt S. When it erupts, watch the splat-shaped marks where its globs will land: lift and let one crust over, or get past first. And lava often spills down the river across the road: when a ford\'s lamps flash, cross before the glowing front gets there, or wait for it to pass.', width: 136, scale: 1.5, camera: true, runoff: 42, gripMul: 1,
    theme: { grass: '#5b3f4b', grass2: '#674857', road: '#7a7385', verge: '#3f2a35', deco: 'lava' },
    pts: [[650,1550],[2000,1550,55],[2010,1330,55],[1420,1290,900],[780,1340,280],[570,1220,150],[590,1050,80],[1180,1090,900],[1720,1000,150],[1860,620,700],[1800,330,240],[1380,330,80],[1290,400,80],[1110,400,80],[1020,330,80],[520,330,240],[200,700,200],[200,900,160],[380,1100,160],[380,1300,120],[330,1550,200]],
    volcano: [{ at: [1200,690,200], reach: 700 }], flank: 820,   // flank: how far out the mountain's foot is (only drawn)
    // single boxes (the Flats', the lower switchback's and the Flank Road's rows stay pairs: a sure refill before the fords and the Kiln):
    singleBoxes: [[1766,370,0.6],    // the outside of the bend at the top of the Ash Sweeper, under the summit and in the globs' reach: carry speed round it
      [379,1144,-0.6]],              // out wide on the Basalt S's first bend: carry speed into it; lift and you tuck in past it
    // the lava river: from the crater's lip down the cone at angle `from`, then through pts; it crosses the road at two
    // fords and then under the start straight, into the lake
    river: [{ from: 2.35, pts: [[900,950],[760,1050],[790,1200],[900,1340],[930,1450],[950,1550],[980,1720]], w: 30, fords: 2, lake: [990,1760,110] }] },
  // Moonshot, the grand final: one lap from Earth to the Moon and back (race-rocket.js). Earth: the Cliff Road into the
  // Lighthouse Hairpin (hardest corner, end of the fastest stretch), the Causeway Leap, the launch complex's timed
  // obstacles (race-timed.js), the Launch Row (a rocket per racer, taken in arrival order). Moon (less grip): Kepler Bowl
  // (banked, race-banks.js `bowl`), Hadley Rille (race-canyon.js), the mass driver (race-driver.js), the Apennine Crests
  // (race-crests.js), the base and the Return Row. Splashdown, then home round the harbour moles to Ocean Boulevard.
  ...(() => {
    // a crater bowl: polygon corners round a circle (x, y, r) from screen angle a0 (0 east, 90 south) on `sweep` degrees
    // (+ clockwise) in steps of at most 45, rounded with r so the road runs round it; plus a corner on the way in and
    // out (rounded with rk).
    const bowl = (x, y, r, a0, sweep, rk) => {
      const R2D = Math.PI / 180, n = Math.ceil(Math.abs(sweep) / 45), d = sweep / n * R2D, A = a0 * R2D, A1 = A + sweep * R2D, dir = Math.sign(sweep), t = r * Math.tan(Math.abs(d) / 2) + 40;
      const tan = a => [-Math.sin(a) * dir, Math.cos(a) * dir], [ix, iy] = tan(A), [ox, oy] = tan(A1), out = [[x + Math.cos(A) * r - ix * t, y + Math.sin(A) * r - iy * t, rk]];
      for (let i = 0; i < n; i++) { const a = A + d * (i + 0.5); out.push([x + Math.cos(a) * r / Math.cos(d / 2), y + Math.sin(a) * r / Math.cos(d / 2), r]); }
      out.push([x + Math.cos(A1) * r + ox * t, y + Math.sin(A1) * r + oy * t, rk]);
      return out.map(p => [Math.round(p[0]), Math.round(p[1]), p[2]]);
    };
    const EARTH = [[1850,2000],[2250,1995,400],   // Ocean Boulevard (the start), up onto the cliffs
      [2480,1860,220],[2700,1840,160],[2860,1690,200],[3080,1650,320],   // the Cliff Road: up onto the cape, round the cove
      [3420,1690,600],   // the cliff top, the fastest stretch, a flat kink
      [3600,1620,55],[3640,1830,60],   // the Lighthouse Hairpin at the cape's point
      [3150,2010,220],[2500,2200,150],[2133,2725,150],   // back across the cape and over the Banana River causeway (the Causeway Leap)
      [2750,2960,200],   // the launch complex: past the launch tower and its gantry arms
      [3280,2960,80],[3330,3250,80],   // past the test stand's firing, the Step, a quick right-left
      [3980,3320,240],   // the crawler crossing, a long left onto the Crawlerway
      [3980,1860]];   // up the Crawlerway (the crawler crossing) to the Launch Row (and the rockets' way up, never driven)
    const MOON = [[3980,-120],[3980,-650],   // the landing field and its gate
      ...bowl(4230,-1350,250,180,270,80),   // Kepler Bowl: a right-hander round 270°, out over its own way in
      [3620,-1100,230],   // Hadley Rille: a fast right into the canyon's mouth
      [3620,-1660,150],   // a left onto the rim
      [3360,-1760,110],[3150,-1660,110],   // an S
      [2880,-1700,190],[2760,-1600,70],   // the hairpin that tightens, out onto the mass driver
      [3560,-260,70],   // the catch: a hard right, west along the Moon's edge
      [2650,-275,260],   // the Apennine Crests: over the first (gentle) crest into a fast right sweeper
      [2290,-635,110],   // over the second (sharp) crest into a left
      [1900,-635,260],[1790,-698,80],   // over the third into a right that tightens
      [1790,-1130,70],[1600,-1130,90],   // up past the rover crossing to the hairpin at the top of the climb
      [1600,-1000,100],   // down, and a right into the base
      [1150,-1000,90],[1050,-910,80],[940,-910,80],[840,-1000,80],   // the airlock, and the hab's tunnel
      [520,-1000,120],
      [520,-250]];   // the Return Row (and the capsules' way down, never driven)
    const HOME = [[500,1880],[520,2010,110],   // up the slipway onto the beach road
      [820,2020,160],[950,1450,180],   // a fast left out onto the pier, a right onto the outer mole
      [1420,1450,70],[1420,1700,70],   // the Mole Head hairpin
      [1150,1700,200],[1150,2005,100]];   // back along the inner mole, ashore and onto Ocean Boulevard to the line
    return [{ name: 'Moonshot', desc: 'The grand final, one huge lap from Earth to the Moon and back. Off the beach and up onto the Cliff Road along the cape\'s sea cliffs, fast and flowing, into the Lighthouse Hairpin at the cape\'s point. Then the Causeway Leap: the bridge over the lagoon is up, so lift to hit its ramp in the window (too slow and you splash in, too fast and you fly past the bend and crash-land in the scrub). Through the launch complex: the launch tower\'s arms swing out across the road one after the other (time the gap), a rocket engine on its test stand fires across the road (get through before it lights, or wait for it to die away), and the crawler-transporter crosses the road with a rocket on its back (beat it or let it pass). At the Launch Row a line of rockets waits, one for every racer: drive straight in flat out, the first free ramp catches you, and the first there gets the first rocket and is out on the Moon first. On the Moon everything grips less. Kepler Bowl, a crater banked like a velodrome, a loop round it and out over its own way in: arrive hot and ride high round its wall, or lift and drop to the tight floor line (the fast racers ride the wall, the slow grippy ones take the floor). Then down into Hadley Rille, a narrow canyon with rock walls on both sides: a fast right into its mouth, a left onto the rim, an S and a hairpin that tightens. There is no run-off down there, so run wide and you scrape along the wall. Out of the hairpin onto the mass driver, a magnetic launch rail of coil rings: they light amber one by one while it charges, then it fires green, then red as it discharges. Drive through the first ring on green and you are flung down the rail at nearly twice your top speed; on red it grabs you and kills your speed; while it charges nothing happens. The gauge shows when you would get there flat out: lift to arrive on the green, or just drive through while it charges. Lift hard for the catch at the end of the rail, then west along the Moon\'s edge into the Apennine Crests: three low-gravity crests, each with a turn just past it. The faster you take a crest the lighter you go and the less you can turn, and too fast you float right off it and can\'t steer or lift until you come down, in the turn. So lift before each crest, not on it: the gauge shows the fastest you can take it and still be down in time (orange: you will float into the turn). Then the climb to the top of the Apennines, a tight left and a wide one over the top, and down to the base: a rover crossing, the airlock\'s doors sliding shut and open (time them), the twisty run through the hab under its roof, and the Return Row: a capsule for every racer, the same way in. Re-entry, chutes, splashdown, the tow in and up the slipway, then home round the harbour: out along the pier, down the outer mole (the breakers wash over it), round the Mole Head hairpin and back to the line.', width: 140, scale: 1.6, camera: true, runoff: 46, gripMul: 1, laps: 1, props: 1, rev: 9, bridge: 'second',
      theme: { grass: '#86b85a', grass2: '#9cc86a', road: '#5d616b', verge: '#e4e1d6', deco: 'moonshot' },
      pts: [...EARTH, ...MOON, ...HOME],
      widths: [[4407,-1527,2.4,589,240], [3392,-1747,0.86,700,100]],   // Kepler Bowl; Hadley Rille, narrow
      banks: [{ from: [3980,-1350], to: [4230,-1100], bank: 1.6, grip: 0.82, bowl: true }],   // Kepler Bowl: big and steep, ride the wall
      crests: [{ at: [2898,-271], w: 300, h: 40 }, { at: [2400,-525], w: 220, h: 40 }, { at: [2070,-635], w: 260, h: 45 }],   // the Apennine Crests: each into a turn, each floating you at its own speed
      timed: [{ kind: 'arms', at: [2380,2805], side: 1, n: 2, gap: 130, len: 122, period: 3.2, phase: 0, out: [1.1, 1.75], lag: 0.55 },   // the launch tower's gantry arms
        { kind: 'blast', at: [3060,2960], side: 1, w: 70, period: 7, phase: 0, warn: 3, fire: 1.8 },   // the test stand's firing across the road
        { kind: 'cross', look: 'crawler', at: [3650,3285], a: 90, len: 75, w: 55, v: 110, wait: 3, phase: 0 },   // the crawler crossing
        { kind: 'cross', look: 'rover', at: [3260,-262], a: 90, len: 40, w: 26, v: 200, wait: 1.5, phase: 0 },   // the rover crossing in the base
        { kind: 'doors', at: [[1320,-1000],[1205,-1000]], period: 3.4, phase: 0, open: 0.55, lag: 0.5 }],   // the airlock
      driver: { from: [2931,-1301], to: [3374,-580], period: 5, fire: 0.9, red: 1.1, phase: 0, rings: 9 },   // the mass driver: launched if you drive in as it fires
      canyon: [{ from: [3640,-1150], to: [2800,-1560] }],   // Hadley Rille: walled in both sides
      tunnels: [{ from: [1165,-1000], to: [760,-1000], roof: [965,-950,220] }],   // the hab: its roof hides the road
      rocket: { row: { end: [3980,1860], gap: 130 }, field: [3980,-120], gate: [3980,-650], ret: { end: [520,-250], gap: 110 }, splash: { at: [500,1230], out: [500,1880], gap: 85 },
 },
      lowg: [{ at: [2290,2500], crater: [2255,2550,100], g: 1.7, splash: true, crash: true, clear: 4, edge: 36, early: 90 }],   // the Causeway Leap: window 246-294
      waves: [{ at: [2050,2000], side: 1 }, { at: [1200,1450], side: -1 }],   // breakers across Ocean Boulevard and the outer mole
      // single boxes (other rows stay pairs); the other rows are placed by hand (geometry.js boxAt), none in the canyon,
      // on the mass driver or over the crests:
      boxAt: [[2200,1998],[2700,1840],[3276,1982],[2700,2935],[3980,3050],[3980,-850],[3625,-1330],[1700,-1130],[520,-930],[692,2015],[890,1720],[1300,1700]],
      singleBoxes: [[2700,1840,0.7],   // on the Cliff Road's first right: carry speed through it and your line runs over it, lift early and you're past it on the inside
        [3625,-1330,-0.6],             // out wide at the exit of the fast right into Hadley Rille: carry speed through it and you run out onto it, lift and you tuck in past it
        [1300,1700,-0.6]],             // on the inside of the harbour's long left, off the inner mole: lift a touch and your line tucks in onto it
      // the art (art/moonshot.js, art/cape.js, art/moon.js), layout units: Earth and Moon discs (x, edge, radius), the coast,
      // lagoon, buildings, craters, rille and base
      moonshot: { earth: [2200,1000,4000], moon: [2200,450,4000],
        coast: [[-600,1890],[200,1885],[600,1880],[1000,1895],[1500,1900],[2000,1890],[2250,1880],[2350,1815],[2450,1770],[2560,1750],[2650,1735],[2720,1690],[2790,1610],[2870,1575],[2980,1560],[3100,1545],[3200,1560],[3300,1570],[3400,1565],[3500,1530],[3600,1520],[3700,1500],[3790,1570],[3800,1690],[3880,1745],[4200,1745],[4700,1830],[5300,1960]],
        cliff: [2280, 3860],   // the stretch of the coast that's sea cliffs, not beach (west to east)
        lagoon: [[-600,2290],[300,2300],[900,2285],[1500,2300],[2000,2290],[2350,2270],[2700,2300],[3000,2400],[3300,2560],[3600,2730],[3850,2800],[4200,2820],[5300,2830],[5300,2990],[4300,2960],[3900,2950],[3500,2880],[3150,2720],[2800,2600],[2400,2610],[2000,2590],[1700,2560],[1400,2580],[1000,2600],[600,2630],[200,2640],[-600,2620]],
        basin: [1010,3130,115,105], vab: [1550,3150,190,150], lcc: [2330,3420], press: [1300,2120], lighthouse: [3735,1555], harbour: [1510,1575], dock: [330,1840], ship: [190,1700],
        fuel: [4250,2420], tower: [4230,2010], garden: [800,3350], visitor: [2650,3250], hangar: [3100,3450],
        base: [950,-1480], obs: [2150,-1450], ray: [2550,-820,110],
        maria: [[[300,-800],[1600,-700],[1750,-1300],[1650,-2500],[900,-2650],[250,-2300]], [[3150,-300],[4300,-350],[4400,-1800],[3700,-2100],[3200,-1500]]] } }];
  })(),
  // a Japanese garden in a figure-eight: Hanami Straight, Blossom Hairpin, Torii Turn, Maple S, Shrine Sweeper (double
  // apex), over the red bridge to the Koi Curve (tightens), Lantern Chicane, Carousel, the drawbridge (race-drawbridge.js:
  // leap it while low or wait), Sakura Kink.
  { name: 'Sakura Stack', desc: 'A figure-eight through a Japanese garden: over the red bridge and back under it. Flat out down the Hanami Straight into the Blossom Hairpin, the Torii Turn and the Maple S, the Shrine Sweeper (flat if you dare), the Koi Curve that tightens, the narrow Lantern Chicane and the Carousel. Then the drawbridge over the koi canal: when the temple bell rings, its leaf starts to lift. Floor it and leap the canal while it is still low (let go at the lip for a trick), or lift and roll up as it comes back down. Too late and you bounce off it.', width: 138, scale: 1.6, gripMul: 1, camera: true, bridge: 'first', ponds: 3, props: 120,
    theme: { grass: '#bfe5a6', grass2: '#cdebb8', road: '#767b90', verge: '#fbf3e4', deco: 'sakura' },
    pts: [[1500,1200],[1958,1200,58],[1958,1084,58],[1585,1084,95],[1585,854,150],[1476,725,150],[1476,100,240],[972,100,220],[406,909,320],[224,957,78],[61,510,110],[84,424,110],[-85,-42,175],[19,-192,175],[201,-192,175],[1176,1200,200]],
    widths: [[1820,1200,1.25,160],[72,467,0.82,100]],
    torii: [[1585,985],[1476,560]],
    // single boxes (the rows after the Blossom Hairpin and after the drawbridge stay pairs):
    singleBoxes: [[893,212,-0.6],    // the inside of the Shrine Sweeper's exit: lift a touch and your line takes it; flat out you sail wide of it
      [-52,-80,-0.6]],               // the Carousel's outside: carry speed round it and you run out onto it
    drawbridges: [{ at: [471,193], w: 86, every: [8, 13], canal: [[320,600],[300,420],[345,290],[397,245],[471,193],[545,141],[615,85],[690,-20]], pools: [[320,660,110],[705,-40,115]] }] },
  // a new road every lap (routes), sharing only the start/finish straight, which ends in a T: lap 1 the Sun Road, lap 2
  // the Serpent, lap 3 the Temple Road, then repeat. The corner at the end of the straight differs every lap.
  { name: 'Pyth Plateau', desc: 'A city of painted step pyramids on a sunny plateau, and a new road every lap: the straight ends in a T, and each lap it takes you somewhere else. Lap 1 the Sun Road (flat through the Sun Gate, a ramp, a bend that tightens, the Step, the Moon hairpin), lap 2 the Serpent (a hard right, esses that tighten into the Jaws), lap 3 the Temple Road (a hairpin just past the line, the Carousel, the Courtyard U, the Coil). Follow your dotted line.', width: 140, scale: 1.6, gripMul: 1, camera: true,
    theme: { grass: '#d3b26c', grass2: '#c98d5a', road: '#69646a', verge: '#e7d2a2', deco: 'plateau' },
    jumps: [[2190,720]],
    // the Temple Road's secret (race-secret.js): a sun stone in a pocket past the Temple Hairpin's run-off (only a boost or
    // a Ghost carries in); reach it and a phoenix flies you past the Carousel.
    secrets: [{ at: [1669,975,38], to: [1773,591], via: [1500,560], kind: 'phoenix', by: ['boost', 'ghost'], pocket: true, hint: true, altar: 'landmark', pillar: [1669,806], fire: 350, v: 0.75 }],
    routes: [
      { name: 'the Sun Road', pts: [[1250,1150,600],[2100,1150,240],[2200,650,400],[2330,100,260],[2150,-200,80],[1450,-200,90],[1300,-80,90],[250,-80,62],[620,500,130],[520,880,240],[650,1150,95]] },
      { name: 'the Serpent', pts: [[1250,1150,600],[2050,1150,85],[2140,1460,260],[1950,1700,260],[1650,1500,240],[1300,1690,200],[1050,1520,150],[880,1660,80],[740,1570,70],[250,1720,62],[550,1400,120],[450,1250,120],[650,1150,95]] },
      { name: 'the Temple Road', pts: [[1250,1150,600],[1730,1150,58],[1330,990,200],[1200,780,220],[1420,580,220],[2050,600,110],[2050,100,250],[1010,100,240],[890,330,90],[1010,760,150],[1030,1150,90]] },
    ] },
  // two forks: tucked in at a marked corner takes the sharp road, the middle or wide the sweep. Four routes, one per
  // combination (bit 0 = fork 1 sharp, bit 1 = fork 2 sharp).
  ...(() => {
    const S = [[1300,1452,600],[1800,1440,130],[2200,1380,140],[2480,1180,160],[2480,760,170]];
    const W1 = [[2160,720,170],[2140,420,170],[1900,230,180],[1600,400,170]], T1 = [[2240,840,72],[2060,700,72],[1860,820,72],[1680,700,72]];
    const J = [[1500,760,160],[1150,760,160],[1150,340,160],[950,160,160],[480,160,170]];
    const W2 = [[400,460,170],[180,700,170],[220,1000,160]], T2 = [[600,380,95],[460,580,95],[500,900,90]];
    const E = [[560,1200,150],[800,1440,130]];
    const sharp = (S, k) => S.map((p, i) => i === S.length - 1 ? [p[0], p[1], k] : p);   // the fork corner is a tighter arc on the sharp road
    return [{ name: 'Merge Bay', waves: [{ at: [1990,1412] }, { at: [668,1308] }], desc: 'Big, and the road forks twice, round a seaside town on an island in the bay. At a fork, lift into the gold inside lane and stay tucked in to take the sharp road: a chicane at the first, a hairpin pocket with a boost pad at the second. Stay in the white lane and you get the fast sweep. Watch for waves rolling in off the bay.', width: 140, scale: 1.6, gripMul: 1, camera: true, ponds: 2,
      theme: { grass: '#79cfc2', grass2: '#8fdbcf', road: '#6e6b7f', verge: '#f9ead0', deco: 'water' },
      forks: [{ at: [2480,760] }, { at: [480,160] }],
      pads: [[530,1050]],
      // a single box (the shared rows stay pairs; the rows only one road uses are already single boxes in the middle):
      singleBoxes: [[2340,806,-0.6]],   // the first fork's chicane, on its inside: lift and stay tucked in and it's yours, run it fast and you go past
      routes: [
        { name: 'sweep & sweep',     pts: [...S, ...W1, ...J, ...W2, ...E] },
        { name: 'chicane & sweep',   pts: [...sharp(S, 100), ...T1, ...J, ...W2, ...E] },
        { name: 'sweep & pocket',    pts: [...S, ...W1, ...sharp(J, 100), ...T2, ...E] },
        { name: 'chicane & pocket',  pts: [...sharp(S, 100), ...T1, ...sharp(J, 100), ...T2, ...E] },
      ] }];
  })(),
  // a pretzel round a live volcano with a long split (forks split: true; race.js splitLane) for nearly half the lap: the
  // Big Loop (route 0: Cinder Hairpin, the Kicker Park, race-kickers.js) or the Caldera (route 1, then a second fork:
  // the Tinder Grove's esses, or the Ash Run, route 2, bits 3, straight down the flank once an eruption burns a gap
  // through the thicket, race-thicket.js). About as long; they meet before the Pigtail.
  ...(() => {
    const HEAD = [[1000,150,240]];   // the line, on the start straight (a straight-through point, the same on both routes)
    const LOOP = [[1500,150,200],[1850,300,130],[1720,780,70],[2480,1000,110],[2480,140,75],[2100,190,140],[1960,560,240],[2010,1150,200],[1800,1360,180]];
    const CAL_A = [[1500,150,75],[1510,580,150],[1260,600,48],[1250,340,110]];
    const LONG = [[880,310,170],[620,470,100],[660,660,120],[510,800,90],[700,930,140]];
    const ASH = [[880,310,70],[830,880,140]];
    const CAL_B = [[990,880,140],[1080,800,140],[1300,880,75],[1520,1378,60]];
    const TAIL = [[1300,1400,200],[900,1400,170],[700,1250,130],[850,1050,55],[1050,1200,150],[1000,1560,150],[340,1560,200],[310,850,300],[340,150,55]];
    return [{ name: 'Kernel Pretzel', desc: 'A pretzel round a live volcano, and a long split. Stay flat out in the white lane for the Big Loop and its Kicker Park: hold the gas to fly a line of kickers (let go right at each lip for a trick and a boost), lift for real and you steer round them, and don\'t fly the last one fast or you land hot at the hairpin. Or lift into the orange lane for the Caldera round the volcano: now and then it lobs a fireball into the thicket across the Ash Run, a shortcut down its flank. Lift into the charred gap while its embers glow; arrive while it burns, or as the burnt trunks topple, and you bounce off. Then the Pigtail over a narrow bridge and a long run up the west side into a hairpin.', width: 140, scale: 1.6, gripMul: 1, camera: true, bridge: 'first', rev: 2,
      theme: { grass: '#4a3550', grass2: '#573f5e', road: '#7a7385', verge: '#2e1f33', deco: 'lava' },
      forks: [{ at: [1500,150], split: true }, { at: [960,316], thicket: true }],
      thickets: [{ at: [868,420] }],   // the thicket across the Ash Run, just past where it leaves the long way
      kickers: [[2480,760,0.05,0.85,-0.55],[2480,548,0.05,0.85,-0.55],[2480,360,0.05,0.85,-0.55]],   // the Kicker Park: three kickers in the right-hand lanes, the clear lane by the left kerb (the hairpin's inside)
      routes: [
        { name: 'the Big Loop', pts: [...HEAD, ...LOOP, ...TAIL] },
        { name: 'the Caldera', pts: [...HEAD, ...CAL_A, ...LONG, ...CAL_B, ...TAIL] },
        { name: 'the Ash Run', pts: [...HEAD, ...CAL_A, ...ASH, ...CAL_B, ...TAIL], bits: 3 },
      ],
      jumps: [[650,150]],
      widths: [[2480,570,1.6,360]],
      bboxPad: [0, 0, 260, 0],   // ground east of the Kicker Park, so the camera can follow you up it
      pads: [[1880,826],[2040,330]],   // out of the Cinder Hairpin, and out of the sweeper onto the run down over the bridge
      volcano: [{ at: [1030,590,100], reach: 420, every: [10, 14] }],
      // a single box (the start's, the meeting point's and the Caldera's rows stay pairs; one-road rows are already singles):
      singleBoxes: [[825,1580,-0.6]],   // out wide on the exit of the corner past the Pigtail's bridge: carry speed out of it
    }];
  })(),
  // a point-to-point mountain pass: Summit straight, Switchbacks (GC bots crossing), the Viaduct (later passes under
  // itself), the Ledge (narrow), Carousel, Pigtail, Dam straight, a chicane into the Crevasse jump, the Plaza.
  { name: 'Pipeline Pass', desc: 'Not a loop: a long descent in three stages. Switchbacks with bots, a narrow cliff ledge, a carousel, a pigtail over a bridge, under your own viaduct, a chicane into the Cannon: a flat-out leap across a crevasse, and the plaza at the bottom.', width: 140, scale: 1.6, gripMul: 0.9, camera: true, open: true, bridge: 'first',
    theme: { grass: '#dfe9f3', grass2: '#f4f8fc', road: '#8e9fb5', verge: '#c3d3e3', deco: 'snow' },
    pts: [[100,250],[800,250,240],[1150,420,180],[1000,700,150],[250,700,220],[150,1000,170],[1100,1000,220],[1900,1000,240],[2400,850,240],[2900,750,260],[3200,400,280],[2900,120,260],[2300,150,220],[2000,350,200],[2050,650,200],[2400,800,200],[2650,500,200],[1800,450,170],[1500,700,200],[1550,1300,200],[1900,1500,220],[2500,1550,240],[2900,1800,240],[2600,2100,200],[2400,2160,110],[2250,2050,110],[900,2100,220],[300,2100]],
    jumps: [[1890,2100]], gaps: [[1660,2100,300]],
    widths: [[450,250,1.3,300],[3050,560,0.7,220],[2027,522,0.72,110],[550,2100,1.4,250]],
    pads: [[2600,135],[2100,940]],
    gc: [[600,700,0],[600,1000,2.5]],
    // single boxes (the Summit's, the Viaduct's, before the Ledge, after the Carousel and the Plaza's rows stay pairs):
    singleBoxes: [[196,864,0.6],     // round the outside of the second Switchback hairpin: only if you carry speed into it
      [2231,195,0.6],                // out wide on the left after the Carousel, into the Pigtail: carry speed through it
      [1654,1359,-0.6]] },           // the inside of the fast left just after you pass under the Viaduct: lift a touch and tuck in for it, flat out and you miss it
  // a scenic coastal highway across the bay: a wide causeway bridge, a narrowing technical cliffside chicane,
  // high-voltage cyber track under the neon grid: a wide front straight with dual boost pads, a narrowing technical chicane
  // a space station in a figure-eight: launch rail, a diagonal under the overpass into a hairpin, the Asteroid Belt
  // esses, the Event Horizon (decreasing radius), the Low-G dome, and the Docking Arm hairpin a timed wormhole skips.
  { name: 'Heap Space', desc: 'A figure-eight space station. Hit the moon ramp in the Low-G dome at the right speed: too slow and you drop in the crater, too fast and the moon past the bend pulls you into orbit. A wormhole skips the docking arm while it glows; dive in as it collapses and you segfault.', width: 140, scale: 1.6, camera: true, runoff: 50, gripMul: 1, bridge: 'second',
    theme: { grass: '#1b1f3b', grass2: '#262b55', road: '#5d6178', verge: '#c9d2ff', deco: 'space' },
    pts: [[2000,1450],[1650,1450,140],[600,250,65],[300,550,100],[300,700,80],[450,850,80],[300,1000,80],[250,1350,240],[550,1400,70],[1850,250,160],[2400,250,90],[2450,650,90],[2050,650,75],[2050,800,75],[2450,800,120],[2450,1450,130]],
    widths: [[2050,1450,1.3,250],[2050,725,0.85,230],[760,430,1.35,160],[380,850,0.8,200]],
    wormholes: [{ a: [2200,650], b: [2150,800], period: 7, open: 2.5 }],   // both mouths near the hairpin: the skip saves 2.0 s on a bot's best line (the long way, timed)
    lowg: [{ at: [1561,505], crater: [1640,435,170], dome: [1650,420,330], moon: [2085,40,66,203.7] }],
    planets: [[373,102,175], [1836,589,157,'ice']],   // a ringed gas giant and an ice giant beside two corners: run wide toward one and its gravity pulls you in
    // single boxes (the rows on the two long diagonals and before the Docking Arm stay pairs):
    singleBoxes: [[596,280,0.6],     // the outside of the hairpin under the overpass: keep some speed into it and you run out onto it
      [2423,844,-0.6]] },            // out wide on the corner after the Docking Arm: carry speed through it (from the wormhole or the long way)
  // a factory serpentine: Conveyor Hall, a sweeper and kinks, the Stamping Line (three presses as a green wave), the
  // Crucible (180° round a pot whose pours flood all but the outside lane), the Weld Seam dip, a square hairpin, a ramp,
  // kinks and a double-apex right.
  { name: 'Assembly Line', desc: 'A factory serpentine. Three stamping presses on a beat: ride the green wave or get flattened. A ladle pours the Crucible over on a beat and the slag floods all but its outside lane: lift for the apex when it is dry, or keep your speed up round the outside wall when it pours.', width: 140, scale: 1.5, camera: true, runoff: 46, gripMul: 1,
    theme: { grass: '#5a5f6b', grass2: '#646a77', road: '#3f4350', verge: '#f2c94c', deco: 'factory' },
    pts: [[1150,1200],[300,1200,190],[300,860,150],[420,740,110],[420,200,130],[1873,200,193],[1873,586,193],[1450,586,80],[1350,650,80],[1150,650,80],[1050,540,80],[700,540,55],[700,840,55],[1100,840,320],[1450,750,320],[1950,750,100],[1950,1200,100]],
    widths: [[620,200,1.4,120],[1250,630,0.7,200],[1150,1200,1.25,250],[1873,393,2.0,300,260]],   // the last: the Crucible, twice as wide, flaring out gently
    jumps: [[900,840]],
    presses: [{ at: [[780,200],[980,200],[1180,200]], len: 70, period: 3, wave: 300 }],
    slag: [{ from: [1680,200], to: [1680,586], pit: [1680,393,72], crane: [1490,393], cover: 0.6, period: [7, 7, 8.5], wide: 1 }],
    // a single box (the Hall's, the one after the presses, before the Crucible, and the Weld Seam's rows stay pairs):
    singleBoxes: [[1950,865,-0.6]] },   // out wide on the double-apex right's first apex: carry speed into it and you run wide onto it
  // a red-rock gorge cut corner to corner by the Cron railway, crossing the road four times, each a different call: the
  // Points (fast, from top speed), the Drop (before the pad and cannon: a wait spoils the chasm), the Gully Esses (at a
  // slant: the train reaches far up the road), the Devil's Hook (slow anyway: waiting is cheap). Also the Mesa Jump and
  // Carousel, the trestle, the Chasm Run, the Switchback, and the Long Run into the Terminus (the slowest corner).
  { name: 'Cron Canyon', desc: 'A red-rock gorge with the Cron freight on a railway that cuts right across it, so the train crosses the road four times, and a different call each time. The Points, a fast left out of the Sprint: floor it and beat the train, or stop from top speed. The Drop at the foot of the trestle, just before the cannon over the chasm. The Gully Esses, where the rails cross at a slant. The Devil\'s Hook, slow anyway, so waiting is cheap. Then the Long Run, flat out into the Terminus, a hairpin that turns you right round onto the line.', width: 140, scale: 1.6, camera: true, runoff: 46, gripMul: 1.0, bridge: 'first',
    theme: { grass: '#823e2b', grass2: '#964933', road: '#55505e', verge: '#f1d2a9', deco: 'canyon' },
    pts: [[1120,1565],[1950,1497,250],[2200,330,270],[1820,220,150],[1620,380,150],[1350,330,70],[1350,1000,120],[270,1000,90],[270,720,60],[600,720,110],[850,560,200],[1450,560,300],[1720,760,130],[1620,1130,50],[130,1646,60]],
    rail: [[2350,1750],[250,50]], train: { speed: 600, rest: [3, 10], first: [4, 9] },
    wash: [[560,60],[580,260],[520,420],[640,560],[610,700],[700,830],[740,960]],
    jumps: [[900,1000],[2110,880]],
    // a secret (race-secret.js): a mine's mouth in the run-off past the Mesa Carousel's exit; come in hot (a Turbo off the
    // Mesa Jump, or sliding on oil) and a portal drops you on the run to Trestle Turn.
    secrets: [{ at: [2005,222,34], to: [1350,465], portal: [1296,359], kind: 'mine', fire: 850, look: 1700, bots: 0.5, v: 0.5 }],
    gaps: [[740,1000,200]],
    pads: [[1120,1000]],
    // a single box (the Sprint's row, before the Points, and the Long Run's stay pairs; the Mesa Carousel's is a wide one):
    singleBoxes: [[302,978,-0.7]],   // out wide on the Switchback's first right, just past the chasm: land with speed and carry it in
    widths: [[1000,1575,1.45,380],[1350,500,0.70,160],[900,1000,0.75,140],[1620,1130,1.25,160]] },
  // a glacial crevasse ski jump, an elevated ice viaduct, and geothermal crater ponds.
  { name: 'Cryo Caldera', desc: 'A frozen crater, ice all the way round: grip is low everywhere, so lift earlier than you would anywhere else. Snowplough bots cross the road, a ramp flings you over a glacial crevasse (hit it flat out), the road crosses itself on an ice viaduct, and geysers and hot springs steam in the snow.', width: 140, scale: 1.6, camera: true, runoff: 50, gripMul: 0.80, bridge: 'second', ponds: 3,
    theme: { grass: '#d6e8f8', grass2: '#eaf4ff', road: '#7599b8', verge: '#ffffff', deco: 'ice' },
    pts: [[500,200,220],[1350,200,200],[1850,280,180],[2350,600,220],[2350,1100,220],[1950,1450,180],[1400,1450,160],[1400,650,180],[1250,380,140],[900,450,130],[700,680,100],[650,920,110],[900,1100,130],[1150,900,160],[1750,900,160],[1900,1100,130],[1600,1300,140],[750,1300,160],[350,1200,120],[220,800,140],[300,450,150]],
    jumps: [[1150,1300]],
    gaps: [[980,1300,220]],
    pads: [[800,200],[1450,1300]],
    gc: [[2350,850,0],[700,680,2.5]],
    // single boxes (the start's, the east side's, the viaduct's and the west side's rows stay pairs):
    singleBoxes: [[696,952,-0.6],    // the inside of the left just past the second snowplough crossing: lift early for it, as on all the ice; flat out you slide wide
      [1848,1081,-0.6]],             // the outside of the right after the crossing on the ice viaduct: only carrying speed, on ice
    widths: [[900,200,1.45,300],[1400,900,0.70,160],[1150,1300,0.80,140],[400,1200,1.25,160]] },
  // a coral atoll with hurricanes tracking across it: Beach Road, Palm Sweeper, the Seawall Carousel (banked 270° over its
  // own entry), the Causeway (longest straight between breakwaters, where the wind blows hardest), Breakwater Hairpin,
  // Lagoon Esses, Coconut Hook (tightens), a dune jump, the double-apex Beach Bend.
  { name: 'Async Atoll', desc: 'A coral atoll in hurricane season. Every so often a hurricane sweeps across the map, its wind whirling round a calm eye: watch the spiral of cloud coming over the road. Ride a tailwind flat out, lift a touch in a crosswind or scrape along the edge (the open causeway gets the worst of it), and the eye is dead calm. The banked seawall carousel rewards carrying speed: ride the wall high and fast, or drop to the flat apex.', width: 140, scale: 1.5, camera: true, runoff: 46, gripMul: 1, bridge: 'second',
    theme: { grass: '#2f8fa6', grass2: '#3aa0b6', road: '#5f6470', verge: '#f4e7c4', deco: 'atoll' },
    pts: [[1050,1500],[1700,1500,260],[1980,1080,320],[1980,200,200],[2380,200,200],[2380,600,200],[1300,480,420],[420,640,62],[420,800,62],[760,800,110],[940,960,110],[1380,960,240],[1500,1150,75],[540,1170,150],[480,1500,170]],
    hurricane: { causeway: { from: [1820,580], to: [640,620], socks: [[1560,650],[960,670]] }, breeze: [-0.7,-1], hold: 380, first: [1, 6], gap: [7, 16] },   // hold: the speed you can hold off the wall in a full eyewall wind straight across (race-hurricane.js)
    lagoons: [[1550,820,330],[1000,690,190],[900,1330,150]],
    banks: [{ from: [1980,390], to: [2190,600], bank: 0.45, sea: true }],
    // a single box (the rows before the seawall, on the causeway and before the Beach Bend stay pairs):
    singleBoxes: [[462,796,0.6]],    // out wide on the Breakwater Hairpin's exit: carry speed out of it, into the narrow Lagoon Esses
    jumps: [[1050,1160]],
    widths: [[1450,1500,1.3,420],[2380,400,1.3,470,200],[850,880,0.8,170]] },
  // jungle ruins: Plaza, Kapok Sweep, Strangler Fig S, Idol Corner into the Boulder Run (the idol rolls boulders down it),
  // Gorge Hairpin, a column chicane, the temple (roof hides the road), Cenote Carousel (270° over a vine bridge),
  // Colonnade, a decreasing-radius left.
  { name: 'Ruby Ruins', desc: 'A jungle temple in ruins. A stone idol rolls boulders down the long run: get down to the hairpin ahead of one (and brake late), or lift, let it go first and follow it down. Inside the temple the roof hides the road: remember the bends.', width: 140, scale: 1.5, camera: true, runoff: 46, gripMul: 1, bridge: 'second',
    theme: { grass: '#2f6b3a', grass2: '#3a7a44', road: '#6f6a62', verge: '#c9b98f', deco: 'jungle' },
    pts: [[900,1450],[1750,1450,320],[2200,1100,220],[2200,850,140],[2000,650,140],[2000,180,190],
      [600,180,65],[600,310,65],[950,310,70],[1080,420,70],[1350,420,140],[1350,660,110],[1450,770,110],
      [1450,1180,170],[1800,1180,170],[1800,920,170],[520,920,200],[330,1100,85],[330,1450,150]],
    boulders: [{ from: [1760,180], to: [665,180], gorge: [380,190,120], r: 37, v0: 140, acc: 280, vMax: 760, every: [6,10] }],
    tunnels: [{ from: [1350,575], to: [1450,840], roof: [1400,705,150] }],
    // single boxes (the Plaza's and the Cenote Carousel's rows stay pairs; Idol Corner's is a wide one):
    singleBoxes: [[648,307,0.6],     // out wide on the Gorge Hairpin's exit, past the boulders' gorge: brake late and carry speed out of it
      [339,1352,0.6]],               // the outside of the last corner onto the Plaza: keep your speed up through it
    widths: [[1200,1450,1.3,300],[1250,180,0.85,520],[900,920,0.8,180],[1450,920,0.85,120]] },
  // an alpine pass with real heights (elev: each point's 4th number, world units; race-elevation.js): climbing slows you,
  // descending runs you past top speed. Valley Straight, Meadow Sweeper, Foothills, four different Switchbacks up the
  // east face, the Ridge over the summit, then a split (forks split: true): stay on the gas for the Ramp (route 0, the
  // Cornice and the Jog), or lift inside for the Cliff (route 1): a flight down the face (race-cliff.js: too slow and the
  // torrent sweeps you down, too fast and you crash into the spill). Then the Schuss, the Kehre and the Avalanche.
  ...(() => {
    const HEAD = [[1000,1450,0,0],[2250,1450,300,5],[2250,960,120,35],[1850,960,70,95],[1850,820,70,108],[1990,820,60,130],[2050,785,60,144],[2230,760,150,180],[2230,540,55,210],[1870,540,70,270],[1870,350,120,290],[2180,290,45,335],[2180,160,45,345],[1600,140,450,380]];
    const SPLIT = [1150,170], CORN = [-300,400], K1 = [300,1880];   // the split; the Cornice; the Kehre (the Ramp runs straight from the Cornice down to it)
    const B = [SPLIT[0] + 250 * Math.cos(151 * Math.PI / 180), SPLIT[1] + 250 * Math.sin(151 * Math.PI / 180)];   // the Cliff road's turn-off: it leaves the Ridge at a slant, like a slip road, then kinks left onto its straight
    const M = [CORN[0] + (K1[0] - CORN[0]) * 750 / (K1[1] - CORN[1]), CORN[1] + 750];   // where the Cliff road meets the Ramp (the top of the Schuss)
    const len = Math.hypot(M[0] - B[0], M[1] - B[1]), at = d => [B[0] + (M[0] - B[0]) * d / len, B[1] + (M[1] - B[1]) * d / len];   // d along the Cliff's straight from the turn-off
    const LIP = 380, LAND = LIP + 560, FLAT = LAND + 200;   // the lip, the top of the landing slope, the flat past it (layout units)
    const side = (d, o) => { const p = at(d); return [p[0] + (B[1] - M[1]) / len * o, p[1] + (M[0] - B[0]) / len * o]; };   // d along the Cliff's straight, o out to the driver's right (layout units)
    // the torrent's head: a spring in the snowfield, down beside the run-up, over the wall in a waterfall (FALL: on its
    // lip; its foot is straight below), then under the flight's line
    const FALL = side(LIP - 8, -142), HEAD_T = [side(-10, -202), side(55, -180), side(120, -204), side(190, -178), side(255, -186), side(318, -150), FALL, [FALL[0], FALL[1] + 66], [FALL[0] - 90, FALL[1] + 80], [FALL[0] - 190, FALL[1] + 92]];
    const JOG = [CORN[0] + (M[0] - CORN[0]) * 0.6 + 115, CORN[1] + (M[1] - CORN[1]) * 0.6 - 46];   // the Jog: a kink halfway down the Ramp, a lift at its speed
    const RAMP = [[...SPLIT,350,365],[...CORN,230,310],[...JOG,170,212],[...M,0,140]];
    const CLIFF = [[...SPLIT,200,365],[...B,110,358],[...at(LIP),0,322],[...at(LIP + 20),0,319],[...at(LIP + 90),0,222],[...at(LAND),0,175],[...at(FLAT),0,148],[...M,200,140]];
    // the Kehre: a left hairpin at the foot of the Schuss, then back up beside it into the Avalanche (a right that tightens)
    const u = [(K1[0] - CORN[0]) / Math.hypot(K1[0] - CORN[0], K1[1] - CORN[1]), (K1[1] - CORN[1]) / Math.hypot(K1[0] - CORN[0], K1[1] - CORN[1])], K2 = [K1[0] + u[1] * 170, K1[1] - u[0] * 170], A1 = [K2[0] - u[0] * 330, K2[1] - u[1] * 330];
    const TAIL = [[...K1,75,8],[...K2,75,6],[...A1,230,3],[640,1450,70,0]];
    return [{ name: 'Recursion Ridge', desc: 'An alpine pass with real hills: climbing slows you, and downhill you run faster than your kart\'s top speed, so lift earlier for a corner at the bottom of a slope. Up the Switchbacks, four hairpins stacked up the mountain, along the Ridge over the summit, then choose your way down. Stay on the gas for the Ramp, a long fast road down the far side, or lift into the inside lane for the Cliff: off the edge and fly down the face. Too slow and you splash down in the river under it, too fast and you crash past the landing slope into another river: watch the gauge. Then the Schuss into the Kehre hairpin.', width: 136, scale: 1.5, camera: true, runoff: 46, gripMul: 1, elev: true,
      theme: { grass: '#6fa35a', grass2: '#7fb366', road: '#62646d', verge: '#d8d2c0', deco: 'alpine' },
      forks: [{ at: SPLIT, split: true }], splitGlyphs: ['ramp', 'cliff'],   // (the pictograms painted in the split's two lanes, art/track.js)
      routes: [
        { name: 'the Ramp', pts: [...HEAD, ...RAMP, ...TAIL] },
        { name: 'the Cliff', pts: [...HEAD, ...CLIFF, ...TAIL] },
      ],
      // the torrent (race-cliff.js): falls is the index of its lip point; come down short and it sweeps you into a pool
      // beside the Valley Straight (pool: [x, y, rx, ry]) and you rejoin short of the line (out)
      cliffs: [{ lip: at(LIP), land: at(LAND), flat: at(FLAT), torrent: { falls: 6, pts: [...HEAD_T, at(LIP + 270), at(LIP + 340), at(LIP + 460), at(LIP + 525), [290,951],[335,1008],[420,1030],[530,1005],[640,962],[770,930],[890,935],[975,990],[995,1080],[1045,1180],[965,1208],[902,1240],[880,1268],[868,1290]], pool: [866,1300,128,52], out: [840,1450], ride: 14.05 },
        // the spill (an overshoot): crash past the landing and skid into it; it washes you up beside the Schuss (`quick`
        // phases; `skid`: the crash across to the water)
        spill: { pts: [[-330,1010],[-230,1080],[-130,1150],[-75,1215],[-70,1300],[-45,1390],[-5,1470],[10,1535],[12,1572]], pool: [10,1590,82,50], out: [178,1572], ride: 5.0, quick: 0.7, skid: 0.7, jetty: false } }],
      // a single box (the Valley Straight's and the Ridge's rows stay pairs):
      singleBoxes: [[2229,592,0.6]],   // the outside of the second Switchback hairpin (the left that tightens), on its tight end: carry speed through it, uphill
      widths: [[1300,1450,1.2,420],[...at(LIP - 200),1.2,200],[...at(LAND + 80),1.3,130]],
      // the scenery (art/alpine.js): peaks ([x, y, r, height]), the stream and waterfall (falls: its lip), the observatory and
      // cable car
      peaks: [[1300,-260,330,420],[700,-220,300,330],[2000,-240,300,360],[-650,250,380,360],[-700,900,330,260],[2650,500,330,300],[2650,1150,300,180],[-250,1700,300,120],[2550,1850,280,90]],
      stream: [[1300,430],[1265,610],[1300,790],[1295,880],[1330,1100],[1350,1300],[1360,1600],[1400,1680]], falls: 2, lake: [1420,1740,150],
      observatory: [1470,330], cable: [[1730,1650],[1250,330]],
    }];
  })(),
  // a steampunk clocktower with real heights (race-elevation.js): the Plaza, the Escapement, up inside the tower (Lower
  // Gallery, the Ratchet, Upper Gallery, the Mainspring: a 360° coil over its own way in), the Dial (a balcony round the
  // clock face whose backwards minute hand sweeps across it, race-clock.js: beat a blade or follow it in), Cog Esses,
  // Belfry Turn, the Pendulum Drop, the Foot (slowest corner after the fastest straight). Every 15 s the strike doubles
  // every pad.
  ...(() => {
    // the Dial: an arc of radius RR round the arbor C, from heading north round 120° to west-south-west; arches at each end
    const C = [1830,300], RR = 220;
    const rot = (h, a) => [h[0] * Math.cos(a) - h[1] * Math.sin(a), h[0] * Math.sin(a) + h[1] * Math.cos(a)];
    const arc = (h, turns, z) => {   // the layout points of a run of left turns on that one circle (no straight between)
      let P = [C[0] - h[1] * RR, C[1] + h[0] * RR]; const out = [];
      for (const a of turns) { const t = RR * Math.tan(Math.abs(a) / 2), V = [P[0] + h[0] * t, P[1] + h[1] * t]; h = rot(h, a); P = [V[0] + h[0] * t, V[1] + h[1] * t]; out.push([V[0], V[1], RR, z]); }
      return out;
    };
    return [{ name: 'Race Condition', desc: 'A steampunk clocktower gone haywire. Up inside the tower between its giant gears (the Escapement, the Ratchet and the Mainspring coil, climbing over itself), then out round the Dial, a fast balcony sweeper round the great clock face, whose minute hand runs backwards: each end of it comes over the arch at the top of the East Face and sweeps right across the balcony the way you go, a little slower than you. Beat it over the arch, or lift and let it get well ahead before you follow it round. Down the Gallery over the city and the Pendulum Drop, where the great pendulum swings right across the road: flat out between swings, or lift and pass behind it. Every 15 s the tower strikes: for a moment every boost pad fires double.', width: 140, scale: 1.5, camera: true, runoff: 46, gripMul: 1, bridge: 'second', elev: true,
      theme: { grass: '#6b5a48', grass2: '#76644f', road: '#5d5a62', verge: '#c99a4a', deco: 'clock' },
      pts: [[700,1500,0,0],[1950,1500,75,0],[1950,1290,75,10],[1000,1290,140,72],[1000,1060,55,92],
        [1700,1060,140,158],[1700,600,150,205],[1400,600,150,232],[1400,840,120,252],[2050,840,130,278],
        ...arc([0,-1], [-Math.PI / 3, -Math.PI / 3], 300),
        [1300,352,190,280],[1000,352,170,250],[500,852,150,140],[500,1500,60,0]],
      widths: [[1300,1500,1.2,380],[1000,352,1.15,160]],
      pads: [[1500,1290],[2050,690],[1150,1500]],
      // the clock (race-clock.js), layout units: face and arbor; minute hand (arms: blades from r0 inside the road to len past
      // it; dir -1: the way the karts go; open: the balcony's span in screen degrees where blades reach the road); hour hand
      // (face only); the pendulum; the strike every `every` s for `dur` s
      clock: { dial: [...C, 150], hands: [{ len: 272, r0: 160, w: 12, period: 7, phase: 0.35, dir: -1, arms: 2, open: [-123, 3] }], hour: { len: 110, period: 80 },
        pendulums: [{ at: [500,1070], amp: 95, r: 30, period: 5, phase: 0.1 }], chime: { every: 15, dur: 2.5 } },
      // the scenery (art/clock.js): walls, Plaza, the clock platform, gears ([x, y, r]; touching ones mesh), the Mainspring
      clockArt: { tower: [900,500,2160,1440], plaza: [370,1446,2180,1610], platform: 300, spring: [1550,722,62],
        gears: [[1120,1175,52],[1222,1175,48],[1330,1175,58],[1440,1175,52],[1545,1175,53],[1650,1175,55],[1758,1175,50],[1480,950,50],[1585,950,52],
          [1150,760,140],[1300,600,79],[1000,600,70],[1875,695,92],[1880,950,55],[1810,1395,42]] },
    }];
  })(),
  // a rainy cyber-city at night (art/neon.js) with heights and rain (race-rain.js), a figure of eight on three levels:
  // Neon Boulevard, Plaza Corner (hairpin after the fastest stretch), the Cloverleaf (270°, tightening, climbing), the
  // freeway (the Merge, Overpass Sweeper), the Storm Drain (first puddle), the Gutter, the Corkscrew (a car park coil,
  // two turns), the Rooftop and the Gap (a cannon across the alley: under ~80% top speed you drop in), the Fire Escape
  // and the Sump (second puddle). Ground level 25, dips to 0; the higher road is the deck (bridge: 'high').
  ...(() => {
    const rot = (h, a) => [h[0] * Math.cos(a) - h[1] * Math.sin(a), h[0] * Math.sin(a) + h[1] * Math.cos(a)];
    // a run of arcs from P heading h: each [turn (rad, + right), r, height]; arcs of different radii get a straight
    // between them so neither rounding is cut short
    const chain = (P, h, segs) => {
      const out = [];
      segs.forEach(([a, r, z], k) => {
        const t = r * Math.tan(Math.abs(a) / 2), V = [P[0] + h[0] * t, P[1] + h[1] * t];
        h = rot(h, a); P = [V[0] + h[0] * t, V[1] + h[1] * t]; out.push([V[0], V[1], r, z]);
        const nx = segs[k + 1]; if (nx) { const g = Math.abs(t - nx[1] * Math.tan(Math.abs(nx[0]) / 2)) + 1; P = [P[0] + h[0] * g, P[1] + h[1] * g]; }
      });
      return { pts: out, P, h };
    };
    // the Corkscrew: a stretched trochoid seen from above (radius R0 -> R1, centre moving D up the screen per turn), from
    // (x0, y0) heading west to 2¼ turns (+ `out` rad) later, as tangent-meeting layout points every `step`. Heights
    // (z0 -> z1) only on corners well clear of the other turns
    const coil = (x0, y0, R0, R1, D, step, z0, z1, out) => {
      const c = D / (2 * Math.PI), th0 = -Math.asin(c / R0), th1 = 4.5 * Math.PI + out, n = 5000, S = [];
      for (let k = 0; k <= n; k++) { const th = th0 + (th1 - th0) * k / n, R = R0 + (R1 - R0) * k / n; S.push([-R * Math.sin(th), -c * th + R * Math.cos(th), -R * Math.cos(th), -c - R * Math.sin(th)]); }
      const ox = x0 - S[0][0], oy = y0 - S[0][1], head = [0], d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      let A = 0;
      for (let k = 1; k <= n; k++) { let a = Math.atan2(S[k][3], S[k][2]) - Math.atan2(S[k - 1][3], S[k - 1][2]); while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; A += a; head.push(A); }
      const m = Math.round(A / step), B = [], V = [];
      for (let j = 0, k = 0; j <= m; j++) { while (k < n && head[k + 1] <= A * j / m) k++; const q = S[k], l = Math.hypot(q[2], q[3]); B.push([q[0] + ox, q[1] + oy, q[2] / l, q[3] / l]); }
      for (let j = 0; j < m; j++) { const [ax, ay, ux, uy] = B[j], [bx, by, vx, vy] = B[j + 1], t = ((bx - ax) * vy - (by - ay) * vx) / (ux * vy - uy * vx); V.push([ax + ux * t, ay + uy * t]); }
      const pts = V.map((v, j) => {
        let t = (d(v, B[j]) + d(v, B[j + 1])) / 2;
        if (j > 0) t = Math.min(t, d(v, V[j - 1]) / 2); if (j < m - 1) t = Math.min(t, d(v, V[j + 1]) / 2);
        return [v[0], v[1], t / Math.tan(A / m / 2)];
      });
      let last = -9;
      pts.forEach((p, j) => {
        let near = 1e9; for (let k = 0; k <= n; k += 10) if (Math.abs(head[k] - A * (j + 0.5) / m) > 1.5) near = Math.min(near, d(p, [S[k][0] + ox, S[k][1] + oy]));
        if (near > 90 && j - last >= 2) { p.push(z0 + (z1 - z0) * (j + 0.5) / m); last = j; }
      });
      return { pts, P: [B[m][0], B[m][1]], h: [B[m][2], B[m][3]] };
    };
    const Q = Math.PI / 4, RY = 920;   // RY: the Rooftop's line
    const helix = coil(620, 2020, 150, 120, 260, Math.PI / 8, 27, 80, 0.5);
    const RC = helix.P[0] + helix.h[0] * (RY - helix.P[1]) / helix.h[1];   // the Roof Corner, on the line out of the coil's top
    const XF = RC + 950;    // where the freeway comes down over the Boulevard
    const CX = XF + 820;    // the Ramp up to the Cloverleaf
    const clover = chain([CX, 600], [0, -1], [[Q, 210, 30], [Q, 180, 38], [Q, 150, 46], [Q, 125, 55], [Q, 104, 64], [Q, 90, 72]]);
    const SD = [XF, 1450], SUMP = [XF - 90, 960];   // the Storm Drain and the Sump: the dips, where the puddles lie
    return [{ name: 'Neon Overflow', desc: 'A rainy cyber-city at night, on three levels. Rain comes and goes: in the wet every corner grips less, so lift earlier, but the karts squeegee a dry line into the road where they drive, so the racing line grips better lap by lap while off it stays wet. Where water pools in the dips (the Storm Drain at the foot of the freeway, the Sump at the foot of the Fire Escape), hit a puddle flat out and you aquaplane: no steering for a moment. Lift to cross it, or skate it and hope. Up the Cloverleaf, a loop that tightens as it climbs, onto the freeway and down over the Boulevard; then up the Corkscrew, a car park the road climbs round twice, out across the roof and over the Gap to the next one: too slow at the ramp and you drop into the alley.', width: 140, scale: 1.4, camera: true, runoff: 46, gripMul: 1, bridge: 'high', elev: true, rev: 2,
      theme: { grass: '#121729', grass2: '#1a2140', road: '#383e5c', verge: '#0d1222', deco: 'neon' },
      pts: [
        [XF + 680, 1000, 0, 25],                                                   // Neon Boulevard (the start)
        [XF + 1160, 1000, 50, 25], [XF + 1160, 860, 50, 25],                       // Plaza Corner
        [CX, 860, 150, 26],                                                        // the Ramp
        ...clover.pts,                                                             // the Cloverleaf, up over its on-ramp
        [XF + 520, clover.P[1], 500, 86],                                          // the Merge
        [XF, 760, 230, 90],                                                        // the Overpass Sweeper
        [...SD, 300, 2],                                                           // down over the Boulevard to the Storm Drain
        [helix.pts[0][0] + 330, 2020, 100, 25],                                    // the Gutter onto Garage Street
        ...helix.pts,                                                              // the Corkscrew
        [RC, RY, 170, 80], [RC + 360, RY, 0, 80],                                  // the Roof Corner, the Rooftop to the ramp
        [RC + 505, RY, 0, 58], [RC + 625, RY, 0, 40],                              // over the Gap to the next roof, the Fire Escape
        [XF - 240, RY, 320], [...SUMP, 0, 4], [XF + 60, 1000, 320], [XF + 140, 1000, 0, 25],   // the Sump
      ],
      // rain (race-rain.js): spells on a per-race timetable (race.rng): `first` (s after GO), `spell` length, `gap` between,
      // `wetStart` chance; `puddles`: [x, y, half-length] full width in the dips
      rain: { first: [3, 12], spell: [14, 26], gap: [9, 20], wetStart: 0.45, puddles: [[...SD, 95], [...SUMP, 95]] },
      // the Boulevard wide; the car park's ramps narrow
      widths: [[XF + 450, 1000, 1.2, 420], ...helix.pts.filter(p => p.length > 3).map(p => [p[0], p[1], 0.85, 140])],
      // single boxes (the rows on the Cloverleaf, Garage Street and the Boulevard stay pairs):
      singleBoxes: [[1590, 794, 0.65],    // out wide on the Overpass Sweeper's exit: carry speed through it and you run out onto it
        [533, 1993, -0.6]],               // out wide on the Corkscrew's first sweep: carry speed off Garage Street and you run out onto it
      // no boxes in the Corkscrew, Plaza Corner or the run-up to the Gap: one would pull the line off the apex or the ramp
      noBoxes: [...[0, 1].map(k => { const H = helix.pts.slice(k * helix.pts.length / 2, (k + 1) * helix.pts.length / 2), p = H.reduce((a, b) => b[2] < a[2] ? b : a); return [p[0], p[1], 450]; }), [XF + 1160, 930, 200], [RC + 120, RY, 260]],
      // the Gap: a ramp off the Rooftop across the alley to the next roof (a cannon: race.js)
      jumps: [[RC + 360, RY]], gaps: [[RC + 440, RY, 100]],
      // the scenery (art/neon.js): the Spire ([x, y, r]), the monorail, the Merge's slip road, the car park ([x0, y0, x1, y1])
      // and the Gap's two roofs
      city: { spire: [CX + 230, 520, 44], monorail: [[1100, 2600], [2000, 1700], [2400, 1500], [3400, 1500]],
        slip: [[XF + 715, 420], [XF + 665, 560], [XF + 545, 598]], garage: [300, 1180, 850, 2110], roofs: [[RC - 70, RY - 130, RC + 390, RY + 130], [RC + 490, RY - 130, RC + 610, RY + 130]] } }];
  })(),
  // a busy airport (race-jets.js, race-belts.js, art/airport.js): the Runway Straight (jets blast down it: a slingshot
  // if you're behind one), Blast Fence turn, Cargo Road across taxiway Charlie, Hangar Corner, Bravo Chicane, the
  // terminal (walkways, the baggage Carousel) and a fork: the Concourse (route 0, long way) or the Travelator (route 1,
  // a wrong-way walkway: slow unless boosting). Then the West Road and the tunnel under the runway.
  ...(() => {
    const HEAD = [[1100,850],[2550,850,75],[2550,250,260],[1700,250,80],[1600,150,80],[1400,150,80],[1300,250,80],[480,250,110],[480,30,110],[900,30,220]];
    const LONG = [[1180,-330,55]], SHORT = [[900,-330,70]];
    const TAIL = [[650,-330],[200,-330,160],[200,350,100],[750,850,260]];
    const tight = (S, k) => S.map((p, i) => i === S.length - 1 ? [p[0], p[1], k] : p);   // the fork corner is a tighter arc on the shortcut
    return [{ name: 'Gateway 8080', desc: 'A busy airport, jets taxiing and taking off all round the road. A jet running up at the hold blasts straight down the Runway Straight: be behind it as it goes and it slingshots you past your top speed. At the Bravo Chicane and on the Cargo Road the jets cross the road (the red lights flash): beat one across or wait for it, and its blast shoves you sideways as it goes. In the glass terminal the moving walkways carry you faster: ride the baggage belt round the inside of the Carousel, and at the fork lift into the Travelator, a shortcut whose walkway runs the wrong way (only worth it boosting). Then down the West Road and through the tunnel under the runway.', width: 140, scale: 1.5, camera: true, runoff: 46, gripMul: 1,
      theme: { grass: '#8fc46a', grass2: '#9fd07a', road: '#5f636c', verge: '#e8e2cf', deco: 'airport' },
      forks: [{ at: [900,30] }],
      routes: [
        { name: 'the Concourse', pts: [...HEAD, ...LONG, ...TAIL] },
        { name: 'the Travelator', pts: [...tight(HEAD, 70), ...SHORT, ...TAIL] },
      ],
      // the airport (race-jets.js): the runway (ends, half-width), the jets' taxi paths (layout points, r: the turn) to the
      // hold, and the blast fence
      jets: { runway: [[300,700],[2280,700],73], fence: [[2390,590],[2390,790]],
        taxi: { B: [[1500,-950],[1500,700,100],[1000,700]], C: [[3600,520],[2330,520,80],[2330,700,60],[2150,700]] } },
      // the moving walkways (race-belts.js; lat: a share of the half-width, + the driver's right; v: + with you)
      belts: [{ from: [1200,250], to: [700,250], lat: -0.5, w: 64, v: 120 },   // Check-in: the outside lane into the Carousel
        { from: [600,250], to: [600,30], lat: 0.52, w: 62, v: 140, ring: true },  // the Carousel's baggage belt, round its inside
        { from: [620,30], to: [750,30], lat: 0.5, w: 64, v: 120 },              // Departures: the outside of the Travelator's turn-off
        { from: [1060,-330], to: [700,-330], lat: -0.5, w: 64, v: 120 },        // the Concourse's way back: the inside of the turn onto the West Road
        { from: [900,-45], to: [900,-255], w: 'full', v: -170 }],               // the Travelator: the shortcut, all of it the wrong way
      widths: [[900,-150,0.8,110]],
      // the rest of the airport (art/airport.js): terminal walls, stands ([x, y, heading deg]), aprons, tower, hangar
      airport: { terminal: [290,-420,1270,330], gates: [[620,460,-90],[880,460,-90],[1140,460,-90]],
        aprons: [[300,330,1300,600],[1620,-420,2470,110],[2640,330,3200,640]], parked: [[1780,-230,-90],[2020,-230,-90],[2260,-230,-90],[2800,480,180]],
        tower: [1950,560], hangar: [2170,450] },
    }];
  })(),
  // a ski run, summit to valley (open, elev; race-ski.js). On snow lifting bleeds under half as much (liftK). Summit
  // Schuss, the Corduroy (three tightening carves), the Pine Glade (a wide treed snowfield round a bend: the drift carves
  // you to its inside), Hut Corner, the Park (a split: tricks for boosts), the Big Air (a ski jump, race-cliff.js), the
  // Ledge (a split: a shelf on the inside), the Slalom, the Elbow, the Moguls, the Black Forest (trees you thread with the
  // drift) and the Last Schuss.
  ...(() => {
    const sc = 1.6, H0 = 4800;   // (the summit: the valley comes out a little over 0, as the minimap's height tint wants)
    // [x, y, r, grade of the way to it] (layout units; grade: drop per unit along), and points with their own height
    const XJ = 4200;   // the Big Air's x
    // a long sweeping bend (the fields): from p, heading a0 to a1 (degrees off straight down, + west), radius R as n
    // rounded corners, at grade g. Returns the corners and the end (e: last point, h: heading)
    const hd = a => [-Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180)];
    const bend = (p, a0, a1, R, n, g) => {
      const da = (a1 - a0) / n, t = R * Math.tan(Math.abs(da) * Math.PI / 360), V = [];
      let [x, y] = p, a = a0;
      for (let i = 0; i < n; i++) { const [hx, hy] = hd(a); x += hx * (i ? 2 * t : t); y += hy * (i ? 2 * t : t); V.push([Math.round(x), Math.round(y), R, g]); a += da; }
      const [hx, hy] = hd(a1); return { V, e: [x + hx * t, y + hy * t], h: [hx, hy] };
    };
    const GLADE = bend([1645, 2810], -23, 23, 3820, 4, 0.13);   // the Pine Glade: a long sweeping right (its inside: the west)
    const HUT = [GLADE.e[0] + GLADE.h[0] * 350, GLADE.e[1] + GLADE.h[1] * 350];
    const P = [[2000,0,0,0],[2000,500,0,0.05],[2000,1300,450,0.10],[900,2000,260,0.12],[1450,2350,160,0.11],   // the Summit Schuss, the Corduroy
      ...GLADE.V,
      [...HUT.map(Math.round),95,0.12],[XJ,7050,200,0.05]];   // Hut Corner, the traverse (the Park) onto the inrun
    const LIP = [XJ,7950], LAND = 520, FLAT = 780;   // the Big Air: the lip, the landing hill from LAND to FLAT past it (layout)
    const JUMP = [[XJ,7400,0,'g',0.17],[...LIP,0,'h',0],[XJ,LIP[1] + 20,0,'h',-3],[XJ,LIP[1] + 90,0,'h',-100],[XJ,LIP[1] + LAND,0,'h',-147],[XJ,LIP[1] + FLAT,0,'h',-174]];
    const AIR = 1500;   // everything below the Big Air sits past its long outrun, so a boost off the jump has room
    const E = ([x, y, ...r]) => [x, y + AIR, ...r];
    const D = ([x, y, ...r]) => [x - 974, y + 1746 + AIR, ...r];   // (everything below the Slalom: moved on down its straight, 2000 longer since round three)
    const MOG = 800;   // (the Moguls' long right: 800 longer since round five, and everything below it moved on)
    const DM = ([x, y, ...r]) => D([x, y + MOG, ...r]);
    const FOREST = bend(DM([880, 15350]), 10, -36, 3400, 4, 0.12);   // the Black Forest: a long sweeping left (its inside: the east)
    const LS = [FOREST.e[0] + FOREST.h[0] * 420, FOREST.e[1] + FOREST.h[1] * 420].map(Math.round);
    const REST = [...[[XJ + 50,10350,800,0.08],[2900,10300,450,0.08]].map(E),   // the outrun into the Ledge's big right (the drop on its inside), out of it to the left
      ...[[1450,12900,0,0.11],[1400,13350,300,0.12],[1120,13560,95,0.06]].map(D),   // the Slalom down to the Elbow (tightening left)
      ...[[1800,14050,380,0.09],[950,14950,500,0.10]].map(DM),   // the Moguls: a long right
      ...FOREST.V,
      [...LS,320,0.10],[LS[0] + 1400,LS[1] + 400,0,0.05],[LS[0] + 2100,LS[1] + 450,0,0.02]];   // round to the lodge: the Last Schuss and the run-out
    const mid = B => [0, 1].map(k => Math.round((B.V[1][k] + B.V[2][k]) / 2));   // (the middle of a bend: the fields' widths are over the whole of it)
    const pts = []; let h = H0, prev = null;
    const add = ([x, y, r, g]) => { if (prev) h -= g * Math.hypot(x - prev[0], y - prev[1]) * sc; pts.push([x, y, r, Math.round(h)]); prev = [x, y]; };
    for (const q of P) add(q);
    let hL = 0;
    for (const [x, y, r, k, v] of JUMP) { if (k === 'g') add([x, y, r, v]); else { if (!v) hL = h - 0.17 * Math.hypot(x - prev[0], y - prev[1]) * sc; h = hL + v; pts.push([x, y, r, Math.round(h)]); prev = [x, y]; } }
    for (const q of REST) add(q);
    return [{ name: 'Gradient Descent', desc: 'A ski run from the summit to the lodge in the valley: one long descent, and on snow you can\'t really slow down (lifting barely bites; gravity keeps pulling). Carve the Corduroy, then the Pine Glade: a vast snowfield round one long, sweeping bend, clumps of pines all over it, as thick on the outside as on the inside, and no way round them. You\'re too fast to hold the bend: off the drift you\'re swept out, hold the drift and you carve in, and nothing steers for you (the snow shows both ways your line can go, an arrow at the end of each, the drift\'s marked). At its foot it funnels back into the piste. On the traverse, hold drift as you cross the flags into the Park (let go for the piste): a funbox, a box to slide (hold drift), the halfpipe (pump it: drift the way you swing) and a big kicker; let go right at each lip for a trick, each one in a row popping you harder, and a clean run beats the piste by a second or more. Off the Big Air, every drift press turns you a third of a flip: land on a whole number of flips for a boost that grows with every flip (on a third you crash), then use it down the long outrun. At the Ledge, hold drift across the flags for a shelf barely wider than your kart across a cliff face: shorter, but run wide and you fall; or ride the piste round the outside and trick its three kickers. Weave the Slalom\'s long run of poles (drift left, right, left), weave the Moguls\' evenly spread bumps with the drift (hit one fast and it launches you; let go of the gas just before one to soften it), then thread the Black Forest: trees from edge to edge and no way round, your drift against the sweep.', width: 200, scale: sc, camera: true, runoff: 60, gripMul: 1, open: true, elev: true, liftK: 0.45, tiles: 40, rev: 6,
      theme: { grass: '#e8f0f8', grass2: '#f6fafd', road: '#f4f8fc', verge: '#dce8f4', deco: 'ski' },
      pts,
      cliffs: [{ lip: LIP, land: [XJ, LIP[1] + LAND], flat: [XJ, LIP[1] + FLAT], short: 'crash', snow: true }],
      ski: {
        glades: [{ at: GLADE.V[0], to: [1729, 5582], kind: 'glade', seed: 4 }, { at: FOREST.V[0], to: FOREST.V[3], kind: 'forest' }],
        park: { at: [2250, 6340], to: [3950, 6950], side: -1, lane: 280, island: 50, vIn: 0.86, decide: 900 },
        ledge: { at: E([4238, 9480]), to: E([3330, 10316]), side: 1, lane: 68, island: 90, vIn: 1.0, decide: 800, kickers: [400, 1000, 1600] },
        // the Slalom's gates from `at`: [gap before it (world units), how far out the line passes, the weave's middle (+ left)]
        slalom: { at: E([2608, 10824]), gates: [[0, 60], [440, 60], [440, 60], [440, 60], [440, 60], [340, 45], [340, 45], [640, 120], [440, 60, 70], [440, 60, 70], [560, 110], [420, 55], [420, 55], [420, 55], [420, 55], [420, 55]] },
        moguls: { at: D([1250, 13700]), to: DM([1050, 14850]) },
      },
      widths: [[2000,250,1.4,250],[1948,4216,6.5,828,1000],[3000,6600,3.0,1150,250],[XJ,7600,0.9,330],[XJ,LIP[1] + 650,1.6,300],E([4040,10140,4.4,780,650]),E([1650,12540,1.7,2100,200]),D([1715,14750,2.2,1210,200]),[...mid(FOREST),3.6,1070,700],[LS[0] + 900,LS[1] + 260,1.6,700]],
      singleBoxes: [],
    }];
  })(),
];
