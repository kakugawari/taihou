/*!
 * app.js — 画面まわり。操作・描画・音。決まりごと (面・弾・当たり) は core.js。
 */
(() => {
'use strict';

const C = window.Core;
const VERSION = '3';

/* ========== 画面 ========== */
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const view = { W: 0, H: 0 };
function resize() {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!(w >= 1 && h >= 1)) return;          // 回転中などに 0 が来ることがある。前の大きさのままにする
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = view.W = w; H = view.H = h;
  portalSprites = [];
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildBackdrop();
}
addEventListener('resize', resize);
const X = (x) => x * W, Y = (y) => y * H;
const FONT = getComputedStyle(document.body).fontFamily;

/* ========== 音 ========== */
let AC = null, soundOn = true;
const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
function tone(f1, f2, dur, type = 'sine', vol = .2) {
  if (!soundOn || scene === 'title') return; const a = ac(), t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, f, vol = .3) {
  if (!soundOn || scene === 'title') return; const a = ac(), t = a.currentTime;
  const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(); s.buffer = b;
  const bp = a.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.setValueAtTime(f, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(80, f * .25), t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(a.destination); s.start(t);
}
const sFire = () => { noise(.18, 1700, .26); tone(340, 90, .16, 'square', .11); };
const sFireRifle = () => { noise(.09, 2600, .2); tone(680, 260, .08, 'square', .09); };
const sBoom = () => { noise(.44, 900, .38); tone(160, 42, .34, 'sine', .18); };
const sHit = () => { tone(900, 1500, .1, 'triangle', .18); setTimeout(() => tone(1340, 1850, .09, 'triangle', .13), 70); };
const sBounce = () => tone(700, 420, .09, 'triangle', .14);
const sSplit = () => { tone(500, 1100, .12, 'square', .12); noise(.12, 2200, .14); };
const sClang = () => { noise(.12, 4200, .2); tone(1800, 900, .12, 'square', .09); };
const sClear = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f * 1.5, .3, 'triangle', .16), i * 110));
const sWarp = () => { tone(260, 1300, .16, 'sine', .15); setTimeout(() => tone(1300, 520, .12, 'triangle', .09), 60); };
const sFail = () => tone(300, 120, .5, 'sawtooth', .13);

/* ========== 保存 ========== */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function store(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } }
let save = {};
try { save = JSON.parse(load('yamanari', '{}')) || {}; } catch (e) { save = {}; }
soundOn = load('yamanari_snd', '1') !== '0';

/* ========== 状態 ========== */
let lv = 0, scene = 'title', pal = C.SKIES[0];
let terrain = [], foes = [], bullets = [], parts = [], rings = [], texts = [], smoke = [];
let ammo = {}, sel = 'n', shake = 0, flash = 0, hitstop = 0, endTimer = 0, gunRecoil = 0, comboCount = 0;
let kindsInLevel = [];
let aiming = false, aimX = 0, aimY = 0, bolt = 0;
let lastResult = null;
let wind = 0, portals = [], gusts = [];   // この面のかぜ (+ は右) とゲート
let demoT = 0, demoAng = -Math.PI / 4, demoShots = 0, demoKind = 0;   // タイトルの飾りの試し撃ち
let textFont = '';   // 字を書くときに効いている font (テスト用)

/* ========== 背景生成 ========== */
let mts = null, stars = [], clouds = [], drops = [], castleBg = null;
let bseed = 1; const rnd = () => (bseed = (bseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function buildBackdrop() {
  if (!W) return;
  pal = C.skyOf(lv); bseed = 1000 + lv * 97;
  mts = []; castleBg = null;
  for (let l = 0; l < 3; l++) {
    const base = 0.44 + l * 0.055, amp = 0.085 - l * 0.018, pts = [];
    if (pal.castle && l === 2) break;           // 一番手前は山ではなく城を描く
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push([t, base - Math.abs(Math.sin(t * Math.PI * (1.1 + l * 0.7) + rnd() * 2)) * amp - rnd() * 0.02]);
    }
    mts.push(pts);
  }
  if (pal.castle) {
    castleBg = { wallTop: 0.53, towers: [
      { x: 0.03, w: 0.08, top: 0.45, roof: 0.07 },
      { x: 0.22, w: 0.09, top: 0.41, roof: 0.085 },
      { x: 0.41, w: 0.16, top: 0.33, roof: 0.11, keep: 1 },
      { x: 0.64, w: 0.09, top: 0.40, roof: 0.085 },
      { x: 0.86, w: 0.08, top: 0.44, roof: 0.07 }
    ] };
  }
  stars = []; for (let i = 0; i < pal.stars; i++) stars.push({ x: rnd(), y: rnd() * 0.45, r: rnd() * 1.6 + 0.5, p: rnd() * 6 });
  clouds = []; if (pal.clouds) for (let i = 0; i < 4; i++) clouds.push({ x: rnd(), y: 0.12 + rnd() * 0.2, s: 0.07 + rnd() * 0.07, v: 0.006 + rnd() * 0.01 });
  gusts = []; if (wind) for (let i = 0; i < 34; i++) gusts.push({ x: rnd(), y: 0.08 + rnd() * 0.78, v: 0.7 + rnd() * 0.8, l: 0.05 + rnd() * 0.07 });
  drops = []; if (pal.rain) for (let i = 0; i < 60; i++) drops.push({ x: rnd(), y: rnd(), v: 0.9 + rnd() * 0.5 });
}

/* ========== 面の読み込み ========== */
function loadLevel(i) {
  lv = i;
  terrain = C.LEVELS[i].terrain;
  ammo = C.startingAmmo(i);
  kindsInLevel = C.kindsIn(i);
  sel = C.ORDER.find((k) => ammo[k] > 0) || 'n';
  foes = C.makeFoes(i);
  wind = C.LEVELS[i].wind || 0; portals = C.LEVELS[i].portals || [];
  const nWind = wind ? Math.ceil(Math.abs(wind) / 0.15) : 0;
  $('wind').textContent = wind ? 'かぜ ' + (wind > 0 ? '▶'.repeat(nWind) : '◀'.repeat(nWind)) : '';
  bullets = []; parts = []; rings = []; texts = []; smoke = [];
  shake = 0; flash = 0; hitstop = 0; endTimer = 0; gunRecoil = 0; bolt = 0; comboCount = 0;
  buildBackdrop(); drawBelt();
  $('stgNum').textContent = i + 1;
}

/** タイトル画面: ゲームの中身 (地形・全部の種類の敵) を並べ、大砲が勝手に試し撃ちする。 */
function loadTitle() {
  lv = 0;
  terrain = C.TITLE.terrain; foes = C.foesFrom(C.TITLE.enemies);
  wind = 0; portals = []; ammo = { n: 9 }; kindsInLevel = ['n']; sel = 'n';
  bullets = []; parts = []; rings = []; texts = []; smoke = [];
  shake = 0; flash = 0; hitstop = 0; gunRecoil = 0; bolt = 0; demoT = 0.7; aiming = false;
  buildBackdrop();
}
const DEMO_KINDS = ['n', 'r', 'b', 's'];
function demoShot() {
  const kind = DEMO_KINDS[demoKind++ % DEMO_KINDS.length];
  const m = C.muzzle(view);
  let aim = null;
  for (let t = 0; t < 30; t++) {   // 敵の手前の地形に落ちる撃ち方を探す
    const deg = -(38 + Math.random() * 34), pw = 0.45 + Math.random() * 0.5;
    const r = deg * Math.PI / 180, d = pw * H * C.MAXDRAG;
    const a = C.aimVec(m.x + Math.cos(r) * d, m.y + Math.sin(r) * d, view);
    const shot = C.simulateShot(terrain, kind, a, view, null, 60);
    aim = a;
    if (shot.type === 'ground' && shot.x > W * 0.32 && shot.x < W * 0.98) break;
  }
  sel = kind; demoAng = aim.ang;
  const v = C.launchVelocity(kind, aim, view);
  bullets.push(newBullet(m.x, m.y, v.vx, v.vy, kind));
  gunRecoil = 1; demoShots++;
  puff(m.x, m.y, 3, H * .02);
}

const solid = (px, py) => C.solid(terrain, px, py, view);

/* ========== 発射 ========== */
const muzzle = () => C.muzzle(view);
const aimVec = () => C.aimVec(aimX, aimY, view);
function newBullet(x, y, vx, vy, kind) {
  return { x, y, vx, vy, kind, blast: C.AMMO[kind].blast, bounce: kind === 'b' ? 2 : 0, split: kind === 's',
    gmul: C.AMMO[kind].gmul || 1, wx: wind, trail: [], life: 0 };
}
function fire() {
  const A = C.AMMO[sel] || {}, maxAir = A.maxAir || 1;
  if (bullets.length >= maxAir || !ammo[sel]) return;
  const a = aimVec(), m = muzzle(), v = C.launchVelocity(sel, a, view);
  bullets.push(newBullet(m.x, m.y, v.vx, v.vy, sel));
  ammo[sel]--; comboCount = 0; gunRecoil = 1; shake = Math.max(shake, sel === 'r' ? 3 : 5);
  (sel === 'r' ? sFireRifle : sFire)();
  const spN = sel === 'r' ? 6 : 12;
  for (let i = 0; i < spN; i++) {
    const s = Math.random() * .6 + .2;
    parts.push({ x: m.x, y: m.y, vx: a.ux * H * s * .55 + (Math.random() - .5) * 70, vy: a.uy * H * s * .55 + (Math.random() - .5) * 70,
      r: H * .006 * Math.random() + 1.5, life: .3, max: .3, c: '#FFD98A' });
  }
  puff(m.x, m.y, sel === 'r' ? 2 : 4, H * .02);
  if (!ammo[sel]) { const nx = C.ORDER.find((k) => ammo[k] > 0); if (nx) sel = nx; }
  drawBelt();
}
function puff(x, y, n, r) {
  for (let i = 0; i < n; i++) smoke.push({ x: x + (Math.random() - .5) * r, y: y + (Math.random() - .5) * r,
    vx: (Math.random() - .5) * H * .06, vy: -Math.random() * H * .05, r: r * (.6 + Math.random() * .7), life: .9, max: .9 });
}
function splitBullet(b) {
  if (!b || !b.split) return;
  const idx = bullets.indexOf(b); if (idx < 0) return;
  bullets.splice(idx, 1);
  sSplit(); if (scene !== 'title') shake = Math.max(shake, 4);
  const sp = H * 0.10;
  for (let i = -1; i <= 1; i++) {
    const nb = newBullet(b.x, b.y, b.vx + i * sp, b.vy - Math.abs(i) * sp * 0.4, 's');
    nb.split = false;
    bullets.push(nb);
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, s = (Math.random() * .3 + .08) * H;
    parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: H * .006 + 1, life: .4, max: .4, c: '#FFC46B' });
  }
}

/* ========== 爆発とダメージ ========== */
function damage(f, amt, direct) {
  const r = C.applyHit(f, amt, direct);
  if (r === 'blocked' || r === 'armor') sClang();
  if (r !== 'killed') return 0;
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, s = (Math.random() * .45 + .1) * H;
    parts.push({ x: X(f.x), y: Y(f.y), vx: Math.cos(a) * s, vy: Math.sin(a) * s - H * .22,
      r: H * .007 * Math.random() + 2, life: .7, max: .7, c: '#FFF0D6' });
  }
  puff(X(f.x), Y(f.y), 4, H * .03);
  return 1;
}
function explode(px, py, blast) {
  const sc = Math.max(.45, blast / 0.084);
  const quiet = scene === 'title';   // タイトルの試し撃ちは、揺らさず光らせず、敵も倒さない
  if (!quiet) { sBoom(); shake = Math.max(shake, 14 * sc); flash = Math.max(flash, .5 * sc); }
  rings.push({ x: px, y: py, r: H * .012, life: .45, max: .45, g: blast });
  const pn = Math.round(28 * sc);
  for (let i = 0; i < pn; i++) {
    const a = Math.random() * Math.PI * 2, s = (Math.random() * .6 + .1) * H;
    parts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s - H * .16, r: H * .008 * Math.random() + 2,
      life: .55 + Math.random() * .3, max: .85, c: Math.random() < .5 ? '#FFC46B' : '#FF8A4C' });
  }
  puff(px, py, Math.max(3, Math.round(7 * sc)), H * blast * .8);
  let got = 0;
  if (!quiet) foes.forEach((f) => { if (!f.dead && C.inBlast(f, px, py, blast, view)) got += damage(f, 1, false); });
  if (got) {
    comboCount += got; hitstop = Math.max(hitstop, .07); setTimeout(sHit, 60);
    if (comboCount > 1) texts.push({ x: px, y: py - H * .05, s: comboCount + 'たい！', life: 1.1, max: 1.1 });
  }
}

/** ゲートに入った弾: 出口に光を散らす。跡の線は切る (入口から出口へ線を引かない)。 */
function warp(b) {
  b.trail = [];
  sWarp(); shake = Math.max(shake, scene === 'play' ? 3 : 0);
  const col = '#BDF4FF';
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, sp = (Math.random() * .25 + .05) * H;
    parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: H * .005 + 1, life: .45, max: .45, c: col });
  }
}

/* ========== 更新 ========== */
function step(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 40);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
  if (gunRecoil > 0) gunRecoil = Math.max(0, gunRecoil - dt * 5);
  if (bolt > 0) bolt = Math.max(0, bolt - dt * 3);
  if (pal.rain && Math.random() < dt * 0.09) bolt = 1;

  parts.forEach((p) => { p.life -= dt; p.vy += H * 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; });
  parts = parts.filter((p) => p.life > 0);
  smoke.forEach((s) => { s.life -= dt * .9; s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= H * .02 * dt; s.r += H * .03 * dt; });
  smoke = smoke.filter((s) => s.life > 0);
  rings.forEach((r) => { r.life -= dt; r.r += H * r.g * 2.8 * dt; });
  rings = rings.filter((r) => r.life > 0);
  texts.forEach((t) => { t.life -= dt; t.y -= H * .05 * dt; });
  texts = texts.filter((t) => t.life > 0);
  clouds.forEach((c) => { c.x += (c.v + wind * 0.05) * dt; if (c.x > 1.25) c.x = -0.25; if (c.x < -0.3) c.x = 1.2; });
  gusts.forEach((g) => {
    g.x += Math.sign(wind) * g.v * Math.min(1, Math.abs(wind) * 2.2) * dt * 0.9;
    if (g.x > 1.1) { g.x = -0.1; g.y = 0.08 + Math.random() * 0.78; } else if (g.x < -0.1) { g.x = 1.1; g.y = 0.08 + Math.random() * 0.78; }
  });
  if (scene === 'title') { demoT -= dt; if (demoT <= 0) { demoShot(); demoT = 1.5 + Math.random() * 0.7; } }
  drops.forEach((d) => { d.y += d.v * dt; d.x += d.v * dt * 0.18; if (d.y > 1) { d.y = -0.05; d.x = Math.random(); } });

  foes.forEach((f) => C.moveFoe(f, dt));

  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (scene === 'title' && b.split && b.vy > 0 && b.life > .25) { splitBullet(b); continue; }   // 試し撃ちは頂点で割れる
    const h = dt / C.SUBSTEPS;
    for (let s = 0; s < C.SUBSTEPS; s++) {
      const px = b.x, py = b.y;
      C.advance(b, h, view);
      if (C.usePortals(b, portals, view)) warp(b);
      let direct = null;
      for (const f of (scene === 'title' ? [] : foes)) {
        if (f.dead) continue;
        if (Math.hypot(X(f.x) - b.x, Y(f.y) - b.y) < H * C.DIRECT_R) { direct = f; break; }
      }
      if (direct) {
        const got = damage(direct, 2, true);
        if (got) { comboCount += got; hitstop = Math.max(hitstop, .08); }
        explode(b.x, b.y, b.blast); bullets.splice(bi, 1); break;
      }
      if (solid(b.x, b.y)) {
        if (b.bounce > 0) {
          b.bounce--; sBounce(); shake = Math.max(shake, 4);
          const hx = solid(b.x, py), hy = solid(px, b.y);
          if (hx && !hy) b.vx = -b.vx; else if (hy && !hx) b.vy = -b.vy; else { b.vx = -b.vx; b.vy = -b.vy; }
          b.vx *= .72; b.vy *= .72; b.x = px; b.y = py;
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, sp = (Math.random() * .25 + .05) * H;
            parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: H * .005 + 1, life: .3, max: .3, c: '#9EF3D0' });
          }
        } else { explode(b.x, b.y, b.blast); bullets.splice(bi, 1); }
        break;
      }
      if (C.outOfBounds(b, view)) { bullets.splice(bi, 1); break; }
    }
    if (bullets[bi] === b) { b.trail.push([b.x, b.y]); if (b.trail.length > 22) b.trail.shift(); }
  }

  if (scene !== 'play') return;
  const left = foes.filter((f) => !f.dead).length;
  if (left === 0) { endTimer += dt; if (endTimer > .95) finish(true); }
  else if (C.totalLeft(ammo) === 0 && !bullets.length && parts.length < 4) { endTimer += dt; if (endTimer > 1.2) finish(false); }
  const txt = 'のこり ' + left + 'たい';
  if (leftTxt.textContent !== txt) leftTxt.textContent = txt;
}

/* ========== 描画 ========== */
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  const st = [0, .34, .60, .80, 1];
  pal.sky.forEach((c, i) => g.addColorStop(st[i], c));
  ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48);

  if (bolt > 0) { ctx.fillStyle = 'rgba(210,200,255,' + (bolt * bolt * .5) + ')'; ctx.fillRect(-24, -24, W + 48, H + 48); }

  if (stars.length) {
    // またたきは 4 段階の明るさにまとめ、段ごとに 1 回で塗る (星 120 個を 1 つずつ塗ると遅い端末で効く)
    const tNow = performance.now() / 600, buckets = [[], [], [], []];
    stars.forEach((s) => buckets[Math.min(3, (.5 + .5 * Math.sin(tNow + s.p)) * 4 | 0)].push(s));
    buckets.forEach((list, k) => {
      if (!list.length) return;
      ctx.fillStyle = 'rgba(255,255,255,' + (.25 + (k + .5) / 4 * .6) + ')';
      ctx.beginPath();
      list.forEach((s) => { ctx.moveTo(X(s.x) + s.r, Y(s.y)); ctx.arc(X(s.x), Y(s.y), s.r, 0, 7); });
      ctx.fill();
    });
  }

  if (pal.orb) {
    const o = pal.orb, sx = X(o.x), sy = Y(o.y), sr = H * .075;
    const rg = ctx.createRadialGradient(sx, sy, sr * .2, sx, sy, sr * 3.6);
    rg.addColorStop(0, 'rgba(' + o.g + ',.85)'); rg.addColorStop(.2, 'rgba(' + o.g + ',.4)');
    rg.addColorStop(1, 'rgba(' + o.g + ',0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(sx, sy, sr * 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    if (pal.stars) { ctx.fillStyle = pal.sky[1]; ctx.beginPath(); ctx.arc(sx + sr * .42, sy - sr * .3, sr * .88, 0, 7); ctx.fill(); }
  }

  clouds.forEach((c) => {
    ctx.fillStyle = 'rgba(255,250,240,.30)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(X(c.x) + i * W * c.s * .5, Y(c.y) + Math.sin(i) * H * .008, W * c.s * (.5 - i * .08), H * c.s * .22, 0, 0, 7);
      ctx.fill();
    }
  });

  if (mts) mts.forEach((pts, i) => {
    ctx.fillStyle = pal.mts[i]; ctx.beginPath(); ctx.moveTo(-24, H + 24);
    pts.forEach((p) => ctx.lineTo(X(p[0]), Y(p[1])));
    ctx.lineTo(W + 24, H + 24); ctx.closePath(); ctx.fill();
  });
  if (castleBg) drawCastleBg();

  if (wind) {
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    gusts.forEach((g) => {
      const len = W * g.l * Math.min(2, Math.abs(wind) * 3) * Math.sign(wind);
      ctx.moveTo(X(g.x), Y(g.y)); ctx.lineTo(X(g.x) + len, Y(g.y));
    });
    ctx.stroke();
  }

  if (pal.rain) {
    ctx.strokeStyle = 'rgba(200,205,235,.28)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    drops.forEach((d) => { ctx.moveTo(X(d.x), Y(d.y)); ctx.lineTo(X(d.x) - W * .012, Y(d.y) + H * .028); });
    ctx.stroke();
  }

  smoke.forEach((s) => {
    ctx.fillStyle = 'rgba(60,40,60,' + (s.life / s.max * .22) + ')';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
  });

  terrain.forEach((poly, pi) => {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.closePath(); ctx.fillStyle = pal.land; ctx.fill();
    if (pal.castle && pi > 0) {
      ctx.save(); ctx.clip();
      const xs = poly.map((p) => X(p[0])), ys = poly.map((p) => Y(p[1]));
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const bh = H * .019, bw = W * .075;
      ctx.strokeStyle = 'rgba(236,226,206,.14)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = minY, row = 0; y < maxY; y += bh, row++) {
        if (row > 0) { ctx.moveTo(minX, y); ctx.lineTo(maxX, y); }
        for (let x = minX + (row % 2) * bw / 2; x < maxX; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + bh, maxY)); }
      }
      ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = pal.edge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(poly[0][0]), Y(poly[0][1])); ctx.lineTo(X(poly[1][0]), Y(poly[1][1])); ctx.stroke();
    if (pal.castle && pi > 0) {
      const x0 = poly[0][0], x1 = poly[1][0], y0 = poly[0][1], w = x1 - x0;
      const teeth = Math.max(2, Math.round(w / 0.045)), tw = w / teeth, mh = H * .020;
      ctx.fillStyle = pal.land; ctx.strokeStyle = pal.edge; ctx.lineWidth = 1.4;
      for (let k = 0; k < teeth; k += 2) {
        const tx = X(x0 + k * tw), tx2 = X(x0 + Math.min(k + 1, teeth) * tw), ty = Y(y0);
        ctx.beginPath(); ctx.rect(tx, ty - mh, tx2 - tx, mh); ctx.fill(); ctx.stroke();
      }
    }
  });

  drawPortals();
  foes.forEach((f) => { if (!f.dead) drawFoe(f); });
  drawGun();

  if (aiming && scene === 'play' && ammo[sel] > 0 && !bullets.length) drawAim();

  bullets.forEach((b) => {
    const A = C.AMMO[b.kind];
    ctx.strokeStyle = 'rgba(255,224,150,.45)'; ctx.lineWidth = H * .006; ctx.lineCap = 'round';
    ctx.beginPath(); b.trail.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.fillStyle = A.c; ctx.shadowColor = A.glow; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(b.x, b.y, H * .012, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    if (b.split) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (.4 + .4 * Math.sin(performance.now() / 90)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, H * .022, 0, 7); ctx.stroke();
    }
  });

  rings.forEach((r) => {
    const a = r.life / r.max;
    ctx.strokeStyle = 'rgba(255,196,107,' + (a * .8) + ')'; ctx.lineWidth = H * .008 * a + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
  });
  parts.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;

  // canvas の font に 'inherit' は使えない (黙って 10px のまま描かれる)。書体名を渡す
  ctx.font = '600 ' + Math.round(H * .032) + 'px ' + FONT;
  textFont = ctx.font;
  texts.forEach((t) => {
    const a = Math.min(1, t.life / t.max * 1.6);
    ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.fillStyle = '#FFF0D6'; ctx.strokeStyle = 'rgba(40,12,50,.7)'; ctx.lineWidth = 4;
    ctx.strokeText(t.s, t.x, t.y); ctx.fillText(t.s, t.x, t.y); ctx.globalAlpha = 1;
  });

  ctx.restore();
  if (flash > 0) { ctx.fillStyle = 'rgba(255,220,160,' + (flash * .3) + ')'; ctx.fillRect(0, 0, W, H); }
}

const PORTAL_COLORS = [['#7FE8FF', '127,232,255'], ['#FF9BE8', '255,155,232']];
let portalSprites = [];   // 光と輪は動かないので、色ごとに 1 度だけ絵に描いておく (毎コマ塗ると遅い端末で効く)
function portalSprite(ci) {
  if (portalSprites[ci]) return portalSprites[ci];
  const r = H * C.PORTAL_R, half = r * 1.9, [col, rgb] = PORTAL_COLORS[ci];
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(half * 2 * DPR);
  const g = c.getContext('2d'); g.scale(DPR, DPR);
  const glow = g.createRadialGradient(half, half, r * .2, half, half, half);
  glow.addColorStop(0, 'rgba(' + rgb + ',.55)'); glow.addColorStop(.5, 'rgba(' + rgb + ',.2)'); glow.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = glow; g.beginPath(); g.arc(half, half, half, 0, 7); g.fill();
  g.fillStyle = 'rgba(12,4,28,.55)'; g.beginPath(); g.arc(half, half, r * .86, 0, 7); g.fill();
  g.strokeStyle = col; g.lineWidth = r * .16;
  g.beginPath(); g.arc(half, half, r, 0, 7); g.stroke();
  return (portalSprites[ci] = { c, half });
}
function drawPortals() {
  if (!portals.length) return;
  const now = performance.now() / 1000, r = H * C.PORTAL_R;
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = r * .1; ctx.lineCap = 'round';
  portals.forEach((p, pi) => {
    const sp = portalSprite(pi % PORTAL_COLORS.length);
    [p.a, p.b].forEach((q, qi) => {
      const x = X(q[0]), y = Y(q[1]);
      ctx.drawImage(sp.c, x - sp.half, y - sp.half, sp.half * 2, sp.half * 2);
      const rot = now * (qi ? -2.6 : 2.6) + pi;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a0 = rot + k * 2.094;
        ctx.moveTo(x + Math.cos(a0) * r * .62, y + Math.sin(a0) * r * .62);
        ctx.arc(x, y, r * .62, a0, a0 + 1.0);
      }
      ctx.stroke();
    });
  });
}

function drawCastleBg() {
  const c = castleBg, now = performance.now() / 1000;
  const stone = 'rgba(30,34,66,.97)', roofC = '#3E2F6E', roofHi = 'rgba(140,120,200,.35)';
  // 城壁と胸壁
  const wt = Y(c.wallTop);
  ctx.fillStyle = stone; ctx.fillRect(-24, wt, W + 48, H - wt + 24);
  const mw = W * 0.03;
  for (let x = -mw / 2; x < W + mw; x += mw * 2) ctx.fillRect(x, wt - H * .016, mw, H * .016);

  c.towers.forEach((t, i) => {
    const x = X(t.x), w = W * t.w, top = Y(t.top), rh = H * t.roof;
    // 塔の胴
    ctx.fillStyle = stone; ctx.fillRect(x, top, w, H - top + 24);
    ctx.fillRect(x - w * .1, top, w * 1.2, H * .014);                 // 屋根の下の張り出し
    // とんがり屋根 (片側にだけ月明かりのハイライト)
    ctx.fillStyle = roofC;
    ctx.beginPath(); ctx.moveTo(x - w * .14, top); ctx.lineTo(x + w / 2, top - rh); ctx.lineTo(x + w * 1.14, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofHi;
    ctx.beginPath(); ctx.moveTo(x + w / 2, top - rh); ctx.lineTo(x + w * 1.14, top); ctx.lineTo(x + w * .62, top); ctx.closePath(); ctx.fill();
    // 旗 (はためく)
    const fx = x + w / 2, fy = top - rh, pole = H * .036, fl = H * (t.keep ? .04 : .03);
    ctx.strokeStyle = stone; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - pole); ctx.stroke();
    const wv = Math.sin(now * 4 + i * 1.3) * H * .005, wv2 = Math.sin(now * 4 + i * 1.3 + 1.2) * H * .004;
    ctx.fillStyle = t.keep ? '#E0B84A' : (i % 2 ? '#3F7FC4' : '#C8464A');
    ctx.beginPath();
    ctx.moveTo(fx, fy - pole);
    ctx.quadraticCurveTo(fx + fl * .5, fy - pole + wv, fx + fl, fy - pole + H * .007 + wv2);
    ctx.quadraticCurveTo(fx + fl * .5, fy - pole + H * .012 + wv, fx, fy - pole + H * .015);
    ctx.closePath(); ctx.fill();
    // 明かりのともるアーチ窓
    const ww = Math.max(4, w * .24), wh = H * .026;
    const n = t.keep ? 3 : 2, cols = t.keep ? 2 : 1;
    for (let cI = 0; cI < cols; cI++) {
      const wx = cols === 1 ? x + w / 2 - ww / 2 : x + w * (cI ? 0.64 : 0.36) - ww / 2;
      for (let k = 0; k < n; k++) {
        const wy = top + H * .032 + k * H * .048;
        if (wy > wt + H * .05) continue;
        const flick = .55 + .22 * Math.sin(now * 2.6 + i * 2.1 + k * 1.7 + cI);
        ctx.fillStyle = 'rgba(255,208,130,' + flick + ')';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + ww / 2);
        ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
        ctx.lineTo(wx + ww, wy + wh); ctx.closePath(); ctx.fill();
      }
    }
  });
  // 城壁ぞいの小窓
  for (let k = 0; k < 7; k++) {
    const wx = W * (0.14 + k * 0.12), wy = wt + H * .03;
    ctx.fillStyle = 'rgba(255,208,130,' + (.28 + .12 * Math.sin(now * 2 + k)) + ')';
    ctx.beginPath(); ctx.arc(wx, wy, W * .008, Math.PI, 0); ctx.lineTo(wx + W * .008, wy + H * .012); ctx.lineTo(wx - W * .008, wy + H * .012); ctx.closePath(); ctx.fill();
  }
}

function drawFoe(f) {
  const px = X(f.x), r = H * C.ER;
  const py = Y(f.y) + Math.sin(f.ph * 2.2) * r * .12;
  ctx.save();
  if (f.t !== 'f') {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(px, Y(f.y) + r * 1.05, r * .85, r * .2, 0, 0, 7); ctx.fill();
  }
  if (f.t === 'f') {
    const w = r * (1.25 + Math.sin(f.ph * 14) * .28);
    ctx.fillStyle = 'rgba(255,240,214,.5)';
    ctx.beginPath(); ctx.ellipse(px - r * .9, py - r * .1, w * .5, r * .25, -.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + r * .9, py - r * .1, w * .5, r * .25, .4, 0, 7); ctx.fill();
  }
  const body = f.flashT > 0 ? '#FFC9B0' : '#FFF0D6';
  if (f.t !== 'a') {
    ctx.fillStyle = '#FFD98A';
    ctx.beginPath(); ctx.moveTo(px - r * .42, py - r * .72); ctx.lineTo(px - r * .20, py - r * 1.28); ctx.lineTo(px - r * .05, py - r * .78); ctx.fill();
  }
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(px, py, r, Math.PI, Math.PI * 2);
  ctx.lineTo(px + r, py + r * .75); ctx.lineTo(px - r, py + r * .75); ctx.closePath(); ctx.fill();
  if (f.t === 'a') {
    ctx.fillStyle = '#8FA6C8';
    ctx.beginPath(); ctx.arc(px, py - r * .12, r * 1.02, Math.PI * 1.06, Math.PI * 1.94); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#C7D6EE';
    ctx.beginPath(); ctx.moveTo(px - r * .16, py - r * 1.05); ctx.lineTo(px + r * .16, py - r * 1.05);
    ctx.lineTo(px + r * .05, py - r * 1.6); ctx.lineTo(px - r * .05, py - r * 1.6); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#2A1440';
  const blink = (Math.sin(f.ph * 1.3) > .97) ? .12 : 1;
  ctx.beginPath(); ctx.ellipse(px - r * .32, py - r * .06, r * .15, r * .2 * blink, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(px + r * .32, py - r * .06, r * .15, r * .2 * blink, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,90,.42)';
  ctx.beginPath(); ctx.arc(px - r * .58, py + r * .26, r * .16, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(px + r * .58, py + r * .26, r * .16, 0, 7); ctx.fill();
  if (f.t === 'sh') {
    const tt = f.ph % C.SHIELD_P, open = tt < C.SHIELD_OPEN, warn = !open && tt > C.SHIELD_P - C.SHIELD_WARN;
    if (!open) {
      const a2 = warn ? (Math.sin(performance.now() / 45) > 0 ? .9 : .18) : .55 + .2 * Math.sin(f.ph * 3);
      ctx.globalAlpha = a2;
      ctx.strokeStyle = '#7FE8FF'; ctx.lineWidth = H * .007;
      ctx.beginPath(); ctx.arc(px, py - r * .1, r * 1.38, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(127,232,255,.14)';
      ctx.beginPath(); ctx.arc(px, py - r * .1, r * 1.38, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawGun() {
  const bx = X(C.GUN.x), by = Y(C.GUN.y);
  const a = aiming ? aimVec().ang : (scene === 'title' ? demoAng : -Math.PI / 4);
  ctx.save();
  ctx.fillStyle = pal.land;
  ctx.beginPath(); ctx.moveTo(bx - H * .036, by + 2); ctx.lineTo(bx + H * .036, by + 2);
  ctx.lineTo(bx + H * .024, by - H * .028); ctx.lineTo(bx - H * .024, by - H * .028); ctx.closePath(); ctx.fill();
  ctx.translate(bx, by - H * .030);
  const ang = Math.max(-Math.PI * .97, Math.min(-.02, a));
  ctx.rotate(ang); ctx.translate(-gunRecoil * H * .02, 0);
  ctx.fillStyle = '#33193F'; ctx.strokeStyle = pal.edge; ctx.lineWidth = 1.6;
  const wA = C.AMMO[sel] || {};
  const bw = H * .075 * (wA.barrelLen || 1), bh = H * .021 * (wA.barrelWidth || 1), rx = -bh * .4, ry = -bh / 2, rr = bh * .4;
  ctx.beginPath();
  ctx.moveTo(rx + rr, ry); ctx.lineTo(rx + bw - rr, ry); ctx.quadraticCurveTo(rx + bw, ry, rx + bw, ry + rr);
  ctx.lineTo(rx + bw, ry + bh - rr); ctx.quadraticCurveTo(rx + bw, ry + bh, rx + bw - rr, ry + bh);
  ctx.lineTo(rx + rr, ry + bh); ctx.quadraticCurveTo(rx, ry + bh, rx, ry + bh - rr);
  ctx.lineTo(rx, ry + rr); ctx.quadraticCurveTo(rx, ry, rx + rr, ry); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.AMMO[sel].c; ctx.beginPath(); ctx.arc(bw - bh * .3, 0, bh * .24, 0, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2A1440'; ctx.beginPath(); ctx.arc(bx, by - H * .030, H * .017, 0, 7); ctx.fill();
  ctx.strokeStyle = pal.edge; ctx.lineWidth = 1.6; ctx.stroke();
}

function drawAim() {
  const a = aimVec(), m = muzzle();
  // ライフルの点は細かく並ぶので、小さめに描く (ふつうの弾の 6 割)
  const size = H * .005 * (sel === 'r' ? .6 : 1);
  C.aimDots(terrain, sel, a, view, { wind, portals }).forEach((d) => {
    ctx.fillStyle = 'rgba(255,240,214,' + (.16 + d.k * .5) + ')';
    ctx.beginPath(); ctx.arc(d.x, d.y, size * (.5 + d.k * .7), 0, 7); ctx.fill();
  });
  ctx.strokeStyle = 'rgba(255,196,107,.9)'; ctx.lineWidth = H * .009; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x + a.ux * H * .1 * a.power, m.y + a.uy * H * .1 * a.power); ctx.stroke();
}

/* ========== ループ ========== */
let last = performance.now();
function loop(now) {
  let dt = C.frameDt(now, last); last = now;
  if (hitstop > 0) { hitstop -= dt; dt *= .12; }
  step(dt); draw();
  requestAnimationFrame(loop);
}

/* ========== 入力 ========== */
cv.addEventListener('pointerdown', (ev) => {
  if (scene !== 'play') return;
  const splitTarget = bullets.find((b) => b.split);
  if (splitTarget) { splitBullet(splitTarget); return; }
  const maxAir = (C.AMMO[sel] || {}).maxAir || 1;
  if (bullets.length >= maxAir || !ammo[sel]) return;
  aiming = true; aimX = ev.clientX; aimY = ev.clientY;
  cv.setPointerCapture(ev.pointerId);
});
cv.addEventListener('pointermove', (ev) => { if (aiming) { aimX = ev.clientX; aimY = ev.clientY; } });
cv.addEventListener('pointerup', () => { if (aiming) { aiming = false; fire(); $('hint').style.opacity = '0'; } });
cv.addEventListener('pointercancel', () => { aiming = false; });

/* ========== UI ========== */
function $(id) { return document.getElementById(id); }
const leftTxt = $('leftTxt');
const show = (id, on) => $(id).classList.toggle('hide', !on);

function drawBelt() {
  const b = $('belt'); b.innerHTML = '';
  kindsInLevel.forEach((k) => {
    const el = document.createElement('button');
    el.className = 'slot' + (sel === k ? ' on' : '') + (ammo[k] ? '' : ' empty');
    el.dataset.kind = k;
    el.innerHTML = '<span class="dot" style="background:' + C.AMMO[k].c + ';box-shadow:0 0 12px ' + C.AMMO[k].glow + '"></span>'
      + '<span class="nm">' + C.AMMO[k].nm + '</span><span class="ct">' + ammo[k] + '</span>';
    el.onclick = () => { if (ammo[k]) { sel = k; drawBelt(); } };
    b.appendChild(el);
  });
}
function toTitle() {
  scene = 'title'; show('pTitle', 1); show('pSelect', 0); show('pResult', 0);
  show('hud', 0); show('belt', 0); show('hint', 0); loadTitle();
}
function toSelect() {
  scene = 'select'; show('pTitle', 0); show('pResult', 0); show('hud', 0); show('belt', 0); show('hint', 0); show('pSelect', 1);
  const s = $('scroll'); s.innerHTML = '';
  for (let c = 0; c < C.SKIES.length; c++) {
    const h = document.createElement('div'); h.className = 'chap'; h.textContent = C.SKIES[c].name; s.appendChild(h);
    const g = document.createElement('div'); g.className = 'grid';
    for (let i = c * C.PER_CHAPTER; i < (c + 1) * C.PER_CHAPTER; i++) {
      const open = C.isOpen(save, i);
      const st = save[i] || 0;
      const b = document.createElement('button');
      b.className = 'cell' + (open ? '' : ' locked') + (st ? ' done' : '');
      b.dataset.level = i;
      b.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="s">' + (st ? '★'.repeat(st) + '☆'.repeat(3 - st) : (open ? '' : '🔒')) + '</span>';
      if (open) b.onclick = () => play(i);
      g.appendChild(b);
    }
    s.appendChild(g);
  }
}
const HINTS = { 0: '画面をおして、はなすと撃つ', 1: 'ライフルは連射できて、遠くまでとどく',
  4: 'はねる弾は かべで2回はねる', 8: 'さくれつ弾は とんでいる間にタップでわれる',
  6: 'かぶとの敵は 直撃でないと たおせない', 12: 'とぶ敵は 上下にうごく', 13: 'あるく敵は 足場を いったりきたり',
  24: 'バリアの敵は 光がまたたいた すきに当てる',
  30: 'かぜが 弾をおし流す。点線もかぜを うけている', 36: 'ゲートに入った弾は、もうひとつのゲートから出てくる' };
function play(i) {
  loadLevel(i); scene = 'play';
  show('pTitle', 0); show('pSelect', 0); show('pResult', 0); show('hud', 1); show('belt', 1);
  if (HINTS[i]) { $('hint').textContent = HINTS[i]; show('hint', 1); $('hint').style.opacity = ''; }
  else show('hint', 0);
}
function finish(win) {
  scene = 'done';
  const rest = C.coreLeft(ammo), stars = C.starsFor(win, ammo);
  lastResult = { win, stars, level: lv };
  if (win) { if (C.recordStars(save, lv, stars)) store('yamanari', JSON.stringify(save)); sClear(); } else sFail();
  $('rTitle').textContent = win ? 'たおした！' : 'たまぎれ';
  $('rStars').textContent = win ? ('★'.repeat(stars) + '☆'.repeat(3 - stars)) : '';
  $('rText').textContent = win
    ? (rest > 0 ? ('たまが ' + rest + ' こ のこった') : 'ぎりぎり、さいごの一発')
    : ('のこり ' + foes.filter((f) => !f.dead).length + 'たい。もうすこし高く撃ってみる');
  $('btnNext').style.display = (win && lv < C.LEVELS.length - 1) ? '' : 'none';
  show('pResult', 1); show('hud', 0); show('belt', 0); show('hint', 0);
}

$('btnStart').onclick = () => { ac(); toSelect(); };
$('btnTitle').onclick = toTitle;
$('btnHome').onclick = toSelect;
$('btnRetry').onclick = () => play(lv);
$('btnR2').onclick = () => play(lv);
$('btnR3').onclick = toSelect;
$('btnNext').onclick = () => play(Math.min(C.LEVELS.length - 1, lv + 1));
$('btnSnd').onclick = () => {
  soundOn = !soundOn; store('yamanari_snd', soundOn ? '1' : '0');
  $('btnSnd').style.opacity = soundOn ? '1' : '.4';
};
$('btnSnd').style.opacity = soundOn ? '1' : '.4';
$('ver').textContent = 'v' + VERSION + ' / 描ける' + Math.round(cv.clientHeight) + ' / 窓' + innerHeight;

resize(); loadTitle(); scene = 'title';
requestAnimationFrame(loop);

// 自動テストから中身をのぞくための入口
window.__app = {
  VERSION,
  view,
  state: () => ({ scene, lv, sel, ammo: Object.assign({}, ammo), bullets: bullets.length,
    foes: foes.map((f) => ({ x: f.x, y: f.y, t: f.t, dead: f.dead, ph: f.ph })), lastResult, save: Object.assign({}, save) }),
  play,
  muzzle,
  aimDots: (x, y) => C.aimDots(terrain, sel, C.aimVec(x, y, view), view, { wind, portals }),
  env: () => ({ wind, portals }),
  demoShots: () => demoShots,
  canvasFont: () => textFont
};
})();
